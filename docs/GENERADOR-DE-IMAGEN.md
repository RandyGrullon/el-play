# Generador de imagen: retratos realistas de los peloteros

**Para Randy:** en la PC de la casa, abre una terminal en este repositorio (`git pull` primero), arranca Gemini CLI (`gemini`) y escríbele:

> Lee docs/GENERADOR-DE-IMAGEN.md y hazlo completo. Empieza por el piloto.

**Para Gemini:** este archivo es tu encargo completo. Léelo entero antes de empezar y síguelo en orden.

---

## 1. Qué hay que lograr

Un retrato **fotográfico y realista** de cada pelotero de la LIDOM que sale en El Play:

- **la misma persona** de su foto actual (cara, tono de piel, edad, pelo y barba);
- con el **uniforme de su equipo** y la **gorra con el logo** del equipo;
- en **estilo de foto de estudio** del día de medios: igual para todos, con fondo liso y la cabeza centrada.

Los retratos reemplazan las fotos de terceros que usa la app hoy. Se guardan en Supabase (tabla `player_avatars`) con `scripts/subir-avatares.js`. Cuando estén arriba, Claude conecta la app para mostrarlos.

Son unos 305 peloteros de la temporada actual. El trabajo tiene que poder **pararse y seguir** sin repetir lo que ya está hecho.

## 2. Reglas (no se negocian)

1. **No inventes caras.** Si un pelotero no tiene una foto real (no existe, o es la silueta gris genérica), no se genera nada: queda `sin-foto` y la app sigue con sus iniciales.
2. **Misma persona.** No lo embellezcas, no lo cambies de edad, no le aclares ni le oscurezcas la piel, no le cambies los rasgos. Si dudas de que sea él, la imagen no sirve.
3. **Sin texto.** Nada de letras, nombres, números, marcas de agua, patrocinadores ni logos de otras ligas o equipos. Si la foto original trae otro uniforme u otro logo, eso desaparece: solo queda el logo del equipo LIDOM en la gorra.
4. **Las fuentes no salen de la PC.** Las fotos y los logos que descargues se quedan en `avatares/fuentes/`. La carpeta `avatares/` está en `.gitignore`: no la subas a ningún lado ni la commitees.
5. **No toques la app.** No cambies `src/`, `server/` ni nada más del repositorio. No hagas commit ni push. Tu trabajo es solo generar las imágenes y subirlas con el script.
6. **Llaves.** Las llaves van solo en `.env.local`: nunca en el chat, en los registros, en el reporte ni en un commit. No uses la llave `service_role` de Supabase; el script funciona con la llave publishable y el secreto de los avatares.
7. **Si algo falla 3 veces seguidas con el mismo error,** para, escribe qué pasó en `avatares/REPORTE.md` y avísale a Randy.

## 3. Con qué generar

Usa la primera opción que funcione:

**A) En la PC, gratis (preferida): ComfyUI con Qwen-Image-Edit en la RTX 5070**

- **Modelo:** la versión más nueva de Qwen-Image-Edit que haya (2509 o posterior). Es Apache-2.0, así que se puede usar en una app comercial. Acepta varias imágenes de referencia: la foto del pelotero y el logo.
- **Plantilla:** parte de la oficial de ComfyUI (Workflow → Browse Templates → Image → «Qwen Image Edit»). Ahí aparecen los archivos y las carpetas exactas: modelo de difusión, codificador de texto Qwen2.5-VL, VAE y la LoRA *Lightning* de 4 u 8 pasos.
- **Memoria:** con 12 GB de VRAM, usa la versión fp8 (ComfyUI pasa a la RAM lo que no cabe) o una GGUF Q4/Q5 con el nodo ComfyUI-GGUF.
- **Velocidad:** con la LoRA Lightning cada imagen debería tardar alrededor de un minuto. Toda la tanda se hace en una noche.
- **Cómo correrla:** exporta el flujo en formato API (*Export (API)*) y manéjalo desde un script con la API de ComfyUI en `http://127.0.0.1:8188`:
  1. `POST /prompt` para encolar;
  2. `GET /history/{id}` para saber si terminó;
  3. `GET /view` para bajar la imagen.
- **Antes de la tanda:** prueba primero con una sola imagen.

**B) Por la API de Gemini (de pago): solo si A no funciona y en `.env.local` está `GEMINI_API_KEY`**

