# Comprobación visual de belleza

Datos sintéticos del salón `belleza-1792446025122`, conservado durante la regresión
en PostgreSQL desechable. Tema de la app existente y fuentes simuladas. No hubo
mensajes externos ni cobros reales.

| Captura | Tamaño | Comprobación |
|---|---|---|
| servicios-movil.png | 390 × 844 | Catálogo con descripción, precio y duración de uñas, pestañas y masaje. |
| resumen-reserva-movil.png | 390 × 844 | Resumen final de pestañas; su única especialista se elige automáticamente. |
| reserva-agendada-movil.png | 390 × 844 | Reserva real en la BD de prueba, con «sin preferencia» y especialista asignada. |
| ficha-movil.png | 390 × 844 | Sensibilidades destacadas y preferencias antes de los datos personales opcionales. |
| ficha-escritorio.png | 1440 × 900 | Perfil y registro en dos columnas; atención creada desde el formulario aparece en el historial. |
| buscar-contacto-movil.png | 390 × 844 | Selección del contacto 504, fuera de los 30 iniciales y del límite previo de 500. |

La reserva completada también comprobó que volver a cambiar la hora conserva nombre,
teléfono y notas. El catálogo, resumen, ficha y buscador se verificaron después de
recargar la compilación final; la reserva completada corresponde a la primera
compilación aprobada, cuyo flujo público no cambió en el ajuste posterior de la ficha.

`mediciones.json` comprueba que el documento no supera el ancho de cada viewport.
La pestaña de prueba se cerró y el tamaño del navegador se restableció. Durante
la parada de app para recompilar, la pestaña anterior registró errores de fetch;
la comprobación final se hizo tras recargar la app.

[Informe](../../belleza-ui-ux-2026-10-19.md) ·
[Regresión](../../pruebas-belleza-2026-10-19/resumen-regresion.md).
