'use client';

import { CuentaAtras } from '@/components/estado/CuentaAtras';
import { InsigniaEstado, mensajeParaUsuario } from '@/components/estado/InsigniaEstado';

export type ReservaResumen = {
  id: number;
  canchaNombre: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  estado: string;
  montoTotalCentavos: number;
  motivo: string | null;
  limiteHold: string | null;
};

const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

export function ListaReservas({ reservas }: { reservas: ReservaResumen[] }) {
  if (reservas.length === 0) return <p role="status">Sin reservas todavía.</p>;
  return (
    <ul className="lista-gestion">
      {reservas.map((r) => (
        <li key={r.id} className="fila-gestion">
          <div>
            <strong>
              {r.canchaNombre} · {r.fecha} · {r.horaInicio}–{r.horaFin}
            </strong>
            <span>
              {soles.format(r.montoTotalCentavos / 100)}
              {r.estado === 'PENDIENTE' ? ' · pendiente de confirmación' : ''}
            </span>
            {r.estado === 'PENDIENTE' && r.limiteHold ? (
              <span>
                La administración tiene 3 horas para confirmar; después la cancha se libera. Vence en{' '}
                <CuentaAtras limiteIso={r.limiteHold} />
              </span>
            ) : null}
            {r.estado === 'LIBERADA' ? (
              <span>{mensajeParaUsuario(r.motivo) ?? 'La cancha se liberó.'}</span>
            ) : null}
            {r.estado === 'RECHAZADA' || r.estado === 'CANCELADA' ? (
              <span>{r.motivo ?? 'Sin detalle.'}</span>
            ) : null}
          </div>
          <InsigniaEstado
            estado={r.estado}
            motivo={r.motivo ?? undefined}
            limiteHoldIso={r.estado === 'PENDIENTE' ? r.limiteHold : null}
          />
        </li>
      ))}
    </ul>
  );
}
