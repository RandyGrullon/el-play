"""Generador de imagen de El Play: retratos realistas de los peloteros con ComfyUI en la PC (RTX 5070).

Lee los peloteros de la API de El Play, baja la foto de cada uno y le pide a ComfyUI (Qwen-Image-Edit) un retrato de
estudio de la misma persona con el uniforme y la gorra de su equipo. Guarda cada retrato en avatares/salida/{id}.webp,
con su manifest.json, listo para scripts/subir-avatares.js. Instrucciones completas: docs/GENERADOR-DE-IMAGEN.md.

Uso, desde la raíz del repositorio y con ComfyUI abierto:
  python generador-de-imagen/generar.py --revisar          revisa ComfyUI, los nodos y los modelos, sin generar
  python generador-de-imagen/generar.py --piloto           6 retratos, uno por equipo
  python generador-de-imagen/generar.py                    todos los que falten de la temporada actual
  python generador-de-imagen/generar.py --rehacer 1,2      esos otra vez, con otra semilla
  python generador-de-imagen/generar.py --insignia 1,2     esos con la gorra lisa y el logo pegado en la esquina
  python generador-de-imagen/generar.py --rechazar 1,2     esos no sirven: no se suben
  python generador-de-imagen/generar.py --temporada 2025   los de otra temporada
  python generador-de-imagen/generar.py --pagina           solo rehace avatares/revision.html
Solo usa la biblioteca estándar y Pillow (el Python de ComfyUI portable ya la trae).
"""

import argparse
import html
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit('Falta Pillow: córrelo con el Python de ComfyUI (python_embeded\\python.exe) o instala Pillow (pip install pillow)')

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, 'reconfigure'):
        stream.reconfigure(encoding='utf-8', errors='replace')

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
LOGOS = HERE / 'logos'
API = 'https://elplay.grullonb.com'
FOTOS = 'https://img.mlbstatic.com/mlb-photos/image/upload'

# Nombre, color principal y detalles en inglés (así entiende mejor el modelo) y el color de la gorra para la referencia
TEAMS = {
    667: {'abbrev': 'AGU', 'name': 'Águilas Cibaeñas', 'color': 'golden yellow', 'trim': 'black', 'hex': '#FDB927'},
    668: {'abbrev': 'TOR', 'name': 'Toros del Este', 'color': 'bright orange', 'trim': 'black', 'hex': '#FA4616'},
    669: {'abbrev': 'EST', 'name': 'Estrellas Orientales', 'color': 'green', 'trim': 'white', 'hex': '#00BE66'},
    670: {'abbrev': 'GIG', 'name': 'Gigantes del Cibao', 'color': 'burgundy red', 'trim': 'white', 'hex': '#AA1141'},
    671: {'abbrev': 'ESC', 'name': 'Leones del Escogido', 'color': 'red', 'trim': 'black', 'hex': '#E31837'},
    672: {'abbrev': 'LIC', 'name': 'Tigres del Licey', 'color': 'royal blue', 'trim': 'white', 'hex': '#0069E0'},
}

PROMPT = """Professional sports media-day portrait photograph of the same man shown in image 1.
Keep his exact identity: face shape, skin tone, eyes, nose, lips, ears, hairline, hair, facial hair and age must stay identical.
He wears a {color} baseball jersey with {trim} trim and a {color} baseball cap {cap}.
Head and shoulders, facing the camera, neutral confident expression, centered, the whole head and cap inside the frame with clear space above the cap.
Soft studio lighting, 85mm lens, sharp focus on the eyes, natural skin texture with pores.
Plain dark studio background with a subtle {color} tint.
Photorealistic photograph. No text, no letters, no numbers, no watermark, no sponsor patches, no logo on the jersey, no other logos."""
CAP_LOGO = 'with the logo shown in image 2 embroidered on the front panel of the cap, exactly the same shapes and colors as image 2'
CAP_PLAIN = 'with a plain front panel and no logo'
NEGATIVE = ('cartoon, illustration, anime, 3d render, painting, plastic skin, airbrushed, different person, distorted face, '
            'deformed logo, misspelled text, letters, watermark, extra fingers, cropped head')

SIZE = 512          # lado del retrato final
MAX_KB = 150
UA = 'Mozilla/5.0 (compatible; el-play-generador/1.0; +https://elplay.grullonb.com)'


# ------------------------------------------------------------------------------------------------ utilidades

def log(text):
    print(text, flush=True)


def ids_arg(value):
    """'1, 2,3' → {1, 2, 3}"""
    try:
        return {int(part) for part in re.split(r'[\s,]+', value.strip()) if part}
    except ValueError:
        raise argparse.ArgumentTypeError('tiene que ser una lista de ids separados por comas')


