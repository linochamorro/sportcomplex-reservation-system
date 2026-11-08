import { cookies } from 'next/headers';
import { baseUrlLocal } from '@/lib/ui/base-url';
import { jsonSeguro } from '@/lib/ui/fetch-seguro';
import { DisposicionRol } from '@/components/layout/DisposicionRol';
import { PanelSedes, type Sede } from '@/components/admin/PanelSedes';

export default async function PaginaSedes() {
  const base = await baseUrlLocal();
  const galleta = (await cookies()).get('access_token')?.value ?? '';
  let iniciales: Sede[] = [];
  try {
    const r = await fetch(`${base}/api/sedes?incluirPruebas=1`, { headers: { cookie: `access_token=${galleta}` }, cache: 'no-store' }).catch(() => null);
    iniciales = (await jsonSeguro<{ sedes: Sede[] }>(r, { sedes: [] })).sedes;
  } catch {
    iniciales = [];
  }
  return (
    <DisposicionRol actual="/sedes" roles={['SUPERADMIN']}>
      <h1>Sedes</h1>
      <p className="app-subtitulo">Crea, edita o desactiva las sedes disponibles en la plataforma.</p>
      <PanelSedes iniciales={iniciales} />
    </DisposicionRol>
  );
}
