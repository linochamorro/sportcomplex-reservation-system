export type Datos =
  | Array<{ sede: string; cancha: string; fecha: string; diaSemana: number; horaInicio: string; reservas: number; ingresosCentavos: number }>
  | { porSede: Array<{ sede: string; confirmadas: number; ingresosCentavos: number; ticketPromedioCentavos: number }>; porCancha: Array<{ sede: string; cancha: string; confirmadas: number; ingresosCentavos: number }> }
  | { filas: Array<{ sede: string; estado: string; total: number; tasa: number }>; total: number }
  | { top: Array<{ usuarioNombre: string; usuarioEmail: string; reservas: number; confirmadas: number; ingresosCentavos: number }>; horasPico: Array<{ horaInicio: string; reservas: number }> };
