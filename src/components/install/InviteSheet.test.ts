import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { BROWSERS, type InstallPlatform } from '../../lib/install';
import { shortVersion } from '../../lib/appUpdate';
import { inviteSteps } from './InviteSheet';
import { guideFor } from './steps';

// Dirección de prueba (no es la de verdad)
const HOST = 'prueba.example.test';

describe('pasarle El Play a alguien', () => {
    const t = i18n.getFixedT('es');

    it('el primer paso es abrir la web en su navegador y siguen los de su guía', () => {
        const { steps } = inviteSteps('android', 'chrome', HOST, t);
        const guide = guideFor('android', 'chrome', { prompt: false, safariNew: true }, t);
        expect(steps[0]).toBe(`Abre ${HOST} en Chrome.`);
        expect(steps.slice(1)).toEqual(guide.steps.map((step) => step.text));
    });

    it('dentro de Instagram o Facebook no se dice «abre»: la guía empieza por sacarlo al navegador', () => {
        const { steps } = inviteSteps('ios', 'inapp', HOST, t);
        expect(steps.some((text) => text.includes(HOST))).toBe(false);
        expect(steps).toEqual(guideFor('ios', 'inapp', { prompt: false, safariNew: true }, t).steps.map((step) => step.text));
    });

    it('todos los sistemas y navegadores dan pasos con texto (en los dos idiomas)', () => {
        for (const lang of ['es', 'en']) {
            const fixed = i18n.getFixedT(lang);
            for (const platform of Object.keys(BROWSERS) as InstallPlatform[]) {
                for (const browser of BROWSERS[platform]) {
                    const { steps } = inviteSteps(platform, browser, HOST, fixed);
                    expect(steps.length).toBeGreaterThan(1);
                    for (const text of steps) expect(text).not.toMatch(/install\.|\{\{/);
                }
            }
        }
    });
});

describe('versión en «Más»', () => {
    it('el commit en corto; sin commit conocido, «dev»', () => {
        expect(shortVersion('abcdef1234567890abcdef1234567890abcdef12')).toBe('abcdef1');
        expect(shortVersion('dev')).toBe('dev');
        expect(shortVersion('unknown')).toBe('dev');
    });
});
