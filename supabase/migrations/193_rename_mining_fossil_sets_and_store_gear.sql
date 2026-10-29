begin;

-- Preserve fragment progress while replacing the four requested fossil sets.
with fossil_map(old_id, new_id, new_name) as (
  values
    ('compsognathus-fragment-1', 'triceratops-fragment-1', 'Triceratops Fragment 1/5'),
    ('compsognathus-fragment-2', 'triceratops-fragment-2', 'Triceratops Fragment 2/5'),
    ('compsognathus-fragment-3', 'triceratops-fragment-3', 'Triceratops Fragment 3/5'),
    ('compsognathus-fragment-4', 'triceratops-fragment-4', 'Triceratops Fragment 4/5'),
    ('compsognathus-fragment-5', 'triceratops-fragment-5', 'Triceratops Fragment 5/5'),
    ('iguanodon-fragment-1', 'velociraptor-fragment-1', 'Velociraptor Fragment 1/5'),
    ('iguanodon-fragment-2', 'velociraptor-fragment-2', 'Velociraptor Fragment 2/5'),
    ('iguanodon-fragment-3', 'velociraptor-fragment-3', 'Velociraptor Fragment 3/5'),
    ('iguanodon-fragment-4', 'velociraptor-fragment-4', 'Velociraptor Fragment 4/5'),
    ('iguanodon-fragment-5', 'velociraptor-fragment-5', 'Velociraptor Fragment 5/5'),
    ('utahraptor-fragment-1', 'stegosaurus-fragment-1', 'Stegosaurus Fragment 1/5'),
    ('utahraptor-fragment-2', 'stegosaurus-fragment-2', 'Stegosaurus Fragment 2/5'),
    ('utahraptor-fragment-3', 'stegosaurus-fragment-3', 'Stegosaurus Fragment 3/5'),
    ('utahraptor-fragment-4', 'stegosaurus-fragment-4', 'Stegosaurus Fragment 4/5'),
    ('utahraptor-fragment-5', 'stegosaurus-fragment-5', 'Stegosaurus Fragment 5/5'),
    ('yutyrannus-fragment-1', 'brachiosaurus-fragment-1', 'Brachiosaurus Fragment 1/5'),
    ('yutyrannus-fragment-2', 'brachiosaurus-fragment-2', 'Brachiosaurus Fragment 2/5'),
    ('yutyrannus-fragment-3', 'brachiosaurus-fragment-3', 'Brachiosaurus Fragment 3/5'),
    ('yutyrannus-fragment-4', 'brachiosaurus-fragment-4', 'Brachiosaurus Fragment 4/5'),
    ('yutyrannus-fragment-5', 'brachiosaurus-fragment-5', 'Brachiosaurus Fragment 5/5')
), moved as (
  select inventory.guild_id, inventory.discord_user_id, fossil_map.new_id, inventory.quantity
  from public.discord_game_resource_inventory inventory
  join fossil_map on fossil_map.old_id = inventory.resource_id
)
insert into public.discord_game_resource_inventory as inventory (guild_id, discord_user_id, resource_id, quantity)
select guild_id, discord_user_id, new_id, quantity from moved
on conflict (guild_id, discord_user_id, resource_id) do update
set quantity = inventory.quantity + excluded.quantity,
    updated_at = now();

delete from public.discord_game_resource_inventory
where resource_id in (
  'compsognathus-fragment-1', 'compsognathus-fragment-2', 'compsognathus-fragment-3', 'compsognathus-fragment-4', 'compsognathus-fragment-5',
  'iguanodon-fragment-1', 'iguanodon-fragment-2', 'iguanodon-fragment-3', 'iguanodon-fragment-4', 'iguanodon-fragment-5',
  'utahraptor-fragment-1', 'utahraptor-fragment-2', 'utahraptor-fragment-3', 'utahraptor-fragment-4', 'utahraptor-fragment-5',
  'yutyrannus-fragment-1', 'yutyrannus-fragment-2', 'yutyrannus-fragment-3', 'yutyrannus-fragment-4', 'yutyrannus-fragment-5'
);

