# API y componentes

## Convenciones

Las rutas HTTP viven bajo `src/app/api/` y exportan manejadores por método. Las respuestas JSON se producen directamente o mediante `src/lib/auth/http.ts`. Las rutas protegidas leen la cookie y resuelven la sesión antes de operar. La forma exacta de cada cuerpo y respuesta debe consultarse en el manejador correspondiente.

## Grupos de rutas

| Área | Rutas visibles en el código |
|---|---|
| Sesión y cuenta | `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/register`, `/api/auth/recuperar`, `/api/cuenta/perfil`, `/api/cuenta/clave` |
| Catálogo | `/api/sedes`, `/api/sedes/[id]`, `/api/canchas`, `/api/canchas/[id]`, `/api/tarifas`, `/api/tarifas/[id]`, `/api/usuarios` |
| Reservas | `/api/solicitudes`, `/api/solicitudes/[id]/confirmar`, `/rechazar`, `/no-show`, `/comprobante` |
| Bloqueos | `/api/bloqueos`, `/api/bloqueos/[id]/afectadas`, `/reasignar`, `/reembolsar`, y reasignación/eliminación de canchas |
| Informes y avisos | `/api/reportes`, `/api/notificaciones`, `/api/comprobantes/firmar` |
| Sincronización y mantenimiento | `/api/sync` (push y pull), `/api/sync/procesar`, `/api/mantenimiento` |

Los segmentos dinámicos mostrados como sufijos forman parte de rutas distintas en sus directorios respectivos. Para permisos, métodos y formatos contractuales, prevalece el código de cada `route.ts`.

## Componentes

`src/components/auth/` contiene formularios de acceso, registro y recuperación. `src/components/reservas/` reúne captura de solicitud, campos y lista de reservas. `src/components/admin/` contiene gestión de canchas, sedes, tarifas y usuarios. `src/components/offline/`, `src/components/pendientes/` y `src/components/notificaciones/` presentan estados asociados a sincronización y operación; `src/components/layout/` adapta navegación y disposición.

`src/lib/domain/` implementa casos de uso; `src/lib/panel/` prepara métricas y documentos de reporte. Los componentes de interfaz no son una frontera de autorización: cada operación protegida debe validarse también en servidor.
