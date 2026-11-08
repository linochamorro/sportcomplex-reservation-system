/*
  Warnings:

  - Added the required column `actualizadoEn` to the `BloqueoCancha` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actualizadoEn` to the `Cancha` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actualizadoEn` to the `Comprobante` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actualizadoEn` to the `Notificacion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actualizadoEn` to the `Sede` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actualizadoEn` to the `Solicitud` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actualizadoEn` to the `Tarifa` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actualizadoEn` to the `Usuario` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EstadoOperacion" AS ENUM ('pendiente', 'procesada', 'conflicto', 'fallida_terminal');

-- AlterTable
ALTER TABLE "BloqueoCancha" ADD COLUMN     "actualizadoEn" TIMESTAMPTZ(6) NOT NULL,
ADD COLUMN     "eliminadoEn" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "Cancha" ADD COLUMN     "actualizadoEn" TIMESTAMPTZ(6) NOT NULL,
ADD COLUMN     "eliminadoEn" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "Comprobante" ADD COLUMN     "actualizadoEn" TIMESTAMPTZ(6) NOT NULL;

-- AlterTable
ALTER TABLE "Notificacion" ADD COLUMN     "actualizadoEn" TIMESTAMPTZ(6) NOT NULL;

-- AlterTable
ALTER TABLE "Sede" ADD COLUMN     "actualizadoEn" TIMESTAMPTZ(6) NOT NULL,
ADD COLUMN     "eliminadoEn" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "Solicitud" ADD COLUMN     "actualizadoEn" TIMESTAMPTZ(6) NOT NULL,
ADD COLUMN     "eliminadoEn" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "Tarifa" ADD COLUMN     "actualizadoEn" TIMESTAMPTZ(6) NOT NULL,
ADD COLUMN     "eliminadoEn" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "actualizadoEn" TIMESTAMPTZ(6) NOT NULL;

-- CreateTable
CREATE TABLE "OperacionPendiente" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "clienteOpId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "carga" JSONB NOT NULL,
    "cargaHash" TEXT NOT NULL,
    "estado" "EstadoOperacion" NOT NULL DEFAULT 'pendiente',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoReintento" TIMESTAMPTZ(6),
    "ultimoError" TEXT,
    "creadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "OperacionPendiente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroCambio" (
    "seq" BIGSERIAL NOT NULL,
    "tabla" TEXT NOT NULL,
    "filaId" INTEGER NOT NULL,
    "sedeId" INTEGER,
    "usuarioId" INTEGER,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "cambiadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroCambio_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE INDEX "OperacionPendiente_usuarioId_estado_idx" ON "OperacionPendiente"("usuarioId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "OperacionPendiente_usuarioId_clienteOpId_key" ON "OperacionPendiente"("usuarioId", "clienteOpId");

-- CreateIndex
CREATE INDEX "RegistroCambio_seq_idx" ON "RegistroCambio"("seq");

-- CreateIndex
CREATE INDEX "RegistroCambio_sedeId_seq_idx" ON "RegistroCambio"("sedeId", "seq");

-- CreateIndex
CREATE INDEX "RegistroCambio_usuarioId_seq_idx" ON "RegistroCambio"("usuarioId", "seq");

-- CreateIndex
CREATE INDEX "BloqueoCancha_canchaId_fecha_idx" ON "BloqueoCancha"("canchaId", "fecha");

-- CreateIndex
CREATE INDEX "Cancha_sedeId_idx" ON "Cancha"("sedeId");

-- CreateIndex
CREATE INDEX "Comprobante_solicitudId_idx" ON "Comprobante"("solicitudId");

-- CreateIndex
CREATE INDEX "Notificacion_usuarioId_leida_idx" ON "Notificacion"("usuarioId", "leida");

-- CreateIndex
CREATE INDEX "Solicitud_canchaId_fecha_idx" ON "Solicitud"("canchaId", "fecha");
