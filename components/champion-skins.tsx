import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight, Coins, ExternalLink, PackageOpen, Tag } from 'lucide-react';
import { ChampionDetailShell } from '@/components/champion-detail-shell';
import { GameDirectImage } from '@/components/game-asset-image';
import { getChampionHubSkin, type ChampionHubChampion, type ChampionHubSkin, type ChampionHubSkinRarity } from '@/lib/champion-hub';

type ChampionSkinsProps = {
  champion: ChampionHubChampion;
  selectedSkinId?: string | null;
};

const RARITY_GEM_PATH: Partial<Record<ChampionHubSkinRarity, string>> = {
  Epic: '/rarity-icons/epic.png',
  Legendary: '/rarity-icons/legendary.png',
  Mythic: '/rarity-icons/mythic.png',
  Ultimate: '/rarity-icons/ultimate.png',
  Exalted: '/rarity-icons/exalted.png',
  Transcendent: '/rarity-icons/transcendent.png',
};

const RARITY_TEXT_CLASS: Record<ChampionHubSkinRarity, string> = {
  Common: 'text-slate-100',
  Rare: 'text-slate-200',
  Epic: 'text-cyan-200',
  Legendary: 'text-red-300',
  Mythic: 'text-fuchsia-300',
  Ultimate: 'text-orange-300',
  Exalted: 'text-cyan-100',
  Transcendent: 'text-violet-200',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

function formatReleaseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}

function skinHref(champion: ChampionHubChampion, skin: ChampionHubSkin) {
  return `/champions/${champion.slug}/skins?skin=${encodeURIComponent(skin.id)}`;
}

function RarityGem({ rarity, loading }: { rarity: ChampionHubSkinRarity; loading?: 'eager' | 'lazy' }) {
  const gemPath = RARITY_GEM_PATH[rarity];

  if (!gemPath) return null;

  return (
    <span role="img" aria-label={`${rarity} skin`} className="inline-flex h-8 w-8 shrink-0 items-center justify-center">
      <GameDirectImage src={gemPath} alt="" width={32} height={32} loading={loading} className="h-8 w-8 object-contain" />
    </span>
  );
}

function SkinBrowseControl({ champion, skin, direction }: { champion: ChampionHubChampion; skin?: ChampionHubSkin; direction: 'previous' | 'next' }) {
  const isPrevious = direction === 'previous';
  const label = isPrevious ? 'Previous skin' : 'Next skin';
  const Icon = isPrevious ? ChevronLeft : ChevronRight;

  if (!skin) {
    return (
      <span aria-disabled="true" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-slate-950/75 text-slate-600">
        <Icon size={22} aria-hidden="true" />
        <span className="sr-only">No {label.toLowerCase()}</span>
      </span>
    );
  }

  return (
    <Link
      href={skinHref(champion, skin)}
      aria-label={`${label}: ${skin.name}`}
      className="group relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/80 text-white transition hover:border-amber-200/75 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200"
    >
      <Icon size={22} className="transition group-hover:scale-110" aria-hidden="true" />
    </Link>
  );
}