with fossil_map(old_id, new_id, new_name) as (
  values
    ('compsognathus-fragment-1', 'triceratops-fragment-1', 'Triceratops Fragment 1/5'),
    ('compsognathus-fragment-2', 'triceratops-fragment-2', 'Triceratops Fragment 2/5'),
    ('compsognathus-fragment-3', 'triceratops-fragment-3', 'Triceratops Fragment 3/5'),
    ('compsognathus-fragment-4', 'triceratops-fragment-4', 'Triceratops Fragment 4/5'),
    ('compsognathus-fragment-5', 'triceratops-fragment-5', 'Triceratops Fragment 5/5'),
    ('iguanodon-fragment-1', 'velociraptor-fragment-1', 'Velociraptor Fragment 1/5'),
    ('iguanodon-fragment-2', 'velociraptor-fragment-2', 'Velociraptor Fragment 2/5'),
    ('iguanodon-fragment-3', 'velociraptor-fragment-3', 'Velociraptor Fragment 3/5'),
    ('iguanodon-fragment-4', 'velociraptor-fragment-4', 'Velociraptor Fragment 4/5'),
    ('iguanodon-fragment-5', 'velociraptor-fragment-5', 'Velociraptor Fragment 5/5'),
    ('utahraptor-fragment-1', 'stegosaurus-fragment-1', 'Stegosaurus Fragment 1/5'),
    ('utahraptor-fragment-2', 'stegosaurus-fragment-2', 'Stegosaurus Fragment 2/5'),
    ('utahraptor-fragment-3', 'stegosaurus-fragment-3', 'Stegosaurus Fragment 3/5'),
    ('utahraptor-fragment-4', 'stegosaurus-fragment-4', 'Stegosaurus Fragment 4/5'),
    ('utahraptor-fragment-5', 'stegosaurus-fragment-5', 'Stegosaurus Fragment 5/5'),
    ('yutyrannus-fragment-1', 'brachiosaurus-fragment-1', 'Brachiosaurus Fragment 1/5'),
    ('yutyrannus-fragment-2', 'brachiosaurus-fragment-2', 'Brachiosaurus Fragment 2/5'),
    ('yutyrannus-fragment-3', 'brachiosaurus-fragment-3', 'Brachiosaurus Fragment 3/5'),
    ('yutyrannus-fragment-4', 'brachiosaurus-fragment-4', 'Brachiosaurus Fragment 4/5'),
    ('yutyrannus-fragment-5', 'brachiosaurus-fragment-5', 'Brachiosaurus Fragment 5/5')
)
update public.discord_mining_expeditions as expeditions
set result = jsonb_set(
      expeditions.result,
      '{cargo}',
      (
        select jsonb_agg(
          case when fossil_map.new_id is null then cargo.value else jsonb_set(
            jsonb_set(cargo.value, '{id}', to_jsonb(fossil_map.new_id)),
            '{name}',
            to_jsonb(fossil_map.new_name)
          ) end
        )
        from jsonb_array_elements(coalesce(expeditions.result -> 'cargo', '[]'::jsonb)) cargo(value)
        left join fossil_map on fossil_map.old_id = cargo.value ->> 'id'
      ),
      true
    ),
    updated_at = now()
where expeditions.result is not null
  and exists (
    select 1
    from jsonb_array_elements(coalesce(expeditions.result -> 'cargo', '[]'::jsonb)) cargo(value)
    where cargo.value ->> 'id' in (
      'compsognathus-fragment-1', 'compsognathus-fragment-2', 'compsognathus-fragment-3', 'compsognathus-fragment-4', 'compsognathus-fragment-5',
      'iguanodon-fragment-1', 'iguanodon-fragment-2', 'iguanodon-fragment-3', 'iguanodon-fragment-4', 'iguanodon-fragment-5',
      'utahraptor-fragment-1', 'utahraptor-fragment-2', 'utahraptor-fragment-3', 'utahraptor-fragment-4', 'utahraptor-fragment-5',
      'yutyrannus-fragment-1', 'yutyrannus-fragment-2', 'yutyrannus-fragment-3', 'yutyrannus-fragment-4', 'yutyrannus-fragment-5'
    )
  );

