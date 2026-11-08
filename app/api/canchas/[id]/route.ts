import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { esConflictoUnico, jsonError, jsonOk } from '@/lib/auth/http';
import { exigirRol, leerSesionDeCabecera } from '@/lib/auth/sesion';
import { sedeTieneTarifa, validarCambioEstadoCancha } from '@/lib/domain/disponibilidad';
import { eliminarCanchaTx } from '@/lib/domain/reasignacion';

// PUT /api/canchas/[id] — SUPERADMIN actualiza cualquiera; ADMIN solo las de su
// sede (nombre, tarifa base y disponibilidad). DELETE sigue siendo SUPERADMIN.
export async function PUT(
  peticion: NextRequest,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const sesion = exigirRol(await leerSesionDeCabecera(peticion.headers.get('cookie')), 'SUPERADMIN', 'ADMIN');
    const { id } = await contexto.params;
    const canchaId = Number(id);
    const cuerpo = (await peticion.json().catch(() => null)) as {
      nombre?: unknown;
      tarifaBaseCentavos?: unknown;
      estado?: unknown;
      motivoNoDisponible?: unknown;
    } | null;
    const nombre = String(cuerpo?.nombre ?? '').trim().slice(0, 120);
    const tarifa = Number(cuerpo?.tarifaBaseCentavos);
    if (!Number.isInteger(canchaId) || !nombre || !Number.isInteger(tarifa) || tarifa < 0) {
      return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    const cancha = await bd.cancha.findFirst({
      where: { id: canchaId, eliminadoEn: null },
      select: { id: true, sedeId: true },
    });
    if (!cancha) return Response.json({ error: 'Cancha no encontrada' }, { status: 404 });
    if (sesion.rol === 'ADMIN' && cancha.sedeId !== sesion.sedeId) {
      return Response.json({ error: 'Sin permiso sobre esta sede' }, { status: 403 });
    }
    const sede = await bd.sede.findFirst({ where: { id: cancha.sedeId, eliminadoEn: null }, select: { id: true } });
    if (!sede) return Response.json({ error: 'Sede no encontrada' }, { status: 404 });
    const disponibilidad = validarCambioEstadoCancha(
      cuerpo?.estado,
      cuerpo?.motivoNoDisponible,
      await sedeTieneTarifa(bd, cancha.sedeId),
    );
    const actualizada = await bd.cancha.update({
      where: { id: canchaId },
      data: { nombre, tarifaBaseCentavos: tarifa, ...disponibilidad },
      select: { id: true, nombre: true, tarifaBaseCentavos: true, estado: true, motivoNoDisponible: true },
    });
    return jsonOk(actualizada);
  } catch (error) {
    if (esConflictoUnico(error)) return Response.json({ error: 'Ya existe una cancha con ese nombre en la sede' }, { status: 409 });
    return jsonError(error);
  }
}

// DELETE /api/canchas/[id] — SUPERADMIN desactiva una cancha sin turnos futuros.
export async function DELETE(
  peticion: NextRequest,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const sesion = exigirRol(await leerSesionDeCabecera(peticion.headers.get('cookie')), 'SUPERADMIN');
    const { id } = await contexto.params;
    const canchaId = Number(id);
    if (!Number.isInteger(canchaId)) return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    const resultado = await bd.$transaction((tx) => eliminarCanchaTx(tx, sesion, canchaId));
    return jsonOk(resultado);
  } catch (error) {
    return jsonError(error);
  }
}
