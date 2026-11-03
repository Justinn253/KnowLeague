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
  const [inventoryResult, sealedProductsResult] = await Promise.all([
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
  ]);

  if (inventoryResult.error) throw inventoryResult.error;
  if (sealedProductsResult.error) throw sealedProductsResult.error;

  return {
    items: (inventoryResult.data ?? []).flatMap((item): RiftboundMockInventoryItem[] => (
      (item.finish === 'normal' || item.finish === 'foil') && isMockTreatment(item.treatment)
        ? [{ ...item, treatment: item.treatment }]
        : []
    )),
    sealedProducts: sealedProductsResult.data ?? [],
  };
}
