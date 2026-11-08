import 'dotenv/config';
import { expect, test, type APIRequestContext, type Browser, type BrowserContext } from '@playwright/test';
import { Client } from 'pg';

const CLAVE_QA = process.env.CLAVE_PRUEBA_QA ?? '';
if (!CLAVE_QA) throw new Error('Falta CLAVE_PRUEBA_QA: ejecuta CLAVE_PRUEBA_QA=... node scripts/crear-usuarios-prueba.mjs antes de este spec.');

// Pruebas de seguridad sobre la API real (puerto 3100):
// inyección SQL, XSS, IDOR, CSRF, mass assignment, path traversal,
// privilege escalation, enumeración, DoS por cuerpo y fugas de información.

const QA = {
  super: { email: 'test-super@gmail.com', clave: CLAVE_QA },
  admin: { email: 'test-admin@gmail.com', clave: CLAVE_QA },
  user: { email: 'test-user@gmail.com', clave: CLAVE_QA },
} as const;

const INYECCIONES = [
  "' OR '1'='1",
  "'; DROP TABLE \"Solicitud\"; --",
  "1; DELETE FROM \"Usuario\" WHERE 1=1; --",
  "' UNION SELECT email, \"passwordHash\" FROM \"Usuario\" --",
  "1' AND (SELECT COUNT(*) FROM \"Usuario\")>0 --",
  "%27%3B%20DROP%20TABLE%20%22Cancha%22%3B--",
  "\\'; TRUNCATE \"Sede\"; --",
];

async function sesion(
  browser: Browser,
  cred: { email: string; clave: string },
): Promise<{ context: BrowserContext; api: APIRequestContext }> {
  const context = await browser.newContext({ extraHTTPHeaders: { origin: 'http://127.0.0.1:3100' } });
  const login = await context.request.post('/api/auth/login', { data: cred });
  expect(login.ok()).toBe(true);
  const valor = /access_token=([^;]+)/.exec(login.headers()['set-cookie'] ?? '')?.[1] ?? '';
  await context.addCookies([{ name: 'access_token', value: valor, domain: '127.0.0.1', path: '/' }]);
  return { context, api: context.request };
}

async function conteoBd(tabla: 'Solicitud' | 'Cancha' | 'Sede' | 'Usuario'): Promise<number> {
  const cliente = new Client({ connectionString: process.env.DIRECT_URL });
  await cliente.connect();
  try {
    const r = await cliente.query(`SELECT count(*)::int AS n FROM "${tabla}"`);
    return r.rows[0].n as number;
  } finally {
    await cliente.end();
  }
}

