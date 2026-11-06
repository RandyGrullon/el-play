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

// ---------------------------------------------------------------- pantallas: estadísticas, posiciones, líderes y ficha
// Lo que se pasó de la web (lib/teamStats.ts, share/subjects.ts, PlayerSheet…). Va en su propia carpeta, con lo de React
// Query y la API de mentira para que se pueda cargar en Node.
const SCREENS = path.join(OUT, 'pantallas');
const compileTo = (rel) => {
    const source = fs.readFileSync(path.join(ROOT, 'src', rel), 'utf8');
    const { outputText } = ts.transpileModule(source, { fileName: rel, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } });
    const target = path.join(SCREENS, rel.replace(/\.tsx?$/, '.js'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, outputText);
    return target;
};
const stub = (rel, code) => {
    const target = path.join(SCREENS, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, code);
};
stub('node_modules/@tanstack/react-query/index.js', 'exports.useQuery = () => ({});\n');
stub('lib/api.js', "exports.ApiError = class ApiError extends Error {};\nexports.getApiJson = async () => ({});\nexports.networkErrorCode = async () => 'network';\n");
stub('lib/config.js', "exports.API_BASE = '';\n");
compileTo('lib/advanced.ts');
const teamStats = require(compileTo('lib/teamStats.ts'));

console.log('estadísticas de los equipos');

// Equipos de mentira: siglas y cifras inventadas
const equipo = (id, abbrev, hitting, pitching) => ({ id, abbrev, name: `Equipo ${abbrev}`, color: '#123456', logo: '', hitting, pitching });
const EQUIPOS = [
    equipo(9001, 'AAA', { avg: '.250', ops: '.700', r: 100, hr: 10, h: 200, g: 30, sb: 5 }, { era: '3.50', whip: '1.30', r: 90, k: 200, w: 18, l: 12, sv: 8 }),
    equipo(9002, 'BBB', { avg: '.270', ops: '.760', r: 120, hr: 14, h: 230, g: 30, sb: 9 }, { era: '4.10', whip: '1.42', r: 130, k: 180, w: 14, l: 16, sv: 5 }),
    equipo(9003, 'CCC', null, null)
];

it('orden de los equipos: el mejor arriba, menos es mejor en la EFE y sin dato al final', () => {
    const { rankTeams, teamSort } = teamStats;
    assert.deepStrictEqual(rankTeams(EQUIPOS, teamSort('bat', 'avg')).map((item) => item.team.abbrev), ['BBB', 'AAA', 'CCC']);
    assert.deepStrictEqual(rankTeams(EQUIPOS, teamSort('pitch', 'era')).map((item) => item.team.abbrev), ['AAA', 'BBB', 'CCC']);
    assert.strictEqual(rankTeams(EQUIPOS, teamSort('pitch', 'era'))[2].value, null);
    // Una clave que no existe cae en la primera del grupo
    assert.strictEqual(teamSort('bat', 'nada').key, 'avg');
    assert.strictEqual(teamSort('pitch', 'nada').key, 'era');
});

it('promedio de la liga: el de los equipos con dato; las tarjetas de los mejores existen en el orden', () => {
    const { leagueAverage, teamSort, TEAM_HIGHLIGHTS, TEAM_SORTS } = teamStats;
    close(leagueAverage(EQUIPOS, teamSort('bat', 'avg')), 0.26, 3);
    close(leagueAverage(EQUIPOS, teamSort('pitch', 'whip')), 1.36, 3);
    assert.strictEqual(leagueAverage([EQUIPOS[2]], teamSort('bat', 'avg')), null);
    assert.strictEqual(teamSort('bat', 'avg').show(0.26), '.260');
    for (const group of ['bat', 'pitch']) TEAM_HIGHLIGHTS[group].forEach((key) => assert.ok(TEAM_SORTS[group].some((sort) => sort.key === key), key));
});

it('récord y diferencia de carreras con los juegos para el récord pitagórico', () => {
    const { recordOf } = teamStats;
    partial(recordOf(EQUIPOS[0]), { w: 18, l: 12, games: 30, scored: 100, allowed: 90, diff: 10 });
    partial(recordOf(EQUIPOS[1]), { diff: -10 });
    partial(recordOf(EQUIPOS[2]), { w: 0, l: 0, games: 0, scored: null, diff: null });
    const { pythagorean } = require(path.join(SCREENS, 'lib', 'advanced.js'));
    partial(pythagorean(100, 90, 30), { wins: 16, losses: 14 });
});

console.log('imágenes para compartir');

['lib/format.ts', 'lib/teams.ts', 'lib/nationalTeams.ts', 'lib/baseball.ts'].forEach(compileTo);
const subjects = require(compileTo('components/share/subjects.ts'));
// Las claves salen tal cual (con sus valores), para ver qué texto se pidió
const tKeys = (key, options = {}) => {
    const { defaultValue, ...vars } = options; // eslint-disable-line no-unused-vars
    return Object.keys(vars).length ? `${key}${JSON.stringify(vars)}` : key;
};

