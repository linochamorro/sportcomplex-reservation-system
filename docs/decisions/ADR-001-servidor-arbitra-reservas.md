# ADR-001: servidor como árbitro de reservas

- Estado: reflejado en la implementación actual.
- Contexto: disponibilidad, precio y estado de una solicitud no deben depender solo de valores enviados por el navegador.
- Decisión: validar y calcular en el servidor; persistir la solicitud mediante lógica transaccional y restricciones SQL para concurrencia.
- Consecuencia: una intención local no es confirmación. El cliente debe mostrar el estado devuelto por el servidor.
- Evidencia: `src/lib/domain/crear-solicitud.ts`, `src/lib/domain/turnos.ts`, `src/lib/domain/disponibilidad.ts`, `prisma/schema.prisma` y migraciones de índices.
