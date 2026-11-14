# ADR-002: límites por capas

- Estado: reflejado en la estructura actual.
- Contexto: páginas, transporte HTTP, reglas de dominio y persistencia tienen responsabilidades diferentes.
- Decisión: organizar interfaz en `src/app/` y `src/components/`, casos de uso en `src/lib/domain/`, adaptadores transversales en `src/lib/` y persistencia en Prisma.
- Consecuencia: las rutas coordinan entrada y salida; las reglas compartidas se mantienen en dominio y no se duplican entre interfaz y transporte.
- Evidencia: árbol `src/`, imports de rutas API y módulos de dominio.
