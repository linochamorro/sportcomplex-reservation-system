import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Red de detección: ninguna ruta protegida puede olvidar su guard.
// (La llamada se verifica en tests vivos/negativos; aquí, presencia.)
const RAIZ_API = join(__dirname, '..', '..', '..', 'app', 'api');
const PUBLICAS = new Set([
  'auth/login/route.ts',
  'auth/register/route.ts',
  'auth/logout/route.ts',
  'auth/recuperar/route.ts',
  // mantenimiento se autentica con Bearer CRON_SECRET, no con cookie de sesión.
  'mantenimiento/route.ts',
]);

function rutas(directorio: string, base = ''): string[] {
  const halladas: string[] = [];
  for (const entrada of readdirSync(directorio)) {
    const ruta = join(directorio, entrada);
    if (statSync(ruta).isDirectory()) halladas.push(...rutas(ruta, `${base}${entrada}/`));
    else if (entrada === 'route.ts') halladas.push(`${base}${entrada}`);
  }
  return halladas;
}

describe('presencia de guards en rutas (A-03/OBS-02)', () => {
  it('toda ruta no pública invoca exigirSesion', () => {
    const todas = rutas(RAIZ_API);
    expect(todas.length).toBeGreaterThan(0);
    const sinGuard = todas.filter((r) => {
      if (PUBLICAS.has(r)) return false;
      const fuente = readFileSync(join(RAIZ_API, r), 'utf8');
      // exigirRol/exigirSede/exigirSedeRecurso delegan en exigirSesion; cualquiera vale.
      return !/exigir(Sesion|Rol|Sede|SedeRecurso)\(/.test(fuente);
    });
    expect(sinGuard).toEqual([]);
  });
});
