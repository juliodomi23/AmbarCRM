# Prompt para Codex: investigar «Voice Studio» y crear un personaje 2D de Julio con su voz (dos fases)

Esto **no es parte de AmbarCRM**: no toques `web/`, ni la rama `meta-tech-provider`, ni ningún repositorio existente. Trabajas solo en esta carpeta (en adelante «la carpeta»):

`D:\AmbarRojo\Documentos de ambar rojo\docs\08-productos-internos\Avatar y voz AR\`

Crea dentro, si no existen, `fotos\`, `audio\`, `personaje\`, `herramientas\` y `salida\`. Julio pondrá sus fotos en `fotos\` y sus audios en `audio\`. Al empezar, revisa qué hay: si faltan, dime cuántas fotos y cuántos minutos de audio necesitas y de qué tipo, y sigue con la Fase 1 sin esperar. Sin push; instala herramientas solo dentro de la carpeta (entornos virtuales propios en `herramientas\`).

**Dos fases con parada:** Fase 1 = investigación **extensa** (informe). Fase 2 = crear el personaje 2D y probarlo con voz. Entre una y otra te detienes y Julio elige. Si Julio escribe «sigue con la Fase 2», la haces sin más preguntas.

## Objetivo de Julio

Tener **un personaje de caricatura 2D de sí mismo, hecho a partir de sus fotos**, que se pueda reutilizar y animar con **su propia voz** en todos sus videos (explicaciones, demos, contenido de Ámbar Rojo Studios). Julio vio un repositorio nuevo llamado **«Voice Studio»** y quiere saber si sirve para esto. Julio es programador junior-intermedio (n8n y web), trabaja en Windows 11 y no quiere depender de hardware caro.

## Reglas de la investigación

- Usa solo fuentes verificables: README, licencia y código del repositorio, documentación oficial. **Cita el enlace de cada afirmación**; si no lo encuentras escribe «no verificado», no lo supongas.
- Si hay varios repos llamados «Voice Studio», lista los candidatos con enlace, estrellas, fecha del último commit y licencia, y di cuál crees que es el que vio Julio y por qué. Si no puedes decidirlo, sigue con el más probable y deja claro el supuesto.
- Revisa la **licencia** de código y de modelos (uso comercial sí/no) y las condiciones sobre clonar voces.
- Ejecuta código de terceros solo dentro de la carpeta y anota lo que pruebes.

## FASE 1 — Investigación extensa

Sé exhaustivo: compara al menos 5 opciones por categoría, con tablas, ejemplos de salida cuando existan, y prueba lo que puedas en la máquina de Julio (primero revisa su hardware: GPU, VRAM, RAM, disco, Python y ffmpeg instalados).

1. **Qué es Voice Studio:** qué hace (clonación de voz, texto a voz, voz a voz, doblaje, video), cómo se instala, requisitos (GPU, VRAM, RAM, Windows sí/no), estado del proyecto y si se mantiene.
2. **Voz propia:** cuántos minutos de audio necesita para clonar la voz de Julio, calidad en **español de México**, latencia, y si funciona sin internet. Alternativas comparables (por ejemplo ElevenLabs, XTTS, F5-TTS, Fish Speech, Piper y las que encuentres vigentes) con costo, licencia y calidad en español.
3. **Crear el personaje 2D a partir de fotos:** cómo convertir las fotos de Julio en una caricatura 2D **consistente** (que se vea igual en todas las poses): modelos de imagen locales con LoRA o IP-Adapter, servicios en línea, ilustración asistida. Define qué entregable se necesita: hoja de personaje (frente, tres cuartos, expresiones) y **capas separadas en PNG transparente** (cabeza, ojos, cejas, boca con sus visemas, torso, brazos).
4. **Animarlo con la voz:** rigging 2D (Live2D, Inochi2D, Spine u otros vigentes), animación de labios por audio (visemas), parpadeo y gestos, y herramientas que animan una imagen desde audio (por ejemplo SadTalker, Hallo, LivePortrait y similares) como alternativa. Para cada una: calidad esperada, costo, hardware, licencia y si se puede automatizar por línea de comandos o API. Incluye servicios en la nube (HeyGen, D-ID, Hedra, etc.) solo como referencia.
5. **Flujo completo propuesto:** guion → voz de Julio → animación del personaje → edición/exportación del video, con herramientas concretas, qué parte se puede automatizar con **n8n** y cuánto tardaría producir un video de 1 minuto.
6. **Riesgos:** consentimiento y uso de la voz, marca de agua, derechos del personaje, términos de las plataformas donde se publicaría (YouTube, Instagram, Meta).
7. **Recomendación:** una opción económica (local/gratis), una de calidad (de pago) y una intermedia, con pros y contras, y cuál recomiendas probar primero. Termina con un **plan de prueba de un día** (pasos concretos y qué material debe aportar Julio: fotos, minutos de audio, poses).

## FASE 2 — Crear el personaje 2D y probarlo con voz (después de la parada)

Con la opción que Julio elija (o, si no elige, tu recomendación intermedia que corra en su hardware):

1. Prepara el entorno en `herramientas\` y documenta cada paso para repetirlo.
2. Con las fotos de `fotos\`, crea el **personaje 2D de caricatura de Julio** (siempre 2D). Primero muéstrame de 3 a 4 opciones de estilo y espera a que Julio elija una; después genera la **hoja de personaje** (frente, tres cuartos, expresiones neutra/feliz/sorpresa/seria) y las **capas separadas en PNG transparente**. Guarda todo en `personaje\` y, si la herramienta lo permite, un rig animable. Si no puedes generar la caricatura sola, dime exactamente qué paso externo hace falta (por ejemplo un servicio web) y prepara todo lo demás; no afirmes que quedó listo si no lo está.
3. Clona la voz de Julio con los audios de `audio\` (si no alcanzan, dime cuántos minutos y qué frases grabar) y genera una frase de prueba de 15 a 30 segundos en español de México.
4. Anima el personaje con ese audio (labios, parpadeo, gestos) y exporta un `.mp4` de prueba en `salida\`.
5. Deja un script o comando único que reciba un guion de texto y devuelva el video. Si encaja, bosqueja el flujo n8n que lo llamaría, sin implementarlo.
6. Reporta tiempos de render, calidad (con honestidad: qué se ve mal) y qué mejoraría con más fotos, audio o hardware.

Privacidad: las fotos y audios de Julio no salen de su máquina salvo que él apruebe un servicio en la nube concreto, que tú nombras con sus términos de uso.

## Entrega

- Fase 1: `INFORME.md` en la carpeta (español, tablas comparativas y enlaces). Resume en el chat las tres conclusiones principales y qué necesitas de Julio (qué opción elegir y qué material dejar en `fotos\` y `audio\`). Detente.
- Fase 2: personaje en `personaje\`, video de prueba en `salida\`, script de uso y `LEEME.md` con cómo repetirlo. Sin commits en repos existentes.
