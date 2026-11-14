/** Esqueleto de espera (toda espera lo usa; nunca solo texto). */
export function Esqueleto({ lineas = 3, etiqueta = 'Cargando contenido' }: { lineas?: number; etiqueta?: string }) {
  return (
    <div role="status" aria-label={etiqueta} className="pv-esqueleto">
      {Array.from({ length: lineas }, (_, i) => (
        <span key={i} className="pv-linea" />
      ))}
    </div>
  );
}
