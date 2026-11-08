import { describe, expect, it } from 'vitest';
import { TIPOS_RECORDATORIO, ventanasPara } from '../recordatorios';

const T = (iso: string) => new Date(iso);

describe('recordatorios: ventanas 20/10 (B-05/AC-01)', () => {
  it('sin recordatorio si falta más de 20 min', () => {
    expect(ventanasPara(T('2027-07-01T12:00:00Z'), T('2027-07-01T11:30:00Z'))).toEqual([]);
  });

  it('recordatorio_20 en (10,20]', () => {
    expect(ventanasPara(T('2027-07-01T12:00:00Z'), T('2027-07-01T11:45:00Z'))).toEqual(['recordatorio_20']);
    expect(ventanasPara(T('2027-07-01T12:00:00Z'), T('2027-07-01T11:40:00Z'))).toEqual(['recordatorio_20']);
  });

  it('recordatorio_10 en (0,10]', () => {
    expect(ventanasPara(T('2027-07-01T12:00:00Z'), T('2027-07-01T11:55:00Z'))).toEqual(['recordatorio_10']);
    expect(ventanasPara(T('2027-07-01T12:00:00Z'), T('2027-07-01T11:50:01Z'))).toEqual(['recordatorio_10']);
  });

  it('pasado el inicio no hay recordatorio', () => {
    expect(ventanasPara(T('2027-07-01T12:00:00Z'), T('2027-07-01T12:00:01Z'))).toEqual([]);
  });

  it('tipos conocidos', () => {
    expect(TIPOS_RECORDATORIO).toEqual(['recordatorio_20', 'recordatorio_10']);
  });
});
