import type { Guild, Message } from 'discord.js';

export type StickerImportResult = {
  failed: readonly string[];
  imported: readonly string[];
  skippedExisting: readonly string[];
};

const FALLBACK_STICKER_TAG = '📌';

export async function importExternalMessageStickers(guild: Guild, message: Message, reason: string): Promise<StickerImportResult> {
  const existingStickers = await guild.stickers.fetch();
  const imported: string[] = [];
  const skippedExisting: string[] = [];
  const failed: string[] = [];

  for (const sticker of message.stickers.values()) {
    if (existingStickers.has(sticker.id)) {
      skippedExisting.push(sticker.name);
      continue;
    }

    try {
      await guild.stickers.create({
        description: sticker.description,
        file: sticker.url,
        name: sticker.name,
        reason,
        tags: sticker.tags ?? FALLBACK_STICKER_TAG,
      });
      imported.push(sticker.name);
    } catch (error) {
      console.warn(`Could not import external sticker ${sticker.id} into guild ${guild.id}.`, error);
      failed.push(sticker.name);
    }
  }

  return { failed, imported, skippedExisting };
}
