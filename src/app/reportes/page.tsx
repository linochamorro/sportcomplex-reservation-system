import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ReporteDatos } from './ReporteDatos';
import type { Datos } from './reporte-types';
import { DisposicionRol } from '@/components/layout/DisposicionRol';
import { baseUrlLocal } from '@/lib/ui/base-url';
import { jsonSeguro } from '@/lib/ui/fetch-seguro';
import { leerSesionServidor } from '@/lib/ui/sesion';
import { mesEnLima } from '@/lib/ui/reloj-lima';

const TIPOS = [
  { id: 'ingresos', etiqueta: 'Ingresos' },
  { id: 'ocupacion', etiqueta: 'Ocupación' },
  { id: 'estados', etiqueta: 'Estados' },
  { id: 'clientes', etiqueta: 'Clientes' },
] as const;

export default async function PaginaReportes({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; mes?: string; sedeId?: string }>;
}) {
  const sesion = await leerSesionServidor();
  if (!sesion || (sesion.rol !== 'ADMIN' && sesion.rol !== 'SUPERADMIN')) redirect('/login');
  const params = await searchParams;
  const tipo = TIPOS.some((t) => t.id === params.tipo) ? (params.tipo as string) : 'ingresos';
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes ?? '') ? (params.mes as string) : mesEnLima();
  const sedeId = sesion.rol === 'ADMIN' ? String(sesion.sedeId ?? '') : (params.sedeId ?? '');
  const base = await baseUrlLocal();
  const galleta = (await cookies()).get('access_token')?.value ?? '';
  const query = new URLSearchParams({ tipo, mes, ...(sedeId ? { sedeId } : {}) }).toString();
  const respuesta = await jsonSeguro<{ datos: Datos }>(
    await fetch(`${base}/api/reportes?${query}`, { headers: { cookie: `access_token=${galleta}` }, cache: 'no-store' }).catch(() => null),
    { datos: [] as unknown as Datos },
  );
  const datos = respuesta.datos;
  const sedes =
    sesion.rol === 'SUPERADMIN'
      ? await jsonSeguro<{ sedes: Array<{ id: number; nombre: string }> }>(
          await fetch(`${base}/api/sedes?incluirPruebas=1`, { headers: { cookie: `access_token=${galleta}` }, cache: 'no-store' }).catch(() => null),
          { sedes: [] },
        ).then((j) => j.sedes)
      : [];
  const exportar = (formato: 'csv' | 'pdf') => `/api/reportes?${query}&formato=${formato}`;
  const etiquetaTipo = TIPOS.find((t) => t.id === tipo)?.etiqueta ?? 'Reporte';

  return (
    <DisposicionRol actual="/reportes" roles={['ADMIN', 'SUPERADMIN']}>
      <h1>Reportes</h1>
      <p className="app-subtitulo">Cuadros de uso del mes {mes} · mes completo, sin tope de filas.</p>
      <form className="selector-sede" method="get" action="/reportes" aria-label="Filtrar reportes">
        <label htmlFor="rep-tipo">Cuadro</label>
        <select id="rep-tipo" name="tipo" defaultValue={tipo}>
          {TIPOS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.etiqueta}
            </option>
          ))}
        </select>
        <label htmlFor="rep-mes">Mes</label>
        <input id="rep-mes" name="mes" type="month" defaultValue={mes} required />
        {sesion.rol === 'SUPERADMIN' ? (
          <>
            <label htmlFor="rep-sede">Sede</label>
            <select id="rep-sede" name="sedeId" defaultValue={sedeId}>
              <option value="">Todas</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <button type="submit" className="boton boton-secundario">
          Ver cuadro
        </button>
      </form>
      <div className="acciones-panel" role="group" aria-label="Descargar este cuadro">
        <p className="app-subtitulo">
          Descargar el cuadro «{etiquetaTipo}» de {mes}: elige el formato.
        </p>
        <div className="botones-fila">
          <Link className="boton boton-primario" href={exportar('pdf')} prefetch={false}>
            Descargar PDF
          </Link>
          <Link className="boton boton-secundario" href={exportar('csv')} prefetch={false}>
            Descargar CSV
          </Link>
        </div>
      </div>

      <ReporteDatos tipo={tipo} datos={datos} />
    </DisposicionRol>
  );
}
