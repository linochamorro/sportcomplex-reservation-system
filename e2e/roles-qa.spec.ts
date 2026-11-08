import 'dotenv/config';
import { expect, test, type APIRequestContext, type Browser, type BrowserContext } from '@playwright/test';
import { Client } from 'pg';
import { fechaEnLima } from '@/lib/ui/reloj-lima';

const CLAVE_QA = process.env.CLAVE_PRUEBA_QA ?? '';
if (!CLAVE_QA) throw new Error('Falta CLAVE_PRUEBA_QA: ejecuta CLAVE_PRUEBA_QA=... node scripts/crear-usuarios-prueba.mjs antes de este spec.');

// `turnos.ts` importa la sesión (Prisma ESM), así que el motivo se replica
// aquí; la fuente única es lib/domain/turnos.ts (cubierta por unitarios).
const MOTIVO_LIBERADA =
  'Se liberó la cancha por llegar al exceso de tiempo sin respuesta de la administración';

// Batería QA por rol sobre datos marcados (test-*@gmail.com + sede E2E_QA).
// Limpieza: afterAll borra las solicitudes QA y la sede temporal de este spec.
// Los usuarios QA y la sede E2E_QA persisten hasta scripts/limpiar-qa.mjs (Fase 6).

const QA = {
  super: { email: 'test-super@gmail.com', clave: CLAVE_QA },
  admin: { email: 'test-admin@gmail.com', clave: CLAVE_QA },
  user: { email: 'test-user@gmail.com', clave: CLAVE_QA },
} as const;

function fechaFutura(dias: number): string {
  return new Date(Date.now() + dias * 24 * 3_600_000).toISOString().slice(0, 10);
}

// Próxima fecha (desde +dias) que cae en día hábil Lun–Vie, para monto determinista.
function fechaHabil(dias: number): string {
  const base = new Date(Date.now() + dias * 24 * 3_600_000);
  while (base.getUTCDay() === 0 || base.getUTCDay() === 6) {
    base.setUTCDate(base.getUTCDate() + 1);
  }
  return base.toISOString().slice(0, 10);
}

async function contextoConSesion(
  browser: Browser,
  cred: { email: string; clave: string },
): Promise<{ context: BrowserContext; api: APIRequestContext }> {
  const context = await browser.newContext({
    extraHTTPHeaders: { origin: 'http://127.0.0.1:3100' },
  });
  const login = await context.request.post('/api/auth/login', { data: cred });
  expect(login.ok()).toBe(true);
  const valor = /access_token=([^;]+)/.exec(login.headers()['set-cookie'] ?? '')?.[1] ?? '';
  expect(valor.length).toBeGreaterThan(0);
  await context.addCookies([{ name: 'access_token', value: valor, domain: '127.0.0.1', path: '/' }]);
  return { context, api: context.request };
}

async function resolverQa(api: APIRequestContext): Promise<{ sedeId: number; cancha1: number; cancha2: number }> {
  const sedes = (await (await api.get('/api/sedes?incluirPruebas=1')).json()) as { sedes: Array<{ id: number; nombre: string }> };
  const sedeId = sedes.sedes.find((s) => s.nombre === 'E2E_QA')?.id;
  expect(sedeId).toBeDefined();
  const canchas = (await (await api.get(`/api/canchas?sedeId=${sedeId}`)).json()) as {
    canchas: Array<{ id: number; nombre: string }>;
  };
  const cancha1 = canchas.canchas.find((c) => c.nombre === 'QA-C01')?.id;
  const cancha2 = canchas.canchas.find((c) => c.nombre === 'QA-C02')?.id;
  expect(cancha1).toBeDefined();
  expect(cancha2).toBeDefined();
  return { sedeId: sedeId as number, cancha1: cancha1 as number, cancha2: cancha2 as number };
}

async function crearSolicitud(
  api: APIRequestContext,
  canchaId: number,
  fecha: string,
  horaInicio: string,
  esperado = 201,
) {
  const respuesta = await api.post('/api/solicitudes', { data: { canchaId, fecha, horaInicio } });
  expect(respuesta.status()).toBe(esperado);
  return (await respuesta.json()) as { id: number; estado: string; montoTotalCentavos: number };
}

