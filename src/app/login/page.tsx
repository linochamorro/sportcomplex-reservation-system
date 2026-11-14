import Link from 'next/link';
import { FormularioLogin } from '@/components/auth/FormularioLogin';

export default function PaginaLogin() {
  return (
    <main className="auth-shell" aria-labelledby="t-login">
      <h1 id="t-login">Iniciar sesión</h1>
      <p className="auth-subtitulo">Accede con tu cuenta para gestionar tus reservas.</p>
      <FormularioLogin />
      <p className="auth-back">
        ¿Sin cuenta? <Link href="/registro">Crear cuenta</Link> · <Link href="/recuperar-clave">Recuperar clave</Link>
      </p>
    </main>
  );
}
