import type { Metadata } from 'next';
import Link from 'next/link';
import { AccesosPortada, AccionesPortada, ProveedorSesionPortada } from '@/components/public/SesionPortada';
import { ImagenHero } from '@/components/public/ImagenHero';

export const metadata: Metadata = {
  title: 'Reservas deportivas',
  description: 'Reserva canchas por turnos, consulta tu agenda y gestiona tu club desde un solo lugar.',
};

const ventajas = [
  {
    titulo: 'Reserva en minutos',
    texto: 'Elige sede, cancha, fecha y horario con disponibilidad clara.',
  },
  {
    titulo: 'Sigue cada turno',
    texto: 'Consulta tus reservas, estados y recordatorios desde cualquier dispositivo.',
  },
  {
    titulo: 'Disponible sin conexión',
    texto: 'Tu solicitud queda preparada y se sincroniza cuando vuelva la conexión.',
  },
];

export default function PaginaRaiz() {
  return (
    <ProveedorSesionPortada>
      <div className="portada">
      <header className="portada-cabecera">
        <Link className="portada-marca" href="/">
          Reservas deportivas
        </Link>
        <nav aria-label="Navegación pública">
          <AccesosPortada />
        </nav>
      </header>

      <main>
        <section className="portada-hero" aria-labelledby="titulo-portada">
          <div>
            <p className="portada-kicker">Tu próxima cancha, sin vueltas</p>
            <h1 id="titulo-portada">Reservas deportivas</h1>
            <p className="portada-lead">
              Reserva canchas por turnos, consulta tu agenda y mantente al día desde cualquier dispositivo.
            </p>
            <div className="portada-acciones">
              <AccionesPortada />
            </div>
          </div>
          <div className="portada-hero-lateral">
            <ImagenHero />
            <aside className="portada-resumen" aria-label="Resumen del servicio">
              <span>Tu agenda, clara</span>
              <strong>Reserva · confirma · consulta</strong>
              <p>Turnos por hora y estado visible en cada momento.</p>
            </aside>
          </div>
        </section>

        <section className="portada-ventajas" aria-labelledby="titulo-ventajas">
          <div className="portada-seccion-titulo">
            <p className="portada-kicker">Simple desde el inicio</p>
            <h2 id="titulo-ventajas">Todo lo necesario para jugar</h2>
          </div>
          <div className="portada-tarjetas">
            {ventajas.map((ventaja) => (
              <article key={ventaja.titulo}>
                <h3>{ventaja.titulo}</h3>
                <p>{ventaja.texto}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="portada-pie">
        <p>Reservas deportivas · Canchas por turnos</p>
        <Link href="/ayuda">Centro de ayuda</Link>
      </footer>
      </div>
    </ProveedorSesionPortada>
  );
}
