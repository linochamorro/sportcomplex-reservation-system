'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CORTE_RESERVA_MINUTOS, fechaEnLima, horaEnPunto, minutosPara } from '@/lib/ui/reloj-lima';
import { InsigniaEstado } from '@/components/estado/InsigniaEstado';
import { encolarOp, estaOfflineDisponible } from '@/lib/offline/bd-local';
import { decidirEnvio, mensajeEncolado, type RespuestaEnvio } from '@/lib/offline/decidir-envio';
import { useSincronizacion } from '@/lib/offline/usar-sincronizacion';

type Sede = { id: number; nombre: string };
type Cancha = { id: number; nombre: string; tarifaBaseCentavos: number };
type Tarifa = { id: number; nombre: string; diasSemana: number[]; horaInicio: string; horaFin: string; montoCentavos: number };

function minutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function diaSemana(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Tarifa vigente para sede + día + hora, o null si aplica la base de la cancha. */
export function tarifaAplicable(tarifas: Tarifa[], fecha: string, horaInicio: string): Tarifa | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(horaInicio)) return null;
  const dow = diaSemana(fecha);
  const min = minutos(horaInicio);
  return tarifas.find((t) => t.diasSemana.includes(dow) && minutos(t.horaInicio) <= min && min < minutos(t.horaFin)) ?? null;
}

/**
 * Precio orientativo de la cancha: rango real de las tarifas de la sede (el
 * cobro sale de la tarifa que aplica al día y hora). Nunca anuncia la tarifa
 * base como si fuera el precio final, porque puede no existir en ninguna tarifa.
 */
export function precioCancha(cancha: Cancha, tarifas: Tarifa[]): string {
  const montos = tarifas.map((t) => t.montoCentavos);
  if (montos.length === 0) return 'sin tarifa configurada';
  const min = Math.min(...montos);
  const max = Math.max(...montos);
  return min === max ? `S/ ${min / 100} por hora` : `S/ ${min / 100} a S/ ${max / 100} según día y hora`;
}

/** Formulario de solicitud con validación espejo y condición de no-cancelación. */
export function FormularioSolicitud() {
  const router = useRouter();
  const ruta = usePathname();
  const refrescarVista = useCallback(() => router.refresh(), [router]);
  const { estado, pendientes, sincronizarAhora } = useSincronizacion(refrescarVista);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [canchas, setCanchas] = useState<Cancha[]>([]);
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [sedeId, setSedeId] = useState('');
  const [canchaId, setCanchaId] = useState('');
  const [fecha, setFecha] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Hoy en hora de Lima: a las 19:00 en Lima ya es el día siguiente en UTC.
  const hoy = fechaEnLima();

  useEffect(() => {
    fetch('/api/sedes')
      .then((r) => r.json())
      .then((j) => setSedes((j as { sedes: Sede[] }).sedes ?? []))
      .catch(() => setError('Revisa tu conexión e inténtalo de nuevo'));
  }, []);

  useEffect(() => {
    if (!sedeId) return;
    let viva = true;
    fetch(`/api/canchas?sedeId=${sedeId}&soloDisponibles=1`)
      .then((r) => r.json())
      .then((j) => {
        if (viva) setCanchas((j as { canchas: Cancha[] }).canchas ?? []);
      })
      .catch(() => {
        if (viva) setError('Revisa tu conexión e inténtalo de nuevo');
      });
    fetch(`/api/tarifas?sedeId=${sedeId}`)
      .then((r) => (r.ok ? r.json() : { tarifas: [] }))
      .then((j) => {
        if (viva) setTarifas((j as { tarifas: Tarifa[] }).tarifas ?? []);
      })
      .catch(() => {});
    return () => {
      viva = false;
    };
  }, [sedeId]);

  function elegirSede(valor: string) {
    setSedeId(valor);
    setCanchaId('');
    if (!valor) {
      setCanchas([]);
      setTarifas([]);
    }
  }

  const canchaElegida = canchas.find((c) => String(c.id) === canchaId) ?? null;
  const tarifaVigente = tarifaAplicable(tarifas, fecha, horaInicio);
  const montoMostrar =
    tarifaVigente != null
      ? { texto: `${tarifaVigente.nombre} · ${tarifaVigente.montoCentavos / 100} soles`, monto: tarifaVigente.montoCentavos }
      : canchaElegida != null
        ? { texto: `Tarifa base de la cancha · ${canchaElegida.tarifaBaseCentavos / 100} soles`, monto: canchaElegida.tarifaBaseCentavos }
        : null;
  // Aviso en vivo al elegir fecha/hora (evita descubrir el error al enviar).
  const avisoTurno = fecha !== '' && horaInicio !== '' ? validarLocal() : null;

  /**
   * Espejo de `validarReserva` (el backend decide): en punto, futuro y corte de
   * 15 min, siempre contra la hora de Lima. La fecha se compara como texto
   * AAAA-MM-DD para no desalinear el día por zona horaria.
   */
  function validarLocal(): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return 'Elige una fecha';
    if (!horaEnPunto(horaInicio)) {
      return 'La reserva debe ser en hora en punto (ej. 17:00, 18:00, 20:00, 21:00)';
    }
    if (fecha < hoy) return 'No puedes reservar en una fecha pasada';
    const faltan = minutosPara(fecha, horaInicio);
    if (faltan <= 0) return 'El horario debe estar en el futuro';
    if (faltan <= CORTE_RESERVA_MINUTOS) {
      return `La reserva debe hacerse hasta ${CORTE_RESERVA_MINUTOS} minutos antes del inicio del horario`;
    }
    return null;
  }

  async function enviar(formulario: FormData) {
    setError(null);
    setOk(null);
    const acepta = formulario.get('acepta') === 'on';
    if (!acepta) {
      setError('Debes aceptar la condición de no cancelación para enviar la solicitud');
      return;
    }
    const falloLocal = validarLocal();
    if (falloLocal) {
      setError(falloLocal);
      return;
    }
    setEnviando(true);
    const carga = {
      canchaId: Number(formulario.get('canchaId')),
      fecha: formulario.get('fecha'),
      horaInicio: formulario.get('horaInicio'),
    };
    let respuesta: RespuestaEnvio;
    try {
      const r = await fetch('/api/solicitudes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(carga),
      });
      respuesta = { tipo: 'respuesta', estado: r.status, cuerpo: await r.json().catch(() => null) };
    } catch {
      respuesta = { tipo: 'red' };
    }
    try {
      const decision = decidirEnvio(respuesta);
      if (decision.accion === 'aceptada') {
        setOk(`Solicitud creada. Monto: ${decision.montoCentavos / 100} soles.`);
        if (ruta === '/reservar') router.refresh();
        else router.push('/reservar');
        return;
      }
      if (decision.accion === 'error') {
        setError(decision.mensaje);
        return;
      }
      // Reintentable: la operación va a la outbox con su clienteOpId, así el
      // reintento es idempotente y no duplica la reserva.
      if (!estaOfflineDisponible()) {
        setError('No se pudo guardar la solicitud en este dispositivo. No se creó ninguna reserva.');
        return;
      }
      try {
        await encolarOp({
          clienteOpId: crypto.randomUUID(),
          tipo: 'solicitud.crear',
          // El procesador del servidor solo lee estos tres campos; mandarlos
          // exactos mantiene el hash de carga estable entre reintentos.
          carga,
        });
        setError(null);
        setOk(mensajeEncolado(decision.motivo));
        void sincronizarAhora();
      } catch {
        setError('No se pudo guardar la solicitud en este dispositivo. No se creó ninguna reserva.');
      }
    } finally {
      setEnviando(false);
    }
  }

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
