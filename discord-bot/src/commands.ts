import { PermissionFlagsBits, SlashCommandBuilder, type SlashCommandSubcommandBuilder } from 'discord.js';
import { CHAMPION_CATALOGUE_SNAPSHOT_SECTION_OPTIONS, LEAGUE_ACCOUNT_VIEWER_PLATFORM_OPTIONS } from './league-account-viewer.js';

function addSkinIdOption(command: SlashCommandSubcommandBuilder) {
  return command.addIntegerOption((option) => option
    .setName('skin-id')
    .setDescription('The four-digit KnowLeague skin ID.')
    .setMinValue(1000)
    .setMaxValue(9999)
    .setRequired(true));
}

function addCollectionReorderOptions(command: SlashCommandSubcommandBuilder) {
  let configuredCommand = command;
  for (let slot = 1; slot <= 10; slot += 1) {
    configuredCommand = configuredCommand.addIntegerOption((option) => option
      .setName(`slot-${slot}`)
      .setDescription(`Four-digit KnowLeague skin ID for collection slot ${slot}.`)
      .setMinValue(1000)
      .setMaxValue(9999)
      .setRequired(false));
  }
  return configuredCommand;
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
      .setName('upkeep-view')
      .setDescription('View your daily Collection upkeep and how long your funds cover it.'))
    .addSubcommand((subcommand) => subcommand
      .setName('upkeep-pay')
      .setDescription('Irreversibly set aside KnowBucks for Collection upkeep, up to 100,000 total.')
      .addIntegerOption((option) => option
        .setName('amount')
        .setDescription('KnowBucks to set aside. Any amount above your remaining allocation cap stays in your balance.')
        .setMinValue(1)
        .setMaxValue(1_000_000_000)
        .setRequired(true)))
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
      .setName('summon-force')
      .setDescription('During your summon cooldown, force a drop for 5,000 KnowBucks with a 50% weekly escalation.'))
    .addSubcommand((subcommand) => subcommand
      .setName('capacity-add')
      .setDescription('Spend 500 KnowBucks per added slot to expand your collection up to 50 slots.')
      .addIntegerOption((option) => option
        .setName('slots')
        .setDescription('Slots to add, up to the 50-slot collection maximum.')
        .setMinValue(1)
        .setMaxValue(50)
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
        .setDescription('Slots to add, up to the 50-slot collection maximum.')
        .setMinValue(1)
        .setMaxValue(50)
        .setRequired(true)))
    .addSubcommand((subcommand) => addSkinIdOption(subcommand
      .setName('steal')
      .setDescription('Spend 3x its sell price to attempt to steal an owned skin.')))
    .addSubcommand((subcommand) => addSkinIdOption(subcommand
      .setName('favorite')
      .setDescription('Show one of your skins first in your collection.')))
    .addSubcommand((subcommand) => addCollectionReorderOptions(subcommand
      .setName('collection-reorder')
      .setDescription('Set one to ten skins as the first collection slots, in order.')))
    .addSubcommand((subcommand) => addSkinIdOption(subcommand
      .setName('gamble')
      .setDescription('Destroy your skin for a 25-65% chance at a new claimable drop.')))
    .addSubcommand((subcommand) => subcommand
      .setName('search')
      .setDescription('Preview a catalogue skin; the result cannot be claimed.')
      .addStringOption((option) => option
        .setName('skin-name')
        .setDescription('All or part of a skin name.')
        .setMinLength(1)
        .setMaxLength(150)
        .setRequired(false))
      .addIntegerOption((option) => option
        .setName('skin-id')
        .setDescription('The four-digit KnowLeague ID assigned to a spawned skin.')
        .setMinValue(1000)
        .setMaxValue(9999)
        .setRequired(false)))
    .addSubcommand((subcommand) => addSkinIdOption(subcommand
      .setName('sell')
      .setDescription('Sell one of your skins for KnowBucks.')));
}

