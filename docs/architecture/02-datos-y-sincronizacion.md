# Datos y sincronización

## Persistencia

`prisma/schema.prisma` define entidades para sedes, canchas, tarifas, usuarios, solicitudes, comprobantes, bloqueos, notificaciones, tokens de recuperación, intentos de acceso y registros de operaciones/cambios. Las relaciones, restricciones e índices se complementan con migraciones SQL.

Una solicitud contiene fecha y horas, estado, importe en centavos e información de retención temporal. La tarifa se calcula en el servidor desde las tarifas aplicables y la tarifa base de la cancha. La creación consulta disponibilidad y ejecuta lógica transaccional; el esquema documenta el índice parcial que impide ocupar dos veces una cancha y franja para estados activos.

## Operación sin conexión

La base IndexedDB, gestionada por Dexie, contiene `outbox`, `cache` y `blobs`. El cliente asigna identificador a cada operación, la ordena y conserva intentos. La sincronización requiere sesión: primero envía operaciones pendientes y luego solicita cambios desde un cursor. Los cambios aplicados actualizan la caché; las tumbas expulsan filas locales.

El servidor valida lote, identificador, tipo y carga; aplica límites de tamaño y comprueba la sede desde la sesión. La deduplicación vincula usuario e identificador de operación y compara un hash canónico de la carga. El procesador consume operaciones en transacción con bloqueo de filas, procesa cada operación en aislamiento local y devuelve ACK individual. Una falla transitoria mantiene la operación reintentable.

El pull ordena `RegistroCambio` por secuencia, limita el lote y filtra filas según identidad, sede y tabla. El cursor avanza sobre los registros examinados incluso cuando algunos no son visibles. Los cambios de dominio deben registrar su evento en la misma transacción que la mutación; véase [SYNC_INVARIANTES.md](../SYNC_INVARIANTES.md).

## Retención

El código de mantenimiento declara retención de operaciones terminales de 30 días y registros de cambio de 90 días. Las operaciones pendientes no se purgan. Clientes fuera de la ventana de cambios deben resincronizar desde el cursor inicial. Estos plazos son constantes de código, no una garantía de que una tarea programada esté activa.

## Consistencia

El servidor arbitra disponibilidad y estado confirmado. Las respuestas por operación distinguen aceptación, conflicto y rechazo; un rechazo reintentable no equivale a una operación aplicada. La interfaz no debe presentar una intención pendiente como reserva confirmada.
