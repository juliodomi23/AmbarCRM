# Sistema visual de AmbarCRM

AmbarCRM usa un sistema visual multiempresa inspirado en Dentu: información densa pero legible, color con propósito, superficies teñidas y movimiento breve. La identidad de cada organización se configura sin cambiar componentes ni lógica de negocio.

## Tokens

Los tokens viven en `src/app/globals.css` y se consumen mediante Tailwind:

- Base: `background`, `surface`, `card`, `foreground`, `muted`, `border` e `input`.
- Marca: `primary`, `primary-foreground`, `brand-from` y `brand-to`.
- Semánticos: `accent`, `success`, `warning`, `info` y `destructive`.
- Elevación: `shadow-soft`, `shadow-lift`, `shadow-pop` y `shadow-glow`.
- Radio base: `radius`.

Los colores se guardan como canales HSL para poder usar opacidad (`bg-primary/10`). No deben añadirse hexadecimales ni familias fijas de Tailwind a la interfaz. Los colores de datos configurables —por ejemplo, una etapa o etiqueta— sí pueden llegar como hex desde la base de datos.

## Tipografía y densidad

- Plus Jakarta Sans (`font-display`) para títulos.
- Inter (`font-sans`) para texto y controles.
- `.tnum` para cantidades, métricas, fechas y contadores.
- Filas operativas de 40–44 px; las áreas táctiles nunca deben ser menores de 40 px.

## Superficies, estados y movimiento

- `.surface` es la tarjeta base; `.surface-lift` y `.surface-pop` elevan según jerarquía.
- `.skeleton` representa una carga real. Nunca se presenta `0` como sustituto de un dato pendiente.
- `.stagger`, `.animate-fade-up` y `.animate-pop` se reservan para entradas y confirmaciones.
- Todas las animaciones quedan prácticamente desactivadas con `prefers-reduced-motion: reduce`.
- Los estados usan los tokens semánticos. El color acompaña un texto, icono o forma; no comunica por sí solo.

## Marca por organización

La pestaña **Configuración → Marca** guarda nombre, logo, preset y dos colores en `ajustes`, una fila aislada por organización mediante RLS. `src/lib/brand.ts` valida y convierte los colores a HSL, elige texto claro u oscuro por contraste y genera una variante para modo oscuro.

Presets incluidos:

| ID | Mercado | Primario | Acento |
|---|---|---:|---:|
| `ambar-rojo` | Ámbar Rojo | `#D7083F` | `#E91E8C` |
| `salud` | Salud | `#0891B2` | `#10B981` |
| `legal` | Legal | `#1E3A5F` | `#C59B45` |
| `retail` | Retail | `#EA580C` | `#F59E0B` |
| `inmobiliaria` | Inmobiliaria | `#166534` | `#65A30D` |
| `belleza` | Belleza | `#BE185D` | `#A855F7` |

Para agregar un preset:

1. Añadir una entrada a `BRAND_PRESETS` en `src/lib/brand.ts` con un ID estable, nombre y dos colores hex de seis dígitos.
2. Verificar en la vista previa que el botón cumple WCAG AA (4.5:1).
3. Probar claro, oscuro, sidebar expandida/compacta y móvil.

El logo acepta PNG, WEBP o SVG en data URL y un máximo de 300 KB. El servidor vuelve a validar tipo y tamaño. El endpoint público `/api/public/brand?slug=...` solo expone los campos visuales necesarios para el login.

## Qué no hacer

- No usar colores fijos para elementos de interfaz ni asumir que la marca siempre será roja.
- No usar `text-white` sobre `primary`; usar `text-primary-foreground`.
- No usar sombras negras neutras: deben venir de los tokens teñidos.
- No introducir otra librería de componentes para resolver un caso aislado.
- No animar durante más de 300 ms ni ignorar preferencias de movimiento reducido.
- No mostrar datos de ejemplo, métricas falsas o ceros durante una carga.
