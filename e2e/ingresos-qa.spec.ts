import 'dotenv/config';
import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { Client } from 'pg';

const CLAVE_QA = process.env.CLAVE_PRUEBA_QA ?? '';
if (!CLAVE_QA) throw new Error('Falta CLAVE_PRUEBA_QA: ejecuta CLAVE_PRUEBA_QA=... node scripts/crear-usuarios-prueba.mjs antes de este spec.');

// Fase 3: validación de ingresos. Siembra montos conocidos por SQL (fechas fijas
// en `MES` dentro de E2E_QA) y verifica que Dashboard y KPIs muestren exactamente
// la suma de CONFIRMADA. Limpieza: afterAll borra por id las filas que insertó.
//
// El mes es exclusivo de este spec a propósito: `reportes-qa` siembra el 2026-08
// y `reportes-export-qa` afirma el cuadre global de 2026-08 y 2026-09. Compartir
// mes hacía que la limpieza de uno moviera el total que el otro acababa de medir, y
// el fallo se veía como un descuadre de la app en vez de una carrera de tests.

const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

/** Mes exclusivo de este spec. Nadie más siembra ni afirma contra él. */
const MES = '2026-07';
const DIA_1 = `${MES}-10`;
const DIA_2 = `${MES}-11`;

type FilaSiembra = {
  fecha: string;
  horaInicio: string;
  horaFin: string;
  estado: string;
  monto: number;
  cancha: 'QA-C01' | 'QA-C02';
  motivo: string | null;
  holdFuturo: boolean;
};

// Montos conocidos: día S/50 (5000), noche S/70 (7000).
const SIEMBRA: FilaSiembra[] = [
  { fecha: DIA_1, horaInicio: '10:00', horaFin: '11:00', estado: 'CONFIRMADA', monto: 5000, cancha: 'QA-C01', motivo: null, holdFuturo: false },
  { fecha: DIA_1, horaInicio: '19:00', horaFin: '20:00', estado: 'CONFIRMADA', monto: 7000, cancha: 'QA-C01', motivo: null, holdFuturo: false },
  { fecha: DIA_1, horaInicio: '11:00', horaFin: '12:00', estado: 'PENDIENTE', monto: 5000, cancha: 'QA-C02', motivo: null, holdFuturo: true },
  { fecha: DIA_1, horaInicio: '12:00', horaFin: '13:00', estado: 'RECHAZADA', monto: 5000, cancha: 'QA-C02', motivo: 'QA ingresos', holdFuturo: false },
  { fecha: DIA_2, horaInicio: '10:00', horaFin: '11:00', estado: 'CONFIRMADA', monto: 7000, cancha: 'QA-C01', motivo: null, holdFuturo: false },
  { fecha: DIA_2, horaInicio: '18:00', horaFin: '19:00', estado: 'NO_SHOW', monto: 5000, cancha: 'QA-C01', motivo: 'QA ingresos', holdFuturo: false },
  { fecha: DIA_2, horaInicio: '09:00', horaFin: '10:00', estado: 'CANCELADA', monto: 7000, cancha: 'QA-C02', motivo: 'QA ingresos', holdFuturo: false },
];

const ESPERADO = {
  dia: 5000 + 7000,
  mes: 5000 + 7000 + 7000,
  confirmadasMes: 3,
  ticketMes: Math.round((5000 + 7000 + 7000) / 3),
  cancha01Mes: 5000 + 7000 + 7000,
  cancha01Confirmadas: 3,
};

