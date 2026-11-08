# Plan de equipo · App móvil de AmbarCRM

> Complementa a `PLAN-APP-MOVIL.md` (qué construir y con qué). Este documento dice **quién hace qué, cuándo y cómo se revisa**.
> Documento vivo: Julio lo actualiza al cierre de cada semana.

## 1. Equipo y roles

Son **2 personas y las dos ya saben Flutter**. Las tareas de la sección 5 conservan sus IDs (A, B, C); se reparten así:

| Rol | Quién | Tareas |
|---|---|---|
| **Líder / revisor** | Julio | Decide, revisa y hace merge de todos los PR. Prepara los prompts de Codex. Desbloquea al equipo. |
| **Persona 1 · Núcleo de la app** | (por definir) | **Bloque B**: base de la app, login, bandeja y chat completo (ventana de 24 h, plantillas, media, voz, notas internas, IA). |
| **Persona 2 · Backend, push y CRM** | (por definir) | **Bloques A y C**: Fase 0 del backend con Codex, textos legales, notificaciones push, tema y widgets, contactos, tareas, Kanban, ajustes y publicación en tiendas. |

La Persona 2 necesita poder leer TypeScript/Next para revisar lo que genere Codex en la Fase 0; si no, esa revisión la hace Julio. El chat (Persona 1) es la pieza más pesada y la que más pesa en el calendario: la Persona 2 le ayuda si termina antes.

## 2. Reglas de trabajo (para todos)

1. **Repos:** backend en `AmbarCRM/web` (rama desde `meta-tech-provider`), app en `ambarcrm-app` (Flutter).
2. **Ramas y commits:** una rama por tarea, `feat/<area>-<cosa>`, y commits en **Conventional Commits** (`feat(chat): enviar notas de voz`). Nada directo a `main` ni a `develop`. Siempre por PR. Detalle en `CONTRIBUTING.md` del kit `plantillas-app-movil/`.
3. **PR chico:** máximo ~400 líneas y una sola cosa. Descripción: qué hace, cómo se probó, captura o video si es pantalla.
4. **Revisión:** Julio aprueba. Se responde a los comentarios en 24 h. Nadie hace merge de su propio PR.
5. **Nunca** producción ni datos reales. Se prueba contra la org **`demo-meta`** (datos de ejemplo) o una BD local.
6. **Secretos:** nada de claves, tokens ni `google-services.json` reales en el repo (van en `.gitignore`). Se pasan por canal privado.
7. **Código:** nombres claros en español de negocio, funciones chicas, sin comentarios obvios, sin paquetes extra sin avisar.
8. **Atorado más de 1 hora:** se pregunta en el canal del equipo. No esperar al viernes.
9. **Rutina:** daily de 10 min (qué hice, qué haré, qué me bloquea) y **demo cada viernes**: cada quien enseña su avance corriendo en un celular real.
10. **IA:** se vale Claude o Codex para avanzar, pero cada quien debe poder explicar su código en el PR. Lo que no se entiende no se sube.

**Hecho (definition of done) de cualquier tarea:** corre sin errores en Android real, sin warnings nuevos de `flutter analyze`, se probó el caso feliz y un caso de error, y el PR fue aprobado.

## 3. Preparación (antes de la semana 1) · Julio

- [ ] Crear el proyecto de **Firebase** (Android + iOS) y la cuenta de servicio.
- [ ] Crear el repo `ambarcrm-app`, copiar el kit `plantillas-app-movil/` (instrucciones en su README) y proteger `main`/`develop` con solo squash merge.
- [ ] Verificar que `demo-meta` tiene datos (chats, contactos, embudo, tareas) y crear un usuario por persona.
- [ ] Dar accesos: repos, Firebase, canal de equipo, documentos.
- [ ] Cada quien instala **Flutter estable + Android Studio** y corre `flutter doctor` sin errores. Para iOS hace falta una Mac: definir quién la tiene.
- [ ] Lectura obligatoria (1 h): `PLAN-APP-MOVIL.md`, `MULTI-TENANT.md` y `API-MOVIL.md` en cuanto exista.

