import { cookies } from 'next/headers';
import { baseUrlLocal } from '@/lib/ui/base-url';
import { jsonSeguro } from '@/lib/ui/fetch-seguro';
import { DisposicionRol } from '@/components/layout/DisposicionRol';
import { PanelUsuarios, type UsuarioAdmin } from '@/components/admin/PanelUsuarios';

export default async function PaginaUsuarios() {
  const base = await baseUrlLocal();
  const galleta = (await cookies()).get('access_token')?.value ?? '';
  let iniciales: UsuarioAdmin[] = [];
  let sedes: Array<{ id: number; nombre: string }> = [];
  try {
    const [usuariosR, sedesR] = await Promise.all([
      fetch(`${base}/api/usuarios`, { headers: { cookie: `access_token=${galleta}` }, cache: 'no-store' }).catch(() => null),
      fetch(`${base}/api/sedes`, { headers: { cookie: `access_token=${galleta}` }, cache: 'no-store' }).catch(() => null),
    ]);
    iniciales = (await jsonSeguro<{ usuarios: UsuarioAdmin[] }>(usuariosR, { usuarios: [] })).usuarios;
    sedes = (await jsonSeguro<{ sedes: Array<{ id: number; nombre: string }> }>(sedesR, { sedes: [] })).sedes;
  } catch {
    iniciales = [];
    sedes = [];
  }
  return (
    <DisposicionRol actual="/usuarios" roles={['SUPERADMIN']}>
      <h1>Administrador</h1>
      <p className="app-subtitulo">Crea administradores y consulta administradores y superadmin registrados.</p>
      <PanelUsuarios iniciales={iniciales} sedes={sedes} />
    </DisposicionRol>
  );
}
