// Genera las imágenes para Instagram dibujando en un <canvas> a tamaño real.
// Historia 1080×1920 (9:16) y Post 1080×1350 (4:5). Tres estilos: color del equipo, noche y papel.
// Fotos y logos vienen de mlbstatic, que permite usarlos en canvas (Access-Control-Allow-Origin: *); las fotos con
// uniforme de LIDOM las sirve nuestra API (mismo origen).

import { PLATE_PATH, SEAM_LEFT, SEAM_RIGHT } from '../components/brand/Logo';
import { loadPhotoIndex, photoSources } from '../lib/photos';

export type ShareFormat = 'story' | 'post';
export type ShareStyle = 'color' | 'noche' | 'papel';

export interface PostTeam {
    name: string;
    abbrev: string;
    color: string;
    color2?: string | null;
    logo?: string | null;
    score: number | null;
    isWinner: boolean;
}

export interface ResultPost {
    kind: 'result';
    league: string;
    dateLabel: string;
    status: string;
    venue?: string;
    away: PostTeam;
    home: PostTeam;
    linescore?: { n: number; away: number | null; home: number | null }[];
    keyPlayLabel?: string;
    keyPlay?: string;
    keyDetail?: string;
}

export interface PlayerPost {
    kind: 'player';
    personId: number | null;
    name: string;
    /** Para buscar su foto con el uniforme del equipo */
    teamId?: number | null;
    teamName: string;
    teamAbbrev: string;
    color: string;
    color2?: string | null;
    value: string;
    label: string;
    context: string;
    detail?: string;
    league: string;
}

export interface StandingsPost {
    kind: 'standings';
    title: string;
    subtitle: string;
    league: string;
    rows: { rank: number; abbrev: string; name: string; color: string; wins: number; losses: number; gamesBack: string }[];
}

export type PostData = ResultPost | PlayerPost | StandingsPost;

export interface RenderOptions {
    format: ShareFormat;
    style: ShareStyle;
    /** Foto propia de fondo (object URL) */
    photo?: string | null;
    labels: { site: string };
}

const W = 1080;
const DISPLAY = '"Barlow Condensed", Outfit, sans-serif';
const SANS = 'Outfit, system-ui, sans-serif';

// ------------------------------------------------------------------ utilidades

const hexToRgb = (hex: string) => {
    const value = parseInt(hex.replace('#', '').slice(0, 6), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255] as const;
};

const luminance = (hex: string) => {
    const [r, g, b] = hexToRgb(hex).map((c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const inkOn = (hex: string) => (luminance(hex) > 0.42 ? '#14151a' : '#ffffff');

const alpha = (hex: string, a: number) => {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
};

const loadImage = (src: string, timeout = 6000): Promise<HTMLImageElement | null> =>
    new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const timer = setTimeout(() => resolve(null), timeout);
        img.onload = () => {
            clearTimeout(timer);
            resolve(img.naturalWidth > 0 ? img : null);
        };
        img.onerror = () => {
            clearTimeout(timer);
            resolve(null);
        };
        img.src = src;
    });

/** La mejor foto que cargue: uniforme del equipo, MLB o MiLB (ver lib/photos.ts) */
const loadPlayerPhoto = async (data: PlayerPost) => {
    if (!data.personId) return null;
    const sources = photoSources(data.personId, data.name, data.teamId, await loadPhotoIndex(), 720);
    for (const source of sources) {
        const img = await loadImage(source.url);
        if (img) return img;
    }
    return null;
};

export const ensureFonts = async () => {
    if (typeof document === 'undefined' || !document.fonts) return;
    await Promise.all(
        ['400 40px Outfit', '600 40px Outfit', '800 40px Outfit', '900 40px Outfit', '800 40px "Barlow Condensed"'].map((font) =>
            document.fonts.load(font).catch(() => undefined)
        )
    );
};

const font = (weight: number, size: number, family = SANS) => `${weight} ${Math.round(size)}px ${family}`;

/** Achica la letra hasta que el texto quepa en el ancho */
const fitFont = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight: number, family = SANS, min = 24) => {
    let current = size;
    ctx.font = font(weight, current, family);
    while (ctx.measureText(text).width > maxWidth && current > min) {
        current -= 4;
        ctx.font = font(weight, current, family);
    }
    return current;
};

