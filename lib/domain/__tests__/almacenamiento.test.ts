// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({
  subir: vi.fn(),
  descargar: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({ upload: supabase.subir, download: supabase.descargar })),
    },
  })),
}));

import {
  AlmacenamientoLocal,
  AlmacenamientoSupabase,
  obtenerAlmacenamiento,
  rutaValida,
} from '../almacenamiento';

const entorno = process.env as Record<string, string | undefined>;
const ORIGINAL = entorno.NODE_ENV;
const ORIGINAL_URL = entorno.SUPABASE_URL;
const ORIGINAL_CLAVE = entorno.SUPABASE_SERVICE_ROLE_KEY;
const ORIGINAL_BUCKET = entorno.SUPABASE_STORAGE_BUCKET;

function restaurar(nombre: string, valor: string | undefined): void {
  if (valor === undefined) delete entorno[nombre];
  else entorno[nombre] = valor;
}

afterEach(() => {
  restaurar('NODE_ENV', ORIGINAL);
  restaurar('SUPABASE_URL', ORIGINAL_URL);
  restaurar('SUPABASE_SERVICE_ROLE_KEY', ORIGINAL_CLAVE);
  restaurar('SUPABASE_STORAGE_BUCKET', ORIGINAL_BUCKET);
});

describe('selector de almacenamiento fail-closed (B-04/F-06)', () => {
  it('development/test usan local', () => {
    entorno.NODE_ENV = 'test';
    expect(obtenerAlmacenamiento()).toBeInstanceOf(AlmacenamientoLocal);
    entorno.NODE_ENV = 'development';
    expect(obtenerAlmacenamiento()).toBeInstanceOf(AlmacenamientoLocal);
  });

  it('production usa Supabase cuando está configurado', () => {
    entorno.NODE_ENV = 'production';
    entorno.SUPABASE_URL = 'https://proyecto.supabase.co';
    entorno.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba';
    entorno.SUPABASE_STORAGE_BUCKET = 'comprobantes';
    expect(obtenerAlmacenamiento()).toBeInstanceOf(AlmacenamientoSupabase);
  });

  it('production/staging/ausente exige configuración y falla cerrado', () => {
    delete entorno.SUPABASE_URL;
    delete entorno.SUPABASE_SERVICE_ROLE_KEY;
    delete entorno.SUPABASE_STORAGE_BUCKET;
    for (const valor of ['production', 'staging', undefined]) {
      if (valor === undefined) delete entorno.NODE_ENV;
      else entorno.NODE_ENV = valor;
      expect(() => obtenerAlmacenamiento()).toThrow(/no configurado|pendiente/i);
    }
  });

  it('Supabase sube y descarga bytes con content-type privado', async () => {
    supabase.subir.mockResolvedValue({ error: null });
    supabase.descargar.mockResolvedValue({
      data: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      error: null,
    });
    const almacenamiento = new AlmacenamientoSupabase('https://proyecto.supabase.co', 'clave', 'privado');
    const bytes = Buffer.from([1, 2, 3]);
    const ruta = almacenamiento.firmarRuta('pago', 'jpg');
    expect(await almacenamiento.subir(ruta, bytes, 'image/jpeg')).toBe(ruta);
    const descargado = await almacenamiento.descargar(ruta);
    expect(descargado.bytes).toEqual(bytes);
    expect(descargado.contentType).toBe('image/png');
  });

  it('rutaValida exige namespace correcto', () => {
    const ruta = 'comprobantes/pago/123e4567-e89b-42d3-a456-426614174000.jpg';
    expect(rutaValida(ruta, 'pago')).toBe(true);
    expect(rutaValida(ruta, 'reembolso')).toBe(false);
    expect(rutaValida('../etc/passwd', 'pago')).toBe(false);
  });
});
