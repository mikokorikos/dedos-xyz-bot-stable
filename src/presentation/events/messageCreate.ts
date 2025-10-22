// ============================================================================
// RUTA: src/presentation/events/messageCreate.ts
// ============================================================================

import { Events, type Message } from 'discord.js';

import { RecordTicketTranscriptMessageUseCase } from '@/application/usecases/tickets/RecordTicketTranscriptMessageUseCase';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaTicketTranscriptRepository } from '@/infrastructure/repositories/PrismaTicketTranscriptRepository';
import { prefixCommandRegistry } from '@/presentation/commands';
import { buildRobuxWarningEmbed } from '@/presentation/embeds/communityEmbeds';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import type { EventDescriptor } from '@/presentation/events/types';
import { env } from '@/shared/config/env';
import { isFeatureEnabled } from '@/shared/config/runtime';
import { recordDebugEvent, runWithDebugSession } from '@/shared/debug/verbose-debugger';
import { logger } from '@/shared/logger/pino';
import { messageCountTracker } from '@/shared/services/messageCountTracker';
import { containsRobuxLikeTerms, containsRobuxLikeTermsInCollection } from '@/shared/utils/robuxDetection';
import { buildTranscriptMessageFromDiscordMessage } from '@/shared/utils/ticketTranscripts';

const TRADE_CHANNEL_ID = '1413664770028208199';

const ticketTranscriptRepository = new PrismaTicketTranscriptRepository(prisma);
const recordTicketTranscriptMessageUseCase = new RecordTicketTranscriptMessageUseCase(
  ticketTranscriptRepository,
  logger,
);

export const messageCreateEvent: EventDescriptor<typeof Events.MessageCreate> = {
  name: Events.MessageCreate,
  once: false,
  async execute(message: Message): Promise<void> {
    if (!message.inGuild()) {
      return;
    }

    if (message.partial) {
      try {
        await message.fetch();
      } catch (error) {
        logger.warn(
          { err: error, messageId: message.id, channelId: message.channelId },
          'No se pudo completar los datos del mensaje parcial.',
        );
      }
    }

    const ticketsEnabled = await isFeatureEnabled('tickets');

    if (ticketsEnabled) {
      try {
        const transcriptMessage = buildTranscriptMessageFromDiscordMessage(message);

        void recordTicketTranscriptMessageUseCase
          .execute({
            channelId: message.channelId,
            message: transcriptMessage,
          })
          .catch((error) => {
            logger.error(
              { err: error, channelId: message.channelId, messageId: message.id },
              'No se pudo registrar el mensaje dentro de la transcripción del ticket.',
            );
          });
      } catch (error) {
        logger.warn(
          { err: error, channelId: message.channelId, messageId: message.id },
          'No se pudo convertir el mensaje para la transcripción.',
        );
      }
    }

    const countingEnabled = !message.author.bot && (await isFeatureEnabled('counting'));

    if (countingEnabled) {
      messageCountTracker.recordMessage({
        messageId: message.id,
        guildId: message.guildId,
        channelId: message.channelId,
        userId: message.author.id,
      });
    }

    if (message.author.bot) {
      return;
    }

    if (message.channelId === TRADE_CHANNEL_ID) {
      const embedTexts = message.embeds.flatMap((embed) => [
        embed.title,
        embed.description,
        embed.footer?.text,
        embed.author?.name,
        ...(embed.fields?.map((field) => `${field.name}\n${field.value}`) ?? []),
      ]);

      if (
        containsRobuxLikeTerms(message.content) ||
        containsRobuxLikeTermsInCollection(embedTexts)
      ) {
        await message.channel.send({ embeds: [buildRobuxWarningEmbed()] });
      }
    }

    const prefix = env.COMMAND_PREFIX;

    if (!message.content.startsWith(prefix)) {
      return;
    }

    const content = message.content.slice(prefix.length).trim();

    if (content.length === 0) {
      return;
    }

    const [rawName, ...args] = content.split(/\s+/u);

    if (!rawName) {
      return;
    }

    const commandName = rawName.toLowerCase();
    const command = prefixCommandRegistry.get(commandName);

    if (!command) {
      logger.debug({ commandName }, 'Comando con prefijo no encontrado.');
      await message.reply({
        embeds: [
          embedFactory.warning({
            title: 'Comando no disponible',
            description: `No existe un comando llamado \`${commandName}\`. Usa /help o \`${prefix}help\` para ver la lista completa.`,
          }),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    try {
      logger.debug({ commandName, userId: message.author.id }, 'Ejecutando comando con prefijo.');

      await runWithDebugSession(
        {
          trigger: `${prefix}${command.name}`,
          actorTag: message.author.tag,
          channel: message.channel,
        },
        async () => {
          if (args.length > 0) {
            recordDebugEvent('prefix.args', args);
          }

          await command.execute(message, args);
        },
      );
    } catch (error) {
      logger.error({ err: error, commandName, userId: message.author.id }, 'Error al ejecutar comando con prefijo.');

      await message.reply({
        embeds: [
          embedFactory.error({
            title: 'No se pudo ejecutar el comando',
            description: 'Ocurrió un error inesperado. Inténtalo nuevamente en unos segundos.',
          }),
        ],
        allowedMentions: { repliedUser: false },
      });
    }
  },
};
