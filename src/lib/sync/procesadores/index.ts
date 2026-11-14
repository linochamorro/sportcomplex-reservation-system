import { HttpError } from '../../auth/sesion';
import { crearSolicitudTx, type ClienteTx } from '../../domain/crear-solicitud';
import { aplicarVerificacionTx } from '../../domain/verificacion-tx';
import { crearBloqueoTx, reasignarTx, reembolsarTx } from '../../domain/bloqueos-tx';
import { adjuntarComprobanteTx } from '../../domain/comprobantes-tx';
import type { Sesion } from '../../auth/sesion';

export type ResultadoProceso =
  | { estado: 'aceptada'; solicitudId?: number; bloqueoId?: number }
  | { estado: 'conflicto' | 'rechazada'; motivo: string };

type Procesador = (
  tx: ClienteTx,
  sesion: Sesion,
  carga: Record<string, unknown>,
) => Promise<ResultadoProceso>;

function aResultado(error: unknown): ResultadoProceso {
  if (error instanceof HttpError) {
    // Server-wins: un 409 es conflicto visible con acción.
    if (error.estado === 409) return { estado: 'conflicto', motivo: error.message };
    return { estado: 'rechazada', motivo: error.message };
  }
  throw error;
}

/** Dispatcher por tipo (F-06): única fuente de verdad con el filtro SQL. */
export const PROCESADORES: Record<string, Procesador> = {
  'solicitud.crear': async (tx, sesion, carga) => {
    try {
      const s = await crearSolicitudTx(tx, {
        usuarioId: sesion.id,
        canchaId: Number(carga.canchaId),
        fecha: String(carga.fecha ?? ''),
        horaInicio: String(carga.horaInicio ?? ''),
        sedePermitida: sesion.rol === 'ADMIN' ? sesion.sedeId : null,
      });
      return { estado: 'aceptada', solicitudId: s.id };
    } catch (error) {
      return aResultado(error);
    }
  },
  'solicitud.confirmar': async (tx, sesion, carga) => {
    try {
      const s = await aplicarVerificacionTx(tx, sesion, Number(carga.solicitudId), 'confirmar');
      return { estado: 'aceptada', solicitudId: s.id };
    } catch (error) {
      return aResultado(error);
    }
  },
  'solicitud.rechazar': async (tx, sesion, carga) => {
    try {
      const s = await aplicarVerificacionTx(tx, sesion, Number(carga.solicitudId), 'rechazar', carga.motivo);
      return { estado: 'aceptada', solicitudId: s.id };
    } catch (error) {
      return aResultado(error);
    }
  },
  'solicitud.no-show': async (tx, sesion, carga) => {
    try {
      const s = await aplicarVerificacionTx(tx, sesion, Number(carga.solicitudId), 'no_show');
      return { estado: 'aceptada', solicitudId: s.id };
    } catch (error) {
      return aResultado(error);
    }
  },
  'bloqueo.crear': async (tx, sesion, carga) => {
    try {
      const b = await crearBloqueoTx(tx, sesion, {
        canchaId: Number(carga.canchaId),
        fecha: String(carga.fecha ?? ''),
        horaInicio: carga.horaInicio,
        horaFin: carga.horaFin,
        motivo: carga.motivo,
      });
      return { estado: 'aceptada', bloqueoId: b.id };
    } catch (error) {
      return aResultado(error);
    }
  },
  'bloqueo.reasignar': async (tx, sesion, carga) => {
    try {
      const s = await reasignarTx(
        tx,
        sesion,
        Number(carga.bloqueoId),
        Number(carga.solicitudId),
        {
          fecha: String(carga.fecha ?? ''),
          horaInicio: String(carga.horaInicio ?? ''),
          horaFin: String(carga.horaFin ?? ''),
        },
      );
      return { estado: 'aceptada', solicitudId: s.id };
    } catch (error) {
      return aResultado(error);
    }
  },
  'comprobante.subir': async (tx, sesion, carga) => {
    try {
      if (typeof carga.bytesBase64 !== 'string') {
        return { estado: 'rechazada', motivo: 'Falta el comprobante' };
      }
      await adjuntarComprobanteTx(tx, sesion, {
        solicitudId: Number(carga.solicitudId),
        proposito: 'pago',
        bytes: Buffer.from(carga.bytesBase64.replace(/\s+/g, ''), 'base64'),
        nombreArchivo: String(carga.nombreArchivo ?? ''),
        contentType: String(carga.contentType ?? ''),
      });
      return { estado: 'aceptada', solicitudId: Number(carga.solicitudId) };
    } catch (error) {
      return aResultado(error);
    }
  },
  'notificacion.leer': async (tx, sesion, carga) => {
    try {
      const id = Number(carga.notificacionId);
      if (!Number.isInteger(id)) return { estado: 'rechazada', motivo: 'Datos inválidos' };
      const n = await tx.notificacion.findUnique({ where: { id } });
      // Solo el dueño; 404 sin filtrar existencia (H-08).
      if (!n || n.eliminadoEn || n.usuarioId !== sesion.id) {
        return { estado: 'rechazada', motivo: 'No existe' };
      }
      await tx.notificacion.update({ where: { id }, data: { leida: true } });
      await tx.registroCambio.create({
        data: { tabla: 'Notificacion', filaId: id, sedeId: null, usuarioId: sesion.id },
      });
      return { estado: 'aceptada' };
    } catch (error) {
      return aResultado(error);
    }
  },
  'bloqueo.reembolsar': async (tx, sesion, carga) => {
    try {
      if (typeof carga.bytesBase64 !== 'string') {
        return { estado: 'rechazada', motivo: 'El comprobante de reembolso es obligatorio' };
      }
      const r = await reembolsarTx(
        tx,
        sesion,
        Number(carga.bloqueoId),
        Number(carga.solicitudId),
        {
          bytes: Buffer.from(carga.bytesBase64.replace(/\s+/g, ''), 'base64'),
          nombreArchivo: String(carga.nombreArchivo ?? ''),
          contentType: String(carga.contentType ?? ''),
        },
      );
      return { estado: 'aceptada', solicitudId: r.id };
    } catch (error) {
      return aResultado(error);
    }
  },
};

export const TIPOS_IMPLEMENTADOS = Object.keys(PROCESADORES);
