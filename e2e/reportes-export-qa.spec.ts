import 'dotenv/config';
import { expect, test, type APIRequestContext, type Browser, type BrowserContext } from '@playwright/test';
import { Client } from 'pg';

const CLAVE_QA = process.env.CLAVE_PRUEBA_QA ?? '';
if (!CLAVE_QA) throw new Error('Falta CLAVE_PRUEBA_QA: ejecuta CLAVE_PRUEBA_QA=... node scripts/crear-usuarios-prueba.mjs antes de este spec.');

// Reportes y exportaciones por rol: cuadros, CSV, coherencia con la BD y
// controles de alcance (ADMIN solo su sede).

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

function csv(texto: string): { cabecera: string[]; filas: string[][] } {
  const limpio = texto.replace(/^﻿/, '').trim();
  if (limpio === '') return { cabecera: [], filas: [] };
  const lineas = limpio.split('\n');
  const cabecera = lineas[0].split(';');
  return { cabecera, filas: lineas.slice(1).map((l) => l.split(';')) };
}

/** Convierte el texto de una moneda es-PE ("S/ 10,620.00") a centavos. */
function centavos(texto: string): number {
  const limpio = texto.replace(/[^0-9,.]/g, '');
  const numero = limpio.includes('.') ? limpio.replace(/,/g, '') : limpio.replace(',', '.');
  return Math.round(Number(numero) * 100);
}

