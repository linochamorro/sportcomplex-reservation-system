import { describe, expect, it, vi } from 'vitest';
import { jsonError } from '../http';
import { HttpError } from '../sesion';

async function cuerpo(respuesta: Response): Promise<Record<string, unknown>> {
  return (await respuesta.json()) as Record<string, unknown>;
}

describe('jsonError (frontera de la API)', () => {
  it('un HttpError 4xx conserva su mensaje y no añade campos', async () => {
    const r = jsonError(new HttpError(403, 'No es tu sede'));
    expect(r.status).toBe(403);
    expect(await cuerpo(r)).toEqual({ error: 'No es tu sede' });
  });

  it('un HttpError 503 conserva el 503 en vez de degradarlo a 500', async () => {
    const r = jsonError(new HttpError(503, 'Correo no configurado'));
    expect(r.status).toBe(503);
    const c = await cuerpo(r);
    expect(c.codigo).toBe('ERROR_DE_DOMINIO');
    expect(c.reintentable).toBe(true);
    // El mensaje del dominio no sale: puede describir configuración interna.
    expect(c.error).toBe('Error interno');
    expect(JSON.stringify(c)).not.toContain('Correo no configurado');
  });

  it('un HttpError 500 no se marca reintentable', () => {
    const r = jsonError(new HttpError(500, 'Configuración de sesión ausente'));
    expect(r.status).toBe(500);
  });

  it('un transitorio de base → 503 con código estable y reintentable', async () => {
    const r = jsonError(Object.assign(new Error('pool exhausted'), { code: 'P2024' }));
    expect(r.status).toBe(503);
    expect(await cuerpo(r)).toEqual({
      error: 'El servicio no puede atender ahora. Inténtalo en unos segundos.',
      codigo: 'DB_NO_DISPONIBLE',
      reintentable: true,
    });
  });

  it('un conflicto de unicidad → 409 en vez de 500', async () => {
    const r = jsonError(Object.assign(new Error('unique'), { code: 'P2002' }));
    expect(r.status).toBe(409);
    expect((await cuerpo(r)).codigo).toBe('CONFLICTO_UNICO');
  });

  it('un error desconocido → 500 sin detalle y sin reintento', async () => {
    const r = jsonError(new Error('boom con secretazo INTERNO'));
    expect(r.status).toBe(500);
    const c = await cuerpo(r);
    expect(c.error).toBe('Error interno');
    expect(c.reintentable).toBe(false);
    expect(JSON.stringify(c)).not.toContain('secretazo');
  });

  it('el log lleva código y nombre, nunca el mensaje del driver', () => {
    const espia = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      jsonError(Object.assign(new Error('postgresql://u:clave@host/db'), { code: 'P1001' }));
      expect(espia).toHaveBeenCalledTimes(1);
      const registrado = espia.mock.calls[0][0] as string;
      expect(registrado).toContain('"evento":"error_transitorio"');
      expect(registrado).toContain('"codigo":"DB_NO_DISPONIBLE"');
      expect(registrado).not.toContain('clave');
      expect(registrado).not.toContain('postgresql://');
    } finally {
      espia.mockRestore();
    }
  });
});
