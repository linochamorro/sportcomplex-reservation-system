import { cookies } from 'next/headers';
import { baseUrlLocal } from '@/lib/ui/base-url';
import { jsonSeguro } from '@/lib/ui/fetch-seguro';

export type SesionPublicaServidor = {
  id: number;
  email: string;
  nombre: string;
  rol: 'SUPERADMIN' | 'ADMIN' | 'USUARIO';
  sedeId: number | null;
};

export async function leerSesionServidor(): Promise<SesionPublicaServidor | null> {
  const galleta = (await cookies()).get('access_token')?.value ?? '';
  if (!galleta) return null;
  const base = await baseUrlLocal();
  try {
    const r = await fetch(`${base}/api/auth/me`, {
      headers: { cookie: `access_token=${galleta}` },
      cache: 'no-store',
    }).catch(() => null);
    const j = await jsonSeguro<{ rol?: unknown }>(r, {});
    if (j.rol !== 'SUPERADMIN' && j.rol !== 'ADMIN' && j.rol !== 'USUARIO') return null;
    return j as SesionPublicaServidor;
  } catch {
    return null;
  }
}