it('la tabla para la imagen: rango, sigla, nombre, récord y juegos detrás de cada equipo', () => {
    const fila = (rank, id, abbrev, wins, losses, gamesBack) => ({ rank, team: { id, name: `Equipo ${abbrev}`, shortName: abbrev, abbrev, logo: '', color: '#654321', flag: null }, wins, losses, gamesBack });
    const post = subjects.standingsPost([fila(1, 9001, 'AAA', 20, 10, '-'), fila(2, 9002, 'BBB', 18, 12, '2.0')], 'Posiciones', 'Regular · 2099-00', 'Liga de Prueba', 'es');
    partial(post, { kind: 'standings', title: 'Posiciones', subtitle: 'Regular · 2099-00', league: 'Liga de Prueba' });
    assert.deepStrictEqual(post.rows[1], { rank: 2, abbrev: 'BBB', name: 'Equipo BBB', color: '#654321', wins: 18, losses: 12, gamesBack: '2.0' });
});

it('el líder para la imagen: la categoría en singular si es 1, su puesto y la línea de abajo', () => {
    const lider = (value, extra) => ({ rank: 1, id: 12345678, name: 'Pelotero Ficticio', teamId: 9001, teamName: 'Equipo AAA', teamAbbrev: 'AAA', logo: null, color: null, value, extra });
    const uno = subjects.playerFromLeader(lider(1, { h: 3, ab: 10 }), 'homeRuns', '2099-00', 'Liga de Prueba', tKeys);
    partial(uno, { kind: 'player', personId: 12345678, value: '1', label: 'leaders.one.homeRuns', color: '#2563eb', detail: 'share.hitsInAtBats{"h":3,"ab":10}' });
    assert.strictEqual(uno.context, 'share.rankIn{"rank":1,"league":"Liga de Prueba","season":"2099-00"}');
    const varios = subjects.playerFromLeader(lider(12, { ip: '46.1', k: 34 }), 'strikeouts', '2099-00', 'Liga de Prueba', tKeys);
    partial(varios, { value: '12', label: 'leaders.strikeouts', detail: 'share.innings{"ip":"46.1","k":34}' });
    assert.strictEqual(subjects.playerFromLeader(lider(null, {}), 'wins', '2099-00', 'Liga', tKeys).value, '—');
});

console.log('aviso de sin conexión');

it('la edad de lo que se ve: minutos enteros desde el último dato; sin datos o de hace menos de un minuto, sin edad', () => {
    const { offlineAge } = require(path.join(SCREENS, 'lib', 'format.js'));
    const ahora = Date.UTC(2099, 0, 15, 20, 0, 0);
    assert.strictEqual(offlineAge(0, ahora), null);
    assert.strictEqual(offlineAge(ahora - 59999, ahora), null);
    assert.strictEqual(offlineAge(ahora - 60000, ahora), 1);
    assert.strictEqual(offlineAge(ahora - 7.5 * 60000, ahora), 7);
    assert.strictEqual(offlineAge(ahora - 3 * 3600000, ahora), 180);
    // Reloj del teléfono atrasado respecto al dato: no hay edades negativas
    assert.strictEqual(offlineAge(ahora + 5000, ahora), null);
});

console.log('ficha del pelotero');

const { careerTotal } = require(compileTo('lib/stats.ts'));

it('total de la carrera: sumas de todas las temporadas (EFE, AVG y OPS de las sumas); con una sola, no hay', () => {
    const bateo = (g, ab, h, d, t, hr, rbi, bb, hbp, sf) => ({ hitting: { g, ab, h, d, t, hr, rbi, bb, hbp, sf } });
    const bateador = { role: 'B', career: [bateo(40, 150, 45, 8, 1, 5, 20, 15, 2, 1), bateo(30, 100, 25, 4, 0, 2, 10, 10, 1, 0)] };
    // 70 J, 70 H en 250 VB (.280), 7 HR, 30 CI; OBP 98/279, SLG 105/250
    assert.deepStrictEqual(careerTotal(bateador), [70, '.280', 7, 30, ((98 / 279 + 105 / 250).toFixed(3)).replace(/^0/, '')]);
    const pitcheo = (g, w, l, outs, er, k) => ({ pitching: { g, w, l, outs, er, k } });
    const lanzador = { role: 'P', career: [pitcheo(10, 3, 2, 100, 12, 40), pitcheo(8, 1, 1, 44, 6, 20)] };
    // 144 outs = 48.0 IP; 18 CL → 3.38
    assert.deepStrictEqual(careerTotal(lanzador), [18, '4-3', '3.38', '48.0', 60]);
    assert.deepStrictEqual(careerTotal({ role: 'P', career: [pitcheo(5, 1, 0, 31, 0, 9), pitcheo(2, 0, 0, 0, 0, 0)] }).slice(2, 4), ['0.00', '10.1']);
    assert.strictEqual(careerTotal({ role: 'B', career: [bateo(1, 3, 1, 0, 0, 0, 0, 0, 0, 0)] }), null);
});

console.log('enlaces a equipos y peloteros');

const links = require(compileTo('lib/links.ts'));