def http(url, data=None, headers=None, timeout=60, missing_ok=False):
    """Bytes de la respuesta; None si es 404 y missing_ok. Reintenta dos veces los fallos de red."""
    request = urllib.request.Request(url, data=data, headers={'User-Agent': UA, **(headers or {})})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code == 404 and missing_ok:
                return None
            body = error.read().decode('utf-8', 'replace')[:2000]
            raise RuntimeError(f'{url.split("?")[0]} respondió {error.code}: {body}') from None
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            if attempt == 2:
                raise RuntimeError(f'No se pudo llegar a {url.split("?")[0]}: {error}') from None
            time.sleep(2 * (attempt + 1))


def get_json(url, **kwargs):
    return json.loads(http(url, headers={'Accept': 'application/json'}, **kwargs))


def name_key(name):
    """Misma clave que src/lib/photos.ts y server/services/teamPhotos.js"""
    if ',' in name:
        name = ' '.join(reversed(name.split(',')))
    text = unicodedata.normalize('NFD', name)
    text = ''.join(char for char in text if not unicodedata.combining(char)).lower()
    text = re.sub(r'\b(jr|sr|ii|iii|iv)\b\.?', '', text)
    return re.sub(r'[^a-z]', '', text)


def save_atomic(path, text):
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(text, encoding='utf-8')
    os.replace(tmp, path)


# ------------------------------------------------------------------------------------------------ ComfyUI

