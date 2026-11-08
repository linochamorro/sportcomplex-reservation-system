#!/usr/bin/env node
// Siembra reservas de la cuenta de captura con varios estados, para que la
// pantalla "Reservas" del README muestre la lista y no un formulario vacío.
// Idempotente en cuanto al limpiado: `limpiar-qa.mjs` borra las solicitudes de
// los usuarios test-*. Uso: node scripts/reservas-captura.mjs
import 'dotenv/config';
import pg from 'pg';

const CLAVE_PRUEBA_QA = process.env.CLAVE_PRUEBA_QA;
if (!CLAVE_PRUEBA_QA || CLAVE_PRUEBA_QA.length < 10) {
  console.error('Error: define CLAVE_PRUEBA_QA con al menos 10 caracteres (clave de prueba QA, no fijada en código).');
  process.exit(1);
}

const BASE = process.env.CAPTURA_BASE ?? 'http://127.0.0.1:3100';
const SEDE = process.env.SEDE_CAPTURA ?? 'Los Olivos';
const USUARIO = { email: 'test-user@gmail.com', clave: CLAVE_PRUEBA_QA };
const ADMIN = { email: 'test-admin@gmail.com', clave: CLAVE_PRUEBA_QA };
const CANTIDAD = 5;

async function sesion(cred) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify(cred),
  });
  if (!r.ok) throw new Error(`login ${cred.email}: ${r.status}`);
  const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
  return async (ruta, opciones = {}) => {
    const respuesta = await fetch(`${BASE}${ruta}`, {
      ...opciones,
      headers: {
        ...(opciones.headers ?? {}),
        cookie,
        origin: BASE,
        ...(opciones.body ? { 'content-type': 'application/json' } : {}),
      },
    });
    return respuesta;
  };
}

const api = await sesion(USUARIO);
const admin = await sesion(ADMIN);

const sedes = (await (await api('/api/sedes')).json()).sedes;
const sede = sedes.find((s) => s.nombre === SEDE);
if (!sede) throw new Error(`sede "${SEDE}" no encontrada`);
const canchas = (await (await api(`/api/canchas?sedeId=${sede.id}&soloDisponibles=1`)).json()).canchas;
if (canchas.length === 0) throw new Error(`la sede ${SEDE} no tiene canchas disponibles`);

const cliente = new pg.Client({ connectionString: process.env.DIRECT_URL });
await cliente.connect();
const creadas = [];
try {
  // Turnos candidatos: desde mañana hasta 14 días, de 08:00 a 21:00, en punto.
  const hoy = new Date();
  const candidatos = [];
  for (let dia = 1; dia <= 14 && candidatos.length < 400; dia += 1) {
    const d = new Date(hoy);
    d.setDate(d.getDate() + dia);
    const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (let h = 8; h <= 21; h += 1) candidatos.push({ fecha, hora: `${String(h).padStart(2, '0')}:00` });
  }

  let i = 0;
  while (creadas.length < CANTIDAD && i < candidatos.length) {
    const t = candidatos[i];
    i += 1;
    const cancha = canchas[creadas.length % canchas.length];
    const r = await api('/api/solicitudes', {
      method: 'POST',
      body: JSON.stringify({ canchaId: cancha.id, fecha: t.fecha, horaInicio: t.hora }),
    });
    if (r.status !== 201) continue; // turno ocupado o fuera de horario: el siguiente
    const { id } = await r.json();
    creadas.push({ id, ...t, cancha: cancha.nombre });
  }
  if (creadas.length < CANTIDAD) throw new Error(`solo se pudieron crear ${creadas.length} de ${CANTIDAD}`);

  // Dos confirmadas, una cancelada por la administración, una liberada por
  // expiración del hold y una pendiente con la cuenta atrás visible.
  const confirmar = creadas.slice(0, 2);
  for (const c of confirmar) {
    const r = await admin(`/api/solicitudes/${c.id}/confirmar`, { method: 'POST' });
    if (!r.ok) throw new Error(`confirmar ${c.id}: ${r.status}`);
  }
  const cancelar = creadas[2];
  const rCancelar = await admin(`/api/solicitudes/${cancelar.id}/rechazar`, {
    method: 'POST',
    body: JSON.stringify({ motivo: 'Corte de fluido eléctrico en la sede' }),
  });
  if (!rCancelar.ok) throw new Error(`rechazar ${cancelar.id}: ${rCancelar.status}`);

  const liberar = creadas[3];
  await cliente.query(`UPDATE "Solicitud" SET "limiteHold" = now() - interval '1 hour' WHERE id = $1`, [liberar.id]);
  // El barrido oportunista corre en cada lectura: pedir la lista la dispara.
  await api('/api/solicitudes');
  await api('/api/solicitudes');

  const estados = await cliente.query(
    `SELECT id, estado, "limiteHold" FROM "Solicitud" WHERE id = ANY($1) ORDER BY fecha, "horaInicio"`,
    [creadas.map((c) => c.id)],
  );
  console.log(`Reservas de captura en ${SEDE}:`);
  for (const e of estados.rows) console.log(` - id=${e.id} ${e.estado}`);
  const pendiente = estados.rows.find((e) => e.estado === 'PENDIENTE');
  console.log(
    pendiente
      ? `Pendiente con hold hasta ${pendiente.limiteHold?.toISOString?.() ?? pendiente.limiteHold}.`
      : 'ATENCION: no quedo ninguna PENDIENTE con cuenta atras.',
  );
} finally {
  await cliente.end();
}
