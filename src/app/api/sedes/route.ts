import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { esConflictoUnico, jsonError, jsonOk } from '@/lib/auth/http';
import { exigirRol, leerSesionDeCabecera } from '@/lib/auth/sesion';

// GET /api/sedes — catálogo de reservas: solo sedes reales (esPrueba=false).
// `?incluirPruebas=1` las suma, pero únicamente para ADMIN/SUPERADMIN (los
// paneles de gestión necesitan ver las sedes de prueba de e2e/QA).
export async function GET(peticion: NextRequest): Promise<Response> {
  try {
    const incluirPruebas = peticion.nextUrl.searchParams.get('incluirPruebas') === '1';
    let mostrarPruebas = false;
    if (incluirPruebas) {
      const sesion = await leerSesionDeCabecera(peticion.headers.get('cookie'));
      mostrarPruebas = sesion !== null && (sesion.rol === 'ADMIN' || sesion.rol === 'SUPERADMIN');
    }
    const sedes = await bd.sede.findMany({
      where: { eliminadoEn: null, ...(mostrarPruebas ? {} : { esPrueba: false }) },
      select: { id: true, nombre: true, direccion: true, apertura: true, cierre: true, esPrueba: true },
      orderBy: { nombre: 'asc' },
    });
    return jsonOk({ sedes });
  } catch (error) {
    return jsonError(error);
  }
}

// POST /api/sedes — SUPERADMIN crea sede.
export async function POST(peticion: NextRequest): Promise<Response> {
  try {
    const sesion = exigirRol(await leerSesionDeCabecera(peticion.headers.get('cookie')), 'SUPERADMIN');
    void sesion;
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
    if (!nombre || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(apertura) || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(cierre)) {
      return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    const sede = await bd.sede.create({
      data: {
        nombre,
        direccion: typeof cuerpo?.direccion === 'string' ? cuerpo.direccion.slice(0, 200) : null,
        apertura,
        cierre,
        // Solo el SUPERADMIN puede marcar una sede como de prueba (e2e/QA).
        esPrueba: cuerpo?.esPrueba === true,
      },
    });
    return jsonOk(sede, 201);
  } catch (error) {
    if (esConflictoUnico(error)) return Response.json({ error: 'Ya existe una sede con ese nombre' }, { status: 409 });
    return jsonError(error);
  }
}
