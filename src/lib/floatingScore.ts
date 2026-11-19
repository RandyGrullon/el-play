// Lo que muestra el marcador flotante (igual en la ventana y en el video) y cómo se dibuja en el lienzo del video
import type { TFunction } from 'i18next';
import type { GameDetail } from '../types';
import { eventName, finalLabel, inningBreak } from './baseball';
import { surname } from './format';

type Half = 'Top' | 'Bottom' | 'Middle' | 'End';

export interface FloatScene {
    away: { abbrev: string; runs: number; color: string };
    home: { abbrev: string; runs: number; color: string };
    final: boolean;
    /** «Final» o «Final/10» */
    finalText: string;
    inning: { n: number; half: Half; text: string } | null;
    /** Entre mitades no hay conteo */
    between: boolean;
    count: string | null;
    outs: number;
    /** Primera, segunda y tercera */
    bases: [boolean, boolean, boolean];
    /** Color del que batea (las bases ocupadas) */
    battingColor: string;
    /** «Batea Pérez · Lanza Gómez» o, en la pausa, quién abre la otra mitad */
    line: string | null;
    /** La última jugada: «Sencillo · Pérez» */
    last: string | null;
}

export const floatScene = (game: GameDetail, t: TFunction, lang: string): FloatScene => {
    const final = game.state === 'final';
    const pause = inningBreak(game);
    const state = game.inning?.state;
    const half: Half = state === 'Middle' || state === 'End' ? state : game.inning?.isTop ? 'Top' : 'Bottom';
    const between = !!pause || half === 'Middle' || half === 'End';
    const batting = game.inning?.isTop ? game.away : game.home;
    const leadoff = pause?.dueUp[0] ?? null;

    let line: string | null = null;
    if (!final && pause) line = leadoff ? t('floating.leadsOff', { name: surname(leadoff.name), team: pause.next.abbrev }) : t('zone.breakStatus');
    else if (!final && game.matchup) line = t('floating.matchup', { batter: surname(game.matchup.batter.name), pitcher: surname(game.matchup.pitcher.name) });

    const lastPlay = [...game.atBats].reverse().find((atBat) => atBat.complete && (atBat.eventLabel || atBat.event));

    return {
        away: { abbrev: game.away.abbrev, runs: game.away.runs ?? 0, color: game.away.color },
        home: { abbrev: game.home.abbrev, runs: game.home.runs ?? 0, color: game.home.color },
        final,
        finalText: finalLabel(game.linescore.length, game.scheduledInnings, lang),
        inning: game.inning?.n ? { n: game.inning.n, half, text: t(`game.half.${half}`) } : null,
        between,
        count: between ? null : `${game.count.balls}-${game.count.strikes}`,
        outs: Math.min(3, game.count.outs),
        bases: [!!game.runners.first, !!game.runners.second, !!game.runners.third],
        battingColor: (pause ? pause.next : batting).color,
        line,
        last: lastPlay ? `${eventName(lastPlay, lang)} · ${surname(lastPlay.batter.name)}` : null
    };
};

// ------------------------------------------------------------------ Lienzo del video (cuando solo flotan videos)

export const FLOAT_CANVAS = { width: 800, height: 450 };

const BG = '#0b0c10';
const SURFACE = '#16181f';
const INK = '#f1f2f6';
const MUTED = '#9a9fb0';
const FAINT = '#3a3e4b';
const LIVE = '#ff3b5c';
const BIG = "'Barlow Condensed', Outfit, sans-serif";
const TEXT = "Outfit, system-ui, -apple-system, 'Segoe UI', sans-serif";

const box = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
};

