# Verificación visual · Citas

App compilada con Webpack, datos sintéticos y fuentes locales de prueba. Resoluciones
1440×1000 y 1280×720 en escritorio, y 390×844 en móvil. La base y la cuenta de estas capturas son desechables.

| Captura | Qué se verificó |
|---|---|
| `agenda-extendida-escritorio.png` | Jornada desde 06:00; rango completo hasta 22:00 comprobado también en el árbol accesible |
| `formulario-movil.png` | Contacto sin expediente con Clientes activo, servicio de 30 min, fin 06:30 y margen separado de 15 min |
| `conflicto-publico-movil.png` | Reserva concurrente rechazada, horario retirado, mensaje conservado y enfocado al inicio de la pantalla |
| `reserva-confirmada-movil.png` | Negocio correcto, especialista y fecha/hora en America/Tijuana |
| `cancelacion-token-movil.png` | Consulta y cancelación sin iniciar sesión en la gestión por token |
| `recordatorios-variables-escritorio.png` | Cuatro variables con valores diferentes; tras guardar y recargar conservaron sus valores |
| `ajustes-zona-escritorio.png` | Zona del negocio editable junto con anticipación, ventana, paso y límite por teléfono |

`resultados-visuales.json` conserva las comprobaciones observadas. Las capturas no
acreditan envío real de WhatsApp ni equivalencia tipográfica con las fuentes de producción.
