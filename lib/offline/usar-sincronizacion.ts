'use client';

import { useCallback, useEffect, useState } from 'react';
import { estaOfflineDisponible } from './bd-local';
import { pendientesEnCola, puertaHttp } from './puerta-http';
import { sincronizar, type ResultadoSync } from './sincronizar';

const INTERVALO_MS = 30_000;

export type EstadoSincronizacion = 'inactivo' | 'sincronizando' | 'sincronizado' | 'fallido';

/**
 * Una sola sincronización por pestaña, no una por componente: varias vistas
 * pueden pedirla a la vez y empujar el mismo lote dos veces. Vive a nivel de
 * módulo a propósito, que es justo el alcance de "esta pestaña".
 */
let enCurso = false;

/**
 * Dispara la sincronización: al montar, al volver la conexión, y cada 30 s
 * mientras haya algo en cola. No lo hace si no hay nada pendiente, para no
 * gastar peticiones en cada página.
 *
 * `alSincronizar` debe ser estable (memorizarlo en el que llama): si cambia de
 * identidad se Rearranca el efecto y se vuelve a revisar la cola.
 *
 * Tras una sincronización con cambios llama a `alSincronizar` para que la vista
 * se refresque: la reserva que estaba en cola recién existe en el servidor.
 */
export function useSincronizacion(alSincronizar?: () => void) {
  const [estado, setEstado] = useState<EstadoSincronizacion>('inactivo');
  const [pendientes, setPendientes] = useState(0);

  const sincronizarAhora = useCallback(async () => {
    if (enCurso) return;
    enCurso = true;
    setEstado('sincronizando');
    try {
      const resultado: ResultadoSync = await sincronizar(puertaHttp());
      setPendientes(await pendientesEnCola());
      if (resultado.abortada) {
        // Sin sesión o red caída: no es un fallo, es "inténtalo luego".
        setEstado('inactivo');
      } else {
        setEstado('sincronizado');
        if (resultado.empujadas > 0) alSincronizar?.();
      }
    } catch {
      setEstado('fallido');
    } finally {
      enCurso = false;
    }
  }, [alSincronizar]);

  useEffect(() => {
    if (!estaOfflineDisponible()) return;
    let vivo = true;

    async function revisar() {
      const enCola = await pendientesEnCola();
      if (!vivo) return;
      setPendientes(enCola);
      if (enCola > 0) void sincronizarAhora();
    }

    void revisar();
    const alConectar = () => void sincronizarAhora();
    window.addEventListener('online', alConectar);
    const reloj = window.setInterval(() => void revisar(), INTERVALO_MS);
    return () => {
      vivo = false;
      window.removeEventListener('online', alConectar);
      window.clearInterval(reloj);
    };
  }, [sincronizarAhora]);

  return { estado, pendientes, sincronizarAhora };
}
