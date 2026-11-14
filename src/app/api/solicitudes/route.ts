import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { exigirSesion, leerSesionDeCabecera } from '@/lib/auth/sesion';
import { crearSolicitudTx } from '@/lib/domain/crear-solicitud';
import { barrerVencidos } from '@/lib/domain/liberar';

// POST /api/solicitudes — creación online. El dueño es siempre el `sub` de la
// sesión; nunca un campo del cuerpo (IDOR por diseño).
export async function POST(peticion: NextRequest): Promise<Response> {
  try {
    const sesion = exigirSesion(await leerSesionDeCabecera(peticion.headers.get('cookie')));
    // Barrido oportunista: libera holds vencidos aunque el cron no corra.
    await barrerVencidos();
    const cuerpo = (await peticion.json().catch(() => null)) as {
      canchaId?: unknown;
      fecha?: unknown;
      horaInicio?: unknown;
    } | null;
    const canchaId = Number(cuerpo?.canchaId);
    const fecha = String(cuerpo?.fecha ?? '');
    const horaInicio = String(cuerpo?.horaInicio ?? '');
    if (!Number.isInteger(canchaId) || canchaId < 1 || !fecha || !horaInicio) {
      return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    const solicitud = await bd.$transaction((tx) =>
      crearSolicitudTx(tx, {
        usuarioId: sesion.id,
        canchaId,
        fecha,
        horaInicio,
        sedePermitida: sesion.rol === 'ADMIN' ? sesion.sedeId : null,
      }),
    );
    return jsonOk(solicitud, 201);
  } catch (error) {
    return jsonError(error);
  }
}

// GET /api/solicitudes?mes=&limite= — USUARIO ve las suyas; ADMIN las de su
// sede; SUPERADMIN todo. `mes` (AAAA-MM) filtra el mes para los cuadros y
// `limite` (1–5000, por defecto 100) evita el recorte de agregados (QA-03).
export async function GET(peticion: NextRequest): Promise<Response> {
  try {
    const sesion = exigirSesion(await leerSesionDeCabecera(peticion.headers.get('cookie')));
    // Los estados visibles reflejan siempre el reloj: libera lo vencido primero.
    await barrerVencidos();
    const mesParam = peticion.nextUrl.searchParams.get('mes') ?? '';
    const limiteParam = peticion.nextUrl.searchParams.get('limite');
    const limite = limiteParam == null || limiteParam === '' ? 100 : Number(limiteParam);
    if (
      (mesParam !== '' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(mesParam)) ||
      !Number.isInteger(limite) ||
      limite < 1 ||
      limite > 5000
    ) {
      return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    const solicitudes = await bd.solicitud.findMany({
      where: {
        eliminadoEn: null,
        ...(mesParam !== '' ? { fecha: { startsWith: mesParam } } : {}),
        ...(sesion.rol === 'SUPERADMIN'
          ? {}
          : sesion.rol === 'ADMIN'
            ? { cancha: { sedeId: sesion.sedeId ?? -1 } }
            : { usuarioId: sesion.id }),
      },
      orderBy: { creadoEn: 'desc' },
      take: limite,
    });
    return jsonOk({ solicitudes });
  } catch (error) {
    return jsonError(error);
  }
}
