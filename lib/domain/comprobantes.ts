import { HttpError } from '../auth/sesion';

// Dominio puro de comprobantes (B-04). Triple coherencia extensión ↔
// content-type ↔ cabecera real; el servidor nunca confía en la metadata.

export const MAX_COMPROBANTE_BYTES = 5 * 1024 * 1024;

export const TIPOS_COMPROBANTE = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type TipoComprobante = 'JPEG' | 'PNG' | 'PDF';

export const MENSAJE_ARCHIVO_VACIO = 'El comprobante está vacío';
export const MENSAJE_ARCHIVO_GRANDE = 'El comprobante no puede superar los 5 MB';
export const MENSAJE_TAMANO_NO_COINCIDE = 'El tamaño declarado del comprobante no coincide con el real';
export const MENSAJE_EXTENSION_INVALIDA = 'El archivo debe terminar en .jpg, .jpeg, .png o .pdf';
export const MENSAJE_TIPO_INVALIDO = 'El comprobante debe ser JPG, PNG o PDF';
export const MENSAJE_TIPO_NO_COINCIDE = 'El tipo declarado no coincide con la extensión';
export const MENSAJE_CONTENIDO_NO_COINCIDE = 'El contenido del comprobante no coincide con el tipo declarado';

/** Cabeceras (magic numbers): JPEG FF D8 FF, PNG 89 50 4E 47..., PDF %PDF. */
export function detectarTipoPorCabecera(bytes: Buffer): TipoComprobante | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'JPEG';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'PNG';
  }
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'PDF';
  }
  return null;
}

function tipoPorExtension(nombre: string): TipoComprobante | null {
  const ext = extensionDeRuta(nombre);
  if (ext === 'jpg' || ext === 'jpeg') return 'JPEG';
  if (ext === 'png') return 'PNG';
  if (ext === 'pdf') return 'PDF';
  return null;
}

export function tipoPorContentType(contentType: string): TipoComprobante | null {
  if (contentType === 'image/jpeg') return 'JPEG';
  if (contentType === 'image/png') return 'PNG';
  if (contentType === 'application/pdf') return 'PDF';
  return null;
}

export function extensionDeRuta(ruta: string): string {
  const punto = ruta.lastIndexOf('.');
  return punto >= 0 ? ruta.slice(punto + 1).toLowerCase() : '';
}

/** Valida bytes contra la metadata declarada; devuelve el tipo detectado. */
export function validarComprobanteBytes(
  bytes: Buffer,
  declarado: { nombreArchivo: string; contentType: string; tamanoBytes: number },
): { tipo: TipoComprobante; tamanoBytes: number } {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new HttpError(400, MENSAJE_ARCHIVO_VACIO);
  if (bytes.length > MAX_COMPROBANTE_BYTES) throw new HttpError(400, MENSAJE_ARCHIVO_GRANDE);
  if (declarado.tamanoBytes !== bytes.length) throw new HttpError(400, MENSAJE_TAMANO_NO_COINCIDE);
  const porExtension = tipoPorExtension(declarado.nombreArchivo);
  if (porExtension === null) throw new HttpError(400, MENSAJE_EXTENSION_INVALIDA);
  const porContentType = tipoPorContentType(declarado.contentType);
  if (porContentType === null) throw new HttpError(400, MENSAJE_TIPO_INVALIDO);
  if (porExtension !== porContentType) throw new HttpError(400, MENSAJE_TIPO_NO_COINCIDE);
  const detectado = detectarTipoPorCabecera(bytes);
  if (detectado === null || detectado !== porContentType) throw new HttpError(400, MENSAJE_CONTENIDO_NO_COINCIDE);
  return { tipo: detectado, tamanoBytes: bytes.length };
}

/** Forma de base64 (alfabeto, relleno y longitud múltiplo de 4). */
export function esBase64BienFormado(valor: unknown): valor is string {
  if (typeof valor !== 'string' || valor.length === 0) return false;
  const compacto = valor.replace(/\s+/g, '');
  if (compacto.length === 0 || compacto.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compacto)) return false;
  return true;
}

/** Tamaño decodificado estimado de un base64 (BLQ-3), sin decodificar. */
export function tamanoDecodificadoBase64(valor: string): number {
  const compacto = valor.replace(/\s+/g, '');
  const relleno = (compacto.match(/=+$/)?.[0].length ?? 0);
  return Math.floor((compacto.length * 3) / 4) - relleno;
}
