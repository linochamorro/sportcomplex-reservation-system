import { cookies } from 'next/headers';
import { DisposicionRol } from '@/components/layout/DisposicionRol';
import { FormularioSolicitud } from '@/components/reservas/FormularioSolicitud';
import { ListaReservas } from '@/components/reservas/ListaReservas';
import { baseUrlLocal } from '@/lib/ui/base-url';
import { jsonSeguro } from '@/lib/ui/fetch-seguro';

export default async function PaginaReservar() {
  const base = await baseUrlLocal();
  const galleta = (await cookies()).get('access_token')?.value ?? '';
  const cabeceras = { cookie: `access_token=${galleta}` };
  let reservas: Array<{
    id: number;
    canchaId: number;
    fecha: string;
    horaInicio: string;
    horaFin: string;
    estado: string;
    montoTotalCentavos: number;
    motivo: string | null;
    limiteHold: string | null;
  }> = [];
  let canchas: Array<{ id: number; nombre: string }> = [];
  try {
    const [solR, sedesR] = await Promise.all([
      fetch(`${base}/api/solicitudes`, { headers: cabeceras, cache: 'no-store' }).catch(() => null),
      fetch(`${base}/api/sedes`, { headers: cabeceras, cache: 'no-store' }).catch(() => null),
    ]);
    reservas = (await jsonSeguro<{ solicitudes: typeof reservas }>(solR, { solicitudes: [] })).solicitudes;
    const sedes = (await jsonSeguro<{ sedes: Array<{ id: number }> }>(sedesR, { sedes: [] })).sedes;
    const listas = await Promise.all(
      sedes.map(async (s) =>
        jsonSeguro<{ canchas: typeof canchas }>(
          await fetch(`${base}/api/canchas?sedeId=${s.id}`, { headers: cabeceras, cache: 'no-store' }).catch(() => null),
          { canchas: [] },
        ),
      ),
    );
    canchas = listas.flatMap((j) => j.canchas);
  } catch {
    reservas = [];
    canchas = [];
  }
  const porCancha = new Map(canchas.map((c) => [c.id, c.nombre]));
  return (
    <DisposicionRol actual="/reservar" roles={['USUARIO']}>
      <h1>Reservas</h1>
      <p className="app-subtitulo">Crea una reserva y revisa el estado, fecha, hora y costo de cada turno.</p>
      <FormularioSolicitud />
      <section className="panel" aria-label="Lista de reservas">
        <div className="encabezado-panel">
          <h2>Mis reservas</h2>
          <p>{reservas.length === 0 ? 'Todavía no tienes reservas.' : `${reservas.length} reservas registradas.`}</p>
        </div>
        <ListaReservas
          reservas={reservas.map((r) => ({
            ...r,
            canchaNombre: porCancha.get(r.canchaId) ?? `Cancha ${r.canchaId}`,
          }))}
        />
      </section>
    </DisposicionRol>
  );
}
