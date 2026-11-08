import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { baseUrlLocal } from '@/lib/ui/base-url';
import { jsonSeguro } from '@/lib/ui/fetch-seguro';
import { leerSesionServidor } from '@/lib/ui/sesion';
import { DisposicionRol } from '@/components/layout/DisposicionRol';
import { PanelTarifas, type TarifaAdmin } from '@/components/admin/PanelTarifas';
import { SelectorSede } from '@/components/admin/SelectorSede';

export default async function PaginaTarifas({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string }>;
}) {
  const sesion = await leerSesionServidor();
  if (!sesion || (sesion.rol !== 'SUPERADMIN' && sesion.rol !== 'ADMIN')) redirect('/login');
  if (sesion.rol === 'ADMIN' && !sesion.sedeId) {
    return (
      <DisposicionRol actual="/tarifas" roles={['ADMIN']}>
        <h1>Tarifas</h1>
        <p role="alert">Tu cuenta administradora no tiene una sede asignada.</p>
      </DisposicionRol>
    );
  }
  const base = await baseUrlLocal();
  const galleta = (await cookies()).get('access_token')?.value ?? '';
  const params = await searchParams;
  const sede = sesion.rol === 'ADMIN' ? String(sesion.sedeId) : (params.sede ?? '');
  const cabeceras = { cookie: `access_token=${galleta}` };
  let sedes: Array<{ id: number; nombre: string; apertura: string; cierre: string }> = [];
  let iniciales: TarifaAdmin[] = [];
  try {
    const [sedesR, tarifasR] = await Promise.all([
      fetch(`${base}/api/sedes?incluirPruebas=1`, { headers: cabeceras, cache: 'no-store' }).catch(() => null),
      sede
        ? fetch(`${base}/api/tarifas?sedeId=${sede}`, { headers: cabeceras, cache: 'no-store' }).catch(() => null)
        : Promise.resolve(null),
    ]);
    sedes = (
      await jsonSeguro<{ sedes: Array<{ id: number; nombre: string; apertura: string; cierre: string }> }>(sedesR, {
        sedes: [],
      })
    ).sedes;
    iniciales = (await jsonSeguro<{ tarifas: TarifaAdmin[] }>(tarifasR, { tarifas: [] })).tarifas;
  } catch {
    sedes = [];
    iniciales = [];
  }
  const actual = sedes.find((s) => String(s.id) === sede) ?? null;
  return (
    <DisposicionRol actual="/tarifas" roles={[sesion.rol]}>
      <h1>Tarifas</h1>
      <p className="app-subtitulo">
        {sesion.rol === 'ADMIN'
          ? `Tarifas asignadas a ${actual?.nombre ?? 'tu sede'}.`
          : 'Selecciona una sede para crear y administrar sus tarifas.'}
      </p>
      {sesion.rol === 'SUPERADMIN' ? <SelectorSede sedes={sedes} actual={sede} base="/tarifas" /> : null}
      {!sede ? (
        <p role="status">Selecciona una sede para ver sus tarifas.</p>
      ) : (
        <PanelTarifas
          key={sede}
          iniciales={iniciales}
          sedeId={sede}
          horario={actual ? { apertura: actual.apertura, cierre: actual.cierre } : null}
          soloLectura={false}
        />
      )}
    </DisposicionRol>
  );
}
