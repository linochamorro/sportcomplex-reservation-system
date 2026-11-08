# ROADMAP.md — sportcomplex-reservation-system (nueva versión)

**Estado:** APROBADO por Lino · **Fecha:** 2026-09-24
**Fuentes canónicas:** `README.md`, `ROADMAP.md` y `DESIGN.md`

## Convenciones de estado

- `CLOSED`: aceptación y evidencia cerradas.
- `PASSED_LOCAL`: gates locales cerrados; falta evidencia externa.
- `PARTIAL`: parte de la aceptación verificada; queda deuda explícita.
- `BLOCKED_EXTERNAL`: implementación disponible, pero falta una dependencia externa.
- `EN_CURSO`: trabajo iniciado y aún no cerrado.

## Fase A — Cimientos

| ID | Tarea | Owner | Estado | Aceptación | Evidencia |
|---|---|---|---|---|---|
| A-01 | Repo + CI con gates bloqueantes | Equipo | PASSED_LOCAL | Push ejecuta build, typecheck, lint y tests; CI remota completa aún pendiente | `.github/workflows/ci.yml` |
| A-02 | Modelo + migraciones + RLS | Equipo | CLOSED | 11 tablas iniciales y 13 vigentes con RLS `FORCED`; evidencia local documentada | `README.md` / `DESIGN.md` |
| A-03 | Auth + matriz de roles | Equipo | CLOSED | Tests negativos por rol/sede y expiración de sesión | `README.md` / `DESIGN.md` |

## Fase B — Núcleo offline-first

| ID | Tarea | Owner | Estado | Aceptación | Evidencia |
|---|---|---|---|---|---|
| B-01 | Store local, outbox y sync | Equipo | CLOSED | Intención offline y resolución de conflictos | `README.md` / `DESIGN.md` |
| B-02 | Solicitudes, holds y relojes | Equipo | CLOSED | Hold, ventana y librarianía de estados | `README.md` / `DESIGN.md` |
| B-03 | Verificación, no-show y bloqueos | Equipo | CLOSED | Mutaciones y reconciliación offline | `README.md` / `DESIGN.md` |
| B-04 | Comprobantes y Storage | Equipo | CLOSED_WITH_EXTERNAL_DEPENDENCY | Magic bytes, blob local y adaptador; subida real pertenece a D-02 | `README.md` / `DESIGN.md` |
| B-05 | Notificaciones y recordatorios | Equipo | CLOSED_WITH_EXTERNAL_DEPENDENCY | Workers, tokens y contrato SMTP; entrega real pertenece a D-02 | `README.md` / `DESIGN.md` |

## Fase C — UI portfolio

| ID | Tarea | Owner | Estado | Aceptación | Evidencia |
|---|---|---|---|---|---|
| C-01 | Diseño, tokens y estados | Equipo | CLOSED | Dirección aprobada | `DESIGN.md` |
| C-02 | Pantallas y rutas | Equipo | CLOSED | Sin rutas rotas ni contadores ficticios | `README.md` / `DESIGN.md` |
| C-03 | Accesibilidad y responsive | Equipo | CLOSED | Foco, landmarks, formularios y pares AA | `DESIGN.md` |

## Fase D — Endurecimiento y cierre

| ID | Tarea | Owner | Estado | Aceptación | Evidencia |
|---|---|---|---|---|---|
| D-01 | Throttle, anti-enumeración y cookies | Equipo | CLOSED_WITH_CONCERN | Gates funcionales cerrados; observación temporal retenida | `README.md` / `DESIGN.md` |
| D-02 | E2E, smoke y verificación viva | Equipo | CLOSED | RLS, Storage, SMTP, scheduler, Vercel, E2E y CI remota con evidencia | `README.md` / `DESIGN.md` |
| D-03 | Limpieza documental y trazabilidad | Equipo | CLOSED | Fuentes canónicas sin estados falsos y matriz bidireccional | `README.md` / `ROADMAP.md` / `DESIGN.md` |

