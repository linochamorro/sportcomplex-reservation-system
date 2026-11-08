import type { IdEstadoDominio, IdEstadoSync } from '@/lib/design-tokens';

/**
 * Iconos vectoriales de la gramática de estados (reemplazan el marcador de
 * texto `[Clock]`/`[LockOpen]`). Trazo 1.75, caja 16x16, `currentColor`.
 */

const trazo = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

type Props = { id: IdEstadoDominio | IdEstadoSync; className?: string };

export function IconoEstado({ id, className }: Props) {
  const comun = { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true, focusable: false, className } as const;
  switch (id) {
    case 'pendiente':
      return (
        <svg {...comun}>
          <circle cx="8" cy="8" r="6.25" {...trazo} />
          <path d="M8 4.5V8l2.25 1.5" {...trazo} />
        </svg>
      );
    case 'confirmada':
      return (
        <svg {...comun}>
          <circle cx="8" cy="8" r="6.25" fill="currentColor" stroke="none" />
          <path d="M5.25 8.25l1.9 1.9 3.6-4.1" fill="none" stroke="var(--estado-icono-contraste, #fff)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'rechazada':
      return (
        <svg {...comun}>
          <circle cx="8" cy="8" r="6.25" {...trazo} />
          <path d="M5.75 5.75l4.5 4.5M10.25 5.75l-4.5 4.5" {...trazo} />
        </svg>
      );
    case 'liberada':
      return (
        <svg {...comun}>
          <rect x="3.25" y="7" width="9.5" height="6.25" rx="1.25" {...trazo} />
          <path d="M5.5 7V5.25a2.5 2.5 0 014.9-.6" {...trazo} />
        </svg>
      );
    case 'cancelada':
      return (
        <svg {...comun}>
          <circle cx="8" cy="8" r="6.25" {...trazo} />
          <path d="M3.4 12.6L12.6 3.4" {...trazo} />
        </svg>
      );
    case 'no-show':
      return (
        <svg {...comun}>
          <path d="M8 1.9l6.1 11.2H1.9L8 1.9z" fill="currentColor" stroke="none" />
          <path d="M8 6.2v3.1" fill="none" stroke="var(--estado-icono-contraste, #fff)" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="8" cy="11.1" r="0.95" fill="var(--estado-icono-contraste, #fff)" />
        </svg>
      );
    case 'pendiente-envio':
      return (
        <svg {...comun}>
          <path d="M8 10.6V2.4" {...trazo} />
          <path d="M4.9 5.5L8 2.4l3.1 3.1" {...trazo} />
          <path d="M2.9 10.4v2.1a1.1 1.1 0 001.1 1.1h8a1.1 1.1 0 001.1-1.1v-2.1" {...trazo} />
        </svg>
      );
    case 'sincronizando':
      return (
        <svg {...comun}>
          <path d="M13.3 8a5.3 5.3 0 11-1.6-3.8" {...trazo} />
          <path d="M13.6 2.4v3.1h-3.1" {...trazo} />
        </svg>
      );
    case 'conflicto':
      return (
        <svg {...comun}>
          <circle cx="4.6" cy="4" r="1.9" {...trazo} />
          <circle cx="4.6" cy="12" r="1.9" {...trazo} />
          <circle cx="11.4" cy="8" r="1.9" {...trazo} />
          <path d="M6.4 5.2l3.2 1.9M6.4 10.8l3.2-1.9" {...trazo} />
        </svg>
      );
    case 'offline':
      return (
        <svg {...comun}>
          <path d="M1.9 5.6a9 9 0 0112.2 0M4.4 8.3a5.4 5.4 0 017.2 0M6.8 11a2 2 0 012.4 0" {...trazo} />
          <path d="M2.4 2.4l11.2 11.2" {...trazo} />
        </svg>
      );
  }
}
