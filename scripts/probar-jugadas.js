// Casos de prueba de la lógica pura de las animaciones de jugada (los mismos de la web: lib.test.ts, runners.test.ts y
// playEventsNew.test.ts): el vuelo del jonrón a escala (src/lib/flight.ts), los corredores que anotan en un hit o una
// base por bolas (src/lib/runners.ts), lo que lleva cada jugada (src/lib/playEvents.ts) y, de paso, los juegos
// suspendidos en espera (src/lib/baseball.ts y src/lib/polling.ts) y los avisos de los juegos y del Fantasy
// (src/lib/gameAlerts.ts: qué se programa, qué se avisa y que no se repita). La app no tiene corredor de pruebas: los .ts se
// pasan a JavaScript con el TypeScript del proyecto en una carpeta temporal y se prueban con node:assert.
//
// Uso:  node scripts/probar-jugadas.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ts = require('typescript');

// La raíz de la app (donde está su package.json), se corra desde donde se corra
const ROOT = path.dirname(require.resolve('../package.json'));
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'el-play-jugadas-'));

// Pasa un archivo de src/lib a CommonJS (los `import type` se borran solos)
const compile = (name) => {
    const source = fs.readFileSync(path.join(ROOT, 'src', 'lib', `${name}.ts`), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
    fs.writeFileSync(path.join(OUT, `${name}.js`), outputText);
};
['flight', 'runners', 'playEvents', 'baseball', 'polling', 'gameAlerts'].forEach(compile);
// playEvents usa el modo PRO de la cuenta (React Native): aquí siempre Lite
fs.writeFileSync(path.join(OUT, 'pro.js'), 'exports.proActive = () => false;\n');

const { camera, flightMs, flightOf, gamedayToFeet, groundAt, heightAt, parkFor, wallAt, wallCrossing } = require(path.join(OUT, 'flight.js'));
const { basesOf, legsOf, runnerPaths, walkPaths } = require(path.join(OUT, 'runners.js'));
const { forMode, leadChange, newPlayEvents } = require(path.join(OUT, 'playEvents.js'));
const { isOnHold } = require(path.join(OUT, 'baseball.js'));
const { gameInterval } = require(path.join(OUT, 'polling.js'));
const alertsLib = require(path.join(OUT, 'gameAlerts.js'));

let failed = 0;
const it = (name, run) => {
    try {
        run();
        console.log(`  ok  ${name}`);
    } catch (error) {
        failed += 1;
        console.log(`  MAL ${name}\n      ${error.message.split('\n').join('\n      ')}`);
    }
};
// Lo de vitest que usan los casos: toBeCloseTo (decimales), toMatchObject (lo que se pide, sin lo demás)
const close = (actual, expected, digits = 2) => assert.ok(Math.abs(actual - expected) < 10 ** -digits / 2, `${actual} no está cerca de ${expected}`);
const partial = (actual, expected) => {
    Object.entries(expected).forEach(([key, value]) => {
        if (value && typeof value === 'object') partial(actual?.[key], value);
        else assert.deepStrictEqual(actual?.[key], value, `${key}: ${JSON.stringify(actual?.[key])} en vez de ${JSON.stringify(value)}`);
    });
};

console.log('vuelo del jonrón a escala');
const atBat = (hit) => ({ pitches: [{ hit: null }, { hit }] });

it('el parque: medidas de MLB en Quisqueya, Cibao y Tetelo; genérico (sin medidas a la vista) en los demás', () => {
    partial(parkFor('Estadio Quisqueya Juan Marichal'), { left: 335, center: 411, right: 335, known: true });
    partial(parkFor('Estadio Cibao'), { center: 385, known: true });
    partial(parkFor('Estadio Julian Javier'), { known: false });
    const park = parkFor('Estadio Quisqueya Juan Marichal');
    assert.strictEqual(wallAt(park, -45), 335);
    assert.strictEqual(wallAt(park, 0), 411);
    assert.ok(wallAt(park, 10) > park.rightCenter);
    assert.ok(wallAt(park, 10) < 411);
});

it('jonrones reales: hacia dónde salió, cuánto voló y qué tan alto', () => {
    assert.deepStrictEqual(gamedayToFeet(125.42, 198.27), { x: 0, y: 0 });
    // Agustín Ramírez, 453 pies por el left (851464)
    const left = flightOf(atBat({ ev: 109.1, la: 22, dist: 453, x: 38.6, y: 36.9, traj: 'fly_ball' }));
    assert.ok(left.deg < -15);
    close(Math.hypot(left.land.x, left.land.y), 453, 0);
    assert.ok(left.apex > 60);
    // Jesús Made, 408 por el right (851491); Carlos Jorge, 404 al center (851509)
    assert.ok(flightOf(atBat({ ev: 106.8, la: 31, dist: 408, x: 219.3, y: 79.2, traj: 'fly_ball' })).deg > 15);
    assert.ok(Math.abs(flightOf(atBat({ ev: 100.1, la: 28, dist: 404, x: 118.6, y: 27.4, traj: 'fly_ball' })).deg) < 5);
    // Sin distancia de MLB, la del punto marcado; sin punto, no hay vuelo (va la animación de siempre)
    close(flightOf(atBat({ ev: null, la: null, dist: null, x: 125.42, y: 38.27, traj: 'fly_ball' })).dist, 400, 0);
    assert.strictEqual(flightOf(atBat({ ev: 100, la: 30, dist: 400 })), null);
    assert.ok(wallCrossing(left, parkFor('Estadio Quisqueya Juan Marichal')) > 0.7);
});

it('la curva: sale del piso, sube hasta el pico al 58 % y vuelve a caer; el vuelo dura según la distancia', () => {
    const flight = { apex: 100 };
    assert.strictEqual(heightAt(flight, 0), 0);
    assert.strictEqual(heightAt(flight, 0.58), 100);
    close(heightAt(flight, 1), 0, 6);
    assert.strictEqual(groundAt(0), 0);
    assert.strictEqual(groundAt(1), 1);
    assert.ok(groundAt(0.5) > 0.5);
    assert.ok(flightMs({ dist: 453 }) > flightMs({ dist: 404 }));
});

it('la cámara: home abajo y la cerca del center más arriba que home', () => {
    const park = parkFor('Estadio Quisqueya Juan Marichal');
    const project = camera(park, 360, 250);
    const home = project(0, 0, 0);
    const center = project(0, 411, 0);
    const high = project(0, 200, 100);
    assert.ok(home.y > center.y);
    assert.ok(high.y < project(0, 200, 0).y);
    assert.ok(home.y <= 250);
});

console.log('corredores en un hit: quién anota y hasta dónde llega cada uno');
const empty = { first: false, second: false, third: false };

it('sencillo: sin nadie en base, uno en segunda que anota y bases llenas con una remolcada', () => {
    assert.deepStrictEqual(runnerPaths('single', empty, 0), [{ from: 0, to: 1, batter: true }]);
    assert.deepStrictEqual(runnerPaths('single', { ...empty, second: true }, 1), [
        { from: 2, to: 4, batter: false },
        { from: 0, to: 1, batter: true }
    ]);
    assert.deepStrictEqual(runnerPaths('single', { first: true, second: true, third: true }, 1), [
        { from: 3, to: 4, batter: false },
        { from: 2, to: 3, batter: false },
        { from: 1, to: 2, batter: false },
        { from: 0, to: 1, batter: true }
    ]);
});

it('doble: remolca 1 desde primera; remolca 2; triple con bases llenas remolca 3', () => {
    assert.deepStrictEqual(runnerPaths('double', { ...empty, first: true }, 1), [
        { from: 1, to: 4, batter: false },
        { from: 0, to: 2, batter: true }
    ]);
    assert.strictEqual(runnerPaths('double', { ...empty, first: true, second: true }, 2).filter((p) => p.to === 4).length, 2);
    // Doble sin remolcar con uno en primera: llega a tercera
    assert.deepStrictEqual(runnerPaths('double', { ...empty, first: true }, 0), [
        { from: 1, to: 3, batter: false },
        { from: 0, to: 2, batter: true }
    ]);
    assert.strictEqual(runnerPaths('triple', { first: true, second: true, third: true }, 3).filter((p) => p.to === 4).length, 3);
});

it('jonrón: anotan todos (con dos en base, 3 carreras); grand slam con las bases llenas', () => {
    assert.deepStrictEqual(runnerPaths('hr', { ...empty, first: true, third: true }, 3), [
        { from: 3, to: 4, batter: false },
        { from: 1, to: 4, batter: false },
        { from: 0, to: 4, batter: true }
    ]);
    assert.strictEqual(runnerPaths('hr', null, 4).length, 4);
    assert.deepStrictEqual(runnerPaths('hr', empty, 1), [{ from: 0, to: 4, batter: true }]);
});

it('sin saber quién estaba (o si no cuadra con las carreras): anotan los de las bases más altas', () => {
    assert.deepStrictEqual(runnerPaths('double', null, 2), [
        { from: 3, to: 4, batter: false },
        { from: 2, to: 4, batter: false },
        { from: 0, to: 2, batter: true }
    ]);
    assert.strictEqual(runnerPaths('single', { ...empty, first: true }, 2).filter((p) => p.to === 4).length, 2);
    assert.strictEqual(legsOf({ from: 1, to: 4 }), 3);
    assert.strictEqual(basesOf(null), null);
    assert.deepStrictEqual(basesOf({ first: { id: 1 }, second: null, third: null }), { first: true, second: false, third: false });
});

// En la app `runs` es { count, away, home } (la forma del PRO) en vez del { before, after } de la web
it('la jugada lleva el estadio, quién estaba en base y las carreras que entraron', () => {
    const team = (id) => ({ id, abbrev: `T${id}`, color: '#000', logo: '' });
    const turn = (i, extra) => ({ i, inning: 3, top: true, complete: true, scoring: false, batter: { id: i, name: `B${i}`, side: 'R' }, pitcher: { id: 99, name: 'P', hand: 'R' }, event: 'field_out', eventLabel: null, desc: '', rbi: 0, away: 1, home: 0, outs: 1, pitches: [], actions: [], ...extra });
    const prev = { gamePk: 1, state: 'live', away: team(1), home: team(2), venue: 'Estadio Quisqueya', runners: { first: { id: 5 }, second: null, third: { id: 6 } }, atBats: [turn(0, {}), turn(1, { complete: false })] };
    const next = { ...prev, runners: { first: null, second: null, third: null }, atBats: [turn(0, {}), turn(1, { event: 'double', rbi: 2, away: 3, scoring: true })] };
    const [event] = newPlayEvents(prev, next);
    partial(event, { kind: 'double', venue: 'Estadio Quisqueya', bases: { first: true, second: false, third: true }, runs: { count: 2, away: 3, home: 0 } });
    // Una base por bolas en la misma lectura sabe quién estaba en base, pero del hit siguiente ya no se sabe
    const later = { ...next, atBats: [turn(0, {}), turn(1, { event: 'walk', away: 1 }), turn(2, { event: 'single', rbi: 1, away: 2 })] };
    const [walk, single] = newPlayEvents(prev, later);
    partial(walk, { kind: 'walk', walk: 'bb', bases: { first: true, second: false, third: true } });
    partial(single, { kind: 'single', bases: null, runs: { count: 1, away: 2, home: 0 } });
});

console.log('base por bolas, robo, relevo, cambio en el marcador y dejado en el terreno (Lite)');
// Nombres de prueba, como en la web (playEventsNew.test.ts)
const club = (id, abbrev, runs = 0, isWinner = false) => ({ id, abbrev, name: abbrev, logo: '', color: '#0069e0', record: null, teamName: abbrev, runs, hits: 0, errors: 0, lob: 0, isWinner });
const ab = (i, event, extra = {}) => ({
    i,
    inning: 1,
    top: true,
    complete: event !== null,
    scoring: false,
    batter: { id: 100 + i, name: `Bateador ${i}`, side: 'R' },
    pitcher: { id: 99, name: 'Lanzador Uno', hand: 'R' },
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
const juego = (atBats, extra = {}) => ({
    gamePk: 1,
    state: 'live',
    scheduledInnings: 9,
    atBats,
    inning: { n: 1, ordinal: '1st', isTop: true, state: 'Top' },
    runners: { first: null, second: null, third: null },
    away: club(672, 'LIC'),
    home: club(671, 'ESC'),
    box: {
        away: { batters: [{ id: 501, name: 'Corredor' }], pitchers: [] },
        home: {
            batters: [],
            pitchers: [
                { id: 601, name: 'Abridor', ip: '5.1', k: 6, np: 88 },
                { id: 602, name: 'Relevista', ip: '0.0', k: 0, np: 0 }
            ]
        }
    },
    ...extra
});

it('base por bolas: el bateador a primera y solo avanzan los forzados', () => {
    const batter = { from: 0, to: 1, batter: true };
    assert.deepStrictEqual(walkPaths(null), [batter]);
    assert.deepStrictEqual(walkPaths({ first: false, second: true, third: true }), [batter]);
    assert.deepStrictEqual(walkPaths({ first: true, second: false, third: true }), [{ from: 1, to: 2, batter: false }, batter]);
    assert.deepStrictEqual(walkPaths({ first: true, second: true, third: false }), [{ from: 2, to: 3, batter: false }, { from: 1, to: 2, batter: false }, batter]);
    assert.deepStrictEqual(walkPaths({ first: true, second: true, third: true }), [{ from: 3, to: 4, batter: false }, { from: 2, to: 3, batter: false }, { from: 1, to: 2, batter: false }, batter]);
});

it('base por bolas, intencional o golpeado: del equipo al bate y con quién estaba en base', () => {
    const prev = juego([ab(0, 'field_out')], { runners: { first: { id: 1, name: 'Uno' }, second: null, third: null } });
    const next = juego([ab(0, 'field_out'), ab(1, 'walk'), ab(2, 'intent_walk'), ab(3, 'hit_by_pitch')]);
    const events = newPlayEvents(prev, next).filter((event) => event.kind === 'walk');
    assert.deepStrictEqual(
        events.map((event) => [event.walk, event.team.abbrev]),
        [
            ['bb', 'LIC'],
            ['ibb', 'LIC'],
            ['hbp', 'LIC']
        ]
    );
    assert.deepStrictEqual(events[0].bases, { first: true, second: false, third: false });
    assert.strictEqual(events[1].bases, null);
});

it('robo: lo celebra el corredor; atrapado: la defensa; y van antes del resultado del turno', () => {
    const prev = juego([ab(0, null)]);
    const next = juego([
        ab(0, 'single', {
            actions: [
                { event: 'stolen_base_2b', desc: 'Juan Corredor steals (1) 2nd base.' },
                { event: 'caught_stealing_3b', desc: 'Juan Corredor caught stealing 3rd base.' }
            ]
        }),
        ab(1, null, { actions: [{ event: 'stolen_base_home', desc: 'Juan Corredor steals (2) home.' }] })
    ]);
    const events = newPlayEvents(prev, next);
    assert.deepStrictEqual(
        events.map((event) => [event.kind, event.team.abbrev, event.steal ? event.steal.base : null, event.steal ? event.steal.caught : null]),
        [
            ['steal', 'LIC', 2, false],
            ['steal', 'ESC', 3, true],
            ['single', 'LIC', null, null],
            ['steal', 'LIC', 4, false]
        ]
    );
    assert.strictEqual(events[0].steal.runner, 'Juan Corredor');
});

it('cambio de lanzador: del equipo que defiende, con la línea del que sale y su id del box', () => {
    const prev = juego([ab(0, 'field_out')]);
    const next = juego([ab(0, 'field_out'), ab(1, null, { pitcher: { id: 602, name: 'Juan Relevista', hand: 'R' }, actions: [{ event: 'pitching_substitution', desc: 'Pitching Change: Juan Relevista replaces Pedro Abridor.' }] })]);
    const [event] = newPlayEvents(prev, next);
    partial(event, { kind: 'pitchingChange', team: { abbrev: 'ESC' }, change: { in: { id: 602, name: 'Juan Relevista' }, out: { id: 601, name: 'Pedro Abridor' }, line: { ip: '5.1', k: 6, np: 88 } } });
    // En el PRO, igual que antes (sin la línea)
    const [pro] = newPlayEvents(prev, next, { pro: true });
    partial(pro, { kind: 'pitchingChange', change: { in: { id: 602 }, out: { id: 601 } } });
    assert.strictEqual(pro.change.line, undefined);
});

it('cambio en el marcador: abre, se va arriba, le da la vuelta, empata o nada', () => {
    assert.deepStrictEqual(leadChange({ away: 0, home: 0 }, { away: 1, home: 0 }), { side: 'away', lead: 'open' });
    assert.deepStrictEqual(leadChange({ away: 2, home: 2 }, { away: 2, home: 3 }), { side: 'home', lead: 'ahead' });
    assert.deepStrictEqual(leadChange({ away: 3, home: 1 }, { away: 3, home: 5 }), { side: 'home', lead: 'comeback' });
    assert.deepStrictEqual(leadChange({ away: 3, home: 1 }, { away: 3, home: 3 }), { side: 'home', lead: 'tie' });
    assert.strictEqual(leadChange({ away: 3, home: 1 }, { away: 4, home: 1 }), null);
    assert.strictEqual(leadChange({ away: 3, home: 0 }, { away: 3, home: 2 }), null);
    assert.strictEqual(leadChange({ away: 1, home: 1 }, { away: 2, home: 2 }), null);
    // Sale después de la jugada que lo hizo, con el equipo que anotó y cómo estaba antes
    const prev = juego([ab(0, 'field_out')], { away: club(672, 'LIC', 1), home: club(671, 'ESC', 2) });
    const next = juego([ab(0, 'field_out'), ab(1, 'home_run', { away: 3, home: 2 })], { away: club(672, 'LIC', 3), home: club(671, 'ESC', 2) });
    const events = newPlayEvents(prev, next);
    assert.deepStrictEqual(
        events.map((event) => event.kind),
        ['hr', 'lead']
    );
    partial(events[1], { team: { abbrev: 'LIC' }, lead: { change: 'comeback', before: { away: 1, home: 2 } } });
    // El PRO no lo tiene
    assert.ok(!newPlayEvents(prev, next, { pro: true }).some((event) => event.kind === 'lead'));
});

it('dejado en el terreno: el local gana en la baja de la última entrada (o en extra); si no, victoria normal', () => {
    const final = (lastTop, inning, scheduledInnings = 9, pro = false) => {
        const prev = juego([ab(0, null, { top: lastTop, inning })], { away: club(672, 'LIC', 3), home: club(671, 'ESC', 3) });
        const next = juego([ab(0, lastTop ? 'field_out' : 'single', { top: lastTop, inning })], { state: 'final', scheduledInnings, away: club(672, 'LIC', 3), home: club(671, 'ESC', 4, true) });
        return newPlayEvents(prev, next, { pro }).filter((event) => event.kind === 'win' || event.kind === 'walkoff');
    };
    assert.deepStrictEqual(
        final(false, 9).map((event) => event.kind),
        ['walkoff']
    );
    partial(final(false, 11)[0], { kind: 'walkoff', atBat: { i: 0 } });
    assert.deepStrictEqual(
        final(false, 7, 7).map((event) => event.kind),
        ['walkoff']
    );
    assert.deepStrictEqual(
        final(true, 9).map((event) => event.kind),
        ['win']
    );
    assert.deepStrictEqual(
        final(false, 6).map((event) => event.kind),
        ['win']
    );
    // El PRO sigue con la victoria de siempre
    partial(final(false, 9, 9, true)[0], { kind: 'win', atBat: null });
});

console.log('reto del ABS: revisando y resultado entre dos lecturas (los mismos casos de la web)');
{
    const lanz = (extra = {}) => ({ n: 1, x: 0, z: 2.5, top: 3.4, bot: 1.6, r: 'strike', code: 'C', call: 'Called Strike', type: null, typeDesc: null, mph: null, spin: null, zone: 5, b: 0, s: 1, ...extra });
    const turno = (pitches, extra = {}) => ({ ...ab(44, null, { top: false, pitches, batter: { id: 1, name: 'Bateador Prueba', side: 'R' }, pitcher: { id: 2, name: 'Lanzador Prueba', hand: 'R' } }), ...extra });
    const partida = (atBats, abs = null) => juego(atBats, { inning: { n: 6, ordinal: '6th', isTop: false, state: 'Bottom' }, away: club(668, 'TOR'), home: club(672, 'LIC'), abs });
    const bola = lanz({ r: 'ball', code: 'B', call: 'Ball' });
    const revisando = { ...lanz({ r: 'ball', code: 'B', call: 'Ball' }), abs: { inProgress: true, overturned: false, teamId: 672, by: null } };
    const cambiado = { ...lanz(), abs: { inProgress: false, overturned: true, teamId: 672, by: { id: 1, name: 'Bateador Prueba' } } };
    const retos = { away: { won: 1, lost: 0, remaining: 2 }, home: { won: 2, lost: 2, remaining: 1 }, challenging: null };

    it('aparece «revisando» con la decisión del umpire y después el resultado (una vez cada uno)', () => {
        const antes = partida([turno([lanz(), bola])]);
        const durante = partida([turno([lanz(), revisando])], { ...retos, challenging: 672 });
        const despues = partida([turno([lanz(), cambiado], { complete: true, event: 'strikeout' })], retos);
        const [primero] = newPlayEvents(antes, durante);
        partial(primero, { kind: 'abs', key: 'abs-44-1-checking', team: { abbrev: 'LIC' }, abs: { phase: 'checking', call: 'ball', original: 'ball' } });
        const eventos = newPlayEvents(durante, despues);
        // El reto va antes que la jugada del turno (el ponche que salió del reto)
        assert.deepStrictEqual(
            eventos.map((event) => event.kind),
            ['abs', 'k']
        );
        partial(eventos[0], { key: 'abs-44-1-result', abs: { phase: 'result', overturned: true, call: 'strike', original: 'ball', by: 'batter', remaining: 1 } });
        assert.deepStrictEqual(newPlayEvents(despues, despues), []);
        assert.deepStrictEqual(newPlayEvents(durante, durante), []);
        // En el PRO también (lo pinta la animación del Lite), una vez y antes del ponche
        assert.deepStrictEqual(
            newPlayEvents(durante, despues, { pro: true }).map((event) => event.kind),
            ['abs', 'k']
        );
    });

    it('si ya llegó resuelto (la revisión dura menos que una lectura) sale directo el resultado', () => {
        const confirmado = { ...lanz({ r: 'ball', code: 'B', call: 'Ball' }), abs: { inProgress: false, overturned: false, teamId: 668, by: { id: 2, name: 'Lanzador Prueba' } } };
        const [evento] = newPlayEvents(partida([turno([lanz()])]), partida([turno([lanz(), confirmado])], retos));
        partial(evento, { kind: 'abs', team: { abbrev: 'TOR' }, abs: { phase: 'result', overturned: false, call: 'ball', original: 'ball', by: 'pitcher', remaining: 2 } });
    });

    it('en «inteligentes» sale aunque el juego no sea de tu equipo', () => {
        const eventos = newPlayEvents(partida([turno([bola])]), partida([turno([revisando])]));
        assert.deepStrictEqual(
            forMode(eventos, 'smart', null, [668, 672]).map((event) => event.kind),
            ['abs']
        );
    });
}

console.log('juegos suspendidos');

it('suspendido: con fecha nueva se espera como programado; sin ella, en espera como un pospuesto', () => {
    const NOW = Date.parse('2026-11-05T20:00:00Z');
    const MIN = 60000;
    const at = (minutes) => new Date(NOW + minutes * MIN).toISOString();
    const partido = (minutes, detailedState) => ({ state: 'preview', detailedState, date: at(minutes) });
    assert.strictEqual(gameInterval(partido(45, 'Suspended'), NOW), 3 * MIN);
    assert.ok(gameInterval(partido(-10, 'Suspended: Rain'), NOW) < 15000);
    assert.strictEqual(gameInterval(partido(-120, 'Suspended: Rain'), NOW), 10 * MIN);
    assert.strictEqual(isOnHold({ detailedState: 'Suspended', date: at(60) }, NOW), false);
    assert.strictEqual(isOnHold({ detailedState: 'Suspended', date: at(-180) }, NOW), true);
    assert.strictEqual(isOnHold({ detailedState: 'Postponed', date: at(60) }, NOW), true);
    assert.strictEqual(isOnHold({ detailedState: 'Scheduled', date: at(-180) }, NOW), false);
});

console.log('avisos de los juegos y del Fantasy');

{
    const { DEFAULT_ALERT_KINDS, readAlertKinds, scheduledKinds, sameKinds, bellExpired, planTeamAlerts, watchedFromSchedule, watchedFromDetail, liveAlerts, liveAlertText, watchInterval, pruneNotified, fantasyStep, fantasyText } = alertsLib;
    const NOW = Date.parse('2026-11-05T23:00:00Z');
    const MIN = 60000;
    const HOUR = 60 * MIN;
    const at = (ms) => new Date(NOW + ms).toISOString();
    const ON = DEFAULT_ALERT_KINDS;
    const off = (...kinds) => ({ ...ON, ...Object.fromEntries(kinds.map((kind) => [kind, false])) });
    // Equipos y juegos de mentira (ids descarados)
    const equipo = (id, abbrev, extra = {}) => ({ id, abbrev, name: `Equipo ${abbrev}`, flag: null, score: null, hits: null, isWinner: false, ...extra });
    const juego = (gamePk, extra = {}) => ({ gamePk, state: 'preview', detailedState: 'Scheduled', date: at(2 * HOUR), live: null, away: equipo(11111, 'AAA'), home: equipo(22222, 'BBB'), ...extra });
    const visto = (gamePk, extra = {}) => watchedFromSchedule(juego(gamePk, extra));
    const opts = (extra = {}) => ({ bell: [], favoriteTeamId: null, kinds: ON, now: NOW, notified: () => false, ...extra });
    const t = (key, options = {}) => `${key}${JSON.stringify(options)}`;

    it('tipos de aviso: todos encendidos de fábrica; lo guardado manda y lo que no es sí/no se ignora', () => {
        assert.deepStrictEqual(readAlertKinds(undefined), ON);
        assert.deepStrictEqual(readAlertKinds('roto'), ON);
        assert.deepStrictEqual(readAlertKinds({ soon: false, final: 'no', extra: true }), off('soon'));
    });

    it('programados: 10 min antes solo con campana; playball con campana o tu equipo; nada si ya pasó o está apagado', () => {
        const start = NOW + HOUR;
        assert.deepStrictEqual(scheduledKinds({ bell: true, favorite: false, kinds: ON, start, now: NOW }), ['soon', 'start']);
        assert.deepStrictEqual(scheduledKinds({ bell: false, favorite: true, kinds: ON, start, now: NOW }), ['start']);
        assert.deepStrictEqual(scheduledKinds({ bell: false, favorite: false, kinds: ON, start, now: NOW }), []);
        assert.deepStrictEqual(scheduledKinds({ bell: true, favorite: false, kinds: off('soon'), start, now: NOW }), ['start']);
        assert.deepStrictEqual(scheduledKinds({ bell: true, favorite: true, kinds: off('start'), start, now: NOW }), ['soon']);
        // A 5 minutos ya no da tiempo para el de 10 minutos antes
        assert.deepStrictEqual(scheduledKinds({ bell: true, favorite: false, kinds: ON, start: NOW + 5 * MIN, now: NOW }), ['start']);
        assert.deepStrictEqual(scheduledKinds({ bell: true, favorite: false, kinds: ON, start: NOW - MIN, now: NOW }), []);
        assert.ok(sameKinds(['start', 'soon'], ['soon', 'start']));
        assert.ok(!sameKinds(undefined, []));
        assert.ok(!sameKinds(['soon'], ['soon', 'start']));
    });

    it('campana guardada: se queda hasta 12 h después de la hora (para el final); se va si el teléfono perdió sus avisos', () => {
        const pending = new Set(['a1']);
        assert.strictEqual(bellExpired({ ids: ['a1', 'a2'], date: at(HOUR) }, pending, NOW), false);
        assert.strictEqual(bellExpired({ ids: ['zz'], date: at(HOUR) }, pending, NOW), true);
        // Con todo apagado no hay avisos programados, pero la campana sigue
        assert.strictEqual(bellExpired({ ids: [], date: at(HOUR) }, pending, NOW), false);
        // Ya sonó el playball: sigue para el final
        assert.strictEqual(bellExpired({ ids: ['zz'], date: at(-3 * HOUR) }, pending, NOW), false);
        assert.strictEqual(bellExpired({ ids: ['zz'], date: at(-13 * HOUR) }, pending, NOW), true);
        // Formato viejo sin hora
        assert.strictEqual(bellExpired({ ids: ['a1'], date: null }, pending, NOW), false);
        assert.strictEqual(bellExpired({ ids: ['zz'], date: null }, pending, NOW), true);
    });

    it('playball de tu equipo: programa los suyos sin campana, reprograma si cambió la hora y quita lo que ya no va', () => {
        const fav = 11111;
        const games = [juego(900001), juego(900002, { away: equipo(33333, 'CCC') }), juego(900003, { date: at(5 * HOUR) }), juego(900004, { detailedState: 'Postponed' }), juego(900005, { startTimeTBD: true }), juego(900006, { state: 'live' })];
        let plan = planTeamAlerts({ games, current: {}, bell: [900003], favoriteTeamId: fav, kinds: ON, now: NOW });
        assert.deepStrictEqual(plan.schedule.map((game) => game.gamePk), [900001]);
        assert.deepStrictEqual(plan.cancel, []);
        const current = {
            900001: { ids: ['x'], date: at(HOUR), teamId: fav }, // cambió la hora
            900003: { ids: ['y'], date: at(5 * HOUR), teamId: fav }, // ahora tiene campana
            900004: { ids: ['z'], date: at(2 * HOUR), teamId: fav }, // pospuesto
            900099: { ids: ['w'], date: at(3 * HOUR), teamId: fav }, // no está en el calendario guardado: se deja
            900098: { ids: ['v'], date: at(-HOUR), teamId: fav } // ya sonó
        };
        plan = planTeamAlerts({ games, current, bell: [900003], favoriteTeamId: fav, kinds: ON, now: NOW });
        assert.deepStrictEqual(plan.cancel.sort(), ['900001', '900003', '900004', '900098']);
        assert.deepStrictEqual(plan.schedule.map((game) => game.gamePk), [900001]);
        // Otro favorito o el playball apagado: se quitan todos
        assert.strictEqual(planTeamAlerts({ games, current, bell: [], favoriteTeamId: 44444, kinds: ON, now: NOW }).cancel.length, 5);
        plan = planTeamAlerts({ games, current, bell: [], favoriteTeamId: fav, kinds: off('start'), now: NOW });
        assert.strictEqual(plan.cancel.length, 5);
        assert.deepStrictEqual(plan.schedule, []);
    });

    it('final: con campana o tu equipo, hasta 6 h después de la hora, una sola vez', () => {
        const final = visto(900010, { state: 'final', date: at(-3 * HOUR), away: equipo(11111, 'AAA', { score: 5, isWinner: true }), home: equipo(22222, 'BBB', { score: 3 }) });
        assert.deepStrictEqual(liveAlerts([final], opts()), []);
        assert.deepStrictEqual(
            liveAlerts([final], opts({ bell: [900010] })).map((alert) => alert.key),
            ['final-900010']
        );
        assert.strictEqual(liveAlerts([final], opts({ favoriteTeamId: 22222 })).length, 1);
        assert.strictEqual(liveAlerts([final], opts({ bell: [900010], kinds: off('final') })).length, 0);
        assert.strictEqual(liveAlerts([final], opts({ bell: [900010], notified: (key) => key === 'final-900010' })).length, 0);
        // El mismo juego dos veces en la misma lectura (calendario y detalle): un aviso
        assert.strictEqual(liveAlerts([final, final], opts({ bell: [900010] })).length, 1);
        assert.strictEqual(liveAlerts([{ ...final, date: at(-7 * HOUR) }], opts({ bell: [900010] })).length, 0);
        // Sin ganador todavía (empate suspendido): no
        assert.strictEqual(liveAlerts([{ ...final, away: { ...final.away, isWinner: false } }], opts({ bell: [900010] })).length, 0);
        const text = liveAlertText(liveAlerts([final], opts({ bell: [900010] }))[0], t, (team) => team.name);
        assert.strictEqual(text.title, 'notifications.final{"away":"AAA","awayRuns":5,"home":"BBB","homeRuns":3}');
        assert.strictEqual(text.body, 'notifications.finalBody{"team":"Equipo AAA"}');
    });

    it('juego sin hit: desde la 6.ª, por el equipo que no ha conectado, con el detalle o el calendario', () => {
        const live = (inning, awayHits, homeHits) => visto(900020, { state: 'live', live: { inning }, away: equipo(11111, 'AAA', { hits: awayHits }), home: equipo(22222, 'BBB', { hits: homeHits }) });
        assert.strictEqual(liveAlerts([live(5, 0, 3)], opts({ favoriteTeamId: 11111 })).length, 0);
        const found = liveAlerts([live(6, 0, 3)], opts({ favoriteTeamId: 11111 }));
        assert.deepStrictEqual(
            found.map((alert) => alert.key),
            ['noHitter-900020-11111']
        );
        partial(found[0], { batting: { abbrev: 'AAA' }, pitching: { abbrev: 'BBB' } });
        assert.strictEqual(liveAlertText(found[0], t, (team) => team.name).body, 'notifications.noHitterBody{"team":"Equipo AAA","count":6}');
        // Los dos sin hit: dos avisos; sin el dato de hits, ninguno
        assert.strictEqual(liveAlerts([live(7, 0, 0)], opts({ bell: [900020] })).length, 2);
        assert.strictEqual(liveAlerts([live(7, null, null)], opts({ bell: [900020] })).length, 0);
        assert.strictEqual(liveAlerts([live(7, 0, 0)], opts({ bell: [900020], kinds: off('noHitter') })).length, 0);
        // El detalle (runs/hits/inning.n) da lo mismo
        const detail = watchedFromDetail({ gamePk: 900020, state: 'live', date: at(-2 * HOUR), inning: { n: 8 }, away: { id: 11111, name: 'Equipo AAA', abbrev: 'AAA', runs: 0, hits: 0, isWinner: false }, home: { id: 22222, name: 'Equipo BBB', abbrev: 'BBB', runs: 2, hits: 6, isWinner: false } });
        assert.deepStrictEqual(
            liveAlerts([detail], opts({ bell: [900020] })).map((alert) => alert.key),
            ['noHitter-900020-11111']
        );
        assert.strictEqual(watchedFromDetail({ gamePk: null }), null);
    });

    it('vigilancia: cada minuto con un juego tuyo en vivo; antes, se despierta un minuto antes (máx. 10 min); sin juegos tuyos, nada', () => {
        const mine = (game) => game.away.id === 11111;
        assert.strictEqual(watchInterval(undefined, mine, NOW), false);
        assert.strictEqual(watchInterval([visto(1, { state: 'live' })], mine, NOW), MIN);
        assert.strictEqual(watchInterval([visto(1, { state: 'live', away: equipo(55555, 'EEE') })], mine, NOW), false);
        assert.strictEqual(watchInterval([visto(1, { date: at(5 * MIN) })], mine, NOW), 4 * MIN);
        assert.strictEqual(watchInterval([visto(1, { date: at(3 * HOUR) })], mine, NOW), 10 * MIN);
        assert.strictEqual(watchInterval([visto(1, { date: at(-20 * MIN) })], mine, NOW), MIN);
        assert.strictEqual(watchInterval([visto(1, { state: 'final' })], mine, NOW), false);
    });

    it('lo ya avisado se recuerda 3 días; lo raro se descarta', () => {
        assert.deepStrictEqual(pruneNotified({ 'final-1': NOW - HOUR, 'final-2': NOW - 4 * 24 * HOUR, roto: 'x' }, NOW), { 'final-1': NOW - HOUR });
        assert.deepStrictEqual(pruneNotified(null, NOW), {});
    });

    it('Fantasy: la primera lectura solo marca; después, lo que sumó cada pelotero (1 punto o más)', () => {
        let points = { 101: 2, 102: 0, 103: 4 };
        const scoreOf = (id) => (id in points ? points[id] : null);
        let step = fantasyStep(null, '2026-11-05', [101, 102, 103, 104], scoreOf);
        assert.deepStrictEqual(step.gains, []);
        points = { 101: 5, 102: 0.5, 103: 4 };
        step = fantasyStep(step.seen, '2026-11-05', [101, 102, 103, 104], scoreOf);
        assert.deepStrictEqual(step.gains, [{ id: 101, gain: 3 }]);
        // Otro día: vuelve a empezar
        points = { 101: 9 };
        assert.deepStrictEqual(fantasyStep(step.seen, '2026-11-06', [101], scoreOf).gains, []);
        assert.strictEqual(
            fantasyText([{ name: 'Pelotero Uno', gain: 3.04 }, { name: 'Pelotero Dos', gain: 1.5 }], 15.5, t),
            'fantasyAlerts.gain{"name":"Pelotero Uno","pts":3} · fantasyAlerts.gain{"name":"Pelotero Dos","pts":1.5} · fantasyAlerts.total{"pts":15.5}'
        );
    });
}

fs.rmSync(OUT, { recursive: true, force: true });
if (failed) {
    console.log(`\n${failed} caso(s) fallaron`);
    process.exit(1);
}
console.log('\nTodo bien');
