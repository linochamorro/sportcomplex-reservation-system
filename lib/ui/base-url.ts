import { headers } from 'next/headers';

/** Base URL del mismo despliegue, derivada del host entrante (dev, e2e, prod). */
export async function baseUrlLocal(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return (
    process.env.NEXT_PUBLIC_BASE_URL ?? `${proto}://${host}`
  );
}
