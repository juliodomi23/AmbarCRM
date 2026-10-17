# Prompt para Codex — «Nuevo cobro» distingue contratos y propone el monto (sin deploy)

> Es el "extra" de `PROMPT-COBROS-CANCELAR-ELIMINAR.md` (sección C), en un prompt aparte.
> Envíalo cuando Codex termine ese prompt y su rama esté integrada en `modulos-fase-2`.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM`). **No hagas push, deploy ni toques
ninguna BD de producción.** Parte de `modulos-fase-2` (debe estar en `f7ab22f`, con
`cobros-cancelar-eliminar` ya integrada); si no lo está, detente y repórtalo. Crea la rama `nuevo-cobro-monto`.

### Problema real

Un cliente (Villafuerte) tiene dos contratos, uno de $1,200 y otro de $800. En
`web/src/components/ar/NuevoCobro.tsx` el selector solo muestra "Cliente · tipo" (se leen casi
igual: "bot whatsapp" y "otro") y el monto arranca vacío. Resultado: se eligió/escribió el monto
del contrato equivocado.

### Cambio

- En el selector de contrato muestra también la mensualidad y el día de cobro
  ("Villafuerte y Asociados · bot whatsapp · $1,200/mes · día 5"). `GET /api/contratos` ya
  devuelve `mensualidad`; no cambies la API.
- Al elegir un contrato (o al abrir desde la ficha con `contratoId`), si el concepto es
  `mensualidad`, propón el monto con la mensualidad de ese contrato. Para `extra`, `anticipo` y
  `balance` déjalo vacío. Siempre editable.
- Si cambia el contrato o el concepto, no pises un monto que el usuario ya escribió a mano.
- Al guardar, el aviso muestra cliente, concepto y monto.
- Contratos sin mensualidad: mostrar "sin mensualidad" y no proponer nada.
- Detalle en `FilaCobro.tsx`: un cobro **cancelado** con pagos muestra "Recibido $X de $Y", lo que
  parece que el dinero entró. En cobros cancelados muestra "Pago revertido · $X" (o no lo
  muestres) y deja el texto actual para el resto de estados.

### Reglas

- Solo `NuevoCobro.tsx` y el texto de `FilaCobro.tsx` (y lo mínimo para tipar). Sin cambios de API, esquema, SQL ni dependencias.
- Español, sin comentarios obvios; 375 y 1440 px sin desbordes.

### Verificación

Desde `web/`: `npx tsc --noEmit`, `npm run lint`, `npx next build`, todos los `scripts/check-*.ts`
(32/32) y el e2e de cobros; añade un caso: el contrato de mensualidad 800 propone 800 y no el del
otro contrato. Capturas de "Nuevo cobro" a 375 y 1440 px, salidas literales en
`docs/pruebas-nuevo-cobro-monto-<fecha>/`. Un fallo se reporta tal cual.

### Entrega

Primero cualquier fallo; luego hash del commit (un commit en la rama, sin merge ni push) y lo que
NO se tocó.
