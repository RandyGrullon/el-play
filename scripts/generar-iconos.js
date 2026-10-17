// Genera los íconos, el splash y las imágenes de tienda de El Play a partir de assets/brand/logo.svg
// (el mismo logo de la web: home plate con degradado azul→rojo y pelota).
//
// Uso:  node scripts/generar-iconos.js
// Necesita Playwright con Chromium. No es dependencia del proyecto: se busca `playwright` normal y, si no está,
// se usan las variables PLAYWRIGHT_PATH (carpeta del paquete) y CHROMIUM_PATH (ejecutable de Chromium).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'images');
const STORE = path.join(ROOT, 'assets', 'store');

// Colores de la marca (los mismos de la web: --bg oscuro y --accent)
const BG = '#0b0c10';
const ACCENT = '37,99,235';

const loadPlaywright = () => {
    try {
        return require('playwright');
    } catch {
        const fallback = process.env.PLAYWRIGHT_PATH || 'C:/Users/rgrullon/code/Humanify/node_modules/playwright';
        return require(fallback);
    }
};

// ------------------------------------------------------------------ PNG con canal alfa
// Chromium guarda en RGB cuando la imagen es toda opaca; esto la vuelve a escribir como RGBA (alfa 255).
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
};
const pngToRgba = (file) => {
    const buf = fs.readFileSync(file);
    let pos = 8;
    let ihdr = null;
    const idat = [];
    while (pos < buf.length) {
        const length = buf.readUInt32BE(pos);
        const type = buf.toString('ascii', pos + 4, pos + 8);
        const data = buf.subarray(pos + 8, pos + 8 + length);
        if (type === 'IHDR') ihdr = data;
        if (type === 'IDAT') idat.push(data);
        pos += 12 + length;
    }
    const width = ihdr.readUInt32BE(0);
    const height = ihdr.readUInt32BE(4);
    if (ihdr[9] === 6) return; // ya es RGBA
    if (ihdr[8] !== 8 || ihdr[9] !== 2 || ihdr[12] !== 0) throw new Error(`PNG no soportado: ${file}`);
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * 3;
    const prev = Buffer.alloc(stride);
    const out = Buffer.alloc(height * (1 + width * 4));
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const row = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
        for (let i = 0; i < stride; i++) {
            const a = i >= 3 ? row[i - 3] : 0;
            const b = prev[i];
            const c = i >= 3 ? prev[i - 3] : 0;
            const p = a + b - c;
            const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
            const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
            row[i] = (row[i] + predictor) & 0xff;
        }
        row.copy(prev);
        const base = y * (1 + width * 4);
        for (let x = 0; x < width; x++) {
            out[base + 1 + x * 4] = row[x * 3];
            out[base + 2 + x * 4] = row[x * 3 + 1];
            out[base + 3 + x * 4] = row[x * 3 + 2];
            out[base + 4 + x * 4] = 255;
        }
    }
    const header = Buffer.from(ihdr);
    header[9] = 6;
    fs.writeFileSync(file, Buffer.concat([buf.subarray(0, 8), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(out, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
};

// ------------------------------------------------------------------ el logo
// Coordenadas en unidades del viewBox 0..64 del SVG original.
const logoSvg = fs.readFileSync(path.join(ROOT, 'assets', 'brand', 'logo.svg'), 'utf8');
const logoInner = logoSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const PLATE = 'M14 5h36a6 6 0 0 1 6 6v21.6a6 6 0 0 1-1.76 4.24L36.24 54.84a6 6 0 0 1-8.48 0L9.76 36.84A6 6 0 0 1 8 32.6V11a6 6 0 0 1 6-6z';
const SEAMS = ['M23.4 17.4c3.1 2.6 4.8 5.8 4.8 9.3s-1.7 6.7-4.8 9.3', 'M40.6 17.4c-3.1 2.6-4.8 5.8-4.8 9.3s1.7 6.7 4.8 9.3'];
const STITCHES = ['M22.3 17.4c3.1 2.6 4.8 5.8 4.8 9.3s-1.7 6.7-4.8 9.3', 'M41.7 17.4c-3.1 2.6-4.8 5.8-4.8 9.3s1.7 6.7 4.8 9.3'];

// Centro de la caja del home plate (8..56 × 5..57) y centro de la pelota.
// La pelota es también el centro del círculo más pequeño que encierra el plate (radio ≈ 29.9),
// por eso se usa para el ícono adaptativo de Android, que se recorta en círculo.
const BOX_CENTER = { x: 32, y: 31 };
const BALL_CENTER = { x: 32, y: 26.7 };

/** Coloca el logo con el punto `anchor` (unidades del logo) en (cx, cy), a `unit` píxeles por unidad */
const place = (inner, cx, cy, unit, anchor = BOX_CENTER) =>
    `<g transform="translate(${cx - anchor.x * unit} ${cy - anchor.y * unit}) scale(${unit})">${inner}</g>`;

/** Silueta de un solo color: plate lleno, pelota calada y costuras visibles dentro del hueco */
const mono = ({ color = '#fff', stitches = true, seamWidth = 1.3 } = {}) => `
  <defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
    <path d="${PLATE}" fill="#fff"/>
    <circle cx="32" cy="26.7" r="13" fill="#000"/>
    <g fill="none" stroke="#fff" stroke-linecap="round">
      ${SEAMS.map((d) => `<path d="${d}" stroke-width="${seamWidth}"/>`).join('')}
      ${stitches ? STITCHES.map((d) => `<path d="${d}" stroke-width="1.7" stroke-dasharray="0.01 2.3"/>`).join('') : ''}
    </g>
  </mask></defs>
  <rect width="64" height="64" fill="${color}" mask="url(#m)"/>`;

/** Fondo oscuro de la marca con un brillo azul muy suave detrás del logo */
const background = (w, h, cx = w / 2, cy = h / 2, r = Math.max(w, h) * 0.55) => `
  <defs><radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}">
    <stop offset="0" stop-color="rgb(${ACCENT})" stop-opacity="0.22"/>
    <stop offset="1" stop-color="rgb(${ACCENT})" stop-opacity="0"/>
  </radialGradient></defs>
  <rect width="${w}" height="${h}" fill="${BG}"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>`;

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

// Fuentes de la marca incrustadas (Outfit para el nombre, igual que la web)
const fontData = (pkg, file) => fs.readFileSync(path.join(ROOT, 'node_modules', '@expo-google-fonts', pkg, file)).toString('base64');
const fontCss = () => `
  @font-face { font-family: 'Outfit'; font-weight: 800; src: url(data:font/ttf;base64,${fontData('outfit', '800ExtraBold/Outfit_800ExtraBold.ttf')}) format('truetype'); }
  @font-face { font-family: 'Outfit'; font-weight: 500; src: url(data:font/ttf;base64,${fontData('outfit', '500Medium/Outfit_500Medium.ttf')}) format('truetype'); }`;

// ------------------------------------------------------------------ lo que se genera
const S = 1024;
const assets = [
    {
        // iOS y genérico: cuadrado completo, sin transparencia ni esquinas redondeadas (iOS las pone)
        file: path.join(OUT, 'icon.png'),
        w: S, h: S, opaque: true,
        body: background(S, S) + place(logoInner, S / 2, S / 2, (S * 0.88) / 64)
    },
    {
        // Android adaptativo, capa delantera: el plate cabe en el círculo seguro de 66/108 (radio ≈ 313 px)
        file: path.join(OUT, 'android-icon-foreground.png'),
        w: S, h: S,
        body: place(logoInner, S / 2, S / 2, 10, BALL_CENTER)
    },
    {
        file: path.join(OUT, 'android-icon-background.png'),
        w: S, h: S, opaque: true,
        body: background(S, S)
    },
    {
        // Android 13+ «íconos temáticos»: solo cuenta la forma (alfa); el sistema le pone el color
        file: path.join(OUT, 'android-icon-monochrome.png'),
        w: S, h: S,
        body: place(mono(), S / 2, S / 2, 10, BALL_CENTER)
    },
    {
        // Pantalla de inicio: logo sobre transparente; el tamaño en pantalla lo da imageWidth en app.json
        file: path.join(OUT, 'splash-icon.png'),
        w: S, h: S,
        body: place(logoInner, S / 2, S / 2, (S * 0.9) / 52)
    },
    {
        file: path.join(OUT, 'favicon.png'),
        w: 48, h: 48,
        body: place(logoInner, 24, 24, 46 / 52)
    },
    {
        // Ícono de notificación de Android: blanco sobre transparente, 96×96, con 8 px de margen.
        // Sin puntadas: a este tamaño se ven como ruido.
        file: path.join(OUT, 'notification-icon.png'),
        w: 96, h: 96,
        body: place(mono({ stitches: false, seamWidth: 2.4 }), 48, 48, 80 / 52)
    },
    {
        // Google Play: ícono de la ficha, 512×512 (Google redondea las esquinas). Google lo pide en PNG de 32 bits
        // (con canal alfa), así que se guarda con alfa aunque todo el cuadro es opaco.
        file: path.join(STORE, 'play-store-icon-512.png'),
        w: 512, h: 512, opaque: true, alpha: true,
        body: background(512, 512) + place(logoInner, 256, 256, (512 * 0.88) / 64)
    },
    {
        // Google Play: gráfico de funciones 1024×500 (obligatorio en la ficha)
        file: path.join(STORE, 'feature-graphic-1024x500.png'),
        w: 1024, h: 500, opaque: true,
        html: `
          <div class="fg">
            ${svg(1024, 500, background(1024, 500, 300, 250, 520) + place(logoInner, 300, 250, 300 / 52))}
            <div class="text">
              <div class="name">El Play</div>
              <div class="tag">Béisbol dominicano en vivo</div>
              <div class="sub">LIDOM pitcheo a pitcheo · Posiciones · Fantasy</div>
            </div>
          </div>`
    }
];

const page = (a) => `<!doctype html><html><head><meta charset="utf-8"><style>
  ${a.html ? fontCss() : ''}
  html, body { margin: 0; padding: 0; background: transparent; }
  svg { display: block; }
  .fg { position: relative; width: 1024px; height: 500px; }
  .fg .text { position: absolute; left: 500px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; color: #fff; font-family: 'Outfit', sans-serif; }
  .fg .name { font-weight: 800; font-size: 104px; line-height: 1; letter-spacing: -0.02em; }
  .fg .tag { font-weight: 500; font-size: 34px; margin-top: 14px; color: #f1f2f6; }
  .fg .sub { font-weight: 500; font-size: 22px; margin-top: 12px; color: #9a9db0; }
</style></head><body>${a.html || svg(a.w, a.h, a.body)}</body></html>`;

(async () => {
    const { chromium } = loadPlaywright();
    const executablePath = process.env.CHROMIUM_PATH || (process.env.PLAYWRIGHT_PATH || !fs.existsSync('C:/Users/rgrullon/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe')
        ? undefined
        : 'C:/Users/rgrullon/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe');
    const browser = await chromium.launch({ executablePath });
    fs.mkdirSync(OUT, { recursive: true });
    fs.mkdirSync(STORE, { recursive: true });
    for (const a of assets) {
        const tab = await browser.newPage({ viewport: { width: a.w, height: a.h }, deviceScaleFactor: 1 });
        await tab.setContent(page(a), { waitUntil: 'load' });
        await tab.evaluate(() => document.fonts.ready);
        await tab.screenshot({ path: a.file, omitBackground: !a.opaque, clip: { x: 0, y: 0, width: a.w, height: a.h } });
        await tab.close();
        if (a.alpha) pngToRgba(a.file);
        console.log('✓', path.relative(ROOT, a.file), `${a.w}×${a.h}`);
    }
    await browser.close();
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
