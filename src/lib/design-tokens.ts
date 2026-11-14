/**
 * Tokens de diseño (DESIGN.md v1.0 §2–§3).
 * Fuente única de valores visuales; `app/globals.css` los espeja como
 * variables CSS y `lib/__tests__/design-tokens.test.ts` impone paridad.
 */

export type PesoIcono = 'fill' | 'regular';

export interface FichaEstado {
  readonly relleno: string;
  readonly texto: string;
  readonly borde: string;
  readonly iconoNombre: string | null;
  readonly iconoPeso: PesoIcono | null;
  readonly patron: string;
  readonly etiqueta: string;
  readonly exigeCuentaAtras: boolean;
  readonly exigeMotivo: boolean;
  readonly usaPastilla: boolean;
}

export type IdEstadoDominio =
  | 'pendiente'
  | 'confirmada'
  | 'rechazada'
  | 'liberada'
  | 'cancelada'
  | 'no-show';

export type IdEstadoSync = 'pendiente-envio' | 'sincronizando' | 'conflicto' | 'offline';

export const PRIMITIVOS = {
  'green-600': '#16A34A',
  'green-700': '#15803D',
  'green-900': '#14532D',
  'green-50': '#F0FDF4',
  'red-600': '#DC2626',
  'amber-500': '#F59E0B',
  'amber-50': '#FFFBEB',
  'amber-950': '#451A03',
  'slate-600': '#475569',
  ink: '#1F2937',
  mist: '#F3F4F6',
  white: '#FFFFFF',
} as const;

export const SEMANTICOS = {
  'action-primary-bg': '#15803D',
  'action-primary-hover': '#166534',
  'destructive-bg': '#DC2626',
  'app-bg': '#F0FDF4',
  surface: '#FFFFFF',
  text: '#14532D',
  'text-secondary': '#475569',
  border: '#BBF7D0',
  'focus-ring': '#16A34A',
  link: '#15803D',
} as const;

export const ESTADOS: Record<IdEstadoDominio | IdEstadoSync, FichaEstado> = {
  pendiente: {
    relleno: '#FFFBEB', texto: '#451A03', borde: '1px dashed #F59E0B',
    iconoNombre: 'Clock', iconoPeso: 'regular', patron: 'rayado-45',
    etiqueta: 'Pendiente', exigeCuentaAtras: true, exigeMotivo: false, usaPastilla: true,
  },
  confirmada: {
    relleno: '#15803D', texto: '#FFFFFF', borde: '1px solid #15803D',
    iconoNombre: 'Check', iconoPeso: 'fill', patron: 'solido',
    etiqueta: 'Confirmada', exigeCuentaAtras: false, exigeMotivo: false, usaPastilla: true,
  },
  rechazada: {
    relleno: '#FEF2F2', texto: '#7F1D1D', borde: '1px solid #DC2626',
    iconoNombre: 'X', iconoPeso: 'regular', patron: 'contorno',
    etiqueta: 'Rechazada · motivo visible', exigeCuentaAtras: false, exigeMotivo: true, usaPastilla: true,
  },
  liberada: {
    relleno: '#F3F4F6', texto: '#475569', borde: '1px dotted #475569',
    iconoNombre: 'LockOpen', iconoPeso: 'regular', patron: 'punteado',
    etiqueta: 'Liberada', exigeCuentaAtras: false, exigeMotivo: false, usaPastilla: true,
  },
  cancelada: {
    relleno: '#F3F4F6', texto: '#1F2937', borde: '3px double #475569',
    iconoNombre: 'Prohibit', iconoPeso: 'regular', patron: 'borde-doble',
    etiqueta: 'Cancelada · motivo', exigeCuentaAtras: false, exigeMotivo: true, usaPastilla: true,
  },
  'no-show': {
    relleno: '#DC2626', texto: '#FFFFFF', borde: '1px solid #DC2626',
    iconoNombre: 'Warning', iconoPeso: 'fill', patron: 'solido-oscuro',
    etiqueta: 'No show · retenido', exigeCuentaAtras: false, exigeMotivo: false, usaPastilla: true,
  },
  'pendiente-envio': {
    relleno: '#FFFFFF', texto: '#475569', borde: '1px solid #475569',
    iconoNombre: 'Upload', iconoPeso: 'regular', patron: 'contorno-fino',
    etiqueta: 'Se enviará al conectar', exigeCuentaAtras: false, exigeMotivo: false, usaPastilla: true,
  },
  sincronizando: {
    relleno: '#EFF6FF', texto: '#1D4ED8', borde: '1px solid #93C5FD',
    iconoNombre: 'Sync', iconoPeso: 'regular', patron: 'animado',
    etiqueta: 'Sincronizando…', exigeCuentaAtras: false, exigeMotivo: false, usaPastilla: true,
  },
  conflicto: {
    relleno: '#F5F3FF', texto: '#5B21B6', borde: '1px dashed #7C3AED',
    iconoNombre: 'GitFork', iconoPeso: 'regular', patron: 'rayado-inverso',
    etiqueta: 'Conflicto · re-elegir slot', exigeCuentaAtras: false, exigeMotivo: true, usaPastilla: true,
  },
  offline: {
    relleno: '#1F2937', texto: '#F3F4F6', borde: '1px solid #1F2937',
    iconoNombre: 'WifiOff', iconoPeso: 'regular', patron: 'trama',
    etiqueta: 'Sin conexión · reintentando', exigeCuentaAtras: false, exigeMotivo: false, usaPastilla: true,
  },
};

export const IDS_ESTADO: ReadonlyArray<IdEstadoDominio | IdEstadoSync> = Object.keys(ESTADOS) as Array<
  IdEstadoDominio | IdEstadoSync
>;
