# Encargo para el Claude de la PC con la RTX 5070

Randy: abre Claude Code en la PC de la casa, en la carpeta del repositorio `el-play`, y pégale esto:

> Lee `docs/ENCARGO-PC-5070.md` y hazlo completo. Avísame en cada fase y pídeme los permisos juntos al final.

En la PC de la oficina no se instala nada de esto: ni ComfyUI, ni Ollama, ni la skill nano-banana.

---

## Para ti, Claude

### Qué quiere Randy

Cada pelotero de la LIDOM tendrá dos imágenes nuevas, hechas a partir de **su misma foto**:

1. **Un retrato realista.** Es una foto de estudio con el uniforme y la gorra de su equipo, con el logo en la gorra. Ya está hecho en `generador-de-imagen/generar.py`. Solo hay que prepararlo y correrlo.
2. **Una versión animada realista.** Es un clip corto (3 o 4 segundos, en bucle) hecho a partir de ese retrato. El pelotero parpadea, respira y sonríe un poco. La cámara no se mueve y la persona y el uniforme siguen iguales. **Esto es lo nuevo:** lo haces tú, con ComfyUI y Wan 2.2.

Todo corre en esta PC, con ComfyUI y la 5070, sin servicios de pago.

### Reglas que no se discuten

- **Primero, `git pull`** de `el-play`. Si vas a tocar la app, también de `el-play` en la rama `app-movil`.
- **Los datos se quedan en la PC.** Todo lo generado va a `avatares/`, que está en `.gitignore`.
  - **No corras `scripts/subir-avatares.js`.**
  - **No conectes la app** a los retratos ni a los clips.
  - Randy tiene que hablar primero con la LIDOM sobre las fotos y los logos. Él te dirá cuándo.
- **Misma persona.** No se inventan caras, no se cambia la edad y no se aclara ni se oscurece la piel. Si el pelotero no tiene foto, queda sin retrato.
- **Sin texto en las imágenes.** Nada de letras, números, nombres ni patrocinadores.
- **Nada de llaves ni contraseñas.** Si algo pide una llave (por ejemplo `GEMINI_API_KEY`), Randy la pone él. Tú no la ves, no la escribes en archivos y no la pegas en comandos.
- **Commits.** Mensajes cortos, `tipo: mensaje`, sin cuerpo. Usa la identidad personal (`Randy <randy6grullon@gmail.com>`), nunca la del trabajo.
  - Un push a `main` publica la web en producción: pídele permiso a Randy antes.
  - Los PR los crea él.
- **Textos de la app.** En los textos que se ven nunca va la palabra «MLB».
- **Revisa antes de instalar.** Antes de instalar código de terceros (nodos de ComfyUI, skills, scripts), léelo y dile a Randy qué es y de dónde sale.

### Fase 1: el retrato (ya existe; prepáralo y córrelo)

Sigue `docs/GENERADOR-DE-IMAGEN.md`, pasos 1 a 5 (**el 6, la subida, no**). En resumen:

1. **Prepara ComfyUI.** Actualízalo y baja Qwen-Image-Edit 2509 (o el más nuevo), su codificador de texto, su VAE y la LoRA Lightning de 4 pasos. La plantilla de ComfyUI dice qué falta.
   - Si la PC tiene menos de 32 GB de RAM, usa la versión GGUF con el nodo ComfyUI-GGUF.
2. **Revisa** que todo esté: `python_embeded\python.exe generador-de-imagen\generar.py --revisar`. Tiene que decir «ComfyUI listo».
3. **Haz el piloto:** `--piloto` genera 6 retratos, uno por equipo. Randy los mira en `avatares\revision.html`.
   - Si no gustan, ajusta `PROMPT` en `generar.py`.
   - **No sigas sin su visto bueno.**
4. **Corre todos:** `generar.py` sin opciones, unos 305 retratos en una noche. Después Randy marca en la página cuáles hay que **Rehacer**, ponerles **Insignia** o **Rechazar**.

### Fase 2: la versión animada (nueva)

Haz `generador-de-imagen/animar.py` con el mismo estilo que `generar.py`:

- solo la biblioteca estándar y Pillow;
- habla con ComfyUI por `/prompt`;
- sigue donde quedó si se corta;
- tiene una página de revisión.

**Modelos.** En ComfyUI, abre **Plantillas → Video → Wan 2.2 5B (texto o imagen a video)** y baja lo que pida. Hoy son:

