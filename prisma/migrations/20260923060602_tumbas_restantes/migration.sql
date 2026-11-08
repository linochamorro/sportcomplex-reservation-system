-- AlterTable
ALTER TABLE "Comprobante" ADD COLUMN     "eliminadoEn" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "Notificacion" ADD COLUMN     "eliminadoEn" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "eliminadoEn" TIMESTAMPTZ(6);
