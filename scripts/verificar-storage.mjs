#!/usr/bin/env node
// Verifica (y opcionalmente crea) el bucket de comprobantes en Supabase Storage.
// Uso: node scripts/verificar-storage.mjs [--crear]
import 'dotenv/config';

const url = process.env.SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'comprobantes';

if (!url || !clave) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  process.exit(1);
}

const cabeceras = { Authorization: `Bearer ${clave}`, apikey: clave };
const listar = await fetch(`${url}/storage/v1/bucket`, { headers: cabeceras });
if (!listar.ok) {
  console.error(`No se pudo listar los buckets (${listar.status}): ${await listar.text()}`);
  process.exit(1);
}
const buckets = await listar.json();
console.log(`Buckets: ${buckets.map((b) => `${b.id}${b.public ? ' (publico)' : ''}`).join(', ') || '(ninguno)'}`);

if (!buckets.some((b) => b.id === bucket)) {
  if (!process.argv.includes('--crear')) {
    console.log(`\nEl bucket "${bucket}" NO existe. Crealo con: node scripts/verificar-storage.mjs --crear`);
    process.exit(2);
  }
  const crear = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...cabeceras, 'content-type': 'application/json' },
    body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: 5242880 }),
  });
  if (!crear.ok) {
    console.error(`No se pudo crear el bucket (${crear.status}): ${await crear.text()}`);
    process.exit(1);
  }
  console.log(`Bucket "${bucket}" creado (privado).`);
} else {
  console.log(`\nEl bucket "${bucket}" existe.`);
}

// Prueba de subida y descarga con un PNG mínimo.
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const ruta = `comprobantes/pago/00000000-0000-4000-8000-000000000001.png`;
const subir = await fetch(`${url}/storage/v1/object/${bucket}/${ruta}`, {
  method: 'POST',
  headers: { ...cabeceras, 'content-type': 'image/png', 'x-upsert': 'false' },
  body: bytes,
});
console.log(`Subida: ${subir.status} ${subir.ok ? 'OK' : await subir.text()}`);
const baja = await fetch(`${url}/storage/v1/object/${bucket}/${ruta}`, { headers: cabeceras });
const descargado = baja.ok ? Buffer.from(await baja.arrayBuffer()) : null;
console.log(`Descarga: ${baja.status} ${descargado ? `${descargado.length} bytes` : ''}`);
console.log(
  descargado && descargado.equals(bytes)
    ? 'PRUEBA COMPLETA: el almacenamiento de comprobantes funciona.'
    : 'La descarga no coincide con la subida.',
);