## 4. Calendario (8 semanas, con 2 de buffer)

La clave: **las dos personas trabajan en paralelo desde el día 1.** La Persona 2 define los modelos en la semana 1 para que la Persona 1 no los duplique, y mientras el backend termina, la Persona 1 usa un token de prueba que le da Julio.

| Sem. | Persona 1 · Núcleo (B) | Persona 2 · Backend, push y CRM (A + C) | Meta de la semana |
|---|---|---|---|
| **1** | Proyecto Flutter, estructura de carpetas, cliente `dio` con interceptor, `go_router` | Fase 0 con prompt de Codex (login Bearer, dispositivos, FCM, `API-MOVIL.md`); modelos y repos con mocks (C3) | Backend listo; modelos listos |
| **2** | Login real (empresa/correo/contraseña), sesión segura; bandeja (lista) | Tema con marca por empresa y modo oscuro, widgets base; textos legales (A6); probar notas de voz AAC | **Se puede iniciar sesión desde el celular** |
| **3** | Bandeja (filtros, búsqueda); chat: ver mensajes, enviar texto, tiempo real por SSE | FCM en la app (token); push Android y abrir el chat desde la notificación | Bandeja real y push en Android |
| **4** | Ventana de 24 h, plantillas, asignar y cerrar/reabrir | Push iOS (APNs); contactos (lista, búsqueda, detalle, editar) | **MVP interno: se lee y contesta un chat** |
| **5** | Fotos, documentos y notas de voz; notas internas y sugerencia IA | Tareas y Kanban; primera build a TestFlight interno y prueba interna de Play | **Los 2 clientes ya pueden usarla (beta)** |
| **6** | Pulido del chat, errores de Meta legibles, caché sin señal (`hive`) | Ajustes, accesibilidad, badge del ícono; fichas de tiendas, capturas, cuenta demo y notas de revisión; **envío a revisión** | **Primer envío a las tiendas** |
| **7** | Pruebas en 3+ celulares reales y corrección de bugs de la beta | Lo mismo, y atender comentarios de las tiendas | v1 en revisión o aprobada |
| **8** | Buffer: rechazo de Apple o Google, reenvío | Buffer | **v1 en tiendas o lista para reenviar** |

Apple tarda 1–3 días en revisar (a veces más) y un rechazo cuesta otra vuelta; por eso el envío es en la semana 6 y no al final.

**Si algo se atrasa, se recorta, no se alarga.** Orden en que caen: Kanban, tareas, contactos (pasan a v1.1). Bandeja, chat y push no se tocan.

### 4.1 ¿Cuándo está el MVP?

**En una semana, no.** Una semana alcanza para una *demo técnica*, no para algo que un cliente use. Con 2 personas que ya saben Flutter:

| Hito | Qué incluye | Fecha realista |
|---|---|---|
| **Demo técnica** | Backend Fase 0 hecho por Codex y revisado; login real y bandeja con datos reales | **Semana 2** |
| **MVP interno** | Login, bandeja, leer y contestar texto, tiempo real, ventana de 24 h, push en Android | **Semana 4** |
| **MVP para clientes** | Lo anterior + media, voz, contactos y tareas, en TestFlight y prueba interna de Play | **Semana 5** |
| **En las tiendas** | v1 completa, enviada en la semana 6 | **Semanas 7–8**, según cuánto tarde Apple |

Dos personas con experiencia no corren más que tres aprendiendo: quitan el tiempo de aprender, pero cada una carga más. Qué lo atrasa: no tener la Mac para iOS, Firebase sin crear, una cuenta de Google Play personal reciente (12 testers por 14 días), un rechazo de Apple, que alguien falte unos días (no hay respaldo) y que las revisiones tarden. Si todo sale perfecto, la beta puede ser en la semana 4 y el envío en la 5. **Es una estimación mía, no un dato medido.**