function SkinDetails({ skin }: { skin: ChampionHubSkin }) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-amber-200/20 bg-[linear-gradient(145deg,rgba(72,31,10,0.32),rgba(2,6,23,0.94)_55%,rgba(62,12,25,0.38))] p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-14 h-40 w-40 rounded-full bg-amber-300/10 blur-3xl" />
      <div className="relative flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">{skin.name}</h2>
        </div>
        <RarityGem rarity={skin.rarity} />
      </div>

      <dl className="relative mt-6 grid gap-4 text-sm">
        <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3">
          <CalendarDays size={17} className="mt-0.5 text-amber-200" aria-hidden="true" />
          <div>
            <dt className="font-black uppercase tracking-[0.14em] text-slate-500">Release date</dt>
            <dd className="mt-1 font-semibold text-slate-100">{formatReleaseDate(skin.releaseDate)}</dd>
          </div>
        </div>
        <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3">
          <Coins size={17} className="mt-0.5 text-amber-200" aria-hidden="true" />
          <div>
            <dt className="font-black uppercase tracking-[0.14em] text-slate-500">Price</dt>
            <dd className="mt-1 font-semibold text-slate-100">{skin.price}</dd>
          </div>
        </div>
        <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3">
          <PackageOpen size={17} className="mt-0.5 text-amber-200" aria-hidden="true" />
          <div>
            <dt className="font-black uppercase tracking-[0.14em] text-slate-500">Availability</dt>
            <dd className="mt-1 font-semibold text-slate-100">{skin.availability}</dd>
          </div>
        </div>
        <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3">
          <Tag size={17} className="mt-0.5 text-amber-200" aria-hidden="true" />
          <div>
            <dt className="font-black uppercase tracking-[0.14em] text-slate-500">Skin line</dt>
            <dd className="mt-1 font-semibold text-slate-100">{skin.skinLine}</dd>
          </div>
        </div>
      </dl>

      <a
        href={skin.modelViewerUrl}
        target="_blank"
        rel="noreferrer"
        className="relative mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-200/55 bg-amber-300 px-4 text-sm font-black text-slate-950 transition hover:border-amber-100 hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-100"
      >
        View model <ExternalLink size={15} aria-hidden="true" />
      </a>
    </article>
  );
}

function SelectedSkinSplash({ champion, selectedSkin, previousSkin, nextSkin }: {
  champion: ChampionHubChampion;
  selectedSkin: ChampionHubSkin;
  previousSkin?: ChampionHubSkin;
  nextSkin?: ChampionHubSkin;
}) {
  return (
    <section aria-label={`${selectedSkin.name} splash art`} className="relative isolate aspect-[1215/717] overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
      <GameDirectImage
        src={selectedSkin.splashUrl}
        alt={`${selectedSkin.name} splash art`}
        fill
        priority
        sizes="(min-width: 1280px) 720px, (min-width: 768px) 65vw, 100vw"
        className="object-cover object-center"
        style={{ imageRendering: 'auto' }}
      />
      <div className="absolute inset-y-0 left-3 flex items-center sm:left-5">
        <SkinBrowseControl champion={champion} skin={previousSkin} direction="previous" />
      </div>
      <div className="absolute inset-y-0 right-3 flex items-center sm:right-5">
        <SkinBrowseControl champion={champion} skin={nextSkin} direction="next" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-5 sm:p-6">
        <p className="text-xl font-black text-white [text-shadow:0_2px_10px_rgb(2_6_23/0.95)] sm:text-2xl">{selectedSkin.name}</p>
      </div>
    </section>
  );
}

function SkinLore({ skin }: { skin: ChampionHubSkin }) {
  if (!skin.officialLore) return null;

  return (
    <section aria-labelledby="skin-lore-heading" className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 p-5 sm:p-6">
      <div className="pointer-events-none absolute -left-14 -top-16 h-44 w-44 rounded-full bg-red-500/10 blur-3xl" />
      <div className="relative">
        <p id="skin-lore-heading" className="text-[0.66rem] font-black uppercase tracking-[0.2em] text-amber-200">Skin lore</p>
        <p className="mt-4 max-w-4xl text-base leading-7 text-slate-200">{skin.officialLore}</p>
      </div>
    </section>
  );
}