create or replace function public.settle_discord_mining_expedition(
  p_guild_id text,
  p_discord_user_id text,
  p_expedition_id bigint
)
returns table (
  settled boolean,
  result jsonb,
  mining_xp_awarded bigint,
  mining_previous_level integer,
  mining_current_level integer,
  mining_total_xp bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expedition public.discord_mining_expeditions%rowtype;
  v_cargo jsonb;
  v_gear jsonb;
  v_resource_id text;
  v_gear_item_id text;
  v_quantity integer;
  v_xp_awarded bigint;
  v_previous_level integer;
  v_current_level integer;
  v_total_xp bigint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' or p_expedition_id < 1 then
    raise exception 'Mining settlement data is invalid.';
  end if;

  perform 1 from public.discord_mining_players as players
  where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id
  for update;
  if not found then
    raise exception 'Mining profile is unavailable.';
  end if;

  select * into v_expedition
  from public.discord_mining_expeditions as expeditions
  where expeditions.id = p_expedition_id
    and expeditions.guild_id = p_guild_id
    and expeditions.discord_user_id = p_discord_user_id
  for update;
  if not found or v_expedition.status <> 'returning' or v_expedition.returns_at > now() or v_expedition.result is null then
    return query select false, null::jsonb, 0::bigint, null::integer, null::integer, null::bigint;
    return;
  end if;

  v_xp_awarded := (v_expedition.result ->> 'miningXpAwarded')::bigint;
  for v_cargo in select cargo.value from jsonb_array_elements(v_expedition.result -> 'cargo') as cargo(value)
  loop
    v_resource_id := v_cargo ->> 'id';
    v_quantity := (v_cargo ->> 'quantity')::integer;
    insert into public.discord_game_resource_inventory as inventory (guild_id, discord_user_id, resource_id, quantity)
    values (p_guild_id, p_discord_user_id, v_resource_id, v_quantity)
    on conflict (guild_id, discord_user_id, resource_id) do update
    set quantity = inventory.quantity + excluded.quantity,
        updated_at = now();
  end loop;

  for v_gear in select gear.value from jsonb_array_elements(coalesce(v_expedition.result -> 'gearItems', '[]'::jsonb)) as gear(value)
  loop
    v_gear_item_id := v_gear ->> 'itemId';
    if coalesce(v_gear_item_id = any (array[
      'mining-gear-bioluminescence', 'mining-gear-loaned-coin', 'mining-gear-melter', 'mining-gear-hardened-tip',
      'mining-gear-inspiring-photo', 'mining-gear-conveyor-belt', 'mining-gear-gem-bag', 'mining-gear-translocator',
      'mining-gear-paleontological-certificate', 'mining-gear-obsidian-dagger', 'mining-gear-ancient-refinery'
    ]), false) = false or coalesce(v_gear ->> 'quantity' ~ '^[1-9][0-9]*$', false) = false then
      raise exception 'Mining expedition gear data is invalid.';
    end if;
    v_quantity := (v_gear ->> 'quantity')::integer;
    if v_quantity > 1 then
      raise exception 'Mining expedition gear quantity is invalid.';
    end if;
    insert into public.discord_player_inventory as inventory (guild_id, discord_user_id, item_id, quantity)
    values (p_guild_id, p_discord_user_id, v_gear_item_id, v_quantity)
    on conflict (guild_id, discord_user_id, item_id) do update
    set quantity = greatest(inventory.quantity, excluded.quantity),
        updated_at = now();
  end loop;

  insert into public.discord_game_skill_progress (guild_id, discord_user_id, skill_id, total_xp, level)
  values (p_guild_id, p_discord_user_id, 'mining', 0, 0)
  on conflict (guild_id, discord_user_id, skill_id) do nothing;
  select skills.level, skills.total_xp
  into v_previous_level, v_total_xp
  from public.discord_game_skill_progress as skills
  where skills.guild_id = p_guild_id and skills.discord_user_id = p_discord_user_id and skills.skill_id = 'mining'
  for update;
  v_total_xp := v_total_xp + v_xp_awarded;
  v_current_level := public.discord_game_skill_level_for_total_xp(v_total_xp);
  update public.discord_game_skill_progress as skills
  set level = v_current_level,
      total_xp = v_total_xp,
      updated_at = now()
  where skills.guild_id = p_guild_id and skills.discord_user_id = p_discord_user_id and skills.skill_id = 'mining';

  update public.discord_mining_expeditions as expeditions
  set status = 'completed', settled_at = now(), updated_at = now()
  where expeditions.id = v_expedition.id;

  return query select true, v_expedition.result, v_xp_awarded, v_previous_level, v_current_level, v_total_xp;
end;
$$;

revoke all on function public.settle_discord_mining_expedition(text, text, bigint) from public;
grant execute on function public.settle_discord_mining_expedition(text, text, bigint) to service_role;

notify pgrst, 'reload schema';

commit;
