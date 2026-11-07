import React from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, CloudFog, CloudLightning, CloudRain, Droplets, PauseCircle, ZapOff, type LucideIcon } from 'lucide-react';
import type { GameDetail } from '../../types';
import { inningName, type Delay, type DelayReason } from '../../lib/baseball';

// Juego detenido (lluvia, terreno mojado, tormenta…): la pastilla azul de las tarjetas y el aviso de la página del juego

type T = (key: string, options?: Record<string, unknown>) => string;

const ICONS: Record<DelayReason, LucideIcon> = {
    rain: CloudRain,
    wet: Droplets,
    lightning: CloudLightning,
    weather: Cloud,
    fog: CloudFog,
    power: ZapOff,
    other: PauseCircle
};

/** «Detenido · Lluvia» (con el inicio demorado, «Inicio demorado · Lluvia»; sin motivo conocido, solo «Detenido») */
export const delayLabel = (t: T, delay: Delay) => {
    const short = t(delay.start ? 'delay.shortStart' : 'delay.short');
    const reason = t(`delay.reason.${delay.reason}`);
    return reason ? `${short} · ${reason}` : short;
};

/** «Juego detenido por lluvia» / «Inicio demorado por lluvia» */
export const delayTitle = (t: T, delay: Delay) => t(`delay.${delay.start ? 'titleStart' : 'title'}.${delay.reason}`);

export const DelayIcon: React.FC<{ reason: DelayReason; className?: string }> = ({ reason, className = 'h-3.5 w-3.5' }) => {
    const Icon = ICONS[reason];
    return <Icon className={className} aria-hidden="true" />;
};

/**
 * Pastilla como la de la entrada, en azul de lluvia. `solid` va sobre los colores de los equipos (la cabecera del
 * juego): el mismo azul en los dos temas. `suffix`: la entrada en que se detuvo («▲ 7»).
 */
export const DelayPill: React.FC<{ delay: Delay; suffix?: string; solid?: boolean; className?: string }> = ({ delay, suffix, solid, className = '' }) => {
    const { t } = useTranslation();
    return (
        <span className={`pill shrink-0 whitespace-nowrap ${solid ? 'bg-[#0369a1] text-white' : 'bg-rain/15 text-rain'} ${className}`}>
            <DelayIcon reason={delay.reason} />
            {delayLabel(t, delay)}
            {suffix ? ` · ${suffix}` : ''}
        </span>
    );
};

/** Aviso bajo la cabecera: por qué se detuvo, en qué entrada, los minutos (si MLB los da) y el botón de la lluvia */
export const DelayBanner: React.FC<{ game: GameDetail; delay: Delay; rain?: { on: boolean; toggle: () => void } | null }> = ({ game, delay, rain }) => {
    const { t, i18n } = useTranslation();
    const minutes = game.info?.delayMin;
    const details = [
        !delay.start && game.inning?.n ? t('delay.stoppedAt', { inning: inningName(game.inning, i18n.language) }) : '',
        typeof minutes === 'number' && minutes > 0 ? t('delay.minutes', { count: minutes }) : ''
    ].filter(Boolean);
    return (
        <div className="flex items-center gap-3 rounded-2xl bg-rain/10 px-3.5 py-3 ring-1 ring-inset ring-rain/20" role="status">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rain/15 text-rain">
                <DelayIcon reason={delay.reason} className="h-5 w-5" />
            </span>
            <p className="min-w-0 flex-1 text-sm">
                <b className="block text-[15px] font-extrabold leading-tight">{delayTitle(t, delay)}</b>
                {details.length > 0 && <span className="mt-0.5 block text-muted">{details.join(' · ')}</span>}
            </p>
            {rain && (
                <button type="button" onClick={rain.toggle} className="shrink-0 rounded-full bg-surface px-3 py-2 text-xs font-bold text-ink shadow-card">
                    {rain.on ? t('delay.hideRain') : t('delay.showRain')}
                </button>
            )}
        </div>
    );
};
