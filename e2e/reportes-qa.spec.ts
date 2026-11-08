import 'dotenv/config';
import { expect, test, type APIRequestContext, type Browser, type BrowserContext } from '@playwright/test';
import { Client } from 'pg';

const CLAVE_QA = process.env.CLAVE_PRUEBA_QA ?? '';
if (!CLAVE_QA) throw new Error('Falta CLAVE_PRUEBA_QA: ejecuta CLAVE_PRUEBA_QA=... node scripts/crear-usuarios-prueba.mjs antes de este spec.');

// Fase 4: cuadros de uso. Siembra montos conocidos por SQL (`DIA_1`/`DIA_2` en
// E2E_QA) y verifica JSON = CSV = UI, más el alcance por rol.
//
// `MES` es exclusivo de este spec: `ingresos-qa` siembra 2026-07 y
// `reportes-export-qa` afirma el cuadre global de 2026-08 y 2026-09. Cuando dos
// specs comparten mes, la limpieza de uno mueve el total que el otro acaba de
// medir y el fallo aparece como un descuadre de la app, no como una carrera.

const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

/** Mes exclusivo de este spec. Nadie más siembra ni afirma contra él. */
const MES = '2026-06';
const DIA_1 = `${MES}-12`;
const DIA_2 = `${MES}-13`;

const SIEMBRA = [
  { fecha: DIA_1, horaInicio: '10:00', horaFin: '11:00', estado: 'CONFIRMADA', monto: 5000, cancha: 'QA-C01', motivo: null },
  { fecha: DIA_1, horaInicio: '19:00', horaFin: '20:00', estado: 'CONFIRMADA', monto: 7000, cancha: 'QA-C01', motivo: null },
  { fecha: DIA_1, horaInicio: '11:00', horaFin: '12:00', estado: 'PENDIENTE', monto: 5000, cancha: 'QA-C02', motivo: null },
  { fecha: DIA_1, horaInicio: '12:00', horaFin: '13:00', estado: 'RECHAZADA', monto: 5000, cancha: 'QA-C02', motivo: 'QA reportes' },
  { fecha: DIA_2, horaInicio: '10:00', horaFin: '11:00', estado: 'CONFIRMADA', monto: 7000, cancha: 'QA-C01', motivo: null },
  { fecha: DIA_2, horaInicio: '18:00', horaFin: '19:00', estado: 'NO_SHOW', monto: 5000, cancha: 'QA-C01', motivo: 'QA reportes' },
  { fecha: DIA_2, horaInicio: '09:00', horaFin: '10:00', estado: 'CANCELADA', monto: 7000, cancha: 'QA-C02', motivo: 'QA reportes' },
];

