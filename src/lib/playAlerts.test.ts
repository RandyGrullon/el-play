import { describe, expect, it } from 'vitest';
import { leadTurn, playAlertOf } from './playAlerts';

const all = { runs: true, lead: true, hits: true };
const snap = (away: number, home: number, awayHits = 0, homeHits = 0) => ({ away, home, awayHits, homeHits });

describe('avisos jugada a jugada con la app abierta', () => {
    it('la primera lectura no avisa (lo de antes ya pasó)', () => {
        expect(playAlertOf(undefined, snap(3, 1, 7, 4), all)).toBeNull();
    });

    it('carrera, cambio de ventaja, empate y le dan la vuelta', () => {
        expect(playAlertOf(snap(0, 0), snap(1, 0, 1), all)).toEqual({ kind: 'lead', side: 'away', lead: 'ahead' });
        expect(playAlertOf(snap(2, 0), snap(3, 0, 1), all)).toEqual({ kind: 'runs', side: 'away' });
        expect(playAlertOf(snap(2, 0), snap(2, 2, 0, 2), all)).toEqual({ kind: 'lead', side: 'home', lead: 'tie' });
        expect(playAlertOf(snap(2, 1), snap(2, 3, 0, 2), all)).toEqual({ kind: 'lead', side: 'home', lead: 'comeback' });
        expect(leadTurn({ away: 1, home: 1 }, { away: 1, home: 2 }, 'home')).toBe('ahead');
    });

    it('hit sin carreras; nada si no cambió', () => {
        expect(playAlertOf(snap(1, 1, 3, 3), snap(1, 1, 3, 4), all)).toEqual({ kind: 'hits', side: 'home' });
        expect(playAlertOf(snap(1, 1, 3, 3), snap(1, 1, 3, 3), all)).toBeNull();
    });

    it('respeta lo que se apagó: sin ventaja avisa la carrera; sin carreras ni ventaja, el hit que la remolcó; sin nada, nada', () => {
        expect(playAlertOf(snap(0, 0), snap(1, 0, 1), { ...all, lead: false })).toEqual({ kind: 'runs', side: 'away' });
        expect(playAlertOf(snap(0, 0), snap(1, 0, 1), { runs: false, lead: false, hits: true })).toEqual({ kind: 'hits', side: 'away' });
        expect(playAlertOf(snap(0, 0), snap(1, 0, 0), { runs: false, lead: false, hits: true })).toBeNull();
        expect(playAlertOf(snap(0, 0), snap(1, 0, 1), { runs: false, lead: false, hits: false })).toBeNull();
        expect(playAlertOf(snap(1, 1, 3, 3), snap(1, 1, 3, 4), { ...all, hits: false })).toBeNull();
    });

    it('si anotaron los dos entre lecturas cuenta el que anotó más, sin cambio de ventaja', () => {
        expect(playAlertOf(snap(1, 1), snap(2, 3), all)).toEqual({ kind: 'runs', side: 'home' });
    });
});
