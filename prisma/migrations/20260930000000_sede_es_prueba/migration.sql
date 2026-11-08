-- Sede de pruebas: se excluye del catálogo público de reservas.
ALTER TABLE "Sede" ADD COLUMN IF NOT EXISTS "esPrueba" boolean NOT NULL DEFAULT false;

-- Marca las sedes creadas por las corridas de prueba que quedaron en la BD.
UPDATE "Sede"
SET "esPrueba" = true
WHERE nombre ~ '^E2E_' OR nombre ~ '^QA ' OR nombre ~ '^SyncB_';

CREATE INDEX IF NOT EXISTS "Sede_esPrueba_idx" ON "Sede"("esPrueba");
