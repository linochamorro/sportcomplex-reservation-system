ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."_prisma_migrations" FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "AccionReservaAfectada_solicitudId_idx"
ON public."AccionReservaAfectada" ("solicitudId");

CREATE INDEX IF NOT EXISTS "PasswordResetToken_usuarioId_idx"
ON public."PasswordResetToken" ("usuarioId");

CREATE INDEX IF NOT EXISTS "Solicitud_usuarioId_idx"
ON public."Solicitud" ("usuarioId");

CREATE INDEX IF NOT EXISTS "Usuario_sedeId_idx"
ON public."Usuario" ("sedeId");
