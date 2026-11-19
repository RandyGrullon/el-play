// Marcador flotante: el juego que escojas en una ventanita encima de todo, aunque cambies de pestaña o de app.
// Sigue abierto mientras navegas por El Play; el botón del juego en vivo la abre, la cambia a ese juego o la quita.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PictureInPicture2 } from 'lucide-react';
import type { GameDetail } from '../../types';
import { keys, refreshGame, useGameWithoutPolling } from '../../lib/queries';
import { gameInterval } from '../../lib/polling';
import { documentPip, floatMode, prepareFloatingWindow, videoFloats, type FloatMode } from '../../lib/floating';
import { drawFloatScene, FLOAT_CANVAS, floatScene } from '../../lib/floatingScore';
import { showToast } from '../../lib/toast';
import { Bases } from '../game/Bases';
import { TeamLogo } from '../ui/TeamLogo';

interface Floating {
    /** Cómo se puede flotar en este navegador (null: no se puede y el botón no sale) */
    mode: FloatMode | null;
    /** El juego que está flotando */
    gamePk: string | null;
    open: (gamePk: string) => Promise<void>;
    close: () => void;
}

const FloatingContext = createContext<Floating>({ mode: null, gamePk: null, open: async () => undefined, close: () => undefined });
export const useFloating = () => useContext(FloatingContext);

/** Tamaño con que abre la ventana (se puede agrandar): el marcador se escala con ella */
const WINDOW_SIZE = { width: 340, height: 200 };

/**
 * Reloj propio del marcador flotante: con la pestaña escondida el de la página se detiene (y Chrome espacia sus
 * temporizadores), así que se usan los de la ventana flotante, que siempre está a la vista
 */
const useFloatingPoll = (gamePk: string, timers: Window) => {
    const client = useQueryClient();
    useEffect(() => {
        let timer = 0;
        let stopped = false;
        const next = () => {
            if (stopped) return;
            const wait = gameInterval(client.getQueryData<GameDetail>(keys.game(gamePk)));
            if (wait === false) return; // terminó: ya no cambia
            timer = timers.setTimeout(() => {
                refreshGame(client, gamePk)
                    .catch(() => undefined)
                    .finally(next);
            }, wait);
        };
        next();
        return () => {
            stopped = true;
            timers.clearTimeout(timer);
        };
    }, [client, gamePk, timers]);
};

const Arrow: React.FC<{ up: boolean; size: number }> = ({ up, size }) => (
    <svg viewBox="0 0 12 8" width={size} height={(size * 8) / 12} className={`text-live ${up ? '' : 'rotate-180'}`} aria-hidden="true">
        <path d="M6 0 12 8H0z" fill="currentColor" />
    </svg>
);

