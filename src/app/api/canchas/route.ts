import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { esConflictoUnico, jsonError, jsonOk } from '@/lib/auth/http';
import { MOTIVO_SIN_TARIFA, sedeTieneTarifa } from '@/lib/domain/disponibilidad';
import { exigirRol, leerSesionDeCabecera } from '@/lib/auth/sesion';

// GET /api/canchas?sedeId= — catálogo público por sede.
export async function GET(peticion: NextRequest): Promise<Response> {
  try {
    const sedeId = Number(peticion.nextUrl.searchParams.get('sedeId'));
    if (!Number.isInteger(sedeId)) return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    const soloDisponibles = peticion.nextUrl.searchParams.get('soloDisponibles') === '1';
    const canchas = await bd.cancha.findMany({
      where: { sedeId, eliminadoEn: null, ...(soloDisponibles ? { estado: 'DISPONIBLE' as const } : {}) },
      select: { id: true, nombre: true, tarifaBaseCentavos: true, estado: true, motivoNoDisponible: true },
      orderBy: { nombre: 'asc' },
    });
    return jsonOk({ canchas });
  } catch (error) {
    return jsonError(error);
  }
}

// POST /api/canchas — SUPERADMIN crea en cualquier sede; ADMIN solo en la suya.
export async function POST(peticion: NextRequest): Promise<Response> {
  try {
    const sesion = exigirRol(await leerSesionDeCabecera(peticion.headers.get('cookie')), 'SUPERADMIN', 'ADMIN');
    const cuerpo = (await peticion.json().catch(() => null)) as {
      sedeId?: unknown;
      nombre?: unknown;
      tarifaBaseCentavos?: unknown;
    } | null;
    const sedeId = Number(cuerpo?.sedeId);
    if (sesion.rol === 'ADMIN' && sedeId !== sesion.sedeId) {
      return Response.json({ error: 'Sin permiso sobre esta sede' }, { status: 403 });
    }
    const nombre = String(cuerpo?.nombre ?? '').trim().slice(0, 120);
    const tarifa = Number(cuerpo?.tarifaBaseCentavos);
    if (!Number.isInteger(sedeId) || !nombre || !Number.isInteger(tarifa) || tarifa < 0) {
      return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    const sede = await bd.sede.findFirst({ where: { id: sedeId, eliminadoEn: null }, select: { id: true } });
    if (!sede) return Response.json({ error: 'Sede no encontrada' }, { status: 404 });
    const disponible = await sedeTieneTarifa(bd, sedeId);
    const cancha = await bd.cancha.create({
      data: {
        sedeId,
        nombre,
        tarifaBaseCentavos: tarifa,
        estado: disponible ? 'DISPONIBLE' : 'NO_DISPONIBLE',
        motivoNoDisponible: disponible ? null : MOTIVO_SIN_TARIFA,
      },
    });
    return jsonOk(cancha, 201);
  } catch (error) {
    if (esConflictoUnico(error)) return Response.json({ error: 'Ya existe una cancha con ese nombre en la sede' }, { status: 409 });
    return jsonError(error);
  }
}
