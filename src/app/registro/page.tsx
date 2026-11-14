import Link from 'next/link';
import { FormularioRegistro } from '@/components/auth/FormularioRegistro';

export default function PaginaRegistro() {
  return (
    <main className="auth-shell" aria-labelledby="t-registro">
      <h1 id="t-registro">Crear cuenta</h1>
      <p className="auth-subtitulo">Completa tus datos para empezar a reservar.</p>
      <FormularioRegistro />
      <p className="auth-back">
        ¿Ya tienes cuenta? <Link href="/login">Iniciar sesión</Link>
      </p>
    </main>
  );
}
