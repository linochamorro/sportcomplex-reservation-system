import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { exigirSesion, leerSesionDeCabecera } from '@/lib/auth/sesion';
import { MAX_CAMBIOS_PULL, type CambioPull } from '@/lib/offline/tipos';

const TABLAS_SINCRONIZABLES = [
  'Sede',
  'Cancha',
  'Tarifa',
  'Solicitud',
  'Comprobante',
  'BloqueoCancha',
  'Notificacion',
] as const;

export async function ejecutarPull(peticion: NextRequest): Promise<Response> {
  try {
    const sesion = exigirSesion(await leerSesionDeCabecera(peticion.headers.get('cookie')));
    const crudo = peticion.nextUrl.searchParams.get('desde') ?? '0';
    if (!/^\d+$/.test(crudo)) return Response.json({ error: 'Cursor inválido' }, { status: 400 });
    const desde = BigInt(crudo);
    const resultado = await bd.$transaction(
      async (tx) => {
        const filas = await tx.registroCambio.findMany({
          where: { seq: { gt: desde } },
          orderBy: { seq: 'asc' },
          take: MAX_CAMBIOS_PULL,
        });
        // Scoping por tabla (contrato v1): la sede/usuario salen de sesión,
        // nunca del log ciego. El token avanza aunque la fila se filtre.
        const visibles = filas.filter((f) => {
          if (sesion.rol === 'SUPERADMIN') return true;
          if (f.tabla === 'Notificacion') return f.usuarioId === sesion.id;
          if (f.tabla === 'Comprobante') {
            return f.sedeId === sesion.sedeId || f.usuarioId === sesion.id;
          }
          return f.sedeId === sesion.sedeId;
        });
        const cambios: CambioPull[] = [];
        for (const f of visibles) {
          if (!TABLAS_SINCRONIZABLES.includes(f.tabla as (typeof TABLAS_SINCRONIZABLES)[number])) {
            continue;
          }
          let fila: Record<string, unknown> | null = null;
          if (!f.eliminado) {
            const donde = { where: { id: f.filaId } };
            let hallada: unknown = null;
            switch (f.tabla) {
              case 'Sede':
                hallada = await tx.sede.findUnique(donde);
                break;
              case 'Cancha':
                hallada = await tx.cancha.findUnique(donde);
                break;
              case 'Tarifa':
                hallada = await tx.tarifa.findUnique(donde);
                break;
              case 'Solicitud':
                hallada = await tx.solicitud.findUnique(donde);
                break;
              case 'Comprobante':
                hallada = await tx.comprobante.findUnique(donde);
                break;
              case 'BloqueoCancha':
                hallada = await tx.bloqueoCancha.findUnique(donde);
                break;
              case 'Notificacion':
                hallada = await tx.notificacion.findUnique(donde);
                break;
            }
            fila = hallada as Record<string, unknown> | null;
          }
          cambios.push({
            seq: f.seq.toString(),
            tabla: f.tabla,
            filaId: f.filaId,
            sedeId: f.sedeId,
            usuarioId: f.usuarioId,
            eliminado: f.eliminado,
            fila,
          });
        }
        const token = filas.length > 0 ? filas[filas.length - 1].seq.toString() : crudo;
        return { cambios, token };
      },
      { isolationLevel: 'RepeatableRead' },
    );
    // Serializa BigInt fuera del log (seq ya es string en cada cambio).
    return jsonOk(resultado);
  } catch (error) {
    return jsonError(error);
  }
}
