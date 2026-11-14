export type CanchaAdmin = {
  id: number;
  nombre: string;
  tarifaBaseCentavos: number;
  estado: 'DISPONIBLE' | 'NO_DISPONIBLE';
  motivoNoDisponible: string | null;
};

export type TarifaOpcion = {
  id: number;
  nombre: string;
  diasSemana: number[];
  horaInicio: string;
  horaFin: string;
  montoCentavos: number;
};

export type VistaEliminacion = {
  turnos: Array<{
    id: number;
    fecha: string;
    horaInicio: string;
    horaFin: string;
    estado: string;
    alternativas: Array<{ id: number; nombre: string; estado: string; libre: boolean }>;
  }>;
};

export type Reasignacion = {
  destino: string;
  fecha: string;
  hora: string;
  libre: boolean | null;
  trabajando: boolean;
  error: string | null;
};

export type FormularioCancha = { nombre: string; tarifa: string; estado: string; motivo: string };
