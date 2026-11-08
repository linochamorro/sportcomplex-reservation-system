const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

type Cabeceras = { get(nombre: string): string | null };

function primerValor(cabecera: string | null): string | null {
  return cabecera?.split(',')[0]?.trim() || null;
}

export function origenPermitido(
  metodo: string,
  cabeceras: Cabeceras,
  hostSolicitud?: string,
): boolean {
  if (METODOS_SEGUROS.has(metodo.toUpperCase())) return true;
  if (cabeceras.get('sec-fetch-site') === 'cross-site') return false;
  const origen = cabeceras.get('origin');
  if (!origen) return false;
  try {
    const urlOrigen = new URL(origen);
    if (urlOrigen.protocol !== 'http:' && urlOrigen.protocol !== 'https:') return false;
    const esperado =
      primerValor(cabeceras.get('x-forwarded-host')) ??
      primerValor(cabeceras.get('host')) ??
      primerValor(hostSolicitud ?? null);
    return esperado !== null && urlOrigen.host === esperado;
  } catch {
    return false;
  }
}
