import type { FormEvent } from 'react';

export async function crearCancha(
  evento: FormEvent<HTMLFormElement>,
  sedeId: string,
  recargar: () => Promise<void>,
  setMensaje: (mensaje: string | null) => void,
  setError: (error: string | null) => void,
  setCreando: (creando: boolean) => void,
) {
  evento.preventDefault();
  const forma = evento.currentTarget;
  setMensaje(null);
  setError(null);
  setCreando(true);
  try {
    const datos = new FormData(forma);
    const r = await fetch('/api/canchas', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sedeId: Number(sedeId),
        nombre: String(datos.get('nombre') ?? '').trim(),
        tarifaBaseCentavos: Math.round(Number(datos.get('tarifa')) * 100),
      }),
    });
    const j = (await r.json().catch(() => null)) as { error?: string } | null;
    if (!r.ok) throw new Error(j?.error ?? 'No se pudo crear la cancha');
    await recargar();
    setMensaje('Cancha creada correctamente.');
    forma.reset();
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo');
  } finally {
    setCreando(false);
  }
}
