begin;

-- Fishing crates now resolve and sell automatically during expeditions. The
-- older stored-crate inventory and manual redemption path are retired.
delete from public.discord_fishing_inventory
where item_id ~ '^(harbor|warm-ocean|hydroplant-reservoir|sunken-sea|kelp-forest|crystaline-caverns|rallypoint-delta)-(common|uncommon|rare|epic|legendary)-crate$';

drop function if exists public.open_all_discord_fishing_crates(text, text, jsonb, bigint);

notify pgrst, 'reload schema';

commit;