- **Modelo:** el de imagen más barato que haya («Nano Banana», por ejemplo `gemini-2.5-flash-image`). Confirma el nombre y el precio en ai.google.dev antes de empezar.
- **Costo:** a unos US$0.04 por imagen, los 305 con reintentos salen en unos US$15.
- **Cómo llamarlo:** `generateContent`, con la foto y el logo como imágenes de entrada y el texto de la sección 5.

Si no hay ni A ni B, para y explícale a Randy qué falta.

**Herramientas:** Python 3.10+ con Pillow (para recortar, convertir a WebP y armar las hojas de revisión) y `cairosvg` o `resvg` (para pasar los logos SVG a PNG). Escribe tus scripts en `avatares/scripts/`, no en el repositorio.

## 4. Datos de entrada

**Peloteros y equipos**

```
GET https://elplay.grullonb.com/api/v2/players?league=lidom
```

- `teams[id]` trae `{ id, abbrev, name, color, logo }`.
- `players[]` trae `{ id, name, teamId, pos, number }`.
- `season` es la temporada.

Haz primero la temporada actual. Al final, si hay tiempo, repite con `&season=2025` y `&season=2024`, solo para los que falten.

**Fotos publicadas por los equipos** (ya traen el uniforme LIDOM y son la mejor referencia)

```
GET https://elplay.grullonb.com/api/v2/photos   →   { "teams": { "668": { "<clave>": "<url>" } } }
```

Si la URL empieza con `/`, antepón `https://elplay.grullonb.com`. La clave es el nombre normalizado, igual que en `src/lib/photos.ts`:

```python
import re, unicodedata

def name_key(name: str) -> str:
    if ',' in name:
        name = ' '.join(reversed(name.split(',')))
    s = unicodedata.normalize('NFD', name)
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r'\b(jr|sr|ii|iii|iv)\b\.?', '', s)
    return re.sub(r'[^a-z]', '', s)
```

**Foto de cada pelotero**

Usa la primera que exista. Si responde 404, pasa a la siguiente:

1. la del equipo (arriba);
2. `https://img.mlbstatic.com/mlb-photos/image/upload/c_pad,ar_1:1,w_640,q_auto:best/v1/people/{id}/headshot/silo/current`
3. `https://img.mlbstatic.com/mlb-photos/image/upload/c_fill,g_face,ar_1:1,w_640,q_auto:best/v1/people/{id}/headshot/milb/current`

Si lo que baja es la silueta genérica gris, cuenta como que no hay foto. Guarda cada foto en `avatares/fuentes/fotos/{id}.jpg`.

**Logo de cada equipo**

Está en `https://www.mlbstatic.com/team-logos/{teamId}.svg`. Pásalo a PNG de 1024 px con fondo transparente en `avatares/fuentes/logos/{teamId}.png`.

**Colores del uniforme**

| teamId | Equipo | Color principal | Detalles |
|---|---|---|---|
| 667 | Águilas Cibaeñas | golden yellow `#FDB927` | black `#111111` |
| 668 | Toros del Este | bright orange `#FA4616` | black `#1C1C1C` |
| 669 | Estrellas Orientales | green `#00BE66` | white |
| 670 | Gigantes del Cibao | burgundy red `#AA1141` | white |
| 671 | Leones del Escogido | red `#E31837` | black `#111111` |
| 672 | Tigres del Licey | royal blue `#0069E0` | white |

## 5. El retrato

**Las referencias:** imagen 1 es la foto del pelotero e imagen 2 es el logo del equipo.

**El texto** va en inglés, que es como mejor responden los modelos. Cambia las llaves `{...}` por los datos del equipo:

```
Professional sports media-day portrait photograph of the same man shown in image 1.
Keep his exact identity: face shape, skin tone, eyes, nose, lips, ears, hairline, hair, facial hair and age must stay identical.
He wears a {team name} baseball uniform: a {primary color} jersey with {trim color} trim and a {primary color} baseball cap
with the logo from image 2 embroidered, centered on the front panel of the cap, same shapes and colors as image 2.
Head and shoulders, facing the camera, neutral confident expression, centered, the whole head and cap inside the frame
with clear space above the cap. Soft studio lighting, 85mm lens, sharp focus on the eyes, natural skin texture with pores.
Plain dark studio background with a subtle {primary color} tint.
Photorealistic photograph. No text, no letters, no numbers, no watermark, no other logos, no sponsor patches.
```