const wrap = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = word;
            if (lines.length === maxLines) break;
        } else {
            line = test;
        }
    }
    if (lines.length < maxLines && line) lines.push(line);
    if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
        let last = lines[maxLines - 1];
        while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) last = last.slice(0, -1);
        lines[maxLines - 1] = `${last}…`;
    }
    return lines;
};

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
};

const cover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const sw = w / scale;
    const sh = h / scale;
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
};

let noiseTile: HTMLCanvasElement | null = null;
const grain = (ctx: CanvasRenderingContext2D, H: number, strength: number) => {
    if (!noiseTile) {
        noiseTile = document.createElement('canvas');
        noiseTile.width = noiseTile.height = 160;
        const n = noiseTile.getContext('2d')!;
        const data = n.createImageData(160, 160);
        for (let i = 0; i < data.data.length; i += 4) {
            const v = Math.random() * 255;
            data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
            data.data[i + 3] = 255;
        }
        n.putImageData(data, 0, 0);
    }
    const pattern = ctx.createPattern(noiseTile, 'repeat');
    if (!pattern) return;
    ctx.save();
    ctx.globalAlpha = strength;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
};

/** Costuras de pelota como adorno (las mismas curvas del logo) */
const seams = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, width: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    const s = r / 13;
    ctx.scale(s, s);
    ctx.translate(-32, -26.7);
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    for (const [d, dx] of [[SEAM_LEFT, -1.1], [SEAM_RIGHT, 1.1]] as const) {
        const path = new Path2D(d);
        ctx.lineWidth = width / s;
        ctx.stroke(path);
        ctx.save();
        ctx.translate(dx, 0);
        ctx.setLineDash([0.01, 2.3]);
        ctx.lineWidth = (width * 1.6) / s;
        ctx.stroke(path);
        ctx.restore();
    }
    ctx.restore();
};

const logoMark = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 64, size / 64);
    const gradient = ctx.createLinearGradient(8, 5, 56, 57);
    gradient.addColorStop(0, '#1e4fd8');
    gradient.addColorStop(0.55, '#1e3a8a');
    gradient.addColorStop(1, '#d61f3a');
    ctx.fillStyle = gradient;
    ctx.fill(new Path2D(PLATE_PATH));
    ctx.beginPath();
    ctx.arc(32, 26.7, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
    seams(ctx, x + (32 * size) / 64, y + (26.7 * size) / 64, (13 * size) / 64, '#e11d2e', size / 40);
};

const teamBadge = async (ctx: CanvasRenderingContext2D, team: { logo?: string | null; color: string; abbrev: string }, x: number, y: number, size: number) => {
    const img = team.logo ? await loadImage(team.logo) : null;
    if (img) {
        ctx.drawImage(img, x, y, size, size);
        return;
    }
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = team.color;
    ctx.fill();
    ctx.fillStyle = inkOn(team.color);
    ctx.font = font(800, size * 0.32);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(team.abbrev, x + size / 2, y + size / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
};

interface Palette {
    bg: string;
    ink: string;
    muted: string;
    accent: string;
    panel: string;
    seam: string;
}

const palette = (style: ShareStyle, color: string, color2?: string | null): Palette => {
    if (style === 'noche') return { bg: '#0b0c10', ink: '#f1f2f6', muted: '#9a9db0', accent: color, panel: 'rgba(255,255,255,0.06)', seam: alpha(color, 0.5) };
    if (style === 'papel') return { bg: '#f2ead8', ink: '#16130e', muted: '#6b6455', accent: '#c2362b', panel: 'rgba(22,19,14,0.06)', seam: 'rgba(194,54,43,0.45)' };
    const ink = inkOn(color);
    return {
        bg: color,
        ink,
        muted: ink === '#ffffff' ? 'rgba(255,255,255,0.78)' : 'rgba(20,21,26,0.7)',
        accent: color2 && color2.toLowerCase() !== color.toLowerCase() ? color2 : ink,
        panel: ink === '#ffffff' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.35)',
        seam: ink === '#ffffff' ? 'rgba(255,255,255,0.22)' : 'rgba(20,21,26,0.16)'
    };
};

