import { describe, expect, it } from 'vitest';
import { decidirEnvio, mensajeEncolado } from '../decidir-envio';

const cuerpo503 = { error: 'El servicio no puede atender ahora.', codigo: 'DB_NO_DISPONIBLE', reintentable: true };

describe('decidirEnvio', () => {
  it('sin red → encolar', () => {
    expect(decidirEnvio({ tipo: 'red' })).toEqual({ accion: 'encolar', motivo: 'sin-conexion' });
  });

  it('201 con monto → aceptada', () => {
    expect(decidirEnvio({ tipo: 'respuesta', estado: 201, cuerpo: { montoTotalCentavos: 5000 } })).toEqual({
      accion: 'aceptada',
      montoCentavos: 5000,
    });
  });

  it('2xx sin monto → aceptada con cero, no un NaN en pantalla', () => {
    expect(decidirEnvio({ tipo: 'respuesta', estado: 200, cuerpo: {} })).toEqual({
      accion: 'aceptada',
      montoCentavos: 0,
    });
  });

  it('503 con reintentable → encolar', () => {
    expect(decidirEnvio({ tipo: 'respuesta', estado: 503, cuerpo: cuerpo503 })).toEqual({
      accion: 'encolar',
      motivo: 'servicio-no-disponible',
    });
  });

  it('503 sin la marca reintentable → error, no se promete un reintento', () => {
    const r = decidirEnvio({ tipo: 'respuesta', estado: 503, cuerpo: { error: 'Correo no configurado' } });
    expect(r).toEqual({ accion: 'error', mensaje: 'Correo no configurado' });
  });

  it('reintentable:true en un estado que no es 503 se desconfía', () => {
    const r = decidirEnvio({ tipo: 'respuesta', estado: 500, cuerpo: { ...cuerpo503, error: 'Error interno' } });
    expect(r.accion).toBe('error');
  });

  it('4xx → error con el mensaje del servidor, nunca encolado', () => {
    for (const estado of [400, 401, 403, 404, 409, 413, 429]) {
      const r = decidirEnvio({ tipo: 'respuesta', estado, cuerpo: { error: `no se puede (${estado})` } });
      expect(r, `estado ${estado}`).toEqual({ accion: 'error', mensaje: `no se puede (${estado})` });
    }
  });

  it('cuerpo inútil o ausente → mensaje por defecto, sin romper', () => {
    for (const cuerpo of [null, undefined, 'texto', 42, { error: '' }]) {
      const r = decidirEnvio({ tipo: 'respuesta', estado: 500, cuerpo });
      expect(r).toEqual({ accion: 'error', mensaje: 'No se pudo crear la solicitud' });
    }
  });

  it('los mensajes de cola dicen la verdad según el motivo', () => {
    expect(mensajeEncolado('sin-conexion')).toMatch(/en cola/i);
    expect(mensajeEncolado('sin-conexion')).toMatch(/conectar/i);
    expect(mensajeEncolado('servicio-no-disponible')).toMatch(/en cola/i);
    expect(mensajeEncolado('servicio-no-disponible')).toMatch(/segundos/i);
  });
});
