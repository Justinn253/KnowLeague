import { PermissionFlagsBits, SlashCommandBuilder, type SlashCommandSubcommandBuilder } from 'discord.js';

function addSkinIdOption(command: SlashCommandSubcommandBuilder) {
  return command.addIntegerOption((option) => option
    .setName('skin-id')
    .setDescription('The four-digit KnowLeague skin ID.')
    .setMinValue(1000)
    .setMaxValue(9999)
    .setRequired(true));
}

function createCollectionsCommand() {
  return new SlashCommandBuilder()
    .setName('collections')
    .setDescription('Browse and manage KnowLeague skin collections.')
    .addSubcommand((subcommand) => subcommand
      .setName('collection')
      .setDescription('Browse a member\'s claimed skins one at a time.')
      .addUserOption((option) => option
        .setName('member')
        .setDescription('Member whose collection to browse. Defaults to you.')
        .setRequired(false)))
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
  new SlashCommandBuilder()
    .setName('fish')
    .setDescription('Send fishing expeditions and manage fishing upgrades.')
    .addSubcommand((subcommand) => subcommand
      .setName('help')
      .setDescription('Learn how Discord fishing expeditions and progression work.'))
    .addSubcommand((subcommand) => subcommand
      .setName('expedition-set')
      .setDescription('Send one available crew slot on a fishing expedition.')
      .addStringOption((option) => option
        .setName('biome')
        .setDescription('Fishing biome to visit.')
        .addChoices(
          { name: 'Harbor — free', value: 'harbor' },
          { name: 'Warm Ocean — Sail', value: 'warm-ocean' },
          { name: 'Hydroplant Reservoir — Abiotic Turbine', value: 'hydroplant-reservoir' },
          { name: 'Sunken Sea — Submersible Pod', value: 'sunken-sea' },
          { name: 'Kelp Forest — Magic Conch Navigator', value: 'kelp-forest' },
          { name: 'Crystaline Caverns — Drill Unit', value: 'crystaline-caverns' },
          { name: 'Rallypoint Delta — Radar Scanner', value: 'rallypoint-delta' },
        )
        .setRequired(true))
      .addIntegerOption((option) => option
        .setName('length')
        .setDescription('1 = 5s, 2 = 60s, 3 = 10m, 4 = 1h. Longer trips return more fish.')
        .addChoices(
          { name: 'Length 1 — level 0 · 5 seconds · 1 fish roll', value: 1 },
          { name: 'Length 2 — level 10 · 60 seconds · 12 fish rolls', value: 2 },
          { name: 'Length 3 — level 20 · 10 minutes · 120 fish rolls', value: 3 },
          { name: 'Length 4 — level 30 · 1 hour · 720 fish rolls', value: 4 },
        )
        .setRequired(true))
      .addIntegerOption((option) => option
        .setName('crew')
        .setDescription('Unlocked crew slot to use. Defaults to the first available slot.')
        .setMinValue(1)
        .setMaxValue(3)
        .setRequired(false)))
    .addSubcommand((subcommand) => subcommand
      .setName('expedition-progress')
      .setDescription('View active expeditions and your latest completed trip.'))
    .addSubcommand((subcommand) => subcommand
      .setName('shop')
      .setDescription('Browse fishing upgrades and spend KnowBucks.'))
    .addSubcommand((subcommand) => subcommand
      .setName('inventory')
      .setDescription('View owned upgrades and equip rods or bait.'))
    .addSubcommand((subcommand) => subcommand
      .setName('chests-open')
      .setDescription('Open every held legacy fishing chest for KnowBucks.'))
    .addSubcommand((subcommand) => subcommand
      .setName('catalogue')
      .setDescription('Browse the fishing field guide by biome.')),
  createCollectionsCommand(),
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
      .setName('coinflip')
      .setDescription('Wager KnowBucks on a 50/50 coinflip. A win returns double your wager.')
      .addIntegerOption((option) => option
        .setName('amount')
        .setDescription('KnowBucks to wager, from 1 to 1,000,000,000.')
        .setMinValue(1)
        .setMaxValue(1_000_000_000)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('leaderboard')
      .setDescription('Show the server KnowBucks leaderboard.')
      .addIntegerOption((option) => option
        .setName('count')
        .setDescription('Number of members to show, from 1 to 25. Defaults to 10.')
        .setMinValue(1)
        .setMaxValue(25)
        .setRequired(false)))
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
    .setName('snipe')
    .setDescription('Spend 1,000 KnowBucks to reveal this channel\'s latest cached deleted message.'),
  new SlashCommandBuilder()
    .setName('steal-emoji')
    .setDescription('Import external custom emoji used in a message from this server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) => option
      .setName('message-id')
      .setDescription('Message ID in this channel, or a copied message link from this server.')
      .setMinLength(17)
      .setMaxLength(200)
      .setRequired(true)),
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
