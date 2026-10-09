import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDayNumber, formatLongDate, formatWeekday } from '../../lib/format';

interface DateStripProps {
    days: string[];
    selected: string;
    today: string;
    counts: Record<string, { total: number; live: number }>;
    onSelect: (day: string) => void;
}

export const DateStrip: React.FC<DateStripProps> = ({ days, selected, today, counts, onSelect }) => {
    const { t, i18n } = useTranslation();
    const scroller = useRef<HTMLDivElement>(null);

    // Mantener el día elegido centrado (solo se desplaza la tira, no la página)
    useEffect(() => {
        const container = scroller.current;
        const element = container?.querySelector<HTMLElement>(`[data-day="${selected}"]`);
        if (!container || !element) return;
        const left = element.offsetLeft - (container.clientWidth - element.clientWidth) / 2;
        container.scrollTo?.({ left, behavior: 'smooth' });
    }, [selected, days.length]);

    return (
        <div ref={scroller} role="tablist" aria-label={t('games.selectDate')} className="relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0">
            {days.map((day) => {
                const active = day === selected;
                const info = counts[day];
                return (
                    <button
                        key={day}
                        data-day={day}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        aria-label={`${formatLongDate(day, i18n.language)}${info ? ` · ${t('games.count', { count: info.total })}` : ''}`}
                        onClick={() => onSelect(day)}
                        className={`flex h-[68px] w-[54px] shrink-0 flex-col items-center justify-center rounded-xl border transition-colors ${
                            active ? 'border-transparent bg-ink text-bg' : 'border-line/10 bg-surface text-ink hover:border-line/25'
                        }`}
                    >
                        <span className={`text-[10px] font-semibold uppercase tracking-wide ${active ? 'opacity-80' : 'text-muted'}`}>
                            {day === today ? t('games.today') : formatWeekday(day, i18n.language)}
                        </span>
                        <span className="display text-2xl leading-none">{formatDayNumber(day)}</span>
                        <span className="mt-1 h-1.5">
                            {info?.live ? (
                                <span className="block h-1.5 w-1.5 animate-pulse rounded-full bg-live" />
                            ) : info?.total ? (
                                <span className={`block h-1.5 w-1.5 rounded-full ${active ? 'bg-bg/70' : 'bg-accent'}`} />
                            ) : null}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};
