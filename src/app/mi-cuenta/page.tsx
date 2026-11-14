import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DisposicionRol } from '@/components/layout/DisposicionRol';
import { PanelCuenta } from '@/components/cuenta/PanelCuenta';
import { baseUrlLocal } from '@/lib/ui/base-url';
import { jsonSeguro } from '@/lib/ui/fetch-seguro';
import { leerSesionServidor } from '@/lib/ui/sesion';

export default async function PaginaMiCuenta() {
  const sesion = await leerSesionServidor();
  if (!sesion) redirect('/login');
  const galleta = (await cookies()).get('access_token')?.value ?? '';
  const base = await baseUrlLocal();
  const cabeceras = { cookie: `access_token=${galleta}` };
  let telefono: string | null = null;
  let sedeNombre: string | null = null;
  try {
    const [perfilR, sedesR] = await Promise.all([
      fetch(`${base}/api/cuenta/perfil`, { headers: cabeceras, cache: 'no-store' }).catch(() => null),
      sesion.sedeId ? fetch(`${base}/api/sedes`, { cache: 'no-store' }).catch(() => null) : Promise.resolve(null),
    ]);
    telefono = (await jsonSeguro<{ telefono: string | null }>(perfilR, { telefono: null })).telefono;
    const sedes = (await jsonSeguro<{ sedes: Array<{ id: number; nombre: string }> }>(sedesR, { sedes: [] })).sedes;
    sedeNombre = sedes.find((s) => s.id === sesion.sedeId)?.nombre ?? null;
  } catch {
    telefono = null;
    sedeNombre = null;
  }
  return (
    <DisposicionRol actual="/mi-cuenta" roles={[sesion.rol]}>
      <h1>Mi cuenta</h1>
      <p className="app-subtitulo">Edita tus datos o cambia tu clave de acceso.</p>
      <PanelCuenta
        inicial={{
          email: sesion.email,
          nombre: sesion.nombre,
          telefono,
          rol: sesion.rol,
          sedeNombre,
        }}
      />
    </DisposicionRol>
  );
}
