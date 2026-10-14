# Revisión visual · módulos Ámbar Rojo

Navegador Chromium instalado, app local `next start` en 127.0.0.1:3127,
login real de la organización `ambar-rojo`. Compilación final de las 21:31,
servida tras reiniciar a las 22:02. Datos del seed sin teléfonos ni correos reales.
Viewports: escritorio 1440 × 900 y celular 375 × 812.

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

La corrección se verificó dentro de la app final, sin modificar el DOM. Los
12 formularios ocupan x=0, y=0, ancho/alto=375/812 y 1440/900. Se desplazó cada
formulario hasta sus botones y se comprobó que Cancelar lo cierra.

## Formularios revisados en la app final

| Formulario | 1440 px | 375 px |
|---|---|---|
| Editar contrato, botones accesibles | [Captura](capturas/ar-2026-10-13/contrato-editar-1440.png) | [Captura](capturas/ar-2026-10-13/contrato-editar-375.png) |
| Cliente seleccionado al editar | [Captura](capturas/ar-2026-10-13/contrato-cliente-1440.png) | [Captura](capturas/ar-2026-10-13/contrato-cliente-375.png) |
| Nuevo contrato | [Captura](capturas/ar-2026-10-13/contrato-nuevo-1440.png) | [Captura](capturas/ar-2026-10-13/contrato-nuevo-375.png) |
| Pago / estado del cobro | [Captura](capturas/ar-2026-10-13/cobro-pago-1440.png) | [Captura](capturas/ar-2026-10-13/cobro-pago-375.png) |
| Fecha de vencimiento | [Captura](capturas/ar-2026-10-13/cobro-fecha-1440.png) | [Captura](capturas/ar-2026-10-13/cobro-fecha-375.png) |
| Configuración de plantilla | [Captura](capturas/ar-2026-10-13/cobro-plantilla-1440.png) | [Captura](capturas/ar-2026-10-13/cobro-plantilla-375.png) |
| Configuración del reparto | [Captura](capturas/ar-2026-10-13/panel-reparto-1440.png) | [Captura](capturas/ar-2026-10-13/panel-reparto-375.png) |

[Mediciones y resultados](pruebas-ar-2026-10-13/visual.json): 6 vistas y 12
formularios correctos, cero errores JavaScript ni desbordamiento horizontal.
Se confirmó que el cliente seleccionado corresponde al contrato (Huipix).
No se guardaron pagos, fechas ni configuraciones para tomar las capturas.
No se pulsó ningún botón de envío de WhatsApp.

La [prueba HTTP final](pruebas-ar-2026-10-13/e2e.txt) también pasó, con Exit 0.
No se revisó en un celular físico ni con lector de pantalla.