async function sesionApi(
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

async function valorKpi(page: Page, etiqueta: string): Promise<string> {
  const fila = page.locator('dl[aria-label="Indicadores"] div', { has: page.locator('dt', { hasText: etiqueta }) });
  await expect(fila.locator('dd')).toBeVisible();
  return (await fila.locator('dd').innerText()).trim();
}

function numeroDe(texto: string): number {
  const limpio = texto.replace(/[^0-9,.-]/g, '');
  const normalizado = limpio.includes('.') ? limpio.replace(/,/g, '') : limpio.replace(',', '.');
  return Number(normalizado);
}

test.describe.serial('QA ingresos', () => {
  let adminCtx: BrowserContext;
  let superCtx: BrowserContext;
  let adminApi: APIRequestContext;
  let superApi: APIRequestContext;
  /** Ids de las filas de este spec: la limpieza borra solo estas. */
  const idsSembrados: number[] = [];

  test.beforeAll(async ({ browser }) => {
    ({ context: adminCtx, api: adminApi } = await sesionApi(browser, {
      email: 'test-admin@gmail.com',
      clave: CLAVE_QA,
    }));
    ({ context: superCtx, api: superApi } = await sesionApi(browser, {
      email: 'test-super@gmail.com',
      clave: CLAVE_QA,
    }));
    expect(adminApi).toBeDefined();
    expect(superApi).toBeDefined();
    const cliente = new Client({ connectionString: process.env.DIRECT_URL });
    await cliente.connect();
    try {
      const qa = await cliente.query(`select id from "Usuario" where email = 'test-user@gmail.com'`);
      const usuarioId = qa.rows[0].id as number;
      const sede = await cliente.query(`select id from "Sede" where nombre = 'E2E_QA'`);
      const sedeId = sede.rows[0].id as number;
      const canchas = await cliente.query(`select id, nombre from "Cancha" where "sedeId" = $1`, [sedeId]);
      const porNombre = new Map(canchas.rows.map((c) => [c.nombre as string, c.id as number]));

      // Guarda: este spec exige que E2E_QA esté vacía en su mes. Si alguien siembra
      // el mismo mes desde otro spec, se falla aquí y no en un cuadre de ingresos.
      const previa = await cliente.query(
        `select count(*)::int as n from "Solicitud"
         where fecha like $1 and "canchaId" in (select id from "Cancha" where "sedeId" = $2)`,
        [`${MES}%`, sedeId],
      );
      expect(
        previa.rows[0].n,
        `E2E_QA ya tiene ${previa.rows[0].n} fila(s) en ${MES}: otro spec está usando este mes`,
      ).toBe(0);

      for (const f of SIEMBRA) {
        const ins = await cliente.query(
          `insert into "Solicitud" ("usuarioId", "canchaId", fecha, "horaInicio", "horaFin", estado, intento,
            "montoTotalCentavos", motivo, "limiteHold", "creadoEn", "actualizadoEn")
           values ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, now(), now()) returning id`,
          [
            usuarioId,
            porNombre.get(f.cancha),
            f.fecha,
            f.horaInicio,
            f.horaFin,
            f.estado,
            f.monto,
            f.motivo,
            f.holdFuturo ? new Date(Date.now() + 30 * 60_000) : null,
          ],
        );
        idsSembrados.push(ins.rows[0].id as number);
        await cliente.query(
          `insert into "RegistroCambio" (tabla, "filaId", "sedeId", "usuarioId", "cambiadoEn")
           values ('Solicitud', $1, $2, $3, now())`,
          [ins.rows[0].id, sedeId, usuarioId],
        );
      }
    } finally {
      await cliente.end();
    }
  });

  test.afterAll(async () => {
    const cliente = new Client({ connectionString: process.env.DIRECT_URL });
    await cliente.connect();
    try {
      // Por id y no por fecha: no se toca lo que haya sembrado otro spec.
      if (idsSembrados.length > 0) {
        await cliente.query(`delete from "RegistroCambio" where tabla = 'Solicitud' and "filaId" = any($1)`, [
          idsSembrados,
        ]);
        await cliente.query(`delete from "Solicitud" where id = any($1)`, [idsSembrados]);
      }
    } finally {
      await cliente.end();
    }
    await adminCtx?.close();
    await superCtx?.close();
  });

  test('Dashboard ADMIN muestra ingresos exactos del día y del mes', async () => {
    const page = await adminCtx.newPage();
    await page.goto(`/configuracion?fecha=${DIA_1}`);
    expect(await valorKpi(page, 'Ingresos del día')).toBe(soles.format(ESPERADO.dia / 100));
    expect(await valorKpi(page, 'Ingresos del mes')).toBe(soles.format(ESPERADO.mes / 100));
    // Solo CONFIRMADA suma: PENDIENTE+RECHAZADA+NO_SHOW+CANCELADA no alteran el total.
    await page.close();
  });

  test('KPIs ADMIN: ingreso, confirmadas, ticket y detalle por cancha', async () => {
    const page = await adminCtx.newPage();
    await page.goto(`/kpis?mes=${MES}&fecha=${DIA_1}`);
    expect(await valorKpi(page, `Ingreso del ${DIA_1}`)).toBe(soles.format(ESPERADO.dia / 100));
    expect(await valorKpi(page, `Ingreso de ${MES}`)).toBe(soles.format(ESPERADO.mes / 100));
    expect(await valorKpi(page, 'Confirmadas del mes')).toBe(String(ESPERADO.confirmadasMes));
    expect(await valorKpi(page, 'Ticket promedio mensual')).toBe(soles.format(ESPERADO.ticketMes / 100));
    const filaCancha = page.locator('section[aria-label="Ingreso mensual por cancha"] li', {
      has: page.locator('strong', { hasText: 'QA-C01' }),
    });
    await expect(filaCancha).toContainText(soles.format(ESPERADO.cancha01Mes / 100));
    await expect(filaCancha).toContainText(`${ESPERADO.cancha01Confirmadas} confirmadas`);
    await page.close();
  });

  test('SQL verdad vs UI: el mes completo sin recorte (QA-03 corregido)', async () => {
    const cliente = new Client({ connectionString: process.env.DIRECT_URL });
    await cliente.connect();
    let verdadCentavos = 0;
    try {
      const r = await cliente.query(
        `select coalesce(sum("montoTotalCentavos"), 0)::int as total from "Solicitud"
         where estado = 'CONFIRMADA' and "eliminadoEn" is null and fecha like '2026-09%'`,
      );
      verdadCentavos = r.rows[0].total as number;
    } finally {
      await cliente.end();
    }
    const page = await superCtx.newPage();
    await page.goto('/configuracion?fecha=2026-09-10&sede=todas');
    const textoUi = await valorKpi(page, 'Ingresos del mes');
    await page.close();
    const uiCentavos = Math.round(numeroDe(textoUi) * 100);
    console.log(`QA-03 verdad SQL 2026-09: ${verdadCentavos} centavos; UI muestra: ${uiCentavos} centavos.`);
    // QA-03 corregido: /api/solicitudes acepta mes+limite y el Dashboard pide el
    // mes completo, así que la UI debe igualar la verdad SQL.
    expect(verdadCentavos).toBeGreaterThan(0);
    expect(uiCentavos).toBe(verdadCentavos);
  });
});
