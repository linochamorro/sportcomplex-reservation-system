import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { baseUrlLocal } from '@/lib/ui/base-url';
import { jsonSeguro } from '@/lib/ui/fetch-seguro';
import { leerSesionServidor } from '@/lib/ui/sesion';
import { DisposicionRol } from '@/components/layout/DisposicionRol';
import { PanelPendientes, type Pendiente } from '@/components/pendientes/PanelPendientes';

export default async function PaginaPendientes() {
  const sesion = await leerSesionServidor();
  if (!sesion || sesion.rol !== 'ADMIN') redirect('/login');
  if (!sesion.sedeId) {
    return (
      <DisposicionRol actual="/pendientes" roles={['ADMIN']}>
        <h1>Pendientes de verificación</h1>
        <p role="alert">Tu cuenta administradora no tiene una sede asignada.</p>
      </DisposicionRol>
    );
  }
  const base = await baseUrlLocal();
  const galleta = (await cookies()).get('access_token')?.value ?? '';
  const cabeceras = { cookie: `access_token=${galleta}` };
  let iniciales: Pendiente[] = [];
  try {
    const [solR, canchasR] = await Promise.all([
      fetch(`${base}/api/solicitudes`, { headers: cabeceras, cache: 'no-store' }).catch(() => null),
      fetch(`${base}/api/canchas?sedeId=${sesion.sedeId}`, { headers: cabeceras, cache: 'no-store' }).catch(() => null),
    ]);
    const solicitudes = (
      await jsonSeguro<{ solicitudes: Array<Pendiente & { canchaId: number; estado: string }> }>(solR, { solicitudes: [] })
    ).solicitudes;
    const canchas = (
      await jsonSeguro<{ canchas: Array<{ id: number; nombre: string }> }>(canchasR, { canchas: [] })
    ).canchas;
    const porCancha = new Map(canchas.map((c) => [c.id, c.nombre]));
    iniciales = solicitudes
      .filter((s) => s.estado === 'PENDIENTE')
      .map((s) => ({ ...s, canchaNombre: porCancha.get(s.canchaId) ?? `Cancha ${s.canchaId}` }));
  } catch {
    iniciales = [];
  }
  return (
    <DisposicionRol actual="/pendientes" roles={['ADMIN']}>
      <h1>Pendientes de verificación</h1>
      <p className="app-subtitulo">Aquí aparecen las reservas pendientes de tu sede para confirmarlas o rechazarlas.</p>
      <PanelPendientes iniciales={iniciales} />
    </DisposicionRol>
  );
}
