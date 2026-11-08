'use client';

import { useEffect, useState } from 'react';

const SEGUNDOS = 1800;

function formato(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Banner persistente no-modal de sesión con cuenta atrás aproximada. */
export function BannerSesion() {
  const [restan, setRestan] = useState(SEGUNDOS);
  useEffect(() => {
    const id = setInterval(() => setRestan((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div role="status" className="banner-sesion">
      Sesión activa · Tu sesión vence en {formato(restan)} · tu borrador se conserva
    </div>
  );
}
