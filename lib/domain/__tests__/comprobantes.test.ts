import { describe, expect, it } from 'vitest';
import {
  MAX_COMPROBANTE_BYTES,
  esBase64BienFormado,
  extensionDeRuta,
  tamanoDecodificadoBase64,
  validarComprobanteBytes,
} from '../comprobantes';

function bytes(...valores: number[]): Buffer {
  return Buffer.from(valores);
}

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31);

describe('comprobantes: validación magic-bytes (B-04/AC-01)', () => {
  it('acepta JPEG/PNG/PDF con triple coherencia', () => {
    expect(validarComprobanteBytes(JPEG, { nombreArchivo: 'pago.jpg', contentType: 'image/jpeg', tamanoBytes: JPEG.length }).tipo).toBe('JPEG');
    expect(validarComprobanteBytes(PNG, { nombreArchivo: 'pago.png', contentType: 'image/png', tamanoBytes: PNG.length }).tipo).toBe('PNG');
    expect(validarComprobanteBytes(PDF, { nombreArchivo: 'pago.pdf', contentType: 'application/pdf', tamanoBytes: PDF.length }).tipo).toBe('PDF');
  });

  it('rechaza extensión, tipo o contenido incoherentes', () => {
    expect(() => validarComprobanteBytes(JPEG, { nombreArchivo: 'pago.png', contentType: 'image/jpeg', tamanoBytes: JPEG.length })).toThrow();
    expect(() => validarComprobanteBytes(JPEG, { nombreArchivo: 'pago.jpg', contentType: 'image/png', tamanoBytes: JPEG.length })).toThrow();
    // Contenido no coincide con la extensión.
    expect(() => validarComprobanteBytes(PDF, { nombreArchivo: 'pago.jpg', contentType: 'image/jpeg', tamanoBytes: PDF.length })).toThrow();
  });

  it('rechaza vacío, tamaño declarado distinto y >5 MB', () => {
    expect(() => validarComprobanteBytes(Buffer.alloc(0), { nombreArchivo: 'a.jpg', contentType: 'image/jpeg', tamanoBytes: 0 })).toThrow();
    expect(() => validarComprobanteBytes(JPEG, { nombreArchivo: 'a.jpg', contentType: 'image/jpeg', tamanoBytes: 999 })).toThrow();
    const gigante = Buffer.alloc(MAX_COMPROBANTE_BYTES + 1, 0xff);
    expect(() => validarComprobanteBytes(gigante, { nombreArchivo: 'a.jpg', contentType: 'image/jpeg', tamanoBytes: gigante.length })).toThrow();
  });

  it('esBase64BienFormado y tamaño decodificado (BLQ-3)', () => {
    expect(esBase64BienFormado(Buffer.from('hola').toString('base64'))).toBe(true);
    expect(esBase64BienFormado('no-base64!!')).toBe(false);
    expect(esBase64BienFormado('')).toBe(false);
    // 4 caracteres base64 → 3 bytes.
    expect(tamanoDecodificadoBase64('AAAA')).toBe(3);
    // "AAA=" → 2 bytes; "AA==" → 1 byte.
    expect(tamanoDecodificadoBase64('AAA=')).toBe(2);
    expect(tamanoDecodificadoBase64('AA==')).toBe(1);
  });

  it('extensionDeRuta deriva la extensión de una ruta generada', () => {
    expect(extensionDeRuta('comprobantes/pago/123e4567-e89b-42d3-a456-426614174000.JPG')).toBe('jpg');
    expect(extensionDeRuta('sin-extension')).toBe('');
  });
});
