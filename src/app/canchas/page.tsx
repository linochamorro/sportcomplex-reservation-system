import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { baseUrlLocal } from '@/lib/ui/base-url';
import { jsonSeguro } from '@/lib/ui/fetch-seguro';
import { leerSesionServidor } from '@/lib/ui/sesion';
import { DisposicionRol } from '@/components/layout/DisposicionRol';
import { PanelCanchas, type CanchaAdmin, type TarifaOpcion } from '@/components/admin/PanelCanchas';
import { SelectorSede } from '@/components/admin/SelectorSede';

export default async function PaginaCanchas({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string }>;
}) {
  const sesion = await leerSesionServidor();
  if (!sesion || (sesion.rol !== 'SUPERADMIN' && sesion.rol !== 'ADMIN')) redirect('/login');
  if (sesion.rol === 'ADMIN' && !sesion.sedeId) {
    return (
      <DisposicionRol actual="/canchas" roles={['ADMIN']}>
        <h1>Canchas</h1>
        <p role="alert">Tu cuenta administradora no tiene una sede asignada.</p>
      </DisposicionRol>
    );
  }
  const base = await baseUrlLocal();
  const galleta = (await cookies()).get('access_token')?.value ?? '';
  const params = await searchParams;
  const sede = sesion.rol === 'ADMIN' ? String(sesion.sedeId) : (params.sede ?? '');
  const cabeceras = { cookie: `access_token=${galleta}` };
  let sedes: Array<{ id: number; nombre: string }> = [];
  let iniciales: CanchaAdmin[] = [];
  let tarifas: TarifaOpcion[] = [];
  try {
    const [sedesR, canchasR, tarifasR] = await Promise.all([
      fetch(`${base}/api/sedes?incluirPruebas=1`, { headers: cabeceras, cache: 'no-store' }).catch(() => null),
      sede
        ? fetch(`${base}/api/canchas?sedeId=${sede}`, { headers: cabeceras, cache: 'no-store' }).catch(() => null)
        : Promise.resolve(null),
      sede
        ? fetch(`${base}/api/tarifas?sedeId=${sede}`, { headers: cabeceras, cache: 'no-store' }).catch(() => null)
        : Promise.resolve(null),
    ]);
    sedes = (await jsonSeguro<{ sedes: Array<{ id: number; nombre: string }> }>(sedesR, { sedes: [] })).sedes;
    iniciales = (await jsonSeguro<{ canchas: CanchaAdmin[] }>(canchasR, { canchas: [] })).canchas;
    tarifas = (await jsonSeguro<{ tarifas: TarifaOpcion[] }>(tarifasR, { tarifas: [] })).tarifas;
  } catch {
    sedes = [];
    iniciales = [];
    tarifas = [];
  }
  const nombreSede = sedes.find((s) => String(s.id) === sede)?.nombre ?? null;
  return (
    <DisposicionRol actual="/canchas" roles={[sesion.rol]}>
      <h1>Canchas</h1>
      <p className="app-subtitulo">
        {sesion.rol === 'ADMIN'
          ? `Canchas asignadas a ${nombreSede ?? `tu sede`}.`
          : 'Selecciona una sede para crear y administrar sus canchas.'}
      </p>
      {sesion.rol === 'SUPERADMIN' ? <SelectorSede sedes={sedes} actual={sede} base="/canchas" /> : null}
      {!sede ? (
        <p role="status">Selecciona una sede para ver sus canchas.</p>
      ) : (
        <PanelCanchas
          key={sede}
          iniciales={iniciales}
          tarifas={tarifas}
          sedeId={sede}
          soloLectura={false}
          sinEliminar={sesion.rol === 'ADMIN'}
        />
      )}
    </DisposicionRol>
  );
}
