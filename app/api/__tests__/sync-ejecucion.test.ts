// @vitest-environment node
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { Client } from 'pg';
import { firmarSesion, NOMBRE_COOKIE } from '@/lib/auth/sesion';
import { POST } from '../sync/route';

/**
 * El ACK de /api/sync tiene que reflejar lo que pasó de verdad. Antes de que el
 * POST ejecutara la cola, respondía "aceptada" y la operación nunca se ejecutaba:
 * el cliente borraba su reserva de la outbox y el usuario se quedaba sin ella sin
 * saberlo. Estos casos fijan esa verdad.
 */
const cliente = new Client({ connectionString: process.env.DIRECT_URL });

let cookie = '';
let sedeId = 0;
let canchaId = 0;
let usuarioId = 0;

function peticion(cuerpo: unknown): NextRequest {
  return new NextRequest('http://prueba/api/sync', {
    method: 'POST',
    body: JSON.stringify(cuerpo),
    headers: { 'content-type': 'application/json', cookie },
  });
}

async function turnoLibre(): Promise<{ fecha: string; hora: string }> {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
  const base = new Date(`${hoy}T00:00:00Z`);
  for (let d = 5; d < 25; d += 1) {
    const f = new Date(base);
    f.setUTCDate(f.getUTCDate() + d);
    const fecha = f.toISOString().slice(0, 10);
    for (let h = 8; h <= 20; h += 1) {
      const hora = `${String(h).padStart(2, '0')}:00`;
      const r = await cliente.query(
        `SELECT 1 FROM "Solicitud" WHERE "canchaId" = $1 AND fecha = $2 AND "horaInicio" = $3
           AND estado IN ('PENDIENTE','CONFIRMADA') AND "eliminadoEn" IS NULL LIMIT 1`,
        [canchaId, fecha, hora],
      );
      if (r.rowCount === 0) return { fecha, hora };
    }
  }
  throw new Error('sin turno libre para la prueba');
}

type Ack = { clienteOpId: string; estado: string; serverId?: number; motivo?: string; reintentable?: boolean };

async function acksDe(respuesta: Response): Promise<Ack[]> {
  const cuerpo = (await respuesta.json()) as { acks?: Ack[] };
  return cuerpo.acks ?? [];
}

