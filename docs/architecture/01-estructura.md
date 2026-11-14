# Estructura y límites

## Organización del código

- `src/app/`: páginas, layouts y manejadores HTTP en `src/app/api/`.
- `src/components/`: interfaz reutilizable agrupada por función (`admin/`, `auth/`, `reservas/`, `offline/`, entre otras).
- `src/lib/domain/`: reglas y casos de uso de reservas, disponibilidad, tarifas, bloqueos, comprobantes y recordatorios.
- `src/lib/auth/`: sesión, validación, límites de intentos, protección de origen y correo.
- `src/lib/db/`: cliente Prisma y cliente generado.
- `src/lib/offline/` y `src/lib/sync/`: persistencia local, protocolo de sincronización y procesamiento de cola.
- `src/lib/panel/`: métricas, reportes y generación PDF.
- `prisma/`: esquema y migraciones SQL.
- `tests/unit/`, `tests/integration/`, `tests/e2e/`: pruebas aisladas, dependientes de integración y de navegador.
- `tools/scripts/`: utilidades operativas y de captura.
- `docs/`: arquitectura, decisiones, especificación, procedimientos e imágenes.

## Límites de responsabilidad

Las páginas componen la experiencia y solicitan datos; las rutas HTTP traducen solicitudes a validación, autorización y casos de uso; los módulos de dominio concentran reglas; Prisma media el acceso a PostgreSQL. El almacenamiento offline mantiene una outbox, caché y blobs del navegador y accede al servidor mediante una puerta HTTP.

Los módulos `src/lib/db/generated/` son artefactos generados por Prisma. El esquema fuente está en `prisma/schema.prisma`; los cambios estructurales persistentes se representan además en `prisma/migrations/`.

## Configuración de pruebas

`vitest.unit.config.ts` restringe el conjunto unitario y desactiva carga automática de variables de entorno (`envDir: false`). `vitest.config.mts` selecciona pruebas de integración. `playwright.config.ts` define pruebas de navegador en `tests/e2e/`, un servidor local de producción y configuración de un worker. La configuración no implica que las pruebas hayan sido ejecutadas ni que sus servicios estén disponibles.
