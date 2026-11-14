import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { esConflictoUnico, jsonError, jsonOk } from '@/lib/auth/http';
import { exigirRol, leerSesionDeCabecera } from '@/lib/auth/sesion';
import { hachearClave } from '@/lib/auth/hash';
import { normalizarEmail, validarClave, validarEmail, validarNombre } from '@/lib/auth/validacion';

// GET /api/usuarios — SUPERADMIN: lista con filtros rol/sedeId.
export async function GET(peticion: NextRequest): Promise<Response> {
  try {
    const sesion = exigirRol(await leerSesionDeCabecera(peticion.headers.get('cookie')), 'SUPERADMIN');
    void sesion;
    const rol = peticion.nextUrl.searchParams.get('rol');
    const sedeParam = peticion.nextUrl.searchParams.get('sedeId');
    const sedeId = sedeParam == null || sedeParam === '' ? Number.NaN : Number(sedeParam);
    const usuarios = await bd.usuario.findMany({
      where: {
        ...(rol === 'ADMIN' || rol === 'USUARIO' ? { rol: rol as 'ADMIN' | 'USUARIO' } : {}),
        ...(Number.isInteger(sedeId) ? { sedeId } : {}),
        eliminadoEn: null,
      },
      select: { id: true, email: true, nombre: true, rol: true, sedeId: true },
      orderBy: { creadoEn: 'desc' },
      take: 100,
    });
    return jsonOk({ usuarios });
  } catch (error) {
    return jsonError(error);
  }
}

// POST /api/usuarios — SUPERADMIN crea ADMIN con sede.
export async function POST(peticion: NextRequest): Promise<Response> {
  try {
    const sesion = exigirRol(await leerSesionDeCabecera(peticion.headers.get('cookie')), 'SUPERADMIN');
    void sesion;
    const cuerpo = (await peticion.json().catch(() => null)) as {
      email?: unknown;
      clave?: unknown;
      nombre?: unknown;
      rol?: unknown;
      sedeId?: unknown;
    } | null;
    const email = normalizarEmail(String(cuerpo?.email ?? ''));
    const rol = 'ADMIN';
    const sedeId = cuerpo?.sedeId == null ? null : Number(cuerpo.sedeId);
    if (!validarEmail(email) || !validarClave(String(cuerpo?.clave ?? ''))) {
      return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    if (!Number.isInteger(sedeId)) {
      return Response.json({ error: 'ADMIN exige sede' }, { status: 400 });
    }
    const sede = await bd.sede.findFirst({ where: { id: sedeId as number, eliminadoEn: null }, select: { id: true } });
    if (!sede) return Response.json({ error: 'Sede no encontrada' }, { status: 404 });
    const nombre = String(cuerpo?.nombre ?? '').trim().slice(0, 120) || email;
    if (!validarNombre(nombre)) return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    const creado = await bd.usuario.create({
      data: {
        email,
        passwordHash: await hachearClave(String(cuerpo?.clave)),
        nombre,
        rol,
        sedeId: sedeId as number,
      },
      select: { id: true, email: true, rol: true, sedeId: true },
    });
    return jsonOk(creado, 201);
  } catch (error) {
    if (esConflictoUnico(error)) return Response.json({ error: 'Ya existe un usuario con ese correo' }, { status: 409 });
    return jsonError(error);
  }
}
