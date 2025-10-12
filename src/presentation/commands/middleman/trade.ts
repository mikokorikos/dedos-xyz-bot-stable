// ============================================================================
// RUTA: src/presentation/commands/middleman/trade.ts
// ============================================================================

import type { ChatInputCommandInteraction, Message, TextChannel } from 'discord.js';
import { ChannelType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { CloseTradeUseCase } from '@/application/usecases/middleman/CloseTradeUseCase';
import { RequestTradeClosureUseCase } from '@/application/usecases/middleman/RequestTradeClosureUseCase';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaMemberStatsRepository } from '@/infrastructure/repositories/PrismaMemberStatsRepository';
import { PrismaMiddlemanFinalizationRepository } from '@/infrastructure/repositories/PrismaMiddlemanFinalizationRepository';
import { PrismaMiddlemanRepository } from '@/infrastructure/repositories/PrismaMiddlemanRepository';
import { PrismaTicketRepository } from '@/infrastructure/repositories/PrismaTicketRepository';
import { PrismaTradeRepository } from '@/infrastructure/repositories/PrismaTradeRepository';
import type { Command } from '@/presentation/commands/types';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { mapErrorToDiscordResponse } from '@/shared/errors/discord-error-mapper';
import { TicketNotFoundError } from '@/shared/errors/domain.errors';
import { logger } from '@/shared/logger/pino';
import { brandEditReplyOptions, brandMessageOptions, brandReplyOptions } from '@/shared/utils/branding';

const ticketRepository = new PrismaTicketRepository(prisma);
const tradeRepository = new PrismaTradeRepository(prisma);
const statsRepository = new PrismaMemberStatsRepository(prisma);
const middlemanRepository = new PrismaMiddlemanRepository(prisma);
const finalizationRepository = new PrismaMiddlemanFinalizationRepository(prisma);

const closeTradeUseCase = new CloseTradeUseCase(
  ticketRepository,
  tradeRepository,
  statsRepository,
  middlemanRepository,
  finalizationRepository,
  prisma,
  logger,
  embedFactory,
);

const requestClosureUseCase = new RequestTradeClosureUseCase(
  ticketRepository,
  finalizationRepository,
  middlemanRepository,
  embedFactory,
  logger,
);

const ensureTextChannel = (interaction: ChatInputCommandInteraction): TextChannel | null => {
  const channel = interaction.channel;

  if (!channel || channel.type !== ChannelType.GuildText) {
    void interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.warning({
            title: 'Canal incompatible',
            description: 'Este comando solo puede ejecutarse dentro de un canal de trade.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      }),
    );

    return null;
  }

  return channel;
};

const ensureMessageChannel = (message: Message): TextChannel | null => {
  const channel = message.channel;

  if (channel.type !== ChannelType.GuildText) {
    void message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.warning({
            title: 'Canal incompatible',
            description: 'Este comando solo puede ejecutarse dentro de un canal de trade.',
          }),
        ],
        allowedMentions: { repliedUser: false },
      }),
    );

    return null;
  }

  return channel;
};

const handleFinalizeInteraction = async (
  interaction: ChatInputCommandInteraction,
  channel: TextChannel,
): Promise<void> => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ticket = await ticketRepository.findByChannelId(BigInt(channel.id));

  if (!ticket) {
    throw new TicketNotFoundError(channel.id);
  }

  const result = await requestClosureUseCase.execute(ticket.id, BigInt(interaction.user.id), channel);

  const alreadyPendingMessage = result.alreadyPending
    ? 'El panel de confirmación ya estaba publicado y se actualizó con la información más reciente.'
    : 'Se publicó un panel para que los traders confirmen el cierre.';

  await interaction.editReply(
    brandEditReplyOptions({
      embeds: [
        embedFactory.success({
          title: 'Confirmaciones solicitadas',
          description: `${alreadyPendingMessage}\nParticipantes detectados: **${result.participantCount}**.`,
        }),
      ],
    }),
  );
};

const handleCloseInteraction = async (
  interaction: ChatInputCommandInteraction,
  channel: TextChannel,
): Promise<void> => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ticket = await ticketRepository.findByChannelId(BigInt(channel.id));

  if (!ticket) {
    throw new TicketNotFoundError(channel.id);
  }

  await closeTradeUseCase.execute(ticket.id, BigInt(interaction.user.id), channel);

  await interaction.editReply(
    brandEditReplyOptions({
      embeds: [
        embedFactory.success({
          title: 'Ticket cerrado',
          description: 'El intercambio fue marcado como completado y se notificó a los participantes.',
        }),
      ],
    }),
  );
};