/** Fondo: color del estilo o la foto del usuario con un velo para que el texto se lea */
const background = async (ctx: CanvasRenderingContext2D, H: number, pal: Palette, style: ShareStyle, photo?: string | null) => {
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);
    if (photo) {
        const img = await loadImage(photo, 10000);
        if (img) {
            cover(ctx, img, 0, 0, W, H);
            const veil = ctx.createLinearGradient(0, 0, 0, H);
            veil.addColorStop(0, 'rgba(0,0,0,0.55)');
            veil.addColorStop(0.45, 'rgba(0,0,0,0.25)');
            veil.addColorStop(1, 'rgba(0,0,0,0.85)');
            ctx.fillStyle = veil;
            ctx.fillRect(0, 0, W, H);
            return true;
        }
    }
    if (style === 'noche') {
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 2;
        for (let x = 60; x < W; x += 120) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }
        const glow = ctx.createRadialGradient(W * 0.8, H * 0.15, 20, W * 0.8, H * 0.15, 700);
        glow.addColorStop(0, alpha(pal.accent, 0.35));
        glow.addColorStop(1, alpha(pal.accent, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);
    }
    grain(ctx, H, style === 'papel' ? 0.16 : 0.08);
    return false;
};

const header = (ctx: CanvasRenderingContext2D, top: number, pal: Palette, league: string, right: string) => {
    logoMark(ctx, 80, top - 52, 72);
    ctx.fillStyle = pal.ink;
    ctx.font = font(800, 46);
    ctx.fillText('EL PLAY', 168, top);
    ctx.fillStyle = pal.muted;
    ctx.font = font(600, 30);
    ctx.textAlign = 'right';
    ctx.fillText(`${league}${right ? ` · ${right}` : ''}`, W - 80, top - 4);
    ctx.textAlign = 'left';
};

const footer = (ctx: CanvasRenderingContext2D, H: number, pal: Palette, site: string, bottomSafe: number) => {
    ctx.fillStyle = pal.muted;
    ctx.font = font(600, 28);
    ctx.textAlign = 'center';
    ctx.fillText(site, W / 2, H - bottomSafe);
    ctx.textAlign = 'left';
};

