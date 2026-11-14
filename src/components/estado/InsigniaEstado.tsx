import { ESTADOS, type IdEstadoDominio, type IdEstadoSync } from '@/lib/design-tokens';
import { CuentaAtras } from '@/components/estado/CuentaAtras';
import { IconoEstado } from '@/components/estado/IconoEstado';

/**
 * Motivos internos (registro de la empresa) que se traducen a un mensaje
 * orientado al cliente en la insignia.
 */
const MOTIVOS_A_MENSAJE: Array<[RegExp, string]> = [
  [
    /exceso de tiempo sin respuesta|liber[óo] la cancha|hold vencido|no confirm[óo]/i,
    'Liberada: la administración no confirmó la reserva dentro de las 3 horas',
  ],
];

export function mensajeParaUsuario(motivo: string | null | undefined): string | null {
  if (!motivo) return null;
  for (const [patron, mensaje] of MOTIVOS_A_MENSAJE) {
    if (patron.test(motivo)) return mensaje;
  }
  return motivo;
}

const MAPA: Record<string, IdEstadoDominio | IdEstadoSync> = {
  PENDIENTE: 'pendiente',
  CONFIRMADA: 'confirmada',
  RECHAZADA: 'rechazada',
  LIBERADA: 'liberada',
  CANCELADA: 'cancelada',
  NO_SHOW: 'no-show',
  'pendiente-envio': 'pendiente-envio',
  sincronizando: 'sincronizando',
  conflicto: 'conflicto',
  offline: 'offline',
};

/** Insignia de estado con los 4 canales (color, icono, patrón, etiqueta). */
export function InsigniaEstado({
  estado,
  cuentaAtras,
  limiteHoldIso,
  motivo,
  interno = false,
}: {
  estado: string;
  /** Cuenta atrás ya calculada; tiene prioridad sobre `limiteHoldIso`. */
  cuentaAtras?: string;
  /** ISO del hold: la insignia inserta la cuenta atrás viva. */
  limiteHoldIso?: string | null;
  motivo?: string;
  /** `true` muestra el motivo literal del registro (uso administrativo). */
  interno?: boolean;
}) {
  const id = MAPA[estado] ?? 'offline';
  const ficha = ESTADOS[id];
  const visible = interno ? (motivo ?? null) : mensajeParaUsuario(motivo);
  let etiqueta = ficha.etiqueta;
  if (ficha.exigeCuentaAtras && cuentaAtras) etiqueta = `Pendiente · vence en ${cuentaAtras}`;
  if (ficha.exigeMotivo && visible) etiqueta = `${etiqueta.split('·')[0].trim()} · ${visible}`;
  // En vista interna (administración) conserva el estado + el motivo literal;
  // en la vista del cliente el mensaje ya explica que está liberada.
  if (id === 'liberada' && visible) etiqueta = interno ? `Liberada · ${visible}` : visible;
  // Sin `cuentaAtras` pero con hold conocido, la cuenta atrás se cuenta en vivo
  // en vez de dejar un texto fijo.
  const viva = ficha.exigeCuentaAtras && !cuentaAtras && Boolean(limiteHoldIso);
  const base = viva ? ficha.etiqueta.split('·')[0].trim() : null;
  return (
    <span
      role="img"
      aria-label={viva ? `${base} · confirmación en curso` : etiqueta}
      data-estado={id}
      data-patron={ficha.patron}
      className="insignia-estado"
      style={{
        background: ficha.relleno,
        color: ficha.texto,
        border: ficha.borde,
        // Los iconos oscuros (confirmada, no-show) llevan glifo claro.
        ['--estado-icono-contraste' as string]: ficha.texto === '#FFFFFF' ? '#FFFFFF' : ficha.relleno,
      }}
    >
      <IconoEstado id={id} className="insignia-estado-icono" />
      <span className="insignia-estado-texto">
        {viva && limiteHoldIso ? (
          <>
            {base} · vence en <CuentaAtras limiteIso={limiteHoldIso} />
          </>
        ) : (
          etiqueta
        )}
      </span>
    </span>
  );
}