function parsearCsv(texto: string): Array<Record<string, string>> {
  const lineas = texto.replace(/^﻿/, '').trim().split('\n');
  const cabecera = lineas[0].split(';');
  return lineas.slice(1).map((l) => {
    const celdas = l.split(';');
    return Object.fromEntries(cabecera.map((h, i) => [h, celdas[i] ?? '']));
  });
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

test.describe.serial('QA reportes', () => {
  let adminCtx: BrowserContext;
  let superCtx: BrowserContext;
  let userCtx: BrowserContext;
  let adminApi: APIRequestContext;
  let superApi: APIRequestContext;
  let userApi: APIRequestContext;
  let sedeQa = 0;
  let sedeAjena = 0;
  /** Ids de las filas de este spec: la limpieza borra solo estas. */
  const idsSembrados: number[] = [];

  test.beforeAll(async ({ browser }) => {
    ({ context: adminCtx, api: adminApi } = await sesion(browser, { email: 'test-admin@gmail.com', clave: CLAVE_QA }));
    ({ context: superCtx, api: superApi } = await sesion(browser, { email: 'test-super@gmail.com', clave: CLAVE_QA }));
    ({ context: userCtx, api: userApi } = await sesion(browser, { email: 'test-user@gmail.com', clave: CLAVE_QA }));
    const cliente = new Client({ connectionString: process.env.DIRECT_URL });
    await cliente.connect();
    try {
      const qa = await cliente.query(`select id from "Usuario" where email = 'test-user@gmail.com'`);
      const usuarioId = qa.rows[0].id as number;
      const sede = await cliente.query(`select id from "Sede" where nombre = 'E2E_QA'`);
      sedeQa = sede.rows[0].id as number;
      const otra = await cliente.query(`select id from "Sede" where "eliminadoEn" is null and nombre <> 'E2E_QA' order by id limit 1`);
      sedeAjena = otra.rows[0].id as number;
      const canchas = await cliente.query(`select id, nombre from "Cancha" where "sedeId" = $1`, [sedeQa]);
      const porNombre = new Map(canchas.rows.map((c) => [c.nombre as string, c.id as number]));

      // Guarda: este spec exige que E2E_QA esté vacía en su mes. Si otro spec
      // siembra el mismo mes, se falla aquí y no en un cuadro de ingresos.
      const previa = await cliente.query(
        `select count(*)::int as n from "Solicitud"
         where fecha like $1 and "canchaId" in (select id from "Cancha" where "sedeId" = $2)`,
        [`${MES}%`, sedeQa],
      );
      expect(
        previa.rows[0].n,
        `E2E_QA ya tiene ${previa.rows[0].n} fila(s) en ${MES}: otro spec está usando este mes`,
      ).toBe(0);

      for (const f of SIEMBRA) {
        const ins = await cliente.query(
          `insert into "Solicitud" ("usuarioId", "canchaId", fecha, "horaInicio", "horaFin", estado, intento,
            "montoTotalCentavos", motivo, "limiteHold", "creadoEn", "actualizadoEn")
           values ($1, $2, $3, $4, $5, $6, 1, $7, $8, null, now(), now()) returning id`,
          [usuarioId, porNombre.get(f.cancha), f.fecha, f.horaInicio, f.horaFin, f.estado, f.monto, f.motivo],
        );
        idsSembrados.push(ins.rows[0].id as number);
        await cliente.query(
          `insert into "RegistroCambio" (tabla, "filaId", "sedeId", "usuarioId", "cambiadoEn")
           values ('Solicitud', $1, $2, $3, now())`,
          [ins.rows[0].id, sedeQa, usuarioId],
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
    await userCtx?.close();
  });

  test('ADMIN JSON ingresos coincide con la verdad SQL', async () => {
    const respuesta = await adminApi.get(`/api/reportes?tipo=ingresos&mes=${MES}`);
    expect(respuesta.ok()).toBe(true);
    const cuerpo = (await respuesta.json()) as {
      sedeId: number;
      datos: { porSede: Array<{ sede: string; confirmadas: number; ingresosCentavos: number; ticketPromedioCentavos: number }> };
    };
    expect(cuerpo.sedeId).toBe(sedeQa);
    expect(cuerpo.datos.porSede).toHaveLength(1);
    expect(cuerpo.datos.porSede[0]).toMatchObject({
      sede: 'E2E_QA',
      confirmadas: 3,
      ingresosCentavos: 19000,
      ticketPromedioCentavos: 6333,
    });
  });

  test('ADMIN JSON ocupación, estados y clientes', async () => {
    const ocupacion = (await (await adminApi.get(`/api/reportes?tipo=ocupacion&mes=${MES}`)).json()) as {
      datos: Array<{ reservas: number }>;
    };
    expect(ocupacion.datos).toHaveLength(5);
    expect(ocupacion.datos.every((f) => f.reservas === 1)).toBe(true);
    const estados = (await (await adminApi.get(`/api/reportes?tipo=estados&mes=${MES}`)).json()) as {
      datos: { filas: Array<{ estado: string; total: number }>; total: number };
    };
    expect(estados.datos.total).toBe(7);
    expect(estados.datos.filas.find((f) => f.estado === 'CONFIRMADA')?.total).toBe(3);
    const clientes = (await (await adminApi.get(`/api/reportes?tipo=clientes&mes=${MES}`)).json()) as {
      datos: { top: Array<{ reservas: number; confirmadas: number; ingresosCentavos: number }>; horasPico: Array<{ horaInicio: string; reservas: number }> };
    };
    expect(clientes.datos.top[0]).toMatchObject({ reservas: 7, confirmadas: 3, ingresosCentavos: 19000 });
    expect(clientes.datos.horasPico[0]).toMatchObject({ horaInicio: '10:00', reservas: 2 });
  });

  test('CSV descargado coincide con el JSON', async () => {
    const respuesta = await adminApi.get(`/api/reportes?tipo=ingresos&mes=${MES}&formato=csv`);
    expect(respuesta.ok()).toBe(true);
    expect(respuesta.headers()['content-type']).toContain('text/csv');
    expect(respuesta.headers()['content-disposition']).toContain(`reporte-ingresos-${MES}.csv`);
    const filas = parsearCsv(await respuesta.text());
    const sede = filas.find((f) => f.nivel === 'sede');
    expect(sede).toMatchObject({ nombre: 'E2E_QA', confirmadas: '3', ingresos_centavos: '19000' });
    const canchas = filas.filter((f) => f.nivel === 'cancha');
    expect(canchas.reduce((a, c) => a + Number(c.ingresos_centavos), 0)).toBe(19000);
  });

  test('Alcance: ADMIN no ve sede ajena; USUARIO no entra', async () => {
    const ajena = await adminApi.get(`/api/reportes?tipo=ingresos&mes=${MES}&sedeId=${sedeAjena}`);
    expect(ajena.status()).toBe(403);
    const mala = await adminApi.get('/api/reportes?tipo=ingresos&mes=2026-13');
    expect(mala.status()).toBe(400);
    const usuario = await userApi.get(`/api/reportes?tipo=ingresos&mes=${MES}`);
    expect(usuario.status()).toBe(403);
    const pagina = await userCtx.newPage();
    await pagina.goto(`/reportes?tipo=ingresos&mes=${MES}`);
    await expect(pagina).not.toHaveURL(/\/reportes/);
    await pagina.close();
  });

  test('UI muestra los cuadros y el enlace de exportación', async () => {
    const paginaAdmin = await adminCtx.newPage();
    await paginaAdmin.goto(`/reportes?tipo=ingresos&mes=${MES}`);
    await expect(paginaAdmin.locator('h1')).toHaveText('Reportes');
    await expect(paginaAdmin.locator('section[aria-label="Ingresos por sede"]')).toContainText('E2E_QA');
    await expect(paginaAdmin.locator('section[aria-label="Ingresos por sede"]')).toContainText(soles.format(190));
    const exportar = paginaAdmin.getByRole('link', { name: /descargar csv/i });
    await expect(exportar).toHaveAttribute('href', /formato=csv/);
    await expect(paginaAdmin.getByRole('link', { name: /descargar pdf/i })).toHaveAttribute('href', /formato=pdf/);
    await paginaAdmin.goto(`/reportes?tipo=estados&mes=${MES}`);
    await expect(paginaAdmin.locator('section[aria-label="Reservas por estado"]')).toContainText('Total del mes: 7 reservas.');
    await paginaAdmin.close();

    const paginaSuper = await superCtx.newPage();
    await paginaSuper.goto(`/reportes?tipo=ingresos&mes=${MES}&sedeId=${sedeQa}`);
    await expect(paginaSuper.locator('section[aria-label="Ingresos por sede"]')).toContainText(soles.format(190));
    await paginaSuper.close();
  });
});
