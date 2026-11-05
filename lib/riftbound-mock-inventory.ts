import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export type RiftboundMockTreatment = 'standard' | 'alt_art' | 'special_alt' | 'overnumbered' | 'signature' | 'ultimate';

export type RiftboundMockInventoryItem = {
  card_id: string;
  finish: 'normal' | 'foil';
  quantity: number;
  treatment: RiftboundMockTreatment;
  updated_at: string;
};

export type RiftboundMockSealedProduct = {
  box_quantity: number;
  pack_quantity: number;
  set_code: string;
};

function isMockTreatment(value: string): value is RiftboundMockTreatment {
  return value === 'standard'
    || value === 'alt_art'
    || value === 'special_alt'
    || value === 'overnumbered'
    || value === 'signature'
    || value === 'ultimate';
}

export async function loadRiftboundMockInventory(userId: string) {
  const supabase = getSupabaseServiceClient();
  const [inventoryResult, sealedProductsResult, openedPacksResult] = await Promise.all([
    supabase
      .from('riftbound_mock_inventory')
      .select('card_id,finish,treatment,quantity,updated_at')
      .eq('user_id', userId)
      .gt('quantity', 0)
      .order('updated_at', { ascending: false })
      .returns<Array<RiftboundMockInventoryItem & { treatment: string }>>(),
    supabase
      .from('discord_riftbound_mock_sealed_products')
      .select('set_code,pack_quantity,box_quantity')
      .eq('user_id', userId)
      .order('set_code', { ascending: true })
      .returns<RiftboundMockSealedProduct[]>(),
    supabase
      .from('riftbound_mock_openings')
      .select('packs_opened')
      .eq('user_id', userId)
      .order('opened_at', { ascending: false })
      .limit(10_000)
      .returns<Array<{ packs_opened: number }>>(),
  ]);

  if (inventoryResult.error) throw inventoryResult.error;
  if (sealedProductsResult.error) throw sealedProductsResult.error;
  if (openedPacksResult.error) throw openedPacksResult.error;

  return {
    items: (inventoryResult.data ?? []).flatMap((item): RiftboundMockInventoryItem[] => (
      (item.finish === 'normal' || item.finish === 'foil') && isMockTreatment(item.treatment)
        ? [{ ...item, treatment: item.treatment }]
        : []
    )),
    sealedProducts: sealedProductsResult.data ?? [],
    totalOpenedPacks: (openedPacksResult.data ?? []).reduce((total, opening) => total + (Number.isInteger(opening.packs_opened) && opening.packs_opened > 0 ? opening.packs_opened : 0), 0),
  };
}
