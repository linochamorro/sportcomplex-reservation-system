'use client';

import { useEffect, useState } from 'react';

type Notificacion = { id: number; titulo: string; cuerpo: string; leida: boolean; creadoEn: string };

const INTERVALO_MS = 45_000;

/** Centro de notificaciones con polling y marca de lectura. */
export function CentroNotificaciones() {
  const [lista, setLista] = useState<Notificacion[]>([]);
  const [estado, setEstado] = useState<'actualizando' | 'lista' | 'sin-conexion'>('actualizando');

  useEffect(() => {
    let viva = true;
    const cargar = async () => {
      try {
        const r = await fetch('/api/notificaciones', { cache: 'no-store' });
        if (!r.ok) throw new Error('http');
        const j = (await r.json()) as { notificaciones: Notificacion[] };
        if (viva) {
          setLista(j.notificaciones);
          setEstado('lista');
        }
      } catch {
        if (viva) setEstado('sin-conexion');
      }
    };
    void cargar();
    const id = setInterval(cargar, INTERVALO_MS);
    return () => {
      viva = false;
      clearInterval(id);
    };
  }, []);

  async function marcarLeida(idNotificacion: number) {
    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ops: [
            {
              clienteOpId: crypto.randomUUID(),
              tipo: 'notificacion.leer',
              carga: { notificacionId: idNotificacion },
            },
          ],
        }),
      });
      setLista((prev) => prev.map((n) => (n.id === idNotificacion ? { ...n, leida: true } : n)));
    } catch {
      setEstado('sin-conexion');
    }
  }

  if (estado === 'actualizando') return <p role="status">Actualizando…</p>;
  return (
    <>
      <p role="status">{estado === 'sin-conexion' ? 'Sin conexión: reintentando' : `Actualizado: ${lista.length} avisos`}</p>
      {lista.length === 0 ? (
        <p>Sin notificaciones</p>
      ) : (
        <ul>
          {lista.map((n) => (
            <li key={n.id}>
              <article>
                <h2>
                  {n.titulo} {n.leida ? '' : '(nueva)'}
                </h2>
                <p>{n.cuerpo}</p>
                {!n.leida ? <button type="button" onClick={() => void marcarLeida(n.id)}>Marcar leída</button> : null}
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
