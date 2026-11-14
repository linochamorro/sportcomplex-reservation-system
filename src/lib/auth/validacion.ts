import { createHash } from 'node:crypto';

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Formato de correo deliberadamente estricto (ASCII): evita correos con
// comillas, punto y coma, angle brackets o signos de control que no tienen
// sentido real y que ensucian los listados de administracion. Los correos
// unicode se rechazan a proposito: no aportan nada al sistema.
const CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export function validarEmail(email: string): boolean {
  return typeof email === 'string' && email.length <= 254 && CORREO.test(email.trim());
}

export function validarClave(clave: string): boolean {
  return typeof clave === 'string' && clave.length >= 8 && clave.length <= 128;
}

 
const CARACTERES_CONTROL = /[\u0000-\u001F\u007F]/;

/**
 * Nombre visible: 2-120 caracteres, sin caracteres de control ni angle
 * brackets. React escapa al renderizar, pero se rechazan saltos de linea, tabs
 * y demas controles que romperian listados, tablas y exportaciones.
 */
export function validarNombre(nombre: string): boolean {
  if (typeof nombre !== 'string') return false;
  const limpio = nombre.trim();
  if (limpio.length < 2 || limpio.length > 120) return false;
  return !CARACTERES_CONTROL.test(limpio) && !/[<>]/.test(limpio);
}

export function sha256Hex(valor: string): string {
  return createHash('sha256').update(valor, 'utf8').digest('hex');
}