'use client';

import { FormEvent, useState } from 'react';
import { FormularioCrearTarifa } from './FormularioCrearTarifa';
import { ListaTarifas } from './ListaTarifas';
import { ModalEditarTarifa } from './ModalEditarTarifa';

export type TarifaAdmin = {
  id: number;
  nombre: string;
  diasSemana: number[];
  horaInicio: string;
  horaFin: string;
  montoCentavos: number;
};

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function minutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function errorHorario(
  horaInicio: string,
  horaFin: string,
  horario: { apertura: string; cierre: string } | null,
): string | null {
  if (!horaInicio || !horaFin || !(minutos(horaInicio) < minutos(horaFin))) return 'Datos inválidos';
  if (horario && !(minutos(horario.apertura) <= minutos(horaInicio) && minutos(horaFin) <= minutos(horario.cierre))) {
    return `El horario debe estar dentro del horario de la sede (${horario.apertura}–${horario.cierre})`;
  }
  return null;
}

export function PanelTarifas({
  iniciales,
  sedeId,
  horario,
  soloLectura = false,
}: {
  iniciales: TarifaAdmin[];
  sedeId: string;
  horario: { apertura: string; cierre: string } | null;
  soloLectura?: boolean;
}) {
  const [lista, setLista] = useState(iniciales);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<TarifaAdmin | null>(null);
  const [formulario, setFormulario] = useState({ nombre: '', monto: '', horaInicio: '', horaFin: '', dias: [] as number[] });
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function recargar() {
    const actual = await fetch(`/api/tarifas?sedeId=${sedeId}`, { cache: 'no-store' });
    if (actual.ok) setLista(((await actual.json()) as { tarifas: TarifaAdmin[] }).tarifas);
  }

  function abrirEdicion(tarifa: TarifaAdmin) {
    setEditando(tarifa);
    setFormulario({
      nombre: tarifa.nombre,
      monto: String(tarifa.montoCentavos / 100),
      horaInicio: tarifa.horaInicio,
      horaFin: tarifa.horaFin,
      dias: [...tarifa.diasSemana],
    });
    setErrorModal(null);
    setMensaje(null);
    setError(null);
  }

  function alternarDia(dia: number) {
    setFormulario((f) => ({
      ...f,
      dias: f.dias.includes(dia) ? f.dias.filter((d) => d !== dia) : [...f.dias, dia].sort(),
    }));
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!editando) return;
    setErrorModal(null);
    const horarioError = errorHorario(formulario.horaInicio, formulario.horaFin, horario);
    if (horarioError) {
      setErrorModal(horarioError);
      return;
    }
    setGuardando(true);
    try {
      const r = await fetch(`/api/tarifas/${editando.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nombre: formulario.nombre.trim(),
          diasSemana: formulario.dias,
          horaInicio: formulario.horaInicio,
          horaFin: formulario.horaFin,
          montoCentavos: Math.round(Number(formulario.monto) * 100),
        }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo actualizar la tarifa');
      await recargar();
      setEditando(null);
      setMensaje('Tarifa actualizada correctamente.');
    } catch (e) {
      setErrorModal(e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo');
    } finally {
      setGuardando(false);
    }
  }

  async function crear(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    setMensaje(null);
    setError(null);
    setCreando(true);
    try {
      const datos = new FormData(formulario);
      const dias = DIAS.map((_, i) => (datos.get(`dia-${i}`) === 'on' ? i : -1)).filter((d) => d >= 0);
      const horarioError = errorHorario(String(datos.get('horaInicio') ?? ''), String(datos.get('horaFin') ?? ''), horario);
      if (horarioError) throw new Error(horarioError);
      const r = await fetch('/api/tarifas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sedeId: Number(sedeId),
          nombre: String(datos.get('nombre') ?? '').trim(),
          diasSemana: dias,
          horaInicio: datos.get('horaInicio'),
          horaFin: datos.get('horaFin'),
          montoCentavos: Math.round(Number(datos.get('monto')) * 100),
        }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo crear la tarifa');
      await recargar();
      setMensaje('Tarifa creada correctamente.');
      formulario.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo');
    } finally {
      setCreando(false);
    }
  }

  return (
    <>
      {soloLectura ? <p role="status">Vista de lectura: la gestión de tarifas corresponde al superadmin.</p> : null}
      {!soloLectura ? (
        <FormularioCrearTarifa horario={horario} creando={creando} onSubmit={crear} />
      ) : null}
      {error ? (
        <div className="mensaje mensaje-error" role="alert" tabIndex={-1} ref={(el) => el?.focus()}>
          {error}
        </div>
      ) : null}
      {mensaje ? (
        <div className="mensaje mensaje-exito" role="status">
          {mensaje}
        </div>
      ) : null}
      <ListaTarifas lista={lista} soloLectura={soloLectura} onEditar={abrirEdicion} />
      {editando ? (
        <ModalEditarTarifa
          horario={horario}
          formulario={formulario}
          errorModal={errorModal}
          guardando={guardando}
          onSubmit={guardar}
          onFormularioChange={setFormulario}
          onAlternarDia={alternarDia}
          onCancelar={() => setEditando(null)}
        />
      ) : null}
    </>
  );
}
