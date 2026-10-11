# Auditoría inicial de `/demo`

Fecha: 11 de octubre de 2026. Rama: `demo-interactiva`.

La revisión se hizo con Playwright sobre `next build` + `next start`, en 1280 px y 375 px, en modo claro y oscuro. Los datos y estados observados son locales al componente; no se detectaron peticiones a `/api` durante el recorrido.

## Matriz de interacción

| Vista | Elemento clicable o editable | Qué debería pasar | Qué pasa antes de los cambios | Estado |
|---|---|---|---|---|
| Global | Inicio, Chat, Embudos, Contactos, Tareas, Difusión, Automatizaciones, Módulos por giro y Configuración | Cambiar a la vista elegida y cerrar el menú móvil | Cambian de vista; el menú móvil se cierra | Funciona |
| Global | Seis colores de marca de la barra superior | Aplicar el preset elegido | Aplican el preset en escritorio; no aparecen a 375 px | Incoherente |
| Global | Interruptor claro/oscuro | Cambiar el tema y mantener el contenido legible | Cambia el tema, pero Ámbar Rojo, Legal, Inmobiliaria y Belleza quedan con contraste insuficiente en oscuro | Incoherente |
| Global | Reiniciar recorrido / Recorrido guiado | Abrir el recorrido desde el primer paso | Lo abre desde Inicio; ambos controles desaparecen a 375 px | Incoherente |
| Global | Ir al acceso real | Navegar a `/login` | El enlace apunta a `/login` | Funciona |
| Global | `+ Oportunidad` | Abrir una respuesta de nueva oportunidad solo si Embudos está activo | Solo navega a Embudos, incluso después de apagar esa sección | Incoherente |
| Inicio | Ver chat en vivo | Ir al Chat | Abre Chat | Funciona |
| Inicio | Tarjetas Chats abiertos y Sin responder | Ir al Chat | Abren Chat | Funciona |
| Inicio | Tarjetas Oportunidades y Valor del embudo | Ir a Embudos si está activo | Abren Embudos sin considerar que la sección pueda estar apagada | Incoherente |
| Inicio | Tarjeta Satisfacción | Mostrar una explicación o detalle | Permanece en Inicio sin respuesta visible | No hace nada |
| Inicio | Abrir tablero | Ir a Embudos si está activo | Abre Embudos sin considerar que la sección pueda estar apagada | Incoherente |
| Inicio | Explorar módulos | Ir a Módulos por giro si está activo | Abre Módulos sin considerar que la sección pueda estar apagada | Incoherente |
| Chat | Buscar conversación | Filtrar la lista | Acepta texto, pero siguen visibles las cuatro conversaciones | No hace nada |
| Chat | Conversaciones Mariana, Carlos, Sofía y Diego | Cambiar la conversación y el panel lateral | Cambia el contacto seleccionado | Funciona |
| Chat | Sugerir con IA | Preparar una respuesta para el contacto actual | Llena el mensaje, pero siempre menciona a Mariana aunque esté seleccionado Carlos | Incoherente |
| Chat | Plantilla | Preparar una plantilla simulada | No cambia nada | No hace nada |
| Chat | Nota interna | Cambiar a una nota o explicar el flujo | No cambia nada | No hace nada |
| Chat | Campo de mensaje + Enter o Enviar | Agregar un mensaje ficticio y limpiar el campo | Agrega el mensaje al estado local y limpia el campo | Funciona |
| Chat | Crear cita | Mostrar una confirmación o detalle simulado | No cambia nada | No hace nada |
| Chat | Crear tarea | Mostrar una confirmación o crear una tarea local | No cambia nada | No hace nada |
| Embudos | `+ Nueva oportunidad` | Crear o preparar una oportunidad ficticia | No cambia nada | No hace nada |
| Embudos | Abrir (cada tarjeta) | Mostrar el detalle de la oportunidad | No cambia nada | No hace nada |
| Embudos | Avanzar (cada tarjeta aplicable) | Mover la oportunidad a la siguiente etapa | Mueve la tarjeta y recalcula los totales | Funciona |
| Contactos | `+ Nuevo contacto` | Abrir un alta ficticia o explicarla | No cambia nada | No hace nada |
| Contactos | Buscar por nombre, empresa o teléfono | Filtrar la tabla | Filtra correctamente (5 filas a 1 al buscar “Academia”) | Funciona |
| Contactos | Importar CSV | Explicar el flujo real o simular una importación | No cambia nada | No hace nada |
| Contactos | Exportar | Explicar o simular la exportación | No cambia nada | No hace nada |
| Contactos | Abrir (cada fila) | Mostrar el detalle del contacto | No cambia nada | No hace nada |
| Tareas | `+ Nueva tarea` | Crear una tarea local o explicar el flujo | No cambia nada | No hace nada |
| Tareas | Casilla de cada tarea | Alternar pendiente/completada y actualizar el progreso | Cambia el estado, la etiqueta y el contador (0/4 a 1/4) | Funciona |
| Difusión | Audiencia | Cambiar la audiencia ficticia | Cambia el valor seleccionado | Funciona |
| Difusión | Plantilla | Cambiar la plantilla y su vista previa | Cambia el selector, pero la vista previa conserva el mismo texto | Incoherente |
| Difusión | Simular campaña | Mostrar progreso y confirmación sin enviar nada | Cambia a “Simulando envío…” y luego “Campaña preparada ✓” | Funciona |
| Automatizaciones | Ocho interruptores | Activar/desactivar cada flujo y actualizar el resumen | Cambian el estado local; el distintivo permanece en “6 de 8 activas” | Incoherente |
| Módulos por giro | Siete pestañas de giro | Cambiar datos, métricas y módulos | Cambian correctamente | Funciona |
| Módulos por giro | Ver flujo (cada módulo) | Abrir un detalle o explicación del módulo | No cambia nada | No hace nada |
| Configuración | Pestañas Marca, Módulos, Canal WhatsApp, Usuarios, Embudos, Plantillas, Bots e IA | Cambiar el panel de configuración | Cambian el contenido | Funciona |
| Configuración · Marca | Nombre del negocio | Reflejar el nombre en toda la demo | Actualiza menú y vista previa, pero siguen existiendo textos de empresa fijos como “AmbarCRM” en otras vistas | Incoherente |
| Configuración · Marca | Seis presets | Aplicar el preset y marcarlo como elegido | Se aplican y se marcan; cuatro combinaciones oscuras fallan contraste AA | Incoherente |
| Configuración · Módulos | Interruptores de secciones | Ocultar menú, atajos y pasos del recorrido; volver a Inicio si corresponde | Ocultan la entrada lateral, pero los atajos y el recorrido aún abren la sección apagada | Incoherente |
| Configuración · Módulos | Interruptores del giro | Reflejar el apagado en tarjetas, vista previa y menciones | La tarjeta muestra “Apagado”, pero la vista previa sigue mostrando el módulo apagado | Incoherente |
| Configuración | Restablecer demo | Volver al estado inicial | El botón no existe | No hace nada |
| Recorrido | Atrás, Siguiente, Terminar y Cerrar | Recorrer solo vistas activas y poder cerrar | Navega los seis pasos y cierra, pero no salta secciones apagadas | Incoherente |
| Celular 375 px | Abrir/cerrar menú | Mostrar un lateral utilizable sin desbordar | El lateral abre, cierra y cabe en pantalla | Funciona |
| Celular 375 px | Barra superior | Permitir color, tema y recorrido sin texto cortado | Solo quedan tema y acceso real; faltan colores y recorrido, y “Ir al acceso real” se parte en dos líneas | Incoherente |
| Celular 375 px | Configuración · pestañas, Marca y Módulos | Poder recorrer controles sin desbordar la página | La página no desborda; las pestañas usan desplazamiento horizontal, pero la barra superior sigue incompleta | Incoherente |

## Hallazgos visuales

- No hubo desbordamiento horizontal del documento en 1280 px ni en 375 px; los carruseles internos sí desplazan su propio contenido.
- En oscuro, el contraste medido de texto sobre fondo primario fue insuficiente en Ámbar Rojo (3.78:1), Legal (3.46:1), Inmobiliaria (1.75:1) y Belleza (3.78:1).
- La barra superior móvil oculta los seis presets y las dos entradas al recorrido.
- El chat, la tabla de contactos y el tablero se adaptan, pero varias acciones visibles son controles muertos.

