# ADR-005: registro de cambios transaccionales

- Estado: reflejado en el esquema y las escrituras de dominio.
- Contexto: clientes sincronizados necesitan consultar altas, cambios y eliminaciones desde un cursor.
- Decisión: conservar secuencia de cambios en `RegistroCambio`; las mutaciones de dominio registran su evento dentro de la transacción correspondiente. Pull filtra por identidad y sede.
- Consecuencia: cada nueva mutación sincronizable debe conservar el registro y sus metadatos de alcance.
- Evidencia: `src/lib/sync/registro.ts`, `src/app/api/sync/pull.ts`, `prisma/schema.prisma` y migraciones.
