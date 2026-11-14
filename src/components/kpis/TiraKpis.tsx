'use client';

export type Kpi = { etiqueta: string; valor: string };

/** Tira de KPIs por props (sin focables). */
export function TiraKpis({ kpis }: { kpis: Kpi[] }) {
  if (kpis.length === 0) return <p role="status">Sin datos para este día.</p>;
  return (
    <dl aria-label="Indicadores">
      {kpis.map((k) => (
        <div key={k.etiqueta}>
          <dt>{k.etiqueta}</dt>
          <dd>{k.valor}</dd>
        </div>
      ))}
    </dl>
  );
}
