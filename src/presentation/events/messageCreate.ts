// ============================================================================
// RUTA: src/presentation/events/messageCreate.ts
// ============================================================================

import { Events, type Message } from 'discord.js';

import { RecordTicketTranscriptMessageUseCase } from '@/application/usecases/tickets/RecordTicketTranscriptMessageUseCase';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaTicketTranscriptRepository } from '@/infrastructure/repositories/PrismaTicketTranscriptRepository';
import { prefixCommandRegistry } from '@/presentation/commands';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import type { EventDescriptor } from '@/presentation/events/types';
import { env } from '@/shared/config/env';
import { recordDebugEvent, runWithDebugSession } from '@/shared/debug/verbose-debugger';
import { logger } from '@/shared/logger/pino';
import { messageCountTracker } from '@/shared/services/messageCountTracker';
import { containsRobuxLikeTerms, containsRobuxLikeTermsInCollection } from '@/shared/utils/robuxDetection';
import { buildTranscriptMessageFromDiscordMessage } from '@/shared/utils/ticketTranscripts';

const TRADE_CHANNEL_ID = '1413664770028208199';

const ROBUX_WARNING_EMBED = {
  title: 'ADVERTENCIA DE ESTAFA',
  description:
    'Recuerda que si te tradean algo por robux puedes ser estafado por el metodo de rembolso, ten mucho cuidado, no trades por robux con alguien que no sea de confianza. Recomendaciones:\n<a:51047animatedarrowwhite:1417021879411281992> ESTO NO SIGNIFICA QUE TE VAYAN A ESTAFAR PERO ES PARA QUE TOMES TUS PRECAUCIONES PORQUE NINGUN MIDLEMAN PUEDE SALVARTE DE ESTAS ESTAFAS',
  color: 0x7406bf,
  footer: {
    text: 'dedos.xyz',
    icon_url:
      'https://cdn.discordapp.com/attachments/1412699909949358151/1428573126576574585/image.png?ex=68f2fde6&is=68f1ac66&hm=30933d8ec4fe981a86fb4b05b0dd79d14a04f49fd9a69bc2e7c6282f39fa6d0e&',
  },
  author: {
    name: 'dedos.xyz',
    icon_url:
      'https://cdn.discordapp.com/attachments/1412699909949358151/1428573126576574585/image.png?ex=68f2fde6&is=68f1ac66&hm=30933d8ec4fe981a86fb4b05b0dd79d14a04f49fd9a69bc2e7c6282f39fa6d0e&',
  },
  image: {
    url: 'https://message.style/cdn/images/b6b34048e6b8e4f2d6931af81a6935dbeb06d1d1a619dcf353733ab75bbcca8c.gif',
  },
} as const;

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

    if (!message.author.bot) {
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
        await message.channel.send({ embeds: [ROBUX_WARNING_EMBED] });
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
