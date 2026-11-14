import { NextRequest } from 'next/server';
import { ejecutarPull } from './pull';
import { bd } from '@/lib/db/cliente';
import type { Prisma } from '@/lib/db/generated/client';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { exigirSesion, leerSesionDeCabecera } from '@/lib/auth/sesion';
import { procesarPendientes } from '@/lib/sync/procesador';
import {
  hashCarga,
  MAX_CUERPO_SYNC_BYTES,
  MAX_OPS_LOTE,
  TIPOS_OP_CONOCIDOS,
  UUID_V4,
  type AckOp,
} from '@/lib/offline/tipos';
import {
  esBase64BienFormado,
  MAX_COMPROBANTE_BYTES,
  tamanoDecodificadoBase64,
} from '@/lib/domain/comprobantes';
import { leerCuerpoAcotado } from '@/lib/auth/cuerpo';


// POST /api/sync — push de outbox. Por-op atómico con ACK individual.
export async function POST(peticion: NextRequest): Promise<Response> {
  try {
    const sesion = exigirSesion(await leerSesionDeCabecera(peticion.headers.get('cookie')));
    // Tope de cuerpo (H-03): se acota la lectura antes de parsear, con
    // independencia de Content-Length.
    const bruto = await leerCuerpoAcotado(peticion, MAX_CUERPO_SYNC_BYTES);
    if (bruto === null) return Response.json({ error: 'Cuerpo demasiado grande' }, { status: 413 });
    let cuerpo: { ops?: unknown } | null = null;
    try {
      cuerpo = JSON.parse(bruto) as { ops?: unknown };
    } catch {
      cuerpo = null;
    }
    if (!Array.isArray(cuerpo?.ops) || cuerpo.ops.length === 0 || cuerpo.ops.length > MAX_OPS_LOTE) {
      return Response.json({ error: 'Lote inválido' }, { status: 400 });
    }
    const acks: AckOp[] = [];
    for (const cruda of cuerpo.ops as Array<Record<string, unknown>>) {
      const clienteOpId = String(cruda?.clienteOpId ?? '');
      const tipo = String(cruda?.tipo ?? '');
      const carga = (cruda?.carga ?? {}) as Record<string, unknown>;
      if (!UUID_V4.test(clienteOpId)) {
        acks.push({ clienteOpId, estado: 'rechazada', motivo: 'clienteOpId no UUIDv4' });
        continue;
      }
      if (!(TIPOS_OP_CONOCIDOS as readonly string[]).includes(tipo)) {
        acks.push({ clienteOpId, estado: 'rechazada', motivo: `tipo desconocido: ${tipo}` });
        continue;
      }
      if (typeof carga !== 'object' || carga === null || Array.isArray(carga)) {
        acks.push({ clienteOpId, estado: 'rechazada', motivo: 'carga inválida' });
        continue;
      }
      // Tope por-op del base64 (BLQ-3): tamaño decodificado estimado, no la
      // longitud de la cadena. Un comprobante válido de 5 MB (~6.7 MB b64) pasa.
      if (typeof carga.bytesBase64 === 'string') {
        if (!esBase64BienFormado(carga.bytesBase64)) {
          acks.push({ clienteOpId, estado: 'rechazada', motivo: 'base64 inválido' });
          continue;
        }
        if (tamanoDecodificadoBase64(carga.bytesBase64) > MAX_COMPROBANTE_BYTES) {
          acks.push({ clienteOpId, estado: 'rechazada', motivo: 'comprobante mayor a 5 MB' });
          continue;
        }
      }
      // Sede siempre desde sesión: carga.sedeId discordante → ACK 'rechazada' de la op
      // (el lote parcial usa ACK por-op; HTTP 400 solo para lote/cursor inválidos).
      const sedeCarga = carga.sedeId == null ? null : Number(carga.sedeId);
      if (
        sedeCarga != null &&
        sesion.rol !== 'SUPERADMIN' &&
        (!Number.isInteger(sedeCarga) || sedeCarga !== sesion.sedeId)
      ) {
        acks.push({ clienteOpId, estado: 'rechazada', motivo: 'sedeId no autorizado' });
        continue;
      }
      const cargaHash = hashCarga(carga);
      const existente = await bd.operacionPendiente.findUnique({
        where: { usuarioId_clienteOpId: { usuarioId: sesion.id, clienteOpId } },
      });
      if (existente) {
        if (existente.cargaHash !== cargaHash) {
          acks.push({ clienteOpId, estado: 'rechazada', motivo: 'reuso con distinta carga' });
        } else {
          // Replay: la op ya pasó por el procesador. Se devuelve SU resultado,
          // no un "aceptada" de segunda. Un reenvío no vuelve a ejecutar nada.
          acks.push(ackDeOperacion(clienteOpId, existente.estado, existente.resultado, existente.ultimoError));
        }
        continue;
      }
      await bd.operacionPendiente.create({
        data: {
          usuarioId: sesion.id,
          clienteOpId,
          tipo,
          carga: carga as Prisma.InputJsonValue,
          cargaHash,
        },
      });
    }
    // La op recién registrada no está ejecutada: se ejecuta ahora y se devuelve
    // el resultado real. Un ACK "aceptada" sin ejecutar sería una mentira que
    // el cliente toma como bueno y borra de su cola.
    const ejecutadas = await procesarPendientes(sesion);
    return jsonOk({ acks: [...acks, ...ejecutadas] });
  } catch (error) {
    return jsonError(error);
  }
}

/** Traduce el estado registrado de una op previa a su ACK, sin inventar un éxito. */
function ackDeOperacion(
  clienteOpId: string,
  estado: string,
  resultado: unknown,
  ultimoError: string | null,
): AckOp {
  if (estado === 'procesada') {
    const hecho = (resultado ?? {}) as { solicitudId?: number; bloqueoId?: number };
    return { clienteOpId, estado: 'aceptada', serverId: hecho.solicitudId ?? hecho.bloqueoId };
  }
  if (estado === 'conflicto') return { clienteOpId, estado: 'conflicto', motivo: ultimoError ?? 'conflicto' };
  if (estado === 'fallida_terminal') {
    return { clienteOpId, estado: 'rechazada', motivo: ultimoError ?? 'operación rechazada' };
  }
  // Seguía `pendiente` (por ejemplo se cayó la base): no se afirma nada todavía.
  return { clienteOpId, estado: 'rechazada', motivo: 'aún en cola', reintentable: true };
}


export async function GET(peticion: NextRequest): Promise<Response> {
  return ejecutarPull(peticion);
}
