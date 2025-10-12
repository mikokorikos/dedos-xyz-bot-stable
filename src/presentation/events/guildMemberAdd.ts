// ============================================================================
// RUTA: src/presentation/events/guildMemberAdd.ts
// ============================================================================

import { Events } from 'discord.js';

import type { EventDescriptor } from '@/presentation/events/types';
import { welcomeService } from '@/presentation/services/community';
import { logger } from '@/shared/logger/pino';

export const guildMemberAddEvent: EventDescriptor<typeof Events.GuildMemberAdd> = {
  name: Events.GuildMemberAdd,
  once: false,
  async execute(member) {
    const enqueued = welcomeService.enqueue(member);
    if (enqueued) {
      logger.info({ userId: member.id }, 'Mensaje de bienvenida programado.');
    } else {
      logger.warn({ userId: member.id }, 'No se pudo programar el DM de bienvenida.');
    }
  },
};