describe.sequential('POST /api/sync ejecuta lo que encola', () => {
  beforeAll(async () => {
    await cliente.connect();
    const u = await cliente.query(`SELECT id FROM "Usuario" WHERE email = 'test-user@gmail.com'`);
    usuarioId = u.rows[0].id as number;
    const s = await cliente.query(
      `SELECT id FROM "Sede" WHERE nombre = 'E2E_QA' AND "eliminadoEn" IS NULL ORDER BY id LIMIT 1`,
    );
    sedeId = s.rows[0].id as number;
    const c = await cliente.query(
      `SELECT id FROM "Cancha" WHERE "sedeId" = $1 AND "eliminadoEn" IS NULL ORDER BY nombre LIMIT 1`,
      [sedeId],
    );
    canchaId = c.rows[0].id as number;
    cookie = `${NOMBRE_COOKIE}=${await firmarSesion(usuarioId)}`;
  });

  afterAll(async () => {
    await cliente.query(`DELETE FROM "Solicitud" WHERE "usuarioId" = $1`, [usuarioId]);
    await cliente.query(`DELETE FROM "OperacionPendiente" WHERE "usuarioId" = $1`, [usuarioId]);
    await cliente.end();
  });

  it('una op nueva se ejecuta: el ACK trae el id de la fila creada', async () => {
    const turno = await turnoLibre();
    const clienteOpId = randomUUID();
    const respuesta = await POST(
      peticion({ ops: [{ clienteOpId, tipo: 'solicitud.crear', carga: { canchaId, fecha: turno.fecha, horaInicio: turno.hora } }] }),
    );
    expect(respuesta.status).toBe(200);
    const acks = await acksDe(respuesta);
    const ack = acks.find((a) => a.clienteOpId === clienteOpId);
    // Este es el fallo que existía: aceptada sin nada creado.
    expect(ack?.estado).toBe('aceptada');
    const creada = await cliente.query(
      `SELECT id FROM "Solicitud" WHERE "usuarioId" = $1 AND fecha = $2 AND "horaInicio" = $3`,
      [usuarioId, turno.fecha, turno.hora],
    );
    expect(creada.rowCount).toBe(1);
    expect(ack?.serverId).toBe(creada.rows[0].id);
    const op = await cliente.query(`SELECT estado FROM "OperacionPendiente" WHERE "clienteOpId" = $1`, [clienteOpId]);
    expect(op.rows[0].estado).toBe('procesada');
  });

  it('reenviar la misma op no crea una segunda reserva y no vuelve a ejecutar', async () => {
    const turno = await turnoLibre();
    const clienteOpId = randomUUID();
    const cuerpo = {
      ops: [{ clienteOpId, tipo: 'solicitud.crear', carga: { canchaId, fecha: turno.fecha, horaInicio: turno.hora } }],
    };
    const primera = await acksDe(await POST(peticion(cuerpo)));
    const segunda = await acksDe(await POST(peticion(cuerpo)));
    const id = primera.find((a) => a.clienteOpId === clienteOpId)?.serverId;
    expect(segunda.find((a) => a.clienteOpId === clienteOpId)?.estado).toBe('aceptada');
    expect(segunda.find((a) => a.clienteOpId === clienteOpId)?.serverId).toBe(id);
    const total = await cliente.query(
      `SELECT count(*)::int AS n FROM "Solicitud" WHERE "usuarioId" = $1 AND fecha = $2 AND "horaInicio" = $3`,
      [usuarioId, turno.fecha, turno.hora],
    );
    expect(total.rows[0].n).toBe(1);
  });

  it('un turno que no existe se rechaza con motivo real, no se acepta en silencio', async () => {
    const clienteOpId = randomUUID();
    const acks = await acksDe(
      await POST(
        peticion({
          ops: [{ clienteOpId, tipo: 'solicitud.crear', carga: { canchaId, fecha: '2020-01-01', horaInicio: '10:00' } }],
        }),
      ),
    );
    const ack = acks.find((a) => a.clienteOpId === clienteOpId);
    expect(ack?.estado).toBe('rechazada');
    expect(ack?.motivo).toBeTruthy();
    const creada = await cliente.query(
      `SELECT count(*)::int AS n FROM "Solicitud" WHERE "usuarioId" = $1 AND fecha = '2020-01-01'`,
      [usuarioId],
    );
    expect(creada.rows[0].n).toBe(0);
  });

  it('un lote con una op inválida ejecuta las válidas igual (lote parcial)', async () => {
    const turno = await turnoLibre();
    const buena = randomUUID();
    const acks = await acksDe(
      await POST(
        peticion({
          ops: [
            {
              clienteOpId: 'no-es-uuid',
              tipo: 'solicitud.crear',
              carga: { canchaId, fecha: turno.fecha, horaInicio: turno.hora },
            },
            { clienteOpId: buena, tipo: 'solicitud.crear', carga: { canchaId, fecha: turno.fecha, horaInicio: turno.hora } },
          ],
        }),
      ),
    );
    expect(acks.find((a) => a.clienteOpId === 'no-es-uuid')?.estado).toBe('rechazada');
    expect(acks.find((a) => a.clienteOpId === buena)?.estado).toBe('aceptada');
    const creada = await cliente.query(
      `SELECT id FROM "Solicitud" WHERE "usuarioId" = $1 AND fecha = $2 AND "horaInicio" = $3`,
      [usuarioId, turno.fecha, turno.hora],
    );
    expect(creada.rowCount).toBe(1);
  });

  it('una op encolada por otro usuario no se ejecuta desde esta sesión', async () => {
    const turno = await turnoLibre();
    const otro = await cliente.query(`SELECT id FROM "Usuario" WHERE email = 'test-admin@gmail.com'`);
    const otroId = otro.rows[0].id as number;
    const clienteOpId = randomUUID();
    await cliente.query(
      `INSERT INTO "OperacionPendiente" ("usuarioId", "clienteOpId", tipo, carga, "cargaHash", "actualizadoEn")
       VALUES ($1, $2, 'solicitud.crear', $3::jsonb, 'x', now())`,
      [otroId, clienteOpId, JSON.stringify({ canchaId, fecha: turno.fecha, horaInicio: turno.hora })],
    );
    try {
      await acksDe(
        await POST(
          peticion({
            ops: [
              { clienteOpId, tipo: 'solicitud.crear', carga: { canchaId, fecha: turno.fecha, horaInicio: turno.hora } },
            ],
          }),
        ),
      );
      // La op del otro usuario sigue pendiente: procesarPendientes filtra por
      // usuarioId, así que esta sesión no la ejecuta ni la afirma.
      const estado = await cliente.query(`SELECT estado FROM "OperacionPendiente" WHERE "usuarioId" = $1 AND "clienteOpId" = $2`, [
        otroId,
        clienteOpId,
      ]);
      expect(estado.rows[0].estado).toBe('pendiente');
      const creada = await cliente.query(
        `SELECT count(*)::int AS n FROM "Solicitud" WHERE "usuarioId" = $1 AND fecha = $2 AND "horaInicio" = $3`,
        [otroId, turno.fecha, turno.hora],
      );
      expect(creada.rows[0].n).toBe(0);
    } finally {
      await cliente.query(`DELETE FROM "OperacionPendiente" WHERE "usuarioId" = $1 AND "clienteOpId" = $2`, [
        otroId,
        clienteOpId,
      ]);
    }
  });
});
