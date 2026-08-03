export type RiftboundInventoryItem = {
  card_id: string;
  finish: 'normal' | 'foil';
  quantity: number;
  updated_at: string;
};

export type RiftboundInventoryChange = {
  cardId: string;
  finish: RiftboundInventoryItem['finish'];
  delta: number;
};

function getInventoryKey(cardId: string, finish: RiftboundInventoryItem['finish']) {
  return `${cardId}:${finish}`;
}

export function getRiftboundInventoryChanges(
  savedRows: readonly RiftboundInventoryItem[],
  draftRows: readonly RiftboundInventoryItem[],
) {
  const savedQuantities = new Map<string, number>();
  const draftQuantities = new Map<string, number>();
  const finishes = new Map<string, RiftboundInventoryItem['finish']>();

  savedRows.forEach((row) => {
    const key = getInventoryKey(row.card_id, row.finish);
    savedQuantities.set(key, row.quantity);
    finishes.set(key, row.finish);
  });

  draftRows.forEach((row) => {
    const key = getInventoryKey(row.card_id, row.finish);
    draftQuantities.set(key, row.quantity);
    finishes.set(key, row.finish);
  });

  const keys = new Set([...savedQuantities.keys(), ...draftQuantities.keys()]);
  return Array.from(keys).flatMap<RiftboundInventoryChange>((key) => {
    const [cardId, finish] = key.split(':');
    const savedQuantity = savedQuantities.get(key) ?? 0;
    const draftQuantity = draftQuantities.get(key) ?? 0;
    const delta = draftQuantity - savedQuantity;
    return delta === 0 || !cardId || !finish
      ? []
      : [{ cardId, finish: finishes.get(key) ?? 'normal', delta }];
  });
}

function cloneInventoryRows(rows: readonly RiftboundInventoryItem[]) {
  return new Map(rows.map((row) => [getInventoryKey(row.card_id, row.finish), { ...row }]));
}

export function applyRiftboundInventoryChanges(
  rows: readonly RiftboundInventoryItem[],
  changes: readonly RiftboundInventoryChange[],
) {
  const nextRowsByKey = cloneInventoryRows(rows);

  changes.forEach((change) => {
    const key = getInventoryKey(change.cardId, change.finish);
    const currentRow = nextRowsByKey.get(key);
    const nextQuantity = (currentRow?.quantity ?? 0) + change.delta;

    if (nextQuantity <= 0) {
      nextRowsByKey.delete(key);
      return;
    }

    nextRowsByKey.set(key, {
      card_id: change.cardId,
      finish: change.finish,
      quantity: nextQuantity,
      updated_at: currentRow?.updated_at ?? new Date().toISOString(),
    });
  });

  return Array.from(nextRowsByKey.values());
}

function mergeLegacyInventoryDraft(
  serverRows: readonly RiftboundInventoryItem[],
  draftRows: readonly RiftboundInventoryItem[],
) {
  const nextRowsByKey = cloneInventoryRows(serverRows);

  draftRows.forEach((draftRow) => {
    const key = getInventoryKey(draftRow.card_id, draftRow.finish);
    const serverRow = nextRowsByKey.get(key);
    if (!serverRow || draftRow.quantity > serverRow.quantity) {
      nextRowsByKey.set(key, { ...draftRow });
    }
  });

  return Array.from(nextRowsByKey.values());
}

/**
 * Replays only the user's pending changes onto the latest server snapshot.
 * A legacy array-only draft has no safe baseline for removals, so it is
 * merged by maximum quantity to preserve both the server and local copies.
 */
export function rebaseRiftboundInventoryDraft(
  serverRows: readonly RiftboundInventoryItem[],
  draftRows: readonly RiftboundInventoryItem[],
  savedRows: readonly RiftboundInventoryItem[] | null,
) {
  if (savedRows === null) return mergeLegacyInventoryDraft(serverRows, draftRows);
  return applyRiftboundInventoryChanges(serverRows, getRiftboundInventoryChanges(savedRows, draftRows));
}