function SkinChromas({ skin }: { skin: ChampionHubSkin }) {
  if (skin.chromas.length === 0) return null;

  return (
    <section aria-labelledby="chromas-heading" className="rounded-2xl border border-white/10 bg-slate-950/80 p-5 sm:p-6">
      <div>
        <div>
          <p className="text-[0.66rem] font-black uppercase tracking-[0.2em] text-amber-200">Chromas</p>
          <h2 id="chromas-heading" className="mt-2 text-2xl font-black tracking-tight text-white">{skin.chromas.length} chroma{skin.chromas.length === 1 ? '' : 's'}</h2>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {skin.chromas.map((chroma) => (
          <article key={chroma.id} className="group overflow-hidden rounded-xl border border-white/10 bg-slate-900/60 transition hover:border-amber-200/50 hover:bg-slate-900">
            <div className="relative aspect-[1.18] overflow-hidden bg-slate-950">
              <GameDirectImage src={chroma.imageUrl} alt={`${chroma.name} chroma`} fill sizes="(min-width: 1280px) 250px, (min-width: 640px) 42vw, 100vw" className="object-cover transition duration-300 group-hover:scale-[1.035]" />
            </div>
            <div className="flex items-center justify-between gap-3 p-4">
              <h3 className="min-w-0 truncate text-sm font-black text-white">{chroma.name}</h3>
              {chroma.modelViewerUrl ? (
                <a
                  href={chroma.modelViewerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="group/model relative inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-amber-200/45 px-2.5 text-xs font-black text-amber-100 transition hover:border-amber-200 hover:bg-amber-200/10 focus:outline-none focus:ring-2 focus:ring-amber-200"
                >
                  3D <ExternalLink size={13} aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ChampionSkinCatalogue({
  champion,
  selectedSkin,
  eagerImages = false,
}: {
  champion: ChampionHubChampion;
  selectedSkin: ChampionHubSkin;
  /** Forces every image to load before a complete Discord gallery screenshot is captured. */
  eagerImages?: boolean;
}) {
  return (
    <section aria-labelledby="skins-heading" className="rounded-2xl border border-white/10 bg-slate-950/80 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p id="skins-heading" className="text-[0.66rem] font-black uppercase tracking-[0.2em] text-amber-200">All {champion.name} skins</p>
        </div>
        <p className="text-sm font-semibold text-slate-400">{champion.skins.length} total skins</p>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {champion.skins.map((skin) => {
          const isSelected = skin.id === selectedSkin.id;

          return (
            <Link
              key={skin.id}
              href={skinHref(champion, skin)}
              aria-current={isSelected ? 'true' : undefined}
              className={`group relative overflow-hidden rounded-xl border text-left transition focus:outline-none focus:ring-2 focus:ring-amber-200 ${isSelected ? 'border-amber-200/85 bg-amber-200/10 ring-1 ring-inset ring-amber-200/25' : 'border-white/10 bg-slate-900/60 hover:-translate-y-0.5 hover:border-amber-200/55'}`}
            >
              <div className="relative aspect-[1215/717] overflow-hidden bg-slate-950">
                <GameDirectImage
                  src={skin.splashUrl}
                  alt={`${skin.name} splash art`}
                  fill
                  sizes="(min-width: 1280px) 250px, (min-width: 640px) 28vw, 48vw"
                  loading={eagerImages ? 'eager' : undefined}
                  className="object-cover object-center transition duration-300 group-hover:scale-[1.025]"
                  style={{ imageRendering: 'auto' }}
                />
                <span className="absolute right-2 top-2"><RarityGem rarity={skin.rarity} loading={eagerImages ? 'eager' : undefined} /></span>
              </div>
              <div className="min-h-16 p-3">
                <p className={`line-clamp-2 text-sm font-black leading-5 ${RARITY_TEXT_CLASS[skin.rarity]}`}>{skin.name}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function ChampionSkins({ champion, selectedSkinId }: ChampionSkinsProps) {
  const selectedSkin = getChampionHubSkin(champion, selectedSkinId);
  const selectedSkinIndex = champion.skins.findIndex((skin) => skin.id === selectedSkin.id);
  const previousSkin = selectedSkinIndex > 0 ? champion.skins[selectedSkinIndex - 1] : undefined;
  const nextSkin = selectedSkinIndex < champion.skins.length - 1 ? champion.skins[selectedSkinIndex + 1] : undefined;

  return (
    <ChampionDetailShell champion={champion} activeTab="skins">
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.75fr)]">
        <SelectedSkinSplash champion={champion} selectedSkin={selectedSkin} previousSkin={previousSkin} nextSkin={nextSkin} />
        <SkinDetails skin={selectedSkin} />
      </section>
      <SkinLore skin={selectedSkin} />
      <SkinChromas skin={selectedSkin} />
      <ChampionSkinCatalogue champion={champion} selectedSkin={selectedSkin} />
    </ChampionDetailShell>
  );
}