function createLeagueCommand() {
  return new SlashCommandBuilder()
    .setName('league')
    .setDescription('Use KnowLeague features from Discord.')
    .addSubcommand((subcommand) => subcommand
      .setName('account')
      .setDescription('Post a League Account Viewer image for a Riot ID.')
      .addStringOption((option) => option
        .setName('riot-id')
        .setDescription('Riot ID in the format GameName#TagLine.')
        .setMinLength(3)
        .setMaxLength(64)
        .setRequired(true))
      .addStringOption((option) => option
        .setName('region')
        .setDescription('League region for this Riot ID.')
        .addChoices(...LEAGUE_ACCOUNT_VIEWER_PLATFORM_OPTIONS.map((platform) => ({
          name: platform.label,
          value: platform.value,
        })))
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('account-link')
      .setDescription('Save your Riot account for /league account-mine.')
      .addStringOption((option) => option
        .setName('riot-id')
        .setDescription('Riot ID in the format GameName#TagLine.')
        .setMinLength(3)
        .setMaxLength(64)
        .setRequired(true))
      .addStringOption((option) => option
        .setName('region')
        .setDescription('League region for this Riot ID.')
        .addChoices(...LEAGUE_ACCOUNT_VIEWER_PLATFORM_OPTIONS.map((platform) => ({
          name: platform.label,
          value: platform.value,
        })))
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('account-mine')
      .setDescription('Post League Account Viewer images for your linked Riot account.'))
    .addSubcommand((subcommand) => subcommand
      .setName('champion')
      .setDescription('Post Champion Catalogue images for a champion.')
      .addStringOption((option) => option
        .setName('champion')
        .setDescription('Champion name, such as Aatrox or Miss Fortune.')
        .setMinLength(2)
        .setMaxLength(64)
        .setRequired(true))
      .addStringOption((option) => option
        .setName('section')
        .setDescription('Champion Catalogue section or all sections to post.')
        .addChoices(...CHAMPION_CATALOGUE_SNAPSHOT_SECTION_OPTIONS.map((section) => ({
          name: section.label,
          value: section.value,
        })))
        .setRequired(true)))
    .addSubcommandGroup((group) => group
      .setName('skindle')
      .setDescription('Play the daily Skindle puzzle.')
      .addSubcommand((subcommand) => subcommand
        .setName('play')
        .setDescription('Play the daily Skindle from KnowLeague.net.'))
      .addSubcommand((subcommand) => subcommand
        .setName('guess')
        .setDescription('Submit one skin guess for today\'s Skindle.')
        .addStringOption((option) => option
          .setName('skin')
          .setDescription('Exact skin name, such as Spirit Blossom Ahri.')
          .setMinLength(2)
          .setMaxLength(150)
          .setRequired(true)))
      .addSubcommand((subcommand) => subcommand
        .setName('status')
        .setDescription('View your private progress in today\'s Skindle.')));
}

export const commandDefinitions = [
  createLeagueCommand(),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('See KnowLeague Discord bot commands and usage.'),
  new SlashCommandBuilder()
    .setName('rc')
    .setDescription('Repeat your most recent slash command in this bot session.'),
  new SlashCommandBuilder()
    .setName('link')
    .setDescription('Learn how to link your KnowLeague account.'),
  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your linked KnowLeague profile.'),
  new SlashCommandBuilder()
    .setName('player')
    .setDescription('Browse your player progression, shared skills, and shop.')
    .addSubcommand((subcommand) => subcommand
      .setName('shop')
      .setDescription('Browse player skills and robbery equipment to buy with KnowBucks.'))
    .addSubcommand((subcommand) => subcommand
      .setName('inventory')
      .setDescription('View a player inventory. More inventory features are coming soon.')
      .addUserOption((option) => option
        .setName('user')
        .setDescription('Player whose inventory to view. Defaults to you.')
        .setRequired(false)))
    .addSubcommand((subcommand) => subcommand
      .setName('stats')
      .setDescription('View player levels, XP, KnowBucks, and shared skills.')
      .addUserOption((option) => option
        .setName('user')
        .setDescription('Player whose stats to view. Defaults to you.')
        .setRequired(false))),
  new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Attempt to rob a server member for KnowBucks.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Server member to rob.')
      .setRequired(true)),
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
      .setDescription('Browse the fishing field guide by biome.'))
    .addSubcommand((subcommand) => subcommand
      .setName('event-help')
      .setDescription('See the active fishing event, its catches, crates, and title.'))
    .addSubcommand((subcommand) => subcommand
      .setName('event-catalogue')
      .setDescription('View your active fishing event fish and title discoveries.')),
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
