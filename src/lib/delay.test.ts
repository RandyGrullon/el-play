import { describe, it, expect } from 'vitest';
import { delayOf, isRainy } from './baseball';
import { delayLabel, delayTitle } from '../components/game/Delay';
import i18n, { setLanguage } from '../i18n';

describe('delayOf: juego detenido o con el inicio demorado', () => {
    it('lee el motivo de los textos de MLB StatsAPI', () => {
        expect(delayOf('Delayed: Rain')).toEqual({ reason: 'rain', start: false });
        expect(delayOf('Delayed Start: Rain')).toEqual({ reason: 'rain', start: true });
        expect(delayOf('Delayed: Wet Grounds')).toEqual({ reason: 'wet', start: false });
        expect(delayOf('Delayed Start: Wet Grounds')).toEqual({ reason: 'wet', start: true });
        expect(delayOf('Delayed: Lightning')).toEqual({ reason: 'lightning', start: false });
        expect(delayOf('Delayed: Weather')).toEqual({ reason: 'weather', start: false });
        expect(delayOf('Delayed: Fog')).toEqual({ reason: 'fog', start: false });
        expect(delayOf('Delayed: Power')).toEqual({ reason: 'power', start: false });
    });

    it('cualquier otro «Delayed…» es «other», también sin motivo', () => {
        expect(delayOf('Delayed: Injury')).toEqual({ reason: 'other', start: false });
        expect(delayOf('Delayed: About to Resume')).toEqual({ reason: 'other', start: false });
        expect(delayOf('Delayed')).toEqual({ reason: 'other', start: false });
        expect(delayOf('Delayed Start')).toEqual({ reason: 'other', start: true });
    });

    it('lo que no es una demora es null', () => {
        for (const state of ['In Progress', 'Final', 'Scheduled', 'Suspended: Rain', 'Postponed', 'Warmup', '', null, undefined]) {
            expect(delayOf(state)).toBeNull();
        }
    });

    it('solo la lluvia y el terreno mojado ponen a llover', () => {
        expect(isRainy(delayOf('Delayed: Rain'))).toBe(true);
        expect(isRainy(delayOf('Delayed Start: Wet Grounds'))).toBe(true);
        expect(isRainy(delayOf('Delayed: Lightning'))).toBe(false);
        expect(isRainy(null)).toBe(false);
    });

    it('textos en los dos idiomas (sin motivo conocido, solo «Detenido»)', async () => {
        await i18n.changeLanguage('es');
        const t = i18n.t.bind(i18n) as (key: string) => string;
        expect(delayLabel(t, { reason: 'rain', start: false })).toBe('Detenido · Lluvia');
        expect(delayLabel(t, { reason: 'other', start: false })).toBe('Detenido');
        expect(delayTitle(t, { reason: 'rain', start: false })).toBe('Juego detenido por lluvia');
        expect(delayTitle(t, { reason: 'rain', start: true })).toBe('Inicio demorado por lluvia');
        expect(delayTitle(t, { reason: 'power', start: false })).toBe('Juego detenido: sin luz');
        await setLanguage('en');
        expect(delayLabel(t, { reason: 'wet', start: false })).toBe('Delayed · Wet grounds');
        expect(delayTitle(t, { reason: 'lightning', start: true })).toBe('Start delayed by lightning');
        await i18n.changeLanguage('es');
    });
});
