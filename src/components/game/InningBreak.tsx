// Pausa entre entradas en la zona de strike: tras el tercer out, en vez del último turno, una espera animada con el
// equipo que viene a batear, lo que hizo el que salió y a quién le toca (los tres que trae MLB).
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { InningBreak as Pause } from '../../lib/baseball';
import { PlayerPhoto } from '../ui/PlayerPhoto';
import { TeamLogo } from '../ui/TeamLogo';

export const InningBreak: React.FC<{ pause: Pause }> = ({ pause }) => {
    const { t } = useTranslation();
    const { next, ended, runs, dueUp } = pause;
    return (
        <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] sm:items-center">
            {/* La zona vacía «respira», una franja la recorre y el logo del que viene espera dentro de un anillo que gira */}
            <div className="zb-stage relative mx-auto aspect-[5/6] w-full max-w-[300px] overflow-hidden rounded-2xl bg-raised" style={{ ['--zb-c' as string]: next.color }} role="img" aria-label={t('zone.breakAria', { team: next.name })}>
                <svg viewBox="0 0 200 240" className="absolute inset-0 h-full w-full" aria-hidden="true">
                    <rect className="zb-zone" x={58} y={44} width={84} height={104} rx={4} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="6 6" />
                    <path d="M84 196h32v8l-16 10-16-10z" fill="currentColor" opacity={0.18} />
                </svg>
                <div className="absolute overflow-hidden" style={{ left: '29%', right: '29%', top: '18.3%', height: '43.3%' }} aria-hidden="true">
                    <div className="zb-scan absolute inset-x-0 h-1/3" />
                </div>
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pt-6">
                    <div className="relative grid h-24 w-24 place-items-center">
                        <span className="absolute inset-0 rounded-full border-4 opacity-20" style={{ borderColor: next.color }} />
                        <span className="zb-ring absolute inset-0 rounded-full border-4 border-transparent" style={{ borderTopColor: next.color, borderRightColor: next.color }} />
                        <span className="grid h-[72px] w-[72px] place-items-center rounded-full bg-surface shadow-card">
                            <TeamLogo team={next} size={52} />
                        </span>
                    </div>
                    <p className="flex items-center gap-1 rounded-full bg-surface/85 px-3 py-1 text-xs font-bold shadow-card">
                        {t('zone.breakWaiting')}
                        <span className="inline-flex gap-0.5" aria-hidden="true">
                            <i className="zb-dot h-1 w-1 rounded-full bg-current" />
                            <i className="zb-dot h-1 w-1 rounded-full bg-current" style={{ animationDelay: '0.18s' }} />
                            <i className="zb-dot h-1 w-1 rounded-full bg-current" style={{ animationDelay: '0.36s' }} />
                        </span>
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <TeamLogo team={next} size={40} />
                    <div className="min-w-0">
                        <p className="eyebrow">{t('zone.breakNext')}</p>
                        <p className="truncate font-display text-lg font-extrabold leading-tight">{next.name}</p>
                    </div>
                </div>
                {runs !== null && (
                    <p className="text-sm text-muted">
                        {t('zone.breakRuns', { team: ended.abbrev, count: runs })}
                    </p>
                )}
                {dueUp.length > 0 && (
                    <div>
                        <p className="eyebrow mb-1.5">{t('zone.breakDueUp')}</p>
                        <ol className="space-y-1.5">
                            {dueUp.map((batter, index) => (
                                <li key={batter.id} className="zb-due flex items-center gap-3 rounded-2xl bg-raised px-2.5 py-1.5" style={{ animationDelay: `${index * 0.12}s` }}>
                                    <span className="w-4 text-center text-xs font-extrabold text-faint">{index + 1}</span>
                                    <PlayerPhoto personId={batter.id} name={batter.name} size={32} team={{ id: next.id, logo: next.logo, color: next.color }} />
                                    <span className="min-w-0 truncate text-sm font-semibold">{batter.name}</span>
                                </li>
                            ))}
                        </ol>
                    </div>
                )}
            </div>
        </div>
    );
};

/** La misma espera en el cuadrito de la zona que flota junto a la situación (sin textos: no caben) */
export const InningBreakMini: React.FC<{ pause: Pause }> = ({ pause }) => (
    <div className="zb-stage relative aspect-[470/605] w-full overflow-hidden rounded-[18px] bg-raised" style={{ ['--zb-c' as string]: pause.next.color }} aria-hidden="true">
        <svg viewBox="0 0 200 258" className="absolute inset-0 h-full w-full">
            <rect className="zb-zone" x={50} y={40} width={100} height={128} rx={5} fill="none" stroke="currentColor" strokeWidth={3} strokeDasharray="8 7" />
            <path d="M80 214h40v10l-20 13-20-13z" fill="currentColor" opacity={0.18} />
        </svg>
        <div className="absolute overflow-hidden" style={{ left: '25%', right: '25%', top: '15.5%', height: '49.6%' }}>
            <div className="zb-scan absolute inset-x-0 h-1/3" />
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
            <div className="relative grid h-12 w-12 place-items-center">
                <span className="absolute inset-0 rounded-full border-[3px] opacity-20" style={{ borderColor: pause.next.color }} />
                <span className="zb-ring absolute inset-0 rounded-full border-[3px] border-transparent" style={{ borderTopColor: pause.next.color, borderRightColor: pause.next.color }} />
                <span className="grid h-9 w-9 place-items-center rounded-full bg-surface shadow-card">
                    <TeamLogo team={pause.next} size={26} />
                </span>
            </div>
            <span className="inline-flex gap-0.5 text-ink/70">
                <i className="zb-dot h-1 w-1 rounded-full bg-current" />
                <i className="zb-dot h-1 w-1 rounded-full bg-current" style={{ animationDelay: '0.18s' }} />
                <i className="zb-dot h-1 w-1 rounded-full bg-current" style={{ animationDelay: '0.36s' }} />
            </span>
        </div>
    </div>
);
