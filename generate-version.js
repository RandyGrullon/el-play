const fs = require('fs');
const { execSync } = require('child_process');

const versionFilePath = './public/version.json';

try {
    const commitHash = execSync('git rev-parse HEAD').toString().trim();
    const versionData = {
        version: commitHash,
        timestamp: Date.now(),
    };

    fs.writeFileSync(versionFilePath, JSON.stringify(versionData, null, 2));
    console.log(`Version file generated: ${commitHash}`);
} catch (error) {
    console.error('Error generating version file:', error);
    // Fallback for environments without git
    const versionData = {
        version: 'unknown',
        timestamp: Date.now(),
    };
    fs.writeFileSync(versionFilePath, JSON.stringify(versionData, null, 2));
}
