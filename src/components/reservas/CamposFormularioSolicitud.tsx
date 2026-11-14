'use client';

import { InsigniaEstado } from '@/components/estado/InsigniaEstado';
import { precioCancha } from './precio-tarifa';
import type { EstadoSincronizacion } from '@/lib/offline/usar-sincronizacion';

type Sede = { id: number; nombre: string };
type Cancha = { id: number; nombre: string; tarifaBaseCentavos: number };
type Tarifa = { id: number; nombre: string; diasSemana: number[]; horaInicio: string; horaFin: string; montoCentavos: number };

export function CamposFormularioSolicitud({
  enviar, sedes, sedeId, elegirSede, canchaId, setCanchaId, canchas, tarifas,
  fecha, setFecha, hoy, horaInicio, setHoraInicio, avisoTurno, montoMostrar,
  error, ok, pendientes, estado, enviando,
}: {
  enviar: (formulario: FormData) => void;
  sedes: Sede[];
  sedeId: string;
  elegirSede: (valor: string) => void;
  canchaId: string;
  setCanchaId: (valor: string) => void;
  canchas: Cancha[];
  tarifas: Tarifa[];
  fecha: string;
  setFecha: (valor: string) => void;
  hoy: string;
  horaInicio: string;
  setHoraInicio: (valor: string) => void;
  avisoTurno: string | null;
  montoMostrar: { texto: string; monto: number } | null;
  error: string | null;
  ok: string | null;
  pendientes: number;
  estado: EstadoSincronizacion;
  enviando: boolean;
}) {
  return (
    <form action={(f) => void enviar(f)} aria-label="Solicitar reserva">
      <label>
        Sede
        <select name="sedeId" value={sedeId} onChange={(e) => elegirSede(e.target.value)} required>
          <option value="">Elegir sede…</option>
          {sedes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </label>
      <label>
        Cancha
        <select name="canchaId" required disabled={!sedeId} value={canchaId} aria-describedby="reserva-cancha-ayuda" onChange={(e) => setCanchaId(e.target.value)}>
          <option value="">Elegir cancha…</option>
          {canchas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} · {precioCancha(c, tarifas)}
            </option>
          ))}
        </select>
      </label>
      <p id="reserva-cancha-ayuda">
        {tarifas.length === 0
          ? 'Esta sede no tiene tarifas configuradas.'
          : 'El precio se define según el día y la hora del turno; se muestra al elegir fecha y hora.'}
      </p>
      <label>
        Fecha
        {/* Sin `min` nativo: su tooltip genérico tapaba el error de hora real. */}
        <input
          name="fecha"
          type="date"
          required
          value={fecha}
          aria-describedby="reserva-fecha-ayuda"
          onChange={(e) => setFecha(e.target.value)}
        />
      </label>
      <p id="reserva-fecha-ayuda">No se puede reservar en fechas pasadas. Hoy en Lima: {hoy}.</p>
      <label>
        Hora de inicio (formato 24 h, bloques de 60 min)
        <input
          name="horaInicio"
          type="time"
          step={3600}
          required
          value={horaInicio}
          aria-describedby="reserva-hora-ayuda"
          onChange={(e) => setHoraInicio(e.target.value)}
        />
      </label>
      <p id="reserva-hora-ayuda">Usa el formato de 24 horas: 08:00, 17:00, 20:00, 21:00 (no AM/PM).</p>
      {avisoTurno ? (
        <p role="status" className="aviso-turno">
          {avisoTurno}
        </p>
      ) : null}
      {montoMostrar ? <p role="status">Tarifa aplicable: {montoMostrar.texto}.</p> : null}
      <p id="reserva-condicion-texto">
        Solo horas en punto y turnos futuros. Puedes reservar hasta 15 minutos antes del inicio. La administración tiene 3
        horas para confirmar; pasado ese plazo la cancha se libera. La reserva no se puede cancelar.
      </p>
      <label>
        <input name="acepta" type="checkbox" aria-describedby="reserva-condicion-texto" /> Acepto la condición de no
        cancelación
      </label>
      {error ? (
        <div role="alert" tabIndex={-1} ref={(el) => el?.focus()}>
          {error}
        </div>
      ) : null}
      {ok ? <div role="status">{ok}</div> : null}
      {pendientes > 0 ? (
        <p role="status" aria-label="Solicitudes en cola">
          <InsigniaEstado estado={estado === 'sincronizando' ? 'sincronizando' : 'pendiente-envio'} />
          <span>
            {pendientes === 1 ? '1 solicitud en cola' : `${pendientes} solicitudes en cola`}: se envían
            automáticamente.
          </span>
        </p>
      ) : null}
      <button type="submit" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Solicitar'}
      </button>
    </form>
  );
}