| Archivo | Carpeta de ComfyUI |
|---|---|
| `wan2.2_ti2v_5B_fp16.safetensors` | `models/diffusion_models` |
| `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `models/text_encoders` |
| `wan2.2_vae.safetensors` | `models/vae` |

- Salen de Hugging Face `Comfy-Org/Wan_2.2_ComfyUI_Repackaged`.
- La versión 5B cabe en los 12 GB de la 5070.
- Si la calidad no alcanza, prueba la 14B de imagen a video en GGUF con su LoRA de pocos pasos. Va más lenta.
- **Confirma la licencia** de los modelos y la LoRA en su página (Wan 2.2 es Apache-2.0) y díselo a Randy.

**El flujo.** No lo escribas de memoria:

1. En ComfyUI, carga la plantilla de imagen a video.
2. Expórtala con **Exportar (API)**.
3. Arma el grafo en `animar.py` a partir de ese JSON, cambiando solo:
   - la imagen de entrada (el retrato bueno de `avatares/salida/{id}.webp`);
   - el texto;
   - la semilla;
   - el tamaño y la cantidad de cuadros.

**Qué tiene que salir:**

- **Duración:** de 3 a 4 segundos a 24 cuadros por segundo, que se pueda poner en bucle (el último cuadro parecido al primero).
- **Tamaño:** cuadrado (por ejemplo 704×704; múltiplos de 32) y luego reducido a 512×512.
- **Archivos:** `avatares/animados/{id}.mp4` (H.264, sin audio) y `{id}.webm`, de menos de 1,5 MB cada uno.
  - Si ComfyUI no los guarda así, conviértelos con `ffmpeg`. Si no está, pídele permiso a Randy para instalarlo.
- **Primer cuadro:** el retrato quieto, que sirve de portada.
- **Texto en inglés**, con esta base:

  > Subtle natural motion of the same man from the image: he blinks, breathes, and gives a slight confident smile, a small head tilt. Static camera, no zoom, no cuts. Keep his face, skin tone, jersey, cap and the cap logo exactly the same. Studio lighting, photorealistic.

  Con un texto negativo contra la deformación de la cara, el logo que cambia, el texto, la cámara que se mueve y el estilo de dibujo.

- **Solo los que Randy marcó como bien.** Solo se anima un retrato que no esté rechazado ni pendiente de rehacer en el `manifest.json` de los retratos.

**Opciones**, como en `generar.py`:

- `--revisar`
- `--piloto` (6, uno por equipo)
- `--solo id,id`
- `--rehacer id,id`
- `--rechazar id,id`
- `--limite N`
- `--comfy URL`

**Revisión.** Crea `avatares/animados/revision.html`, con el retrato y el clip lado a lado y los botones Bien, Rehacer y Rechazar. Igual que la página de los retratos, arma y copia el comando con un botón.

**Documentación y prueba.** Agrega la Fase 2 a `docs/GENERADOR-DE-IMAGEN.md`. Prueba `animar.py --revisar` y `--piloto` con ComfyUI abierto antes de darlo por hecho.

### Fase 3 (opcional): revisión automática con Ollama

Solo si Randy dice que sí. Sirve para que él no tenga que mirar uno por uno los 305:

1. Con ComfyUI **cerrado**, porque los dos no caben en la GPU a la vez, usa un modelo de visión de Ollama (por ejemplo `qwen2.5vl:7b`).
2. El modelo compara la foto original con el retrato y marca como «dudoso» lo que no parezca la misma persona, tenga letras o números o tenga mal el logo.
3. Esa marca solo se muestra en `revision.html`. No rechaza nada sola: decide Randy.

### Fase 4 (opcional): nano-banana para los difíciles

Solo si Randy la quiere. La skill `nano-banana` (repositorio `LeoHChen/claude-skills`) edita imágenes con Gemini. Sirve para los retratos que ComfyUI nunca saca bien.

- **Costo:** es de pago, unos 0,07 US$ por imagen, o 0,13 US$ con la versión Pro.
- **Llave:** usa `GEMINI_API_KEY`, que Randy pone él.
- **Instalación:**
  1. Lee su `SKILL.md` y su `generate.py` antes de instalarla.
  2. Instálala en `~/.claude/skills/nano-banana/`.
  3. En Windows, usa `python` y no `python3`.
- **Uso:** pásale la foto original y `generador-de-imagen/logos/{id}-gorra.png` como `--input`.

### Cómo termina

Dile a Randy:

- cuántos retratos y clips quedaron bien, cuántos hay que rehacer y cuántos no tienen foto;
- cuánto tardó cada uno;
- los commits que hiciste (`animar.py` y la guía) y si falta su permiso para el push.

Los retratos y los clips **no se suben** hasta que él lo diga.