## 5. Tareas por bloque (con criterio de aceptación)

### Bloque A · Backend y push (Persona 2)
| # | Tarea | Listo cuando |
|---|---|---|
| A1 | Ejecutar con Codex el prompt `docs/prompts/PROMPT-APP-MOVIL-BACKEND.md` (3 partes: login con token, push FCM, contrato y textos legales) y revisarlo con Julio, empezando por la Parte 1 | Login móvil, Bearer en proxy, `dispositivos_push` y FCM funcionando; pruebas verdes; `API-MOVIL.md` con ejemplos reales |
| A1b | Ejecutar con Codex `docs/prompts/PROMPT-APP-MOVIL-BACKEND-LECTURA.md` y revisarlo con Julio | Existen `GET /api/movil/{usuarios,etiquetas,contactos,embudos,tareas}`, los agentes y el Bearer pueden usar `/api/meta/templates`, y ninguna respuesta filtra hashes de contraseña |
| A2 | Notas de voz | Un audio grabado en la app (AAC/m4a → `audio/mp4`, ya aceptado por `/api/mensajes/enviar`) llega a WhatsApp y se reproduce allá. No hace falta convertir a OGG |
| A3 | FCM en el cliente Flutter | El token se registra al iniciar sesión y se borra al cerrar |
| A4 | Push Android e iOS | Llega la notificación con la app cerrada; al tocarla abre el chat correcto |
| A5 | Tiendas | Todo el checklist de la sección 10 en verde; TestFlight y prueba interna de Play funcionando |
| A6 | Aviso de privacidad y eliminación de datos | `/privacidad` describe la app (ver sección 10) y `PRIVACY_EMAIL` real está puesto en producción |

### Bloque B · Flutter núcleo (Persona 1)
| # | Tarea | Listo cuando |
|---|---|---|
| B1 | Proyecto base + `dio` + interceptor de token + `go_router` | Compila en Android; el token viaja en cada petición; 401 manda al login |
| B2 | Login | Entra con empresa/correo/contraseña; token en almacenamiento seguro; la sesión sobrevive al cerrar la app |
| B3 | Bandeja | Lista paginada, filtros, búsqueda, contador de no leídos, actualiza en vivo |
| B4 | Chat texto + tiempo real | Mensajes nuevos aparecen sin recargar; reconecta tras perder señal |
| B5 | Ventana 24 h, plantillas, asignar y cerrar/reabrir | Con la ventana cerrada solo deja enviar plantilla aprobada; mismo mensaje que la web; asignar y cerrar funcionan |
| B6 | Chat con media y voz | Foto, documento y nota de voz se envían y se ven |
| B7 | Notas internas y sugerencia IA | Igual de útil que en la web |

### Bloque C · Flutter CRM y UI (Persona 2)
| # | Tarea | Listo cuando |
|---|---|---|
| C1 | Tema y marca por empresa | Logo y colores se cargan con `GET /api/public/brand`; modo oscuro bien |
| C2 | Widgets compartidos | Burbuja, avatar por nombre, aviso de 24 h, vacío/carga/error reutilizables |
| C3 | Modelos y repos con mocks | B puede trabajar contra mocks hasta que el backend esté listo |
| C4 | Contactos | Buscar, ver, editar; abre su chat |
| C5 | Tareas | Ver y completar; filtros hoy/vencidas |
| C6 | Kanban | Ver embudos y mover tarjetas entre etapas |
| C7 | Ajustes y accesibilidad | Perfil, cerrar sesión, enlaces legales, letra grande, lector de pantalla |

## 6. Dependencias que hay que cuidar

