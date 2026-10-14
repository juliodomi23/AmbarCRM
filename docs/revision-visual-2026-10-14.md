# Revisión visual AR · 2026-10-14

Rama `modulos-ar-vistas`, Chromium local, organización `inicial`, datos del seed
en PostgreSQL 16 desechable. App `http://127.0.0.1:3128`.

## Resultado

Las cuatro rutas se revisaron a **375 × 812** y **1440 × 1000**. Ancho del
documento igual al viewport en los ocho casos; sin desbordamiento horizontal
del documento ni de `main`. En escritorio el tablero conserva su desplazamiento
horizontal interno; en móvil apila las columnas. Los listados tienen scroll
interno, por eso se guardaron capturas adicionales de sus tarjetas.

- Contratos: 7 visibles de 10, 3 bajas/incobrables ocultos; con `?bajas=1` aparecen
  los 10. Producción primero, borde verde real de 4 px, datos desconocidos visibles.
- Cobros: saldos y vencimiento destacados, pago primario y menú secundario.
  El seed tiene 4 mensualidades futuras, 4 cierres pagados y un incobrable.
- Panel: MRR $4,400, 3 clientes en producción e incobrable $4,000. KPI grandes
  con bordes de color; barras CSS y acceso al embudo. Pagos históricos sin fecha
  no se imputan al mes actual.
- Embudo: Comercial Ámbar Rojo seleccionado, 17 de 17 oportunidades: 8 prospectos,
  6 clientes ganados y 3 perdidos. Coparmex fuera. Búsqueda de Dentu en servidor:
  1 resultado, visible como «valor anual».

Los 11 badges se midieron con los estilos CSS compilados en tema claro y oscuro:
contraste mínimo **7.29:1**, mayor que el umbral AA de 4.5:1 para texto normal.
Cancelado conserva el tachado. No equivale a una auditoría completa de accesibilidad.

## Flujo en navegador móvil

Con un contacto ficticio temporal, se creó un extra de $80, se registró $30 y la
lista mostró saldo $50. Después se liquidó $50: saldo cero y estado pagado.
Una mensualidad manual repetida devolvió 409 y un toast explícito. Se probó
producción, pausa y baja: fecha más Confirmador, cancelación del futuro,
conservación del pago e interruptor URL. Datos temporales eliminados al terminar.

Modales de nuevo cobro y pago caben en 375 px, con scroll del formulario;
overlay de pago medido en `(0, 0, 375, 812)`. Se reutilizan Modal y Confirmador.
Cero errores de JavaScript. No se confirmó ningún envío de WhatsApp.

Se corrigió una colisión real: `surface` sobrescribía los bordes de Tailwind;
los modificadores de AR ahora prevalecen sin alterar el estilo de otros módulos.

## Capturas y mediciones

| Ruta | Móvil | Escritorio |
|---|---|---|
| Contratos | [375](capturas/ar-vistas-2026-10-14/contratos-375.png), [tarjetas](capturas/ar-vistas-2026-10-14/contratos-375-lista.png) | [1440](capturas/ar-vistas-2026-10-14/contratos-1440.png) |
| Cobros | [375](capturas/ar-vistas-2026-10-14/cobros-375.png), [tarjetas](capturas/ar-vistas-2026-10-14/cobros-375-lista.png) | [1440](capturas/ar-vistas-2026-10-14/cobros-1440.png) |
| Panel | [375](capturas/ar-vistas-2026-10-14/panel-ar-375.png), [lista](capturas/ar-vistas-2026-10-14/panel-ar-375-lista.png) | [1440](capturas/ar-vistas-2026-10-14/panel-ar-1440.png) |
| Embudo | [375](capturas/ar-vistas-2026-10-14/embudos-375.png), [ganados](capturas/ar-vistas-2026-10-14/embudos-ganados-375.png), [perdidos](capturas/ar-vistas-2026-10-14/embudos-perdidos-375.png) | [1440](capturas/ar-vistas-2026-10-14/embudos-1440.png), [historial](capturas/ar-vistas-2026-10-14/embudos-ganados-perdidos-1440.png) |

Otros estados: [bajas](capturas/ar-vistas-2026-10-14/contratos-bajas-375.png),
[pago](capturas/ar-vistas-2026-10-14/registrar-pago-final-375.png),
[nuevo cobro](capturas/ar-vistas-2026-10-14/nuevo-cobro-375.png),
[búsqueda de contrato](capturas/ar-vistas-2026-10-14/nuevo-cobro-busqueda-375.png),
[duplicado](capturas/ar-vistas-2026-10-14/duplicado-mensualidad-375.png),
[confirmación](capturas/ar-vistas-2026-10-14/baja-confirmacion-final-375.png).

[Mediciones de anchos, bordes y contraste](pruebas-ar-vistas-2026-10-14/visual.json),
[flujo de interfaz](pruebas-ar-vistas-2026-10-14/interfaz.json).

Sin verificar: dispositivo/teléfono real, lector de pantalla, integración Aurum
real y producción. No hubo push, deploy, acceso a BD de producción ni cambios
al chat de Villafuerte.