test.describe.serial('QA seguridad', () => {
  let userCtx: BrowserContext;
  let adminCtx: BrowserContext;
  let superCtx: BrowserContext;
  let userApi: APIRequestContext;
  let adminApi: APIRequestContext;
  let superApi: APIRequestContext;
  let sedeId = 0;
  let canchaId = 0;
  const sedesXss: number[] = [];

  test.beforeAll(async ({ browser }) => {
    ({ context: userCtx, api: userApi } = await sesion(browser, QA.user));
    ({ context: adminCtx, api: adminApi } = await sesion(browser, QA.admin));
    ({ context: superCtx, api: superApi } = await sesion(browser, QA.super));
    const sedes = (await (await adminApi.get('/api/sedes?incluirPruebas=1')).json()) as {
      sedes: Array<{ id: number; nombre: string }>;
    };
    sedeId = sedes.sedes.find((s) => s.nombre === 'E2E_QA')?.id as number;
    const canchas = (await (await adminApi.get(`/api/canchas?sedeId=${sedeId}`)).json()) as {
      canchas: Array<{ id: number; nombre: string }>;
    };
    canchaId = canchas.canchas[0].id as number;
  });

  test.afterAll(async () => {
    // Las sedes creadas por la prueba de XSS se borran siempre, exista o no fallo.
    for (const id of sedesXss) {
      await superApi.delete(`/api/sedes/${id}`).catch(() => null);
    }
    const cliente = new Client({ connectionString: process.env.DIRECT_URL });
    await cliente.connect();
    try {
      if (sedesXss.length > 0) {
        // Borrado físico: son filas de prueba, no datos de negocio.
        await cliente.query(`DELETE FROM "RegistroCambio" WHERE "sedeId" = ANY($1)`, [sedesXss]);
        await cliente.query(`DELETE FROM "Sede" WHERE id = ANY($1)`, [sedesXss]);
      }
    } finally {
      await cliente.end();
    }
    await userCtx?.close();
    await adminCtx?.close();
    await superCtx?.close();
  });

  test('SQL injection en filtros de /api/sedes y /api/canchas: nada se ejecuta', async () => {
    const antes = { sedes: await conteoBd('Sede'), canchas: await conteoBd('Cancha') };
    for (const carga of INYECCIONES) {
      const sedes = await userApi.get(`/api/sedes?nombre=${encodeURIComponent(carga)}`);
      expect([200, 400]).toContain(sedes.status());
      const canchas = await userApi.get(`/api/canchas?sedeId=${encodeURIComponent(carga)}`);
      expect([200, 400]).toContain(canchas.status());
      const nada = await userApi.get(`/api/canchas?sedeId=${sedeId}&nombre=${encodeURIComponent(carga)}`);
      expect([200, 400]).toContain(nada.status());
    }
    expect(await conteoBd('Sede')).toBe(antes.sedes);
    expect(await conteoBd('Cancha')).toBe(antes.canchas);
  });

  test('SQL injection en login, registro y cuerpo de reserva: la BD intacta', async () => {
    const usuariosAntes = await conteoBd('Usuario');
    for (const carga of INYECCIONES) {
      const login = await userApi.post('/api/auth/login', { data: { email: carga, clave: 'x' } });
      expect(login.status()).toBe(401);
      const registro = await userApi.post('/api/auth/register', {
        data: { email: `${carga}@x.com`, clave: 'Prueba_99', nombre: carga },
      });
      // El registro es público: un correo con formato válido puede crearse,
      // pero nunca ejecuta SQL ni guarda metacaracteres como nombre.
      expect([200, 400, 409, 422]).toContain(registro.status());
      const reserva = await userApi.post('/api/solicitudes', {
        data: { canchaId: carga, fecha: carga, horaInicio: carga },
      });
      expect([400]).toContain(reserva.status());
    }
    // Sin metacaracteres crudos en correo/nombre, y ninguna sentencia ejecutada.
    const cliente = new Client({ connectionString: process.env.DIRECT_URL });
    await cliente.connect();
    try {
      const sucios = await cliente.query(
        `SELECT email, nombre FROM "Usuario"
         WHERE email ~ '[;<>"\\x27]' OR nombre ~ '[\\x00-\\x1F]' OR nombre ~ '[<>]'`,
      );
      expect(sucios.rows).toEqual([]);
      // Las tablas clave siguen existiendo (nadie ejecutó un DROP/TRUNCATE).
      const tablas = await cliente.query(
        `SELECT count(*)::int AS n FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name IN ('Solicitud','Cancha','Sede','Usuario','Tarifa')`,
      );
      expect(tablas.rows[0].n).toBe(5);
      // Las cuentas sonda (que el registro público acepta por ser texto válido)
      // se eliminan aquí: no deben quedar residues de la prueba.
      const sondas = await cliente.query(`SELECT id FROM "Usuario" WHERE email LIKE '%@x.com'`);
      for (const u of sondas.rows) {
        await cliente.query(`DELETE FROM "Notificacion" WHERE "usuarioId" = $1`, [u.id]);
        await cliente.query(`DELETE FROM "PasswordResetToken" WHERE "usuarioId" = $1`, [u.id]);
        await cliente.query(`DELETE FROM "OperacionPendiente" WHERE "usuarioId" = $1`, [u.id]);
        await cliente.query(`DELETE FROM "RegistroCambio" WHERE "usuarioId" = $1`, [u.id]);
        await cliente.query(`DELETE FROM "Usuario" WHERE id = $1`, [u.id]);
      }
      const restantes = await cliente.query(`SELECT count(*)::int AS n FROM "Usuario" WHERE email LIKE '%@x.com'`);
      expect(restantes.rows[0].n).toBe(0);
    } finally {
      await cliente.end();
    }
    expect(await conteoBd('Usuario')).toBeGreaterThanOrEqual(usuariosAntes);
  });

  test('la respuesta de login nunca filtra hashes ni otros usuarios', async () => {
    const fallo = await userApi.post('/api/auth/login', {
      data: { email: 'test-super@gmail.com', clave: 'incorrecta' },
    });
    expect(fallo.status()).toBe(401);
    const texto = await fallo.text();
    expect(texto).not.toMatch(/\$2[aby]\$/);
    expect(texto.toLowerCase()).not.toMatch(/password|hash|contraseña/);
    // Mensaje genérico: no revela si el correo existe.
    expect(texto.toLowerCase()).not.toContain('no existe');
    // Un superadmin real tampoco ve el hash de otro usuario.
    const me = await superApi.get('/api/auth/me');
    const cuerpo = await me.text();
    expect(cuerpo).not.toMatch(/\$2[aby]\$/);
  });

  test('IDOR: un usuario no confirma, rechaza ni marca no-show de otros', async () => {
    const creada = await adminApi.post('/api/bloqueos', {
      data: { canchaId, fecha: '2027-03-10', horaInicio: '14:00', horaFin: '15:00', motivo: 'IDOR QA' },
    });
    expect(creada.status()).toBe(201);
    const bloqueoId = ((await creada.json()) as { id: number }).id;
    expect((await userApi.get(`/api/bloqueos/${bloqueoId}/afectadas`)).status()).toBe(403);
    for (const ruta of ['reasignar', 'reembolsar']) {
      const r = await userApi.post(`/api/bloqueos/${bloqueoId}/${ruta}`, { data: {} });
      expect([401, 403]).toContain(r.status());
    }
    // Confirmar/rechazar/no-show exigen rol de gestión.
    for (const accion of ['confirmar', 'rechazar', 'no-show']) {
      const r = await userApi.post(`/api/solicitudes/999999/${accion}`, { data: { motivo: 'x' } });
      expect([403]).toContain(r.status());
    }
  });

  test('IDOR: el comprobante de pago solo lo adjunta el dueño', async () => {
    // Una reserva de OTRO usuario (las sembradas), no la del propio.
    const yo = (await (await userApi.get('/api/auth/me')).json()) as { id: number };
    const cliente = new Client({ connectionString: process.env.DIRECT_URL });
    await cliente.connect();
    let ajenaId = -1;
    try {
      const ajena = await cliente.query(
        `SELECT id FROM "Solicitud" WHERE "usuarioId" <> $1 AND "eliminadoEn" IS NULL ORDER BY id LIMIT 1`,
        [yo.id],
      );
      ajenaId = (ajena.rows[0]?.id as number) ?? -1;
    } finally {
      await cliente.end();
    }
    if (ajenaId === -1) test.skip(true, 'sin reservas de otros usuarios');
    const ajena = { id: ajenaId };
    // Slot único por corrida para no chocar con ejecuciones anteriores.
    const dia = 200 + Math.floor(Math.random() * 300);
    const fechaPropia = new Date(Date.now() + dia * 86_400_000).toISOString().slice(0, 10);
    const propio = await userApi.post('/api/solicitudes', {
      data: { canchaId, fecha: fechaPropia, horaInicio: '16:00' },
    });
    expect(propio.status()).toBe(201);
    const propioId = ((await propio.json()) as { id: number }).id;
    const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    // Reserva ajena: 404 antes de tocar el almacenamiento (no revela que existe).
    const otro = await userApi.post(`/api/solicitudes/${ajenaId}/comprobante`, {
      data: { bytesBase64: PNG, nombreArchivo: 'pago.png', contentType: 'image/png' },
    });
    expect([403, 404]).toContain(otro.status());

    // En local no hay Supabase configurado, así que el propio puede dar 5xx;
    // lo relevante es que la autorización se decide antes del almacenamiento.
    const mio = await userApi.post(`/api/solicitudes/${propioId}/comprobante`, {
      data: { bytesBase64: PNG, nombreArchivo: 'pago.png', contentType: 'image/png' },
    });
    expect([201, 409, 500, 503]).toContain(mio.status());

    const cliente2 = new Client({ connectionString: process.env.DIRECT_URL });
    await cliente2.connect();
    try {
      const ajenaComprobante = await cliente2.query(
        `SELECT count(*)::int AS n FROM "Comprobante" WHERE "solicitudId" = $1`,
        [ajenaId],
      );
      expect(ajenaComprobante.rows[0].n).toBe(0);
    } finally {
      await cliente2.end();
    }
  });

  test('escalada de privilegios: el USUARIO no se autoproclama ADMIN ni cambia su sede', async () => {
    const antes = await (await userApi.get('/api/auth/me')).json();
    for (const carga of [
      { nombre: 'QA Usuario', rol: 'ADMIN' },
      { nombre: 'QA Usuario', rol: 'SUPERADMIN', sedeId },
      { nombre: 'Hacker', rol: 'SUPERADMIN', sedeId, telefono: '1' },
      { nombre: 'QA\nUsuario con salto', rol: 'ADMIN' },
      { nombre: '<script>alert(1)</script>', rol: 'ADMIN' },
    ]) {
      const r = await userApi.put('/api/cuenta/perfil', { data: carga });
      // 200 si el nombre es válido; 400 si trae controles o angle brackets.
      expect([200, 400]).toContain(r.status());
    }
    const despues = (await (await userApi.get('/api/auth/me')).json()) as { rol: string; sedeId: number | null };
    expect(despues.rol).toBe('USUARIO');
    expect(despues.sedeId).toBeNull();
    expect((antes as { rol: string }).rol).toBe('USUARIO');
  });

  test('el ADMIN no sale de su sede ni elimina recursos', async () => {
    const ajena = (await (await superApi.get('/api/sedes?incluirPruebas=1')).json()) as {
      sedes: Array<{ id: number; nombre: string }>;
    };
    const otra = ajena.sedes.find((s) => s.id !== sedeId)?.id as number;
    expect((await adminApi.get(`/api/tarifas?sedeId=${otra}`)).status()).toBe(403);
    expect((await adminApi.post('/api/sedes', { data: { nombre: 'Hack', apertura: '08:00', cierre: '22:00' } })).status()).toBe(403);
    expect((await adminApi.post('/api/usuarios', { data: { email: 'h@h.com', clave: 'Hack_1234', nombre: 'H', sedeId } })).status()).toBe(403);
    const canchas = (await (await superApi.get(`/api/canchas?sedeId=${otra}`)).json()) as {
      canchas: Array<{ id: number }>;
    };
    if (canchas.canchas.length > 0) {
      expect((await adminApi.put(`/api/canchas/${canchas.canchas[0].id}`, { data: { nombre: 'X', tarifaBaseCentavos: 1 } })).status()).toBe(403);
      expect((await adminApi.delete(`/api/canchas/${canchas.canchas[0].id}`)).status()).toBe(403);
    }
  });

  test('CSRF: mutación con origin ajeno o sec-fetch-site cross-site se rechaza (403)', async () => {
    const ajeno = await superCtx.request.post('/api/sedes', {
      headers: { origin: 'https://atacante.example' },
      data: { nombre: 'Atacante', apertura: '08:00', cierre: '22:00' },
    });
    expect(ajeno.status()).toBe(403);
    const cruz = await superCtx.request.post('/api/sedes', {
      headers: { 'sec-fetch-site': 'cross-site' },
      data: { nombre: 'Atacante 2', apertura: '08:00', cierre: '22:00' },
    });
    expect(cruz.status()).toBe(403);
    // Y no se creó ninguna sede "Atacante".
    const sedes = (await (await superApi.get('/api/sedes?incluirPruebas=1')).json()) as {
      sedes: Array<{ nombre: string }>;
    };
    expect(sedes.sedes.some((s) => /^Atacante/.test(s.nombre))).toBe(false);
  });

  test('XSS: el nombre con script se guarda literal y se escapa al mostrar', async () => {
    const nombre = `<script>alert('xss')</script>`;
    const creada = await superApi.post('/api/sedes', {
      data: { nombre: `${nombre} QA ${Date.now()}`, esPrueba: true, apertura: '08:00', cierre: '22:00' },
    });
    expect(creada.status()).toBe(201);
    const sedeIdX = ((await creada.json()) as { id: number }).id;
    // Se limpia en afterAll: si una aserción falla, la sede no queda en la BD.
    sedesXss.push(sedeIdX);
    expect(((await creada.json()) as { nombre: string }).nombre).toContain('<script>');
    // El script no debe ejecutarse en ninguna vista.
    const paginaUser = await userCtx.newPage();
    let alertado = false;
    paginaUser.on('dialog', async (d) => {
      alertado = true;
      await d.dismiss();
    });
    await paginaUser.goto('/reservar');
    await expect(paginaUser.getByLabel('Sede')).toBeVisible();
    expect(alertado).toBe(false);
    await paginaUser.close();

    // En el panel del superadmin se muestra como texto literal, no como HTML.
    const pagina = await superCtx.newPage();
    await pagina.goto('/sedes');
    const texto = await pagina.locator('body').innerText();
    expect(texto).toContain('<script>');
    expect(await pagina.locator('script', { hasText: 'alert' }).count()).toBe(0);
    await pagina.close();
  });

  test('path traversal y contenido falso: el comprobante valida extensión, tipo y bytes', async () => {
    const creada = await userApi.post('/api/solicitudes', {
      data: { canchaId, fecha: '2027-03-15', horaInicio: '17:00' },
    });
    const id = ((await creada.json()) as { id: number }).id;
    const casos = [
      { nombreArchivo: '../../../etc/passwd.png', contentType: 'image/png', bytes: 'AAAA' },
      { nombreArchivo: 'pago.php', contentType: 'image/png', bytes: 'AAAA' },
      { nombreArchivo: 'pago.png', contentType: 'application/x-msdownload', bytes: 'AAAA' },
      { nombreArchivo: 'pago.png', contentType: 'image/png', bytes: 'TVqQAAMAAAAEAAAA' },
    ];
    for (const caso of casos) {
      const r = await userApi.post(`/api/solicitudes/${id}/comprobante`, { data: caso });
      expect([400]).toContain(r.status());
    }
    // Firma de comprobante: el cliente NO elige la ruta. Una ruta manipulada se
    // ignora (500 aquí porque no hay Supabase en local: fail-closed) y una
    // extensión peligrosa se rechaza antes de tocar nada.
    const firma = await adminApi.post('/api/comprobantes/firmar', {
      data: { proposito: 'pago', ruta: '../../public/x.png', extension: 'png' },
    });
    expect([200, 500, 503]).toContain(firma.status());
    if (firma.ok()) {
      const cuerpo = (await firma.json()) as { ruta: string };
      expect(cuerpo.ruta).toMatch(/^comprobantes\/pago\/[0-9a-f-]{36}\.png$/);
      expect(cuerpo.ruta).not.toContain('..');
    }
    const malaExtension = await adminApi.post('/api/comprobantes/firmar', {
      data: { proposito: 'pago', extension: '../../etc/passwd' },
    });
    expect(malaExtension.status()).toBe(400);
    expect(await malaExtension.text()).toMatch(/no es válida/i);
    const sinExtension = await adminApi.post('/api/comprobantes/firmar', { data: { proposito: 'pago' } });
    expect(sinExtension.status()).toBe(400);
    // USUARIO no firma reembolsos.
    const reembolso = await userApi.post('/api/comprobantes/firmar', {
      data: { proposito: 'reembolso', extension: 'png' },
    });
    expect(reembolso.status()).toBe(403);
  });

  test('DoS: cuerpo enorme, JSON inválido y parámetros fuera de rango', async () => {
    const enorme = await userApi.post('/api/solicitudes', {
      headers: { 'content-type': 'application/json' },
      data: JSON.stringify({ canchaId, relleno: 'x'.repeat(3_000_000) }),
    });
    expect([400, 413]).toContain(enorme.status());
    const invalido = await userApi.post('/api/solicitudes', {
      headers: { 'content-type': 'application/json' },
      data: '{no es json',
    });
    expect([400]).toContain(invalido.status());
    const limite = await userApi.get('/api/solicitudes?limite=999999');
    expect(limite.status()).toBe(400);
    const limiteCero = await userApi.get('/api/solicitudes?limite=0');
    expect(limiteCero.status()).toBe(400);
    const mesMalo = await adminApi.get('/api/reportes?tipo=ingresos&mes=2026-99');
    expect(mesMalo.status()).toBe(400);
    const tipoMalo = await adminApi.get('/api/reportes?tipo=<script>&mes=2026-08');
    expect(tipoMalo.status()).toBe(400);
  });

  test('enumeración: el login y el registro no distinguen usuario inexistente', async () => {
    const inexistente = await userApi.post('/api/auth/login', {
      data: { email: 'nadie_este_correo@gmail.com', clave: 'Prueba_123' },
    });
    const existente = await userApi.post('/api/auth/login', {
      data: { email: QA.user.email, clave: 'claveIncorrecta1' },
    });
    expect(inexistente.status()).toBe(existente.status());
    expect(await inexistente.text()).toBe(await existente.text());
  });

  test('cookie de sesión: no falsificable y expirada da 401', async () => {
    const falso = await userCtx.request.get('/api/auth/me', {
      headers: { cookie: 'access_token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwicm9sIjoiU1VQRVJBRE1JTiJ9.firma' },
    });
    expect(falso.status()).toBe(401);
    const vacia = await userCtx.request.get('/api/auth/me', { headers: { cookie: 'access_token=' } });
    expect(vacia.status()).toBe(401);
    // Sin cookie en ruta protegida.
    const crudo = await fetch('http://127.0.0.1:3100/api/solicitudes', {
      headers: { origin: 'http://127.0.0.1:3100' },
    });
    expect(crudo.status).toBe(401);
  });

  test('el mantenimiento es fail-closed y no accesible por rol ni con secreto inventado', async () => {
    const secreto = process.env.CRON_SECRET;
    // Sin CRON_SECRET configurado: 503 (nunca ejecuta nada).
    if (!secreto) {
      expect((await userApi.get('/api/mantenimiento')).status()).toBe(503);
      expect((await adminApi.get('/api/mantenimiento')).status()).toBe(503);
      return;
    }
    // Con secreto: exige el Bearer exacto; rol o token inventado no abren paso.
    expect((await userApi.get('/api/mantenimiento')).status()).toBe(401);
    expect((await adminApi.get('/api/mantenimiento')).status()).toBe(401);
    const conRol = await adminApi.get('/api/mantenimiento', {
      headers: { authorization: 'Bearer cualquier-cosa' },
    });
    expect(conRol.status()).toBe(401);
    const correcto = await adminApi.get('/api/mantenimiento', {
      headers: { authorization: `Bearer ${secreto}` },
    });
    expect(correcto.ok()).toBe(true);
    const cuerpo = (await correcto.json()) as { liberadas: number };
    expect(typeof cuerpo.liberadas).toBe('number');
  });
});
