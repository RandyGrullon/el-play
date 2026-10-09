// Única función de Vercel. El backend vive en server/: Vercel convierte cada archivo de api/ en una
// función serverless y el plan Hobby admite 12 por despliegue.
// `node api/index.js --mock` usa datos simulados (sin red, o con statsapi.mlb.com bloqueado)
if (process.argv.includes('--mock')) process.env.MLB_MOCK = '1';

const app = require('../server/app');

const PORT = process.env.PORT || 5001;

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL && require.main === module) {
    app.listen(PORT, () => {
        console.log(`\n🚀 API en http://localhost:${PORT}${process.env.MLB_MOCK === '1' ? '  (datos simulados)' : ''}`);
        console.log(`   - Calendario: /api/v2/schedule?league=lidom`);
        console.log(`   - Juego:      /api/v2/game/:gamePk`);
        console.log(`   - Posiciones: /api/v2/standings?league=lidom`);
        console.log(`   - Líderes:    /api/v2/leaders?league=lidom\n`);
    });
}

module.exports = app;
