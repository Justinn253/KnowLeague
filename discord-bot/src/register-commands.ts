import { REST, Routes } from 'discord.js';
import { serializedCommandDefinitions } from './commands.js';
import { loadBotConfig } from './config.js';

const config = loadBotConfig();
const rest = new REST({ version: '10' }).setToken(config.token);

await rest.put(
  Routes.applicationGuildCommands(config.applicationId, config.guildId),
  { body: serializedCommandDefinitions() },
);

console.info(`Registered KnowLeague slash commands for guild ${config.guildId}.`);
