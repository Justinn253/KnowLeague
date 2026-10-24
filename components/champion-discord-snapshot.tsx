import { ChampionCombatProfile } from '@/components/champion-combat-profile';
import { ChampionDetailHeader } from '@/components/champion-detail-shell';
import {
  ChampionGameplayAbilityDetails,
  ChampionGameplayStatistics,
} from '@/components/champion-gameplay-details';
import { ChampionOverviewContent } from '@/components/champion-profile';
import { ChampionSkinCatalogue } from '@/components/champion-skins';
import { getChampionHubSkin, type ChampionHubChampion } from '@/lib/champion-hub';

export const CHAMPION_DISCORD_SNAPSHOT_SECTIONS = ['all', 'overview', 'stats', 'abilities', 'skins'] as const;
export type ChampionDiscordSnapshotSection = (typeof CHAMPION_DISCORD_SNAPSHOT_SECTIONS)[number];

/** Static, non-interactive panels captured by the Discord Champion Catalogue command. */
export function ChampionDiscordSnapshot({
  champion,
  section,
}: {
  champion: ChampionHubChampion;
  section: ChampionDiscordSnapshotSection;
}) {
  const selectedSkin = getChampionHubSkin(champion);
  const includesOverview = section === 'all' || section === 'overview';
  const includesStatistics = section === 'all' || section === 'stats';
  const includesAbilities = section === 'all' || section === 'abilities';
  const includesSkins = section === 'all' || section === 'skins';
  const gameplayPanels = champion.gameplayDetails.abilities.map((ability) => {
    const baseAbility = champion.abilities.find((candidate) => candidate.id === ability.abilityId);
    if (!baseAbility) {
      throw new Error(`Champion Catalogue ability ${ability.abilityId} is missing from ${champion.slug}.`);
    }

    return { ability, slot: baseAbility.slot.toLowerCase() };
  });

  return (
    <main
      className="min-h-[100dvh] overflow-x-clip bg-[#030712] px-3 py-5 text-slate-100 sm:px-6 sm:py-8 lg:px-10"
      data-lav-champion-capture-ready="true"
      data-lav-champion-name={champion.name}
      data-lav-champion-slug={champion.slug}
      data-lav-champion-section={section}
    >
      <div className="mx-auto grid w-full max-w-[96rem] gap-5">
        {includesOverview ? (
          <div className="space-y-5" data-lav-champion-snapshot="overview">
            <ChampionDetailHeader champion={champion} />
            <ChampionOverviewContent champion={champion} hideAbilityActions hideAbilityKit />
          </div>
        ) : null}

        {includesStatistics ? (
          <section
            aria-label={`${champion.name} combat statistics and playstyle`}
            className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
            data-lav-champion-snapshot="gameplay-statistics"
          >
            <ChampionGameplayStatistics champion={champion} />
            <ChampionCombatProfile champion={champion} />
          </section>
        ) : null}

        {includesAbilities ? gameplayPanels.map(({ ability, slot }) => (
          <div key={ability.abilityId} data-lav-champion-snapshot={`ability-${slot}`}>
              <ChampionGameplayAbilityDetails
                champion={champion}
                selectedAbilityId={ability.abilityId}
                idPrefix={`discord-${ability.abilityId}`}
              />
            </div>
        )) : null}

        {includesSkins ? (
          <div data-lav-champion-snapshot="skins">
            <ChampionSkinCatalogue champion={champion} selectedSkin={selectedSkin} eagerImages />
          </div>
        ) : null}
      </div>
    </main>
  );
}