**Texto negativo** (solo si el flujo usa CFG mayor que 1; con Lightning y CFG 1 no se usa):

```
cartoon, illustration, anime, 3d render, painting, plastic skin, airbrushed, different person, distorted face,
deformed logo, misspelled text, letters, watermark, extra fingers, cropped head
```

**Encuadre:** cuadrado, de 1024 px o más. La app los muestra en círculo, así que deja la gorra completa con aire arriba (al menos 8% del alto) y la barbilla cerca del 70% del alto.

**Reintentos:**

- Si la imagen no pasa la revisión de la sección 6, repítela con otra semilla, hasta 3 intentos.
- Si la cara sale bien pero el logo nunca sale bien, haz la gorra lisa en el color del equipo y pega el logo real (el PNG) como insignia pequeña en la esquina de abajo a la derecha, con Pillow. Marca `"logo": "insignia"`.
- Si la cara no sale bien en 3 intentos, queda `rechazada` y no se sube.

**El archivo final:** WebP de 512 × 512, calidad 82, sin metadatos, de menos de 150 KB, en `avatares/salida/{id}.webp`.

## 6. Revisión de calidad

Revisa las imágenes en hojas de 12 parejas, con la foto original al lado de su retrato (Pillow arma la hoja). Así gastas pocas consultas. En cada pareja revisa:

- **Misma persona:** si dudas, no pasa.
- **Foto real:** que no parezca dibujo, render ni piel de plástico.
- **Logo:** parecido al del equipo, centrado en la gorra y sin deformar.
- **Sin texto:** ni letras, ni números, ni marcas de agua, ni otros logos.
- **Encuadre:** la cabeza completa y centrada (tiene que caber en un círculo); las manos, si salen, bien hechas.

## 7. Piloto primero

1. Haz **6 retratos, uno por equipo**.
2. Arma `avatares/revision.html`: una página local con cada foto original al lado de su retrato, el nombre y el equipo.
3. Ábrela, enséñasela a Randy y **espera su OK**. Si pide cambios, ajusta el texto o el flujo y repite el piloto.
4. Con el OK, sigue con todos sin preguntar más, hasta terminar. Ve actualizando `revision.html` con todo lo hecho.

## 8. Lo que queda en la carpeta

```
avatares/
  fuentes/fotos/{id}.jpg, fuentes/logos/{teamId}.png   (no salen de la PC)
  salida/{id}.webp                                     (los retratos)
  salida/manifest.json                                 (lo que lee el script de subida)
  revision.html, REPORTE.md, scripts/
```

`manifest.json` es una lista con una entrada por pelotero, también para los `sin-foto` y los `rechazada`:

```json
[
  { "personId": 815908, "name": "Jesús Made", "teamId": 672, "season": 2026, "file": "815908.webp",
    "status": "ok", "motor": "qwen-local", "intentos": 1, "logo": "gorra", "nota": "" }
]
```

- `status` puede ser `ok`, `sin-foto` o `rechazada`.
- `motor` puede ser `qwen-local` o `gemini-api`.
- `logo` puede ser `gorra` o `insignia`.

Antes de generar uno, mira el manifiesto: si ya está `ok` y el archivo existe, sáltalo. Así se puede parar y seguir.

## 9. Subirlos a Supabase

**Lo hace Randy una vez:**

1. Corre `supabase/2026-10-23-avatares.sql` en el SQL Editor de Supabase, después de cambiar el secreto por uno propio.
2. Pon ese mismo secreto en `.env.local` como `AVATARS_SECRET=...`.

Para sacar un secreto nuevo: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Si Randy no está, deja todo listo y para aquí.

**Después, con el manifiesto completo:**

```
node scripts/subir-avatares.js --dry
node scripts/subir-avatares.js
```

- `--dry` revisa todo sin subir nada: que estén los archivos, el formato, que sean cuadrados y el tamaño.
- Sin `--dry`, sube solo los nuevos o los que cambiaron. Se puede correr las veces que haga falta.

Si el script dice que falta la tabla, es que el SQL no se ha corrido.

## 10. Al terminar

Escribe `avatares/REPORTE.md` con:

- cuántos quedaron `ok`, `sin-foto` y `rechazada`, y por qué se rechazó cada uno;
- el motor que usaste, cuánto tardó y el costo si fue por la API;
- lo que respondió `subir-avatares.js`.

Después avísale a Randy que está listo para que Claude conecte la app. No hagas commit, no hagas push y no toques el código.
