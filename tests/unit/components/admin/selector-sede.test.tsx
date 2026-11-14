import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SelectorSede } from '@/components/admin/SelectorSede';

const reemplazar = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: reemplazar }),
}));

describe('SelectorSede', () => {
  it('navega a la sede elegida', () => {
    render(<SelectorSede sedes={[{ id: 1, nombre: 'Norte' }, { id: 2, nombre: 'Sur' }]} actual="" base="/canchas" />);
    fireEvent.change(screen.getByLabelText('Sede'), { target: { value: '2' } });
    expect(reemplazar).toHaveBeenCalledWith('/canchas?sede=2');
  });
});
