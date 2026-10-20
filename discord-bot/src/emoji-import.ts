import type { Guild, Message } from 'discord.js';

export type ExternalEmojiReference = {
  animated: boolean;
  id: string;
  name: string;
};

export type EmojiImportResult = {
  failed: readonly string[];
  imported: readonly string[];
  skippedExisting: readonly string[];
};

const CUSTOM_EMOJI_PATTERN = /<(a?):([A-Za-z0-9_]{2,32}):(\d{17,20})>/g;

export function extractCustomEmojiReferences(content: string): ExternalEmojiReference[] {
  const references = new Map<string, ExternalEmojiReference>();
  for (const match of content.matchAll(CUSTOM_EMOJI_PATTERN)) {
    const [, animated, name, id] = match;
    if (!references.has(id)) {
      references.set(id, { animated: animated === 'a', id, name });
    }
  }
  return [...references.values()];
}

export async function importExternalMessageEmojis(guild: Guild, message: Message, reason: string): Promise<EmojiImportResult> {
  const existingEmojis = await guild.emojis.fetch();
  const imported: string[] = [];
  const skippedExisting: string[] = [];
  const failed: string[] = [];

  for (const emoji of extractCustomEmojiReferences(message.content)) {
    if (existingEmojis.has(emoji.id)) {
      skippedExisting.push(emoji.name);
      continue;
    }

    try {
      await guild.emojis.create({
        attachment: `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}?quality=lossless`,
        name: emoji.name,
        reason,
      });
      imported.push(emoji.name);
    } catch (error) {
      console.warn(`Could not import external emoji ${emoji.id} into guild ${guild.id}.`, error);
      failed.push(emoji.name);
    }
  }

  return { failed, imported, skippedExisting };
}
