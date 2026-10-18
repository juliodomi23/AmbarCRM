# Capturas de la revisión de Citas

Datos sintéticos; app compilada local, sin producción. Navegador de la app.
Escritorio 1440×1000 y móvil 390×844. Capturas JPEG sin edición.
Los fixtures de la primera sesión visual están en `../../pruebas-citas-2026-10-17/fixtures-visual.json`.
La regresión final vuelve a crear los tres giros y deja su propio `fixtures.json`.

| Captura | Comprobación |
|---|---|
| [gestion-cancelada-movil.jpg](gestion-cancelada-movil.jpg) | Gestión por token sin sesión; cancelación confirmada |
| [grande-config-movil.jpg](grande-config-movil.jpg) | Configuración con diez especialistas en móvil |
| [grande-escritorio.jpg](grande-escritorio.jpg) | Agenda de clínica grande: 501 filas cargadas |
| [grande-filtro-movil.jpg](grande-filtro-movil.jpg) | Filtro por especialista conserva sus 51 citas |
| [grande-reserva-movil.jpg](grande-reserva-movil.jpg) | Confirmación pública en zona America/Cancun |
| [pequena-config-movil.jpg](pequena-config-movil.jpg) | Servicios, horarios y enlace público en móvil |
| [pequena-escritorio.jpg](pequena-escritorio.jpg) | Agenda clínica pequeña con simultáneas y medianoche |
| [pequena-formulario-movil.jpg](pequena-formulario-movil.jpg) | Formulario corregido: fechas completas apiladas |
| [pequena-reserva-movil.jpg](pequena-reserva-movil.jpg) | Confirmación pública de clínica pequeña |
| [salon-agenda-movil.jpg](salon-agenda-movil.jpg) | Filtro por técnica y agenda en móvil |
| [salon-cita-completada-movil.jpg](salon-cita-completada-movil.jpg) | Cambio de estado desde la agenda del salón |
| [salon-config-escritorio.jpg](salon-config-escritorio.jpg) | Servicios con precio, duración y buffer; cinco técnicas |
| [salon-config-movil.jpg](salon-config-movil.jpg) | Configuración del salón a 390 px |
| [salon-escritorio.jpg](salon-escritorio.jpg) | Agenda del salón con cinco técnicas |
| [salon-filtro-escritorio.jpg](salon-filtro-escritorio.jpg) | Técnica 2: ocho citas legibles sin perder las demás |
| [salon-reserva-escritorio.jpg](salon-reserva-escritorio.jpg) | Confirmación pública en escritorio |
| [salon-reserva-movil.jpg](salon-reserva-movil.jpg) | Confirmación pública en móvil |
| [token-invalido-movil.jpg](token-invalido-movil.jpg) | Mensaje claro para token inexistente |
| [grande-filtro-escritorio.jpg](grande-filtro-escritorio.jpg) | App final: 50 citas de un especialista, filtro sin truncar la semana |
| [grande-inactivo-movil.jpg](grande-inactivo-movil.jpg) | App final: conserva dos citas futuras, aviso visible y marca inactivo |

Los flujos completos por giro también están cubiertos por `test-citas-e2e.ts` con
sesión real y HTTP. Las capturas prueban los estados visibles indicados; no implican
que cada combinación de giro, tamaño y acción haya tenido una captura individual.
La fecha de archivo es la fecha de la revisión solicitada, en America/Mexico_City.
