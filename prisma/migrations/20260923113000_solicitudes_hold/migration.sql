-- DropIndex
DROP INDEX "Solicitud_canchaId_fecha_horaInicio_key";

-- AlterTable
ALTER TABLE "OperacionPendiente" ADD COLUMN     "resultado" JSONB;

-- CreateIndex
CREATE INDEX "Solicitud_canchaId_fecha_horaInicio_idx" ON "Solicitud"("canchaId", "fecha", "horaInicio");

-- Sin doble booking (B-02/AC-03): índice único PARCIAL. Solo los estados que
-- bloquean el slot están restringidos; RECHAZADA/LIBERADA/CANCELADA/NO_SHOW y
-- las filas con soft-delete quedan libres para historial y reintento.
CREATE UNIQUE INDEX "Solicitud_slot_activo_key"
  ON "Solicitud"("canchaId", "fecha", "horaInicio")
  WHERE "estado" IN ('PENDIENTE', 'CONFIRMADA') AND "eliminadoEn" IS NULL;

