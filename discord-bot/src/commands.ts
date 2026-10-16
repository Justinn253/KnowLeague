import { SlashCommandBuilder, type SlashCommandSubcommandBuilder } from 'discord.js';

function addSkinIdOption(command: SlashCommandSubcommandBuilder) {
  return command.addIntegerOption((option) => option
    .setName('skin-id')
    .setDescription('The four-digit KnowLeague skin ID.')
    .setMinValue(1000)
    .setMaxValue(9999)
    .setRequired(true));
}

function createCollectionsCommand(name: 'collections' | 'cl') {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription('Browse and manage KnowLeague skin collections.')
    .addSubcommand((subcommand) => subcommand
      .setName('collection')
      .setDescription('Browse your claimed skins one at a time.'))
    .addSubcommand((subcommand) => subcommand
      .setName('give')
      .setDescription('Give one of your claimed skins to another server member.')
      .addUserOption((option) => option
        .setName('member')
        .setDescription('Member who should receive the skin.')
        .setRequired(true))
      .addIntegerOption((option) => option
        .setName('skin-id')
        .setDescription('The four-digit KnowLeague skin ID.')
        .setMinValue(1000)
        .setMaxValue(9999)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('spawn')
      .setDescription('Immediately post a skin drop in this channel.'))
    .addSubcommand((subcommand) => subcommand
      .setName('summon')
      .setDescription('Spend 5,000 KnowBucks to summon a skin drop in this channel.'))
    .addSubcommand((subcommand) => subcommand
      .setName('capacity-add')
      .setDescription('Spend 500 KnowBucks per five slots to expand your collection.')
      .addIntegerOption((option) => option
        .setName('slots')
        .setDescription('Slots to add, in multiples of five.')
        .setMinValue(5)
        .setMaxValue(5000)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('capacity-force-add')
      .setDescription('Add collection slots to a member without a cost.')
      .addUserOption((option) => option
        .setName('member')
        .setDescription('Member who should receive the slots.')
        .setRequired(true))
      .addIntegerOption((option) => option
        .setName('slots')
        .setDescription('Slots to add.')
        .setMinValue(1)
        .setMaxValue(5000)
        .setRequired(true)))
    .addSubcommand((subcommand) => addSkinIdOption(subcommand
      .setName('steal')
      .setDescription('Spend 3x its sell price to attempt to steal an owned skin.')))
    .addSubcommand((subcommand) => addSkinIdOption(subcommand
      .setName('favorite')
      .setDescription('Show one of your skins first in your collection.')))
    .addSubcommand((subcommand) => addSkinIdOption(subcommand
      .setName('gamble')
      .setDescription('Destroy your skin for a 25% chance at a new claimable drop.')))
    .addSubcommand((subcommand) => subcommand
      .setName('search')
      .setDescription('Preview a catalogue skin; the result cannot be claimed.')
      .addStringOption((option) => option
        .setName('skin-name')
        .setDescription('All or part of a skin name.')
        .setMinLength(1)
        .setMaxLength(150)
        .setRequired(true)))
    .addSubcommand((subcommand) => addSkinIdOption(subcommand
      .setName('sell')
      .setDescription('Sell one of your skins for KnowBucks.')));
}

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('See KnowLeague Discord bot commands and usage.'),
  new SlashCommandBuilder()
    .setName('link')
    .setDescription('Learn how to link your KnowLeague account.'),
  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your linked KnowLeague profile.'),
  createCollectionsCommand('collections'),
  createCollectionsCommand('cl'),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the server chat XP leaderboard.')
    .addIntegerOption((option) => option
      .setName('count')
      .setDescription('Number of members to show, from 1 to 25. Defaults to 10.')
      .setMinValue(1)
      .setMaxValue(25)
      .setRequired(false)),
  new SlashCommandBuilder()
    .setName('knowbucks')
    .setDescription('View, pay, or manage KnowBucks.')
    .addSubcommand((subcommand) => subcommand
      .setName('balance')
      .setDescription('View your KnowBucks balance or another member\'s balance.')
      .addUserOption((option) => option
        .setName('member')
        .setDescription('Member whose KnowBucks balance to view. Defaults to you.')
        .setRequired(false)))
    .addSubcommand((subcommand) => subcommand
      .setName('pay')
      .setDescription('Pay KnowBucks to another server member.')
      .addUserOption((option) => option
        .setName('member')
        .setDescription('Member who should receive KnowBucks.')
        .setRequired(true))
      .addIntegerOption((option) => option
        .setName('amount')
        .setDescription('KnowBucks to pay, from 1 to 1,000,000,000.')
        .setMinValue(1)
        .setMaxValue(1_000_000_000)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('add')
      .setDescription('Give KnowBucks to a server member.')
      .addUserOption((option) => option
        .setName('member')
        .setDescription('Member who should receive KnowBucks.')
        .setRequired(true))
      .addIntegerOption((option) => option
        .setName('amount')
        .setDescription('KnowBucks to give, from 1 to 1,000,000,000.')
        .setMinValue(1)
        .setMaxValue(1_000_000_000)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('remove')
      .setDescription('Remove KnowBucks from a server member.')
      .addUserOption((option) => option
        .setName('member')
        .setDescription('Member whose KnowBucks should be removed.')
        .setRequired(true))
      .addIntegerOption((option) => option
        .setName('amount')
        .setDescription('KnowBucks to remove, from 1 to 1,000,000,000.')
        .setMinValue(1)
        .setMaxValue(1_000_000_000)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('set')
      .setDescription('Set a server member\'s KnowBucks balance.')
      .addUserOption((option) => option
        .setName('member')
        .setDescription('Member whose KnowBucks balance should be set.')
        .setRequired(true))
      .addIntegerOption((option) => option
        .setName('amount')
        .setDescription('KnowBucks balance to set, from 0 to 1,000,000,000.')
        .setMinValue(0)
        .setMaxValue(1_000_000_000)
        .setRequired(true))),
  new SlashCommandBuilder()
    .setName('xp')
    .setDescription('Manage Discord chat leveling XP.')
    .addSubcommand((subcommand) => subcommand
      .setName('add')
      .setDescription('Give a server member chat XP.')
      .addUserOption((option) => option
        .setName('member')
        .setDescription('Member who should receive XP.')
        .setRequired(true))
      .addIntegerOption((option) => option
        .setName('amount')
        .setDescription('XP to give, from 1 to 1,000,000.')
        .setMinValue(1)
        .setMaxValue(1_000_000)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('set-level')
      .setDescription('Set a server member to a specific chat level.')
      .addUserOption((option) => option
        .setName('member')
        .setDescription('Member whose level should be set.')
        .setRequired(true))
      .addIntegerOption((option) => option
        .setName('level')
        .setDescription('Level to set, from 1 to 10,000.')
        .setMinValue(1)
        .setMaxValue(10_000)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('view')
      .setDescription('View a member\'s chat leveling progress.')
      .addUserOption((option) => option
        .setName('member')
        .setDescription('Member whose progress to view. Defaults to you.')
        .setRequired(false))),
];

export function serializedCommandDefinitions() {
  return commandDefinitions.map((command) => command.toJSON());
}
