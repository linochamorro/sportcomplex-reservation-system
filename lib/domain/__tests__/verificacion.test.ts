import { describe, expect, it } from 'vitest';
import {
  MENSAJE_MOTIVO_REQUERIDO,
  MOTIVO_MAX,
  puedeTransicionar,
  transicionarSolicitud,
  validarMotivoRechazo,
} from '../verificacion';

describe('verificacion: transiciones (B-03/AC-01)', () => {
  it('confirmar solo desde PENDIENTE', () => {
    expect(transicionarSolicitud('PENDIENTE', 'confirmar')).toBe('CONFIRMADA');
    expect(() => transicionarSolicitud('CONFIRMADA', 'confirmar')).toThrow();
    expect(() => transicionarSolicitud('RECHAZADA', 'confirmar')).toThrow();
    expect(() => transicionarSolicitud('LIBERADA', 'confirmar')).toThrow();
    expect(() => transicionarSolicitud('NO_SHOW', 'confirmar')).toThrow();
  });

  it('rechazar solo desde PENDIENTE', () => {
    expect(transicionarSolicitud('PENDIENTE', 'rechazar')).toBe('RECHAZADA');
    expect(() => transicionarSolicitud('CONFIRMADA', 'rechazar')).toThrow();
  });

  it('no-show solo desde CONFIRMADA', () => {
    expect(transicionarSolicitud('CONFIRMADA', 'no_show')).toBe('NO_SHOW');
    expect(() => transicionarSolicitud('PENDIENTE', 'no_show')).toThrow();
  });

  it('puedeTransicionar refleja la máquina', () => {
    expect(puedeTransicionar('PENDIENTE', 'confirmar')).toBe(true);
    expect(puedeTransicionar('NO_SHOW', 'rechazar')).toBe(false);
  });

  it('motivo de rechazo obligatorio, trim y límite 1–500', () => {
    expect(() => validarMotivoRechazo('   ')).toThrow(MENSAJE_MOTIVO_REQUERIDO);
    expect(() => validarMotivoRechazo('')).toThrow(MENSAJE_MOTIVO_REQUERIDO);
    expect(() => validarMotivoRechazo('x'.repeat(MOTIVO_MAX + 1))).toThrow();
    expect(validarMotivoRechazo('  pago ilegible  ')).toBe('pago ilegible');
  });
});
