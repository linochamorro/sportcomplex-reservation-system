# ADR-003: sesión y autorización por datos actuales

- Estado: reflejado en la implementación actual.
- Contexto: los permisos pueden cambiar mientras una cookie siga siendo válida.
- Decisión: usar JWT firmado como transporte de identidad y resolver rol y sede desde la fila actual del usuario en cada lectura de sesión; validar rol y pertenencia a sede en servidor.
- Consecuencia: el token no es por sí mismo una autorización permanente. Las rutas deben invocar los controles compartidos.
- Evidencia: `src/lib/auth/sesion.ts`, `src/lib/auth/csrf.ts`, rutas API y migraciones RLS.
