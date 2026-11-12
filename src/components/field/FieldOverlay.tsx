import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { GameDetail, GameTeam } from '../../types';
import { useGame } from '../../lib/queries';
import { delayOf, inningName } from '../../lib/baseball';
import { surname } from '../../lib/format';
import { playerPath } from '../../lib/links';
import { DEFENSE_ORDER, FIELD_H, FIELD_W, SPOTS, SPOT_TAG, fieldFaces, fieldNote, flipTransform, toPercent, type FieldFace } from '../../lib/field';
import { usePreferences } from '../../store/preferences';
import { prefersReducedMotion } from '../../hooks/useReducedMotion';
import { inkOn } from '../gamecast/GameHero';
import { PlayerPhoto } from '../ui/PlayerPhoto';
import { PlayerLink } from '../ui/PlayerLink';
import { TeamLogo } from '../ui/TeamLogo';
import { ErrorState } from '../ui/States';
import { pushModalLayer } from '../ui/BottomSheet';
import { OutsDots } from '../game/Bases';
import { DelayPill } from '../game/Delay';
import { FieldDrawing } from './FieldDrawing';
import { FIELD_BACK, type FieldBack } from './FieldView';

// El terreno con las caras de los que están en juego. Abre saliendo del diamante que se tocó (FLIP: se mide el
// diamante y el panel crece desde ahí con un resorte) y las caras van saliendo una tras otra; al cerrar vuelve al
// diamante. Cierra con la X, tocando fuera, con Escape o con «atrás» del navegador (al abrir se pone una entrada en el
// historial). Con las animaciones apagadas o «menos movimiento» solo aparece y desaparece.

const OPEN_MS = 460;
const CLOSE_MS = 320;
const STAGGER_MS = 50;
const SPRING = 'cubic-bezier(0.22, 1.3, 0.36, 1)';
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Quién defiende y quién batea (de los ids del terreno; si faltan, de la entrada) */
const teamsOf = (game: GameDetail): { defense: GameTeam; offense: GameTeam } => {
    const id = game.field?.defenseTeamId;
    const state = game.inning?.state;
    const homeDefends = id != null ? id === game.home.id : state === 'Middle' ? false : state === 'End' ? true : !!game.inning?.isTop;
    return homeDefends ? { defense: game.home, offense: game.away } : { defense: game.away, offense: game.home };
};

/** Ancho del terreno en pantalla (sin la transformación de la animación): de ahí sale el tamaño de las caras */
const useFieldWidth = (ref: React.RefObject<HTMLDivElement | null>) => {
    const [width, setWidth] = useState(360);
    useLayoutEffect(() => {
        const node = ref.current;
        if (!node) return;
        const measure = () => {
            if (node.offsetWidth > 0) setWidth(node.offsetWidth);
        };
        measure();
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(measure);
            observer.observe(node);
            return () => observer.disconnect();
        }
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [ref]);
    return width;
};

const trapFocus = (event: KeyboardEvent, root: HTMLElement | null) => {
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((item) => item.getAttribute('aria-hidden') !== 'true');
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !root.contains(active))) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && (active === last || !root.contains(active))) {
        event.preventDefault();
        first.focus();
    }
};

const TeamScore: React.FC<{ team: GameTeam; end?: boolean }> = ({ team, end }) => (
    <div className={`flex min-w-0 items-center gap-2.5 ${end ? 'flex-row-reverse text-right' : ''}`}>
        <TeamLogo team={team} size={36} loading="eager" />
        <div className="min-w-0">
            <div className="truncate text-xs font-bold text-muted">{team.abbrev}</div>
            <div className="text-[28px] font-extrabold leading-none tabular-nums">{team.runs}</div>
        </div>
    </div>
);

const Legend: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
    <span className="pill bg-raised text-ink">
        <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white/70" style={{ background: color }} aria-hidden="true" />
        {children}
    </span>
);

const Header: React.FC<{ game: GameDetail; defense: GameTeam; offense: GameTeam }> = ({ game, defense, offense }) => {
    const { t, i18n } = useTranslation();
    const between = game.inning?.state === 'Middle' || game.inning?.state === 'End';
    const delay = delayOf(game.detailedState);
    return (
        <div className="card p-3.5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <TeamScore team={game.away} />
                <div className="text-center">
                    <div className="whitespace-nowrap text-[15px] font-extrabold">{inningName(game.inning, i18n.language) || '—'}</div>
                    <div className="mt-1.5 flex items-center justify-center gap-2">
                        <OutsDots outs={game.count.outs} />
                        <span className="text-sm font-bold tabular-nums" aria-label={t('game.countAria', { balls: game.count.balls, strikes: game.count.strikes, outs: game.count.outs })}>
                            {between ? '—' : `${game.count.balls}-${game.count.strikes}`}
                        </span>
                    </div>
                </div>
                <TeamScore team={game.home} end />
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                <Legend color={defense.color}>{t('field.defense', { team: defense.teamName || defense.abbrev })}</Legend>
                <Legend color={offense.color}>{t('field.offense', { team: offense.teamName || offense.abbrev })}</Legend>
                {delay && <DelayPill delay={delay} />}
            </div>
        </div>
    );
};

