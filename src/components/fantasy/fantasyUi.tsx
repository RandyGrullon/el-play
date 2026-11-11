// Piezas chicas del Fantasy que usan varias pantallas: números con el formato del idioma, el estado del juego de un
// pelotero, la insignia de su estado y el botón «?» que abre la ayuda en la pregunta que toca.
import React, { createContext, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle } from 'lucide-react';
import { accountEnabled } from '../../lib/account';
import { inningName } from '../../lib/baseball';
import { gameStarted, type FantasyDay, type FantasyPlayer, type PlayerStatus } from '../../lib/fantasy';
import { HELP_FOR, type HelpTopic } from '../../lib/fantasyHelp';
import { useFantasyOwners } from '../../lib/fans';
import { formatTime, localeFor } from '../../lib/format';

/** Créditos y puntos con la coma o el punto del idioma (8,5 / 8.5) */
export const credits = (value: number, language: string) => new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
export const valueText = (value: number, language: string) => new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
/** Con signo (+14, −4, −2,5): el menos de verdad, no el guion */
export const signed = (value: number, language: string) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${credits(Math.abs(value), language)}`;

/** La hora sin «p. m.» (para los chips de juego: «LIC-TOR 7:30») */
export const shortTime = (date: string, language: string) => formatTime(date, language).replace(/\s*[ap]\.?\s?m\.?$/i, '');

export const teamOf = (day: FantasyDay | undefined, player: Pick<FantasyPlayer, 'teamId'>) => {
    const team = day?.teams[player.teamId];
    return team ? { id: team.id, logo: team.logo, color: team.color } : null;
};

/** Cómo va el juego de un pelotero: la hora, la entrada o «Final» */
export const gameStatus = (day: FantasyDay, gamePk: number, lang: string, t: (key: string) => string) => {
    const game = day.games.find((g) => g.gamePk === gamePk);
    if (!game) return '';
    if (game.state === 'final') return t('fantasy.final');
    if (game.state === 'live' && game.live) return inningName({ n: game.live.inning, isTop: game.live.isTop, state: game.live.inningState }, lang, true);
    return formatTime(game.date, lang);
};

/** Minutos u horas que faltan («25 min», «2 h 10 min») */
export const untilText = (ms: number, t: (key: string, options?: Record<string, unknown>) => string) => {
    const minutes = Math.max(1, Math.round(ms / 60000));
    return minutes < 60 ? t('fantasy.smart.min', { n: minutes }) : t('fantasy.smart.hours', { h: Math.floor(minutes / 60), m: minutes % 60 });
};

/** % de elección del día: solo cuando hay juegos empezados (antes no se muestra para que nadie copie) */
export const useOwners = (day: FantasyDay) => {
    const started = day.games.some((game) => gameStarted(game));
    const owners = useFantasyOwners(day.league, day.date, accountEnabled() && started);
    return useMemo(() => new Map((owners.data?.players ?? []).map((row) => [row.id, row])), [owners.data]);
};

// ---------------------------------------------------------------- ayuda

/** Abre «Cómo se juega» (en una pregunta o sección); lo da la página del Fantasy */
export const FantasyHelpContext = createContext<((topic?: HelpTopic) => void) | null>(null);
export const useOpenHelp = () => useContext(FantasyHelpContext);

/** Modo de prueba (solo en desarrollo): las secciones nuevas usan datos inventados en vez del servidor */
export const FantasyDemoContext = createContext(false);
export const useFantasyDemo = () => useContext(FantasyDemoContext);

/** «vie, 16 oct» (los días vienen sin hora) */
export const shortDay = (day: string, lang: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(localeFor(lang), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
/** «16 oct» */
export const dayMonth = (day: string, lang: string) => new Date(`${day.slice(0, 10)}T12:00:00Z`).toLocaleDateString(localeFor(lang), { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** El «?» al lado de Créditos, Capitán, Pronósticos y Tabla: abre la ayuda en su pregunta */
export const HelpButton: React.FC<{ topic: keyof typeof HELP_FOR; className?: string }> = ({ topic, className = '' }) => {
    const { t } = useTranslation();
    const open = useOpenHelp();
    if (!open) return null;
    return (
        <button
            type="button"
            onClick={() => open(HELP_FOR[topic])}
            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-raised hover:text-ink ${className}`}
            aria-label={t('fantasyHelp.about', { topic: t(`fantasyHelp.topic.${topic}`) })}
        >
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
        </button>
    );
};

// ---------------------------------------------------------------- estado del pelotero

const STATUS_TONE: Record<PlayerStatus | 'started', string> = {
    confirmed: 'bg-ball/15 text-ink',
    probable: 'bg-ball/15 text-ink',
    rotation: 'bg-accent/10 text-accent-ink',
    expected: 'bg-accent/10 text-accent-ink',
    bench: 'bg-raised text-muted',
    bullpen: 'bg-raised text-muted',
    resting: 'bg-raised text-muted',
    postponed: 'bg-live/15 text-live',
    dnp: 'bg-live/10 text-live',
    started: 'bg-raised text-faint'
};

/** Confirmado / Esperado / Banca / Abridor probable / Le toca abrir / Bullpen / Descansando / Pospuesto / No jugó / Ya empezó */
export const StatusBadge: React.FC<{ status: PlayerStatus | 'started' | null; className?: string }> = ({ status, className = '' }) => {
    const { t } = useTranslation();
    if (!status) return null;
    return <span className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${STATUS_TONE[status]} ${className}`}>{t(`fantasyHelp.status.${status}`)}</span>;
};
