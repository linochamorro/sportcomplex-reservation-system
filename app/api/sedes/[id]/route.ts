import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { esConflictoUnico, jsonError, jsonOk } from '@/lib/auth/http';
import { exigirRol, leerSesionDeCabecera } from '@/lib/auth/sesion';

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

// PUT /api/sedes/[id] — SUPERADMIN actualiza una sede vigente.
export async function PUT(
  peticion: NextRequest,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const sesion = exigirRol(await leerSesionDeCabecera(peticion.headers.get('cookie')), 'SUPERADMIN');
    void sesion;
    const { id } = await contexto.params;
    const sedeId = Number(id);
    const cuerpo = (await peticion.json().catch(() => null)) as {
      nombre?: unknown;
      direccion?: unknown;
      apertura?: unknown;
      cierre?: unknown;
      esPrueba?: unknown;
    } | null;
    const nombre = String(cuerpo?.nombre ?? '').trim().slice(0, 120);
    const apertura = String(cuerpo?.apertura ?? '');
    const cierre = String(cuerpo?.cierre ?? '');
    if (!Number.isInteger(sedeId) || !nombre || !HORA.test(apertura) || !HORA.test(cierre)) {
      return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    const vigente = await bd.sede.findFirst({ where: { id: sedeId, eliminadoEn: null }, select: { id: true } });
    if (!vigente) return Response.json({ error: 'Sede no encontrada' }, { status: 404 });
    const sede = await bd.sede.update({
      where: { id: sedeId },
      data: {
        nombre,
        direccion: typeof cuerpo?.direccion === 'string' ? cuerpo.direccion.slice(0, 200) : null,
        apertura,
        cierre,
        ...(cuerpo?.esPrueba === undefined ? {} : { esPrueba: cuerpo.esPrueba === true }),
      },
      select: { id: true, nombre: true, direccion: true, apertura: true, cierre: true },
    });
    return jsonOk(sede);
  } catch (error) {
    if (esConflictoUnico(error)) return Response.json({ error: 'Ya existe una sede con ese nombre' }, { status: 409 });
    return jsonError(error);
  }
}

// DELETE /api/sedes/[id] — SUPERADMIN desactiva una sede vigente.
export async function DELETE(
  peticion: NextRequest,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const sesion = exigirRol(await leerSesionDeCabecera(peticion.headers.get('cookie')), 'SUPERADMIN');
    void sesion;
    const { id } = await contexto.params;
    const sedeId = Number(id);
    if (!Number.isInteger(sedeId)) return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    const enUso = await bd.sede.findFirst({
      where: {
        id: sedeId,
        eliminadoEn: null,
        OR: [
          { canchas: { some: { eliminadoEn: null } } },
          { tarifas: { some: { eliminadoEn: null } } },
          { usuarios: { some: { eliminadoEn: null } } },
        ],
      },
      select: { id: true },
    });
    if (enUso) {
      return Response.json({ error: 'La sede tiene canchas, tarifas o usuarios activos' }, { status: 409 });
    }
    const resultado = await bd.sede.updateMany({
      where: { id: sedeId, eliminadoEn: null },
      data: { eliminadoEn: new Date() },
    });
    if (resultado.count !== 1) return Response.json({ error: 'Sede no encontrada' }, { status: 404 });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
