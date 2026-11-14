type Cancha = { id: number; nombre: string; tarifaBaseCentavos: number };
type Tarifa = { id: number; nombre: string; diasSemana: number[]; horaInicio: string; horaFin: string; montoCentavos: number };

function minutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function diaSemana(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Tarifa vigente para sede + día + hora, o null si aplica la base de la cancha. */
export function tarifaAplicable(tarifas: Tarifa[], fecha: string, horaInicio: string): Tarifa | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(horaInicio)) return null;
  const dow = diaSemana(fecha);
  const min = minutos(horaInicio);
  return tarifas.find((t) => t.diasSemana.includes(dow) && minutos(t.horaInicio) <= min && min < minutos(t.horaFin)) ?? null;
}

/**
 * Precio orientativo de la cancha: rango real de las tarifas de la sede (el
 * cobro sale de la tarifa que aplica al día y hora). Nunca anuncia la tarifa
 * base como si fuera el precio final, porque puede no existir en ninguna tarifa.
 */
export function precioCancha(cancha: Cancha, tarifas: Tarifa[]): string {
  const montos = tarifas.map((t) => t.montoCentavos);
  if (montos.length === 0) return 'sin tarifa configurada';
  const min = Math.min(...montos);
  const max = Math.max(...montos);
  return min === max ? `S/ ${min / 100} por hora` : `S/ ${min / 100} a S/ ${max / 100} según día y hora`;
}

