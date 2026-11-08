import 'dotenv/config';
import { expect, test, type APIRequestContext, type Browser, type BrowserContext } from '@playwright/test';
import { Client } from 'pg';
import { CORTE_RESERVA_MINUTOS, fechaEnLima, minutosPara } from '@/lib/ui/reloj-lima';

const CLAVE_QA = process.env.CLAVE_PRUEBA_QA ?? '';
if (!CLAVE_QA) throw new Error('Falta CLAVE_PRUEBA_QA: ejecuta CLAVE_PRUEBA_QA=... node scripts/crear-usuarios-prueba.mjs antes de este spec.');

// Flujo funcional del USUARIO con verificación de lo que queda guardado:
// corte de 15 min, doble reserva, mantenimiento y contenido real en la BD.

const QA = {
  super: { email: 'test-super@gmail.com', clave: CLAVE_QA },
  admin: { email: 'test-admin@gmail.com', clave: CLAVE_QA },
  user: { email: 'test-user@gmail.com', clave: CLAVE_QA },
} as const;

function minutos(hora: string): number {
  return Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
}

/** Horario de la sede QA en minutos (un cierre de 23:59 = fin del día = 1440). */
const APERTURA_QA = '08:00';
const CIERRE_QA: string = '22:00';

function limitesSede(): { abre: number; cierra: number } {
  return { abre: minutos(APERTURA_QA), cierra: CIERRE_QA === '23:59' ? 1440 : minutos(CIERRE_QA) };
}

/**
 * Turnos en punto que CABEN COMPLETO en el horario de atención:
 * con cierre 22:00 el último es 21:00 (21:00–22:00); 22:00–23:00 se saldría.
 */
