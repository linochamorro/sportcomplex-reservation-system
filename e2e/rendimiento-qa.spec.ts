import 'dotenv/config';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

const CLAVE_QA = process.env.CLAVE_PRUEBA_QA ?? '';
if (!CLAVE_QA) throw new Error('Falta CLAVE_PRUEBA_QA: ejecuta CLAVE_PRUEBA_QA=... node scripts/crear-usuarios-prueba.mjs antes de este spec.');

// Fase 5: tiempos de carga de páginas clave con la BD cargada (557+ reservas).
// Registra los tiempos reales y exige un umbral generoso anti-flaky (15 s).

const UMBRAL_MS = 15000;

async function contexto(browser: Browser, cred?: { email: string; clave: string }): Promise<BrowserContext> {
  const context = await browser.newContext({ extraHTTPHeaders: { origin: 'http://127.0.0.1:3100' } });
  if (cred) {
    const login = await context.request.post('/api/auth/login', { data: cred });
    expect(login.ok()).toBe(true);
    const valor = /access_token=([^;]+)/.exec(login.headers()['set-cookie'] ?? '')?.[1] ?? '';
    await context.addCookies([{ name: 'access_token', value: valor, domain: '127.0.0.1', path: '/' }]);
  }
  return context;
}

test('tiempos de carga con BD cargada', async ({ browser }) => {
  const userCtx = await contexto(browser, { email: 'test-user@gmail.com', clave: CLAVE_QA });
  const adminCtx = await contexto(browser, { email: 'test-admin@gmail.com', clave: CLAVE_QA });
  const anonCtx = await contexto(browser);
  const mediciones: Array<{ pagina: string; ms: number }> = [];
  try {
    const casos = [
      { pagina: 'portada', context: anonCtx, url: '/' },
      { pagina: 'reservar (usuario)', context: userCtx, url: '/reservar' },
      { pagina: 'dashboard admin', context: adminCtx, url: '/configuracion' },
      { pagina: 'reportes admin', context: adminCtx, url: '/reportes?tipo=ingresos&mes=2026-08' },
      { pagina: 'kpis admin', context: adminCtx, url: '/kpis' },
    ];
    for (const c of casos) {
      const page = await c.context.newPage();
      const inicio = Date.now();
      await page.goto(c.url, { waitUntil: 'domcontentloaded' });
      const ms = Date.now() - inicio;
      mediciones.push({ pagina: c.pagina, ms });
      expect(ms).toBeLessThan(UMBRAL_MS);
      await page.close();
    }
    console.log(`TIEMPOS_MS:${JSON.stringify(mediciones)}`);
  } finally {
    await userCtx.close();
    await adminCtx.close();
    await anonCtx.close();
  }
});
