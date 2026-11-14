/**
 * Taxonomía de errores de la capa de datos → contrato HTTP.
 *
 * Un 500 opaco mezcla tres cosas muy distintas: un bug, un choque de datos y
 * "la base no respondió ahora". Aquí se separan. El cliente recibe un mensaje
 * estable y un `codigo`, nunca el mensaje del driver: los errores de Prisma y de
 * `pg` pueden llevar host, usuario, contraseña o un fragmento de SQL, y esa
 * cadena acaba en el cuerpo de la respuesta si no se filtra aquí.
 *
 * `reintentable` es la señal que necesita el cliente: con 503 tiene sentido
 * reintentar; con 500, no. El invariante es `reintentable === (estado === 503)`.
 *
 * Módulo puro a propósito (sin imports) para poder probar cada fila de la tabla
 * sin base de datos.
 */

export type Clasificacion = {
  estado: number;
  /** Slug estable para correlacionar con logs. No contiene detalle técnico. */
  codigo: string;
  /** Mensaje público: sin host, sin SQL y sin.stack. */
  mensaje: string;
  /** `true` solo cuando reintentar tiene sentido. */
  reintentable: boolean;
};

/**
 * Transitorios: la operación puede funcionar si se repite. Prisma no alcanza la
 * base, se quedó sin conexiones en el pool, o el pooler/Postgres cortó el cable.
 * El 503 es lo que ya usa el proyecto para "dependencia no disponible"
 * (correo y comprobantes), así que aquí se mantiene la convención.
 */
const TRANSITORIOS_PRISMA = new Set([
  'P1000', // fallo de autenticación contra la base
  'P1001', // no se pudo alcanzar el servidor
  'P1002', // el servidor tardó demasiado
  'P1008', // la operación agotó el tiempo
  'P1011', // error de conexión TLS
  'P1017', // el servidor cerró la conexión
  'P2024', // timeout al tomar una conexión del pool
  'P2028', // fallo de la API de transacciones
]);

/** SQLSTATE de PostgreSQL para fallos de conexión o de recursos. */
const TRANSITORIOS_SQLSTATE = new Set([
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '08007',
  '40001', // serialización fallida: reintentable dentro de transacción
  '40P01', // deadlock detectado
  '53300', // demasiadas conexiones
  '57P01', // cierre administrativo (pooler)
  '57P02', // no se puede conectar ahora
  '57P03', // la base está arrancando
]);

/** Errores de socket de Node: el pool entrega una conexión muerta. */
const TRANSITORIOS_NODE = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
]);

/** Choque de datos que el cliente puede corregir o entender. */
const CONFLICTO_PRISMA = new Set(['P2002', 'P2003']); // único, clave foránea
const AUSENTE_PRISMA = new Set(['P2025']); // registro no encontrado
/** El modelo no acepta el dato: es un 400, no un fallo del servidor. */
const REGLA_PRISMA = new Set(['P2000', 'P2011', 'P2012', 'P2014', 'P2023']);

const NO_DISPONIBLE: Clasificacion = {
  estado: 503,
  codigo: 'DB_NO_DISPONIBLE',
  mensaje: 'El servicio no puede atender ahora. Inténtalo en unos segundos.',
  reintentable: true,
};

const CONFLICTO: Clasificacion = {
  estado: 409,
  codigo: 'CONFLICTO_UNICO',
  mensaje: 'Ese registro ya existe.',
  reintentable: false,
};

const AUSENTE: Clasificacion = {
  estado: 404,
  codigo: 'NO_ENCONTRADO',
  mensaje: 'No encontrado.',
  reintentable: false,
};

const REGLA: Clasificacion = {
  estado: 400,
  codigo: 'DATOS_INVALIDOS',
  mensaje: 'Datos inválidos.',
  reintentable: false,
};

const INTERNO: Clasificacion = {
  estado: 500,
  codigo: 'ERROR_INTERNO',
  mensaje: 'Error interno',
  reintentable: false,
};

function codigoDe(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const valor = (error as { code?: unknown }).code;
  return typeof valor === 'string' ? valor : null;
}

/** Clasifica cualquier error de la capa de datos. Nunca lanza. */
export function clasificarError(error: unknown): Clasificacion {
  const codigo = codigoDe(error);
  if (codigo === null) return INTERNO;
  if (TRANSITORIOS_PRISMA.has(codigo) || TRANSITORIOS_SQLSTATE.has(codigo) || TRANSITORIOS_NODE.has(codigo)) {
    return NO_DISPONIBLE;
  }
  if (CONFLICTO_PRISMA.has(codigo)) return CONFLICTO;
  if (AUSENTE_PRISMA.has(codigo)) return AUSENTE;
  if (REGLA_PRISMA.has(codigo)) return REGLA;
  return INTERNO;
}
