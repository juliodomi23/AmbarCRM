# Revisión visual · módulos Ámbar Rojo

Navegador Chromium instalado, app local `next start` en 127.0.0.1:3127,
login real de la organización `ambar-rojo`. Datos del seed sin teléfonos ni
correos reales. Viewports: escritorio 1440 × 900 y celular 375 × 812.

## Páginas revisadas

| Pantalla | 1440 px | 375 px |
|---|---|---|
| Servicios contratados | [Captura](capturas/ar-2026-10-13/contratos-1440.png) | [Captura](capturas/ar-2026-10-13/contratos-375.png), [final del listado](capturas/ar-2026-10-13/contratos-375-final.png) |
| Cobros | [Captura](capturas/ar-2026-10-13/cobros-1440.png) | [Captura](capturas/ar-2026-10-13/cobros-375.png), [final del listado](capturas/ar-2026-10-13/cobros-375-final.png) |
| Panel Ámbar Rojo | [Captura](capturas/ar-2026-10-13/panel-ar-1440.png) | [Captura](capturas/ar-2026-10-13/panel-ar-375.png), [reparto](capturas/ar-2026-10-13/panel-ar-375-final.png) |

Las seis vistas cargaron con sus títulos y sin errores de JavaScript ni
desbordamiento horizontal. Los listados usan el scroll de `main`; las capturas
del final del listado comprueban también los renglones y la navegación inferior.
Se retiraron las notas extensas del resumen de las filas: permanecen en la edición.
El cliente del contrato se muestra seleccionado al editar, sin un buscador vacío.

## Fallo encontrado y corrección

El modal de edición quedaba dentro de una fila con `transform` de la animación:
su rectángulo en celular empezaba en y=681 y medía 142 px, dejando fuera los
botones y parte de los campos.

- [Antes, celular](capturas/ar-2026-10-13/antes-modal-recortado-375.png).
- [Antes, escritorio](capturas/ar-2026-10-13/antes-modal-recortado-1440.png).

`PanelListado` omite `stagger` y `overflow-hidden` cuando hay edición por fila.
Así los formularios conservan el componente Modal existente y ocupan la ventana
completa. Modal y Confirmador no se modificaron.

La causa se comprobó quitando esas clases en el DOM de la página real. Estas
capturas son simulaciones del cambio, anteriores a su integración final:

- [Simulación 375 px](capturas/ar-2026-10-13/contrato-editar-simulacion-375.png).
- [Simulación 1440 px](capturas/ar-2026-10-13/contrato-editar-simulacion-1440.png).

Rectángulos medidos: x=0, y=0, ancho/alto=375/812 y 1440/900.
El cliente aparece seleccionado; las acciones quedan accesibles mediante el
scroll del formulario. No se envió ni eliminó ningún dato para estas capturas.

## Pendiente de integración

**Falta comprobar los diálogos finales dentro de las tres páginas de la app
después de reiniciar `next start`.** El servidor que sigue abierto conserva
la compilación anterior y el arranque desde herramientas fue rechazado con
`blocked by policy`. Se solicitó el reinicio al usuario.

No se revisó en un celular físico ni con lector de pantalla. La simulación
identifica la causa del recorte; falta la comprobación con la compilación final.
