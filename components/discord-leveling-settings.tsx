'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, CircleAlert, LoaderCircle, Plus, Save, Trash2, UsersRound, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AppSelectMenu } from '@/components/app-select-menu';
import { ToggleSwitch } from '@/components/toggle-switch';
import {
  DEFAULT_DISCORD_LEVELING_SETTINGS,
  getDiscordTotalXpForLevel,
  getDiscordXpToNextLevel,
  type DiscordGuildRole,
  type DiscordLevelingRoleReward,
  type DiscordLevelingSettings,
} from '@/lib/discord-leveling';
import {
  DEFAULT_DISCORD_SKIN_CLAIM_RARITY_WEIGHTS,
  DEFAULT_DISCORD_SKIN_CLAIM_SELL_VALUES,
  DEFAULT_DISCORD_SKIN_CLAIM_SETTINGS,
  type DiscordGuildChannel,
  type DiscordSkinClaimRarityWeight,
  type DiscordSkinClaimSellValue,
  type DiscordSkinClaimSettings,
} from '@/lib/discord-skin-claims';
import {
  DEFAULT_DISCORD_FISHING_BONUS_SETTINGS,
  DEFAULT_DISCORD_FISHING_COMMAND_SETTINGS,
  DEFAULT_DISCORD_FISHING_ROLE_SETTINGS,
  DISCORD_FISHING_WEEKDAY_PHENOMENA,
  type DiscordFishingBonusSettings,
  type DiscordFishingCommandSettings,
  type DiscordFishingLevelRoleReward,
  type DiscordFishingRoleSettings,
  type DiscordFishingWeekdayPhenomenonId,
} from '@/lib/discord-fishing';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';

type LevelingSettingsResponse = {
  channels: DiscordGuildChannel[];
  collectionAdminRoleIds: string[];
  leaderboardExcludedRoleIds: string[];
  manualXpRoleIds: string[];
  roleRewards: DiscordLevelingRoleReward[];
  roles: DiscordGuildRole[];
  settings: DiscordLevelingSettings;
  skinClaimChannelIds: string[];
  skinClaimRarityWeights: DiscordSkinClaimRarityWeight[];
  skinClaimSellValues: DiscordSkinClaimSellValue[];
  skinClaimSettings: DiscordSkinClaimSettings;
  fishingCommandChannelIds: string[];
  fishingCommandSettings: DiscordFishingCommandSettings;
  fishingBonusSettings: DiscordFishingBonusSettings;
  fishingRoleRewards: DiscordFishingLevelRoleReward[];
  fishingRoleSettings: DiscordFishingRoleSettings;
};

const EMPTY_RESPONSE: LevelingSettingsResponse = {
  channels: [],
  collectionAdminRoleIds: [],
  leaderboardExcludedRoleIds: [],
  manualXpRoleIds: [],
  roleRewards: [],
  roles: [],
  settings: DEFAULT_DISCORD_LEVELING_SETTINGS,
  skinClaimChannelIds: [],
  skinClaimRarityWeights: [...DEFAULT_DISCORD_SKIN_CLAIM_RARITY_WEIGHTS],
  skinClaimSellValues: [...DEFAULT_DISCORD_SKIN_CLAIM_SELL_VALUES],
  skinClaimSettings: DEFAULT_DISCORD_SKIN_CLAIM_SETTINGS,
  fishingCommandChannelIds: [],
  fishingCommandSettings: DEFAULT_DISCORD_FISHING_COMMAND_SETTINGS,
  fishingBonusSettings: DEFAULT_DISCORD_FISHING_BONUS_SETTINGS,
  fishingRoleRewards: [],
  fishingRoleSettings: DEFAULT_DISCORD_FISHING_ROLE_SETTINGS,
};

const ALL_SKIN_CLAIM_CHANNELS_VALUE = '__all__';
const ALL_COLLECTIONS_COMMAND_CHANNELS_VALUE = '__all_collections_commands__';
const ALL_FISHING_COMMAND_CHANNELS_VALUE = '__all_fishing_commands__';
const FISHING_WEEKDAY_OPTIONS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
] as const;
const FISHING_PHENOMENON_DETAILS: Record<DiscordFishingWeekdayPhenomenonId, { description: string; label: string }> = {
  'double-xp': { label: 'Double Fishing XP', description: 'Doubles Fishing XP from the expedition and its crates.' },
  'double-knowbucks': { label: 'Double KnowBucks', description: 'Doubles sold fish, crate-loot, and Fishing level-up KnowBucks.' },
  'higher-fish-rarity': { label: 'Higher fish rarity', description: 'Adds 25% to eligible non-Common fish rarity weights.' },
  'shorter-expeditions': { label: 'Shorter expeditions', description: 'Reduces the selected expedition duration by 25%.' },
  'extra-crate-loot': { label: 'Extra crate loot', description: 'Gives each automatically opened crate a 50% chance to roll one additional loot item.' },
};

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function CurveGraph() {
  const entries = useMemo(() => Array.from({ length: 100 }, (_, index) => {
    const level = index + 1;
    return { level, totalXp: getDiscordTotalXpForLevel(level), xpToNextLevel: getDiscordXpToNextLevel(level) };
  }), []);
  const [hoveredLevel, setHoveredLevel] = useState<number | null>(null);
  const width = 800;
  const height = 280;
  const left = 72;
  const right = 24;
  const top = 20;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maximumXp = entries[entries.length - 1]?.totalXp ?? 1;
  const pointFor = (entry: typeof entries[number]) => ({
    x: left + ((entry.level - 1) / (entries.length - 1)) * plotWidth,
    y: height - bottom - (entry.totalXp / maximumXp) * plotHeight,
  });
  const path = entries.map((entry, index) => {
    const point = pointFor(entry);
    return (index === 0 ? 'M ' : 'L ') + point.x + ' ' + point.y;
  }).join(' ');
  const hoveredEntry = hoveredLevel ? entries[hoveredLevel - 1] : null;
  const hoveredPoint = hoveredEntry ? pointFor(hoveredEntry) : null;

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 p-3 sm:p-4">
      <svg
        viewBox={'0 0 ' + width + ' ' + height}
        role="img"
        aria-label="Lurkr-compatible Discord level XP curve from level 1 through level 100"
        className="h-auto w-full touch-none"
        onPointerLeave={() => setHoveredLevel(null)}
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const svgX = ((event.clientX - bounds.left) / bounds.width) * width;
          const progress = Math.max(0, Math.min(1, (svgX - left) / plotWidth));
          setHoveredLevel(Math.max(1, Math.min(entries.length, Math.round(1 + progress * (entries.length - 1)))));
        }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = height - bottom - ratio * plotHeight;
          return <line key={ratio} x1={left} x2={width - right} y1={y} y2={y} stroke="rgba(255,255,255,0.10)" strokeWidth="1" />;
        })}
        <line x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
        <path d={path} fill="none" stroke="#fcd34d" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {hoveredPoint ? <><line x1={hoveredPoint.x} x2={hoveredPoint.x} y1={top} y2={height - bottom} stroke="rgba(252,211,77,0.55)" strokeWidth="1" strokeDasharray="4 4" /><circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="6" fill="#fcd34d" stroke="#0f172a" strokeWidth="3" /></> : null}
        <text x={left} y={height - 10} fill="#94a3b8" fontSize="12">Level 1</text>
        <text x={width - right} y={height - 10} fill="#94a3b8" fontSize="12" textAnchor="end">Level 100</text>
        <text x={left - 10} y={top + 4} fill="#94a3b8" fontSize="12" textAnchor="end">{formatNumber(maximumXp)}</text>
        <text x={left - 10} y={height - bottom + 4} fill="#94a3b8" fontSize="12" textAnchor="end">0</text>
      </svg>
      <p className="mt-2 min-h-10 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-50">
        {hoveredEntry ? <>Level <strong>{hoveredEntry.level}</strong> requires <strong>{formatNumber(hoveredEntry.totalXp)} total XP</strong>; the next level requires another <strong>{formatNumber(hoveredEntry.xpToNextLevel)} XP</strong>.</> : 'Hover across the curve to inspect a level.'}
      </p>
    </div>
  );
}

