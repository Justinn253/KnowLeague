begin;

-- Convert the first Mining fossil catalogue into five named fragments for one
-- dinosaur per depth. Existing findings stay collectible and map one-to-one.
with fossil_map(old_id, new_id) as (
  values
    ('compsognathus-fossil','compsognathus-fragment-1'),('microraptor-fossil','compsognathus-fragment-2'),('archaeopteryx-fossil','compsognathus-fragment-3'),('psittacosaurus-fossil','compsognathus-fragment-4'),('protoceratops-fossil','compsognathus-fragment-5'),
    ('stegosaurus-fossil','iguanodon-fragment-1'),('iguanodon-fossil','iguanodon-fragment-2'),('parasaurolophus-fossil','iguanodon-fragment-3'),('dilophosaurus-fossil','iguanodon-fragment-4'),('allosaurus-fossil','iguanodon-fragment-5'),
    ('ankylosaurus-fossil','ankylosaurus-fragment-1'),('pachycephalosaurus-fossil','ankylosaurus-fragment-2'),('baryonyx-fossil','ankylosaurus-fragment-3'),('carnotaurus-fossil','ankylosaurus-fragment-4'),('camarasaurus-fossil','ankylosaurus-fragment-5'),
    ('triceratops-fossil','spinosaurus-fragment-1'),('spinosaurus-fossil','spinosaurus-fragment-2'),('velociraptor-fossil','spinosaurus-fragment-3'),('diplodocus-fossil','spinosaurus-fragment-4'),('argentinosaurus-fossil','spinosaurus-fragment-5'),
    ('tyrannosaurus-fossil','tyrannosaurus-fragment-1'),('giganotosaurus-fossil','tyrannosaurus-fragment-2'),('therizinosaurus-fossil','tyrannosaurus-fragment-3'),('deinonychus-fossil','tyrannosaurus-fragment-4'),('apatosaurus-fossil','tyrannosaurus-fragment-5'),
    ('utahraptor-fossil','utahraptor-fragment-1'),('carcharodontosaurus-fossil','utahraptor-fragment-2'),('oviraptor-fossil','utahraptor-fragment-3'),('mamenchisaurus-fossil','utahraptor-fragment-4'),('styracosaurus-fossil','utahraptor-fragment-5'),
    ('yutyrannus-fossil','yutyrannus-fragment-1'),('mapusaurus-fossil','yutyrannus-fragment-2'),('dreadnoughtus-fossil','yutyrannus-fragment-3'),('deinocheirus-fossil','yutyrannus-fragment-4'),('acrocanthosaurus-fossil','yutyrannus-fragment-5')
), moved as (
  select inventory.guild_id, inventory.discord_user_id, fossil_map.new_id, inventory.quantity
  from public.discord_game_resource_inventory inventory join fossil_map on fossil_map.old_id = inventory.resource_id
)
insert into public.discord_game_resource_inventory as inventory (guild_id, discord_user_id, resource_id, quantity)
select guild_id, discord_user_id, new_id, quantity from moved
on conflict (guild_id, discord_user_id, resource_id) do update
set quantity = inventory.quantity + excluded.quantity, updated_at = now();

delete from public.discord_game_resource_inventory
where resource_id in (
  'compsognathus-fossil','microraptor-fossil','archaeopteryx-fossil','psittacosaurus-fossil','protoceratops-fossil','stegosaurus-fossil','iguanodon-fossil','parasaurolophus-fossil','dilophosaurus-fossil','allosaurus-fossil','ankylosaurus-fossil','pachycephalosaurus-fossil','baryonyx-fossil','carnotaurus-fossil','camarasaurus-fossil','triceratops-fossil','spinosaurus-fossil','velociraptor-fossil','diplodocus-fossil','argentinosaurus-fossil','tyrannosaurus-fossil','giganotosaurus-fossil','therizinosaurus-fossil','deinonychus-fossil','apatosaurus-fossil','utahraptor-fossil','carcharodontosaurus-fossil','oviraptor-fossil','mamenchisaurus-fossil','styracosaurus-fossil','yutyrannus-fossil','mapusaurus-fossil','dreadnoughtus-fossil','deinocheirus-fossil','acrocanthosaurus-fossil'
);

create table public.discord_mining_level_role_rewards (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_role_id text not null check (discord_role_id ~ '^[0-9]{17,20}$'),
  level integer not null check (level between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_role_id)
);
create index discord_mining_level_role_rewards_guild_level_idx on public.discord_mining_level_role_rewards (guild_id, level, discord_role_id);
alter table public.discord_mining_level_role_rewards enable row level security;
revoke all on table public.discord_mining_level_role_rewards from anon, authenticated;
grant select, insert, update, delete on table public.discord_mining_level_role_rewards to service_role;

create function public.replace_discord_mining_role_configuration(p_guild_id text, p_role_rewards jsonb, p_updated_by uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_reward jsonb; v_role_id text; v_level integer; v_seen_roles text[] := '{}'; v_seen_levels integer[] := '{}';
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or jsonb_typeof(p_role_rewards) <> 'array' or jsonb_array_length(p_role_rewards) > 50 then raise exception 'Mining role reward data is invalid.'; end if;
  for v_reward in select value from jsonb_array_elements(p_role_rewards) loop
    if jsonb_typeof(v_reward) <> 'object' or coalesce(v_reward->>'level','') !~ '^[0-9]+$' or jsonb_typeof(v_reward->'roleIds') <> 'array' or jsonb_array_length(v_reward->'roleIds') = 0 then raise exception 'Each Mining reward level must include roles.'; end if;
    v_level := (v_reward->>'level')::integer;
    if v_level not between 1 and 10000 or v_level = any(v_seen_levels) then raise exception 'Mining reward levels must be unique and valid.'; end if;
    v_seen_levels := array_append(v_seen_levels, v_level);
    for v_role_id in select value #>> '{}' from jsonb_array_elements(v_reward->'roleIds') loop
      if v_role_id !~ '^[0-9]{17,20}$' or v_role_id = any(v_seen_roles) or not exists (select 1 from public.discord_guild_roles where guild_id=p_guild_id and role_id=v_role_id and assignable) then raise exception 'Every Mining reward role must be unique and assignable.'; end if;
      v_seen_roles := array_append(v_seen_roles, v_role_id);
    end loop;
  end loop;
  delete from public.discord_mining_level_role_rewards where guild_id=p_guild_id;
  insert into public.discord_mining_level_role_rewards (guild_id, discord_role_id, level, updated_at)
  select p_guild_id, roles.value, (rewards.value->>'level')::integer, now() from jsonb_array_elements(p_role_rewards) rewards(value) cross join lateral jsonb_array_elements_text(rewards.value->'roleIds') roles(value);
end; $$;
revoke all on function public.replace_discord_mining_role_configuration(text, jsonb, uuid) from public;
grant execute on function public.replace_discord_mining_role_configuration(text, jsonb, uuid) to service_role;
notify pgrst, 'reload schema';
commit;
