import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { BannerSesion } from './BannerSesion';
import { NavegacionPorRol } from './NavegacionPorRol';
import { baseUrlLocal } from '@/lib/ui/base-url';

type Rol = 'USUARIO' | 'ADMIN' | 'SUPERADMIN';

async function leerSesion(galleta: string): Promise<{ rol: Rol; sedeId: number | null } | null> {
  const base = await baseUrlLocal();
  try {
    const r = await fetch(`${base}/api/auth/me`, { headers: { cookie: `access_token=${galleta}` }, cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { rol: Rol; sedeId: number | null };
    return { rol: j.rol, sedeId: j.sedeId };
  } catch {
    return null;
  }
}

async function contadores(
  rol: Rol,
  galleta: string,
): Promise<{ pendientes?: number; noLeidas?: number }> {
  const base = await baseUrlLocal();
  const cabeceras = { cookie: `access_token=${galleta}` };
  const salida: { pendientes?: number; noLeidas?: number } = {};
  try {
    if (rol !== 'USUARIO') {
      const r = await fetch(`${base}/api/solicitudes`, { headers: cabeceras, cache: 'no-store' });
      if (r.ok) {
        const j = (await r.json()) as { solicitudes: Array<{ estado: string }> };
        salida.pendientes = j.solicitudes.filter((s) => s.estado === 'PENDIENTE').length;
      }
    }
    const n = await fetch(`${base}/api/notificaciones`, { headers: cabeceras, cache: 'no-store' });
    if (n.ok) {
      const j = (await n.json()) as { notificaciones: Array<{ leida: boolean }> };
      salida.noLeidas = j.notificaciones.filter((x) => !x.leida).length;
    }
  } catch {
    // Sin contadores antes que contadores ficticios.
  }
  return salida;
}

/** Layout con guarda de sesión, navegación por rol y banner (AC-03). */
export async function DisposicionRol({
  children,
  actual,
  roles,
}: {
  children: ReactNode;
  actual: string;
  roles: Rol[];
}) {
  const galleta = (await cookies()).get('access_token')?.value;
  if (!galleta) redirect('/login');
  const sesion = await leerSesion(galleta);
  if (!sesion || !roles.includes(sesion.rol)) redirect('/login');
  const cuentas = await contadores(sesion.rol, galleta);
  return (
    <>
      <header className="app-header">
        <p className="app-brand">Reservas deportivas</p>
        <BannerSesion />
      </header>
      <div className="app-regreso">
        <Link href="/">Volver al inicio</Link>
      </div>
      <NavegacionPorRol rol={sesion.rol} actual={actual} pendientes={cuentas.pendientes} noLeidas={cuentas.noLeidas} />
      <main className="app-main">{children}</main>
      <form className="app-logout" action="/api/auth/logout" method="post">
        <button type="submit">Salir</button>
      </form>
    </>
  );
}
