// @vitest-environment node
import 'dotenv/config';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bd } from '@/lib/db/cliente';
import { hachearClave } from '@/lib/auth/hash';
import { firmarSesion } from '@/lib/auth/sesion';
import { registrarCambio } from '@/lib/sync/registro';
import { GET as pull, POST as push } from '../sync/route';

function solicitud(ruta: string, cuerpo: unknown, cookie: string): NextRequest {
  return new NextRequest(`http://prueba${ruta}`, {
    method: 'POST',
    body: JSON.stringify(cuerpo),
    headers: { 'content-type': 'application/json', cookie },
  });
}

// Humo vivo del protocolo (B-01): idempotencia, hash, sede, cursor, tumba, IDOR.
describe.sequential('protocolo sync vivo', () => {
  let sedeA = 0;
  let sedeB = 0;
  let cookieAdminA = '';
  let cookieSuper = '';
  const opId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  beforeAll(async () => {
    const sede1 = await bd.sede.create({ data: { nombre: `SyncA_${Date.now()}`, apertura: '08:00', cierre: '22:00' } });
    const sede2 = await bd.sede.create({ data: { nombre: `SyncB_${Date.now()}`, apertura: '08:00', cierre: '22:00' } });
    sedeA = sede1.id;
    sedeB = sede2.id;
    const hash = await hachearClave('Sync_Vivo_99');
    const admin = await bd.usuario.create({
      data: { email: `syncadmin_${Date.now()}@prueba.local`, passwordHash: hash, nombre: 'Sync', rol: 'ADMIN', sedeId: sedeA },
    });
    const sup = await bd.usuario.create({
      data: { email: `syncsup_${Date.now()}@prueba.local`, passwordHash: hash, nombre: 'Sync', rol: 'SUPERADMIN', sedeId: null },
    });
    cookieAdminA = `access_token=${await firmarSesion(admin.id)}`;
    cookieSuper = `access_token=${await firmarSesion(sup.id)}`;
  });

  afterAll(async () => {
    await bd.registroCambio.deleteMany({ where: { OR: [{ sedeId: sedeA }, { sedeId: sedeB }] } });
    await bd.operacionPendiente.deleteMany({ where: { usuarioId: { in: (await bd.usuario.findMany({ where: { email: { contains: 'sync' } }, select: { id: true } })).map((u) => u.id) } } });
    // Limpieza física SOLO aquí (higiene de test, fuera del flujo válido):
    // el flujo válido usa soft-delete + tumba, nunca hard-delete.
    await bd.notificacion.deleteMany({ where: { usuarioId: { in: (await bd.usuario.findMany({ where: { email: { contains: 'sync' } }, select: { id: true } })).map((u) => u.id) } } });
    await bd.cancha.deleteMany({ where: { sedeId: { in: [sedeA, sedeB] } } });
    await bd.usuario.deleteMany({ where: { email: { contains: 'sync' } } });
    await bd.sede.deleteMany({ where: { id: { in: [sedeA, sedeB] } } });
    await bd.$disconnect();
  });

  it('el ACK cuenta lo que pasó: ejecuta la op y el reintento no duplica la fila', async () => {
    // Carga deliberadamente incompleta: el op entra en la cola y se ejecuta, así
    // que el ACK debe ser un rechazo con motivo real. Antes este caso afirmaba
    // "aceptada" para una op que nunca llegaba a ejecutarse, y por eso el bug del
    // ACK mentiroso pasó inadvertido. La ejecución correcta se cubre en
    // sync-ejecucion.test.ts.
    const cuerpo = { ops: [{ clienteOpId: opId, tipo: 'solicitud.crear', carga: { sedeId: sedeA } }] };
    const r1 = await push(solicitud('/api/sync', cuerpo, cookieAdminA));
    expect(r1.status).toBe(200);
    const j1 = (await r1.json()) as { acks: Array<{ estado: string; serverId?: number; motivo?: string }> };
    expect(j1.acks[0].estado).toBe('rechazada');
    expect(j1.acks[0].motivo).toBeTruthy();
    // Reintento con la misma carga: la fila de la cola sigue siendo una sola y
    // el ACK reproduce el fallo, sin volver a ejecutar.
    const r2 = await push(solicitud('/api/sync', cuerpo, cookieAdminA));
    const j2 = (await r2.json()) as { acks: Array<{ estado: string; serverId?: number }> };
    expect(j2.acks[0].serverId).toBeUndefined();
    const n = await bd.operacionPendiente.count({ where: { clienteOpId: opId } });
    expect(n).toBe(1);
  });

  it('mismo OpId distinta carga → rechazada; tipo desconocido → rechazada; sede ajena → rechazada', async () => {
    const cuerpo = {
      ops: [
        { clienteOpId: opId, tipo: 'solicitud.crear', carga: { sedeId: sedeA, otra: 1 } },
        { clienteOpId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', tipo: 'admin.borrar_todo', carga: {} },
        { clienteOpId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', tipo: 'solicitud.crear', carga: { sedeId: sedeB } },
      ],
    };
    const r = await push(solicitud('/api/sync', cuerpo, cookieAdminA));
    const j = (await r.json()) as { acks: Array<{ estado: string; motivo?: string }> };
    expect(j.acks.map((a) => a.estado)).toEqual(['rechazada', 'rechazada', 'rechazada']);
  });

  it('pull entrega cursor, tumba e IDOR por sede', async () => {
    const canchaA = await bd.cancha.create({ data: { sedeId: sedeA, nombre: 'C1', tarifaBaseCentavos: 1000, estado: 'DISPONIBLE', motivoNoDisponible: null } });
    const canchaB = await bd.cancha.create({ data: { sedeId: sedeB, nombre: 'C1', tarifaBaseCentavos: 1000, estado: 'DISPONIBLE', motivoNoDisponible: null } });
    await registrarCambio(bd, { tabla: 'Cancha', filaId: canchaA.id, sedeId: sedeA });
    await registrarCambio(bd, { tabla: 'Cancha', filaId: canchaB.id, sedeId: sedeB });
    const rA = await pull(
      new NextRequest(`http://prueba/api/sync?desde=0`, { headers: { cookie: cookieAdminA } }),
    );
    expect(rA.status).toBe(200);
    const jA = (await rA.json()) as { cambios: Array<{ filaId: number; sedeId: number }>; token: string };
    expect(jA.cambios.map((c) => c.filaId)).toContain(canchaA.id);
    expect(jA.cambios.map((c) => c.filaId)).not.toContain(canchaB.id);
    expect(jA.token).not.toBe('0');
    // SUPERADMIN ve ambas sedes.
    const rS = await pull(
      new NextRequest(`http://prueba/api/sync?desde=0`, { headers: { cookie: cookieSuper } }),
    );
    const jS = (await rS.json()) as { cambios: Array<{ filaId: number }> };
    expect(jS.cambios.map((c) => c.filaId)).toEqual(
      expect.arrayContaining([canchaA.id, canchaB.id]),
    );
    // Tumba: el pull la entrega con eliminado=true.
    // Tumba real: soft-delete + log en la MISMA transacción (prohibido hard-delete).
    await bd.$transaction(async (tx) => {
      await tx.cancha.update({ where: { id: canchaB.id }, data: { eliminadoEn: new Date() } });
      await registrarCambio(tx as never, { tabla: 'Cancha', filaId: canchaB.id, sedeId: sedeB, eliminado: true });
    });
    const rT = await pull(
      new NextRequest(`http://prueba/api/sync?desde=0`, { headers: { cookie: cookieSuper } }),
    );
    const jT = (await rT.json()) as { cambios: Array<{ filaId: number; eliminado: boolean }> };
    expect(jT.cambios.find((c) => c.filaId === canchaB.id && c.eliminado)).toBeTruthy();
    // canchaA sigue viva para el cliente; su limpieza física ocurre en afterAll.
  });

  it('Notificacion solo por usuarioId aunque comparta sede (scoping por tabla)', async () => {
    const admin = await bd.usuario.findFirst({ where: { email: { contains: 'syncadmin' } } });
    const sup = await bd.usuario.findFirst({ where: { email: { contains: 'syncsup' } } });
    const n = await bd.notificacion.create({
      data: { usuarioId: sup!.id, tipo: 'aviso', titulo: 't', cuerpo: 'c' },
    });
    await registrarCambio(bd, { tabla: 'Notificacion', filaId: n.id, sedeId: sedeA, usuarioId: sup!.id });
    const r = await pull(
      new NextRequest(`http://prueba/api/sync?desde=0`, { headers: { cookie: cookieAdminA } }),
    );
    const j = (await r.json()) as { cambios: Array<{ tabla: string; filaId: number }> };
    expect(j.cambios.find((c) => c.tabla === 'Notificacion' && c.filaId === n.id)).toBeUndefined();
    // Tumba por soft-delete en la misma transacción (prohibido hard-delete en flujo válido).
    await bd.$transaction(async (tx) => {
      await tx.notificacion.update({ where: { id: n.id }, data: { eliminadoEn: new Date() } });
      await registrarCambio(tx as never, { tabla: 'Notificacion', filaId: n.id, usuarioId: sup!.id, eliminado: true });
    });
    void admin;
  });

  it('commit intercalado no pierde filas (cursor opaco)', async () => {
    const r1 = await pull(
      new NextRequest(`http://prueba/api/sync?desde=0`, { headers: { cookie: cookieSuper } }),
    );
    const t1 = ((await r1.json()) as { token: string }).token;
    const c1 = await bd.cancha.create({ data: { sedeId: sedeA, nombre: `K1_${Date.now()}`, tarifaBaseCentavos: 1, estado: 'DISPONIBLE', motivoNoDisponible: null } });
    await registrarCambio(bd, { tabla: 'Cancha', filaId: c1.id, sedeId: sedeA });
    const c2 = await bd.cancha.create({ data: { sedeId: sedeA, nombre: `K2_${Date.now()}`, tarifaBaseCentavos: 1, estado: 'DISPONIBLE', motivoNoDisponible: null } });
    await registrarCambio(bd, { tabla: 'Cancha', filaId: c2.id, sedeId: sedeA });
    const r2 = await pull(
      new NextRequest(`http://prueba/api/sync?desde=${t1}`, { headers: { cookie: cookieSuper } }),
    );
    const j2 = (await r2.json()) as { cambios: Array<{ filaId: number }>; token: string };
    expect(j2.cambios.map((c) => c.filaId)).toEqual(expect.arrayContaining([c1.id, c2.id]));
    expect(j2.token).not.toBe(t1);
    // Limpieza física en afterAll; aquí quedan vivas a propósito.
  });

  it('cursor malformado → 400; sin sesión → 401', async () => {
    const r1 = await pull(new NextRequest(`http://prueba/api/sync?desde=no-num`, { headers: { cookie: cookieSuper } }));
    expect(r1.status).toBe(400);
    const r2 = await pull(new NextRequest(`http://prueba/api/sync?desde=0`));
    expect(r2.status).toBe(401);
  });
});