const pill = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, ink: string) => {
    ctx.font = font(800, size);
    const width = ctx.measureText(text).width + size * 1.4;
    const height = size * 1.9;
    roundRect(ctx, x, y, width, height, height / 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + size * 0.7, y + height / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    return { width, height };
};

// ------------------------------------------------------------------ plantillas

const drawResult = async (ctx: CanvasRenderingContext2D, data: ResultPost, H: number, opts: RenderOptions) => {
    const story = opts.format === 'story';
    // Color del ganador; en vivo, del que va arriba (empate: el local)
    const ahead = (data.away.score ?? 0) > (data.home.score ?? 0) ? data.away : data.home;
    const winner = data.home.isWinner ? data.home : data.away.isWinner ? data.away : ahead;
    let pal = palette(opts.style, winner.color, winner.color2);
    const hasPhoto = await background(ctx, H, pal, opts.style, opts.photo);
    if (hasPhoto) pal = { ...pal, ink: '#ffffff', muted: 'rgba(255,255,255,0.8)', panel: 'rgba(0,0,0,0.35)' };

    const top = story ? 240 : 130;
    header(ctx, top, pal, data.league, data.dateLabel);
    if (opts.style !== 'papel' && !hasPhoto) seams(ctx, W + 40, story ? 1180 : 820, 520, pal.seam, 7);
    if (opts.style === 'papel' && !hasPhoto) seams(ctx, W - 60, story ? 1350 : 950, 380, pal.seam, 6);

    let y = top + (story ? 120 : 70);
    pill(ctx, data.status, 80, y, story ? 34 : 30, pal.ink, opts.style === 'color' && !hasPhoto ? pal.bg : opts.style === 'papel' ? '#f2ead8' : '#0b0c10');
    y += story ? 130 : 100;

    const rowH = story ? 300 : 220;
    for (const team of [data.away, data.home]) {
        ctx.save();
        ctx.globalAlpha = team.isWinner || (!data.away.isWinner && !data.home.isWinner) ? 1 : 0.6;
        const logo = story ? 150 : 120;
        await teamBadge(ctx, team, 80, y + (rowH - logo) / 2 - 20, logo);
        ctx.fillStyle = pal.ink;
        const nameX = 80 + logo + 36;
        fitFont(ctx, team.name.toUpperCase(), W - nameX - 300, story ? 60 : 50, 800);
        ctx.fillText(team.name.toUpperCase(), nameX, y + rowH / 2 - 10);
        ctx.fillStyle = pal.muted;
        ctx.font = font(600, story ? 32 : 28);
        ctx.fillText(team.abbrev, nameX, y + rowH / 2 + 36);
        if (team.score !== null) {
            ctx.fillStyle = pal.ink;
            ctx.font = font(800, story ? 250 : 190, DISPLAY);
            ctx.textAlign = 'right';
            ctx.fillText(String(team.score), W - 80, y + rowH / 2 + (story ? 80 : 60));
            ctx.textAlign = 'left';
        }
        ctx.restore();
        y += rowH;
    }

    if (data.linescore?.length) {
        y += story ? 30 : 10;
        const innings = data.linescore.slice(0, 12);
        const cell = Math.min(64, (W - 160 - 120) / innings.length);
        ctx.font = font(600, story ? 28 : 26);
        ctx.fillStyle = pal.muted;
        innings.forEach((inning, index) => {
            ctx.textAlign = 'center';
            ctx.fillText(String(inning.n), 80 + 120 + cell * index + cell / 2, y);
        });
        const gap = story ? 52 : 46;
        ctx.font = font(700, story ? 34 : 30);
        for (const [rowIndex, side] of (['away', 'home'] as const).entries()) {
            ctx.textAlign = 'left';
            ctx.fillStyle = pal.muted;
            ctx.fillText(data[side].abbrev, 80, y + 52 + rowIndex * gap);
            ctx.fillStyle = pal.ink;
            innings.forEach((inning, index) => {
                ctx.textAlign = 'center';
                ctx.fillText(inning[side] === null ? '–' : String(inning[side]), 80 + 120 + cell * index + cell / 2, y + 52 + rowIndex * gap);
            });
        }
        ctx.textAlign = 'left';
        y += story ? 150 : 130;
    }

    if (data.keyPlay) {
        y += story ? 30 : 10;
        const boxH = story ? 260 : 210;
        roundRect(ctx, 80, y, W - 160, boxH, 36);
        ctx.fillStyle = pal.panel;
        ctx.fill();
        ctx.fillStyle = pal.muted;
        ctx.font = font(700, 28);
        ctx.fillText((data.keyPlayLabel || '').toUpperCase(), 120, y + 62);
        ctx.fillStyle = pal.ink;
        ctx.font = font(800, story ? 50 : 44);
        wrap(ctx, data.keyPlay, W - 240, 2).forEach((line, index) => ctx.fillText(line, 120, y + 124 + index * (story ? 58 : 52)));
        if (data.keyDetail) {
            ctx.fillStyle = pal.muted;
            ctx.font = font(600, 30);
            ctx.fillText(data.keyDetail, 120, y + boxH - 34);
        }
        y += boxH;
    }

    if (data.venue && y < H - (story ? 340 : 200)) {
        ctx.fillStyle = pal.muted;
        ctx.font = font(600, story ? 32 : 28);
        ctx.fillText(data.venue, 80, y + (story ? 90 : 70));
    }

    footer(ctx, H, pal, opts.labels.site, story ? 200 : 70);
};

const drawPlayer = async (ctx: CanvasRenderingContext2D, data: PlayerPost, H: number, opts: RenderOptions) => {
    const story = opts.format === 'story';
    let pal = palette(opts.style, data.color, data.color2);
    const hasPhoto = await background(ctx, H, pal, opts.style, opts.photo);
    if (hasPhoto) pal = { ...pal, ink: '#ffffff', muted: 'rgba(255,255,255,0.82)', panel: 'rgba(0,0,0,0.35)' };

    const top = story ? 240 : 130;
    header(ctx, top, pal, data.league, data.teamAbbrev);

    let y = top + (story ? 60 : 30);
    if (!hasPhoto) {
        // En historia, con 760 el detalle (p. ej. «46.1 IP · 34 K») caía encima del pie con la dirección
        const size = story ? 680 : 560;
        const cx = W / 2;
        const cy = y + size / 2 + 20;
        seams(ctx, cx, cy, size * 0.62, pal.seam, 9);
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
        ctx.fillStyle = opts.style === 'color' ? 'rgba(255,255,255,0.18)' : alpha(data.color, opts.style === 'papel' ? 0.18 : 0.28);
        ctx.fill();
        const photo = await loadPlayerPhoto(data);
        if (photo) {
            // Cuadrado centrado y un poco hacia arriba (las fotos de los equipos son verticales: la cara va arriba)
            const side = Math.min(photo.naturalWidth, photo.naturalHeight);
            const sxp = (photo.naturalWidth - side) / 2;
            const syp = (photo.naturalHeight - side) * 0.15;
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(photo, sxp, syp, side, side, cx - size / 2, cy - size / 2, size, size);
            ctx.restore();
        }
        y = cy + size / 2 + (story ? 40 : 10);
    } else {
        // Con foto propia el texto va abajo, para no tapar la cara
        const block = (story ? 640 : 470) - (data.detail ? 0 : story ? 120 : 100);
        y = H - (story ? 300 : 140) - block;
    }

    ctx.fillStyle = pal.ink;
    const valueSize = fitFont(ctx, data.value, W - 160, story ? 300 : 210, 800, DISPLAY, 90);
    ctx.textAlign = 'center';
    ctx.fillText(data.value, W / 2, y + valueSize * 0.82);
    y += valueSize * 0.82 + (story ? 30 : 16);

    ctx.fillStyle = pal.muted;
    ctx.font = font(800, story ? 40 : 34);
    ctx.fillText(data.label.toUpperCase().split('').join(' '), W / 2, y + 30);
    y += story ? 110 : 80;

    ctx.fillStyle = pal.ink;
    fitFont(ctx, data.name, W - 160, story ? 84 : 66, 900);
    ctx.fillText(data.name, W / 2, y);
    y += story ? 58 : 48;
    ctx.fillStyle = pal.muted;
    ctx.font = font(600, story ? 38 : 32);
    ctx.fillText(data.teamName, W / 2, y);
    ctx.textAlign = 'left';

    y += story ? 50 : 34;
    ctx.font = font(800, story ? 32 : 28);
    const contextWidth = ctx.measureText(data.context).width + (story ? 32 : 28) * 1.4;
    pill(ctx, data.context, (W - contextWidth) / 2, y, story ? 32 : 28, pal.ink, opts.style === 'color' && !hasPhoto ? data.color : opts.style === 'papel' ? '#f2ead8' : '#0b0c10');
    if (data.detail) {
        ctx.fillStyle = pal.muted;
        ctx.font = font(600, story ? 34 : 30);
        ctx.textAlign = 'center';
        ctx.fillText(data.detail, W / 2, y + (story ? 120 : 100));
        ctx.textAlign = 'left';
    }

    footer(ctx, H, pal, opts.labels.site, story ? 200 : 60);
};

const drawStandings = async (ctx: CanvasRenderingContext2D, data: StandingsPost, H: number, opts: RenderOptions) => {
    const story = opts.format === 'story';
    const leaderColor = data.rows[0]?.color || '#2563eb';
    let pal = palette(opts.style, leaderColor);
    const hasPhoto = await background(ctx, H, pal, opts.style, opts.photo);
    if (hasPhoto) pal = { ...pal, ink: '#ffffff', muted: 'rgba(255,255,255,0.8)', panel: 'rgba(0,0,0,0.35)' };

    const top = story ? 240 : 120;
    header(ctx, top, pal, data.league, '');
    let y = top + (story ? 170 : 120);
    ctx.fillStyle = pal.ink;
    fitFont(ctx, data.title.toUpperCase(), W - 160, story ? 120 : 96, 900);
    ctx.fillText(data.title.toUpperCase(), 80, y);
    y += story ? 60 : 50;
    ctx.fillStyle = pal.muted;
    ctx.font = font(600, story ? 36 : 30);
    ctx.fillText(data.subtitle, 80, y);
    y += story ? 70 : 44;

    const rows = data.rows.slice(0, 8);
    const rowH = Math.min(story ? 140 : 104, (H - y - (story ? 280 : 110)) / rows.length);
    rows.forEach((row, index) => {
        const ry = y + index * rowH;
        roundRect(ctx, 80, ry, W - 160, rowH - 16, 28);
        // El líder resalta: en estilo color (fondo ya es su color) con un panel claro; en los demás, con su color
        const leaderOnColor = index === 0 && opts.style === 'color' && !hasPhoto;
        const leaderFilled = index === 0 && !leaderOnColor;
        ctx.fillStyle = leaderOnColor ? 'rgba(255,255,255,0.22)' : leaderFilled ? row.color : pal.panel;
        ctx.fill();
        const mid = ry + (rowH - 16) / 2;
        const rowInk = leaderFilled ? inkOn(row.color) : pal.ink;
        ctx.fillStyle = rowInk;
        ctx.font = font(800, rowH * 0.42, DISPLAY);
        ctx.textBaseline = 'middle';
        ctx.fillText(String(row.rank), 116, mid + 2);
        ctx.beginPath();
        ctx.arc(220, mid, rowH * 0.24, 0, Math.PI * 2);
        ctx.fillStyle = row.color;
        ctx.fill();
        ctx.fillStyle = inkOn(row.color);
        ctx.font = font(800, rowH * 0.16);
        ctx.textAlign = 'center';
        ctx.fillText(row.abbrev, 220, mid + 1);
        ctx.textAlign = 'left';
        ctx.fillStyle = rowInk;
        fitFont(ctx, row.name, W - 640, rowH * 0.3, 800);
        ctx.fillText(row.name, 290, mid);
        ctx.font = font(800, rowH * 0.34, DISPLAY);
        ctx.textAlign = 'right';
        ctx.fillText(`${row.wins}-${row.losses}`, W - 230, mid + 2);
        ctx.font = font(600, rowH * 0.2);
        ctx.fillText(row.gamesBack === '-' ? '—' : row.gamesBack, W - 120, mid + 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    });

    footer(ctx, H, pal, opts.labels.site, story ? 200 : 60);
};

/** Dibuja el post y devuelve el canvas listo para exportar */
export const renderPost = async (data: PostData, opts: RenderOptions): Promise<HTMLCanvasElement> => {
    await ensureFonts();
    const H = opts.format === 'story' ? 1920 : 1350;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas no disponible');
    if (data.kind === 'result') await drawResult(ctx, data, H, opts);
    else if (data.kind === 'player') await drawPlayer(ctx, data, H, opts);
    else await drawStandings(ctx, data, H, opts);
    return canvas;
};

export const canvasToFile = (canvas: HTMLCanvasElement, name: string): Promise<File> =>
    new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(new File([blob], name, { type: 'image/png' })) : reject(new Error('no se pudo crear la imagen'))), 'image/png');
    });