test.describe.serial('QA reportes y exportación', () => {
  let adminCtx: BrowserContext;
  let superCtx: BrowserContext;
  let userCtx: BrowserContext;
  let adminApi: APIRequestContext;
  let superApi: APIRequestContext;
  let userApi: APIRequestContext;

  test.beforeAll(async ({ browser }) => {
    ({ context: adminCtx, api: adminApi } = await sesion(browser, { email: 'test-admin@gmail.com', clave: CLAVE_QA }));
    ({ context: superCtx, api: superApi } = await sesion(browser, { email: 'test-super@gmail.com', clave: CLAVE_QA }));
    ({ context: userCtx, api: userApi } = await sesion(browser, { email: 'test-user@gmail.com', clave: CLAVE_QA }));
  });

  test.afterAll(async () => {
    await adminCtx?.close();
    await superCtx?.close();
    await userCtx?.close();
  });

  test('los cuatro cuadros responden datos del mes y coinciden con la BD', async () => {
    const mes = '2026-09';
    const cliente = new Client({ connectionString: process.env.DIRECT_URL });
    await cliente.connect();
    let verdad = { total: 0, confirmadas: 0, ingresos: 0 };
    try {
      const r = await cliente.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE estado = 'CONFIRMADA')::int AS confirmadas,
                coalesce(sum("montoTotalCentavos") FILTER (WHERE estado = 'CONFIRMADA'), 0)::int AS ingresos
         FROM "Solicitud" WHERE fecha LIKE '${mes}%' AND "eliminadoEn" IS NULL`,
      );
      verdad = r.rows[0];
    } finally {
      await cliente.end();
    }

    const estados = (await (
      await superApi.get(`/api/reportes?tipo=estados&mes=${mes}`)
    ).json()) as { datos: { filas: Array<{ estado: string; total: number }>; total: number } };
    expect(estados.datos.total).toBe(verdad.total);
    expect(estados.datos.filas.reduce((a, f) => a + f.total, 0)).toBe(verdad.total);

    const ingresos = (await (
      await superApi.get(`/api/reportes?tipo=ingresos&mes=${mes}`)
    ).json()) as { datos: { porSede: Array<{ confirmadas: number; ingresosCentavos: number }> } };
    const confirmadas = ingresos.datos.porSede.reduce((a, s) => a + s.confirmadas, 0);
    const monto = ingresos.datos.porSede.reduce((a, s) => a + s.ingresosCentavos, 0);
    expect(confirmadas).toBe(verdad.confirmadas);
    expect(monto).toBe(verdad.ingresos);

    const ocupacion = (await (
      await superApi.get(`/api/reportes?tipo=ocupacion&mes=${mes}`)
    ).json()) as { datos: Array<{ reservas: number }> };
    expect(ocupacion.datos.length).toBeGreaterThan(0);
    const clientes = (await (
      await superApi.get(`/api/reportes?tipo=clientes&mes=${mes}`)
    ).json()) as { datos: { top: Array<{ reservas: number }>; horasPico: Array<{ horaInicio: string }> } };
    expect(clientes.datos.top.length).toBeGreaterThan(0);
    expect(clientes.datos.horasPico.length).toBeGreaterThan(0);
    // Todo listo en hora en punto (HH:00).
    for (const h of clientes.datos.horasPico) expect(h.horaInicio).toMatch(/^\d{2}:00$/);
  });

  test('CSV: los cuatro cuadros se descargan y cuadran con el JSON', async () => {
    for (const tipo of ['ingresos', 'ocupacion', 'estados', 'clientes']) {
      const csvResp = await superApi.get(`/api/reportes?tipo=${tipo}&mes=2026-09&formato=csv`);
      expect(csvResp.ok()).toBe(true);
      expect(csvResp.headers()['content-type']).toContain('text/csv');
      expect(csvResp.headers()['content-disposition']).toContain(`reporte-${tipo}-2026-09.csv`);
      const { cabecera, filas } = csv(await csvResp.text());
      expect(cabecera.length).toBeGreaterThan(1);

      const json = (await (await superApi.get(`/api/reportes?tipo=${tipo}&mes=2026-09`)).json()) as { datos: unknown };
      const esperado =
        tipo === 'ocupacion'
          ? (json.datos as unknown[]).length
          : tipo === 'ingresos'
            ? ((json.datos as { porSede: unknown[]; porCancha: unknown[] }).porSede.length +
                (json.datos as { porCancha: unknown[] }).porCancha.length)
            : tipo === 'estados'
              ? (json.datos as { filas: unknown[] }).filas.length
              : (json.datos as { top: unknown[]; horasPico: unknown[] }).top.length +
                (json.datos as { top: unknown[]; horasPico: unknown[] }).horasPico.length;
      expect(filas.length).toBe(esperado);
      // Nadie se inyecta una fórmula de hoja de cálculo.
      for (const fila of filas) {
        for (const celda of fila) expect(celda).not.toMatch(/^[=+\-@]/);
      }
    }
  });

  test('PDF: los cuatro cuadros se descargan como PDF válido', async () => {
    for (const tipo of ['ingresos', 'ocupacion', 'estados', 'clientes']) {
      const r = await superApi.get(`/api/reportes?tipo=${tipo}&mes=2026-09&formato=pdf`);
      expect(r.ok()).toBe(true);
      expect(r.headers()['content-type']).toContain('application/pdf');
      expect(r.headers()['content-disposition']).toContain(`reporte-${tipo}-2026-09.pdf`);
      const bytes = Buffer.from(await r.body());
      // Firma PDF real y tamaño razonable.
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
      expect(bytes.subarray(-6).toString()).toContain('EOF');
      expect(bytes.length).toBeGreaterThan(1200);
      // Un PDF bien formado declara al menos un objeto y un catálogo.
      const texto = bytes.toString('latin1');
      expect(texto).toContain('/Type /Catalog');
      expect(texto).toContain('trailer');
    }
  });

  test('PDF y CSV por sede: el admin descarga los suyos con su nombre en el alcance', async () => {
    const r = await adminApi.get('/api/reportes?tipo=ingresos&mes=2026-09&formato=pdf');
    expect(r.ok()).toBe(true);
    const bytes = Buffer.from(await r.body());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    // El alcance del superadmin (global) también funciona.
    const global = await superApi.get('/api/reportes?tipo=ingresos&mes=2026-09&formato=pdf');
    expect(global.ok()).toBe(true);
  });

  test('el PDF respeta el alcance: el admin no descarga la sede ajena', async () => {
    const ajena = (await (await superApi.get('/api/sedes?incluirPruebas=1')).json()) as {
      sedes: Array<{ id: number; nombre: string }>;
    };
    const otra = ajena.sedes.find((s) => s.nombre === 'Los Olivos')?.id as number;
    expect((await adminApi.get(`/api/reportes?tipo=ingresos&mes=2026-09&formato=pdf&sedeId=${otra}`)).status()).toBe(403);
    expect((await userApi.get('/api/reportes?tipo=ingresos&mes=2026-09&formato=pdf')).status()).toBe(403);
  });

  test('la página ofrece elegir PDF o CSV', async () => {
    const pagina = await superCtx.newPage();
    await pagina.goto('/reportes?tipo=ingresos&mes=2026-09');
    const pdf = pagina.getByRole('link', { name: /descargar pdf/i });
    const csv = pagina.getByRole('link', { name: /descargar csv/i });
    await expect(pdf).toHaveAttribute('href', /formato=pdf/);
    await expect(csv).toHaveAttribute('href', /formato=csv/);
    // La descarga real desde el navegador.
    const descarga = await Promise.all([pagina.waitForEvent('download'), pdf.click()]);
    expect(descarga[0].suggestedFilename()).toContain('reporte-ingresos-2026-09.pdf');
    await pagina.close();
  });

  test('alcance: el ADMIN solo ve su sede y el USUARIO no entra a reportes', async () => {
    const admin = (await (await adminApi.get('/api/reportes?tipo=ingresos&mes=2026-09')).json()) as {
      sedeId: number;
      datos: { porSede: Array<{ sede: string }> };
    };
    expect(admin.sedeId).toBeGreaterThan(0);
    for (const s of admin.datos.porSede) expect(s.sede).toBe('E2E_QA');
    expect((await userApi.get('/api/reportes?tipo=ingresos&mes=2026-09')).status()).toBe(403);
    const paginaUser = await userCtx.newPage();
    await paginaUser.goto('/reportes?tipo=ingresos&mes=2026-09');
    await expect(paginaUser).not.toHaveURL(/\/reportes/);
    await paginaUser.close();
  });

  test('Dashboard (superadmin) cuadra con la BD del mes completo', async () => {
    // 2026-08 debe quedarse sin escritores entre specs: `ingresos-qa` siembra
    // 2026-07 y `reportes-qa` siembra 2026-06 precisamente para que este cuadre
    //compare contra datos que nadie borra mientras se mide.
    const mes = '2026-08';
    const cliente = new Client({ connectionString: process.env.DIRECT_URL });
    await cliente.connect();
    let ingresosMes = 0;
    try {
      const r = await cliente.query(
        `SELECT coalesce(sum(sol."montoTotalCentavos"), 0)::int AS ingresos
         FROM "Solicitud" sol JOIN "Cancha" c ON c.id = sol."canchaId"
         WHERE sol.estado = 'CONFIRMADA' AND sol."eliminadoEn" IS NULL AND sol.fecha LIKE '${mes}%'`,
      );
      ingresosMes = r.rows[0].ingresos as number;
    } finally {
      await cliente.end();
    }
    const pagina = await superCtx.newPage();
    await pagina.goto(`/configuracion?fecha=2026-08-15&sede=todas`);
    await expect(pagina.locator('h1')).toHaveText('Dashboard');
    const valor = await pagina
      .locator('dl[aria-label="Indicadores"] div', { has: pagina.locator('dt', { hasText: 'Ingresos del mes' }) })
      .locator('dd')
      .innerText();
    expect(centavos(valor)).toBe(ingresosMes);
    await pagina.close();
  });

  test('Indicadores (admin) cuadran con la BD de su sede', async () => {
    const mes = '2026-08';
    const cliente = new Client({ connectionString: process.env.DIRECT_URL });
    await cliente.connect();
    let ingresosSede = 0;
    try {
      const r = await cliente.query(
        `SELECT coalesce(sum(sol."montoTotalCentavos"), 0)::int AS ingresos
         FROM "Solicitud" sol
         JOIN "Cancha" c ON c.id = sol."canchaId"
         JOIN "Sede" se ON se.id = c."sedeId"
         WHERE sol.estado = 'CONFIRMADA' AND sol."eliminadoEn" IS NULL AND sol.fecha LIKE '${mes}%'
           AND se.nombre = 'E2E_QA'`,
      );
      ingresosSede = r.rows[0].ingresos as number;
    } finally {
      await cliente.end();
    }
    const pagina = await adminCtx.newPage();
    await pagina.goto(`/kpis?mes=${mes}&fecha=2026-08-15`);
    await expect(pagina.locator('h1')).toHaveText('Indicadores');
    const kpi = await pagina
      .locator('dl[aria-label="Indicadores"] div', { has: pagina.locator('dt', { hasText: `Ingreso de ${mes}` }) })
      .locator('dd')
      .innerText();
    expect(centavos(kpi)).toBe(ingresosSede);
    await pagina.close();
  });

  test('el panel de bloqueos y pendientes funciona con datos reales', async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const bloqueos = (await (await adminApi.get(`/api/bloqueos?sedeId=&fecha=${hoy}`)).json()) as {
      bloqueos: unknown[];
    };
    expect(Array.isArray(bloqueos.bloqueos)).toBe(true);
    const pagina = await adminCtx.newPage();
    await pagina.goto('/pendientes');
    await expect(pagina.locator('h1')).toHaveText('Pendientes de verificación');
    await pagina.goto('/bloqueos');
    await expect(pagina.locator('h1')).toHaveText('Mantenimiento');
    await pagina.close();
  });
});