/** Corta el texto con «…» si no cabe */
const fit = (ctx: CanvasRenderingContext2D, text: string, max: number) => {
    if (ctx.measureText(text).width <= max) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}…`;
};

export const drawFloatScene = (ctx: CanvasRenderingContext2D, scene: FloatScene) => {
    const { width: W, height: H } = FLOAT_CANVAS;
    const pad = 28;
    ctx.clearRect(0, 0, W, H);
    const rowW = 520;
    const rowH = 140;
    const gap = 16;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'middle';

    // Los dos equipos: franja de su color, sigla y carreras
    [scene.away, scene.home].forEach((team, index) => {
        const y = pad + index * (rowH + gap);
        ctx.save();
        box(ctx, pad, y, rowW, rowH, 28);
        ctx.fillStyle = SURFACE;
        ctx.fill();
        ctx.clip();
        ctx.fillStyle = team.color;
        ctx.fillRect(pad, y, 22, rowH);
        ctx.restore();
        ctx.fillStyle = INK;
        ctx.textAlign = 'left';
        ctx.font = `800 96px ${BIG}`;
        ctx.fillText(team.abbrev, pad + 52, y + rowH / 2 + 4);
        ctx.textAlign = 'right';
        ctx.font = `800 120px ${BIG}`;
        ctx.fillText(String(team.runs), pad + rowW - 36, y + rowH / 2 + 6);
    });

    // A la derecha: entrada, bases, conteo y outs
    const px = pad + rowW + gap;
    const pw = W - px - pad;
    const ph = rowH * 2 + gap;
    const cx = px + pw / 2;
    box(ctx, px, pad, pw, ph, 28);
    ctx.fillStyle = SURFACE;
    ctx.fill();
    ctx.textAlign = 'center';
    if (scene.final || !scene.inning) {
        // «Final/10» no cabe tan grande como «Final»: se achica la letra hasta que quepa
        const text = scene.final ? scene.finalText : '—';
        let size = 64;
        ctx.font = `800 ${size}px ${BIG}`;
        while (size > 28 && ctx.measureText(text).width > pw - 28) {
            size -= 4;
            ctx.font = `800 ${size}px ${BIG}`;
        }
        ctx.fillStyle = INK;
        ctx.fillText(fit(ctx, text, pw - 24), cx, pad + ph / 2);
    } else {
        const n = String(scene.inning.n);
        ctx.font = `800 80px ${BIG}`;
        const numberWidth = ctx.measureText(n).width;
        const top = scene.inning.half === 'Top';
        if (top || scene.inning.half === 'Bottom') {
            // Flecha arriba en la alta, abajo en la baja (como en la cabecera del juego)
            const ax = cx - numberWidth / 2 - 30;
            const ay = pad + 66;
            ctx.fillStyle = LIVE;
            ctx.beginPath();
            ctx.moveTo(ax, top ? ay - 10 : ay + 10);
            ctx.lineTo(ax + 13, top ? ay + 10 : ay - 10);
            ctx.lineTo(ax - 13, top ? ay + 10 : ay - 10);
            ctx.closePath();
            ctx.fill();
        }
        ctx.fillStyle = INK;
        ctx.fillText(n, cx, pad + 68);
        ctx.fillStyle = MUTED;
        ctx.font = `800 24px ${TEXT}`;
        ctx.fillText(scene.inning.text.toUpperCase(), cx, pad + 122);

        // Bases: segunda arriba, primera a la derecha, tercera a la izquierda
        const base = (x: number, y: number, on: boolean) => {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.PI / 4);
            box(ctx, -17, -17, 34, 34, 5);
            if (on) {
                ctx.fillStyle = scene.battingColor;
                ctx.fill();
            }
            ctx.lineWidth = 4;
            ctx.strokeStyle = on ? INK : FAINT;
            ctx.stroke();
            ctx.restore();
        };
        const by = pad + 186;
        base(cx, by - 26, scene.bases[1]);
        base(cx + 42, by + 16, scene.bases[0]);
        base(cx - 42, by + 16, scene.bases[2]);

        const ry = pad + ph - 34;
        ctx.fillStyle = INK;
        ctx.font = `800 48px ${BIG}`;
        ctx.textAlign = 'center';
        ctx.fillText(scene.count ?? '—', cx - 44, ry + 2);
        for (let index = 0; index < 3; index += 1) {
            ctx.beginPath();
            ctx.arc(cx + 18 + index * 26, ry, 9, 0, Math.PI * 2);
            ctx.fillStyle = index < scene.outs ? INK : FAINT;
            ctx.fill();
        }
    }

    // Abajo: el duelo (o quién abre) y la última jugada
    const textX = pad + 6;
    const textW = W - pad * 2 - 12;
    const lineY = pad + ph + 36;
    ctx.textAlign = 'left';
    if (scene.line) {
        ctx.fillStyle = INK;
        ctx.font = `700 32px ${TEXT}`;
        ctx.fillText(fit(ctx, scene.line, textW), textX, lineY);
    }
    if (scene.last) {
        ctx.fillStyle = MUTED;
        ctx.font = `600 26px ${TEXT}`;
        ctx.fillText(fit(ctx, scene.last, textW), textX, scene.line ? lineY + 44 : lineY);
    }
};
