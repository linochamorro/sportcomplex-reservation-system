import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { bd } from '@/lib/db/cliente';
import { consumirIntento } from '../throttle';

const identificador = `distribuido:${randomUUID()}`;

afterAll(async () => {
  await bd.intentoLogin.deleteMany({ where: { identificador } });
  await bd.$disconnect();
});

describe('throttle distribuido vivo', () => {
  it('serializa cinco intentos concurrentes y reinicia tras la ventana', async () => {
    const resultados = await Promise.all(
      Array.from({ length: 5 }, () => consumirIntento(identificador)),
    );
    expect(resultados.filter(Boolean)).toHaveLength(1);
    const fila = await bd.intentoLogin.findUniqueOrThrow({ where: { identificador } });
    expect(fila.intentos).toBe(5);
    expect(fila.bloqueadoHasta?.getTime()).toBeGreaterThan(Date.now());
    await bd.intentoLogin.update({
      where: { identificador },
      data: { ultimoIntento: new Date(Date.now() - 61_000), bloqueadoHasta: null },
    });
    expect(await consumirIntento(identificador)).toBe(false);
    const reiniciada = await bd.intentoLogin.findUniqueOrThrow({ where: { identificador } });
    expect(reiniciada.intentos).toBe(1);
    expect(reiniciada.bloqueadoHasta).toBeNull();
  });
});
