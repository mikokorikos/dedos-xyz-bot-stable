// ============================================================================
// RUTA: src/presentation/commands/middleman/trade.ts
// ============================================================================

import type { ChatInputCommandInteraction, Message, TextChannel } from 'discord.js';
import { ChannelType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { CloseTradeUseCase } from '@/application/usecases/middleman/CloseTradeUseCase';
import { DeleteTradeChannelUseCase } from '@/application/usecases/middleman/DeleteTradeChannelUseCase';
import { DeleteTradeDataUseCase } from '@/application/usecases/middleman/DeleteTradeDataUseCase';
import { RequestTradeClosureUseCase } from '@/application/usecases/middleman/RequestTradeClosureUseCase';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaMemberStatsRepository } from '@/infrastructure/repositories/PrismaMemberStatsRepository';
import { PrismaMiddlemanFinalizationRepository } from '@/infrastructure/repositories/PrismaMiddlemanFinalizationRepository';
import { PrismaMiddlemanRepository } from '@/infrastructure/repositories/PrismaMiddlemanRepository';
import { PrismaTicketRepository } from '@/infrastructure/repositories/PrismaTicketRepository';
import { PrismaTradeRepository } from '@/infrastructure/repositories/PrismaTradeRepository';
import type { Command } from '@/presentation/commands/types';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { TradePanelRenderer } from '@/presentation/middleman/TradePanelRenderer';
import { mapErrorToDiscordResponse } from '@/shared/errors/discord-error-mapper';
import { ChannelDeletionError, TicketNotFoundError } from '@/shared/errors/domain.errors';
import { logger } from '@/shared/logger/pino';
import { brandEditReplyOptions, brandMessageOptions, brandReplyOptions } from '@/shared/utils/branding';
import { isValidSnowflake, mentionUser } from '@/shared/utils/discord.utils';

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

const deleteChannelUseCase = new DeleteTradeChannelUseCase(ticketRepository, middlemanRepository);
const deleteTradeDataUseCase = new DeleteTradeDataUseCase(
  ticketRepository,
  tradeRepository,
  middlemanRepository,
  logger,
);
const tradePanelRenderer = new TradePanelRenderer(ticketRepository, tradeRepository, logger, embedFactory);

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

const USER_MENTION_RE = /^<@!?([0-9]{17,20})>$/u;

const resolveUserId = (token: string | undefined): string | null => {
  if (!token) {
    return null;
  }

  const trimmed = token.trim();

  const mention = trimmed.match(USER_MENTION_RE);
  if (mention) {
    return mention[1] ?? null;
  }

  if (isValidSnowflake(trimmed)) {
    return trimmed;
  }

  return null;
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

const handleDeleteInteraction = async (
  interaction: ChatInputCommandInteraction,
  channel: TextChannel,
): Promise<void> => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { ticketId } = await deleteChannelUseCase.execute(BigInt(channel.id), BigInt(interaction.user.id));

  try {
    await channel.delete('Middleman trade archived by command');
  } catch (error) {
    throw new ChannelDeletionError(channel.id, error);
  }

  await interaction.editReply(
    brandEditReplyOptions({
      embeds: [
        embedFactory.success({
          title: 'Canal eliminado',
          description: 'El canal del trade se eliminó correctamente.',
        }),
      ],
    }),
  );

  logger.info(
    { channelId: channel.id, ticketId, actorId: interaction.user.id },
    'Canal de trade eliminado mediante /trade delete.',
  );
};

