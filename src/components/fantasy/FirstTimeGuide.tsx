// Guía para empezar (Fantasy v3): para quien no tiene equipo hoy y nunca la cerró, 3 pasos cortos con los números del
// día (cuántos bateadores y lanzadores, el capitán, los pronósticos). Cada paso tiene «Siguiente» y «Ver cómo se juega»;
// cerrarla (o terminarla) se acuerda en este navegador.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crown, Target, Users, X } from 'lucide-react';
import type { FantasyDay } from '../../lib/fantasy';
import { helpRules } from '../../lib/fantasyHelp';
import { GUIDE_STEPS, dismissGuide } from '../../lib/fantasyGuide';
import { credits } from './fantasyUi';

export const FirstTimeGuide: React.FC<{ day?: FantasyDay; onHow: () => void }> = ({ day, onHow }) => {
    const { t, i18n } = useTranslation();
    const [step, setStep] = useState(0);
    const rules = helpRules(day);
    const x = credits(rules.captain, i18n.language);
    const steps = [
        { Icon: Users, title: t('fantasyGuide.s1Title', { batters: rules.batters, count: rules.pitchers }), body: t('fantasyGuide.s1Body') },
        { Icon: Crown, title: t('fantasyGuide.s2Title', { x }), body: t('fantasyGuide.s2Body', { x }) },
        { Icon: Target, title: t('fantasyGuide.s3Title'), body: t('fantasyGuide.s3Body', { pts: credits(rules.picks, i18n.language) }) }
    ];
    const current = steps[Math.min(step, GUIDE_STEPS - 1)];
    const last = step >= GUIDE_STEPS - 1;
    const Icon = current.Icon;
    return (
        <section className="relative rounded-card bg-accent/10 p-4 ring-1 ring-accent/20" aria-label={t('fantasyGuide.label')}>
            <button type="button" onClick={dismissGuide} className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-raised hover:text-ink" aria-label={t('fantasyGuide.dismiss')}>
                <X className="h-4 w-4" />
            </button>
            <p className="eyebrow pr-10 text-accent-ink">
                {t('fantasyGuide.label')} · {t('fantasyGuide.step', { n: step + 1, total: GUIDE_STEPS })}
            </p>
            <div className="mt-2 flex items-start gap-3" aria-live="polite">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <h2 className="font-extrabold leading-snug">{current.title}</h2>
                    <p className="mt-0.5 text-sm text-muted">{current.body}</p>
                </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
                {steps.map((_, index) => (
                    <span key={index} className={`h-1.5 rounded-full transition-all ${index === step ? 'w-5 bg-accent' : 'w-1.5 bg-accent/30'}`} />
                ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => (last ? dismissGuide() : setStep((value) => value + 1))} className="h-10 rounded-full bg-accent px-4 text-sm font-extrabold text-white">
                    {last ? t('fantasyGuide.done') : t('fantasyGuide.next')}
                </button>
                <button type="button" onClick={onHow} className="h-10 rounded-full bg-surface px-4 text-sm font-bold shadow-card">
                    {t('fantasyGuide.how')}
                </button>
            </div>
        </section>
    );
};
