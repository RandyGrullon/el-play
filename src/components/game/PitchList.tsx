import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Pitch } from '../../types';
import { RESULT_COLORS, pitchCallName, pitchTypeName } from '../../lib/baseball';

interface PitchListProps {
    pitches: Pitch[];
    selected?: number | null;
    onSelect?: (index: number | null) => void;
    newestFirst?: boolean;
}

export const PitchList: React.FC<PitchListProps> = ({ pitches, selected = null, onSelect, newestFirst = true }) => {
    const { t, i18n } = useTranslation();
    if (!pitches.length) return <p className="py-6 text-center text-sm text-muted">{t('zone.waiting')}</p>;

    const rows = pitches.map((pitch, index) => ({ pitch, index }));
    if (newestFirst) rows.reverse();

    return (
        <ol className="divide-y divide-line/10" aria-label={t('zone.sequence')}>
            {rows.map(({ pitch, index }) => {
                const active = selected === index;
                return (
                    <li key={index}>
                        <button
                            type="button"
                            onClick={onSelect ? () => onSelect(active ? null : index) : undefined}
                            className={`grid w-full grid-cols-[22px_1fr_auto] items-center gap-x-2.5 px-1 py-2 text-left transition-colors ${active ? 'bg-raised' : onSelect ? 'hover:bg-raised/60' : ''}`}
                        >
                            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: RESULT_COLORS[pitch.r] }}>
                                {pitch.n ?? index + 1}
                            </span>
                            <span className="min-w-0">
                                <span className="flex items-center gap-1.5">
                                    <span className="truncate text-sm font-semibold">{pitchCallName(pitch, i18n.language)}</span>
                                    {pitch.abs && (
                                        <span className={`shrink-0 rounded-full px-1.5 text-[10px] font-extrabold ${pitch.abs.inProgress ? 'bg-accent/15 text-accent-ink' : pitch.abs.overturned ? 'bg-ball/15 text-ball' : 'bg-raised text-muted'}`}>
                                            {t(pitch.abs.inProgress ? 'zone.absChecking' : pitch.abs.overturned ? 'zone.absOverturned' : 'zone.absConfirmed')}
                                        </span>
                                    )}
                                </span>
                                {/* Sin rastreo no hay tipo ni velocidad: no se pintan guiones */}
                                {(pitch.type || pitch.typeDesc || pitch.hit?.ev) && (
                                    <span className="block truncate text-xs text-muted">
                                        {[pitch.type || pitch.typeDesc ? pitchTypeName(pitch, i18n.language) : '', pitch.hit?.ev ? t('zone.exitVelo', { mph: pitch.hit.ev }) : ''].filter(Boolean).join(' · ')}
                                    </span>
                                )}
                            </span>
                            {pitch.mph ? (
                                <span className="text-right">
                                    <span className="num block font-display text-base font-bold leading-none">{pitch.mph.toFixed(1)}</span>
                                    <span className="num block text-[11px] text-faint">{pitch.b !== null && pitch.s !== null && pitch.r !== 'inplay' ? `${pitch.b}-${pitch.s}` : 'mph'}</span>
                                </span>
                            ) : (
                                <span className="num text-right font-display text-base font-bold leading-none text-muted">{pitch.b !== null && pitch.s !== null && pitch.r !== 'inplay' ? `${pitch.b}-${pitch.s}` : ''}</span>
                            )}
                        </button>
                    </li>
                );
            })}
        </ol>
    );
};
