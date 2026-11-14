-- Disponibilidad operativa de canchas con motivo obligatorio cuando no están disponibles.
CREATE TYPE "EstadoCancha" AS ENUM ('DISPONIBLE', 'NO_DISPONIBLE');

ALTER TABLE "Cancha"
  ADD COLUMN "estado" "EstadoCancha" NOT NULL DEFAULT 'NO_DISPONIBLE',
  ADD COLUMN "motivoNoDisponible" TEXT;

UPDATE "Cancha" AS c
  SET "estado" = 'DISPONIBLE',
    "motivoNoDisponible" = NULL
  WHERE c."estado" = 'NO_DISPONIBLE'
    AND EXISTS (
      SELECT 1 FROM "Tarifa" AS t
      WHERE t."sedeId" = c."sedeId" AND t."eliminadoEn" IS NULL
    );

UPDATE "Cancha"
  SET "motivoNoDisponible" = 'Sin tarifa asignada'
  WHERE "estado" = 'NO_DISPONIBLE' AND "motivoNoDisponible" IS NULL;

ALTER TABLE "Cancha"
  ADD CONSTRAINT cancha_estado_motivo_chk CHECK (
    ("estado" = 'DISPONIBLE' AND "motivoNoDisponible" IS NULL)
    OR ("estado" = 'NO_DISPONIBLE' AND btrim("motivoNoDisponible") <> '')
  );
