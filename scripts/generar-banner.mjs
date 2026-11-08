#!/usr/bin/env node
// Genera docs/images/banner.webp a partir del hero real del producto.
// Uso: node scripts/generar-banner.mjs
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const HERO = join(process.cwd(), 'public', 'imagenes', 'hero-reservas.png');
const DESTINO = join(process.cwd(), 'docs', 'images');
const SALIDA = join(DESTINO, 'banner.webp');
const ANCHO = 1600;
const ALTO = 720;

if (!existsSync(HERO)) {
  console.error(`Falta ${HERO}`);
  process.exit(1);
}
mkdirSync(DESTINO, { recursive: true });

// Capa de texto sobre el hero: se ve el producto real, sin inventar cifras.
const capa = `<svg width="${ANCHO}" height="${ALTO}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="velo" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#04240f" stop-opacity="0.88"/>
      <stop offset="55%" stop-color="#04240f" stop-opacity="0.62"/>
      <stop offset="100%" stop-color="#04240f" stop-opacity="0.12"/>
    </linearGradient>
  </defs>
  <rect width="${ANCHO}" height="${ALTO}" fill="url(#velo)"/>
  <text x="80" y="330" font-family="Barlow Condensed, Impact, sans-serif" font-size="104"
        font-weight="700" fill="#ffffff" letter-spacing="-1">Reservas deportivas</text>
  <text x="80" y="404" font-family="Barlow, Helvetica, sans-serif" font-size="34"
        fill="#a7f3c8" font-weight="600">Sistema de reserva de canchas por turnos</text>
  <rect x="80" y="452" width="86" height="5" fill="#22c55e"/>
  <text x="80" y="530" font-family="Barlow, Helvetica, sans-serif" font-size="25" fill="#e5f7ec">
    Tres roles · multisede · tarifa por día y hora · confirmación en 3 horas
  </text>
  <text x="80" y="586" font-family="Barlow, Helvetica, sans-serif" font-size="25" fill="#a7f3c8">
    Reportes del mes en pantalla, PDF y CSV
  </text>
</svg>`;

await sharp(HERO)
  .resize(ANCHO, ALTO, { fit: 'cover', position: 'right' })
  .composite([{ input: Buffer.from(capa), top: 0, left: 0 }])
  .webp({ quality: 84, effort: 5 })
  .toFile(SALIDA);

console.log(`Banner generado en ${SALIDA}`);
