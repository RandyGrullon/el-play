import { describe, it, expect, afterEach } from 'vitest';
import {
    SWIPE,
    backAction,
    backFallback,
    blocksSwipe,
    canGoBack,
    hasOpenDialog,
    hasTextSelection,
    lockDirection,
    openedByLinkEntry,
    releaseVelocity,
    shouldGoBack,
    startsInSystemEdge
} from './swipeBack';

describe('backFallback', () => {
    it('no hay gesto en las páginas de la barra', () => {
        for (const path of ['/', '/posiciones', '/fantasy', '/mas', '/posiciones/']) expect(backFallback(path)).toBeNull();
    });

    it('cada página vuelve a la suya si no hay historial (como sus botones de atrás)', () => {
        expect(backFallback('/juego/12345')).toBe('/');
        expect(backFallback('/jugador/12345678')).toBe('/estadisticas');
        expect(backFallback('/equipo/99991')).toBe('/posiciones');
        expect(backFallback('/lideres')).toBe('/posiciones');
        expect(backFallback('/estadisticas')).toBe('/posiciones');
        expect(backFallback('/privacidad')).toBe('/mas');
        expect(backFallback('/otra-cosa')).toBe('/');
    });
});

describe('canGoBack', () => {
    it('usa la posición que guarda BrowserRouter', () => {
        expect(canGoBack('abc123', { idx: 0, key: 'abc123' })).toBe(false);
        expect(canGoBack('abc123', { idx: 2, key: 'abc123' })).toBe(true);
    });

    it('sin posición, la llave de la entrada', () => {
        expect(canGoBack('default', null)).toBe(false);
        expect(canGoBack('abc123', null)).toBe(true);
        expect(canGoBack('abc123', { usr: null })).toBe(true);
    });
});

describe('backAction', () => {
    it('nada en las páginas de la barra', () => {
        expect(backAction('/', true)).toBeNull();
        expect(backAction('/fantasy', false)).toBeNull();
    });

    it('atrás en el historial o la página de respaldo', () => {
        expect(backAction('/juego/12345', true)).toEqual({ kind: 'pop' });
        expect(backAction('/juego/12345', false)).toEqual({ kind: 'replace', to: '/' });
        expect(backAction('/equipo/99991', false)).toEqual({ kind: 'replace', to: '/posiciones' });
    });

    it('las pestañas de Posiciones vuelven a Posiciones salvo que se abrieran con un enlace', () => {
        expect(backAction('/lideres', true)).toEqual({ kind: 'replace', to: '/posiciones' });
        expect(backAction('/estadisticas', true, false)).toEqual({ kind: 'replace', to: '/posiciones' });
        expect(backAction('/estadisticas', true, true)).toEqual({ kind: 'pop' });
        expect(backAction('/estadisticas', false, true)).toEqual({ kind: 'replace', to: '/posiciones' });
    });
});

describe('openedByLinkEntry', () => {
    it('abrir una pestaña con un enlace la marca; cambiar de pestaña hereda; volver no cambia', () => {
        expect(openedByLinkEntry('PUSH', '/estadisticas')).toBe(true);
        expect(openedByLinkEntry('PUSH', '/posiciones')).toBe(false);
        expect(openedByLinkEntry('PUSH', '/jugador/12345678')).toBe(false);
        expect(openedByLinkEntry('REPLACE', '/lideres', true)).toBe(true);
        expect(openedByLinkEntry('REPLACE', '/lideres', false)).toBe(false);
        expect(openedByLinkEntry('REPLACE', '/lideres')).toBe(false);
        expect(openedByLinkEntry('REPLACE', '/posiciones', true)).toBe(false);
        expect(openedByLinkEntry('POP', '/lideres', true)).toBeUndefined();
    });
});

describe('lockDirection', () => {
    it('espera a que el dedo se mueva lo suficiente', () => {
        expect(lockDirection(0, 0)).toBeNull();
        expect(lockDirection(6, 6)).toBeNull();
        expect(lockDirection(SWIPE.lock - 1, 0)).toBeNull();
    });

    it('de lado hacia la derecha es para volver', () => {
        expect(lockDirection(SWIPE.lock, 0)).toBe('back');
        expect(lockDirection(30, 15)).toBe('back');
        expect(lockDirection(30, -15)).toBe('back');
    });

    it('lo demás es desplazar la página', () => {
        expect(lockDirection(-30, 0)).toBe('other');
        expect(lockDirection(0, 30)).toBe('other');
        expect(lockDirection(30, 20)).toBe('other');
        expect(lockDirection(30, -25)).toBe('other');
    });
});

describe('releaseVelocity', () => {
    it('mide con lo último que se movió el dedo', () => {
        const samples = [
            { x: 0, t: 0 },
            { x: 10, t: 200 },
            { x: 40, t: 250 },
            { x: 100, t: 300 }
        ];
        expect(releaseVelocity(samples, 300)).toBeCloseTo(90 / 100);
    });

    it('cero si el dedo se quedó quieto antes de soltar', () => {
        expect(releaseVelocity([{ x: 0, t: 0 }, { x: 100, t: 50 }], 400)).toBe(0);
        expect(releaseVelocity([{ x: 100, t: 390 }], 400)).toBe(0);
    });

    it('negativa si iba hacia la izquierda', () => {
        expect(releaseVelocity([{ x: 200, t: 0 }, { x: 150, t: 50 }], 50)).toBeLessThan(0);
    });
});

