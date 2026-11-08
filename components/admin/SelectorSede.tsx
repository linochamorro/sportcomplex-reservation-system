'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export type OpcionSede = { id: number; nombre: string };

export function SelectorSede({ sedes, actual, base }: { sedes: OpcionSede[]; actual: string; base: string }) {
  const router = useRouter();
  const [cambiando, cambiarRuta] = useTransition();

  function elegir(valor: string) {
    cambiarRuta(() => {
      router.replace(valor ? `${base}?sede=${valor}` : base);
    });
  }

  return (
    <div className="selector-sede">
      <label htmlFor={`selector-sede-${base.replace('/', '')}`}>
        Sede
      </label>
      <select
        id={`selector-sede-${base.replace('/', '')}`}
        value={actual}
        disabled={cambiando}
        onChange={(e) => elegir(e.target.value)}
      >
        <option value="">Seleccionar sede…</option>
        {sedes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </select>
      <span role="status">{cambiando ? 'Cargando información de la sede…' : 'El contenido se actualiza según la sede elegida.'}</span>
    </div>
  );
}
