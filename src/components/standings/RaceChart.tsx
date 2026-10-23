// La carrera de la temporada: juegos sobre .500 (victorias menos derrotas) de cada equipo, día a día. El favorito
// (o el que se toque) va resaltado.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity } from 'lucide-react';
import type { LeagueId } from '../../types';
import { useRace } from '../../lib/queries';
import { formatShortDate } from '../../lib/format';
import { usePreferences } from '../../store/preferences';

const W = 320;
const H = 170;
const PAD = { top: 10, bottom: 18, left: 22, right: 30 };

export const RaceChart: React.FC<{ league: LeagueId }> = ({ league }) => {
    const { t, i18n } = useTranslation();
    const race = useRace(league);
    const { favoriteTeamId } = usePreferences();
    const [picked, setPicked] = useState<number | null>(null);
    const data = race.data;
    if (!data || data.days.length < 2 || !data.teams.length) return null;
    const focus = picked ?? favoriteTeamId;
    const values = data.teams.flatMap((team) => team.points);
    const top = Math.max(2, ...values);
    const bottom = Math.min(-2, ...values);
    const x = (index: number) => PAD.left + (index / (data.days.length - 1)) * (W - PAD.left - PAD.right);
    const y = (value: number) => PAD.top + ((top - value) / (top - bottom)) * (H - PAD.top - PAD.bottom);
    const path = (points: number[]) => points.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
    const ordered = [...data.teams].sort((a, b) => Number(a.id === focus) - Number(b.id === focus));
    // Etiquetas al final sin encimarse: se separan al menos 11 px
    const labels = [...data.teams].sort((a, b) => b.points[b.points.length - 1] - a.points[a.points.length - 1]).map((team) => ({ team, y: y(team.points[team.points.length - 1]) }));
    for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 11);
    const ticks = [top, 0, bottom].filter((value, index, list) => list.indexOf(value) === index);

    return (
        <section className="card p-4" aria-labelledby="race-chart">
            <h2 id="race-chart" className="eyebrow mb-1 flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                {t('race.title')}
            </h2>
            <p className="mb-2 text-xs text-muted">{t('race.subtitle')}</p>
            <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={t('race.aria', { teams: data.teams.map((team) => `${team.abbrev} ${team.points[team.points.length - 1]}`).join(', ') })}>
                {ticks.map((value) => (
                    <g key={value}>
                        <line x1={PAD.left} x2={W - PAD.right} y1={y(value)} y2={y(value)} stroke={value === 0 ? 'rgb(var(--line) / 0.3)' : 'rgb(var(--line) / 0.08)'} strokeDasharray={value === 0 ? '3 3' : undefined} />
                        <text x={PAD.left - 4} y={y(value) + 3} textAnchor="end" className="fill-faint" fontSize="9" fontWeight="700">
                            {value > 0 ? `+${value}` : value}
                        </text>
                    </g>
                ))}
                {[0, data.days.length - 1].map((index) => (
                    <text key={index} x={x(index)} y={H - 4} textAnchor={index ? 'end' : 'start'} className="fill-faint" fontSize="9" fontWeight="700">
                        {formatShortDate(`${data.days[index]}T16:00:00Z`, i18n.language)}
                    </text>
                ))}
                {ordered.map((team) => (
                    <path
                        key={team.id}
                        d={path(team.points)}
                        fill="none"
                        stroke={team.color}
                        strokeWidth={team.id === focus ? 3 : 1.8}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        opacity={focus && team.id !== focus ? 0.35 : 1}
                    />
                ))}
                {labels.map(({ team, y: labelY }) => (
                    <text key={team.id} x={W - PAD.right + 4} y={labelY + 3} fontSize="9" fontWeight="800" fill={team.color} opacity={focus && team.id !== focus ? 0.5 : 1}>
                        {team.abbrev}
                    </text>
                ))}
            </svg>
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={t('race.pick')}>
                {data.teams.map((team) => (
                    <button
                        key={team.id}
                        type="button"
                        onClick={() => setPicked((current) => (current === team.id ? null : team.id))}
                        aria-pressed={focus === team.id}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold ${focus === team.id ? 'bg-ink text-bg' : 'bg-raised text-ink'}`}
                    >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: team.color }} />
                        {team.abbrev}
                    </button>
                ))}
            </div>
            {data.isPreviousSeason && <p className="mt-2 text-[11px] text-faint">{t('race.previous')}</p>}
        </section>
    );
};
