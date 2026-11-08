-- RLS deny-by-default + FORCE desde día uno (A-02/AC-02).
-- Sin políticas permisivas: la app opera server-side y el aislamiento
-- por sede/rol se verifica en código (A-03) y en segunda revisión (D-01).

ALTER TABLE public."Sede" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Sede" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Cancha" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Cancha" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Tarifa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Tarifa" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Usuario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Usuario" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Solicitud" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Solicitud" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Comprobante" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Comprobante" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."BloqueoCancha" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BloqueoCancha" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."AccionReservaAfectada" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AccionReservaAfectada" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Notificacion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Notificacion" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PasswordResetToken" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."IntentoLogin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."IntentoLogin" FORCE ROW LEVEL SECURITY;

-- Matriz sede/rol (Auditor A-02 obs. 3): ADMIN exige sede, SUPERADMIN la prohíbe.
ALTER TABLE public."Usuario"
  ADD CONSTRAINT usuario_rol_sede_chk CHECK (
    (rol = 'ADMIN' AND "sedeId" IS NOT NULL)
    OR (rol = 'SUPERADMIN' AND "sedeId" IS NULL)
    OR (rol = 'USUARIO')
  );

-- Formato HH:mm y YYYY-MM-DD (Auditor A-02 obs. 7, mínimo día uno).
ALTER TABLE public."Sede"
  ADD CONSTRAINT sede_apertura_chk CHECK (apertura ~ '^[0-2][0-9]:[0-5][0-9]$'),
  ADD CONSTRAINT sede_cierre_chk CHECK (cierre ~ '^[0-2][0-9]:[0-5][0-9]$');
ALTER TABLE public."Tarifa"
  ADD CONSTRAINT tarifa_horas_chk CHECK (
    "horaInicio" ~ '^[0-2][0-9]:[0-5][0-9]$'
    AND "horaFin" ~ '^[0-2][0-9]:[0-5][0-9]$'
  );
ALTER TABLE public."Solicitud"
  ADD CONSTRAINT solicitud_fecha_chk CHECK (fecha ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  ADD CONSTRAINT solicitud_horas_chk CHECK (
    "horaInicio" ~ '^[0-2][0-9]:[0-5][0-9]$'
    AND "horaFin" ~ '^[0-2][0-9]:[0-5][0-9]$'
  );
ALTER TABLE public."BloqueoCancha"
  ADD CONSTRAINT bloqueo_fecha_chk CHECK (fecha ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  ADD CONSTRAINT bloqueo_horas_chk CHECK (
    "horaInicio" ~ '^[0-2][0-9]:[0-5][0-9]$'
    AND "horaFin" ~ '^[0-2][0-9]:[0-5][0-9]$'
  );