test.describe.serial('QA por rol', () => {
  let superCtx: BrowserContext;
  let adminCtx: BrowserContext;
  let userCtx: BrowserContext;
  let superApi: APIRequestContext;
  let adminApi: APIRequestContext;
  let userApi: APIRequestContext;
  let sedeId = 0;
  let cancha1 = 0;
  let cancha2 = 0;
  let sedeTemporalId = 0;

  test.beforeAll(async ({ browser }) => {
    ({ context: superCtx, api: superApi } = await contextoConSesion(browser, QA.super));
    ({ context: adminCtx, api: adminApi } = await contextoConSesion(browser, QA.admin));
    ({ context: userCtx, api: userApi } = await contextoConSesion(browser, QA.user));
    ({ sedeId, cancha1, cancha2 } = await resolverQa(superApi));
  });

  test.afterAll(async () => {
    const cliente = new Client({ connectionString: process.env.DIRECT_URL });
    await cliente.connect();
    try {
      const qa = await cliente.query(
        `select id from "Usuario" where email in ('test-super@gmail.com', 'test-admin@gmail.com', 'test-user@gmail.com')`,
      );
      const ids = qa.rows.map((u) => u.id as number);
      if (ids.length > 0) {
        await cliente.query(
          `delete from "Comprobante" where "solicitudId" in (select id from "Solicitud" where "usuarioId" = any($1))`,
          [ids],
        );
        await cliente.query(`delete from "Solicitud" where "usuarioId" = any($1)`, [ids]);
        await cliente.query(`delete from "RegistroCambio" where "usuarioId" = any($1)`, [ids]);
      }
      // Sede temporal del spec (si quedó): sin solicitudes a este punto.
      const temp = await cliente.query(`select id from "Sede" where nombre = 'QA Sede Temporal'`);
      for (const s of temp.rows) {
        await cliente.query(`delete from "Tarifa" where "sedeId" = $1`, [s.id]);
        await cliente.query(`delete from "Cancha" where "sedeId" = $1`, [s.id]);
        await cliente.query(`delete from "Sede" where id = $1`, [s.id]);
      }
    } finally {
      await cliente.end();
    }
    await superCtx?.close();
    await adminCtx?.close();
    await userCtx?.close();
  });

  test('USUARIO crea reserva PENDIENTE con monto de tarifa día (S/50)', async () => {
    const fecha = fechaHabil(3);
    const creada = await crearSolicitud(userApi, cancha1, fecha, '10:00');
    expect(creada.estado).toBe('PENDIENTE');
    expect(creada.montoTotalCentavos).toBe(5000);
  });

  test('USUARIO sube comprobante de su reserva', async () => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_STORAGE_BUCKET) {
      test.skip(true, 'Sin almacenamiento Supabase configurado');
      return;
    }
    const propias = (await (await userApi.get('/api/solicitudes')).json()) as {
      solicitudes: Array<{ id: number; estado: string }>;
    };
    const pendiente = propias.solicitudes.find((s) => s.estado === 'PENDIENTE');
    expect(pendiente).toBeDefined();
    const respuesta = await userApi.post(`/api/solicitudes/${pendiente?.id}/comprobante`, {
      data: {
        bytesBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        nombreArchivo: 'comprobante.png',
        contentType: 'image/png',
      },
    });
    expect(respuesta.status()).toBe(201);
  });

  test('USUARIO no puede duplicar el mismo turno (409)', async () => {
    const fecha = fechaHabil(4);
    await crearSolicitud(userApi, cancha1, fecha, '11:00');
    await crearSolicitud(userApi, cancha1, fecha, '11:00', 409);
  });

  test('USUARIO no reserva fuera de horario (QA-01 corregido) ni en fecha pasada', async () => {
    const fecha = fechaHabil(5);
    // QA-01 corregido: el backend valida contra apertura/cierre → 400.
    const fuera = await userApi.post('/api/solicitudes', { data: { canchaId: cancha1, fecha, horaInicio: '07:00' } });
    expect(fuera.status()).toBe(400);
    const pasada = await userApi.post('/api/solicitudes', {
      data: { canchaId: cancha1, fecha: '2020-01-06', horaInicio: '10:00' },
    });
    expect([400, 409]).toContain(pasada.status());
  });

  test('ADMIN ve la vencida con 3 h y motivo de exceso de tiempo', async () => {
    const fecha = fechaFutura(16);
    const creada = await crearSolicitud(userApi, cancha1, fecha, '09:00');
    const cliente = new Client({ connectionString: process.env.DIRECT_URL });
    await cliente.connect();
    try {
      // Reproduce lo que hace `liberarVencidas` (cubierto por unitario): hold
      // vencido → LIBERADA con el motivo del registro de la empresa.
      await cliente.query(
        `update "Solicitud" set "limiteHold" = now() - interval '1 minute',
         estado = 'LIBERADA', motivo = $2 where id = $1`,
        [creada.id, MOTIVO_LIBERADA],
      );
    } finally {
      await cliente.end();
    }
    const pagina = await adminCtx.newPage();
    await pagina.goto(`/configuracion?fecha=${fecha}`);
    const fila = pagina.locator('section[aria-label="Grilla diaria"] tbody tr', { hasText: '09:00' }).first();
    await expect(fila).toContainText(/Liberada/);
    // Registro interno (administración): el motivo literal del exceso de tiempo.
    await expect(fila).toContainText(/exceso de tiempo sin respuesta de la administraci/i);
    await pagina.close();
    // El usuario ve el mensaje en clave, no el motivo interno.
    const vistaUser = await userCtx.newPage();
    await vistaUser.goto('/reservar');
    await expect(vistaUser.getByText(/la administración no confirmó la reserva/i).first()).toBeVisible();
    await expect(vistaUser.getByText(/exceso de tiempo sin respuesta/i)).toHaveCount(0);
    await vistaUser.close();
  });

  test('ADMIN confirma reserva y queda CONFIRMADA', async () => {
    const propias = (await (await userApi.get('/api/solicitudes')).json()) as {
      solicitudes: Array<{ id: number; estado: string }>;
    };
    const pendiente = propias.solicitudes.find((s) => s.estado === 'PENDIENTE');
    expect(pendiente).toBeDefined();
    const respuesta = await adminApi.post(`/api/solicitudes/${pendiente?.id}/confirmar`, { data: {} });
    expect(respuesta.ok()).toBe(true);
    const cuerpo = (await respuesta.json()) as { estado: string };
    expect(cuerpo.estado).toBe('CONFIRMADA');
  });

  test('ADMIN rechaza con motivo y el turno se libera', async () => {
    const fecha = fechaHabil(6);
    const creada = await crearSolicitud(userApi, cancha2, fecha, '12:00');
    const rechazo = await adminApi.post(`/api/solicitudes/${creada.id}/rechazar`, {
      data: { motivo: 'pago ilegible en prueba QA' },
    });
    expect(rechazo.ok()).toBe(true);
    expect(((await rechazo.json()) as { estado: string }).estado).toBe('RECHAZADA');
    const reintento = await crearSolicitud(userApi, cancha2, fecha, '12:00');
    expect(reintento.estado).toBe('PENDIENTE');
    // Rechazar sin motivo → 400.
    const sinMotivo = await adminApi.post(`/api/solicitudes/${reintento.id}/rechazar`, { data: { motivo: '' } });
    expect(sinMotivo.status()).toBe(400);
    await adminApi.post(`/api/solicitudes/${reintento.id}/rechazar`, { data: { motivo: 'limpieza QA' } });
  });

  test('ADMIN marca NO_SHOW; el turno se libera (HALLAZGO QA-02)', async () => {
    const fecha = fechaHabil(7);
    const creada = await crearSolicitud(userApi, cancha1, fecha, '15:00');
    await adminApi.post(`/api/solicitudes/${creada.id}/confirmar`, { data: {} });
    const noShow = await adminApi.post(`/api/solicitudes/${creada.id}/no-show`, { data: {} });
    expect(noShow.ok()).toBe(true);
    expect(((await noShow.json()) as { estado: string }).estado).toBe('NO_SHOW');
    // HALLAZGO QA-02: solo PENDIENTE/CONFIRMADA bloquean el slot
    // (`crear-solicitud.ts:86`). Tras NO_SHOW el turno queda re-reservable (201).
    // Decisión de negocio pendiente: ¿NO_SHOW debe seguir bloqueando y/o contar
    // como ingreso? Hoy permite doble reserva del mismo turno.
    const reuso = await crearSolicitud(userApi, cancha1, fecha, '15:00');
    expect(reuso.estado).toBe('PENDIENTE');
    await adminApi.post(`/api/solicitudes/${reuso.id}/rechazar`, { data: { motivo: 'limpieza QA' } });
  });

  test('ADMIN no puede marcar NO_SHOW sobre PENDIENTE (409)', async () => {
    const fecha = fechaHabil(8);
    const creada = await crearSolicitud(userApi, cancha2, fecha, '16:00');
    const respuesta = await adminApi.post(`/api/solicitudes/${creada.id}/no-show`, { data: {} });
    expect(respuesta.status()).toBe(409);
    await adminApi.post(`/api/solicitudes/${creada.id}/rechazar`, { data: { motivo: 'limpieza QA' } });
  });

  test('ADMIN crea bloqueo y el turno queda no reservable', async () => {
    const fecha = fechaHabil(9);
    const bloqueo = await adminApi.post('/api/bloqueos', {
      data: { canchaId: cancha1, fecha, horaInicio: '09:00', horaFin: '10:00', motivo: 'mantenimiento QA' },
    });
    expect(bloqueo.status()).toBe(201);
    await crearSolicitud(userApi, cancha1, fecha, '09:00', 409);
    const lista = (await (await adminApi.get(`/api/bloqueos?sedeId=${sedeId}&fecha=${fecha}`)).json()) as {
      bloqueos: Array<unknown>;
    };
    expect(lista.bloqueos.length).toBeGreaterThan(0);
  });

  test('ADMIN tiene alcance limitado (403 en sedes y usuarios)', async () => {
    const sede = await adminApi.post('/api/sedes', { data: { nombre: 'QA Prohibida', esPrueba: true, apertura: '08:00', cierre: '22:00' } });
    expect(sede.status()).toBe(403);
    const usuario = await adminApi.post('/api/usuarios', {
      data: { email: 'qa.prohibido@gmail.com', clave: 'Qa_Prohibido_1', nombre: 'Qa', sedeId },
    });
    expect(usuario.status()).toBe(403);
    // USUARIO tampoco accede a sedes.
    const sedeUsuario = await userApi.post('/api/sedes', {
      data: { nombre: 'QA Prohibida 2', esPrueba: true, apertura: '08:00', cierre: '22:00' },
    });
    expect(sedeUsuario.status()).toBe(403);
  });

  test('ADMIN gestiona canchas y tarifas de su sede (sin eliminar)', async () => {
    const sedes = (await (await superApi.get('/api/sedes?incluirPruebas=1')).json()) as { sedes: Array<{ id: number; nombre: string }> };
    const ajena = sedes.sedes.find((s) => s.id !== sedeId)?.id as number;
    // Cancha propia: crear, editar estado y tarifa base.
    const creada = await adminApi.post('/api/canchas', {
      data: { sedeId, nombre: 'QA-Admin-C1', tarifaBaseCentavos: 5000 },
    });
    expect(creada.status()).toBe(201);
    const canchaId = ((await creada.json()) as { id: number }).id;
    const editada = await adminApi.put(`/api/canchas/${canchaId}`, {
      data: { nombre: 'QA-Admin-C1', tarifaBaseCentavos: 5500, estado: 'NO_DISPONIBLE', motivoNoDisponible: 'QA admin' },
    });
    expect(editada.ok()).toBe(true);
    expect(((await editada.json()) as { estado: string }).estado).toBe('NO_DISPONIBLE');
    // Sede ajena: crear y editar → 403; eliminar propia → 403 (solo superadmin).
    expect((await adminApi.post('/api/canchas', { data: { sedeId: ajena, nombre: 'QA-X', tarifaBaseCentavos: 1000 } })).status()).toBe(403);
    expect((await adminApi.put(`/api/canchas/${canchaId}`, { data: { nombre: 'QA-Admin-C1', tarifaBaseCentavos: 5500, estado: 'DISPONIBLE' } })).status()).toBe(200);
    expect((await adminApi.delete(`/api/canchas/${canchaId}`)).status()).toBe(403);
    // Tarifa propia: crear y editar; ajena → 403.
    const tarifa = await adminApi.post('/api/tarifas', {
      data: { sedeId, nombre: 'QA-Admin-T', diasSemana: [1, 2, 3, 4, 5], horaInicio: '08:00', horaFin: '22:00', montoCentavos: 6000 },
    });
    expect(tarifa.status()).toBe(201);
    const tarifaId = ((await tarifa.json()) as { id: number }).id;
    const tarifaEditada = await adminApi.put(`/api/tarifas/${tarifaId}`, {
      data: { nombre: 'QA-Admin-T', diasSemana: [1, 2, 3, 4, 5], horaInicio: '08:00', horaFin: '22:00', montoCentavos: 6500 },
    });
    expect(tarifaEditada.ok()).toBe(true);
    expect((await adminApi.post('/api/tarifas', { data: { sedeId: ajena, nombre: 'QA-X', diasSemana: [1], horaInicio: '08:00', horaFin: '09:00', montoCentavos: 1000 } })).status()).toBe(403);
    expect((await adminApi.get(`/api/tarifas?sedeId=${ajena}`)).status()).toBe(403);
    // USUARIO sí puede leer tarifas para ver la aplicable en el formulario.
    expect((await userApi.get(`/api/tarifas?sedeId=${sedeId}`)).ok()).toBe(true);
    // Limpieza de lo creado por el ADMIN (queda fuera del afterAll por alcance).
    const cliente = new Client({ connectionString: process.env.DIRECT_URL });
    await cliente.connect();
    try {
      await cliente.query(`delete from "Tarifa" where id = $1`, [tarifaId]);
      await cliente.query(`delete from "Cancha" where id = $1`, [canchaId]);
    } finally {
      await cliente.end();
    }
  });

  test('Reserva exige hora en punto y futuro (400)', async () => {
    const fecha = fechaFutura(13);
    const fraccion = await userApi.post('/api/solicitudes', { data: { canchaId: cancha1, fecha, horaInicio: '10:30' } });
    expect(fraccion.status()).toBe(400);
  });

  // Reporte de producción: a las 20:12 en Lima (01:12 UTC) se intentó 20:20 y
  // el navegador bloqueó con un error de fecha. Valida fecha de hoy en Lima y
  // el corte de 15 min en la API real.
  test('Fecha de hoy en Lima es aceptable y el corte de 15 min se respeta', async () => {
    const hoyLima = fechaEnLima();
    const manana = fechaHabil(1);
    // Turno en punto dentro del margen → 201.
    const valido = await userApi.post('/api/solicitudes', { data: { canchaId: cancha2, fecha: manana, horaInicio: '21:00' } });
    expect(valido.status()).toBe(201);
    const id = ((await valido.json()) as { id: number }).id;
    await adminApi.post(`/api/solicitudes/${id}/rechazar`, { data: { motivo: 'limpieza QA' } });
    // Turno pasado (hoy a las 08:00) → 400 por futuro, no por formato de fecha.
    const pasado = await userApi.post('/api/solicitudes', { data: { canchaId: cancha2, fecha: hoyLima, horaInicio: '08:00' } });
    expect(pasado.status()).toBe(400);
    expect(((await pasado.json()) as { error: string }).error).toMatch(/futuro|hora en punto/i);
    // Fracción de hora → 400 por hora en punto (no por fecha).
    const fraccion = await userApi.post('/api/solicitudes', { data: { canchaId: cancha2, fecha: manana, horaInicio: '20:20' } });
    expect(fraccion.status()).toBe(400);
    expect(((await fraccion.json()) as { error: string }).error).toMatch(/hora en punto/i);
  });

  test('Alcance de lectura: ADMIN ve su sede, USUARIO solo lo suyo', async () => {
    const adminLista = (await (await adminApi.get('/api/solicitudes')).json()) as {
      solicitudes: Array<{ id: number; usuarioId: number }>;
    };
    const yo = (await (await userApi.get('/api/auth/me')).json()) as { id: number };
    const misLista = (await (await userApi.get('/api/solicitudes')).json()) as {
      solicitudes: Array<{ id: number; usuarioId: number }>;
    };
    expect(misLista.solicitudes.length).toBeGreaterThan(0);
    expect(misLista.solicitudes.every((s) => s.usuarioId === yo.id)).toBe(true);
    expect(adminLista.solicitudes.length).toBeGreaterThanOrEqual(misLista.solicitudes.length);
  });

  test('SUPERADMIN CRUD de sede con protecciones', async () => {
    const creada = await superApi.post('/api/sedes', {
      data: { nombre: 'QA Sede Temporal', esPrueba: true, direccion: 'Av. QA 456', apertura: '08:00', cierre: '22:00' },
    });
    expect(creada.status()).toBe(201);
    sedeTemporalId = ((await creada.json()) as { id: number }).id;
    const duplicada = await superApi.post('/api/sedes', {
      data: { nombre: 'QA Sede Temporal', esPrueba: true, apertura: '08:00', cierre: '22:00' },
    });
    expect(duplicada.status()).toBe(409);
    const editada = await superApi.put(`/api/sedes/${sedeTemporalId}`, {
      data: { nombre: 'QA Sede Temporal', esPrueba: true, direccion: 'Av. QA 789', apertura: '09:00', cierre: '21:00' },
    });
    expect(editada.ok()).toBe(true);
    // E2E_QA tiene canchas/tarifas/usuarios → no se puede desactivar.
    const protegida = await superApi.delete(`/api/sedes/${sedeId}`);
    expect(protegida.status()).toBe(409);
  });

  test('SUPERADMIN CRUD de cancha con activación automática por tarifa', async () => {
    expect(sedeTemporalId).toBeGreaterThan(0);
    const cancha = await superApi.post('/api/canchas', {
      data: { sedeId: sedeTemporalId, nombre: 'QA-T01', tarifaBaseCentavos: 4000 },
    });
    expect(cancha.status()).toBe(201);
    const cuerpo = (await cancha.json()) as { id: number; estado: string };
    // Sede temporal sin tarifas → nace NO_DISPONIBLE.
    expect(cuerpo.estado).toBe('NO_DISPONIBLE');
    const tarifa = await superApi.post('/api/tarifas', {
      data: {
        sedeId: sedeTemporalId,
        nombre: 'QA-T Tarifa',
        diasSemana: [0, 1, 2, 3, 4, 5, 6],
        horaInicio: '09:00',
        horaFin: '21:00',
        montoCentavos: 4000,
      },
    });
    expect(tarifa.status()).toBe(201);
    const canchas = (await (await superApi.get(`/api/canchas?sedeId=${sedeTemporalId}`)).json()) as {
      canchas: Array<{ id: number; estado: string }>;
    };
    expect(canchas.canchas.find((c) => c.id === cuerpo.id)?.estado).toBe('DISPONIBLE');
    // Tarifa fuera del horario de la sede → 400.
    const fuera = await superApi.post('/api/tarifas', {
      data: {
        sedeId: sedeTemporalId,
        nombre: 'QA-T Mala',
        diasSemana: [1],
        horaInicio: '07:00',
        horaFin: '08:00',
        montoCentavos: 1000,
      },
    });
    expect(fuera.status()).toBe(400);
    const renombrada = await superApi.put(`/api/canchas/${cuerpo.id}`, {
      data: { nombre: 'QA-T01', tarifaBaseCentavos: 4500, estado: 'DISPONIBLE' },
    });
    expect(renombrada.ok()).toBe(true);
  });

  test('SUPERADMIN elimina cancha con turnos solo tras reasignar', async () => {
    const canchas = (await (await superApi.get(`/api/canchas?sedeId=${sedeTemporalId}`)).json()) as {
      canchas: Array<{ id: number; nombre: string }>;
    };
    const origen = canchas.canchas.find((c) => c.nombre === 'QA-T01')?.id as number;
    const segunda = await superApi.post('/api/canchas', {
      data: { sedeId: sedeTemporalId, nombre: 'QA-T02', tarifaBaseCentavos: 4000 },
    });
    expect(segunda.status()).toBe(201);
    const destinoId = ((await segunda.json()) as { id: number }).id;
    const fecha = fechaHabil(10);
    const turno = await crearSolicitud(userApi, origen, fecha, '10:00');
    await adminApi.post(`/api/solicitudes/${turno.id}/confirmar`, { data: {} });
    const conTurnos = await superApi.delete(`/api/canchas/${origen}`);
    expect(conTurnos.status()).toBe(409);
    const vista = (await (await superApi.get(`/api/canchas/${origen}/eliminacion`)).json()) as {
      turnos: Array<{ id: number }>;
    };
    expect(vista.turnos.length).toBeGreaterThan(0);
    const reasignar = await superApi.post(`/api/canchas/${origen}/reasignar`, {
      data: { solicitudId: turno.id, canchaDestinoId: destinoId, fecha, horaInicio: '10:00' },
    });
    expect(reasignar.ok()).toBe(true);
    const liberada = await superApi.delete(`/api/canchas/${origen}`);
    expect(liberada.ok()).toBe(true);
  });

  test('SUPERADMIN crea ADMIN y valida duplicados y sede obligatoria', async () => {
    const email = `qa.admin.${Date.now()}@gmail.com`;
    const creado = await superApi.post('/api/usuarios', {
      data: { email, clave: 'Qa_Admin_99', nombre: 'QA Admin Nuevo', sedeId },
    });
    expect(creado.status()).toBe(201);
    expect(((await creado.json()) as { rol: string }).rol).toBe('ADMIN');
    const duplicado = await superApi.post('/api/usuarios', {
      data: { email, clave: 'Qa_Admin_99', nombre: 'QA Admin Nuevo', sedeId },
    });
    expect(duplicado.status()).toBe(409);
    const sinSede = await superApi.post('/api/usuarios', {
      data: { email: `qa.sinsede.${Date.now()}@gmail.com`, clave: 'Qa_Admin_99', nombre: 'QA Sin Sede' },
    });
    expect(sinSede.status()).toBe(400);
    // Limpieza del ADMIN creado (queda fuera del afterAll por no ser test-*).
    const cliente = new Client({ connectionString: process.env.DIRECT_URL });
    await cliente.connect();
    try {
      await cliente.query(`delete from "Usuario" where email = $1`, [email]);
    } finally {
      await cliente.end();
    }
  });

  test('Concurrencia: el mismo slot solo se otorga una vez', async () => {
    const fecha = fechaHabil(11);
    const [a, b] = await Promise.all([
      userApi.post('/api/solicitudes', { data: { canchaId: cancha2, fecha, horaInicio: '18:00' } }),
      userApi.post('/api/solicitudes', { data: { canchaId: cancha2, fecha, horaInicio: '18:00' } }),
    ]);
    const estados = [a.status(), b.status()].sort();
    expect(estados).toEqual([201, 409]);
  });

  test('Hold vencido: confirmar una PENDIENTE expirada da 409', async () => {
    const fecha = fechaHabil(12);
    const creada = await crearSolicitud(userApi, cancha2, fecha, '19:00');
    const cliente = new Client({ connectionString: process.env.DIRECT_URL });
    await cliente.connect();
    try {
      await cliente.query(`update "Solicitud" set "limiteHold" = now() - interval '1 hour' where id = $1`, [creada.id]);
    } finally {
      await cliente.end();
    }
    const respuesta = await adminApi.post(`/api/solicitudes/${creada.id}/confirmar`, { data: {} });
    expect(respuesta.status()).toBe(409);
  });

  test('USUARIO actualiza perfil y rota su clave', async () => {
    const perfil = await userApi.put('/api/cuenta/perfil', { data: { nombre: 'QA Usuario', telefono: '999888777' } });
    expect(perfil.ok()).toBe(true);
    expect(((await perfil.json()) as { telefono: string }).telefono).toBe('999888777');
    const mala = await userApi.put('/api/cuenta/clave', { data: { actual: 'incorrecta', nueva: 'Qa_Nueva_99' } });
    expect(mala.status()).toBe(400);
    const rotacion = await userApi.put('/api/cuenta/clave', { data: { actual: CLAVE_QA, nueva: 'Qa_Nueva_99' } });
    expect(rotacion.ok()).toBe(true);
    const relogin = await userCtx.request.post('/api/auth/login', {
      data: { email: QA.user.email, clave: 'Qa_Nueva_99' },
    });
    expect(relogin.ok()).toBe(true);
    // Restaura la clave estándar de QA.
    const volver = await userApi.put('/api/cuenta/clave', { data: { actual: 'Qa_Nueva_99', nueva: CLAVE_QA } });
    expect(volver.ok()).toBe(true);
  });

  test('ADMIN confirma la pendiente desde el Dashboard; USUARIO no ve el botón', async () => {
    const fecha = fechaFutura(15);
    await crearSolicitud(userApi, cancha1, fecha, '10:00');
    const paginaAdmin = await adminCtx.newPage();
    await paginaAdmin.goto(`/configuracion?fecha=${fecha}`);
    const fila = paginaAdmin.locator('section[aria-label="Grilla diaria"] tbody tr', { hasText: '10:00' }).first();
    await fila.getByRole('button', { name: /^confirmar$/i }).click();
    await expect(fila.getByRole('button', { name: /^confirmar$/i })).toHaveCount(0);
    await expect(fila).toContainText('Confirmada');
    await paginaAdmin.close();

    const paginaUser = await userCtx.newPage();
    await paginaUser.goto(`/configuracion?fecha=${fecha}`);
    await expect(paginaUser.locator('h1')).toHaveText('Dashboard');
    await expect(paginaUser.getByRole('button', { name: /^confirmar$/i })).toHaveCount(0);
    await paginaUser.close();
  });

  test('UI por rol: cada rol ve sus páginas y no las ajenas', async () => {
    const paginaSuper = await superCtx.newPage();
    await paginaSuper.goto('/sedes');
    await expect(paginaSuper.locator('h1')).toHaveText('Sedes');
    await paginaSuper.goto('/usuarios');
    await expect(paginaSuper.locator('h1')).toHaveText('Administrador');
    await paginaSuper.close();

    const paginaAdmin = await adminCtx.newPage();
    await paginaAdmin.goto('/pendientes');
    await expect(paginaAdmin.locator('h1')).toHaveText('Pendientes de verificación');
    await paginaAdmin.goto('/bloqueos');
    await expect(paginaAdmin.locator('h1')).toHaveText('Mantenimiento');
    await paginaAdmin.goto('/sedes');
    await expect(paginaAdmin).not.toHaveURL(/\/sedes$/);
    await paginaAdmin.close();

    const paginaUser = await userCtx.newPage();
    await paginaUser.goto('/reservar');
    await expect(paginaUser.locator('h1')).toHaveText('Reservas');
    await paginaUser.goto('/mi-cuenta');
    await expect(paginaUser.locator('h1')).toHaveText('Mi cuenta');
    await paginaUser.goto('/pendientes');
    await expect(paginaUser).not.toHaveURL(/\/pendientes$/);
    await paginaUser.close();
  });
});
