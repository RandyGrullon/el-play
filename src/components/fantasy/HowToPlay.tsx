// «Cómo se juega»: pasos, tabla de puntos, ejemplos y preguntas, todo con las reglas del día (rules). Se abre a
// pantalla completa desde el encabezado, la portada y los «?» (cada uno en su pregunta). Mismo contenido que la app.
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { BottomSheet } from '../ui/BottomSheet';
import { rulesOf, type FantasyDay } from '../../lib/fantasy';
import { HELP_FAQ, HELP_SECTIONS, helpAnswerValues, helpExamples, helpSteps, scoringRows, type HelpQuestion, type HelpTopic } from '../../lib/fantasyHelp';
import { credits, signed } from './fantasyUi';

const anchor = (topic: HelpTopic) => `fantasy-help-${topic}`;
const isQuestion = (topic: HelpTopic | null | undefined): topic is HelpQuestion => !!topic && (HELP_FAQ as readonly string[]).includes(topic);

export const HowToPlay: React.FC<{ day?: FantasyDay; topic?: HelpTopic | null; onClose: () => void }> = ({ day, topic, onClose }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const rules = useMemo(() => rulesOf(day), [day]);
    const [open, setOpen] = useState<Set<HelpQuestion>>(() => new Set(isQuestion(topic) ? [topic] : []));
    const n = (value: number) => credits(value, lang);

    // Abierta desde un «?»: su pregunta abierta, a la vista y con el foco
    useEffect(() => {
        if (!topic || topic === 'steps') return;
        if (isQuestion(topic)) setOpen((current) => new Set([...current, topic]));
        const frame = requestAnimationFrame(() => {
            const target = document.getElementById(anchor(topic));
            target?.scrollIntoView({ block: 'start' });
            if (isQuestion(topic)) document.getElementById(`${anchor(topic)}-q`)?.focus({ preventScroll: true });
        });
        return () => cancelAnimationFrame(frame);
    }, [topic]);

    const toggle = (key: HelpQuestion) =>
        setOpen((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    const examples = helpExamples(rules);
    const answers = helpAnswerValues(rules);
    const formatted = (values: Record<string, number> = {}) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, n(value)]));

    return (
        <BottomSheet open full onClose={onClose} title={t('fantasyHelp.title')}>
            <div className="space-y-7 pb-6">
                <p className="text-sm text-muted">{t('fantasyHelp.lead')}</p>

                <nav aria-label={t('fantasyHelp.jump')} className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none">
                    {HELP_SECTIONS.map((section) => (
                        <a
                            key={section}
                            href={`#${anchor(section)}`}
                            onClick={(event) => {
                                event.preventDefault();
                                document.getElementById(anchor(section))?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                            }}
                            className="shrink-0 rounded-full bg-raised px-3.5 py-2 text-xs font-bold text-ink"
                        >
                            {t(`fantasyHelp.${section}.title`)}
                        </a>
                    ))}
                </nav>

                <section id={anchor('steps')} aria-labelledby={`${anchor('steps')}-h`} className="scroll-mt-2 space-y-3">
                    <h3 id={`${anchor('steps')}-h`} className="eyebrow">
                        {t('fantasyHelp.steps.title')}
                    </h3>
                    <ol className="card space-y-3 p-4">
                        {helpSteps(rules).map((step, index) => (
                            <li key={step.key} className="flex items-start gap-3">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-extrabold tabular-nums text-white" aria-hidden="true">
                                    {index + 1}
                                </span>
                                <span className="pt-0.5 text-sm font-semibold leading-snug">
                                    {/* count va como número para el plural; lo demás con el formato del idioma */}
                                    {t(`fantasyHelp.steps.${step.key}`, { ...formatted(step.values), ...(step.values.count !== undefined ? { count: step.values.count } : {}) })}
                                </span>
                            </li>
                        ))}
                    </ol>
                </section>

                <section id={anchor('points')} aria-labelledby={`${anchor('points')}-h`} className="scroll-mt-2 space-y-3">
                    <h3 id={`${anchor('points')}-h`} className="eyebrow">
                        {t('fantasyHelp.points.title')}
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {(['batter', 'pitcher'] as const).map((role) => (
                            <div key={role} className="card p-4">
                                <h4 className="mb-1 text-sm font-extrabold">{t(role === 'batter' ? 'fantasyHelp.points.batters' : 'fantasyHelp.points.pitchers')}</h4>
                                <ul className="divide-y divide-line/10 text-sm">
                                    {scoringRows(rules, role).map((row) => (
                                        <li key={row.key} className="flex justify-between gap-3 py-1.5">
                                            <span>{t(`fantasyHelp.points.${role}.${row.key}`)}</span>
                                            <span className={`font-bold tabular-nums ${row.points < 0 ? 'text-live' : ''}`}>{signed(row.points, lang)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>

                <section id={anchor('examples')} aria-labelledby={`${anchor('examples')}-h`} className="scroll-mt-2 space-y-3">
                    <h3 id={`${anchor('examples')}-h`} className="eyebrow">
                        {t('fantasyHelp.examples.title')}
                    </h3>
                    <ul className="grid gap-2.5">
                        <li className="card p-4 text-sm leading-relaxed">{t('fantasyHelp.examples.soloHr', formatted(examples.soloHr))}</li>
                        <li className="card p-4 text-sm leading-relaxed">{t('fantasyHelp.examples.double', formatted(examples.double))}</li>
                        <li className="card p-4 text-sm leading-relaxed">
                            {t('fantasyHelp.examples.pitcher', {
                                ...formatted(examples.pitcher),
                                kPts: signed(examples.pitcher.kPts, lang),
                                erPts: signed(examples.pitcher.erPts, lang),
                                hPts: signed(examples.pitcher.hPts, lang),
                                bbPts: signed(examples.pitcher.bbPts, lang),
                                winPts: signed(examples.pitcher.winPts, lang)
                            })}
                        </li>
                    </ul>
                </section>

                <section id={anchor('faq')} aria-labelledby={`${anchor('faq')}-h`} className="scroll-mt-2 space-y-3">
                    <h3 id={`${anchor('faq')}-h`} className="eyebrow">
                        {t('fantasyHelp.faq.title')}
                    </h3>
                    <div className="card divide-y divide-line/10 overflow-hidden">
                        {HELP_FAQ.map((key) => {
                            const expanded = open.has(key);
                            const id = anchor(key);
                            return (
                                <div key={key} id={id} className="scroll-mt-2">
                                    <h4>
                                        <button
                                            id={`${id}-q`}
                                            type="button"
                                            aria-expanded={expanded}
                                            aria-controls={`${id}-a`}
                                            onClick={() => toggle(key)}
                                            className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-extrabold transition-colors hover:bg-raised/60"
                                        >
                                            <span className="min-w-0 flex-1">{t(`fantasyHelp.faq.${key}.q`)}</span>
                                            <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                                        </button>
                                    </h4>
                                    <div id={`${id}-a`} role="region" aria-labelledby={`${id}-q`} hidden={!expanded} className="px-4 pb-4 text-sm leading-relaxed text-muted">
                                        {t(`fantasyHelp.faq.${key}.a`, formatted(answers[key]))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>
        </BottomSheet>
    );
};