function sortRewards(rewards: DiscordLevelingRoleReward[]) {
  return [...rewards].sort((left, right) => left.level - right.level);
}

function sortFishingRewards(rewards: DiscordFishingLevelRoleReward[]) {
  return [...rewards].sort((left, right) => left.level - right.level);
}

export function DiscordLevelingSettings() {
  const router = useRouter();
  const [data, setData] = useState<LevelingSettingsResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'leveling' | 'collections' | 'fishing'>('leveling');
  const [message, setMessage] = useState('');
  const [rewardLevel, setRewardLevel] = useState('5');
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [fishingRewardLevel, setFishingRewardLevel] = useState('5');
  const [selectedFishingRoleIds, setSelectedFishingRoleIds] = useState<string[]>([]);
  const [expandedRewardMessageLevels, setExpandedRewardMessageLevels] = useState<number[]>([]);

  const getAccessToken = useCallback(async () => {
    const supabase = getOptionalSupabaseClient();
    const { data: sessionData } = await supabase?.auth.getSession() ?? { data: { session: null } };
    return sessionData.session?.access_token ?? null;
  }, []);

  const loadSettings = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setMessage('Sign in with a KnowLeague administrator account to manage Discord Configuration.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/discord/leveling', { headers: { Authorization: 'Bearer ' + token } });
      const body = await response.json() as Partial<LevelingSettingsResponse> & { error?: string };
      if (!response.ok || !body.settings || !body.roles || !body.roleRewards || !body.manualXpRoleIds || !body.collectionAdminRoleIds || !body.leaderboardExcludedRoleIds || !body.channels || !body.skinClaimSettings || !body.skinClaimChannelIds || !body.skinClaimRarityWeights || !body.skinClaimSellValues || !body.fishingCommandSettings || !body.fishingCommandChannelIds || !body.fishingBonusSettings || !body.fishingRoleRewards || !body.fishingRoleSettings) throw new Error(body.error ?? 'Unable to load Discord Configuration.');
      setData({ channels: body.channels, collectionAdminRoleIds: body.collectionAdminRoleIds, leaderboardExcludedRoleIds: body.leaderboardExcludedRoleIds, manualXpRoleIds: body.manualXpRoleIds, roleRewards: sortRewards(body.roleRewards), roles: body.roles, settings: body.settings, skinClaimChannelIds: body.skinClaimChannelIds, skinClaimRarityWeights: body.skinClaimRarityWeights, skinClaimSellValues: body.skinClaimSellValues, skinClaimSettings: body.skinClaimSettings, fishingCommandChannelIds: body.fishingCommandChannelIds, fishingCommandSettings: body.fishingCommandSettings, fishingBonusSettings: body.fishingBonusSettings, fishingRoleRewards: sortFishingRewards(body.fishingRoleRewards), fishingRoleSettings: body.fishingRoleSettings });
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load Discord Configuration.');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  const roleById = useMemo(() => new Map(data.roles.map((role) => [role.id, role])), [data.roles]);
  const availableRewardRoles = useMemo(() => {
    const used = new Set(data.roleRewards.flatMap((reward) => reward.roleIds));
    return data.roles.filter((role) => role.assignable && !used.has(role.id));
  }, [data.roles, data.roleRewards]);
  const availableLeaderboardTopRoles = useMemo(() => {
    const protectedRoleIds = new Set([
      ...data.roleRewards.flatMap((reward) => reward.roleIds),
      ...data.manualXpRoleIds,
      ...data.leaderboardExcludedRoleIds,
    ]);
    return data.roles.filter((role) => role.assignable && (!protectedRoleIds.has(role.id) || role.id === data.settings.leaderboardTopRoleId));
  }, [data.leaderboardExcludedRoleIds, data.manualXpRoleIds, data.roleRewards, data.roles, data.settings.leaderboardTopRoleId]);
  const availableFishingRewardRoles = useMemo(() => {
    const used = new Set(data.fishingRoleRewards.flatMap((reward) => reward.roleIds));
    if (data.fishingRoleSettings.topFisherRoleId) used.add(data.fishingRoleSettings.topFisherRoleId);
    return data.roles.filter((role) => role.assignable && !used.has(role.id));
  }, [data.fishingRoleRewards, data.fishingRoleSettings.topFisherRoleId, data.roles]);
  const availableTopFisherRoles = useMemo(() => {
    const protectedRoleIds = new Set([
      ...data.roleRewards.flatMap((reward) => reward.roleIds),
      ...data.fishingRoleRewards.flatMap((reward) => reward.roleIds),
      ...data.manualXpRoleIds,
      ...data.collectionAdminRoleIds,
      data.settings.leaderboardTopRoleId,
    ]);
    return data.roles.filter((role) => role.assignable && (!protectedRoleIds.has(role.id) || role.id === data.fishingRoleSettings.topFisherRoleId));
  }, [data.collectionAdminRoleIds, data.fishingRoleRewards, data.fishingRoleSettings.topFisherRoleId, data.manualXpRoleIds, data.roleRewards, data.roles, data.settings.leaderboardTopRoleId]);
  const fishingBonusRoleOptions = useMemo(() => data.roles.map((role) => ({
    value: role.id,
    label: role.name,
    description: `Discord role ID: ${role.id}${role.assignable ? '' : ' · This role is not bot-assignable, but can still receive the member bonus.'}`,
  })), [data.roles]);
  const updateSettings = <TKey extends keyof DiscordLevelingSettings>(key: TKey, value: DiscordLevelingSettings[TKey]) => {
    setData((current) => ({ ...current, settings: { ...current.settings, [key]: value } }));
  };
  const updateSkinClaimSettings = <TKey extends keyof DiscordSkinClaimSettings>(key: TKey, value: DiscordSkinClaimSettings[TKey]) => {
    setData((current) => ({ ...current, skinClaimSettings: { ...current.skinClaimSettings, [key]: value } }));
  };
  const updateFishingRoleSettings = <TKey extends keyof DiscordFishingRoleSettings>(key: TKey, value: DiscordFishingRoleSettings[TKey]) => {
    setData((current) => ({ ...current, fishingRoleSettings: { ...current.fishingRoleSettings, [key]: value } }));
  };
  const toggleId = (values: string[], value: string) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value].sort();
  const toggleRewardRole = (roleId: string) => setSelectedRoleIds((current) => toggleId(current, roleId));
  const toggleFishingRewardRole = (roleId: string) => setSelectedFishingRoleIds((current) => toggleId(current, roleId));
  const toggleFishingBonusRole = (roleId: string) => setData((current) => ({
    ...current,
    fishingBonusSettings: {
      ...current.fishingBonusSettings,
      bonusRoleIds: toggleId(current.fishingBonusSettings.bonusRoleIds, roleId),
    },
  }));
  const toggleFishingPhenomenonWeekday = (phenomenon: DiscordFishingWeekdayPhenomenonId, weekdayValue: string) => {
    setData((current) => {
      const existing = current.fishingBonusSettings.weekdayPhenomena.find((entry) => entry.phenomenon === phenomenon);
      const weekdays = toggleId((existing?.weekdays ?? []).map(String), weekdayValue).map(Number).sort((left, right) => left - right);
      const weekdayPhenomena = current.fishingBonusSettings.weekdayPhenomena.filter((entry) => entry.phenomenon !== phenomenon);
      return {
        ...current,
        fishingBonusSettings: {
          ...current.fishingBonusSettings,
          weekdayPhenomena: weekdays.length ? [...weekdayPhenomena, { phenomenon, weekdays }] : weekdayPhenomena,
        },
      };
    });
  };
  const toggleManualRole = (roleId: string) => setData((current) => ({ ...current, manualXpRoleIds: toggleId(current.manualXpRoleIds, roleId) }));
  const toggleCollectionAdminRole = (roleId: string) => setData((current) => ({ ...current, collectionAdminRoleIds: toggleId(current.collectionAdminRoleIds, roleId) }));
  const toggleLeaderboardExcludedRole = (roleId: string) => setData((current) => ({ ...current, leaderboardExcludedRoleIds: toggleId(current.leaderboardExcludedRoleIds, roleId) }));
  const toggleSkinClaimChannel = (channelId: string) => setData((current) => {
    if (channelId === ALL_SKIN_CLAIM_CHANNELS_VALUE) {
      return {
        ...current,
        skinClaimSettings: { ...current.skinClaimSettings, allChannels: !current.skinClaimSettings.allChannels },
      };
    }
    const skinClaimChannelIds = toggleId(current.skinClaimChannelIds, channelId);
    return { ...current, skinClaimChannelIds, skinClaimSettings: { ...current.skinClaimSettings, allChannels: false } };
  });
  const toggleFishingCommandChannel = (channelId: string) => setData((current) => {
    if (channelId === ALL_FISHING_COMMAND_CHANNELS_VALUE) {
      if (current.fishingCommandSettings.allChannels) return current;
      return {
        ...current,
        fishingCommandChannelIds: [],
        fishingCommandSettings: { ...current.fishingCommandSettings, allChannels: true },
      };
    }
    const fishingCommandChannelIds = toggleId(current.fishingCommandChannelIds, channelId);
    return {
      ...current,
      fishingCommandChannelIds,
      fishingCommandSettings: { ...current.fishingCommandSettings, allChannels: fishingCommandChannelIds.length === 0 },
    };
  });
  const updateSkinClaimRarityWeight = (rarity: DiscordSkinClaimRarityWeight['rarity'], weight: number) => setData((current) => ({
    ...current,
    skinClaimRarityWeights: current.skinClaimRarityWeights.map((entry) => entry.rarity === rarity ? { ...entry, weight } : entry),
  }));
  const updateSkinClaimSellValue = (rarity: DiscordSkinClaimSellValue['rarity'], amount: number) => setData((current) => ({
    ...current,
    skinClaimSellValues: current.skinClaimSellValues.map((entry) => entry.rarity === rarity ? { ...entry, amount } : entry),
  }));
  const toggleRewardMessage = (level: number) => setExpandedRewardMessageLevels((current) => current.includes(level)
    ? current.filter((item) => item !== level)
    : [...current, level]);

  const addRewardLevel = () => {
    const level = Number(rewardLevel);
    if (!Number.isInteger(level) || level < 1 || level > 10000 || selectedRoleIds.length === 0) {
      setMessage('Choose one or more assignable roles and a level between 1 and 10,000.');
      return;
    }
    if (data.roleRewards.some((reward) => reward.level === level)) {
      setMessage('That reward level already exists. Remove it first if you need to replace its roles.');
      return;
    }
    setData((current) => ({ ...current, roleRewards: sortRewards([...current.roleRewards, { level, levelUpMessageTemplate: null, roleIds: selectedRoleIds }]) }));
    setSelectedRoleIds([]);
  };
  const removeRewardLevel = (level: number) => setData((current) => ({ ...current, roleRewards: current.roleRewards.filter((reward) => reward.level !== level) }));
  const removeRewardRole = (level: number, roleId: string) => setData((current) => ({
    ...current,
    roleRewards: current.roleRewards.flatMap((reward) => {
      if (reward.level !== level) return [reward];
      const roleIds = reward.roleIds.filter((item) => item !== roleId);
      return roleIds.length ? [{ ...reward, roleIds }] : [];
    }),
  }));
  const updateRewardMessage = (level: number, template: string) => setData((current) => ({
    ...current,
    roleRewards: current.roleRewards.map((reward) => reward.level === level ? { ...reward, levelUpMessageTemplate: template.trim() ? template : null } : reward),
  }));
  const addFishingRewardLevel = () => {
    const level = Number(fishingRewardLevel);
    if (!Number.isInteger(level) || level < 1 || level > 10000 || selectedFishingRoleIds.length === 0) {
      setMessage('Choose one or more assignable roles and a Fishing level between 1 and 10,000.');
      return;
    }
    if (data.fishingRoleRewards.some((reward) => reward.level === level)) {
      setMessage('That Fishing reward level already exists. Remove it first if you need to replace its roles.');
      return;
    }
    setData((current) => ({ ...current, fishingRoleRewards: sortFishingRewards([...current.fishingRoleRewards, { level, roleIds: selectedFishingRoleIds }]) }));
    setSelectedFishingRoleIds([]);
  };
  const removeFishingRewardLevel = (level: number) => setData((current) => ({ ...current, fishingRoleRewards: current.fishingRoleRewards.filter((reward) => reward.level !== level) }));
  const removeFishingRewardRole = (level: number, roleId: string) => setData((current) => ({
    ...current,
    fishingRoleRewards: current.fishingRoleRewards.flatMap((reward) => {
      if (reward.level !== level) return [reward];
      const roleIds = reward.roleIds.filter((item) => item !== roleId);
      return roleIds.length ? [{ ...reward, roleIds }] : [];
    }),
  }));

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = await getAccessToken();
    if (!token) {
      setMessage('Sign in with a KnowLeague administrator account to save settings.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/discord/leveling', {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data.settings,
          collectionAdminRoleIds: data.collectionAdminRoleIds,
          leaderboardExcludedRoleIds: data.leaderboardExcludedRoleIds,
          manualXpRoleIds: data.manualXpRoleIds,
          roleRewards: data.roleRewards,
          skinClaimAllChannels: data.skinClaimSettings.allChannels,
          skinClaimChannelIds: data.skinClaimChannelIds,
          skinClaimClaimWindowMinutes: data.skinClaimSettings.claimWindowMinutes,
          skinClaimClaimGracePeriodSeconds: data.skinClaimSettings.claimGracePeriodSeconds,
          skinClaimCommandChannelId: data.skinClaimSettings.commandChannelId,
          skinClaimEnabled: data.skinClaimSettings.enabled,
          skinClaimCollectionCapacityUpgradeCost: data.skinClaimSettings.collectionCapacityUpgradeCost,
          skinClaimCollectionStealChancePercent: data.skinClaimSettings.collectionStealChancePercent,
          skinClaimDefaultCollectionCapacity: data.skinClaimSettings.defaultCollectionCapacity,
          skinClaimMaximumIntervalMinutes: data.skinClaimSettings.maximumIntervalMinutes,
          skinClaimMinimumIntervalMinutes: data.skinClaimSettings.minimumIntervalMinutes,
          skinClaimRarityWeights: data.skinClaimRarityWeights,
          skinClaimSellValues: data.skinClaimSellValues,
          skinClaimSummonBaseCost: data.skinClaimSettings.summonBaseCost,
          fishingCommandAllChannels: data.fishingCommandSettings.allChannels,
          fishingCommandChannelIds: data.fishingCommandChannelIds,
          fishingBonusRoleIds: data.fishingBonusSettings.bonusRoleIds,
          fishingRoleRewards: data.fishingRoleRewards,
          fishingTopFisherRoleId: data.fishingRoleSettings.topFisherRoleId,
          fishingWeekdayPhenomena: data.fishingBonusSettings.weekdayPhenomena,
        }),
      });
      const body = await response.json() as Partial<LevelingSettingsResponse> & { error?: string };
      if (!response.ok || !body.settings || !body.roles || !body.roleRewards || !body.manualXpRoleIds || !body.collectionAdminRoleIds || !body.leaderboardExcludedRoleIds || !body.channels || !body.skinClaimSettings || !body.skinClaimChannelIds || !body.skinClaimRarityWeights || !body.skinClaimSellValues || !body.fishingCommandSettings || !body.fishingCommandChannelIds || !body.fishingBonusSettings || !body.fishingRoleRewards || !body.fishingRoleSettings) throw new Error(body.error ?? 'Unable to save Discord Configuration.');
      setData({ channels: body.channels, collectionAdminRoleIds: body.collectionAdminRoleIds, leaderboardExcludedRoleIds: body.leaderboardExcludedRoleIds, manualXpRoleIds: body.manualXpRoleIds, roleRewards: sortRewards(body.roleRewards), roles: body.roles, settings: body.settings, skinClaimChannelIds: body.skinClaimChannelIds, skinClaimRarityWeights: body.skinClaimRarityWeights, skinClaimSellValues: body.skinClaimSellValues, skinClaimSettings: body.skinClaimSettings, fishingCommandChannelIds: body.fishingCommandChannelIds, fishingCommandSettings: body.fishingCommandSettings, fishingBonusSettings: body.fishingBonusSettings, fishingRoleRewards: sortFishingRewards(body.fishingRoleRewards), fishingRoleSettings: body.fishingRoleSettings });
      setMessage('Discord Configuration saved. Fishing reward roles are granted when eligible members next gain Fishing XP.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save Discord Configuration.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => router.push('/profile')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-slate-950 px-4 text-sm font-bold text-slate-200 transition hover:border-white/25 hover:bg-slate-900 hover:text-white"><ArrowLeft size={16} />Back to Profile</button>
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-bold text-amber-100"><UsersRound size={14} />Discord account · Admin only</span>
      </div>
      <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Discord Configuration</p>
        <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">{activeTab === 'leveling' ? 'Chat leveling' : activeTab === 'collections' ? 'Skin collections' : 'Fishing'}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{activeTab === 'leveling' ? 'Eligible non-bot messages earn XP with a per-member, server-wide cooldown. KnowLeague stores progression data only; it never stores Discord message text.' : activeTab === 'collections' ? 'Configure random skin drops, collection capacity, KnowBucks costs, claiming grace periods, and rarity-based sale values.' : 'Choose where members can use the `/fish` command. Additional fishing controls will appear here as the game grows.'}</p>
      </section>
      {loading ? <div className="mt-5 flex min-h-48 items-center justify-center rounded-3xl border border-white/10 bg-slate-950/80 text-sm font-semibold text-slate-300"><LoaderCircle size={20} className="mr-2 animate-spin text-amber-300" />Loading Discord Configuration…</div> : (
        <form onSubmit={save} className="mt-5 grid gap-5">
          <div role="tablist" aria-label="Discord Configuration sections" className="inline-flex w-fit rounded-2xl border border-white/10 bg-slate-950/80 p-1">
            <button type="button" role="tab" aria-selected={activeTab === 'leveling'} onClick={() => setActiveTab('leveling')} className={'min-h-10 rounded-xl px-4 text-sm font-black transition ' + (activeTab === 'leveling' ? 'bg-amber-300 text-slate-950' : 'text-slate-300 hover:bg-slate-900 hover:text-white')}>Chat leveling</button>
            <button type="button" role="tab" aria-selected={activeTab === 'collections'} onClick={() => setActiveTab('collections')} className={'min-h-10 rounded-xl px-4 text-sm font-black transition ' + (activeTab === 'collections' ? 'bg-amber-300 text-slate-950' : 'text-slate-300 hover:bg-slate-900 hover:text-white')}>Collections</button>
            <button type="button" role="tab" aria-selected={activeTab === 'fishing'} onClick={() => setActiveTab('fishing')} className={'min-h-10 rounded-xl px-4 text-sm font-black transition ' + (activeTab === 'fishing' ? 'bg-amber-300 text-slate-950' : 'text-slate-300 hover:bg-slate-900 hover:text-white')}>Fishing</button>
          </div>
          {activeTab === 'leveling' ? <>
          <section className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-black text-white">Earning rules</h2><p className="mt-1 text-sm leading-6 text-slate-400">The five-second default prevents channel hopping from multiplying message XP.</p></div><button type="button" role="switch" aria-checked={data.settings.enabled} onClick={() => updateSettings('enabled', !data.settings.enabled)} className="inline-flex min-h-12 items-center gap-3 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-bold text-white transition hover:border-amber-300/40"><ToggleSwitch checked={data.settings.enabled} />{data.settings.enabled ? 'Leveling enabled' : 'Leveling paused'}</button></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2"><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">XP per eligible message</span><input type="number" min={1} max={1000} value={data.settings.xpPerMessage} onChange={(event) => updateSettings('xpPerMessage', Number(event.target.value))} className="h-12 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-semibold text-white outline-none transition focus:border-amber-300 focus:ring-1 focus:ring-amber-300" /></label>
              <label className="grid gap-2"><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Member cooldown in seconds</span><input type="number" min={1} max={3600} value={data.settings.cooldownSeconds} onChange={(event) => updateSettings('cooldownSeconds', Number(event.target.value))} className="h-12 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-semibold text-white outline-none transition focus:border-amber-300 focus:ring-1 focus:ring-amber-300" /></label>
            </div>
          </section>
          </> : null}
          {activeTab === 'collections' ? <>
          <section className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><h2 className="text-lg font-black text-white">Skin claim drops</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">After the minimum interval, the next eligible message spawns a random skin in that channel. After the maximum interval, a drop appears in a random eligible channel even without chat activity. The first human reaction claims it.</p></div>
              <button type="button" role="switch" aria-checked={data.skinClaimSettings.enabled} onClick={() => updateSkinClaimSettings('enabled', !data.skinClaimSettings.enabled)} className="inline-flex min-h-12 items-center gap-3 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-bold text-white transition hover:border-amber-300/40"><ToggleSwitch checked={data.skinClaimSettings.enabled} />{data.skinClaimSettings.enabled ? 'Skin drops enabled' : 'Skin drops paused'}</button>
            </div>
            {data.channels.length === 0 ? <div className="flex gap-3 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100"><CircleAlert size={18} className="mt-0.5 shrink-0" />No Discord text channels have been synced yet. Restart the bot after applying the skin-claim migration, then reload this page.</div> : null}
            <div className="grid gap-4 lg:grid-cols-3">
              <label className="grid gap-2"><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Minimum interval in minutes</span><input type="number" min={1} max={10080} value={data.skinClaimSettings.minimumIntervalMinutes} onChange={(event) => updateSkinClaimSettings('minimumIntervalMinutes', Number(event.target.value))} className="h-12 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-semibold text-white outline-none transition focus:border-amber-300 focus:ring-1 focus:ring-amber-300" /></label>
              <label className="grid gap-2"><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Maximum interval in minutes</span><input type="number" min={1} max={10080} value={data.skinClaimSettings.maximumIntervalMinutes} onChange={(event) => updateSkinClaimSettings('maximumIntervalMinutes', Number(event.target.value))} className="h-12 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-semibold text-white outline-none transition focus:border-amber-300 focus:ring-1 focus:ring-amber-300" /></label>
              <label className="grid gap-2"><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Claim window in minutes</span><input type="number" min={1} max={1440} value={data.skinClaimSettings.claimWindowMinutes} onChange={(event) => updateSkinClaimSettings('claimWindowMinutes', Number(event.target.value))} className="h-12 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-semibold text-white outline-none transition focus:border-amber-300 focus:ring-1 focus:ring-amber-300" /></label>
            </div>
            <AppSelectMenu label="Channels that can trigger a drop" value={data.skinClaimSettings.allChannels ? ALL_SKIN_CLAIM_CHANNELS_VALUE : data.skinClaimChannelIds[0] ?? ''} selectedValues={data.skinClaimSettings.allChannels ? [ALL_SKIN_CLAIM_CHANNELS_VALUE] : data.skinClaimChannelIds} multiple onToggle={toggleSkinClaimChannel} disabled={!data.channels.some((channel) => channel.sendable)} disabledDescription="No Discord text channels are currently available to the bot." headerDescription="All is the default and includes every sendable text channel. Select one or more specific channels to limit both message-triggered and timer-based drops." searchable searchPlaceholder="Type a channel name or ID" options={[{ value: ALL_SKIN_CLAIM_CHANNELS_VALUE, label: 'All', description: 'Every sendable Discord text channel can trigger and receive a skin drop.' }, ...data.channels.filter((channel) => channel.sendable).map((channel) => ({ value: channel.id, label: '#' + channel.name, description: 'Discord channel ID: ' + channel.id }))]} menuClassName="min-w-[min(32rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]" />
            <AppSelectMenu label="Collections commands channel" value={data.skinClaimSettings.commandChannelId ?? ALL_COLLECTIONS_COMMAND_CHANNELS_VALUE} onChange={(channelId) => updateSkinClaimSettings('commandChannelId', channelId === ALL_COLLECTIONS_COMMAND_CHANNELS_VALUE ? null : channelId)} disabled={!data.channels.some((channel) => channel.sendable)} disabledDescription="No Discord text channels are currently available to the bot." headerDescription="All channels is the default. Select one channel to limit every /collections command there; /collections spawn remains available to collection administrators in any channel where the bot can post." searchable searchPlaceholder="Type a channel name or ID" options={[{ value: ALL_COLLECTIONS_COMMAND_CHANNELS_VALUE, label: 'All channels', description: 'Members can use Collections commands in any channel.' }, ...data.channels.filter((channel) => channel.sendable).map((channel) => ({ value: channel.id, label: '#' + channel.name, description: 'Discord channel ID: ' + channel.id }))]} menuClassName="min-w-[min(32rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]" />
            <div><h3 className="text-sm font-black text-white">Rarity weights</h3><p className="mt-1 text-xs leading-5 text-slate-400">Weights are relative chances, not percentages. Set a rarity to 0 to exclude it; at least one rarity must remain above 0.</p><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.skinClaimRarityWeights.map((entry) => <label key={entry.rarity} className="grid gap-2 rounded-2xl border border-white/10 bg-slate-900/60 p-3"><span className="text-sm font-bold text-slate-200">{entry.rarity}</span><input type="number" min={0} max={1000} value={entry.weight} onChange={(event) => updateSkinClaimRarityWeight(entry.rarity, Number(event.target.value))} className="h-10 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white outline-none transition focus:border-amber-300 focus:ring-1 focus:ring-amber-300" /></label>)}</div></div>
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <h3 className="text-sm font-black text-white">Collection economy</h3>
              <p className="mt-1 text-xs leading-5 text-slate-400">These amounts apply to the `/collections` commands. Capacity purchases add five slots per configured cost unit.</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <label className="grid gap-2"><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Summon base cost</span><input type="number" min={1} max={1000000000} value={data.skinClaimSettings.summonBaseCost} onChange={(event) => updateSkinClaimSettings('summonBaseCost', Number(event.target.value))} className="h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white outline-none transition focus:border-amber-300 focus:ring-1 focus:ring-amber-300" /></label>
                <label className="grid gap-2"><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Default collection size</span><input type="number" min={1} max={10000} value={data.skinClaimSettings.defaultCollectionCapacity} onChange={(event) => updateSkinClaimSettings('defaultCollectionCapacity', Number(event.target.value))} className="h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white outline-none transition focus:border-amber-300 focus:ring-1 focus:ring-amber-300" /></label>
                <label className="grid gap-2"><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Cost per 5 added slots</span><input type="number" min={1} max={1000000000} value={data.skinClaimSettings.collectionCapacityUpgradeCost} onChange={(event) => updateSkinClaimSettings('collectionCapacityUpgradeCost', Number(event.target.value))} className="h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white outline-none transition focus:border-amber-300 focus:ring-1 focus:ring-amber-300" /></label>
                <label className="grid gap-2"><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Steal base chance (%)</span><input type="number" min={0} max={100} value={data.skinClaimSettings.collectionStealChancePercent} onChange={(event) => updateSkinClaimSettings('collectionStealChancePercent', Number(event.target.value))} className="h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white outline-none transition focus:border-amber-300 focus:ring-1 focus:ring-amber-300" /></label>
                <label className="grid gap-2"><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Summon and gamble grace (seconds)</span><input type="number" min={0} max={600} value={data.skinClaimSettings.claimGracePeriodSeconds} onChange={(event) => updateSkinClaimSettings('claimGracePeriodSeconds', Number(event.target.value))} className="h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white outline-none transition focus:border-amber-300 focus:ring-1 focus:ring-amber-300" /></label>
              </div>
              <div className="mt-4"><h4 className="text-sm font-black text-white">Skin sell amounts</h4><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.skinClaimSellValues.map((entry) => <label key={entry.rarity} className="grid gap-2 rounded-xl border border-white/10 bg-slate-950/80 p-3"><span className="text-sm font-bold text-slate-200">{entry.rarity}</span><input type="number" min={1} max={1000000000} value={entry.amount} onChange={(event) => updateSkinClaimSellValue(entry.rarity, Number(event.target.value))} className="h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm font-semibold text-white outline-none transition focus:border-amber-300 focus:ring-1 focus:ring-amber-300" /></label>)}</div></div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <h3 className="text-sm font-black text-white">Collections admin permissions</h3>
              <p className="mt-1 text-xs leading-5 text-slate-400">Members with these roles can use <code>/collections spawn</code> and <code>/collections capacity-force-add</code>. This is separate from XP and KnowBucks staff access.</p>
              <div className="mt-4">
                <AppSelectMenu
                  label="Roles allowed to manage collections"
                  value={data.collectionAdminRoleIds[0] ?? ''}
                  selectedValues={data.collectionAdminRoleIds}
                  multiple
                  onToggle={toggleCollectionAdminRole}
                  disabled={!data.roles.length}
                  disabledDescription="No Discord roles have been synced yet."
                  headerDescription="Choose one or more current server roles for collection-only staff commands."
                  searchable
                  searchPlaceholder="Type a role name or ID"
                  options={data.roles.map((role) => ({ value: role.id, label: role.name, description: 'Discord role ID: ' + role.id }))}
                  menuClassName="min-w-[min(32rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]"
                />
              </div>
            </div>
          </section>
          </> : null}
          {activeTab === 'fishing' ? <>
          <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 sm:p-5">
            <div>
              <h2 className="text-lg font-black text-white">Fishing command channels</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">Choose every channel where members may use <code>/fish</code>. All channels is the default; selecting one or more individual channels restricts every fishing subcommand to those channels.</p>
            </div>
            <div className="mt-4">
              <AppSelectMenu
                label="Channels where fishing commands are usable"
                value={data.fishingCommandSettings.allChannels ? ALL_FISHING_COMMAND_CHANNELS_VALUE : data.fishingCommandChannelIds[0] ?? ''}
                selectedValues={data.fishingCommandSettings.allChannels ? [ALL_FISHING_COMMAND_CHANNELS_VALUE] : data.fishingCommandChannelIds}
                multiple
                onToggle={toggleFishingCommandChannel}
                disabled={!data.channels.some((channel) => channel.sendable)}
                disabledDescription="No Discord text channels have been synced yet. Start or restart the bot, then reload this page."
                headerDescription="All channels permits fishing everywhere. Otherwise, choose one or more sendable channels."
                searchable
                searchPlaceholder="Type a channel name or ID"
                options={[
                  { value: ALL_FISHING_COMMAND_CHANNELS_VALUE, label: 'All channels', description: 'Allow /fish in every channel where the bot can receive commands.' },
                  ...data.channels.filter((channel) => channel.sendable).map((channel) => ({ value: channel.id, label: '#' + channel.name, description: 'Discord channel ID: ' + channel.id })),
                ]}
                menuClassName="min-w-[min(32rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]"
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">A change takes effect in the bot within about 30 seconds. Existing expeditions continue and update their original launch message when complete.</p>
          </section>
          <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 sm:p-5">
            <div>
              <h2 className="text-lg font-black text-white">Fishing member bonus roles</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">Members who hold any selected role receive 10% more Fishing XP and KnowBucks. The bonus is evaluated and saved when each expedition starts, so later role changes do not alter an active trip.</p>
            </div>
            <div className="mt-4 max-w-2xl">
              <AppSelectMenu
                label="Roles receiving the Fishing member bonus"
                value={data.fishingBonusSettings.bonusRoleIds[0] ?? ''}
                selectedValues={data.fishingBonusSettings.bonusRoleIds}
                multiple
                onToggle={toggleFishingBonusRole}
                disabled={!fishingBonusRoleOptions.length}
                disabledDescription="No Discord roles have been synced yet."
                headerDescription="Choose one or more roles. Roles do not need to be bot-assignable because this is a membership benefit."
                searchable
                searchPlaceholder="Type a role name or ID"
                options={fishingBonusRoleOptions}
                menuClassName="min-w-[min(32rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]"
              />
            </div>
          </section>
          <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 sm:p-5">
            <div>
              <h2 className="text-lg font-black text-white">Scheduled Fishing phenomena</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">Choose the UTC weekdays for each effect. Active effects are saved with an expedition at launch, so calendar edits never change a trip already in progress.</p>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {DISCORD_FISHING_WEEKDAY_PHENOMENA.map((phenomenon) => {
                const details = FISHING_PHENOMENON_DETAILS[phenomenon];
                const weekdays = data.fishingBonusSettings.weekdayPhenomena.find((entry) => entry.phenomenon === phenomenon)?.weekdays ?? [];
                return <div key={phenomenon} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <h3 className="text-sm font-black text-white">{details.label}</h3>
                  <p className="mt-1 min-h-10 text-xs leading-5 text-slate-400">{details.description}</p>
                  <div className="mt-3"><AppSelectMenu label={'UTC weekdays for ' + details.label} value={weekdays[0]?.toString() ?? ''} selectedValues={weekdays.map(String)} multiple onToggle={(weekday) => toggleFishingPhenomenonWeekday(phenomenon, weekday)} headerDescription="Select one or more UTC weekdays, or clear every selection to disable this phenomenon." options={[...FISHING_WEEKDAY_OPTIONS]} /></div>
                </div>;
              })}
            </div>
          </section>
          <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 sm:p-5">
            <div>
              <h2 className="text-lg font-black text-white">Fishing level role rewards</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">Grant one or more permanent roles when a member reaches a Fishing skill level. Roles are granted as members gain Fishing XP from expeditions and crates.</p>
            </div>
            {data.roles.length === 0 ? <div className="mt-4 flex gap-3 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100"><CircleAlert size={18} className="mt-0.5 shrink-0" />No Discord roles have been synced yet. Start or restart the bot, then reload this page.</div> : null}
            {data.fishingRoleRewards.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{data.fishingRoleRewards.map((reward) => <div key={reward.level} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-black text-white">Fishing level {formatNumber(reward.level)}</p><button type="button" onClick={() => removeFishingRewardLevel(reward.level)} className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-rose-300/30 px-3 text-xs font-bold text-rose-100 transition hover:bg-rose-400/10"><Trash2 size={14} />Remove level</button></div><div className="mt-3 flex flex-wrap gap-2">{reward.roleIds.map((roleId) => <span key={roleId} className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-xs font-bold text-amber-100">{roleById.get(roleId)?.name ?? 'Unavailable role'}<button type="button" aria-label={'Remove ' + (roleById.get(roleId)?.name ?? 'role')} onClick={() => removeFishingRewardRole(reward.level, roleId)} className="rounded-full text-amber-100 transition hover:text-white"><X size={14} /></button></span>)}</div></div>)}</div> : <p className="mt-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm leading-6 text-slate-400">No Fishing level roles are configured yet.</p>}
            <div className="mt-4 grid gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4 lg:grid-cols-[minmax(0,1fr)_11rem_auto] lg:items-end">
              <AppSelectMenu label="Roles for this Fishing level" value={selectedFishingRoleIds[0] ?? ''} selectedValues={selectedFishingRoleIds} multiple onToggle={toggleFishingRewardRole} disabled={!availableFishingRewardRoles.length} disabledDescription="No assignable roles remain available for Fishing rewards." headerDescription="Choose one or more roles below the KnowLeague bot role. Each role can be used at one Fishing level." searchable searchPlaceholder="Type a role name or ID" options={availableFishingRewardRoles.map((role) => ({ value: role.id, label: role.name, description: 'Discord role ID: ' + role.id }))} menuClassName="min-w-[min(32rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]" />
              <label className="grid gap-2"><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Fishing level</span><input type="number" min={1} max={10000} value={fishingRewardLevel} onChange={(event) => setFishingRewardLevel(event.target.value)} className="h-12 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm font-semibold text-white outline-none transition focus:border-amber-300 focus:ring-1 focus:ring-amber-300" /></label>
              <button type="button" onClick={addFishingRewardLevel} disabled={!selectedFishingRoleIds.length} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-amber-300/50 bg-amber-300 px-4 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"><Plus size={16} />Add reward level</button>
            </div>
          </section>
          <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 sm:p-5">
            <div>
              <h2 className="text-lg font-black text-white">Top Fisher role</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">Assign one bot-managed role to the highest Fishing-level member. Ties use Fishing XP, then Discord ID, so the role has one predictable holder.</p>
            </div>
            <div className="mt-4 max-w-xl">
              <AppSelectMenu label="Role for the top Fisher" value={data.fishingRoleSettings.topFisherRoleId ?? ''} onChange={(roleId) => updateFishingRoleSettings('topFisherRoleId', roleId || null)} disabled={!data.roles.length} disabledDescription="No Discord roles have been synced yet." headerDescription="Choose a dedicated role below the KnowLeague bot role. It cannot also be a permanent reward, champion, or staff role." searchable searchPlaceholder="Type a role name or ID" options={[{ value: '', label: 'No top Fisher role', description: 'Fishing rankings remain available without a managed role.' }, ...availableTopFisherRoles.map((role) => ({ value: role.id, label: role.name, description: 'Discord role ID: ' + role.id }))]} menuClassName="min-w-[min(32rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]" />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">The bot tracks and removes only the top-Fisher assignment it created. Changes reconcile within about a minute and after a Fishing expedition settles.</p>
          </section>
          </> : null}
          {activeTab === 'leveling' ? <>
          <section className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-black text-white">Default level-up message</h2><p className="mt-1 text-sm leading-6 text-slate-400">Use the message channel where XP was earned, or route all announcements to one channel ID.</p></div><button type="button" role="switch" aria-checked={data.settings.levelUpMessageEnabled} onClick={() => updateSettings('levelUpMessageEnabled', !data.settings.levelUpMessageEnabled)} className="inline-flex min-h-12 items-center gap-3 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-bold text-white transition hover:border-amber-300/40"><ToggleSwitch checked={data.settings.levelUpMessageEnabled} />{data.settings.levelUpMessageEnabled ? 'Message enabled' : 'Message disabled'}</button></div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <label className="grid gap-2"><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Message template</span><textarea rows={3} maxLength={500} value={data.settings.levelUpMessageTemplate} onChange={(event) => updateSettings('levelUpMessageTemplate', event.target.value)} className="min-h-24 resize-y rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-amber-300 focus:ring-1 focus:ring-amber-300" /><span className="text-xs leading-5 text-slate-400">Use <code>{'{user}'}</code> to mention the member, <code>{'{username}'}</code> for their plain-text username, and <code>{'{level}'}</code> or <code>{'{xp}'}</code> for progression. Role and @everyone pings are blocked.</span></label>
              <label className="grid content-start gap-2"><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Announcement channel ID</span><input type="text" inputMode="numeric" maxLength={20} value={data.settings.levelUpMessageChannelId ?? ''} placeholder="Same channel as the message" onChange={(event) => updateSettings('levelUpMessageChannelId', event.target.value.replace(/\s/g, '') || null)} className="h-12 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-1 focus:ring-amber-300" /><span className="text-xs leading-5 text-slate-400">Leave blank to announce in the channel where the member leveled up.</span></label>
            </div>
          </section>
          <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-black text-white">Lurkr XP curve</h2><p className="mt-1 text-sm leading-6 text-slate-400">Total XP required for level <em>n</em> is 50n² − 100n + 150, matching Lurkr through level 100.</p></div><span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-xs font-bold text-amber-100">Level 100: {formatNumber(getDiscordTotalXpForLevel(100))} XP</span></div><CurveGraph /></section>
          <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 sm:p-5">
            <div><h2 className="text-lg font-black text-white">Level role rewards</h2><p className="mt-1 text-sm leading-6 text-slate-400">Select all roles for a reward level at once. A reward-level message overrides the default announcement at that exact level and supports the same <code>{'{user}'}</code>, <code>{'{username}'}</code>, <code>{'{level}'}</code>, and <code>{'{xp}'}</code> tokens.</p></div>
            {data.roles.length === 0 ? <div className="mt-4 flex gap-3 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100"><CircleAlert size={18} className="mt-0.5 shrink-0" />No Discord roles have been synced yet. Start or restart the bot after granting it Manage Roles, then reload this page.</div> : null}
            {data.roleRewards.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{data.roleRewards.map((reward) => {
              const messageExpanded = expandedRewardMessageLevels.includes(reward.level);
              const hasCustomMessage = Boolean(reward.levelUpMessageTemplate);
              return <article key={reward.level} className="rounded-2xl border border-white/10 bg-slate-900/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><p className="font-black text-white">Level {reward.level}</p><p className="mt-0.5 text-xs text-slate-400">{reward.roleIds.length} role{reward.roleIds.length === 1 ? '' : 's'} granted together.</p></div>
                  <div className="flex items-center gap-2"><button type="button" onClick={() => toggleRewardMessage(reward.level)} className="min-h-9 rounded-lg border border-white/10 bg-slate-950 px-3 text-xs font-bold text-slate-200 transition hover:border-amber-300/40 hover:text-amber-100">{messageExpanded ? 'Hide message' : hasCustomMessage ? 'Edit message' : 'Add message'}</button><button type="button" onClick={() => removeRewardLevel(reward.level)} aria-label={'Remove level ' + reward.level} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 text-xs font-bold text-red-100 transition hover:bg-red-500/20"><Trash2 size={14} />Remove</button></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">{reward.roleIds.map((roleId) => { const role = roleById.get(roleId); return <span key={roleId} className={'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ' + (role?.assignable ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' : 'border-amber-300/25 bg-amber-300/10 text-amber-100')}>{role?.name ?? 'Unavailable Discord role'}<button type="button" aria-label={'Remove ' + (role?.name ?? 'role') + ' from level ' + reward.level} onClick={() => removeRewardRole(reward.level, roleId)} className="rounded-full text-current/80 transition hover:text-white"><X size={14} /></button></span>; })}</div>
                {messageExpanded ? <label className="mt-3 grid gap-2"><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Specific level-up message</span><textarea rows={2} maxLength={500} value={reward.levelUpMessageTemplate ?? ''} placeholder="Use the default level-up message" onChange={(event) => updateRewardMessage(reward.level, event.target.value)} className="min-h-20 resize-y rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-1 focus:ring-amber-300" /></label> : hasCustomMessage ? <p className="mt-3 truncate text-xs text-amber-100/80">Custom message: {reward.levelUpMessageTemplate}</p> : null}
              </article>;
            })}</div> : <p className="mt-4 rounded-2xl border border-dashed border-white/15 bg-slate-900/50 px-4 py-5 text-sm text-slate-400">No level roles configured yet.</p>}
            <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-slate-900/50 p-3 lg:grid-cols-[minmax(0,1fr)_10rem_auto] lg:items-end"><AppSelectMenu label="Roles to grant" value={selectedRoleIds[0] ?? ''} selectedValues={selectedRoleIds} multiple onToggle={toggleRewardRole} disabled={availableRewardRoles.length === 0} disabledDescription="No assignable Discord roles are available." headerDescription="Select one or more roles. Only roles below the bot role can be granted." searchable searchPlaceholder="Type a role name or ID" options={availableRewardRoles.map((role) => ({ value: role.id, label: role.name, description: 'Discord role ID: ' + role.id }))} menuClassName="min-w-[min(32rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]" /><label className="grid gap-2"><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Reward level</span><input type="number" min={1} max={10000} value={rewardLevel} onChange={(event) => setRewardLevel(event.target.value)} className="h-12 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm font-semibold text-white outline-none transition focus:border-amber-300 focus:ring-1 focus:ring-amber-300" /></label><button type="button" onClick={addRewardLevel} disabled={!selectedRoleIds.length} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-amber-300/50 bg-amber-300 px-4 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"><Plus size={16} />Add reward level</button></div>
          </section>
          <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 sm:p-5">
            <div><h2 className="text-lg font-black text-white">Leaderboard champion role</h2><p className="mt-1 text-sm leading-6 text-slate-400">Assign one bot-managed role to the highest-XP eligible member. It moves automatically when another eligible member takes first place.</p></div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <AppSelectMenu label="Role for rank #1" value={data.settings.leaderboardTopRoleId ?? ''} onChange={(roleId) => updateSettings('leaderboardTopRoleId', roleId || null)} disabled={!data.roles.length} disabledDescription="No Discord roles have been synced yet." headerDescription="Choose a role below the bot role. It cannot also be a level reward or manual-XP staff role." searchable searchPlaceholder="Type a role name or ID" options={[{ value: '', label: 'No champion role', description: 'Leaderboard rankings remain available without a managed role.' }, ...availableLeaderboardTopRoles.map((role) => ({ value: role.id, label: role.name, description: 'Discord role ID: ' + role.id }))]} menuClassName="min-w-[min(32rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]" />
              <AppSelectMenu label="Exclude holders of these roles" value={data.leaderboardExcludedRoleIds[0] ?? ''} selectedValues={data.leaderboardExcludedRoleIds} multiple onToggle={toggleLeaderboardExcludedRole} disabled={!data.roles.length} disabledDescription="No Discord roles have been synced yet." headerDescription="Members with any selected role cannot receive the rank #1 champion role." searchable searchPlaceholder="Type a role name or ID" options={data.roles.filter((role) => role.id !== data.settings.leaderboardTopRoleId).map((role) => ({ value: role.id, label: role.name, description: 'Discord role ID: ' + role.id }))} menuClassName="min-w-[min(32rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]" />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">Keep this role dedicated to the leaderboard. The bot tracks and removes only the assignment it created.</p>
          </section>
          <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 sm:p-5">
            <div>
              <h2 className="text-lg font-black text-white">Discord staff permissions</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">Members with any selected role can use <code>/xp add</code>, <code>/xp set-level</code>, and administrative <code>/knowbucks</code> commands. Collections administrator roles are configured in the Collections tab.</p>
            </div>
            <div className="mt-4">
              <AppSelectMenu
                label="Roles allowed to manage XP and KnowBucks"
                value={data.manualXpRoleIds[0] ?? ''}
                selectedValues={data.manualXpRoleIds}
                multiple
                onToggle={toggleManualRole}
                disabled={!data.roles.length}
                disabledDescription="No Discord roles have been synced yet."
                headerDescription="Choose one or more server roles. Their members can grant XP, set member levels, and manage KnowBucks."
                searchable
                searchPlaceholder="Type a role name or ID"
                options={data.roles.map((role) => ({ value: role.id, label: role.name, description: 'Discord role ID: ' + role.id }))}
                menuClassName="min-w-[min(32rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]"
              />
            </div>
          </section>
          </> : null}
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-3xl text-sm leading-6 text-slate-400">Changes in all tabs save together. Bot accounts and Discord system messages never receive XP. Staff commands require one of the configured Discord staff roles.</p><button type="submit" disabled={saving} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">{saving ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />}{saving ? 'Saving settings' : 'Save settings'}</button></div>
        </form>
      )}
      {message ? <p className={'mt-5 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ' + (message.includes('saved') ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : 'border-amber-300/25 bg-amber-300/10 text-amber-100')}>{message.includes('saved') ? <Check size={17} className="mt-0.5 shrink-0" /> : <CircleAlert size={17} className="mt-0.5 shrink-0" />}{message}</p> : null}
    </main>
  );
}
