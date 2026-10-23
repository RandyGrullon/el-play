# Generador de imagen: retratos realistas de los peloteros

Este generador hace un retrato **fotográfico y realista** de cada pelotero de la LIDOM. Corre **en tu PC**, con la **RTX 5070** y **ComfyUI**. No usa servicios de pago ni llaves de IA.

- **La persona:** es la misma de su foto actual (cara, tono de piel, edad, pelo y barba).
- **El uniforme:** lleva el de su equipo, con el **logo en la gorra**.
- **El estilo:** foto de estudio del día de medios, igual para todos, con fondo liso y la cabeza centrada (la app los muestra en círculo).

Los retratos reemplazan las fotos de terceros que usa la app hoy. Se guardan en Supabase (tabla `player_avatars`). Cuando estén arriba, Claude conecta la app para mostrarlos.

## Qué hay en el repositorio

| Archivo | Para qué |
|---|---|
| `generador-de-imagen/generar.py` | Hace todo: baja la lista y las fotos, maneja ComfyUI, guarda los retratos y arma la página de revisión |
| `generador-de-imagen/logos/{id}.svg` y `{id}.png` | El logo redondo de cada equipo (PNG de 1024 px, fondo transparente) |
| `generador-de-imagen/logos/{id}-gorra.png` | Solo la marca que va en la gorra (la A, la T, EO, GC, la E y la L), sin el círculo de fondo |
| `scripts/subir-avatares.js` | Sube los retratos a Supabase y borra los rechazados |
| `supabase/2026-10-23-avatares.sql` | La tabla y las funciones para guardarlos |

Los ids de los equipos son 667 Águilas, 668 Toros, 669 Estrellas, 670 Gigantes, 671 Escogido y 672 Licey.

Todo lo que se genera va a `avatares/` en la raíz del repositorio: fotos bajadas, retratos, manifiesto y página de revisión. Esa carpeta está en `.gitignore`: no se sube a ningún lado.

## 1. Prepara ComfyUI (una sola vez)

1. **Actualiza ComfyUI** (`update\update_comfyui.bat` en la versión portable). Hace falta una versión reciente, con soporte de Qwen-Image-Edit 2509.
2. **Baja los modelos.** Lo más fácil es abrir ComfyUI → **Plantillas** → **Imagen** → **Qwen Image Edit 2509**: la plantilla avisa de los modelos que faltan y da el enlace de cada uno. Son estos:

| Archivo | Carpeta de ComfyUI | Dónde está |
|---|---|---|
| `qwen_image_edit_2509_fp8_e4m3fn.safetensors` (unos 20 GB) | `models/diffusion_models` | Hugging Face `Comfy-Org/Qwen-Image-Edit_ComfyUI` |
| `qwen_2.5_vl_7b_fp8_scaled.safetensors` (unos 9 GB) | `models/text_encoders` | Hugging Face `Comfy-Org/Qwen-Image_ComfyUI` |
| `qwen_image_vae.safetensors` | `models/vae` | Hugging Face `Comfy-Org/Qwen-Image_ComfyUI` |
| `Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors` | `models/loras` | Hugging Face `lightx2v/Qwen-Image-Lightning` |

- **Versión más nueva:** si sale una versión más nueva de Qwen-Image-Edit (por ejemplo 2511), ponla también. El script elige sola la más nueva.
- **Licencia:** Qwen-Image-Edit es Apache-2.0 y se puede usar en una app comercial. Confirma la de la LoRA en su página.
- **La LoRA Lightning** baja el trabajo a 4 pasos: es la diferencia entre unas horas y toda una noche.

3. **Memoria.** Con 12 GB de VRAM, el modelo fp8 no cabe entero y ComfyUI pasa una parte a la RAM, así que necesitas unos **32 GB de RAM**. Si tienes menos:
   - instala el nodo **ComfyUI-GGUF** (desde el Manager);
   - baja una versión GGUF Q4_K_M o Q5_K_M (de `QuantStack/Qwen-Image-Edit-2509-GGUF`) en `models/unet`;
   - el script la usa sola si no encuentra la fp8.
4. **Arranca ComfyUI** (`run_nvidia_gpu.bat`) y déjalo abierto. Escucha en `http://127.0.0.1:8188`; ComfyUI Desktop usa el puerto 8000.
5. **Cierra lo demás que use la GPU** mientras genera (Ollama, juegos, Plasmo).

## 2. Comprueba que todo está

Usa el Python de ComfyUI, que ya trae Pillow (cambia la ruta si tu ComfyUI está en otro lado). Desde la raíz del repositorio:

```powershell
git pull
D:\IA\ComfyUI_windows_portable\python_embeded\python.exe generador-de-imagen\generar.py --revisar
```

Tiene que decir **«ComfyUI listo»**, con el modelo, el codificador de texto, el VAE, la LoRA y «Logos: los 6 están». Si falta algo, dice qué y dónde ponerlo.

Con ComfyUI Desktop, agrega `--comfy http://127.0.0.1:8000`.

## 3. Piloto: 6 retratos, uno por equipo

```powershell
D:\IA\ComfyUI_windows_portable\python_embeded\python.exe generador-de-imagen\generar.py --piloto
```

Abre `avatares\revision.html` en el navegador. Cada tarjeta muestra la foto original al lado del retrato.

**Si algo no te gusta:**

