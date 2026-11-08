/** JSON defensivo: null/red caída/JSON roto devuelven el defecto, nunca lanzan. */
export async function jsonSeguro<T>(respuesta: Response | null, defecto: T): Promise<T> {
  if (!respuesta) return defecto;
  try {
    if (!respuesta.ok) return defecto;
    return (await respuesta.json()) as T;
  } catch {
    return defecto;
  }
}
