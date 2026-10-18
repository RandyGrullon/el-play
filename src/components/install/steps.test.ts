import { describe, expect, it } from 'vitest';
import es from '../../locales/es.json';
import en from '../../locales/en.json';
import { BROWSERS, detectBrowser, type InstallPlatform } from '../../lib/install';
import { guideFor } from './steps';

// User agents reales de cada navegador (octubre de 2026)
const UA = {
    safariIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
    chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.96 Mobile/15E148 Safari/604.1',
    firefoxIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/143.1 Mobile/15E148 Safari/605.1.15',
    edgeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 EdgiOS/141.3537.71 Mobile/15E148 Safari/605.1.15',
    instagramIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 401.0.0.31.89 (iPhone15,3; iOS 18_6; es_DO; es; scale=3.00; 1290x2796)',
    chromeAndroid: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    samsung: 'Mozilla/5.0 (Linux; Android 15; SAMSUNG SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
    firefoxAndroid: 'Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0',
    edgeAndroid: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 EdgA/141.0.3537.70',
    operaAndroid: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36 OPR/91.0.4516.83213',
    facebookAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/530.0.0.47.73;]',
    xiaomi: 'Mozilla/5.0 (Linux; U; Android 14; es-us; 23021RAA2Y Build/UKQ1.230917.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.119 Mobile Safari/537.36 XiaoMi/MiuiBrowser/14.16.0-gn',
    chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.3537.71',
    firefoxWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0',
    safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'
};

describe('instalar: navegador de quien abre la guía', () => {
    it('iPhone: Safari, Chrome, Firefox, Edge e Instagram', () => {
        expect(detectBrowser(UA.safariIos, 5)).toEqual({ platform: 'ios', browser: 'safari' });
        expect(detectBrowser(UA.chromeIos, 5)).toEqual({ platform: 'ios', browser: 'chrome' });
        expect(detectBrowser(UA.firefoxIos, 5)).toEqual({ platform: 'ios', browser: 'firefox' });
        expect(detectBrowser(UA.edgeIos, 5)).toEqual({ platform: 'ios', browser: 'edge' });
        expect(detectBrowser(UA.instagramIos, 5)).toEqual({ platform: 'ios', browser: 'inapp' });
        // Brave se hace pasar por Safari: se reconoce por navigator.brave
        expect(detectBrowser(UA.safariIos, 5, true)).toEqual({ platform: 'ios', browser: 'other' });
        // iPad en modo escritorio: dice Macintosh pero tiene pantalla táctil
        expect(detectBrowser(UA.safariMac, 5)).toEqual({ platform: 'ios', browser: 'safari' });
    });

    it('Android: Chrome, Samsung Internet, Firefox, Edge, Opera, Facebook y otros', () => {
        expect(detectBrowser(UA.chromeAndroid, 5)).toEqual({ platform: 'android', browser: 'chrome' });
        expect(detectBrowser(UA.samsung, 5)).toEqual({ platform: 'android', browser: 'samsung' });
        expect(detectBrowser(UA.firefoxAndroid, 5)).toEqual({ platform: 'android', browser: 'firefox' });
        expect(detectBrowser(UA.edgeAndroid, 5)).toEqual({ platform: 'android', browser: 'edge' });
        expect(detectBrowser(UA.operaAndroid, 5)).toEqual({ platform: 'android', browser: 'opera' });
        expect(detectBrowser(UA.facebookAndroid, 5)).toEqual({ platform: 'android', browser: 'inapp' });
        expect(detectBrowser(UA.xiaomi, 5)).toEqual({ platform: 'android', browser: 'other' });
        expect(detectBrowser(UA.chromeAndroid, 5, true)).toEqual({ platform: 'android', browser: 'other' });
    });

    it('computadora: Chrome, Edge, Firefox y Safari de la Mac', () => {
        expect(detectBrowser(UA.chromeWin, 0)).toEqual({ platform: 'desktop', browser: 'chrome' });
        expect(detectBrowser(UA.edgeWin, 0)).toEqual({ platform: 'desktop', browser: 'edge' });
        expect(detectBrowser(UA.firefoxWin, 0)).toEqual({ platform: 'desktop', browser: 'firefox' });
        expect(detectBrowser(UA.safariMac, 0)).toEqual({ platform: 'desktop', browser: 'safari' });
    });
});

describe('instalar: la guía de cada navegador', () => {
    // t de verdad sobre los JSON: si falta un texto en un idioma, la prueba lo dice
    const translator = (locale: Record<string, unknown>) => (key: string) => {
        const value = key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), locale);
        if (typeof value !== 'string' || !value) throw new Error(`falta el texto ${key}`);
        return value;
    };

    it('todas las combinaciones tienen pasos y textos en español y en inglés', () => {
        for (const locale of [es, en]) {
            const t = translator(locale as Record<string, unknown>);
            for (const platform of Object.keys(BROWSERS) as InstallPlatform[]) {
                for (const browser of BROWSERS[platform]) {
                    for (const prompt of [false, true]) {
                        for (const safariNew of [false, true]) {
                            const guide = guideFor(platform, browser, { prompt, safariNew }, t);
                            expect(guide.steps.length).toBeGreaterThan(0);
                            guide.steps.forEach((step) => expect(step.text.length).toBeGreaterThan(5));
                            // Los nombres de los navegadores y de los sistemas también existen
                            expect(t(`install.browsers.${browser}`)).toBeTruthy();
                            expect(t(`install.platforms.${platform}`)).toBeTruthy();
                        }
                    }
                }
            }
        }
    });

    it('cada navegador con sus pasos: Samsung con «Agregar página a», Edge con «Agregar al teléfono», Instagram abre Safari primero', () => {
        const t = translator(es as Record<string, unknown>);
        const samsung = guideFor('android', 'samsung', { prompt: false, safariNew: true }, t);
        expect(samsung.steps[1].art?.items?.[samsung.steps[1].art.highlight ?? 0]).toBe('Agregar página a');
        expect(samsung.steps[0].art).toMatchObject({ icon: 'lines', spot: 'right' });
        const edge = guideFor('android', 'edge', { prompt: false, safariNew: true }, t);
        expect(edge.steps[1].art?.items?.[edge.steps[1].art.highlight ?? 0]).toBe('Agregar al teléfono');
        const instagram = guideFor('ios', 'inapp', { prompt: false, safariNew: true }, t);
        expect(instagram.steps[0].scene).toBe('inapp-bar');
        expect(instagram.steps.some((step) => step.scene === 'safari26-bar')).toBe(true);
        // Chrome en Android con el aviso: un toque
        expect(guideFor('android', 'chrome', { prompt: true, safariNew: true }, t).steps[0].scene).toBe('app-button');
        // Safari viejo (antes de iOS 26): Compartir abajo
        expect(guideFor('ios', 'safari', { prompt: false, safariNew: false }, t).steps[0].scene).toBe('safari-old-bar');
        // Firefox en la computadora: no instala, se dice y se ofrece favoritos
        const firefox = guideFor('desktop', 'firefox', { prompt: false, safariNew: true }, t);
        expect(firefox.steps).toHaveLength(1);
        expect(firefox.note).toMatch(/Chrome, Edge o Safari/);
        expect(guideFor('desktop', 'safari', { prompt: false, safariNew: true }, t).steps[0].scene).toBe('mac-menu');
    });
});
