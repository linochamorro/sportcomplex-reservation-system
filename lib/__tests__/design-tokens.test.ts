import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ESTADOS, IDS_ESTADO, PRIMITIVOS, SEMANTICOS } from '../design-tokens';

// Paridad tokens ↔ CSS + cobertura de la gramática 6+4 (C-01/AC-02/AC-03).
describe('design tokens (C-01)', () => {
  it('todo primitivo y semántico existe en globals.css con el mismo valor', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'app', 'globals.css'), 'utf8');
    for (const [nombre, valor] of [...Object.entries(PRIMITIVOS), ...Object.entries(SEMANTICOS)]) {
      expect(css).toContain(`--${nombre}: ${valor}`);
    }
    expect(css).toContain('--accent-public-amber: #F59E0B');
  });

  it('la gramática cubre 6 estados de dominio + 4 de sync con 4 canales', () => {
    expect(IDS_ESTADO).toHaveLength(10);
    for (const id of IDS_ESTADO) {
      const ficha = ESTADOS[id];
      expect(ficha.relleno).toBeTruthy();
      expect(ficha.texto).toBeTruthy();
      expect(ficha.borde).toBeTruthy();
      expect(ficha.iconoNombre).toBeTruthy();
      expect(ficha.patron).toBeTruthy();
      expect(ficha.etiqueta).toBeTruthy();
    }
  });

  it('pendiente exige cuenta atrás; rechazada/cancelada/conflicto exigen motivo', () => {
    expect(ESTADOS.pendiente.exigeCuentaAtras).toBe(true);
    expect(ESTADOS.rechazada.exigeMotivo).toBe(true);
    expect(ESTADOS.cancelada.exigeMotivo).toBe(true);
    expect(ESTADOS.conflicto.exigeMotivo).toBe(true);
  });
});
