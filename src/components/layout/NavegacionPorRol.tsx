import Link from 'next/link';

export type Destino = { href: string; etiqueta: string; insignia?: string };

export const DESTINOS: Record<'USUARIO' | 'ADMIN' | 'SUPERADMIN', Destino[]> = {
  USUARIO: [
    { href: '/configuracion', etiqueta: 'Dashboard' },
    { href: '/reservar', etiqueta: 'Reservas' },
  ],
  ADMIN: [
    { href: '/configuracion', etiqueta: 'Dashboard' },
    { href: '/pendientes', etiqueta: 'Pendientes' },
    { href: '/bloqueos', etiqueta: 'Mantenimiento' },
    { href: '/canchas', etiqueta: 'Canchas' },
    { href: '/tarifas', etiqueta: 'Tarifas' },
    { href: '/kpis', etiqueta: 'Indicadores' },
    { href: '/reportes', etiqueta: 'Reportes' },
  ],
  SUPERADMIN: [
    { href: '/configuracion', etiqueta: 'Dashboard' },
    { href: '/sedes', etiqueta: 'Sedes' },
    { href: '/canchas', etiqueta: 'Canchas' },
    { href: '/tarifas', etiqueta: 'Tarifas' },
    { href: '/usuarios', etiqueta: 'Administrador' },
    { href: '/reportes', etiqueta: 'Reportes' },
  ],
};

/** Navegación dual por rol con contadores vivos (nunca ficticios). */
export function NavegacionPorRol({
  rol,
  actual,
  pendientes,
  noLeidas,
}: {
  rol: 'USUARIO' | 'ADMIN' | 'SUPERADMIN';
  actual: string;
  pendientes?: number;
  noLeidas?: number;
}) {
  const conInsignias = DESTINOS[rol].map((d) => {
    if (d.href === '/pendientes' && pendientes != null && pendientes > 0) {
      return { ...d, insignia: `${pendientes} pendientes` };
    }
    if (d.href === '/notificaciones' && noLeidas != null && noLeidas > 0) {
      return { ...d, insignia: `${noLeidas} sin leer` };
    }
    return d;
  });
  return (
    <>
      <nav className="app-nav" aria-label="Navegación principal">
        <ul>
          {conInsignias.map((d) => (
            <li key={d.href}>
              <Link href={d.href} aria-current={actual === d.href ? 'page' : undefined}>
                {d.etiqueta}
                {d.insignia ? ` (${d.insignia})` : ''}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <nav className="app-nav app-nav-bottom" aria-label={`Navegación inferior (${rol.toLowerCase()})`}>
        <ul>
          {conInsignias.map((d) => (
            <li key={d.href}>
              <Link href={d.href} aria-current={actual === d.href ? 'page' : undefined}>
                {d.etiqueta}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
