// =============================================================================
// RUTA: src/presentation/events/messageDelete.ts
// =============================================================================

import { Events, type Message, type PartialMessage } from 'discord.js';

import type { EventDescriptor } from '@/presentation/events/types';
import { messageCountTracker } from '@/shared/services/messageCountTracker';

const resolveAuthorId = (message: Message | PartialMessage): string | null => {
  if ('author' in message && message.author) {
    return message.author.id;
  }

  if ('interaction' in message && message.interaction?.user) {
    return message.interaction.user.id;
  }

  return null;
};

export const messageDeleteEvent: EventDescriptor<typeof Events.MessageDelete> = {
  name: Events.MessageDelete,
  once: false,
  async execute(message: Message | PartialMessage): Promise<void> {
    if (!message.inGuild()) {
      return;
    }

    const authorId = resolveAuthorId(message);
    const isBot = 'author' in message && Boolean(message.author?.bot);

    messageCountTracker.recordDeletion({
      messageId: message.id,
      guildId: message.guildId,
      channelId: message.channelId,
      userId: authorId ?? undefined,
      isBot,
    });
  },
};

