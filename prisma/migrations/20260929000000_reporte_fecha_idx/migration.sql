-- QA-05: índice para los reportes mensuales (fecha LIKE 'AAAA-MM%').
CREATE INDEX IF NOT EXISTS "Solicitud_fecha_idx" ON "Solicitud"("fecha");
