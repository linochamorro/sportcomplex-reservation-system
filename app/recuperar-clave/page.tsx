import Link from 'next/link';
import { FormularioRecuperar } from '@/components/auth/FormularioRecuperar';

export default async function PaginaRecuperar({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="auth-shell auth-recovery" aria-labelledby="t-recuperar">
      <h1 id="t-recuperar">Recuperar clave</h1>
      <p className="auth-subtitulo">Solicita un enlace seguro o define una nueva clave con el código recibido.</p>
      <FormularioRecuperar tokenInicial={params.token ?? ''} />
      <p className="auth-back">
        <Link href="/login">Volver a iniciar sesión</Link>
      </p>
    </main>
  );
}
