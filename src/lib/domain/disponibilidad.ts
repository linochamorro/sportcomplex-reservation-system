import { HttpError } from '../auth/sesion';

export const MOTIVO_SIN_TARIFA = 'Sin tarifa asignada';

type LectorTarifas = {
  tarifa: {
    count(args: { where: { sedeId: number; eliminadoEn: null } }): Promise<number>;
  };
};

type EscritorCanchas = {
  cancha: {
    updateMany(args: {
      where: { sedeId: number; eliminadoEn: null; estado: 'NO_DISPONIBLE'; motivoNoDisponible: string };
      data: { estado: 'DISPONIBLE'; motivoNoDisponible: null };
    }): Promise<unknown>;
  };
};

export async function sedeTieneTarifa(cliente: LectorTarifas, sedeId: number): Promise<boolean> {
  return (await cliente.tarifa.count({ where: { sedeId, eliminadoEn: null } })) > 0;
}

export function validarCambioEstadoCancha(
  estado: unknown,
  motivo: unknown,
  tieneTarifa: boolean,
): { estado: 'DISPONIBLE' | 'NO_DISPONIBLE'; motivoNoDisponible: string | null } {
  if (estado !== 'DISPONIBLE' && estado !== 'NO_DISPONIBLE') {
    throw new HttpError(400, 'Datos inválidos');
  }
  const motivoLimpio = typeof motivo === 'string' ? motivo.trim().slice(0, 200) : '';
  if (estado === 'DISPONIBLE') {
    if (!tieneTarifa) throw new HttpError(409, 'La cancha necesita una tarifa vigente en su sede');
    return { estado, motivoNoDisponible: null };
  }
  if (!motivoLimpio) throw new HttpError(400, 'Datos inválidos');
  return { estado, motivoNoDisponible: motivoLimpio };
}

export async function activarCanchasAutomaticas(cliente: EscritorCanchas, sedeId: number): Promise<void> {
  await cliente.cancha.updateMany({
    where: { sedeId, eliminadoEn: null, estado: 'NO_DISPONIBLE', motivoNoDisponible: MOTIVO_SIN_TARIFA },
    data: { estado: 'DISPONIBLE', motivoNoDisponible: null },
  });
}