it('id para abrir una página: solo enteros positivos (0, null, NaN o texto vacío no abren nada)', () => {
    const { linkId } = links;
    assert.strictEqual(linkId(12345678), 12345678);
    assert.strictEqual(linkId('9001'), 9001);
    [0, -3, 1.5, null, undefined, NaN, '', 'abc'].forEach((value) => assert.strictEqual(linkId(value), null, String(value)));
});

it('parámetros de la ficha: nombre y equipo si se tienen, temporada solo si no es la actual', () => {
    const { playerParams } = links;
    assert.deepStrictEqual(playerParams({ id: 12345678, name: 'Pelotero Uno', teamId: 9001 }, 2099), { id: 12345678, name: 'Pelotero Uno', teamId: 9001, season: 2099 });
    assert.deepStrictEqual(playerParams({ id: 12345678 }), { id: 12345678 });
    assert.deepStrictEqual(playerParams({ id: 12345678, name: '', teamId: 0 }, null), { id: 12345678 });
});

it('línea de decisiones: ganador y salvado; sin salvamento, el perdedor; sin ganador, nada', () => {
    const { decisionParts } = links;
    const uno = { id: 12345678, name: 'Pelotero Uno' };
    const dos = { id: 87654321, name: 'Pelotero Dos' };
    const tres = { id: 11223344, name: 'Pelotero Tres' };
    assert.deepStrictEqual(decisionParts({ winner: uno, loser: dos, save: tres }).map((part) => [part.key, part.person.id]), [['win', 12345678], ['save', 11223344]]);
    assert.deepStrictEqual(decisionParts({ winner: uno, loser: dos, save: null }).map((part) => part.key), ['win', 'loss']);
    assert.deepStrictEqual(decisionParts({ winner: uno, loser: null, save: null }).map((part) => part.key), ['win']);
    assert.deepStrictEqual(decisionParts({ winner: null, loser: dos, save: null }), []);
    assert.deepStrictEqual(decisionParts(null), []);
});

it('equipo por sigla entre los que hay (sin importar mayúsculas); sin coincidencia, null', () => {
    const { teamByAbbrev } = links;
    const equipos = [{ id: 9001, abbrev: 'AAA' }, null, { id: 9002, abbrev: 'BBB' }];
    assert.strictEqual(teamByAbbrev(equipos, 'bbb').id, 9002);
    assert.strictEqual(teamByAbbrev(equipos, ' AAA ').id, 9001);
    assert.strictEqual(teamByAbbrev(equipos, 'CCC'), null);
    assert.strictEqual(teamByAbbrev(equipos, null), null);
});

it('nombres dentro de una jugada: cada nombre entero de la lista es un pedazo con su pelotero', () => {
    const { nameSegments } = links;
    const uno = { id: 12345678, name: 'Pelotero Uno', teamId: 9001 };
    const dos = { id: 87654321, name: 'Pelotero Dos' };
    const texto = 'Pelotero Uno batea sencillo. Pelotero Dos anota.';
    const partes = nameSegments(texto, [uno, dos]);
    assert.strictEqual(partes.map((part) => part.text).join(''), texto);
    assert.deepStrictEqual(partes.map((part) => part.person && part.person.id), [12345678, null, 87654321, null]);
    // El punto final pegado al nombre vale; dentro de otra palabra, no
    assert.deepStrictEqual(nameSegments('Ponche a Pelotero Uno.', [uno]).map((part) => part.text), ['Ponche a ', 'Pelotero Uno', '.']);
    assert.deepStrictEqual(nameSegments('Pelotero Unotres sale out', [uno]).map((part) => part.person), [null]);
    // Si dos se pisan, el más largo; repetidos e ids malos no cuentan
    const largo = { id: 11223344, name: 'Pelotero Uno Jr.' };
    assert.deepStrictEqual(nameSegments('Pelotero Uno Jr. se embasa', [uno, largo, { id: 0, name: 'se embasa' }, uno]).map((part) => part.person && part.person.id), [11223344, null]);
    assert.deepStrictEqual(nameSegments('', [uno]), []);
    assert.deepStrictEqual(nameSegments('Sin nombres aquí', []).map((part) => part.text), ['Sin nombres aquí']);
});

it('los del juego para enlazar: los cuatro grupos del box de cada lado con su equipo', () => {
    const { gamePeople } = links;
    const lado = (base) => ({ batters: [{ id: base + 1, name: 'Bateador' }], pitchers: [{ id: base + 2, name: 'Lanzador' }], bench: [{ id: base + 3, name: 'Banca' }] });
    const gente = gamePeople({ away: { id: 9001 }, home: { id: 9002 }, box: { away: lado(100), home: lado(200) } });
    assert.deepStrictEqual(gente.map((person) => [person.id, person.teamId]), [[101, 9001], [102, 9001], [103, 9001], [201, 9002], [202, 9002], [203, 9002]]);
    assert.deepStrictEqual(gamePeople({ away: { id: 9001 }, home: { id: 9002 }, box: null }), []);
});

fs.rmSync(OUT, { recursive: true, force: true });
if (failed) {
    console.log(`\n${failed} caso(s) fallaron`);
    process.exit(1);
}
console.log('\nTodo bien');
