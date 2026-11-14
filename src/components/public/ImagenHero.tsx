'use client';

import Image from 'next/image';
import { useState } from 'react';

export function ImagenHero() {
  const [fallo, setFallo] = useState(false);
  if (fallo) {
    return <div className="portada-hero-visual portada-hero-reserva" aria-hidden="true" />;
  }
  return (
    <div className="portada-hero-visual">
      <Image
        src="/imagenes/hero-reservas.png"
        alt="Complejo deportivo moderno con canchas de fútbol iluminadas al atardecer"
        width={1600}
        height={1000}
        sizes="(max-width: 900px) 100vw, 46vw"
        priority
        onError={() => setFallo(true)}
      />
    </div>
  );
}
