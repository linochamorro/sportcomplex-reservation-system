# ADR-006: pruebas separadas por dependencias

- Estado: reflejado en configuración actual.
- Contexto: las pruebas puras y las que necesitan base de datos o navegador requieren entornos distintos.
- Decisión: mantener conjuntos separados en `tests/unit/`, `tests/integration/` y `tests/e2e/`, con configuraciones Vitest y Playwright específicas.
- Consecuencia: elegir el comando según sus dependencias; una suite unitaria no certifica integración ni comportamiento del despliegue.
- Evidencia: `vitest.unit.config.ts`, `vitest.config.mts`, `playwright.config.ts` y scripts del manifiesto de paquetes.
