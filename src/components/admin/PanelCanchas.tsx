'use client';

import { FormEvent, useState } from 'react';
import { crearCancha } from './crear-cancha';
import { prepararEdicion, prepararEliminacion } from './preparar-canchas-modales';

export type { CanchaAdmin, TarifaOpcion } from './panel-canchas-types';
import type { CanchaAdmin, FormularioCancha, Reasignacion, TarifaOpcion, VistaEliminacion } from './panel-canchas-types';
import { PanelCanchasLista } from './PanelCanchasLista';
import { PanelCanchasModalEdicion } from './PanelCanchasModalEdicion';
import { PanelCanchasModalEliminacion } from './PanelCanchasModalEliminacion';
import { PanelCanchasFormularioCreacion } from './PanelCanchasFormularioCreacion';

export function PanelCanchas({
  iniciales,
  tarifas,
  sedeId,
  soloLectura = false,
  sinEliminar = false,
}: {
  iniciales: CanchaAdmin[];
  tarifas: TarifaOpcion[];
  sedeId: string;
  soloLectura?: boolean;
  /** ADMIN: edita pero no elimina (el DELETE sigue siendo SUPERADMIN). */
  sinEliminar?: boolean;
}) {
  const [lista, setLista] = useState(iniciales);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<CanchaAdmin | null>(null);
  const [formulario, setFormulario] = useState<FormularioCancha>({ nombre: '', tarifa: '', estado: 'DISPONIBLE', motivo: '' });
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState<CanchaAdmin | null>(null);
  const [vista, setVista] = useState<VistaEliminacion | null>(null);
  const [cargandoVista, setCargandoVista] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [reasignaciones, setReasignaciones] = useState<Record<number, Reasignacion>>({});

  async function recargar() {
    const actual = await fetch(`/api/canchas?sedeId=${sedeId}`, { cache: 'no-store' });
    if (actual.ok) setLista(((await actual.json()) as { canchas: CanchaAdmin[] }).canchas);
  }

  async function crear(evento: FormEvent<HTMLFormElement>) {
    await crearCancha(evento, sedeId, recargar, setMensaje, setError, setCreando);
  }

  function abrirEdicion(cancha: CanchaAdmin) {
    prepararEdicion(cancha, setEditando, setFormulario, setErrorModal, setMensaje, setError);
  }

  function usarTarifaExistente(id: string) {
    const tarifa = tarifas.find((t) => String(t.id) === id);
    if (tarifa) setFormulario((f) => ({ ...f, tarifa: String(tarifa.montoCentavos / 100) }));
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!editando) return;
    setErrorModal(null);
    setGuardando(true);
    try {
      const r = await fetch(`/api/canchas/${editando.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nombre: formulario.nombre.trim(),
          tarifaBaseCentavos: Math.round(Number(formulario.tarifa) * 100),
          estado: formulario.estado,
          motivoNoDisponible: formulario.estado === 'NO_DISPONIBLE' ? formulario.motivo.trim() : null,
        }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo actualizar la cancha');
      await recargar();
      setEditando(null);
      setMensaje('Cancha actualizada correctamente.');
    } catch (e) {
      setErrorModal(e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo');
    } finally {
      setGuardando(false);
    }
  }

  async function cargarVista(cancha: CanchaAdmin) {
    setCargandoVista(true);
    setErrorEliminar(null);
    try {
      const r = await fetch(`/api/canchas/${cancha.id}/eliminacion`, { cache: 'no-store' });
      const j = (await r.json().catch(() => null)) as {
        error?: string;
        turnos?: Array<{ id: number; fecha: string; horaInicio: string; alternativas: Array<{ id: number }> }>;
      } | null;
      if (!r.ok || !j) throw new Error(j?.error ?? 'No se pudo revisar la cancha');
      setVista(j as NonNullable<typeof vista>);
      const inicial: typeof reasignaciones = {};
      for (const turno of j.turnos ?? []) {
        inicial[turno.id] = {
          destino: '',
          fecha: turno.fecha,
          hora: turno.horaInicio,
          libre: null,
          trabajando: false,
          error: null,
        };
      }
      setReasignaciones(inicial);
    } catch (e) {
      setErrorEliminar(e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo');
    } finally {
      setCargandoVista(false);
    }
  }

  function abrirEliminacion(cancha: CanchaAdmin) {
    prepararEliminacion(cancha, setEliminando, setVista, setErrorEliminar, setMensaje, setError, cargarVista);
  }

  function actualizarReasignacion(id: number, cambios: Partial<(typeof reasignaciones)[number]>) {
    setReasignaciones((r) => ({ ...r, [id]: { ...r[id], ...cambios, ...(cambios.destino !== undefined || cambios.fecha !== undefined || cambios.hora !== undefined ? { libre: null, error: null } : {}) } }));
  }

  async function verificar(turnoId: number, mover: boolean) {
    if (!eliminando) return;
    const seleccion = reasignaciones[turnoId];
    if (!seleccion?.destino) {
      actualizarReasignacion(turnoId, { error: 'Elige la cancha destino' });
      return;
    }
    actualizarReasignacion(turnoId, { trabajando: true, error: null });
    try {
      const r = await fetch(`/api/canchas/${eliminando.id}/reasignar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          solicitudId: turnoId,
          canchaDestinoId: Number(seleccion.destino),
          fecha: seleccion.fecha,
          horaInicio: seleccion.hora,
          ...(mover ? {} : { verificar: true }),
        }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string; libre?: boolean } | null;
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo validar el destino');
      if (mover) {
        await cargarVista(eliminando);
        await recargar();
        setMensaje('Turno reasignado correctamente.');
      } else {
        actualizarReasignacion(turnoId, { libre: j?.libre ?? false });
      }
    } catch (e) {
      actualizarReasignacion(turnoId, { error: e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo' });
    } finally {
      actualizarReasignacion(turnoId, { trabajando: false });
    }
  }
  async function eliminar() {
    if (!eliminando) return;
    setErrorEliminar(null);
    setBorrando(true);
    try {
      const r = await fetch(`/api/canchas/${eliminando.id}`, { method: 'DELETE' });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo eliminar la cancha');
      await recargar();
      setEliminando(null);
      setMensaje('Cancha eliminada correctamente.');
    } catch (e) {
      setErrorEliminar(e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo');
      if (eliminando) await cargarVista(eliminando);
    } finally {
      setBorrando(false);
    }
  }
  return (
    <>
      {soloLectura ? <p role="status">Vista de lectura: la gestión de canchas corresponde al superadmin.</p> : null}
      {!soloLectura ? <PanelCanchasFormularioCreacion creando={creando} crear={crear} /> : null}
      {error ? <div className="mensaje mensaje-error" role="alert" tabIndex={-1} ref={(el) => el?.focus()}>{error}</div> : null}
      {mensaje ? <div className="mensaje mensaje-exito" role="status">{mensaje}</div> : null}
      <PanelCanchasLista lista={lista} soloLectura={soloLectura} sinEliminar={sinEliminar} abrirEdicion={abrirEdicion} abrirEliminacion={abrirEliminacion} />
      <PanelCanchasModalEliminacion
        eliminando={eliminando} vista={vista} cargandoVista={cargandoVista} errorEliminar={errorEliminar}
        reasignaciones={reasignaciones} borrando={borrando} actualizarReasignacion={actualizarReasignacion}
        verificar={(turnoId, mover) => void verificar(turnoId, mover)} eliminar={() => void eliminar()}
        cerrar={() => setEliminando(null)}
      />
      <PanelCanchasModalEdicion
        abierta={Boolean(editando)} formulario={formulario} tarifas={tarifas} errorModal={errorModal}
        guardando={guardando} setFormulario={setFormulario} usarTarifaExistente={usarTarifaExistente}
        guardar={guardar} cerrar={() => setEditando(null)}
      />
    </>
  );
}
