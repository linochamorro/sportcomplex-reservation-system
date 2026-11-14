# ADR-004: cola offline idempotente

- Estado: reflejado en el contrato y código actual.
- Contexto: la red puede fallar después de enviar una operación, haciendo necesario reintentar sin repetir efectos.
- Decisión: guardar operaciones en IndexedDB con UUID de cliente, hash canónico y ACK por operación; el servidor deduplica por usuario e identificador y arbitra los resultados.
- Consecuencia: conflictos permanecen visibles; reintentos no convierten la caché local en autoridad. El protocolo está descrito en [invariantes](../SYNC_INVARIANTES.md).
- Evidencia: `src/lib/offline/`, `src/lib/sync/`, `src/app/api/sync/`.