## Matriz de trazabilidad

### Hallazgos y criterios externos

| ID | Definición operacional | Task/AC | Evidencia actual | Estado | Bloqueante |
|---|---|---|---|---|---|
| F-01 | Identidad, autorización y aislamiento por rol | A-03; D-02/AC-01 | `README.md` / `DESIGN.md` | PASSED_LOCAL | RLS contra BD destino |
| F-02 | Gate de CI y calidad automatizada | A-01 | `.github/workflows/ci.yml` | PASSED_LOCAL | Run remoto completo |
| F-03 | Consistencia documental y trazabilidad | D-03 | `README.md`; `ROADMAP.md`; `DESIGN.md` | CLOSED | — |
| F-04 | Dirección visual, estados y accesibilidad | C-01; C-03 | `DESIGN.md` | CLOSED | — |
| F-05 | Producción, smoke y operación | D-02/AC-04, AC-06, AC-07 | Vercel READY; GitHub Actions `maintenance` y `ci` SUCCESS | PASSED | — |
| F-06 | RLS y secretos de infraestructura | A-02; D-02/AC-01, AC-02 | Migración, bucket privado, variables Vercel, RLS y Storage live | PASSED | — |
| F-07 | Comprobantes, notificaciones y correo | B-04; B-05; D-02/AC-03 | Recuperación SMTP recibida; E2E comprobante/offline | PASSED | — |
| I-01 | Evidencia viva de RLS | D-02/AC-01 | RLS activa y forzada en 13 tablas; rol sin políticas con cero filas | PASSED | — |
| I-02 | Evidencia viva de Storage | D-02/AC-02 | Upload/download real y eliminación de archivo de prueba | PASSED | — |
| I-03 | Evidencia viva de SMTP | D-02/AC-03 | Recuperación recibida en Gmail de prueba | PASSED | — |
| I-04 | Evidencia viva de cron/CI | D-02/AC-04, AC-07 | `maintenance` y `ci` GitHub Actions SUCCESS; Vercel READY | PASSED | — |

### Tareas y AC hacia sus fuentes

| Task/AC | Fuente | Criterio cubierto | Evidencia | Estado |
|---|---|---|---|---|
| D-02/AC-01 | F-01, F-06, I-01 | RLS de 13 tablas contra BD viva | D-02 local; falta destino | BLOCKED_EXTERNAL |
| D-02/AC-02 | F-06, I-02 | Storage privado real | Bucket `comprobantes`; falta upload/download | BLOCKED_EXTERNAL |
| D-02/AC-03 | F-07, I-03 | SMTP real y recepción | Recuperación Gmail recibida | PARTIAL |
| D-02/AC-04 | F-05, I-04 | Scheduler autenticado | GitHub Actions `maintenance` SUCCESS | PARTIAL |
| D-02/AC-05 | F-01, F-05, F-07 | E2E de todos los roles y estados | Suite local 23/23; cobertura incompleta | BLOCKED_EXTERNAL |
| D-02/AC-06 | F-05 | Smoke productivo | `/`, `/login`, `/registro` responden 200 | PARTIAL |
| D-02/AC-07 | F-02, F-05, I-04 | CI remota | Maintenance scheduler SUCCESS; CI completa pendiente | BLOCKED_EXTERNAL |
| D-03 | F-03 | Fuentes canónicas y trazabilidad | Matriz en este archivo | CLOSED_WITH_EXTERNAL_DEBT |

## Dependencias y puntos de control

A → B → C/D. `DESIGN.md` es el gate humano antes de páginas reales. Cada tarea requiere packet, pruebas, QA y cierre; ninguna métrica se degrada sin aprobación expresa. Las tareas de seguridad con revisión técnica son A-02, A-03, B-01, B-04 y D-01.

## Reglas de cierre

No marcar una integración como cerrada por tener configuración o tests unitarios: se requiere evidencia del entorno externo correspondiente. Este archivo conserva el estado vigente y la trazabilidad canónica en la documentación pública.
