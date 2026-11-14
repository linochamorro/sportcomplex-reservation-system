# Invariantes server-wins — vinculantes para B-02.. (contrato B-01 v1)

1. **El hold nace en persistencia servidor**, nunca en la intención offline. Ventana 90 min, hold 30 min y cuenta atrás se computan contra reloj servidor.
2. **Primero-en-servidor-gana.** Ante divergencia, el perdedor recibe `conflicto` con motivo y acción (re-elegir slot).
3. **Nada provisional se renderiza como confirmado.** El estado `conflicto` es visible con acción; prohibida la sobreescritura silenciosa de caché.
4. **Prohibido `cliente-gana`**, también en reintentos automáticos.
5. **`comprobante.subir` contra solicitud terminal** → resultado terminal con motivo específico, nunca reintento infinito.
6. **Toda mutación de dominio escribe `RegistroCambio` en la misma transacción** (vía `registrarCambio(tx, …)`); prohibido hard-delete de filas sincronizables (soft-delete + tumba).
7. **Semántica de error (vinculante):** HTTP 400 solo para lote inválido (`ops` ausente/vacío/>100) o cursor malformado. Todo rechazo por-op (UUID no-v4, tipo desconocido, carga inválida, sede discordante, reuso con distinta carga) viaja como ACK `{estado:'rechazada', motivo}` dentro de HTTP 200, para no romper el lote parcial. `aceptada` / `conflicto` / `rechazada` son los únicos estados de ACK.
8. **Consumo de cola con `FOR UPDATE SKIP LOCKED`** (`tomarLote` dentro de la transacción del procesador); purga 30 d (operaciones) / 90 d (tumbas) preservando dedup. Ventana de resync: clientes más stale que 90 d hacen pull desde `0`.
