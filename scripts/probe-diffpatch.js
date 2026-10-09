// Valida contra un juego EN VIVO que la lectura incremental (feed/live/diffPatch) da el mismo resultado
// que bajar el feed completo. Usa el código real de server/services/liveFeed.js.
//
// Uso: node scripts/probe-diffpatch.js [gamePk] [--sport=17] [--wait-min=240] [--rounds=12]
// Sin gamePk espera (hasta --wait-min) a que algún juego del día esté en vivo.

const http = require('../server/services/http');
const { getLiveFeed } = require('../server/services/liveFeed');
const { transformGame } = require('../server/utils/transformers');

const BASE = 'https://statsapi.mlb.com/api';
const arg = (name, fallback) => {
    const found = process.argv.find((value) => value.startsWith(`--${name}=`));
    return found ? found.split('=')[1] : fallback;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...parts) => console.log(new Date().toISOString().slice(11, 19), ...parts);

const findLiveGame = async (sportIds) => {
    const today = new Date().toISOString().slice(0, 10);
    for (const sportId of sportIds.split(',')) {
        const data = await http.mlbGet(`${BASE}/v1/schedule`, { sportId, date: today });
        const live = (data.dates || []).flatMap((date) => date.games).find((game) => game.status.abstractGameState === 'Live');
        if (live) return live;
    }
    return null;
};

(async () => {
    let gamePk = process.argv.slice(2).find((value) => /^\d+$/.test(value));
    const sportId = arg('sport', '1,11,12,13,14,16,17,21,22,23,51');
    const waitMin = Number(arg('wait-min', 240));
    const rounds = Number(arg('rounds', 12));

    const deadline = Date.now() + waitMin * 60000;
    while (!gamePk) {
        const live = await findLiveGame(sportId).catch((error) => log('schedule falló:', error.message));
        if (live) {
            gamePk = String(live.gamePk);
            log(`en vivo: ${gamePk} ${live.teams.away.team.name} @ ${live.teams.home.team.name}`);
        } else if (Date.now() > deadline) {
            log('ningún juego se puso en vivo a tiempo');
            process.exit(2);
        } else {
            await sleep(60000);
        }
    }

    const stats = { full: 0, patch: 0, unchanged: 0, compared: 0, mismatches: 0, errors: 0 };
    for (let round = 0; round < rounds; round++) {
        try {
            const { doc, mode, version } = await getLiveFeed(gamePk);
            stats[mode] += 1;
            const fresh = await http.mlbGet(`${BASE}/v1.1/game/${gamePk}/feed/live`);
            const sameMoment = fresh.metaData?.timeStamp === doc.metaData?.timeStamp;
            let verdict = 'otro instante (feed avanzó entre llamadas)';
            if (sameMoment) {
                stats.compared += 1;
                const equal = JSON.stringify(transformGame(doc)) === JSON.stringify(transformGame(fresh));
                if (!equal) stats.mismatches += 1;
                verdict = equal ? 'IGUAL al feed completo' : 'DISTINTO del feed completo';
            }
            const line = transformGame(doc);
            log(`ronda ${round + 1}: modo=${mode} v${version} ts=${doc.metaData?.timeStamp} ${line.away.abbrev} ${line.away.runs}-${line.home.runs} ${line.home.abbrev} ${line.inning?.ordinal || ''} · ${verdict}`);
        } catch (error) {
            stats.errors += 1;
            log(`ronda ${round + 1}: error ${error.message}`);
        }
        await sleep(15000);
    }
    log('resumen', JSON.stringify(stats));
    process.exit(stats.mismatches || stats.patch === 0 ? 1 : 0);
})();
