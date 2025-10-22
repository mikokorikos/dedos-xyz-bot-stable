// ============================================================================
// RUTA: src/presentation/events/messageReactionAdd.ts
// ============================================================================

import { Events, type User } from 'discord.js';

import type { EventDescriptor } from '@/presentation/events/types';
import { verificationService } from '@/presentation/services/community';
import { isFeatureEnabled, loadRuntimeConfig } from '@/shared/config/runtime';
import { logger } from '@/shared/logger/pino';

export const messageReactionAddEvent: EventDescriptor<typeof Events.MessageReactionAdd> = {
  name: Events.MessageReactionAdd,
  once: false,
  async execute(reaction, user) {
    if (user.bot) {
      return;
    }

    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        logger.warn({ err: error }, 'No se pudo completar la reacción parcial.');
        return;
      }
    }

    let reactingUser: User;
    if ('partial' in user && user.partial) {
      try {
        reactingUser = await user.fetch();
      } catch (error) {
        logger.warn({ err: error }, 'No se pudo completar los datos del usuario parcial.');
        return;
      }
    } else {
      reactingUser = user;
    }

    if (await isFeatureEnabled('verification')) {
      try {
        await verificationService.handleReaction(reaction, reactingUser);
      } catch (error) {
        logger.error({ err: error }, '[VERIFY] Error al procesar la reacción de verificación.');
      }
    }

    const config = await loadRuntimeConfig();
    if (config.reviewsChannelId && reaction.message.channelId !== config.reviewsChannelId) {
      return;
    }

    logger.debug(
      {
        emoji: reaction.emoji.name,
        userId: user.id,
        messageId: reaction.message.id,
      },
      'Reacción registrada en canal de reseñas.',
    );
  },
};
