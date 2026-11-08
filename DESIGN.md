# DESIGN.md — sportcomplex-reservation-system (nueva versión)

**Versión:** 1.0 · **Estado:** APROBADO por Lino · **Fecha:** 2026-09-23
**Base:** `README.md`, `ROADMAP.md` y `DESIGN.md`.

## 1. Dirección

Híbrida por zona, heredada del sistema probado del origen y adaptada al modelo nuevo:
zona pública deportiva y sobria; zona operativa sobria y densa. El ámbar vive
**solo** en la zona pública (hero, franja de valor, pastilla de pendiente en
historial de usuario); la operación nunca lo usa.

## 2. Tokens

Fuente única: `lib/design-tokens.ts`; espejo CSS en `app/globals.css`; paridad
impuesta por `lib/__tests__/design-tokens.test.ts`.

- Primitivos: `green-600 #16A34A`, `green-700 #15803D`, `green-900 #14532D`,
  `green-50 #F0FDF4`, `red-600 #DC2626`, `amber-500 #F59E0B`, `amber-50 #FFFBEB`,
  `amber-950 #451A03`, `slate-600 #475569`, `ink #1F2937`, `mist #F3F4F6`, `white #FFFFFF`.
- Semánticos: acción primaria, destructiva, fondo app, superficie, texto,
  texto secundario, borde, foco, enlace.
- Tipografía: Barlow (texto) + Barlow Condensed (display), sistema como respaldo.
- Espaciado 4–64, radios 6/8 (2/4 solo hero público), foco 2 px + offset 2 px,
  duraciones 150/200/300 ms, `prefers-reduced-motion` reduce todo.

## 3. Gramática de estados (6 + 4)

Cada estado combina 4 canales obligatorios: **color, icono, patrón, etiqueta**.
Ningún estado depende solo del color.

### 3.1 Dominio (6)

| Estado | Color | Icono | Patrón | Etiqueta |
|---|---|---|---|---|
| PENDIENTE | ámbar suave + borde dashed | reloj | rayado 45° | `Pendiente · vence en mm:ss` (cuenta atrás viva) |
| CONFIRMADA | verde sólido | check | sólido | `Confirmada` |
| RECHAZADA | rojo suave | x | contorno | `Rechazada · motivo visible` |
| LIBERADA | neutra dotted | candado-abierto | punteado | `Liberada` |
| CANCELADA | neutra double | prohibido | borde doble | `Cancelada · motivo` |
| NO_SHOW | rojo sólido | alerta | sólido oscuro | `No show · retenido` |

### 3.2 Sincronización (4, solo vistas con datos)

| Estado | Color | Icono | Patrón | Etiqueta |
|---|---|---|---|---|
| pendiente-envío | slate | subir | contorno fino | `Se enviará al conectar` |
| sincronizando | azul sobrio | sync | animado (respeta reduced-motion) | `Sincronizando…` |
| conflicto | púrpura sobrio | bifurcación | rayado inverso | `Conflicto · re-elegir slot` (con acción, nunca silencioso) |
| offline | slate oscuro | wifi-off | trama | `Sin conexión · reintentando` |

## 4. Flujos y pantallas

- **USUARIO:** `/reservar` (formulario único con ayudas de ventana), `/mis-reservas` (existe: sin 404), `/notificaciones`, `/ayuda` (existe).
- **ADMIN (sede):** `/grilla?sede=&fecha=`, `/pendientes`, `/bloqueos`, `/kpis`, `/notificaciones`.
- **SUPERADMIN:** `/consolidado`, `/sedes`, `/canchas`, `/tarifas`, `/usuarios`.
- Navegación dual por rol (lateral escritorio + inferior móvil) con contadores **vivos** (cero contadores estáticos, cero `30:00` ficticio).
- Banner de sesión persistente no-modal con cuenta atrás + conservación de borrador.
- Esqueletos en toda espera; `role=status/alert/timer` según caso; foco al resumen ante error.

## 5. Accesibilidad objetivo

Verificada en C-03; ver `README.md` / `DESIGN.md`.

Landmarks con nombre, `html lang=es`, iconos decorativos `aria-hidden`,
encabezados ordenados, tablas con `scope`, foco visible global, trap en
diálogos, etiquetas permanentes, pares AA de §2 medidos en render.

## 6. Historial

- 2026-09-23: propuesta v1.0; pendiente de aprobación de Lino.
- 2026-09-23: APROBADO por Lino tras revisión visual en `/design-preview`.
