#!/usr/bin/env node
// Convierte las capturas PNG a WebP y genera el banner del README.
// Uso: node scripts/optimizar-imagenes.mjs
import { existsSync, mkdirSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const ORIGEN = join(process.cwd(), 'docs', 'capturas-raw');
const DESTINO = join(process.cwd(), 'docs', 'images');
const ANCHO = 1600;

if (!existsSync(ORIGEN)) {
  console.error(`No existe ${ORIGEN}. Ejecuta antes: node scripts/capturar-pantallas.mjs`);
  process.exit(1);
}
mkdirSync(DESTINO, { recursive: true });

const archivos = (await readdir(ORIGEN)).filter((n) => n.endsWith('.png'));
let antes = 0;
let despues = 0;

for (const nombre of archivos) {
  const entrada = join(ORIGEN, nombre);
  const salida = join(DESTINO, nombre.replace(/\.png$/, '.webp'));
  const info = await sharp(entrada).metadata();
  const buffer = await sharp(entrada)
    .resize({ width: Math.min(ANCHO, info.width ?? ANCHO), withoutEnlargement: true })
    .webp({ quality: 82, effort: 5 })
    .toBuffer();
  await sharp(buffer).toFile(salida);
  const pesoAntes = (await stat(entrada)).size;
  antes += pesoAntes;
  despues += buffer.length;
  console.log(`${nombre} -> ${nombre.replace(/\.png$/, '.webp')}  ${(pesoAntes / 1024).toFixed(0)} kB -> ${(buffer.length / 1024).toFixed(0)} kB`);
}

console.log(`\nTotal: ${(antes / 1024 / 1024).toFixed(2)} MB -> ${(despues / 1024 / 1024).toFixed(2)} MB (${archivos.length} imagenes)`);
