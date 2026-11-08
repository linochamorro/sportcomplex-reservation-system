'use client';

import { useState } from 'react';
import { InsigniaEstado } from '@/components/estado/InsigniaEstado';
import { CuentaAtras } from '@/components/estado/CuentaAtras';

export type Pendiente = {
  id: number;
  fecha: string;
  horaInicio: string;
  limiteHold: string | null;
  montoTotalCentavos: number;
  canchaNombre?: string;
};

/** Panel de pendientes con confirmar/rechazar optimista y reversión. */
export function PanelPendientes({ iniciales }: { iniciales: Pendiente[] }) {
  const [lista, setLista] = useState(iniciales);
  const [error, setError] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');

  async function confirmar(id: number) {
    const previas = lista;
    setLista((l) => l.filter((s) => s.id !== id));
    setError(null);
    try {
      const r = await fetch(`/api/solicitudes/${id}/confirmar`, { method: 'POST' });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? 'No se pudo confirmar');
      }
    } catch (e) {
      setLista(previas);
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  async function rechazar(id: number) {
    if (motivo.trim().length === 0) {
      setError('El motivo es obligatorio (1–500)');
      return;
    }
    const previas = lista;
    setLista((l) => l.filter((s) => s.id !== id));
    setError(null);
    try {
      const r = await fetch(`/api/solicitudes/${id}/rechazar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ motivo }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? 'No se pudo rechazar');
      }
      setMotivo('');
    } catch (e) {
      setLista(previas);
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  if (lista.length === 0) return <p role="status">Sin pendientes.</p>;
  return (
    <>
      {error ? <div role="alert">{error}</div> : null}
      <label>
        Motivo de rechazo
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder="1–500 caracteres" />
      </label>
      <ul>
        {lista.map((s) => (
          <li key={s.id}>
            <article>
                <h2>
                  {s.fecha} {s.horaInicio} — {s.montoTotalCentavos / 100} soles
                </h2>
                {s.canchaNombre ? <p>{s.canchaNombre}</p> : null}
              <InsigniaEstado estado="PENDIENTE" limiteHoldIso={s.limiteHold} />
              {s.limiteHold ? (
                <p>
                  Vence en <CuentaAtras limiteIso={s.limiteHold} />
                </p>
              ) : null}
              <button type="button" onClick={() => void confirmar(s.id)}>
                Confirmar
              </button>{' '}
              <button type="button" onClick={() => void rechazar(s.id)}>
                Rechazar
              </button>
            </article>
          </li>
        ))}
      </ul>
    </>
  );
}
