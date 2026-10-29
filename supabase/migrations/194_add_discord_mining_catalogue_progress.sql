begin;

-- Mining resources are consumable, so keep discovery state separate from the
-- current resource inventory used for selling and crafting.
create table public.discord_mining_catalogue_discoveries (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  resource_id text not null check (resource_id ~ '^[a-z][a-z0-9-]{0,63}$'),
  first_discovered_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id, resource_id),
  foreign key (guild_id, discord_user_id)
    references public.discord_mining_players(guild_id, discord_user_id) on delete cascade
);

alter table public.discord_mining_catalogue_discoveries enable row level security;
revoke all on table public.discord_mining_catalogue_discoveries from anon, authenticated;
grant select, insert, update, delete on table public.discord_mining_catalogue_discoveries to service_role;

-- Backfill material still held in inventory as well as all historically
-- completed expedition cargo, which may have been sold or crafted already.
insert into public.discord_mining_catalogue_discoveries as catalogue (
  guild_id,
  discord_user_id,
  resource_id,
  first_discovered_at
)
select inventory.guild_id, inventory.discord_user_id, inventory.resource_id, inventory.acquired_at
from public.discord_game_resource_inventory as inventory
where inventory.resource_id in (
  'coal', 'quartz', 'copper', 'tin', 'iron', 'lead', 'silver', 'tungsten', 'gold', 'platinum', 'cobalt', 'palladium', 'titanium', 'adamantite',
  'opal', 'pearl', 'jade', 'emerald', 'ruby', 'garnet', 'topaz', 'sapphire', 'amethyst', 'aquamarine', 'citrine', 'peridot', 'diamond', 'moissanite',
  'triceratops-fragment-1', 'triceratops-fragment-2', 'triceratops-fragment-3', 'triceratops-fragment-4', 'triceratops-fragment-5',
  'velociraptor-fragment-1', 'velociraptor-fragment-2', 'velociraptor-fragment-3', 'velociraptor-fragment-4', 'velociraptor-fragment-5',
  'ankylosaurus-fragment-1', 'ankylosaurus-fragment-2', 'ankylosaurus-fragment-3', 'ankylosaurus-fragment-4', 'ankylosaurus-fragment-5',
  'spinosaurus-fragment-1', 'spinosaurus-fragment-2', 'spinosaurus-fragment-3', 'spinosaurus-fragment-4', 'spinosaurus-fragment-5',
  'tyrannosaurus-fragment-1', 'tyrannosaurus-fragment-2', 'tyrannosaurus-fragment-3', 'tyrannosaurus-fragment-4', 'tyrannosaurus-fragment-5',
  'stegosaurus-fragment-1', 'stegosaurus-fragment-2', 'stegosaurus-fragment-3', 'stegosaurus-fragment-4', 'stegosaurus-fragment-5',
  'brachiosaurus-fragment-1', 'brachiosaurus-fragment-2', 'brachiosaurus-fragment-3', 'brachiosaurus-fragment-4', 'brachiosaurus-fragment-5'
)
on conflict (guild_id, discord_user_id, resource_id) do update
set first_discovered_at = least(catalogue.first_discovered_at, excluded.first_discovered_at);

insert into public.discord_mining_catalogue_discoveries as catalogue (
  guild_id,
  discord_user_id,
  resource_id,
  first_discovered_at
)
select
  expeditions.guild_id,
  expeditions.discord_user_id,
  cargo.value ->> 'id',
  min(coalesce(expeditions.settled_at, expeditions.updated_at, expeditions.started_at))
from public.discord_mining_expeditions as expeditions
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(expeditions.result -> 'cargo') = 'array' then expeditions.result -> 'cargo'
    else '[]'::jsonb
  end
) as cargo(value)
where expeditions.status = 'completed'
  and cargo.value ->> 'id' in (
    'coal', 'quartz', 'copper', 'tin', 'iron', 'lead', 'silver', 'tungsten', 'gold', 'platinum', 'cobalt', 'palladium', 'titanium', 'adamantite',
    'opal', 'pearl', 'jade', 'emerald', 'ruby', 'garnet', 'topaz', 'sapphire', 'amethyst', 'aquamarine', 'citrine', 'peridot', 'diamond', 'moissanite',
    'triceratops-fragment-1', 'triceratops-fragment-2', 'triceratops-fragment-3', 'triceratops-fragment-4', 'triceratops-fragment-5',
    'velociraptor-fragment-1', 'velociraptor-fragment-2', 'velociraptor-fragment-3', 'velociraptor-fragment-4', 'velociraptor-fragment-5',
    'ankylosaurus-fragment-1', 'ankylosaurus-fragment-2', 'ankylosaurus-fragment-3', 'ankylosaurus-fragment-4', 'ankylosaurus-fragment-5',
    'spinosaurus-fragment-1', 'spinosaurus-fragment-2', 'spinosaurus-fragment-3', 'spinosaurus-fragment-4', 'spinosaurus-fragment-5',
    'tyrannosaurus-fragment-1', 'tyrannosaurus-fragment-2', 'tyrannosaurus-fragment-3', 'tyrannosaurus-fragment-4', 'tyrannosaurus-fragment-5',
    'stegosaurus-fragment-1', 'stegosaurus-fragment-2', 'stegosaurus-fragment-3', 'stegosaurus-fragment-4', 'stegosaurus-fragment-5',
    'brachiosaurus-fragment-1', 'brachiosaurus-fragment-2', 'brachiosaurus-fragment-3', 'brachiosaurus-fragment-4', 'brachiosaurus-fragment-5'
  )
group by expeditions.guild_id, expeditions.discord_user_id, cargo.value ->> 'id'
on conflict (guild_id, discord_user_id, resource_id) do update
set first_discovered_at = least(catalogue.first_discovered_at, excluded.first_discovered_at);

-- Every Mining settlement writes cargo to resource inventory. Recording the
-- discovery there keeps Discord and website settlement paths identical.
create or replace function public.record_discord_mining_catalogue_discovery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.discord_mining_catalogue_discoveries as catalogue (
    guild_id,
    discord_user_id,
    resource_id
  )
  values (new.guild_id, new.discord_user_id, new.resource_id)
  on conflict (guild_id, discord_user_id, resource_id) do nothing;
  return new;
end;
$$;

drop trigger if exists discord_mining_catalogue_discovery_from_inventory on public.discord_game_resource_inventory;
create trigger discord_mining_catalogue_discovery_from_inventory
after insert or update of quantity on public.discord_game_resource_inventory
for each row execute function public.record_discord_mining_catalogue_discovery();

revoke all on function public.record_discord_mining_catalogue_discovery() from public;

notify pgrst, 'reload schema';

commit;