const handleResetInteraction = async (
  interaction: ChatInputCommandInteraction,
  channel: TextChannel,
): Promise<void> => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ticket = await ticketRepository.findByChannelId(BigInt(channel.id));

  if (!ticket) {
    throw new TicketNotFoundError(channel.id);
  }

  const targetUser = interaction.options.getUser('usuario') ?? interaction.user;

  const result = await deleteTradeDataUseCase.execute({
    ticketId: ticket.id,
    actorId: interaction.user.id,
    targetUserId: targetUser.id,
  });

  await tradePanelRenderer.render(channel, ticket.id);

  const targetMention = mentionUser(result.targetUserId);
  const selfTarget = result.targetUserId === interaction.user.id;
  const baseDescription = selfTarget
    ? 'Tus datos de trade fueron eliminados. Puedes registrarlos nuevamente usando el panel.'
    : `Los datos de trade de ${targetMention} fueron eliminados correctamente.`;
  const extraNote = result.confirmationReset
    ? '\nEl estado del ticket se restableció para solicitar nuevas confirmaciones.'
    : '';

  await interaction.editReply(
    brandEditReplyOptions({
      embeds: [
        embedFactory.success({
          title: 'Datos de trade eliminados',
          description: `${baseDescription}${extraNote}`,
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

const handlePrefixDelete = async (message: Message): Promise<void> => {
  const channel = ensureMessageChannel(message);

  if (!channel) {
    return;
  }

  try {
    await deleteChannelUseCase.execute(BigInt(channel.id), BigInt(message.author.id));
  } catch (error) {
    await replyWithError(message, error);
    return;
  }

  try {
    await channel.send(
      brandMessageOptions(
        {
          embeds: [
            embedFactory.success({
              title: 'Canal eliminado',
              description: 'Este canal se eliminará en breve.',
            }),
          ],
          allowedMentions: { repliedUser: false },
        },
        { useHeroImage: false },
      ),
    );
  } catch {
    // ignore failure to send prior to deletion
  }

  try {
    await channel.delete('Middleman trade archived by prefix command');
  } catch (error) {
    logger.error({ err: error, channelId: channel.id }, 'No se pudo eliminar el canal del trade.');
    await replyWithError(message, new ChannelDeletionError(channel.id, error));
    return;
  }

  logger.info(
    { channelId: channel.id, actorId: message.author.id },
    'Canal de trade eliminado mediante ;trade delete.',
  );
};

const handlePrefixReset = async (message: Message, args: readonly string[]): Promise<void> => {
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

  const [, rawTarget] = args;
  const resolvedTarget = resolveUserId(rawTarget) ?? null;

  if (rawTarget && !resolvedTarget) {
    await message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.warning({
            title: 'Usuario inválido',
            description: 'Proporciona una mención válida o el ID numérico del usuario a limpiar.',
          }),
        ],
        allowedMentions: { repliedUser: false },
      }),
    );
    return;
  }

  const targetUserId = resolvedTarget ?? message.author.id;

  try {
    const result = await deleteTradeDataUseCase.execute({
      ticketId: ticket.id,
      actorId: message.author.id,
      targetUserId,
    });

    await tradePanelRenderer.render(channel, ticket.id);

    const selfTarget = result.targetUserId === message.author.id;
    const baseDescription = selfTarget
      ? 'Tus datos de trade fueron eliminados. Puedes registrarlos nuevamente usando el panel.'
      : `Los datos de trade de ${mentionUser(result.targetUserId)} fueron eliminados correctamente.`;
    const extraNote = result.confirmationReset
      ? '\nEl estado del ticket se restableció para solicitar nuevas confirmaciones.'
      : '';

    await message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.success({
            title: 'Datos de trade eliminados',
            description: `${baseDescription}${extraNote}`,
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
    )
    .addSubcommand((sub) =>
      sub
        .setName('reset')
        .setDescription('Elimina los datos registrados por un participante')
        .addUserOption((option) =>
          option
            .setName('usuario')
            .setDescription('Participante cuyo registro de trade será eliminado')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Elimina el canal del trade una vez archivado'),
    ),
  category: 'Middleman',
  examples: [
    '/trade finalize',
    '/trade close',
    '/trade reset',
    '/trade delete',
    ';trade finalize',
    ';trade close',
    ';trade reset',
    ';trade delete',
  ],
  prefix: {
    name: 'trade',
    async execute(message, args) {
      const [subcommand] = args;
      const normalized = subcommand?.trim().toLowerCase();

      if (!normalized || normalized === 'help') {
        await message.reply({
          embeds: [
            embedFactory.info({
              title: 'Uso de ;trade',
              description:
                'Subcomandos disponibles: `finalize`, `close`, `reset` y `delete`. Ejemplo: `;trade finalize`.',
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

      if (normalized === 'reset') {
        await handlePrefixReset(message, args);
        return;
      }

      if (normalized === 'delete') {
        await handlePrefixDelete(message);
        return;
      }

        await message.reply({
          embeds: [
            embedFactory.warning({
              title: 'Subcomando desconocido',
              description: 'Utiliza `finalize`, `close`, `reset` o `delete` para administrar el trade.',
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

      if (subcommand === 'reset') {
        await handleResetInteraction(interaction, channel);
        return;
      }

      if (subcommand === 'delete') {
        await handleDeleteInteraction(interaction, channel);
        return;
      }

      await interaction.reply(
        brandReplyOptions({
          embeds: [
            embedFactory.warning({
              title: 'Subcomando desconocido',
              description: 'Utiliza `finalize`, `close`, `reset` o `delete` para administrar el trade.',
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
