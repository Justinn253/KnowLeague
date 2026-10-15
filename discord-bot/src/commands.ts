import { SlashCommandBuilder } from 'discord.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('link')
    .setDescription('Learn how to link your KnowLeague account.'),
  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your linked KnowLeague profile.'),
];

export function serializedCommandDefinitions() {
  return commandDefinitions.map((command) => command.toJSON());
}