describe('shouldGoBack', () => {
    it('pasado el 35 % del ancho', () => {
        expect(shouldGoBack(140, 0, 400)).toBe(true);
        expect(shouldGoBack(139, 0, 400)).toBe(false);
    });

    it('o soltando rápido hacia la derecha', () => {
        expect(shouldGoBack(40, 0.6, 400)).toBe(true);
        expect(shouldGoBack(40, 0.5, 400)).toBe(false);
        expect(shouldGoBack(0, 2, 400)).toBe(false);
    });
});

describe('startsInSystemEdge', () => {
    it('solo en Safari de iPhone fuera de la app instalada', () => {
        expect(startsInSystemEdge(12, true, false)).toBe(true);
        expect(startsInSystemEdge(SWIPE.iosEdge, true, false)).toBe(true);
        expect(startsInSystemEdge(SWIPE.iosEdge + 1, true, false)).toBe(false);
        expect(startsInSystemEdge(12, true, true)).toBe(false);
        expect(startsInSystemEdge(12, false, false)).toBe(false);
    });
});

describe('blocksSwipe', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    const mount = (html: string) => {
        document.body.innerHTML = `<div id="shell">${html}</div>`;
        return document.getElementById('shell')!;
    };
    const sized = (element: Element, scrollWidth: number, clientWidth: number) => {
        Object.defineProperty(element, 'scrollWidth', { configurable: true, value: scrollWidth });
        Object.defineProperty(element, 'clientWidth', { configurable: true, value: clientWidth });
    };

    it('deja deslizar sobre el texto, las tarjetas y los botones de la página', () => {
        const shell = mount('<main><section><p id="text">Hola</p><a href="/juego/12345"><span id="link">Juego</span></a><button id="button"><svg id="icon"><path id="path" /></svg></button></section></main>');
        for (const id of ['text', 'link', 'button', 'icon', 'path']) expect(blocksSwipe(document.getElementById(id), shell)).toBe(false);
    });

    it('no en campos ni controles que se arrastran', () => {
        const shell = mount('<input id="search" /><textarea id="note"></textarea><select id="pick"><option>1</option></select><input id="range" type="range" /><div role="slider" id="slider"><span id="thumb"></span></div><div contenteditable="true"><b id="rich">x</b></div>');
        for (const id of ['search', 'note', 'pick', 'range', 'thumb', 'rich']) expect(blocksSwipe(document.getElementById(id), shell)).toBe(true);
    });

    it('no en el terreno, el mapa de batazos ni lo marcado con data-no-swipe', () => {
        const shell = mount('<div class="fld"><svg><circle id="ball" /></svg></div><svg class="fld"><path id="park" /></svg><div data-no-swipe><span id="marked"></span></div>');
        for (const id of ['ball', 'park', 'marked']) expect(blocksSwipe(document.getElementById(id), shell)).toBe(true);
    });

    it('no dentro de una hoja o un diálogo', () => {
        const shell = mount('<div role="dialog" aria-modal="true"><p id="sheet">Hoja</p></div>');
        expect(blocksSwipe(document.getElementById('sheet'), shell)).toBe(true);
    });

    it('no en lo que se desplaza de lado; sí si todo cabe', () => {
        const shell = mount('<div id="row" style="overflow-x: auto"><span id="chip">Chip</span></div><div id="fits" style="overflow-x: auto"><span id="small">Cabe</span></div><div id="clip" style="overflow-x: hidden"><span id="cut">Cortado</span></div>');
        sized(document.getElementById('row')!, 800, 375);
        sized(document.getElementById('fits')!, 300, 375);
        sized(document.getElementById('clip')!, 800, 375);
        expect(blocksSwipe(document.getElementById('chip'), shell)).toBe(true);
        expect(blocksSwipe(document.getElementById('small'), shell)).toBe(false);
        expect(blocksSwipe(document.getElementById('cut'), shell)).toBe(false);
    });

    it('no fuera de la página', () => {
        const shell = mount('<p>Página</p>');
        const outside = document.createElement('div');
        document.body.appendChild(outside);
        expect(blocksSwipe(outside, shell)).toBe(true);
        expect(blocksSwipe(null, shell)).toBe(true);
    });

    it('un nodo de texto cuenta como su elemento', () => {
        const shell = mount('<p id="text">Hola</p>');
        expect(blocksSwipe(document.getElementById('text')!.firstChild, shell)).toBe(false);
    });
});

describe('hasOpenDialog y hasTextSelection', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('ve las hojas abiertas', () => {
        expect(hasOpenDialog(document)).toBe(false);
        document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
        expect(hasOpenDialog(document)).toBe(true);
    });

    it('ve el texto seleccionado', () => {
        expect(hasTextSelection(null)).toBe(false);
        document.body.innerHTML = '<p id="text">Texto de prueba</p>';
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        expect(hasTextSelection(selection)).toBe(false);
        const range = document.createRange();
        range.selectNodeContents(document.getElementById('text')!);
        selection.addRange(range);
        expect(hasTextSelection(selection)).toBe(true);
        selection.removeAllRanges();
    });
});
