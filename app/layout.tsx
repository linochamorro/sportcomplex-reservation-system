import type { Metadata } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const texto = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--fuente-texto',
  display: 'swap',
});

const display = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--fuente-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Reservas deportivas',
    template: '%s · Reservas deportivas',
  },
  description: 'Sistema de reserva de canchas por turnos, multisede, local-first',
  applicationName: 'Reservas deportivas',
};

export default function DisposicionRaiz({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${texto.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
