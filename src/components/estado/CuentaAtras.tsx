'use client';

import { useEffect, useState } from 'react';

function formato(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Cuenta atrás viva del hold (role=timer, sin live agresivo). */
export function CuentaAtras({ limiteIso }: { limiteIso: string }) {
  const [texto, setTexto] = useState('--:--');
  useEffect(() => {
    const limite = new Date(limiteIso).getTime();
    const tick = () => setTexto(formato(limite - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [limiteIso]);
  return (
    <span role="timer" aria-live="off">
      {texto}
    </span>
  );
}
