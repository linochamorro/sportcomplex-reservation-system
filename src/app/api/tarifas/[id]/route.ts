import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { esConflictoUnico, jsonError, jsonOk } from '@/lib/auth/http';
import { exigirRol, leerSesionDeCabecera } from '@/lib/auth/sesion';
import { validarHorarioEnSede } from '@/lib/domain/tarifas';

// PUT /api/tarifas/[id] — SUPERADMIN actualiza cualquiera; ADMIN solo las de su
// sede, sin cambiarla de sede.
export async function PUT(
  peticion: NextRequest,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const sesion = exigirRol(await leerSesionDeCabecera(peticion.headers.get('cookie')), 'SUPERADMIN', 'ADMIN');
    const { id } = await contexto.params;
    const tarifaId = Number(id);
    const cuerpo = (await peticion.json().catch(() => null)) as {
      sedeId?: unknown;
      nombre?: unknown;
      diasSemana?: unknown;
      horaInicio?: unknown;
      horaFin?: unknown;
      montoCentavos?: unknown;
    } | null;
    const nombre = String(cuerpo?.nombre ?? '').trim().slice(0, 120);
    const dias = Array.isArray(cuerpo?.diasSemana) ? cuerpo.diasSemana.map(Number) : [];
    const monto = Number(cuerpo?.montoCentavos);
    const hora = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!Number.isInteger(tarifaId)) return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    const tarifa = await bd.tarifa.findFirst({
      where: { id: tarifaId, eliminadoEn: null },
      select: { id: true, sedeId: true },
    });
    if (!tarifa) return Response.json({ error: 'Tarifa no encontrada' }, { status: 404 });
    if (sesion.rol === 'ADMIN' && tarifa.sedeId !== sesion.sedeId) {
      return Response.json({ error: 'Sin permiso sobre esta sede' }, { status: 403 });
    }
    if (
      cuerpo?.sedeId != null ||
      !nombre ||
      dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
      !hora.test(String(cuerpo?.horaInicio ?? '')) ||
      !hora.test(String(cuerpo?.horaFin ?? '')) ||
      !Number.isInteger(monto) ||
      monto < 0
    ) {
      return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    const sede = await bd.sede.findFirst({
      where: { id: tarifa.sedeId, eliminadoEn: null },
      select: { id: true, apertura: true, cierre: true },
    });
    if (!sede) return Response.json({ error: 'Sede no encontrada' }, { status: 404 });
    validarHorarioEnSede(String(cuerpo?.horaInicio), String(cuerpo?.horaFin), sede.apertura, sede.cierre);
    const actualizada = await bd.tarifa.update({
      where: { id: tarifaId },
      data: {
        nombre,
        diasSemana: dias,
        horaInicio: String(cuerpo?.horaInicio),
        horaFin: String(cuerpo?.horaFin),
        montoCentavos: monto,
      },
    });
    return jsonOk(actualizada);
  } catch (error) {
    if (esConflictoUnico(error)) return Response.json({ error: 'Ya existe una tarifa con ese nombre en la sede' }, { status: 409 });
    return jsonError(error);
  }
}
