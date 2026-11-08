'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InsigniaEstado } from '@/components/estado/InsigniaEstado';
import { CuentaAtras } from '@/components/estado/CuentaAtras';

export type CeldaGrilla = {
  solicitudId?: number;
  canchaId: number;
  cancha: string;
  horaInicio: string;
  horaFin: string;
  estado: string;
  motivo?: string | null;
  limiteHold?: string | null;
};

/**
 * Grilla diaria por cancha con cuenta atrás en holds. Con `puedeConfirmar`,
 * las filas PENDIENTE muestran el botón Confirmar (ADMIN/SUPERADMIN; el
 * alcance por sede ya viene filtrado del servidor y la API lo exige).
 */
export function GrillaDiaria({
  celdas,
  forzarMovil = false,
  puedeConfirmar = false,
}: {
  celdas: CeldaGrilla[];
  forzarMovil?: boolean;
  puedeConfirmar?: boolean;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const [confirmadas, setConfirmadas] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  if (celdas.length === 0) return <p role="status">Sin reservas confirmadas para este día.</p>;

  async function confirmar(solicitudId: number) {
    setConfirmando(solicitudId);
    setError(null);
    try {
      const r = await fetch(`/api/solicitudes/${solicitudId}/confirmar`, { method: 'POST' });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo confirmar la reserva');
      setConfirmadas((v) => (v.includes(solicitudId) ? v : [...v, solicitudId]));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo');
    } finally {
      setConfirmando(null);
    }
  }

  return (
    <section data-vista="auto" data-forzar-movil={forzarMovil ? 'si' : undefined} aria-label="Grilla diaria">
      {error ? <p role="alert">{error}</p> : null}
      <table>
        <thead>
          <tr>
            <th scope="col">Cancha</th>
            <th scope="col">Hora</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          {celdas.map((c, i) => {
            const estado = c.solicitudId != null && confirmadas.includes(c.solicitudId) ? 'CONFIRMADA' : c.estado;
            const pendiente = estado === 'PENDIENTE' && !(c.solicitudId != null && confirmadas.includes(c.solicitudId));
            return (
              <tr key={c.solicitudId ?? i}>
                <th scope="row">{c.cancha}</th>
                <td>
                  {c.horaInicio}–{c.horaFin}
                </td>
                <td>
                  <InsigniaEstado estado={estado} motivo={c.motivo ?? undefined} interno={puedeConfirmar} />
                  {pendiente && c.limiteHold ? (
                    <>
                      {' '}
                      <span className="grilla-vencimiento">
                        3 h para confirmar · <CuentaAtras limiteIso={c.limiteHold} />
                      </span>
                    </>
                  ) : null}
                  {puedeConfirmar && pendiente && c.solicitudId != null ? (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="boton boton-primario"
                        disabled={confirmando === c.solicitudId}
                        onClick={() => void confirmar(c.solicitudId as number)}
                      >
                        {confirmando === c.solicitudId ? 'Confirmando…' : 'Confirmar'}
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
