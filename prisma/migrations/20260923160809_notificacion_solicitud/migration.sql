-- AlterTable
ALTER TABLE "Notificacion" ADD COLUMN     "solicitudId" INTEGER;

-- CreateIndex
CREATE INDEX "Notificacion_solicitudId_idx" ON "Notificacion"("solicitudId");
