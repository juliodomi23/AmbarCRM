# Revisión visual y E2E — 2026-10-08

## Alcance

- Navegador local en `http://localhost:3010` con la base de Postgres de prueba.
- Escritorio: 1440 × 900.
- Celular: 390 × 844.
- Siete demos: clínica, automotriz, inmobiliaria, retail, legal, viajes y academia.
- Se recorrieron las rutas compartidas y las rutas propias de cada módulo. Las rutas compartidas
  se reutilizaron entre demos para evitar duplicar una misma pantalla.

## Resultado

| Revisión | Pantallas | Errores de aplicación | Resultado |
| --- | ---: | ---: | --- |
| Escritorio | 70 | 0 | ✅ |
| Celular | 70 únicas (78 registros por rutas compartidas repetidas) | 0 | ✅ |

No aparecieron `Application error`, `Unhandled`, `404`, `Internal Server Error`, `No se pudo` ni
`Error:` en las pantallas revisadas.

## Flujos revisados

- Clínica: Chat → crear cita con contacto preseleccionado; la cita apareció en el calendario y en
  la lista semanal. Se confirmó la zona horaria `America/Mexico_City`, el panel de próximas citas,
  el calendario y el menú móvil con Citas.
- Viajes: Reservas y viajeros, tours, cobranza y menú de módulos cargaron con datos de demo y
  saldos consistentes.
- Retail: productos, compras y ventas cargaron con tarjetas y tablas adaptadas al ancho móvil.
- En celular, la barra inferior mostró Inicio, Chat, Embudos, Citas y Más; Más abrió el cajón con
  los demás módulos activos.

## Hallazgos

- En desarrollo aparece el indicador de Next.js `1 Issue` por IDs de accesibilidad generados por
  `dnd-kit` durante hidratación. No se reflejó como error de la aplicación y no afecta el build de
  producción; queda identificado para una revisión posterior de tooling.
- El kanban de Embudos conserva desplazamiento horizontal intencional en escritorio.
- El navegador embebido permitió revisar capturas en línea, pero no exportar archivos PNG desde la
  API disponible. `docs/capturas/README.md` conserva el alcance y las dimensiones de la revisión.

## Idempotencia de demos

Cada uno de los siete seeds se ejecutó cinco veces en el mismo Postgres 16 y después se repitió una
ronda adicional comparando los conteos de todas las tablas con `org_id`. No hubo diferencias.

Conteos agregados de las siete organizaciones después de la ronda de comprobación:

- 30 contactos, 15 citas, 6 oportunidades y 3 conversaciones.
- 10 productos, 6 ventas, 2 compras y 20 movimientos de inventario.
- 3 tours, 3 reservas y 2 pagos de tours.
- 2 cursos, 4 alumnos, 4 inscripciones, 4 colegiaturas y 4 asistencias.
- 5 propiedades, 6 vehículos y 2 expedientes legales.