class Comfy:
    def __init__(self, url):
        self.url = url.rstrip('/')
        self.client = uuid.uuid4().hex
        self.info = {}

    def json(self, path, body=None, timeout=60):
        data = json.dumps(body).encode() if body is not None else None
        headers = {'Accept': 'application/json'}
        if data is not None:
            headers['Content-Type'] = 'application/json'
        raw = http(self.url + path, data=data, headers=headers, timeout=timeout)
        return json.loads(raw) if raw else {}

    def node(self, name):
        """Definición del nodo (o None si este ComfyUI no lo tiene)"""
        if name not in self.info:
            try:
                self.info[name] = self.json(f'/object_info/{urllib.parse.quote(name)}').get(name)
            except RuntimeError:
                self.info[name] = None
        return self.info[name]

    def options(self, node, field):
        """Valores posibles de un campo de lista (los archivos de modelos que hay en las carpetas)"""
        spec = self.node(node)
        if not spec:
            return []
        for group in ('required', 'optional'):
            entry = spec.get('input', {}).get(group, {}).get(field)
            if entry:
                values = entry[0]
                if isinstance(values, list):
                    return values
                # Formato nuevo de ComfyUI: ["COMBO", {"options": [...]}]
                if isinstance(values, str) and len(entry) > 1 and isinstance(entry[1], dict):
                    return entry[1].get('options', [])
        return []

    def upload(self, path, name):
        boundary = uuid.uuid4().hex
        parts = [
            f'--{boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n'.encode(),
            f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{name}"\r\nContent-Type: image/png\r\n\r\n'.encode(),
            Path(path).read_bytes(),
            f'\r\n--{boundary}--\r\n'.encode(),
        ]
        raw = http(self.url + '/upload/image', data=b''.join(parts), headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
        answer = json.loads(raw)
        return f"{answer['subfolder']}/{answer['name']}" if answer.get('subfolder') else answer['name']

    def run(self, graph, timeout=1200):
        """Encola el grafo, espera a que termine y devuelve los bytes de la primera imagen guardada"""
        try:
            queued = self.json('/prompt', {'prompt': graph, 'client_id': self.client})
        except RuntimeError as error:
            raise SetupError(f'ComfyUI rechazó el flujo (revisa nodos y modelos con --revisar):\n{error}') from None
        prompt_id = queued['prompt_id']
        started = time.time()
        while time.time() - started < timeout:
            time.sleep(1.5)
            history = self.json(f'/history/{prompt_id}').get(prompt_id)
            if not history:
                continue
            status = history.get('status', {})
            if status.get('status_str') == 'error':
                messages = [message[1].get('exception_message', '') for message in status.get('messages', []) if message[0] == 'execution_error']
                raise RuntimeError('ComfyUI falló: ' + ('; '.join(messages) or 'sin detalle'))
            for output in history.get('outputs', {}).values():
                for image in output.get('images', []):
                    query = urllib.parse.urlencode({'filename': image['filename'], 'subfolder': image.get('subfolder', ''), 'type': image.get('type', 'output')})
                    return http(f'{self.url}/view?{query}')
            if status.get('completed'):
                raise RuntimeError('ComfyUI terminó sin imagen')
        raise RuntimeError(f'ComfyUI no terminó en {timeout // 60} min')

    def free(self):
        try:
            self.json('/free', {'unload_models': True, 'free_memory': True})
        except RuntimeError:
            pass


class SetupError(Exception):
    """Algo de la instalación (nodos, modelos, conexión): no tiene sentido seguir con los demás peloteros"""


def pick(names, must, prefer=()):
    """El archivo que cumple todos los patrones de must; entre varios, el de versión más nueva y luego los de prefer"""
    found = [name for name in names if all(re.search(pattern, name, re.I) for pattern in must)]

    def score(name):
        version = max([int(v) for v in re.findall(r'(?<!\d)(2[5-9]\d\d)(?!\d)', name)] or [0])
        return (version, sum(1 for pattern in prefer if re.search(pattern, name, re.I)), -len(name))

    return max(found, key=score) if found else None


def configure(comfy, args):
    """Elige nodos y modelos según lo que tenga instalado este ComfyUI; SetupError con lo que falte"""
    try:
        comfy.json('/system_stats', timeout=10)
    except RuntimeError:
        raise SetupError(f'ComfyUI no responde en {comfy.url}. Ábrelo (run_nvidia_gpu.bat) o pasa --comfy con su dirección (ComfyUI Desktop usa el puerto 8000).') from None
    missing = [name for name in ('TextEncodeQwenImageEditPlus', 'ModelSamplingAuraFlow', 'EmptySD3LatentImage', 'CLIPLoader', 'VAELoader', 'KSampler', 'LoadImage', 'SaveImage', 'VAEDecode') if not comfy.node(name)]
    if missing:
        raise SetupError('A este ComfyUI le faltan nodos: ' + ', '.join(missing) + '. Actualízalo (update\\update_comfyui.bat).')

    edit = [r'qwen', r'image', r'edit']
    unet = args.unet or pick(comfy.options('UNETLoader', 'unet_name'), edit, (r'fp8', r'e4m3'))
    gguf = False
    if not unet or args.unet and args.unet.lower().endswith('.gguf'):
        unet = args.unet or pick(comfy.options('UnetLoaderGGUF', 'unet_name'), edit, (r'q5', r'q4_k_m'))
        gguf = bool(unet)
    clip = args.clip or pick(comfy.options('CLIPLoader', 'clip_name'), [r'qwen', r'2\.5.?vl'], (r'fp8',))
    vae = args.vae or pick(comfy.options('VAELoader', 'vae_name'), [r'qwen', r'image', r'vae'])
    # La LoRA Lightning de la misma versión del modelo (2509 con 2509), de preferencia la de 4 pasos
    version = re.search(r'25\d\d', unet or '')
    prefer = (r'edit', r'4.?steps') + ((version.group(0),) if version else ())
    lora = None if args.sin_lora else (args.lora or pick(comfy.options('LoraLoaderModelOnly', 'lora_name'), [r'qwen', r'lightning'], prefer))
    problems = []
    if not unet:
        problems.append('el modelo Qwen-Image-Edit (models/diffusion_models, o .gguf con el nodo ComfyUI-GGUF)')
    if not clip:
        problems.append('el codificador de texto qwen_2.5_vl_7b (models/text_encoders)')
    if not vae:
        problems.append('el VAE qwen_image_vae (models/vae)')
    if 'qwen_image' not in comfy.options('CLIPLoader', 'type'):
        problems.append('soporte de Qwen en CLIPLoader (actualiza ComfyUI)')
    if problems:
        raise SetupError('Falta: ' + '; '.join(problems) + '. Ver docs/GENERADOR-DE-IMAGEN.md, sección 3.')
    steps = args.pasos or (8 if lora and re.search(r'8.?steps', lora, re.I) else 4 if lora else 30)
    cfg = args.cfg or (1.0 if lora else 4.0)
    return {
        'unet': unet, 'gguf': gguf, 'clip': clip, 'vae': vae, 'lora': lora, 'steps': steps, 'cfg': cfg,
        'cfg_norm': bool(comfy.node('CFGNorm')), 'size': args.tamano,
    }


def build_graph(setup, photo, logo, prompt, seed, person_id):
    """Flujo de Qwen-Image-Edit en formato API: foto (imagen 1) + gorra con el logo (imagen 2, opcional) → retrato"""
    graph = {
        '1': {'class_type': 'UnetLoaderGGUF', 'inputs': {'unet_name': setup['unet']}} if setup['gguf'] else
             {'class_type': 'UNETLoader', 'inputs': {'unet_name': setup['unet'], 'weight_dtype': 'default'}},
        '2': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': setup['clip'], 'type': 'qwen_image'}},
        '3': {'class_type': 'VAELoader', 'inputs': {'vae_name': setup['vae']}},
        '7': {'class_type': 'LoadImage', 'inputs': {'image': photo}},
    }
    model = ['1', 0]
    if setup['lora']:
        graph['4'] = {'class_type': 'LoraLoaderModelOnly', 'inputs': {'model': model, 'lora_name': setup['lora'], 'strength_model': 1.0}}
        model = ['4', 0]
    graph['5'] = {'class_type': 'ModelSamplingAuraFlow', 'inputs': {'model': model, 'shift': 3.0}}
    model = ['5', 0]
    if setup['cfg_norm']:
        graph['6'] = {'class_type': 'CFGNorm', 'inputs': {'model': model, 'strength': 1.0}}
        model = ['6', 0]
    images = {'image1': ['7', 0]}
    if logo:
        graph['8'] = {'class_type': 'LoadImage', 'inputs': {'image': logo}}
        images['image2'] = ['8', 0]
    graph['9'] = {'class_type': 'TextEncodeQwenImageEditPlus', 'inputs': {'clip': ['2', 0], 'vae': ['3', 0], 'prompt': prompt, **images}}
    graph['10'] = {'class_type': 'TextEncodeQwenImageEditPlus', 'inputs': {'clip': ['2', 0], 'vae': ['3', 0], 'prompt': NEGATIVE if setup['cfg'] > 1 else '', **images}}
    graph['11'] = {'class_type': 'EmptySD3LatentImage', 'inputs': {'width': setup['size'], 'height': setup['size'], 'batch_size': 1}}
    graph['12'] = {'class_type': 'KSampler', 'inputs': {
        'model': model, 'seed': seed, 'steps': setup['steps'], 'cfg': setup['cfg'], 'sampler_name': 'euler', 'scheduler': 'simple',
        'positive': ['9', 0], 'negative': ['10', 0], 'latent_image': ['11', 0], 'denoise': 1.0}}
    graph['13'] = {'class_type': 'VAEDecode', 'inputs': {'samples': ['12', 0], 'vae': ['3', 0]}}
    graph['14'] = {'class_type': 'SaveImage', 'inputs': {'images': ['13', 0], 'filename_prefix': f'elplay/{person_id}'}}
    return graph


# ------------------------------------------------------------------------------------------------ fotos y referencias

def load_players(season):
    query = urllib.parse.urlencode({'league': 'lidom', **({'season': season} if season else {})})
    data = get_json(f'{API}/api/v2/players?{query}')
    players = [player for player in data.get('players', []) if player.get('teamId') in TEAMS and player.get('id')]
    return data.get('season'), players


def load_team_photos():
    try:
        return get_json(f'{API}/api/v2/photos').get('teams', {})
    except RuntimeError as error:
        log(f'  (sin fotos de los equipos: {error})')
        return {}


def fetch_photo(player, team_photos, folder):
    """Guarda la foto en PNG sobre fondo gris (las recortadas traen transparencia) y dice de dónde salió; None si no hay"""
    target = folder / f"{player['id']}.png"
    meta = folder / f"{player['id']}.json"
    if target.exists() and meta.exists():
        return json.loads(meta.read_text(encoding='utf-8'))['fuente']
    candidates = []
    team = team_photos.get(str(player['teamId']), {}).get(name_key(player['name']))
    if team:
        candidates.append(('equipo', team if team.startswith('http') else API + team))
    candidates.append(('silo', f"{FOTOS}/c_pad,ar_1:1,w_640,q_auto:best/v1/people/{player['id']}/headshot/silo/current"))
    candidates.append(('milb', f"{FOTOS}/c_fill,g_face,ar_1:1,w_640,q_auto:best/v1/people/{player['id']}/headshot/milb/current"))
    for source, url in candidates:
        raw = http(url, missing_ok=True)
        if not raw:
            continue
        try:
            image = Image.open(io.BytesIO(raw)).convert('RGBA')
        except Exception:
            continue
        if min(image.size) < 120:
            continue
        background = Image.new('RGBA', image.size, (118, 118, 118, 255))
        background.alpha_composite(image)
        photo = background.convert('RGB')
        photo.thumbnail((1024, 1024), Image.LANCZOS)
        photo.save(target)
        meta.write_text(json.dumps({'fuente': source}), encoding='utf-8')
        return source
    return None


def cap_reference(team_id, folder):
    """Imagen 2: la marca de la gorra (logos/{id}-gorra.png) sobre el color de la gorra"""
    target = folder / f'{team_id}.png'
    if not target.exists():
        mark = LOGOS / f'{team_id}-gorra.png'
        if not mark.exists():
            raise SetupError(f'Falta {mark}')
        canvas = Image.new('RGBA', (1024, 1024), TEAMS[team_id]['hex'])
        logo = Image.open(mark).convert('RGBA').resize((820, 820), Image.LANCZOS)
        canvas.alpha_composite(logo, (102, 102))
        canvas.convert('RGB').save(target)
    return target


def finish(raw, team_id, badge, target):
    """PNG de ComfyUI → WebP cuadrado de 512 px, sin metadatos y de menos de 150 KB; con insignia pega el logo redondo"""
    image = Image.open(io.BytesIO(raw)).convert('RGB')
    side = min(image.size)
    left, top = (image.width - side) // 2, (image.height - side) // 2
    image = image.crop((left, top, left + side, top + side)).resize((SIZE, SIZE), Image.LANCZOS)
    if badge:
        logo = Image.open(LOGOS / f'{team_id}.png').convert('RGBA').resize((round(SIZE * 0.24),) * 2, Image.LANCZOS)
        margin = round(SIZE * 0.05)
        canvas = image.convert('RGBA')
        canvas.alpha_composite(logo, (SIZE - logo.width - margin, SIZE - logo.height - margin))
        image = canvas.convert('RGB')
    for quality in (82, 74, 66):
        buffer = io.BytesIO()
        image.save(buffer, 'WEBP', quality=quality, method=6)
        if buffer.tell() <= MAX_KB * 1024:
            break
    target.write_bytes(buffer.getvalue())


# ------------------------------------------------------------------------------------------------ manifiesto y página

def load_manifest(path):
    if not path.exists():
        return {}
    return {entry['personId']: entry for entry in json.loads(path.read_text(encoding='utf-8'))}


def write_manifest(path, manifest):
    entries = sorted(manifest.values(), key=lambda entry: (entry.get('teamId') or 0, entry.get('name') or ''))
    save_atomic(path, json.dumps(entries, ensure_ascii=False, indent=1))


def write_page(base, manifest):
    """avatares/revision.html: original al lado del retrato; se marca qué rehacer y la página arma el comando"""
    cards = []
    for entry in sorted(manifest.values(), key=lambda e: (e.get('teamId') or 0, e.get('name') or '')):
        team = TEAMS.get(entry.get('teamId'), {})
        pid = entry['personId']
        photo = f'fuentes/fotos/{pid}.png'
        portrait = f"salida/{entry['file']}?v={entry.get('intentos', 0)}" if entry.get('file') and entry['status'] == 'ok' else ''
        right = f'<img loading="lazy" src="{portrait}" alt="Retrato">' if portrait else f'<div class="empty">{html.escape(entry["status"])}</div>'
        left = f'<img loading="lazy" src="{photo}" alt="Foto original">' if (base / photo).exists() else '<div class="empty">sin foto</div>'
        note = f'<p class="note">{html.escape(entry["nota"])}</p>' if entry.get('nota') else ''
        cards.append(f'''<article class="card" data-id="{pid}" data-team="{team.get('abbrev', '')}" data-status="{entry['status']}">
  <div class="pair">{left}{right}</div>
  <header><strong>{html.escape(entry.get('name') or str(pid))}</strong><span style="--c:{team.get('hex', '#888')}">{team.get('abbrev', '')}</span></header>
  <p class="meta">{pid} · intento {entry.get('intentos', 0)} · logo {entry.get('logo') or '—'} · {entry['status']}</p>{note}
  <div class="actions"><button data-a="">Bien</button><button data-a="rehacer">Rehacer</button><button data-a="insignia">Insignia</button><button data-a="rechazar">Rechazar</button></div>
</article>''')
    counts = {status: sum(1 for e in manifest.values() if e['status'] == status) for status in ('ok', 'sin-foto', 'rechazada')}
    teams = ''.join(f'<button class="chip" data-team="{t["abbrev"]}">{t["abbrev"]}</button>' for t in TEAMS.values())
    # El comando que arma la página usa el mismo Python que corrió el script (el de ComfyUI trae Pillow)
    python = f'& "{sys.executable}"' if ' ' in sys.executable else sys.executable
    page = PAGE.replace('{{CARDS}}', '\n'.join(cards)).replace('{{TEAMS}}', teams).replace('{{PY}}', json.dumps(python)).replace(
        '{{SUMMARY}}', f"{counts['ok']} listos · {counts['sin-foto']} sin foto · {counts['rechazada']} rechazados · {datetime.now():%d/%m %H:%M}")
    save_atomic(base / 'revision.html', page)


PAGE = r'''<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Revisión de retratos</title>
<style>
:root{--bg:#f4f3ef;--card:#fff;--ink:#1d1f24;--muted:#646a73;--line:#dedbd2;--ok:#1f7a4d;--redo:#b8860b;--badge:#2f5fb3;--no:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#15171b;--card:#1f2228;--ink:#ecedef;--muted:#9aa1ab;--line:#30343c;--ok:#4cc38a;--redo:#e0b341;--badge:#7aa2f7;--no:#f2766b;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
.top{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line);padding:12px max(16px,3vw);display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}
h1{font-size:18px;margin:0}.summary{color:var(--muted)}.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:99px;padding:4px 10px;cursor:pointer;font:inherit}
.chip.on{background:var(--ink);color:var(--bg)}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;padding:16px max(16px,3vw) 160px}
.card{background:var(--card);border:2px solid var(--line);border-radius:14px;padding:10px;display:flex;flex-direction:column;gap:8px}
.card[data-mark=rehacer]{border-color:var(--redo)}.card[data-mark=insignia]{border-color:var(--badge)}.card[data-mark=rechazar]{border-color:var(--no)}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:6px}.pair img,.empty{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;background:#7776}
.empty{display:grid;place-items:center;color:var(--muted)}
header{display:flex;justify-content:space-between;gap:8px;align-items:center}header span{background:var(--c);color:#fff;border-radius:6px;padding:1px 7px;font-weight:700;font-size:12px}
.meta,.note{margin:0;color:var(--muted);font-size:12px}.note{color:var(--no)}
.actions{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}
.actions button{font:inherit;font-size:12px;padding:6px 0;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}
.card:not([data-mark]) [data-a=""],.card[data-mark=rehacer] [data-a=rehacer],.card[data-mark=insignia] [data-a=insignia],.card[data-mark=rechazar] [data-a=rechazar]{background:var(--ink);color:var(--bg)}
.bar{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--line);padding:10px max(16px,3vw);display:flex;flex-direction:column;gap:6px}
.bar code{display:block;white-space:pre-wrap;word-break:break-all;font-size:12px;background:var(--bg);padding:8px;border-radius:8px;user-select:all}
.bar button{align-self:flex-start;font:inherit;padding:6px 12px;border-radius:8px;border:0;background:var(--ink);color:var(--bg);cursor:pointer}
</style></head><body>
<div class="top"><h1>Revisión de retratos</h1><span class="summary">{{SUMMARY}}</span><div class="chips"><button class="chip on" data-team="">Todos</button>{{TEAMS}}<button class="chip" data-team="*">Marcados</button></div></div>
<main>
{{CARDS}}
</main>
<div class="bar"><span>Marca lo que no sirva (borde de color) y corre esto en la terminal, desde la raíz del repositorio:</span><code id="cmd"></code><button id="copy">Copiar</button></div>
<script>
const KEY = 'elplay-revision';
const PY = {{PY}};
let marks = {};
try { marks = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
const cards = [...document.querySelectorAll('.card')];
const render = () => {
  for (const card of cards) { const m = marks[card.dataset.id]; if (m) card.dataset.mark = m; else delete card.dataset.mark; }
  const by = { rehacer: [], insignia: [], rechazar: [] };
  for (const [id, m] of Object.entries(marks)) if (by[m]) by[m].push(id);
  const parts = Object.entries(by).filter(([, ids]) => ids.length).map(([m, ids]) => `--${m} ${ids.join(',')}`);
  document.getElementById('cmd').textContent = parts.length ? `${PY} generador-de-imagen/generar.py ${parts.join(' ')}` : 'Nada marcado: si todo está bien, sigue con: node scripts/subir-avatares.js --dry';
  try { localStorage.setItem(KEY, JSON.stringify(marks)); } catch {}
};
document.querySelector('main').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-a]'); if (!button) return;
  const id = button.closest('.card').dataset.id;
  if (button.dataset.a) marks[id] = button.dataset.a; else delete marks[id];
  render();
});
document.querySelector('.chips').addEventListener('click', (event) => {
  const chip = event.target.closest('.chip'); if (!chip) return;
  document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === chip));
  const team = chip.dataset.team;
  for (const card of cards) card.hidden = team === '*' ? !marks[card.dataset.id] : !!team && card.dataset.team !== team;
});
document.getElementById('copy').addEventListener('click', async () => {
  const text = document.getElementById('cmd').textContent;
  try { await navigator.clipboard.writeText(text); } catch { getSelection().selectAllChildren(document.getElementById('cmd')); }
});
render();
</script></body></html>
'''


# ------------------------------------------------------------------------------------------------ principal

def main():
    parser = argparse.ArgumentParser(description='Retratos realistas de los peloteros con ComfyUI (docs/GENERADOR-DE-IMAGEN.md)')
    parser.add_argument('--revisar', action='store_true', help='solo revisa ComfyUI, nodos y modelos')
    parser.add_argument('--piloto', action='store_true', help='6 retratos, uno por equipo')
    parser.add_argument('--rehacer', type=ids_arg, default=set(), help='ids a generar otra vez con otra semilla')
    parser.add_argument('--insignia', type=ids_arg, default=set(), help='ids con gorra lisa y el logo pegado en la esquina')
    parser.add_argument('--rechazar', type=ids_arg, default=set(), help='ids que no sirven (no se suben)')
    parser.add_argument('--solo', type=ids_arg, default=set(), help='generar solo estos ids')
    parser.add_argument('--temporada', type=int, help='otra temporada (por defecto la actual)')
    parser.add_argument('--pagina', action='store_true', help='solo rehace avatares/revision.html')
    parser.add_argument('--limite', type=int, default=0, help='parar después de N retratos')
    parser.add_argument('--comfy', default='http://127.0.0.1:8188', help='dirección de ComfyUI')
    parser.add_argument('--carpeta', default=str(ROOT / 'avatares'), help='carpeta de trabajo (por defecto avatares/)')
    parser.add_argument('--tamano', type=int, default=1024, help='lado de la imagen que genera ComfyUI')
    parser.add_argument('--pasos', type=int, help='pasos del muestreo (por defecto 4/8 con Lightning, 30 sin ella)')
    parser.add_argument('--cfg', type=float, help='CFG (por defecto 1 con Lightning, 4 sin ella)')
    parser.add_argument('--unet', help='archivo del modelo Qwen-Image-Edit a usar')
    parser.add_argument('--clip', help='archivo del codificador de texto')
    parser.add_argument('--vae', help='archivo del VAE')
    parser.add_argument('--lora', help='archivo de la LoRA Lightning')
    parser.add_argument('--sin-lora', action='store_true', help='no usar la LoRA Lightning (más lento, a veces más fino)')
    parser.add_argument('--api', help=argparse.SUPPRESS)
    parser.add_argument('--fotos', help=argparse.SUPPRESS)
    args = parser.parse_args()

    global API, FOTOS
    API = (args.api or API).rstrip('/')
    FOTOS = (args.fotos or FOTOS).rstrip('/')
    base = Path(args.carpeta).resolve()
    photos_dir, refs_dir, out_dir = base / 'fuentes' / 'fotos', base / 'fuentes' / 'referencias', base / 'salida'
    for folder in (photos_dir, refs_dir, out_dir):
        folder.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / 'manifest.json'
    manifest = load_manifest(manifest_path)

    if args.pagina:
        write_page(base, manifest)
        log(f'Listo: {base / "revision.html"}')
        return

    unknown = sorted(args.rechazar - set(manifest))
    if unknown:
        log('Para rechazar no están en el manifiesto (se ignoran): ' + ', '.join(map(str, unknown)))
    for pid in args.rechazar:
        if pid in manifest:
            manifest[pid].update(status='rechazada', nota='rechazada en la revisión')
            (out_dir / f'{pid}.webp').unlink(missing_ok=True)
    if args.rechazar:
        write_manifest(manifest_path, manifest)
        log(f'Rechazados: {len(args.rechazar) - len(unknown)}')
        if not (args.rehacer or args.insignia):
            write_page(base, manifest)
            return

    comfy = Comfy(args.comfy)
    try:
        setup = configure(comfy, args)
    except SetupError as error:
        sys.exit(str(error))
    log('ComfyUI listo:')
    log(f"  modelo  {setup['unet']}{' (GGUF)' if setup['gguf'] else ''}")
    log(f"  texto   {setup['clip']}")
    log(f"  vae     {setup['vae']}")
    log(f"  lora    {setup['lora'] or '(sin Lightning)'}")
    log(f"  {setup['steps']} pasos, CFG {setup['cfg']}, {setup['size']} px{', CFGNorm' if setup['cfg_norm'] else ''}")
    if args.revisar:
        missing = [str(LOGOS / f'{tid}-gorra.png') for tid in TEAMS if not (LOGOS / f'{tid}-gorra.png').exists()]
        log('Logos: ' + ('faltan ' + ', '.join(missing) if missing else 'los 6 están'))
        return

    season, players = load_players(args.temporada)
    log(f'Temporada {season}: {len(players)} peloteros')
    team_photos = load_team_photos()
    redo = args.rehacer | args.insignia

    # Qué toca: los marcados para rehacer, los de --solo, el piloto (el primero con foto de cada equipo) o todo lo que falte
    def finished(pid):
        status = manifest.get(pid, {}).get('status')
        return status in ('rechazada', 'sin-foto') or status == 'ok' and (out_dir / f'{pid}.webp').exists()

    if redo:
        # Pueden ser de otra temporada: se toman del manifiesto
        known = {pid: {'id': pid, 'name': entry['name'], 'teamId': entry['teamId']} for pid, entry in manifest.items()}
        known.update({player['id']: player for player in players})
        queue = [known[pid] for pid in sorted(redo) if pid in known]
    elif args.solo:
        queue = [player for player in players if player['id'] in args.solo]
    elif args.piloto:
        queue, seen = [], set()
        for player in players:
            if player['teamId'] in seen:
                continue
            if finished(player['id']) or fetch_photo(player, team_photos, photos_dir):
                seen.add(player['teamId'])
                if not finished(player['id']):
                    queue.append(player)
    else:
        queue = [player for player in players if not finished(player['id'])]
    if args.limite:
        queue = queue[:args.limite]
    log(f'Por generar: {len(queue)}')

    done, failures_in_row, durations = 0, 0, []
    try:
        for index, player in enumerate(queue, 1):
            pid, team_id = player['id'], player['teamId']
            team = TEAMS[team_id]
            label = f"[{index}/{len(queue)}] {player['name']} ({team['abbrev']})"
            previous = manifest.get(pid, {})
            entry = {'personId': pid, 'name': player['name'], 'teamId': team_id, 'season': previous.get('season') if pid in redo and previous.get('season') else season,
                     'file': f'{pid}.webp', 'status': 'ok', 'motor': 'comfyui', 'modelo': setup['unet'], 'intentos': previous.get('intentos', 0) + 1,
                     'logo': 'insignia' if pid in args.insignia else 'gorra', 'fuente': None, 'nota': ''}
            source = fetch_photo(player, team_photos, photos_dir)
            if not source:
                manifest[pid] = {**entry, 'status': 'sin-foto', 'file': None, 'intentos': previous.get('intentos', 0), 'logo': None, 'nota': 'no hay foto real: se queda con las iniciales'}
                write_manifest(manifest_path, manifest)
                log(f'{label}: sin foto, se salta')
                continue
            entry['fuente'] = source
            started = time.time()
            try:
                photo = comfy.upload(photos_dir / f'{pid}.png', f'elplay-{pid}.png')
                logo = None if pid in args.insignia else comfy.upload(cap_reference(team_id, refs_dir), f'elplay-gorra-{team_id}.png')
                prompt = PROMPT.format(color=team['color'], trim=team['trim'], cap=CAP_PLAIN if pid in args.insignia else CAP_LOGO)
                seed = (pid * 1009 + entry['intentos'] * 7919) % (2 ** 48)
                raw = comfy.run(build_graph(setup, photo, logo, prompt, seed, pid))
                finish(raw, team_id, pid in args.insignia, out_dir / f'{pid}.webp')
            except SetupError as error:
                sys.exit(str(error))
            except Exception as error:
                failures_in_row += 1
                log(f'{label}: falló ({error})')
                if failures_in_row >= 3:
                    sys.exit('Tres fallos seguidos: se para aquí. Revisa ComfyUI (su ventana dice el error) y vuelve a correrlo; sigue donde quedó.')
                continue
            failures_in_row = 0
            manifest[pid] = {**entry, 'generado': datetime.now().isoformat(timespec='seconds')}
            write_manifest(manifest_path, manifest)
            done += 1
            durations.append(time.time() - started)
            average = sum(durations[-10:]) / len(durations[-10:])
            left = (len(queue) - index) * average
            log(f'{label}: listo en {durations[-1]:.0f} s · faltan ~{int(left // 3600)} h {int(left % 3600 // 60)} min')
    except KeyboardInterrupt:
        log('\nParado. Lo hecho quedó guardado; vuelve a correrlo para seguir.')
    finally:
        write_page(base, manifest)
        comfy.free()
    log(f'Generados: {done}. Revisa {base / "revision.html"}')


if __name__ == '__main__':
    main()
