import { bd } from '../db/cliente.js';

/** Todo escritor de dominio (B-02..) debe registrar aquí en la MISMA transacción. */
export async function registrarCambio(
  tx: Omit<typeof bd, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  cambio: {
    tabla: string;
    filaId: number;
    sedeId?: number | null;
    usuarioId?: number | null;
    eliminado?: boolean;
  },
): Promise<void> {
  await tx.registroCambio.create({
    data: {
      tabla: cambio.tabla,
      filaId: cambio.filaId,
      sedeId: cambio.sedeId ?? null,
      usuarioId: cambio.usuarioId ?? null,
      eliminado: cambio.eliminado ?? false,
    },
  });
}