/** Lo que se ve en la ventana flotante (Chrome y Edge de computadora) */
export const FloatingWindowScore: React.FC<{ gamePk: string; win: Window }> = ({ gamePk, win }) => {
    const { t, i18n } = useTranslation();
    const { data: game } = useGameWithoutPolling(gamePk);
    useFloatingPoll(gamePk, win);
    const [size, setSize] = useState({ width: win.innerWidth || WINDOW_SIZE.width, height: win.innerHeight || WINDOW_SIZE.height });
    useEffect(() => {
        const onResize = () => setSize({ width: win.innerWidth, height: win.innerHeight });
        win.addEventListener('resize', onResize);
        return () => win.removeEventListener('resize', onResize);
    }, [win]);
    useEffect(() => {
        if (game) win.document.title = `${game.away.abbrev} ${game.away.runs}-${game.home.runs} ${game.home.abbrev} · El Play`;
    }, [win, game]);

    if (!game) return <div className="flex h-screen items-center justify-center text-sm font-semibold text-muted">{t('floating.loading')}</div>;

    const scene = floatScene(game, t, i18n.language);
    // Una unidad = ventana de 340 × 200: todo crece o se achica con la ventana
    const u = Math.max(0.7, Math.min(size.height / WINDOW_SIZE.height, size.width / WINDOW_SIZE.width));
    const px = (value: number) => `${value * u}px`;
    const teams = [
        { side: 'away' as const, team: game.away, score: scene.away },
        { side: 'home' as const, team: game.home, score: scene.home }
    ];

    return (
        <div className="flex h-screen select-none flex-col bg-bg text-ink" style={{ padding: px(10), gap: px(7) }}>
            <div className="flex min-h-0 flex-1" style={{ gap: px(7) }}>
                <div className="flex min-w-0 flex-1 flex-col" style={{ gap: px(7) }}>
                    {teams.map(({ side, team, score }) => (
                        <div
                            key={side}
                            className="flex min-h-0 flex-1 items-center bg-surface shadow-card"
                            style={{ borderRadius: px(14), borderLeft: `${px(6)} solid ${team.color}`, paddingLeft: px(9), paddingRight: px(12), gap: px(8) }}
                        >
                            <TeamLogo team={team} size={28 * u} loading="eager" />
                            <span className="min-w-0 flex-1 truncate font-condensed font-extrabold leading-none" style={{ fontSize: px(28) }}>
                                {score.abbrev}
                            </span>
                            <span className="font-condensed font-extrabold leading-none tabular-nums" style={{ fontSize: px(40) }}>
                                {score.runs}
                            </span>
                        </div>
                    ))}
                </div>
                <div className="flex shrink-0 flex-col items-center justify-center bg-surface shadow-card" style={{ width: px(92), borderRadius: px(14), gap: px(5) }}>
                    {scene.final || !scene.inning ? (
                        <span className="whitespace-nowrap text-center font-condensed font-extrabold leading-none" style={{ fontSize: px(scene.finalText.length > 5 ? 21 : 26) }}>
                            {scene.final ? scene.finalText : '—'}
                        </span>
                    ) : (
                        <>
                            <span className="flex items-center font-condensed font-extrabold leading-none tabular-nums" style={{ fontSize: px(28), gap: px(5) }}>
                                {(scene.inning.half === 'Top' || scene.inning.half === 'Bottom') && <Arrow up={scene.inning.half === 'Top'} size={11 * u} />}
                                {scene.inning.n}
                            </span>
                            <span className="font-extrabold uppercase leading-none tracking-[0.08em] text-muted" style={{ fontSize: px(8.5) }}>
                                {scene.inning.text}
                            </span>
                            <Bases runners={game.runners} color={scene.battingColor} size={46 * u} />
                            <span className="flex items-center" style={{ gap: px(6) }}>
                                <span className="font-condensed font-extrabold leading-none tabular-nums" style={{ fontSize: px(17) }}>
                                    {scene.count ?? '—'}
                                </span>
                                <span className="flex" style={{ gap: px(3) }} aria-label={`${scene.outs} outs`}>
                                    {[0, 1, 2].map((index) => (
                                        <span key={index} className={`rounded-full ${index < scene.outs ? 'bg-ink' : 'bg-line/20'}`} style={{ width: px(6), height: px(6) }} />
                                    ))}
                                </span>
                            </span>
                        </>
                    )}
                </div>
            </div>
            {(scene.line || scene.last) && (
                <div className="min-w-0 leading-tight" style={{ paddingLeft: px(3), paddingRight: px(3) }}>
                    {scene.line && (
                        <p className="truncate font-bold" style={{ fontSize: px(12) }}>
                            {scene.line}
                        </p>
                    )}
                    {scene.last && (
                        <p className="truncate font-semibold text-muted" style={{ fontSize: px(10.5) }}>
                            {scene.last}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

/** Donde solo flotan videos: el marcador se pinta en el lienzo que alimenta el video */
const FloatingVideo: React.FC<{ gamePk: string; canvas: HTMLCanvasElement }> = ({ gamePk, canvas }) => {
    const { t, i18n } = useTranslation();
    const { data: game } = useGameWithoutPolling(gamePk);
    useFloatingPoll(gamePk, window);
    const scene = useMemo(() => (game ? floatScene(game, t, i18n.language) : null), [game, t, i18n.language]);
    useEffect(() => {
        const ctx = canvas.getContext('2d');
        if (!ctx || !scene) return;
        const paint = () => drawFloatScene(ctx, scene);
        paint();
        // Cada segundo aunque nada cambie: así el video sigue recibiendo cuadros
        const timer = window.setInterval(paint, 1000);
        return () => window.clearInterval(timer);
    }, [canvas, scene]);
    return null;
};

export const FloatingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { t, i18n } = useTranslation();
    const client = useQueryClient();
    const [mode, setMode] = useState(floatMode);
    const [gamePk, setGamePk] = useState<string | null>(null);
    const [win, setWin] = useState<Window | null>(null);
    const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
    const cleanup = useRef<() => void>(() => undefined);

    // Se cerró (por el botón, por la X de la ventana o al salir del video flotante)
    const finish = useCallback(() => {
        cleanup.current();
        cleanup.current = () => undefined;
        setWin(null);
        setCanvas(null);
        setGamePk(null);
    }, []);
    useEffect(() => () => cleanup.current(), []);

    const open = useCallback(
        async (next: string) => {
            // Ya está abierta: solo cambia de juego
            if (win || canvas) {
                setGamePk(next);
                return;
            }
            let tryVideo = mode === 'video';
            try {
                if (mode === 'window') {
                    let pip: Window | null = null;
                    try {
                        pip = await documentPip()!.requestWindow(WINDOW_SIZE);
                    } catch (error) {
                        // Navegadores que tienen la función pero no abren la ventana (algunos integrados en otras apps):
                        // se intenta con el video y, si tampoco, el botón deja de salir
                        if ((error as Error)?.name === 'NotAllowedError') throw error;
                        const fallback = videoFloats() ? 'video' : null;
                        setMode(fallback);
                        if (!fallback) throw error;
                        tryVideo = true;
                    }
                    if (pip) {
                        const stopMirror = prepareFloatingWindow(pip, 'El Play');
                        pip.document.body.style.margin = '0';
                        pip.document.body.style.overflow = 'hidden';
                        pip.addEventListener('pagehide', finish, { once: true });
                        cleanup.current = stopMirror;
                        setWin(pip);
                        setGamePk(next);
                    }
                }
                if (tryVideo) {
                    const sheet = document.createElement('canvas');
                    sheet.width = FLOAT_CANVAS.width;
                    sheet.height = FLOAT_CANVAS.height;
                    const ctx = sheet.getContext('2d');
                    const cached = client.getQueryData<GameDetail>(keys.game(next));
                    // El video necesita un primer cuadro para arrancar
                    if (ctx && cached) drawFloatScene(ctx, floatScene(cached, t, i18n.language));
                    else if (ctx) {
                        ctx.fillStyle = '#0b0c10';
                        ctx.fillRect(0, 0, sheet.width, sheet.height);
                    }
                    const stream = sheet.captureStream();
                    const video = document.createElement('video');
                    video.muted = true;
                    video.playsInline = true;
                    video.srcObject = stream;
                    Object.assign(video.style, { position: 'fixed', left: '0', bottom: '0', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none' });
                    document.body.appendChild(video);
                    const drop = () => {
                        stream.getTracks().forEach((track) => track.stop());
                        video.remove();
                    };
                    try {
                        await video.play();
                        await video.requestPictureInPicture();
                    } catch (error) {
                        drop();
                        throw error;
                    }
                    video.addEventListener('leavepictureinpicture', finish, { once: true });
                    cleanup.current = drop;
                    setCanvas(sheet);
                    setGamePk(next);
                }
            } catch {
                showToast(t('floating.failed'));
            }
        },
        [win, canvas, mode, client, t, i18n.language, finish]
    );

    const close = useCallback(() => {
        if (win) {
            win.close();
            finish();
        } else if (canvas && document.pictureInPictureElement) {
            document.exitPictureInPicture().catch(() => undefined).finally(finish);
        } else finish();
    }, [win, canvas, finish]);

    const value = useMemo(() => ({ mode, gamePk, open, close }), [mode, gamePk, open, close]);

    return (
        <FloatingContext.Provider value={value}>
            {children}
            {win && gamePk && createPortal(<FloatingWindowScore gamePk={gamePk} win={win} />, win.document.body)}
            {canvas && gamePk && <FloatingVideo gamePk={gamePk} canvas={canvas} />}
        </FloatingContext.Provider>
    );
};

/** Botón del juego en vivo: abre la ventana flotante, la pasa a este juego o la quita. No sale si no se puede. */
export const FloatingButton: React.FC<{ gamePk: number | null; className?: string }> = ({ gamePk, className = '' }) => {
    const { t } = useTranslation();
    const { mode, gamePk: current, open, close } = useFloating();
    if (!mode || !gamePk) return null;
    const mine = current === String(gamePk);
    const label = mine ? t('floating.close') : current ? t('floating.switch') : t('floating.open');
    return (
        <div className={className}>
            <button
                type="button"
                onClick={() => (mine ? close() : open(String(gamePk)))}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-surface text-sm font-bold shadow-card"
            >
                <PictureInPicture2 className="h-4 w-4" />
                {label}
            </button>
        </div>
    );
};
