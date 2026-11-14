# Seguridad y autenticación

## Sesión

`src/lib/auth/sesion.ts` firma y verifica JWT HS256 con vencimiento de 30 minutos. La cookie `access_token` se emite con `HttpOnly` y `SameSite=Lax`, y añade `Secure` cuando la solicitud se considera HTTPS. El JWT transporta el identificador; cada lectura consulta el usuario persistido y toma de esa fila el rol y la sede actuales.

## Autorización

Las funciones comunes exigen sesión, rol, sede y pertenencia del recurso a la sede. Las rutas aplican estas comprobaciones junto con validación de entrada. Las migraciones activan y fuerzan RLS para las tablas indicadas, sin políticas permisivas; el aislamiento de negocio también se aplica en el servidor. No se debe interpretar la presencia de RLS como sustituto de autorización de aplicación.

## Protección de solicitudes

`src/lib/auth/csrf.ts` acepta métodos seguros y, para mutaciones, rechaza contexto cross-site y exige origen HTTP(S) coincidente con el host esperado. Los cuerpos con límite se procesan con la utilidad compartida. La autenticación aplica control de intentos y hash de contraseñas. Los tokens de recuperación se almacenan como hash en el modelo persistente.

La frontera HTTP evita devolver mensajes internos de errores 5xx y registra solo metadatos clasificados. La configuración sensible se consume desde el entorno de ejecución; los documentos y ejemplos no deben contener valores de credenciales.

## Mantenimiento y proveedores

`/api/mantenimiento` falla de forma cerrada cuando falta autorización y compara el Bearer en tiempo constante antes de mutar datos. El workflow `maintenance.yml` requiere variables de entorno gestionadas en la plataforma de CI. Correo y almacenamiento tienen adaptadores; sin configuración, las funciones correspondientes pueden fallar o responder como no disponibles.

## Alcance

Este texto describe controles visibles en el código y migraciones presentes. No representa una certificación ni una verificación del entorno desplegado.

