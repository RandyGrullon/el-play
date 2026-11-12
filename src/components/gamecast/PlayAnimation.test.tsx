import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import { PlayAnimation } from './PlayAnimation';
import { replayEventOf, type PlayEvent } from '../../lib/playEvents';
import type { AtBat, GameDetail } from '../../types';

// La animación del error (se embasa por error o por interferencia): juego, equipos y peloteros inventados

const ab = (i: number, event: string | null, extra: Partial<AtBat> = {}): AtBat => ({
    i,
    inning: 1,
    top: true,
    complete: event !== null,
    scoring: false,
    batter: { id: 12345678, name: 'Juan Prueba', side: 'R' },
    pitcher: { id: 87654321, name: 'Pedro Prueba', hand: 'R' },
    event,
    eventLabel: null,
    desc: '',
    rbi: 0,
    away: 0,
    home: 0,
    outs: 0,
    pitches: [],
    actions: [],
    ...extra
});

const side = (id: number, abbrev: string) => ({ id, abbrev, name: `Equipo ${abbrev}`, logo: '', color: '#123456', record: null, teamName: abbrev, runs: 0, hits: 0, errors: 0, lob: 0, isWinner: false });

const game = (atBats: AtBat[]) =>
    ({ gamePk: 12345678, state: 'live', scheduledInnings: 9, league: 'lidom', venue: 'Estadio de Prueba', atBats, away: side(99991, 'AAA'), home: side(99992, 'BBB') }) as unknown as GameDetail;

/** La repetición del turno 1 (el anterior dejó a uno en primera) */
const errorEvent = (event: string, extra: Partial<AtBat> = {}): PlayEvent => {
    const replay = replayEventOf(game([ab(0, 'single', { post: 1 }), ab(1, event, { post: 3, ...extra })]), 1);
    if (!replay) throw new Error(`sin animación para ${event}`);
    return replay;
};

/** La palabra grande va letra por letra (un span por letra) */
const bigWord = () => document.querySelector('.pa-big')?.textContent ?? null;

describe('PlayAnimation: se embasa por error', () => {
    // jsdom no trae la Web Animations API: basta con que exista
    const original = Element.prototype.animate;
    beforeAll(() => {
        Element.prototype.animate = vi.fn(() => ({ cancel: () => undefined, finished: Promise.resolve() }) as unknown as Animation);
    });
    afterAll(() => {
        Element.prototype.animate = original;
    });
    beforeEach(() => {
        i18n.changeLanguage('es');
    });

    it('error: la tarjeta del hit con «ERROR», quién batea y «Se embasa por error»', () => {
        const event = errorEvent('field_error');
        expect(event.kind).toBe('error');
        render(<PlayAnimation event={event} onDone={() => undefined} />);
        expect(document.querySelector('.pa-hitcard')).not.toBeNull();
        expect(bigWord()).toBe('ERROR');
        expect(screen.getByText('Se embasa por error')).toBeTruthy();
        expect(screen.queryByText('Se embasa por interferencia')).toBeNull();
        expect(document.querySelector('.pa-kicker')?.textContent).toBe('AAA · Juan Prueba');
        // Es una repetición pedida desde la cronología
        expect(screen.getByText('Repetición')).toBeTruthy();
    });

    it('interferencia del receptor: «ERROR» con «Se embasa por interferencia»', () => {
        render(<PlayAnimation event={errorEvent('catcher_interf')} onDone={() => undefined} />);
        expect(bigWord()).toBe('ERROR');
        expect(screen.getByText('Se embasa por interferencia')).toBeTruthy();
        expect(screen.queryByText('Se embasa por error')).toBeNull();
    });

    it('si con el error entra una carrera impulsada, dice cuántas remolca (como en un hit)', () => {
        render(<PlayAnimation event={errorEvent('field_error', { rbi: 1, away: 1, scoring: true })} onDone={() => undefined} />);
        expect(bigWord()).toBe('ERROR');
        expect(screen.getAllByText('Remolca 1 carrera').length).toBeGreaterThan(0);
        expect(screen.queryByText('Se embasa por error')).toBeNull();
    });
});
