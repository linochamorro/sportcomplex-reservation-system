import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from '../auth/sesion';
import { extensionDeRuta } from './comprobantes';

// Almacenamiento de comprobantes (B-04). Selector fail-closed por entorno:
// en producción exige Supabase configurado; nunca degrada en silencio.

export const PROPOSITOS = ['pago', 'reembolso'] as const;
export type Proposito = (typeof PROPOSITOS)[number];

export const MENSAJE_PROPOSITO_INVALIDO = 'El propósito debe ser "pago" o "reembolso"';
export const MENSAJE_RUTA_INVALIDA = 'La ruta del comprobante no es válida';
export const MENSAJE_ALMACENAMIENTO_NO_CONFIGURADO = 'Almacenamiento de comprobantes no configurado';

const PATRON_RUTA = /^comprobantes\/(pago|reembolso)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|pdf)$/;

export interface Almacenamiento {
  firmarRuta(proposito: Proposito, extension: string): string;
  subir(ruta: string, bytes: Buffer, contentType: string): Promise<string>;
  descargar(ruta: string): Promise<{ bytes: Buffer; contentType: string | null }>;
}

export function rutaValida(ruta: string, proposito: Proposito): boolean {
  const m = PATRON_RUTA.exec(ruta);
  return m !== null && m[1] === proposito;
}

export function generarRuta(proposito: Proposito, extension: string): string {
  if (proposito !== 'pago' && proposito !== 'reembolso') throw new HttpError(400, MENSAJE_PROPOSITO_INVALIDO);
  const ext = extension.replace(/^\./, '').toLowerCase();
  if (!['jpg', 'jpeg', 'png', 'pdf'].includes(ext)) throw new HttpError(400, MENSAJE_RUTA_INVALIDA);
  return `comprobantes/${proposito}/${randomUUID()}.${ext}`;
}

/** Almacenamiento en memoria para test/desarrollo. */
export class AlmacenamientoLocal implements Almacenamiento {
  private readonly objetos = new Map<string, { bytes: Buffer; contentType: string }>();

  firmarRuta(proposito: Proposito, extension: string): string {
    return generarRuta(proposito, extension);
  }

  async subir(ruta: string, bytes: Buffer, contentType: string): Promise<string> {
    this.objetos.set(ruta, { bytes, contentType });
    return ruta;
  }

  async descargar(ruta: string): Promise<{ bytes: Buffer; contentType: string | null }> {
    const obj = this.objetos.get(ruta);
    if (!obj) throw new HttpError(404, 'El comprobante no existe en el almacenamiento');
    return { bytes: obj.bytes, contentType: obj.contentType };
  }
}

export class AlmacenamientoSupabase implements Almacenamiento {
  private readonly cliente: SupabaseClient;

  constructor(url: string, clave: string, private readonly bucket: string) {
    this.cliente = createClient(url, clave, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  firmarRuta(proposito: Proposito, extension: string): string {
    return generarRuta(proposito, extension);
  }

  async subir(ruta: string, bytes: Buffer, contentType: string): Promise<string> {
    if (!PATRON_RUTA.test(ruta)) throw new HttpError(400, MENSAJE_RUTA_INVALIDA);
    const { error } = await this.cliente.storage.from(this.bucket).upload(ruta, bytes, {
      contentType,
      cacheControl: '31536000, immutable',
      upsert: false,
    });
    if (error) throw new HttpError(503, 'No se pudo guardar el comprobante');
    return ruta;
  }

  async descargar(ruta: string): Promise<{ bytes: Buffer; contentType: string | null }> {
    if (!PATRON_RUTA.test(ruta)) throw new HttpError(400, MENSAJE_RUTA_INVALIDA);
    const { data, error } = await this.cliente.storage.from(this.bucket).download(ruta);
    if (error || !data) throw new HttpError(404, 'El comprobante no existe en el almacenamiento');
    return {
      bytes: Buffer.from(await data.arrayBuffer()),
      contentType: data.type || null,
    };
  }
}

let localCompartido: AlmacenamientoLocal | null = null;
let supabaseCompartido: AlmacenamientoSupabase | null = null;

/**
 * Selector perezoso y fail-closed (OBS-C/H-01/F-06). Solo `development` y
 * `test` usan almacenamiento local; cualquier otro entorno (production,
 * staging, preview, NODE_ENV ausente) exige Supabase completo o falla antes
 * de tocar red/DB (nunca degrada en silencio).
 */
export function obtenerAlmacenamiento(): Almacenamiento {
  const entorno = process.env.NODE_ENV;
  const esLocalPermitido = entorno === 'development' || entorno === 'test';
  if (!esLocalPermitido) {
    const url = process.env.SUPABASE_URL;
    const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET;
    if (!url || !clave || !bucket) {
      throw new HttpError(503, MENSAJE_ALMACENAMIENTO_NO_CONFIGURADO);
    }
    if (!supabaseCompartido) supabaseCompartido = new AlmacenamientoSupabase(url, clave, bucket);
    return supabaseCompartido;
  }
  if (!localCompartido) localCompartido = new AlmacenamientoLocal();
  return localCompartido;
}

export { extensionDeRuta };