interface FaceProps {
    face: FieldFace;
    px: number;
    team: GameTeam;
    batting: GameTeam;
    label: string;
    tag: string;
    animation: string;
    delay: number;
    nameWidth: number;
    small: boolean;
    onGo: (event: React.MouseEvent<HTMLAnchorElement>, id: number) => void;
}

const Face: React.FC<FaceProps> = ({ face, px, team, batting, label, tag, animation, delay, nameWidth, small, onGo }) => {
    const offense = face.side === 'offense';
    const tagStyle = offense ? { background: batting.color, color: inkOn(batting.color) } : { background: '#14151a', color: '#ffffff' };
    const body = (
        <span className={`flex flex-col items-center ${animation}`} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
            <span className="relative block rounded-full p-[3px] shadow-[0_6px_14px_rgb(0_0_0/0.35)] ring-2 ring-white/85 transition-transform duration-150 group-hover:scale-105" style={{ background: team.color }}>
                {/* Fondo claro debajo: las iniciales (sin foto) van en el color del equipo sobre un tinte, no sobre el aro */}
                <span className="block rounded-full bg-surface">
                    <PlayerPhoto personId={face.person.id || null} name={face.person.name} size={px} background="rgb(var(--surface))" team={{ id: team.id, color: team.color }} className="block" />
                </span>
                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-px text-[9px] font-extrabold leading-tight tracking-wide shadow-card" style={tagStyle}>
                    {tag}
                </span>
            </span>
            <span className={`mt-2.5 truncate rounded-full bg-black/55 px-1.5 py-px font-extrabold leading-tight text-white ${small ? 'text-[10px]' : 'text-[11px]'}`} style={{ maxWidth: nameWidth }}>
                {surname(face.person.name)}
            </span>
        </span>
    );
    return (
        <div className="absolute z-[1]" style={{ ...toPercent(face), transform: `translate(-50%, -${px / 2 + 3}px)` }} data-spot={face.spot}>
            {face.person.id ? (
                <PlayerLink id={face.person.id} label={label} onClick={(event) => onGo(event, face.person.id)} className="group block rounded-2xl hover:no-underline">
                    {body}
                </PlayerLink>
            ) : (
                <span role="img" aria-label={label} className="block">
                    {body}
                </span>
            )}
        </div>
    );
};

interface FieldOverlayProps {
    gamePk: number;
    origin: HTMLElement | null;
    onLeave?: () => void;
    /** Vuelve a abrir sobre su entrada del historial (al volver «atrás» desde un pelotero) */
    historyToken?: string;
    onClosed: () => void;
}