- **B2 (login) depende de A1.** Hasta entonces B usa un token de prueba que le da Julio. Si A1 se atrasa, avisar el martes de la semana 1.
- **A1b (endpoints de lectura) bloquea tres cosas:** asignar responsable en el chat (necesita `usuarios`), plantillas fuera de la ventana de 24 h (necesita `templates` con Bearer) y las pantallas de contactos, tareas y Kanban (C4–C6). La Persona 1 puede avanzar con bandeja y chat de texto mientras tanto.
- **El proyecto de Firebase hace falta desde la semana 1:** la app Android lo necesita para compilar con `firebase_messaging` (`google-services.json`). El identificador de paquete (Android) y el bundle ID (iOS) son **`cloud.ambarrojostudios.ambarcrm`** (el mismo en ambos) y no se pueden cambiar después de publicar.
- **A4 depende de tener Firebase listo** (preparación) y de una Mac para iOS.
- **B4 y B6 dependen de que `/api/stream` y `/api/media` funcionen con Bearer** (se verifica en A1).
- **C3 y B comparten modelos:** la Persona 2 los define en la semana 1 y la Persona 1 no crea los suyos.

## 7. Riesgos

| Riesgo | Plan |
|---|---|
| Bearer → cookie no funciona como se espera | Es lo primero que se prueba en A1; si falla, Julio decide si se toca `requireSesion` |
| iOS retrasa todo (cuenta, APNs, Mac) | Tener Android completo primero; iOS entra en semana 5 sin bloquear lo demás |
| Tiempo real en segundo plano | Se cubre con push; al volver a la app se recarga la bandeja |
| Notas de voz en formato equivocado | Probarlo en la semana 2, no al final |
| Menos dedicación de la esperada | Priorizar B3 y B4 (leer y contestar). Contactos, Kanban y tareas pueden salir en v1.1 |
| Apple rechaza la app | Cuenta demo clara, privacidad y eliminación de datos listas antes del envío de la semana 6 |
| Julio se vuelve el cuello de botella (revisa todo) | Revisar a diario, PR chicos; si se acumulan más de 3 PR pendientes, se frena el trabajo nuevo hasta ponerse al día |
| Solo 2 personas, sin respaldo | Si una falta, se recorta alcance (Kanban, tareas); Julio cubre revisiones y la Fase 0 |
| La Persona 2 carga demasiado (backend, push, CRM, tiendas) | La Persona 1 le ayuda si termina el chat antes; Kanban y tareas son lo primero en salir |

## 8. Qué NO se hace en v1

Conectar números con Meta, crear plantillas, configurar bots/IA/marca/usuarios, campañas de difusión, llamadas, Instagram y Messenger. Todo eso se queda en la web.

## 9. Ofrecerla rápido: no esperar a las tiendas

Las tiendas tardan; los clientes no tienen que esperar.

- **Desde la semana 4–5** (bandeja + chat + push funcionando) se publica a **TestFlight** (iOS, interno inmediato) y a **prueba interna de Google Play** (Android, disponible en minutos). Los 2 clientes que la pidieron ya pueden usarla ahí.
- **Primer envío a revisión en la semana 6**, con bandeja, chat completo, push y ajustes. Si Contactos, Kanban o tareas no están listos, salen en la 1.1: no se retrasa el envío por ellos. La revisión corre en paralelo a las semanas 7–8.
- Cada versión nueva a tiendas solo si trae algo que valga la pena: cada envío es otra espera.

## 10. Checklist de aprobación en tiendas

Lo que más rechaza apps como esta, y cómo evitarlo. **Verificar contra los requisitos vigentes de Apple y Google al momento de enviar**: cambian cada año (versión de Xcode/SDK, API de Android objetivo).

