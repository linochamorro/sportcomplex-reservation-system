import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { baseUrlLocal } from '@/lib/ui/base-url';
import { jsonSeguro } from '@/lib/ui/fetch-seguro';
import { leerSesionServidor } from '@/lib/ui/sesion';
import { DisposicionRol } from '@/components/layout/DisposicionRol';
import { PanelBloqueos, type Bloqueo } from '@/components/bloqueos/PanelBloqueos';

export default async function PaginaBloqueos() {
  const sesion = await leerSesionServidor();
  if (!sesion || sesion.rol !== 'ADMIN') redirect('/login');
  if (!sesion.sedeId) {
    return (
      <DisposicionRol actual="/bloqueos" roles={['ADMIN']}>
        <h1>Mantenimiento</h1>
        <p role="alert">Tu cuenta administradora no tiene una sede asignada.</p>
      </DisposicionRol>
    );
  }
  const base = await baseUrlLocal();
  const galleta = (await cookies()).get('access_token')?.value ?? '';
  const cabeceras = { cookie: `access_token=${galleta}` };
  const sede = String(sesion.sedeId);
  let iniciales: Bloqueo[] = [];
  let canchas: Array<{ id: number; nombre: string; estado: string }> = [];
  try {
    const [bloqueosR, canchasR] = await Promise.all([
      fetch(`${base}/api/bloqueos?sedeId=${sede}`, { headers: cabeceras, cache: 'no-store' }).catch(() => null),
      fetch(`${base}/api/canchas?sedeId=${sede}`, { headers: cabeceras, cache: 'no-store' }).catch(() => null),
    ]);
    iniciales = (await jsonSeguro<{ bloqueos: Bloqueo[] }>(bloqueosR, { bloqueos: [] })).bloqueos;
    canchas = (
      await jsonSeguro<{ canchas: Array<{ id: number; nombre: string; estado: string }> }>(canchasR, { canchas: [] })
    ).canchas.filter((c) => c.estado === 'DISPONIBLE');
  } catch {
    iniciales = [];
    canchas = [];
  }
  return (
    <DisposicionRol actual="/bloqueos" roles={['ADMIN']}>
      <h1>Mantenimiento</h1>
      <p className="app-subtitulo">Bloquea temporalmente una cancha disponible por mantenimiento u otro motivo operativo.</p>
      <PanelBloqueos iniciales={iniciales} sedeId={sede} canchas={canchas} />
    </DisposicionRol>
  );
}
