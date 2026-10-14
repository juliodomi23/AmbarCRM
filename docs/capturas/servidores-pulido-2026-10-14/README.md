# Pulido visual de Servidores · 14 de octubre de 2026

Fallo encontrado y corregido durante la verificación: React #418 en una corrida de capturas. El diagnóstico en desarrollo lo localizó en los `<title>` de los puntos del SVG: tenían varios fragmentos JSX en vez de una sola cadena. Se corrigió con un template string. Se conservan [la corrida fallida](capturas-intento-2-fallo.txt), [el diagnóstico anterior](diagnostico-hidratacion-antes.json) y [su salida literal](diagnostico-hidratacion-antes.txt). Los resultados finales se documentan debajo. No quedan desviaciones de alcance.

Datos y capturas: **fixtures locales ficticios**, exclusivamente en PostgreSQL desechable `127.0.0.1:55454/crm_pulido`. No representan estado, fechas, costos ni métricas de producción.

Rama `modulos-ar-servidores-pulido`, creada directamente desde `modulos-fase-2` (`be43875`, que contiene `ff52a18`). Un único commit de pulido, sin merge, push ni deploy. Los seis `PROMPT-*.md` sin seguimiento preexistentes permanecen fuera del commit.

| Punto | Antes | Después |
|---|---|---|
| 1. Datos pendientes | Costo, RAM y vencimiento «por confirmar» repetidos; notas extensas visibles. | Un único desplegable «Datos por confirmar» enumera campos faltantes. Notas cerradas por defecto; los valores conocidos siguen visibles. |
| 2. Métricas | RAM/disco repetidos en titular y barra. | Un solo valor actual por recurso, junto a su barra. Los motivos de silencio o falta de métricas siguen visibles. |
| 3. Historial | Líneas sin escala ni fechas; leyenda en un texto aparte. | SVG sin dependencias: escala 0/50/100 %, inicio/fin con fecha y hora de México, leyenda junto a cada trazo, patrones distintos y puntos. Casos explícitos: sin reportes, un punto, pocos puntos y valores planos. Descripción accesible y valores en cada punto. |
| 4. Cargas | Clientes rojos y negros; emojis y «(baja)». | Texto uniforme, enlaces subrayados, etiquetas «Baja», «Sin contrato en CRM» o «Por confirmar». Se formatea el texto recibido sin modificar registros. |
| 5. Acciones | Editar y regenerar con el mismo peso. Confirmación genérica. | Editar con borde; regeneración secundaria en tono destructivo. Confirmación con nombre del servidor, explicación del token invalidado, botón destructivo y foco inicial en Cancelar. |
| 6. Jerarquía | Titular redundante, notas y umbrales prominentes. | Estado legible + nombre → métricas e historial → vencimiento/capacidad → cargas → notas colapsadas → acciones. Umbrales en ayuda desplegable pequeña. |
| 7. Encabezado | Dos botones visualmente equivalentes. | «Nuevo servidor» delineado y contextual dentro del encabezado de infraestructura. «Nueva oportunidad» y AppShell intactos. |
| 8. Móvil | Contenido denso y controles pequeños. | Ancho verificado de 375 px; botones, campos y desplegables de al menos 44 px. Formulario con scroll interno y columnas solo cuando hay espacio. Padding inferior ya existente en AppShell preservado y comprobado. |
| 9. Alertas | Círculos de color sin etiquetas; destinos según tipo. | Se conserva el orden rojo primero del resumen existente. Etiquetas «Crítica»/«Atención», símbolos diferentes y enlaces de toda la fila a `/servidores`, como se solicitó para cada alerta del bloque. |

## Verificación literal

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Desde web: `npx tsc --noEmit` | EXIT 0 | [tipos.txt](tipos.txt) |
| Desde web: `npm run lint` | EXIT 0 | [lint.txt](lint.txt) |
| Desde web: `npx next build` | EXIT 0 | [build.txt](build.txt) |
| Todos los `scripts/check-*.ts` | 32/32, FALLOS 0 | [checks-resumen.txt](checks-resumen.txt) y archivos individuales |
| `prisma/scripts/test-servidores-e2e.ts` | EXIT 0 | [test-servidores-e2e.txt](test-servidores-e2e.txt) |
| Navegador Edge / Playwright, build con `next start` | EXIT 0, cero errores de página | [capturas.txt](capturas.txt), [visual.json](visual.json) |
| Regresión de hidratación, desarrollo y producción | 40 navegaciones y 20 aperturas de edición sin errores | [diagnostico-hidratacion.txt](diagnostico-hidratacion.txt), [diagnostico-hidratacion.json](diagnostico-hidratacion.json) |