### Pasar la revisión de Apple
- [ ] **Cuenta demo funcional** (guideline 2.1): empresa `demo-meta`, correo y contraseña en las notas de revisión, **incluyendo el campo "empresa"** (los revisores no saben que existe). Con chats, contactos y un embudo ya cargados. Nunca borrar ni cambiar esa cuenta durante la revisión.
- [ ] **Backend arriba y estable** durante toda la revisión. Si el servidor está caído, rechazo directo.
- [ ] **Notas de revisión**: explicar que es una app *companion* para clientes existentes de AmbarCRM, que las cuentas las crea la empresa (no hay registro), y que no hay compras dentro de la app (no se usa pago in-app).
- [ ] **No parecer una web envuelta** (4.2): Flutter nativo con push, notas de voz, cámara y notificaciones ya cumple. Que la v1 no se sienta mínima.
- [ ] **Privacidad (5.1)**: URL de privacidad con la app descrita; etiquetas de privacidad que coincidan con lo que la app realmente recoge; mensaje de motivo en español para cámara, fotos, micrófono y notificaciones.
- [ ] **Eliminación de cuenta (5.1.1v)**: no hay registro en la app, pero Ajustes lleva un enlace claro a `/eliminacion-datos`.
- [ ] **Contenido de terceros (1.2)**: los mensajes vienen de clientes finales por WhatsApp. Decirlo en las notas (herramienta empresarial, no red social). Si el revisor lo pide, plan B: botón de **bloquear contacto** y de **reportar**.
- [ ] **Marca Meta/WhatsApp (5.2)**: nombre de app y capturas sin logos de WhatsApp ni de Meta; mencionarlos solo de forma descriptiva ("atiende tus chats de WhatsApp").
- [ ] **Cifrado**: poner `ITSAppUsesNonExemptEncryption = false` en `Info.plist` (solo HTTPS estándar) para no responder el cuestionario de exportación en cada build.
- [ ] Push Notifications y Background Modes (remote notifications) activados; llave APNs subida a Firebase.
- [ ] Sin "Sign in with Apple": no aplica, no hay login de terceros.
- [ ] Capturas reales de iPhone (tamaños que exija App Store Connect), sin datos de clientes reales.

### Pasar la revisión de Google Play
- [ ] **API de Android objetivo vigente** (Google sube el mínimo cada año) y `minSdk` 26.
- [ ] **Formulario "Seguridad de los datos"** consistente con la política: datos de contacto, mensajes, fotos y audio; cifrados en tránsito; no se venden ni comparten con terceros.
- [ ] **Permisos mínimos**: solo cámara, micrófono y `POST_NOTIFICATIONS` (se pide en tiempo de ejecución en Android 13+). Fotos y archivos con selectores del sistema, sin `READ_MEDIA_*`.
- [ ] **Cuenta demo** también en "Acceso a la app" de Play Console.
- [ ] **Prueba cerrada**: si la cuenta de desarrollador es *personal* y reciente, Google exige 12+ testers por 14 días antes de publicar. Si es de *organización*, no. **Confirmar qué tipo tenemos** antes de planear la fecha de salida.
- [ ] Clasificación de contenido, país/idiomas y URL de política de privacidad completados.
- [ ] Ícono 512×512, imagen destacada y capturas de teléfono.

### Cambios en el CRM que la revisión necesita (tarea A6)
- [ ] **`/privacidad`** hoy solo habla de WhatsApp, Messenger e Instagram. Agregar la app móvil: qué se recoge (token de notificaciones, fotos/audio/archivos que el usuario envía, datos de la cuenta), uso de cámara y micrófono, FCM de Google como proveedor de notificaciones, y fecha actualizada.
- [ ] **`PRIVACY_EMAIL`**: `/privacidad` y `/eliminacion-datos` usan `privacidad@tudominio.com` si la variable no está definida. **Verificar que producción tenga el correo real**; los revisores abren esos enlaces.
- [ ] `/eliminacion-datos` ya existe y es pública; añadir una línea que cubra las cuentas de usuario de la app.

## 11. Seguimiento

- Tablero en Trello (columnas: Por hacer · En curso · En revisión · Listo) con una tarjeta por tarea de la sección 5.
- Cada viernes Julio actualiza este documento: semana cumplida, desvíos y riesgos nuevos.
- Cierre de v1: los 2 clientes que la pidieron la usan 1 semana y dicen qué falta.
