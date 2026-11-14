'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CORTE_RESERVA_MINUTOS, fechaEnLima, horaEnPunto, minutosPara } from '@/lib/ui/reloj-lima';
import { CamposFormularioSolicitud } from './CamposFormularioSolicitud';
import { encolarOp, estaOfflineDisponible } from '@/lib/offline/bd-local';
import { decidirEnvio, mensajeEncolado, type RespuestaEnvio } from '@/lib/offline/decidir-envio';
import { useSincronizacion } from '@/lib/offline/usar-sincronizacion';
import { tarifaAplicable, precioCancha } from './precio-tarifa';
export { tarifaAplicable, precioCancha } from './precio-tarifa';

type Sede = { id: number; nombre: string };
type Cancha = { id: number; nombre: string; tarifaBaseCentavos: number };
type Tarifa = { id: number; nombre: string; diasSemana: number[]; horaInicio: string; horaFin: string; montoCentavos: number };


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
    <CamposFormularioSolicitud
      enviar={enviar}
      sedes={sedes}
      sedeId={sedeId}
      elegirSede={elegirSede}
      canchaId={canchaId}
      setCanchaId={setCanchaId}
      canchas={canchas}
      tarifas={tarifas}
      fecha={fecha}
      setFecha={setFecha}
      hoy={hoy}
      horaInicio={horaInicio}
      setHoraInicio={setHoraInicio}
      avisoTurno={avisoTurno}
      montoMostrar={montoMostrar}
      error={error}
      ok={ok}
      pendientes={pendientes}
      estado={estado}
      enviando={enviando}
    />
  );
}