El E2E usa el rol `crm_app`, sin superusuario ni bypass de RLS. Comprueba alta, token de una sola entrega, heartbeat concurrente, rotación con rechazo del token anterior, edición/cargas, aislamiento de catálogo/API/página, puesto permitido, alertas, credencial de n8n y retención. El mensaje de restricción única en el log del servidor corresponde al caso negativo de nombre duplicado esperado por el E2E; el test termina en EXIT 0.

Tras los últimos ajustes de accesibilidad y la corrección de hidratación se volvieron a ejecutar TypeScript, lint y build, y se renovaron E2E y capturas contra ese build. Los checks 32/32 validan el mismo código de dominio y scripts sin modificaciones.

## Capturas

- [Servidores 375](servidores-375.png) y [1440](servidores-1440.png).
- `servidores-estado-1-*`: verde, 24 lecturas; `estado-2-*`: amarillo, dos lecturas planas; `estado-3-*`: rojo, una lectura; `estado-4-*`: gris sin reportes. Capturas reales del viewport al desplazar el contenedor; sin montaje ni retoque. Playwright finaliza las animaciones al capturar para evitar modales a medio aparecer.
- `servidores-cargas-*`, `servidores-pendientes-*` y `servidores-final-*`: cargas, detalle desplegado y acciones al final.
- [Formulario 375](servidor-formulario-375.png) y [1440](servidor-formulario-1440.png); `servidor-formulario-final-*` muestra sus controles finales. `servidor-editar-*` muestra datos precargados.
- [Confirmación 375](regenerar-confirmacion-375.png) y [1440](regenerar-confirmacion-1440.png): nombre visible, Cancelar enfocado y cero POST tanto al abrir como al cancelar. No se captura ningún token.
- [Panel AR 375](panel-ar-375.png) y [1440](panel-ar-1440.png): alertas rojas primero y enlaces a servidores.

`visual.json` registra medidas exactas: `document.documentElement.scrollWidth === innerWidth` en 375 y 1440 para ambas páginas y formulario. También compara scrollWidth/clientWidth de main y del modal, comprueba notas cerradas, un indicador por tarjeta, cargas del mismo color, casos del historial, nombre y foco de confirmación, cero POST al cancelar y orden/destino de alertas. Al llegar al final, las acciones quedan por encima de la barra móvil.

## Entorno y reproducción

El contenedor nuevo `ambarcrm-servidores-pulido-20261014` publica solo `127.0.0.1:55454`, PostgreSQL 16.14, almacenamiento tmpfs. Identidad: [contenedor.txt](contenedor.txt), [identidad-bd.txt](identidad-bd.txt); [Docker Desktop local](docker-local.txt). Los scripts fijan URLs y credenciales ficticias locales mediante [entorno-local.ps1](entorno-local.ps1); no se modificó `.env`. Al terminar se detuvieron las apps locales de prueba y se eliminó este contenedor: [limpieza.txt](limpieza.txt).

Desde la raíz del repositorio, con Docker Desktop activo:

```powershell
./docs/capturas/servidores-pulido-2026-10-14/bd-local.ps1 -Accion preparar
./docs/capturas/servidores-pulido-2026-10-14/verificar.ps1 -Tipo estaticos
# En otra terminal, dejar la app activa:
./docs/capturas/servidores-pulido-2026-10-14/verificar.ps1 -Tipo app
# Con la app activa:
./docs/capturas/servidores-pulido-2026-10-14/verificar.ps1 -Tipo e2e
./docs/capturas/servidores-pulido-2026-10-14/verificar.ps1 -Tipo capturas
# Tras detener la app local:
./docs/capturas/servidores-pulido-2026-10-14/bd-local.ps1 -Accion limpiar
```

`PLAYWRIGHT_MODULE` apunta al runtime externo ya disponible en este equipo; adaptarlo en otro entorno. No se agregaron dependencias al proyecto. La inicialización ejecuta copias sin modificar de schema.sql, multi-tenant.sql y actualizaciones.sql **solo dentro del contenedor nuevo**; el seed AR existente prepara la cuenta E2E. [fixtures-locales.mjs](fixtures-locales.mjs) crea exclusivamente los datos visuales en la BD con hostname, puerto y nombre comprobados. No ejecuta el seed de servidores ni guarda tokens en claro.

## Alcance preservado

Sin cambios en `servidores.ts`, `servidores-db.ts`, `alertas-ar-db.ts`, `/api`, SQL, Prisma, seed, permisos, umbrales, reglas de negocio, payloads, métodos HTTP, dependencias, layout global o barra de navegación. El token conserva únicamente el estado transitorio existente al crear/regenerar, se descarta al cerrar y no se escribe en almacenamiento del navegador. Sin BD de producción, llamadas a VPS reales, envíos, push, merge o deploy.

No se probaron teléfono físico ni lector de pantalla real. La evidencia corresponde a navegador automatizado a tamaños de móvil/escritorio.
