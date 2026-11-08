import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

import PaginaRaiz from '../page';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('portada pública', () => {
  it('presenta el servicio y sus accesos principales', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    render(<PaginaRaiz />);
    expect(await screen.findByRole('heading', { level: 1, name: /reservas deportivas/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /crear mi cuenta/i })).toHaveAttribute('href', '/registro');
    expect(screen.getByRole('link', { name: /ya tengo cuenta/i })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /centro de ayuda/i })).toHaveAttribute('href', '/ayuda');
  });
});