const handlePrefixFinalize = async (message: Message): Promise<void> => {
  const channel = ensureMessageChannel(message);

  if (!channel) {
    return;
  }

  const ticket = await ticketRepository.findByChannelId(BigInt(channel.id));

  if (!ticket) {
    await message.reply({
      embeds: [
        embedFactory.error({
          title: 'Ticket no encontrado',
          description: 'Este canal no está asociado a un ticket de middleman activo.',
        }),
      ],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  try {
    const result = await requestClosureUseCase.execute(ticket.id, BigInt(message.author.id), channel);
    const alreadyPendingMessage = result.alreadyPending
      ? 'El panel de confirmación ya estaba publicado y se actualizó con la información más reciente.'
      : 'Se publicó un panel para que los traders confirmen el cierre.';

    await message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.success({
            title: 'Confirmaciones solicitadas',
            description: `${alreadyPendingMessage}\nParticipantes detectados: **${result.participantCount}**.`,
          }),
        ],
        allowedMentions: { repliedUser: false },
      }),
    );
  } catch (error) {
    await replyWithError(message, error);
  }
};

const handlePrefixClose = async (message: Message): Promise<void> => {
  const channel = ensureMessageChannel(message);

  if (!channel) {
    return;
  }

  const ticket = await ticketRepository.findByChannelId(BigInt(channel.id));

  if (!ticket) {
    await message.reply({
      embeds: [
        embedFactory.error({
          title: 'Ticket no encontrado',
          description: 'Este canal no está asociado a un ticket de middleman activo.',
        }),
      ],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  try {
    await closeTradeUseCase.execute(ticket.id, BigInt(message.author.id), channel);

    await message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.success({
            title: 'Ticket cerrado',
            description: 'El intercambio fue marcado como completado y se notificó a los participantes.',
          }),
        ],
        allowedMentions: { repliedUser: false },
      }),
    );
  } catch (error) {
    await replyWithError(message, error);
  }
};

const replyWithError = async (message: Message, error: unknown): Promise<void> => {
  const { shouldLogStack, referenceId, embeds, ...payload } = mapErrorToDiscordResponse(error);

  if (shouldLogStack) {
    logger.error({ err: error, referenceId }, 'Error inesperado al ejecutar el comando ;trade.');
  } else {
    logger.warn({ err: error, referenceId }, 'Error controlado al ejecutar el comando ;trade.');
  }

  const { flags: _flags, ...messagePayload } = payload;

  await message.reply(
    brandMessageOptions({
      ...messagePayload,
      embeds:
        embeds ?? [
          embedFactory.error({
            title: 'No se pudo completar la acción',
            description: 'Verifica los requisitos del trade o contacta al equipo middleman.',
          }),
        ],
      allowedMentions: { repliedUser: false },
    }),
  );
};

export const tradeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('trade')
    .setDescription('Acciones para administrar un trade middleman')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('finalize')
        .setDescription('Solicita las confirmaciones finales de los traders'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('close')
        .setDescription('Cierra el trade cuando todos confirmaron la finalización'),
    ),
  category: 'Middleman',
  examples: ['/trade finalize', '/trade close', ';trade finalize', ';trade close'],
  prefix: {
    name: 'trade',
    async execute(message, args) {
      const [subcommand] = args;
      const normalized = subcommand?.toLowerCase();

      if (!normalized || normalized === 'help') {
        await message.reply({
          embeds: [
            embedFactory.info({
              title: 'Uso de ;trade',
              description: 'Subcomandos disponibles: `finalize` y `close`. Ejemplo: `;trade finalize`.',
            }),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      if (normalized === 'finalize') {
        await handlePrefixFinalize(message);
        return;
      }

      if (normalized === 'close') {
        await handlePrefixClose(message);
        return;
      }

      await message.reply({
        embeds: [
          embedFactory.warning({
            title: 'Subcomando desconocido',
            description: 'Utiliza `finalize` o `close` para administrar el trade.',
          }),
        ],
        allowedMentions: { repliedUser: false },
      });
    },
  },
  async execute(interaction) {
    const channel = ensureTextChannel(interaction);

    if (!channel) {
      return;
    }

    try {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'finalize') {
        await handleFinalizeInteraction(interaction, channel);
        return;
      }

      if (subcommand === 'close') {
        await handleCloseInteraction(interaction, channel);
        return;
      }

      await interaction.reply(
        brandReplyOptions({
          embeds: [
            embedFactory.warning({
              title: 'Subcomando desconocido',
              description: 'Utiliza `finalize` o `close` para administrar el trade.',
            }),
          ],
          flags: MessageFlags.Ephemeral,
        }),
      );
    } catch (error) {
      const { shouldLogStack, referenceId, embeds, ...payload } = mapErrorToDiscordResponse(error);

      if (shouldLogStack) {
        logger.error({ err: error, referenceId }, 'Error inesperado al ejecutar /trade.');
      } else {
        logger.warn({ err: error, referenceId }, 'Error controlado al ejecutar /trade.');
      }

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(
          brandReplyOptions({
            ...payload,
            embeds:
              embeds ?? [
                embedFactory.error({
                  title: 'No se pudo completar la acción',
                  description: 'Verifica los requisitos del trade o contacta al equipo middleman.',
                }),
              ],
            flags: MessageFlags.Ephemeral,
          }),
        );
        return;
      }

      await interaction.reply(
        brandReplyOptions({
          ...payload,
          embeds:
            embeds ?? [
              embedFactory.error({
                title: 'No se pudo completar la acción',
                description: 'Verifica los requisitos del trade o contacta al equipo middleman.',
              }),
            ],
          flags: MessageFlags.Ephemeral,
        }),
      );
    }
  },
};
