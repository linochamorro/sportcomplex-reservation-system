'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type SesionPortada = { nombre: string; rol: 'SUPERADMIN' | 'ADMIN' | 'USUARIO' };

type ValorSesion = {
  sesion: SesionPortada | null;
  cargada: boolean;
  cerrarSesion: () => Promise<void>;
};

const ContextoSesion = createContext<ValorSesion>({ sesion: null, cargada: false, cerrarSesion: async () => {} });

const ETIQUETAS_ROL: Record<SesionPortada['rol'], string> = {
  SUPERADMIN: 'Superadmin',
  ADMIN: 'Administrador',
  USUARIO: 'Usuario',
};

export function ProveedorSesionPortada({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [sesion, setSesion] = useState<SesionPortada | null>(null);
  const [cargada, setCargada] = useState(false);

  useEffect(() => {
    let viva = true;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (viva && j && typeof j.nombre === 'string' && (j.rol === 'SUPERADMIN' || j.rol === 'ADMIN' || j.rol === 'USUARIO')) {
          setSesion({ nombre: j.nombre, rol: j.rol });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (viva) setCargada(true);
      });
    return () => {
      viva = false;
    };
  }, []);

  async function cerrarSesion() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    setSesion(null);
    router.replace('/');
    router.refresh();
  }

  return <ContextoSesion.Provider value={{ sesion, cargada, cerrarSesion }}>{children}</ContextoSesion.Provider>;
}

export function AccesosPortada() {
  const { sesion } = useContext(ContextoSesion);
  if (!sesion) {
    return (
      <>
        <Link href="/ayuda">Ayuda</Link>
        <Link href="/login">Iniciar sesión</Link>
        <Link className="portada-boton" href="/registro">
          Crear cuenta
        </Link>
      </>
    );
  }
  return (
    <>
      <Link href="/ayuda">Ayuda</Link>
      <MenuCuenta sesion={sesion} />
    </>
  );
}

export function AccionesPortada() {
  const { sesion } = useContext(ContextoSesion);
  if (!sesion) {
    return (
      <>
        <Link className="portada-boton portada-boton-principal" href="/registro">
          Crear mi cuenta
        </Link>
        <Link className="portada-boton secundario" href="/login">
          Ya tengo cuenta
        </Link>
      </>
    );
  }
  if (sesion.rol === 'USUARIO') {
    return (
      <>
        <Link className="portada-boton portada-boton-principal" href="/reservar">
          Reservar cancha
        </Link>
        <Link className="portada-boton secundario" href="/reservar">
          Ver mis reservas
        </Link>
      </>
    );
  }
  if (sesion.rol === 'SUPERADMIN') {
    return (
      <>
        <Link className="portada-boton portada-boton-principal" href="/configuracion">
          Abrir configuración
        </Link>
        <Link className="portada-boton secundario" href="/sedes">
          Ver sedes
        </Link>
      </>
    );
  }
  return (
    <>
      <Link className="portada-boton portada-boton-principal" href="/configuracion">
        Abrir configuración
      </Link>
      <Link className="portada-boton secundario" href="/configuracion">
        Ver el panel
      </Link>
    </>
  );
}

function MenuCuenta({ sesion }: { sesion: SesionPortada }) {
  const { cerrarSesion } = useContext(ContextoSesion);
  const [abierto, setAbierto] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const referencia = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!abierto) return;
    function alPulsar(evento: MouseEvent) {
      if (referencia.current && !referencia.current.contains(evento.target as Node)) setAbierto(false);
    }
    function alTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('mousedown', alPulsar);
    document.addEventListener('keydown', alTeclar);
    return () => {
      document.removeEventListener('mousedown', alPulsar);
      document.removeEventListener('keydown', alTeclar);
    };
  }, [abierto ]);

  async function salir() {
    setSaliendo(true);
    try {
      await cerrarSesion();
    } finally {
      setSaliendo(false);
      setAbierto(false);
    }
  }

  return (
    <div className="menu-cuenta" ref={referencia}>
      <button
        type="button"
        className="menu-cuenta-boton"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls="menu-cuenta"
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="menu-cuenta-avatar" aria-hidden="true">
          {sesion.nombre.trim().slice(0, 1).toUpperCase() || 'U'}
        </span>
        <span className="menu-cuenta-identidad">
          <strong>{sesion.nombre}</strong>
          <small>{ETIQUETAS_ROL[sesion.rol]}</small>
        </span>
      </button>
      {abierto ? (
        <div className="menu-cuenta-lista" role="menu" id="menu-cuenta">
          <Link role="menuitem" href="/configuracion" onClick={() => setAbierto(false)}>
            Configuración
          </Link>
          <Link role="menuitem" href="/mi-cuenta" onClick={() => setAbierto(false)}>
            Mi cuenta
          </Link>
          <button type="button" role="menuitem" disabled={saliendo} onClick={() => void salir()}>
            {saliendo ? 'Cerrando…' : 'Cerrar sesión'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
