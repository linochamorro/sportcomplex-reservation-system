import type { NextRequest } from 'next/server';

/** Tope por defecto para cuerpos con comprobante en base64 (5 MB → ~6.7 MB). */
export const MAX_CUERPO_COMPROBANTE = 8 * 1024 * 1024;

/** Lee el cuerpo en streaming con tope; null si excede el límite. */
export async function leerCuerpoAcotado(
  peticion: NextRequest,
  maximo = MAX_CUERPO_COMPROBANTE,
): Promise<string | null> {
  const lector = peticion.body?.getReader();
  if (!lector) return '';
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximo) {
      await lector.cancel().catch(() => undefined);
      return null;
    }
    trozos.push(value);
  }
  return Buffer.concat(trozos.map((t) => Buffer.from(t))).toString('utf8');
}
