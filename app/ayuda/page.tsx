import { DisposicionRol } from '@/components/layout/DisposicionRol';

export default function PaginaAyuda() {
  return (
    <DisposicionRol actual="/ayuda" roles={['USUARIO']}>
      <h1>Ayuda</h1>
      <section aria-label="Cómo reservar">
        <h2>Cómo reservar</h2>
        <p>
          Elija sede, cancha, fecha y hora. Las horas van en formato 24 h (08:00, 17:00, 20:00, 21:00) y solo en punto.
          Puede solicitar hasta 15 minutos antes del inicio. Cada bloque son 60 minutos y la reserva no se puede cancelar.
        </p>
      </section>
      <section aria-label="Plazo de confirmación">
        <h2>Plazo de confirmación</h2>
        <p>
          La administración tiene 3 horas para confirmar la reserva. Si no responde dentro de ese plazo, la cancha se
          libera automáticamente y su reserva figura como liberada.
        </p>
      </section>
      <section aria-label="Sin conexión">
        <h2>Sin conexión</h2>
        <p>
          Su solicitud se guarda en el dispositivo y se envía al conectar. El plazo de 3 horas para confirmar comienza
          en el servidor, con hora exacta de creación.
        </p>
      </section>
    </DisposicionRol>
  );
}
