import type { CanchaAdmin, FormularioCancha } from './panel-canchas-types';

export function prepararEdicion(
  cancha: CanchaAdmin,
  setEditando: (cancha: CanchaAdmin) => void,
  setFormulario: (formulario: FormularioCancha) => void,
  setErrorModal: (error: string | null) => void,
  setMensaje: (mensaje: string | null) => void,
  setError: (error: string | null) => void,
) {
  setEditando(cancha);
  setFormulario({ nombre: cancha.nombre, tarifa: String(cancha.tarifaBaseCentavos / 100), estado: cancha.estado, motivo: cancha.motivoNoDisponible ?? '' });
  setErrorModal(null);
  setMensaje(null);
  setError(null);
}

export function prepararEliminacion(
  cancha: CanchaAdmin,
  setEliminando: (cancha: CanchaAdmin) => void,
  setVista: (vista: null) => void,
  setErrorEliminar: (error: string | null) => void,
  setMensaje: (mensaje: string | null) => void,
  setError: (error: string | null) => void,
  cargarVista: (cancha: CanchaAdmin) => Promise<void>,
) {
  setEliminando(cancha);
  setVista(null);
  setErrorEliminar(null);
  setMensaje(null);
  setError(null);
  void cargarVista(cancha);
}