1. Ajusta el texto `PROMPT` dentro de `generador-de-imagen/generar.py`. Está en inglés, que es como mejor responde el modelo.
2. En la página, marca esas tarjetas con **Rehacer**.
3. Corre el comando que arma la página abajo.

## 4. Todos los peloteros

```powershell
D:\IA\ComfyUI_windows_portable\python_embeded\python.exe generador-de-imagen\generar.py
```

- **Qué hace:** recorre los ~305 peloteros de la temporada actual y salta los que ya están hechos.
- **Cuánto tarda:** dice cuánto lleva y cuánto falta. Con Lightning, cada retrato tarda entre medio minuto y dos minutos según la RAM, así que los 305 se hacen en una noche.
- **Parar y seguir:** con **Ctrl+C** se para cuando quieras; al correrlo de nuevo sigue donde quedó.
- **Si algo falla:** si falla un pelotero, lo anota y sigue. Con tres fallos seguidos se para, porque casi siempre es ComfyUI (su ventana dice el error).
- **Otras temporadas** (opcional): `--temporada 2025`, `--temporada 2024`.

## 5. Revisa y corrige

En `avatares\revision.html`, marca lo que no sirva. La página arma el comando que hay que correr y lo copia con un botón.

| Botón | Cuándo | Qué hace |
|---|---|---|
| **Bien** | Está bien | Nada |
| **Rehacer** | No se parece, salió raro o el logo está mal | Lo genera otra vez con otra semilla |
| **Insignia** | La cara sale bien pero el logo nunca sale bien | Gorra lisa en el color del equipo y el logo redondo pegado abajo a la derecha |
| **Rechazar** | No hay forma de que salga bien | No se sube (y si ya estaba arriba, se borra); la app sigue con sus iniciales |

En la página, «Marcados» muestra solo los que marcaste. La página recuerda lo marcado aunque la cierres.

Para revisar con lupa: lo que manda es que **sea la misma persona**, que parezca **foto real** (no dibujo ni piel de plástico), que el **logo** esté bien y que **no haya letras ni números**.

## 6. Súbelos a Supabase

**Una sola vez:**

1. Saca un secreto: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
2. Copia `supabase/2026-10-23-avatares.sql` en el SQL Editor de Supabase. Ahí, no en el archivo del repositorio, cambia `CAMBIA-ESTE-SECRETO-POR-UNO-LARGO-TUYO` por tu secreto y córrelo.
3. Pon el mismo secreto en `.env.local` como `AVATARS_SECRET=...`. No lo subas al repositorio ni a Vercel: solo lo usa tu PC.

**Cada vez que haya retratos nuevos o corregidos:**

```powershell
node scripts/subir-avatares.js --dry
node scripts/subir-avatares.js
```

- `--dry` revisa todo sin subir nada: que estén los archivos, el formato, que sean cuadrados y el tamaño.
- Sin `--dry`, sube solo los nuevos o los que cambiaron y borra los que rechazaste después de subirlos. Usa la llave publishable, no la `service_role`.

Después avísale a Claude para que conecte la app.

## Reglas

- **No se inventan caras.** Si un pelotero no tiene foto real, queda `sin-foto` y la app sigue con sus iniciales.
- **Misma persona.** Nada de embellecer, cambiar la edad o aclarar u oscurecer la piel. Si dudas de que sea él, **Rehacer** o **Rechazar**.
- **Sin texto.** Nada de letras, nombres, números, patrocinadores ni logos de otras ligas en el retrato. Si la foto original trae otro uniforme, el modelo lo cambia por el del equipo LIDOM.
- **Las fotos bajadas no salen de la PC.** Se quedan en `avatares/fuentes/`.
- **Los logos son de los equipos.** Antes de cobrar o de ir a las tiendas, lee «Los datos del béisbol» en `docs/TIENDAS.md` de la app.

## Ajustes

| Opción | Para qué |
|---|---|
| `--solo 815908,623912` | Generar solo esos (aunque ya estén hechos) |
| `--limite 20` | Parar después de 20 |
| `--sin-lora --pasos 30` | Sin Lightning: varias veces más lento, a veces más fino; úsalo con `--solo` para los difíciles |
| `--tamano 896` | Imagen más pequeña si se queda sin memoria |
| `--unet`, `--clip`, `--vae`, `--lora` | Elegir un archivo de modelo en vez del que escoge el script |
| `--comfy http://127.0.0.1:8000` | Otra dirección de ComfyUI |
| `--pagina` | Solo rehacer `avatares\revision.html` |

## Problemas comunes

| Mensaje | Qué hacer |
|---|---|
| «ComfyUI no responde» | Abre `run_nvidia_gpu.bat`. Si es ComfyUI Desktop, usa `--comfy http://127.0.0.1:8000` |
| «le faltan nodos: TextEncodeQwenImageEditPlus» | Actualiza ComfyUI |
| «Falta: el modelo Qwen-Image-Edit…» | Revisa que el archivo esté en la carpeta de la tabla del paso 1 y reinicia ComfyUI |
| «CUDA out of memory» o va lentísimo | Cierra lo demás que use la GPU, prueba `--tamano 896` o usa la versión GGUF |
| «ComfyUI rechazó el flujo» | Corre `--revisar`; si todo está y sigue, copia el error para Claude |
| La subida dice `SELF_SIGNED_CERT_IN_CHAIN` | Es la red de la oficina: súbelos desde la casa |
| La subida dice «No existe la tabla player_avatars» | Falta correr el SQL del paso 6 |
