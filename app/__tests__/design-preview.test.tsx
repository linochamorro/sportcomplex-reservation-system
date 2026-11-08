import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import VistaPrevia from '../design-preview/page';
import { IDS_ESTADO } from '@/lib/design-tokens';

describe('vista previa de diseño (C-01)', () => {
  it('muestra los 10 estados con su etiqueta', () => {
    render(<VistaPrevia />);
    expect(screen.getByRole('heading', { name: /vista previa de diseño/i })).toBeInTheDocument();
    expect(screen.getAllByRole('img').length).toBe(IDS_ESTADO.length);
    expect(screen.getByRole('timer')).toHaveTextContent('04:32');
  });
});
