import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../types';
import { inningName } from '../../lib/baseball';
import { CountDots } from './CountDots';

// Diamante grande con los nombres de los corredores, conteo y entrada
export const Situation: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const batting = game.inning?.isTop ? game.away : game.home;
    const { runners } = game;
    const between = game.inning?.state === 'Middle' || game.inning?.state === 'End';

    const base = (x: number, y: number, on: boolean) => (
        <rect x={x - 13} y={y - 13} width={26} height={26} rx={3} transform={`rotate(45 ${x} ${y})`} fill={on ? batting.color : 'rgb(var(--raised))'} stroke={on ? 'rgb(var(--surface))' : 'rgb(var(--line) / 0.25)'} strokeWidth={3} />
    );

    return (
        <section className="card p-4" aria-label={t('game.situation')}>
            <div className="flex items-start justify-between">
                <div>
                    <p className="eyebrow">{t('game.inning')}</p>
                    <p className="display text-3xl leading-tight">{inningName(game.inning, i18n.language)}</p>
                    <p className="text-xs text-muted">{t('game.batting', { team: batting.teamName || batting.name })}</p>
                </div>
                {!between && <CountDots balls={game.count.balls} strikes={game.count.strikes} outs={game.count.outs} />}
            </div>

            <div className="relative mx-auto mt-2 aspect-[4/3] w-full max-w-[260px]">
                <svg viewBox="0 0 200 150" className="h-full w-full" aria-hidden="true">
                    <path d="M100 135 L170 70 L100 12 L30 70 Z" fill="none" stroke="rgb(var(--line) / 0.15)" strokeWidth={2} />
                    {base(100, 18, !!runners.second)}
                    {base(168, 72, !!runners.first)}
                    {base(32, 72, !!runners.third)}
                    <path d="M92 128 L108 128 L108 136 L100 143 L92 136 Z" fill="rgb(var(--faint))" />
                </svg>
                <RunnerTag className="left-1/2 top-[22%] -translate-x-1/2" name={runners.second?.name} />
                <RunnerTag className="right-0 top-[58%]" name={runners.first?.name} />
                <RunnerTag className="left-0 top-[58%]" name={runners.third?.name} />
            </div>
            {between && <p className="text-center text-sm text-muted">{t('game.betweenInnings')}</p>}
        </section>
    );
};

const RunnerTag: React.FC<{ name?: string; className: string }> = ({ name, className }) =>
    name ? <span className={`absolute max-w-[45%] truncate rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-bg ${className}`}>{name}</span> : null;