const FieldOverlay: React.FC<FieldOverlayProps> = ({ gamePk, origin, onLeave, historyToken, onClosed }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const { playAnimations } = usePreferences();
    // Se decide al abrir: con animaciones apagadas o «menos movimiento», solo un fundido
    const [motion] = useState(() => playAnimations && !prefersReducedMotion());
    const query = useGame(String(gamePk));
    const game = query.data;

    const dialog = useRef<HTMLDivElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const backdrop = useRef<HTMLDivElement>(null);
    const fieldRef = useRef<HTMLDivElement>(null);
    const closeButton = useRef<HTMLButtonElement>(null);
    const closing = useRef(false);
    const finished = useRef(false);
    const pushed = useRef(false);
    const token = useRef(historyToken ?? `field-${gamePk}-${Date.now()}`);
    const openedAt = useRef(Date.now());
    const onClosedRef = useRef(onClosed);
    onClosedRef.current = onClosed;
    const width = useFieldWidth(fieldRef);

    const finish = useCallback(() => {
        if (finished.current) return;
        finished.current = true;
        onClosedRef.current();
    }, []);

    /** La animación de salida (de vuelta al diamante si sigue en pantalla) y después se desmonta */
    const animateClose = useCallback(() => {
        if (closing.current) return;
        closing.current = true;
        const node = panel.current;
        if (!node || typeof node.animate !== 'function') return finish();
        node.style.pointerEvents = 'none';
        node.getAnimations?.().forEach((animation) => animation.cancel());
        const rect = motion && origin?.isConnected ? origin.getBoundingClientRect() : null;
        backdrop.current?.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: motion ? CLOSE_MS : 160, easing: 'ease-in', fill: 'forwards' });
        let animation: Animation;
        if (rect && rect.width > 0) {
            const to = flipTransform(rect, node.getBoundingClientRect());
            animation = node.animate(
                [{ transform: 'none', opacity: 1 }, { opacity: 1, offset: 0.6 }, { transform: to.transform, opacity: 0, borderRadius: `${to.radius}px` }],
                { duration: CLOSE_MS, easing: 'cubic-bezier(0.5, 0, 0.75, 0.2)', fill: 'forwards' }
            );
        } else {
            animation = node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
        }
        animation.onfinish = finish;
        window.setTimeout(finish, CLOSE_MS + 300);
    }, [finish, motion, origin]);

    /** X, fondo y Escape: se vuelve atrás en el historial (lo que cierra el panel), si la entrada sigue siendo la nuestra */
    const requestClose = useCallback(() => {
        if (closing.current) return;
        if (pushed.current && window.history.state?.elPlayField === token.current) {
            window.history.back();
            // Por si el navegador no avisa del «atrás»
            window.setTimeout(() => {
                pushed.current = false;
                animateClose();
            }, 450);
            return;
        }
        animateClose();
    }, [animateClose]);
    const requestCloseRef = useRef(requestClose);
    requestCloseRef.current = requestClose;

    // Entrada en el historial: «atrás» cierra el panel en vez de salir de la página (sin repetirla en StrictMode)
    useEffect(() => {
        try {
            if (window.history.state?.elPlayField !== token.current) window.history.pushState({ ...(window.history.state || {}), elPlayField: token.current }, '');
            pushed.current = true;
        } catch {
            pushed.current = false;
        }
        const onPop = () => {
            if (pushed.current && window.history.state?.elPlayField !== token.current) {
                pushed.current = false;
                animateClose();
            }
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, [animateClose]);

    // Escape (solo si es la capa de arriba), foco atrapado adentro, sin desplazar la página de atrás
    useEffect(() => {
        const layer = pushModalLayer();
        const previous = document.activeElement as HTMLElement | null;
        closeButton.current?.focus({ preventScroll: true });
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (event: KeyboardEvent) => {
            if (!layer.isTop()) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                requestCloseRef.current();
            } else if (event.key === 'Tab') trapFocus(event, dialog.current);
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            layer.remove();
            document.body.style.overflow = overflow;
            const back = origin?.isConnected ? origin : previous;
            back?.focus?.({ preventScroll: true });
        };
    }, [origin]);

    // Entrada: el panel sale del diamante tocado con un resorte y el fondo se oscurece
    useLayoutEffect(() => {
        const node = panel.current;
        if (!node || typeof node.animate !== 'function') return;
        const rect = motion && origin?.isConnected ? origin.getBoundingClientRect() : null;
        const fade = backdrop.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: motion ? 320 : 180, easing: 'ease-out', fill: 'backwards' });
        let animation: Animation;
        if (rect && rect.width > 0) {
            const from = flipTransform(rect, node.getBoundingClientRect());
            const radius = getComputedStyle(node).borderRadius || '0px';
            animation = node.animate(
                [{ transform: from.transform, opacity: 0, borderRadius: `${from.radius}px` }, { opacity: 1, offset: 0.28 }, { transform: 'none', opacity: 1, borderRadius: radius }],
                { duration: OPEN_MS, easing: SPRING, fill: 'backwards' }
            );
        } else {
            animation = node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out', fill: 'backwards' });
        }
        return () => {
            animation.cancel();
            fade?.cancel();
        };
    }, [motion, origin]);

    // A la página del pelotero: el panel se cierra sin volver al diamante y su entrada del historial se queda marcada,
    // así «atrás» desde el pelotero vuelve con el terreno abierto (FieldViewProvider lo abre otra vez)
    const goTo = (event: React.MouseEvent<HTMLAnchorElement>, id: number) => {
        event.preventDefault();
        closing.current = true;
        if (pushed.current && window.history.state?.elPlayField === token.current) {
            try {
                const back: FieldBack = { gamePk, path: location.pathname };
                window.history.replaceState({ ...window.history.state, [FIELD_BACK]: back }, '');
            } catch {
                // Sin poder marcarla, «atrás» vuelve a la página sin el terreno
            }
        }
        pushed.current = false;
        onLeave?.();
        navigate(playerPath(id));
        finish();
    };

    // Las caras salen una tras otra (40-60 ms) cuando el panel ya creció; las que llegan después (otro bateador), de una
    const delays = useRef(new Map<string, number>());
    const firstFacesAt = useRef<number | null>(null);
    const delayFor = (key: string, index: number) => {
        if (!motion) return 0;
        let value = delays.current.get(key);
        if (value === undefined) {
            const now = Date.now();
            if (firstFacesAt.current === null) firstFacesAt.current = now;
            const base = Math.max(60, OPEN_MS - 160 - (now - openedAt.current));
            value = now - firstFacesAt.current < 300 ? base + index * STAGGER_MS : 0;
            delays.current.set(key, value);
        }
        return value;
    };

    // Las caras crecen con el terreno (sin taparse entre ellas: probado de 350 a 540 px de ancho)
    const large = Math.round(Math.min(58, Math.max(28, width * 0.1)));
    const nameWidth = Math.round(Math.min(96, Math.max(52, width * 0.19)));
    const sizes = { lg: large, md: Math.round(large * 0.9), sm: Math.round(large * 0.76) };
    const teams = game ? teamsOf(game) : null;
    const faces = game ? fieldFaces({ field: game.field, batSide: game.matchup?.batter.side, pitcherHand: game.matchup?.pitcher.hand, homeId: game.home.id }) : [];
    const note = game ? fieldNote(game) : null;
    const tagOf = (face: FieldFace) => SPOT_TAG[face.spot] ?? (face.spot === 'batter' ? t('field.atBat') : t('field.onDeck'));

    return createPortal(
        <div ref={dialog} className="fixed inset-0 z-[55] flex justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={t('field.title')}>
            <div ref={backdrop} className="absolute inset-0 bg-[rgb(8_10_14/0.55)] backdrop-blur-[6px]" onClick={requestClose} aria-hidden="true" />
            <div
                ref={panel}
                className="relative flex h-full w-full flex-col overflow-y-auto overscroll-contain bg-bg px-3 pb-[calc(16px+env(safe-area-inset-bottom))] pt-[calc(10px+env(safe-area-inset-top))] shadow-float sm:h-auto sm:max-h-[94dvh] sm:max-w-[560px] sm:rounded-[28px] sm:px-4 sm:pb-4 sm:pt-3"
            >
                <div className="mb-2.5 flex items-center gap-3 pl-1">
                    <h2 className="flex-1 truncate text-lg font-extrabold">{t('field.title')}</h2>
                    <button ref={closeButton} type="button" onClick={requestClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised text-ink" aria-label={t('common.close')}>
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {game && teams ? (
                    <Header game={game} defense={teams.defense} offense={teams.offense} />
                ) : query.isError ? null : (
                    <div className="card space-y-3 p-3.5" aria-hidden="true">
                        <div className="skeleton h-9 w-full" />
                        <div className="skeleton mx-auto h-6 w-2/3 rounded-full" />
                    </div>
                )}

                {query.isError && !game ? (
                    <div className="pt-3">
                        <ErrorState error={query.error} onRetry={() => query.refetch()} compact />
                    </div>
                ) : (
                    <div
                        ref={fieldRef}
                        className="fld relative mx-auto mt-3 w-full"
                        style={{ aspectRatio: `${FIELD_W} / ${FIELD_H}`, maxWidth: `min(100%, calc((100dvh - 250px) * ${(FIELD_W / FIELD_H).toFixed(3)}))` }}
                        aria-busy={!game}
                    >
                        <FieldDrawing className="absolute inset-0 h-full w-full" />
                        {game && teams
                            ? faces.map((face, index) => (
                                <Face
                                    key={face.key}
                                    face={face}
                                    px={sizes[face.size]}
                                    team={face.side === 'defense' ? teams.defense : teams.offense}
                                    batting={teams.offense}
                                    label={`${t(`field.pos.${face.spot}`)}: ${face.person.name}`}
                                    tag={tagOf(face)}
                                    animation={motion ? 'fld-pop' : 'fld-fade'}
                                    delay={delayFor(face.key, index)}
                                    nameWidth={nameWidth}
                                    small={width < 340}
                                    onGo={goTo}
                                />
                            ))
                            : DEFENSE_ORDER.map((spot) => (
                                <span key={spot} className="skeleton absolute rounded-full" style={{ ...toPercent(SPOTS[spot]), width: sizes.lg, height: sizes.lg, transform: 'translate(-50%, -50%)' }} aria-hidden="true" />
                            ))}
                        {!game && <span className="sr-only">{t('field.loading')}</span>}
                    </div>
                )}

                {game && teams && note && (
                    <p className="mt-3 text-center text-sm font-semibold text-muted" role="status">
                        {note === 'between' ? t('field.between', { team: teams.defense.teamName || teams.defense.abbrev }) : t('field.empty')}
                    </p>
                )}
            </div>
        </div>,
        document.body
    );
};

export default FieldOverlay;
