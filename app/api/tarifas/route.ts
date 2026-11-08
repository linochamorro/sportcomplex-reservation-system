import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { esConflictoUnico, jsonError, jsonOk } from '@/lib/auth/http';
import { activarCanchasAutomaticas } from '@/lib/domain/disponibilidad';
import { validarHorarioEnSede } from '@/lib/domain/tarifas';
import { exigirRol, exigirSesion, leerSesionDeCabecera } from '@/lib/auth/sesion';

// GET /api/tarifas?sedeId= — cualquier sesión lista; ADMIN solo su sede.
// El formulario de reserva la usa para mostrar la tarifa aplicable.
export async function GET(peticion: NextRequest): Promise<Response> {
  try {
    const sesion = exigirSesion(await leerSesionDeCabecera(peticion.headers.get('cookie')));
    const sedeId = Number(peticion.nextUrl.searchParams.get('sedeId'));
    if (!Number.isInteger(sedeId)) return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    if (sesion.rol === 'ADMIN' && sedeId !== sesion.sedeId) {
      return Response.json({ error: 'Sin permiso sobre esta sede' }, { status: 403 });
    }
    const tarifas = await bd.tarifa.findMany({
      where: { sedeId, eliminadoEn: null },
      orderBy: { nombre: 'asc' },
    });
    return jsonOk({ tarifas });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(peticion: NextRequest): Promise<Response> {
  try {
    // SUPERADMIN crea en cualquier sede; ADMIN solo en la suya.
    const sesion = exigirRol(await leerSesionDeCabecera(peticion.headers.get('cookie')), 'SUPERADMIN', 'ADMIN');
    const cuerpo = (await peticion.json().catch(() => null)) as {
      sedeId?: unknown;
      nombre?: unknown;
      diasSemana?: unknown;
      horaInicio?: unknown;
      horaFin?: unknown;
      montoCentavos?: unknown;
    } | null;
    const sedeId = Number(cuerpo?.sedeId);
    const nombre = String(cuerpo?.nombre ?? '').trim().slice(0, 120);
    const dias = Array.isArray(cuerpo?.diasSemana) ? cuerpo.diasSemana.map(Number) : [];
    const monto = Number(cuerpo?.montoCentavos);
    const hora = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (
      !Number.isInteger(sedeId) ||
      !nombre ||
      dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
      !hora.test(String(cuerpo?.horaInicio ?? '')) ||
      !hora.test(String(cuerpo?.horaFin ?? '')) ||
      !Number.isInteger(monto) ||
      monto < 0
    ) {
      return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    if (sesion.rol === 'ADMIN' && sedeId !== sesion.sedeId) {
      return Response.json({ error: 'Sin permiso sobre esta sede' }, { status: 403 });
    }
    const sede = await bd.sede.findFirst({
      where: { id: sedeId, eliminadoEn: null },
      select: { id: true, apertura: true, cierre: true },
    });
    if (!sede) return Response.json({ error: 'Sede no encontrada' }, { status: 404 });
    validarHorarioEnSede(String(cuerpo?.horaInicio), String(cuerpo?.horaFin), sede.apertura, sede.cierre);
    const tarifa = await bd.tarifa.create({
      data: {
        sedeId,
        nombre,
        diasSemana: dias,
        horaInicio: String(cuerpo?.horaInicio),
        horaFin: String(cuerpo?.horaFin),
        montoCentavos: monto,
      },
    });
    await activarCanchasAutomaticas(bd, sedeId);
    return jsonOk(tarifa, 201);
  } catch (error) {
    if (esConflictoUnico(error)) return Response.json({ error: 'Ya existe una tarifa con ese nombre en la sede' }, { status: 409 });
    return jsonError(error);
  }
}
