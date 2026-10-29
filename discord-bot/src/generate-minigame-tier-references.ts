import { writeDiscordMinigameTierReferences } from './minigame-tier-references.js';

const outputPaths = await writeDiscordMinigameTierReferences();
console.info(`Generated Discord minigame tier references:\n${outputPaths.map((path) => `- ${path}`).join('\n')}`);