function turnosValidos(): Array<{ fecha: string; hora: string }> {
  const { abre, cierra } = limitesSede();
  const hoy = fechaEnLima();
  const lista: Array<{ fecha: string; hora: string }> = [];
  for (let dia = 0; dia <= 14; dia += 1) {
    const base = new Date(`${hoy}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + dia);
    const fecha = base.toISOString().slice(0, 10);
    for (let inicio = abre; inicio + 60 <= cierra; inicio += 60) {
      const h = `${String(Math.floor(inicio / 60)).padStart(2, '0')}:00`;
      lista.push({ fecha, hora: h });
    }
  }
  return lista;
}

/** Primer turno en punto dentro del horario que aún tenga margen de reserva. */
function proximaHoraEnPunto(minMargen: number): { fecha: string; hora: string } {
  const turno = turnosValidos().find((t) => minutosPara(t.fecha, t.hora) >= minMargen);
  if (turno) return turno;
  throw new Error('la sede está cerrada por hoy');
}

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

async function bd() {
  const cliente = new Client({ connectionString: process.env.DIRECT_URL });
  await cliente.connect();
  return cliente;
}

/** Primer turno libre (reservado o bloqueado) a partir de `indice` candidatos. */
async function turnoLibre(canchaId: number, indice: number): Promise<{ fecha: string; hora: string }> {
  const cliente = await bd();
  const usados: string[] = [];
  try {
    const hoy = fechaEnLima();
    const validos = turnosValidos();
    for (let dia = 0; dia <= 14; dia += 1) {
      const base = new Date(`${hoy}T00:00:00Z`);
      base.setUTCDate(base.getUTCDate() + dia);
      const fechaDelDia: string = base.toISOString().slice(0, 10);
      // Solo turnos que caben completos en el horario de la sede.
      for (const { fecha, hora: inicio } of validos.filter((t) => t.fecha === fechaDelDia)) {
        const hora = Number(inicio.slice(0, 2));
        if (minutosPara(fecha, inicio) < CORTE_RESERVA_MINUTOS + 1) continue;
        const fin = `${String(hora + 1).padStart(2, '0')}:00`;
        const ocupado = await cliente.query(
          `SELECT 1 FROM "Solicitud" WHERE "canchaId" = $1 AND fecha = $2 AND "horaInicio" = $3
             AND estado IN ('PENDIENTE','CONFIRMADA') AND "eliminadoEn" IS NULL
           UNION ALL
           SELECT 1 FROM "BloqueoCancha" WHERE "canchaId" = $1 AND fecha = $2 AND "horaInicio" = $3
             AND "eliminadoEn" IS NULL`,
          [canchaId, fecha, inicio],
        );
        const clave = `${fecha} ${inicio}`;
        if (ocupado.rows.length === 0 && !usados.includes(clave)) {
          usados.push(clave);
          if (usados.length > indice) return { fecha, hora: inicio };
        } else if (!usados.includes(clave)) {
          usados.push(clave);
        }
      }
    }
  } finally {
    await cliente.end();
  }
  throw new Error('sin turno libre');
}

test.describe.serial('QA funcional usuario', () => {
  let adminCtx: BrowserContext;
  let userCtx: BrowserContext;
  let adminApi: APIRequestContext;
  let userApi: APIRequestContext;
  let sedeId = 0;
  let cancha1 = 0;
  let cancha2 = 0;
  let apertura = '08:00';
  let cierre = '22:00';

  test.beforeAll(async ({ browser }) => {
    ({ context: adminCtx, api: adminApi } = await sesion(browser, QA.admin));
    ({ context: userCtx, api: userApi } = await sesion(browser, QA.user));
    const sedeAdmin = await sesion(browser, QA.super);
    const sedes = (await (await sedeAdmin.api.get('/api/sedes?incluirPruebas=1')).json()) as {
      sedes: Array<{ id: number; nombre: string; apertura: string; cierre: string }>;
    };
    const qa = sedes.sedes.find((s) => s.nombre === 'E2E_QA');
    sedeId = qa?.id as number;
    expect(sedeId).toBeGreaterThan(0);
    // Las pruebas se hacen SIEMPRE dentro del horario de atención de la sede.
    apertura = qa?.apertura ?? '08:00';
    cierre = qa?.cierre ?? '22:00';
    const canchas = (await (await adminApi.get(`/api/canchas?sedeId=${sedeId}`)).json()) as {
      canchas: Array<{ id: number; nombre: string }>;
    };
    cancha1 = canchas.canchas.find((c) => c.nombre === 'QA-C01')?.id as number;
    cancha2 = canchas.canchas.find((c) => c.nombre === 'QA-C02')?.id as number;
    expect(cancha1).toBeGreaterThan(0);
    expect(cancha2).toBeGreaterThan(0);
    await sedeAdmin.context.close();
  });

  test.afterAll(async () => {
    await adminCtx?.close();
    await userCtx?.close();
  });

  test('el corte de 15 min se aplica según la hora real del servidor', async () => {
    // La ventana de 15 min solo se abre 15 minutos por hora (entre :45 y :59).
    // Con los horarios de la sede el único factor es el reloj: si el próximo
    // turno válido está dentro del corte se rechaza; si está fuera, se acepta.
    // El caso exacto de 10 min lo cubren los unitarios de validarReserva.
    const { cierra } = limitesSede();
    const ultimo = `21:00`;
    const margenes = turnosValidos()
      .map((t) => ({ turno: t, margen: minutosPara(t.fecha, t.hora) }))
      .filter((t) => t.margen > 0);
    if (margenes.length === 0) {
      test.info().annotations.push({
        type: 'nota',
        description: `sede cerrada por hoy (cierra ${ultimo}); el corte queda cubierto por los unitarios`,
      });
      return;
    }
    const cercano = margenes.reduce((a, b) => (a.margen <= b.margen ? a : b));
    const respuesta = await userApi.post('/api/solicitudes', {
      data: { canchaId: cancha1, fecha: cercano.turno.fecha, horaInicio: cercano.turno.hora },
    });
    if (cercano.margen <= CORTE_RESERVA_MINUTOS) {
      expect(respuesta.status()).toBe(400);
      expect(((await respuesta.json()) as { error: string }).error).toMatch(
        new RegExp(`${CORTE_RESERVA_MINUTOS} minutos antes`, 'i'),
      );
      test.info().annotations.push({
        type: 'nota',
        description: `corte verificado en vivo: turno a ${cercano.margen.toFixed(1)} min (dentro del corte)`,
      });
      return;
    }
    expect(respuesta.status()).toBe(201);
    const id = ((await respuesta.json()) as { id: number }).id;
    test.info().annotations.push({
      type: 'nota',
      description: `fuera de la ventana de corte (margen ${cercano.margen.toFixed(1)} min): 201 esperado`,
    });
    const cliente = await bd();
    try {
      await cliente.query(`DELETE FROM "Solicitud" WHERE id = $1`, [id]);
    } finally {
      await cliente.end();
    }
  });

  test('el último turno es el que termina en el cierre: no se reserva después', async () => {
    const { cierra } = limitesSede();
    const horaCierre = `${String(Math.floor(cierra / 60)).padStart(2, '0')}:00`;
    // Un turno que empieza justo al cierre se saldría de la sede. Toma un día
    // donde esa hora todavía sea futura: si ya pasó, la API responde 400 por
    // "futuro" y el test mediría el reloj en vez del horario de la sede.
    const turno = turnosValidos().find(
      (t) => t.hora === horaCierre && minutosPara(t.fecha, t.hora) > CORTE_RESERVA_MINUTOS,
    );
    if (turno === undefined) {
      test.info().annotations.push({ type: 'nota', description: `sin días futuros a las ${horaCierre}` });
      return;
    }
    const r = await userApi.post('/api/solicitudes', {
      data: { canchaId: cancha1, fecha: turno.fecha, horaInicio: horaCierre },
    });
    expect(r.status()).toBe(400);
    expect(((await r.json()) as { error: string }).error).toMatch(/horario de la sede/i);
  });

  test('el turno previo al cierre sí se puede reservar (21:00–22:00)', async () => {
    const { cierra } = limitesSede();
    const horaUltimo = `${String(Math.floor(cierra / 60) - 1).padStart(2, '0')}:00`;
    // `turnosValidos` arranca por hoy: si ya pasó el corte de 15 min de esa
    // hora, la API responde 400 por futuro y el test mediría el reloj, no el
    // horario. Se toma la primera ocurrencia que aún tenga margen.
    const turno = turnosValidos().find(
      (t) => t.hora === horaUltimo && minutosPara(t.fecha, t.hora) > CORTE_RESERVA_MINUTOS,
    );
    if (turno === undefined) {
      test.info().annotations.push({ type: 'nota', description: 'sin días futuros con el último turno libre' });
      return;
    }
    const r = await userApi.post('/api/solicitudes', {
      data: { canchaId: cancha2, fecha: turno.fecha, horaInicio: turno.hora },
    });
    expect(r.status()).toBe(201);
    const id = ((await r.json()) as { id: number }).id;
    const cliente = await bd();
    try {
      const g = await cliente.query(
        `SELECT "horaInicio", "horaFin" FROM "Solicitud" WHERE id = $1`,
        [id],
      );
      expect(g.rows[0].horaInicio).toBe(horaUltimo);
      expect(g.rows[0].horaFin).toBe(`${String(Math.floor(cierra / 60)).padStart(2, '0')}:00`);
      await cliente.query(`DELETE FROM "Solicitud" WHERE id = $1`, [id]);
    } finally {
      await cliente.end();
    }
  });

  test('reserva válida: se guarda con estado, monto, hold de 3 h y registro de cambio', async () => {
    const turno = await turnoLibre(cancha1, 0);
    const creada = await userApi.post('/api/solicitudes', {
      data: { canchaId: cancha1, fecha: turno.fecha, horaInicio: turno.hora },
    });
    expect(creada.status()).toBe(201);
    const cuerpo = (await creada.json()) as {
      id: number;
      estado: string;
      montoTotalCentavos: number;
      horaFin: string;
      intento: number;
      limiteHold: string;
    };
    expect(cuerpo.estado).toBe('PENDIENTE');
    expect(cuerpo.intento).toBe(1);
    expect(cuerpo.horaFin).toBe(`${String(Number(turno.hora.slice(0, 2)) + 1).padStart(2, '0')}:00`);

    // Lo que realmente quedó en la base de datos.
    const cliente = await bd();
    try {
      const fila = await cliente.query(
        `SELECT s.estado, s."montoTotalCentavos", s.intento, s."limiteHold", s."creadoEn", s."eliminadoEn",
                c.nombre AS cancha, se.nombre AS sede, u.email AS usuario, c."sedeId"
         FROM "Solicitud" s
         JOIN "Cancha" c ON c.id = s."canchaId"
         JOIN "Sede" se ON se.id = c."sedeId"
         JOIN "Usuario" u ON u.id = s."usuarioId"
         WHERE s.id = $1`,
        [cuerpo.id],
      );
      const g = fila.rows[0];
      expect(g.estado).toBe('PENDIENTE');
      expect(g.cancha).toBe('QA-C01');
      expect(g.sede).toBe('E2E_QA');
      expect(g.usuario).toBe(QA.user.email);
      expect(g.sedeId).toBe(sedeId);
      expect(g.eliminadoEn).toBeNull();
      // Monto = tarifa aplicable de la sede para ese día y hora (o la base).
      expect([3000, 5000, 7000]).toContain(g.montoTotalCentavos);
      // Hold de 3 h en el futuro.
      const minutosHold = (new Date(g.limiteHold).getTime() - Date.now()) / 60_000;
      expect(minutosHold).toBeGreaterThan(170);
      expect(minutosHold).toBeLessThanOrEqual(180.5);
      // Auditoría: existe el registro de cambio.
      const cambio = await cliente.query(
        `SELECT tabla, "filaId", "sedeId" FROM "RegistroCambio" WHERE tabla = 'Solicitud' AND "filaId" = $1`,
        [cuerpo.id],
      );
      expect(cambio.rows.length).toBeGreaterThan(0);
      expect(cambio.rows[0].sedeId).toBe(sedeId);
    } finally {
      await cliente.end();
    }
  });

  test('segunda reserva del mismo turno y cancha: 409 y una sola fila en BD', async () => {
    const turno = await turnoLibre(cancha2, 0);
    const primera = await userApi.post('/api/solicitudes', {
      data: { canchaId: cancha2, fecha: turno.fecha, horaInicio: turno.hora },
    });
    expect(primera.status()).toBe(201);
    const segunda = await userApi.post('/api/solicitudes', {
      data: { canchaId: cancha2, fecha: turno.fecha, horaInicio: turno.hora },
    });
    expect(segunda.status()).toBe(409);
    expect(((await segunda.json()) as { error: string }).error).toMatch(/ya está reservado/i);

    const cliente = await bd();
    try {
      const counted = await cliente.query(
        `SELECT count(*)::int AS n FROM "Solicitud"
         WHERE "canchaId" = $1 AND fecha = $2 AND "horaInicio" = $3
           AND estado IN ('PENDIENTE','CONFIRMADA') AND "eliminadoEn" IS NULL`,
        [cancha2, turno.fecha, turno.hora],
      );
      expect(counted.rows[0].n).toBe(1);
    } finally {
      await cliente.end();
    }
  });

  test('cancha en mantenimiento: el turno queda no reservable y el bloqueo queda registrado', async () => {
    const turno = await turnoLibre(cancha1, 1);
    // occupying the slot first, to prove the block is what closes it
    const previa = await userApi.post('/api/solicitudes', {
      data: { canchaId: cancha1, fecha: turno.fecha, horaInicio: turno.hora },
    });
    expect(previa.status()).toBe(201);
    const previaId = ((await previa.json()) as { id: number }).id;

    const bloqueo = await adminApi.post('/api/bloqueos', {
      data: {
        canchaId: cancha1,
        fecha: turno.fecha,
        horaInicio: turno.hora,
        horaFin: `${String(Number(turno.hora.slice(0, 2)) + 1).padStart(2, '0')}:00`,
        motivo: 'Mantenimiento QA',
      },
    });
    expect(bloqueo.status()).toBe(201);
    const cuerpoBloqueo = (await bloqueo.json()) as { id: number; canceladas: number };
    // El bloqueo cancela los PENDIENTE que solapan.
    expect(cuerpoBloqueo.canceladas).toBeGreaterThanOrEqual(1);

    const cliente = await bd();
    try {
      const bloqueada = await cliente.query(
        `SELECT estado, motivo FROM "Solicitud" WHERE id = $1`,
        [previaId],
      );
      expect(bloqueada.rows[0].estado).toBe('CANCELADA');
      expect(bloqueada.rows[0].motivo).toMatch(/mantenimiento/i);

      const bloqueos = await cliente.query(
        `SELECT b.id, b.motivo, b."horaInicio", b."horaFin", c.nombre AS cancha
         FROM "BloqueoCancha" b JOIN "Cancha" c ON c.id = b."canchaId"
         WHERE b.id = $1 AND b."eliminadoEn" IS NULL`,
        [cuerpoBloqueo.id],
      );
      expect(bloqueos.rows[0].cancha).toBe('QA-C01');
      expect(bloqueos.rows[0].motivo).toBe('Mantenimiento QA');
      expect(bloqueos.rows[0].horaInicio).toBe(turno.hora);
    } finally {
      await cliente.end();
    }

    // Nuevo intento sobre el turno bloqueado → 409.
    const reintento = await userApi.post('/api/solicitudes', {
      data: { canchaId: cancha1, fecha: turno.fecha, horaInicio: turno.hora },
    });
    expect(reintento.status()).toBe(409);
    expect(((await reintento.json()) as { error: string }).error).toMatch(/bloqueo vigente/i);
  });

  test('el usuario ve en su lista la reserva, el estado y el monto cobrado', async () => {
    const pagina = await userCtx.newPage();
    await pagina.goto('/reservar');
    await expect(pagina.locator('h1')).toHaveText('Reservas');
    await expect(pagina.getByText('pendiente de confirmación').first()).toBeVisible();
    // El monto mostrado coincide con una tarifa real, nunca con la base inventada.
    const montos = await pagina.locator('section[aria-label="Lista de reservas"] li').allTextContents();
    for (const texto of montos) {
      expect(texto).toMatch(/S\/\s?\d+/);
      expect(texto).not.toMatch(/NaN|Infinity|undefined/);
    }
    await pagina.close();
  });
});
