// ============================================================================
// RUTA: src/presentation/commands/tickets/tickets.ts
// ============================================================================

import {
  AttachmentBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
  GuildMember,
  type Message,
  MessageFlags,
  type ModalSubmitInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type TextChannel,
} from 'discord.js';

import { CloseSupportTicketUseCase } from '@/application/usecases/tickets/CloseSupportTicketUseCase';
import { CreateTicketTranscriptUseCase } from '@/application/usecases/tickets/CreateTicketTranscriptUseCase';
import { GetTicketTranscriptUseCase } from '@/application/usecases/tickets/GetTicketTranscriptUseCase';
import { OpenSupportTicketUseCase } from '@/application/usecases/tickets/OpenSupportTicketUseCase';
import { TicketType } from '@/domain/entities/types';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaTicketRepository } from '@/infrastructure/repositories/PrismaTicketRepository';
import { PrismaTicketTranscriptRepository } from '@/infrastructure/repositories/PrismaTicketTranscriptRepository';
import type { Command } from '@/presentation/commands/types';
import { MiddlemanModal } from '@/presentation/components/modals/MiddlemanModal';
import { TicketCloseReasonModal } from '@/presentation/components/modals/TicketCloseReasonModal';
import { registerButtonHandler, registerModalHandler, registerSelectMenuHandler } from '@/presentation/components/registry';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { buildFeatureDisabledEmbed } from '@/presentation/embeds/featureEmbeds';
import {
  buildTicketClosureConfirmationEmbed,
  buildTicketClosureDMEmbed,
  buildTicketClosureFailedEmbed,
  buildTicketClosureReasonRequiredEmbed,
  buildTicketClosureUnexpectedErrorEmbed,
  buildTicketNotAvailableEmbed,
  buildTicketNotAvailablePrefixEmbed,
  buildTicketNotAvailableSlashEmbed,
} from '@/presentation/embeds/ticketEmbeds';
import {
  buildTicketIntroMessage,
  buildTicketPanelMessage,
  buildTicketPreview,
  getShopOptionByButton,
  parseTicketTopic,
  resolveTicketSelection,
  TICKET_CLOSE_BUTTON_ID,
  TICKET_OPEN_BUTTON_PREFIX,
  TICKET_PANEL_MENU_ID,
} from '@/presentation/tickets/TicketPanelBuilder';
import { env } from '@/shared/config/env';
import { isFeatureEnabled } from '@/shared/config/runtime';
import { mapErrorToDiscordResponse } from '@/shared/errors/discord-error-mapper';
import { ValidationFailedError } from '@/shared/errors/domain.errors';
import { logger } from '@/shared/logger/pino';
import {
  brandEditReplyOptions,
  brandMessageOptions,
  brandReplyOptions,
} from '@/shared/utils/branding';
import {
  collectChannelMessagesForTranscript,
  renderTranscriptAsHtml,
} from '@/shared/utils/ticketTranscripts';

const ticketRepository = new PrismaTicketRepository(prisma);
const ticketTranscriptRepository = new PrismaTicketTranscriptRepository(prisma);

const supportTicketUseCase = new OpenSupportTicketUseCase(ticketRepository, logger, {
  categoryId: env.TICKET_CATEGORY_ID,
  panelChannelId: env.TICKET_PANEL_CHANNEL_ID,
  staffRoleIds: env.TICKET_STAFF_ROLE_IDS,
  maxTicketsPerUser: env.TICKET_MAX_PER_USER,
  cooldownMs: env.TICKET_COOLDOWN_MS,
});

const closeSupportTicketUseCase = new CloseSupportTicketUseCase(ticketRepository, logger);
const createTicketTranscriptUseCase = new CreateTicketTranscriptUseCase(
  ticketRepository,
  ticketTranscriptRepository,
  logger,
);
const getTicketTranscriptUseCase = new GetTicketTranscriptUseCase(
  ticketTranscriptRepository,
  logger,
);

const isTicketStaff = (member: GuildMember | null): boolean => {
  if (!member) {
    return false;
  }

  const staffRoles = env.TICKET_STAFF_ROLE_IDS;
  const hasStaffRole = member.roles.cache.some((role) => staffRoles.includes(role.id));
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

  return hasStaffRole || isAdmin;
};

const notifyTicketOwner = async (
  channel: TextChannel,
  ownerId: string,
  ticketId: number | null,
  reason: string,
): Promise<void> => {
  try {
    const user = await channel.client.users.fetch(ownerId);
    const embed = buildTicketClosureDMEmbed(ticketId, reason);

    await user.send(
      brandMessageOptions({
        embeds: [embed],
        allowedMentions: { parse: [] },
      }),
    );
  } catch (error) {
    logger.warn(
      { err: error, channelId: channel.id, ownerId },
      'No se pudo enviar el mensaje directo con el motivo de cierre.',
    );
  }
};

interface TicketClosureDispatchPayload {
  readonly channel: TextChannel;
  readonly actorId: string;
  readonly ticketId: number | null;
  readonly ownerId: string | null;
  readonly reason: string;
}

const dispatchTicketClosure = async ({
  channel,
  actorId,
  ticketId,
  ownerId,
  reason,
}: TicketClosureDispatchPayload): Promise<void> => {
  if (ownerId) {
    await notifyTicketOwner(channel, ownerId, ticketId, reason);
  }

  try {
    await channel.send('[LOCK] Ticket cerrado por el staff. El canal se eliminará en 10 segundos.');
  } catch (error) {
    logger.warn({ err: error, channelId: channel.id }, 'No se pudo enviar el aviso de cierre de ticket.');
  }

  setTimeout(() => {
    channel
      .delete('Ticket de soporte archivado por el staff')
      .catch((error) => logger.warn({ err: error, channelId: channel.id }, 'No se pudo eliminar el canal.'));
  }, 10_000);

  logger.info(
    {
      channelId: channel.id,
      actorId,
      ticketId: ticketId ?? undefined,
      ownerId: ownerId ?? undefined,
      reason,
    },
    'Ticket de soporte cerrado manualmente.',
  );
};

interface TicketStaffContext {
  readonly channel: TextChannel;
  readonly member: GuildMember;
}

const ensureTicketStaffContextFromInteraction = async (
  interaction: ChatInputCommandInteraction,
): Promise<TicketStaffContext | null> => {
  if (!interaction.guild) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.error({
            title: 'Acción no disponible',
            description: 'Este comando solo puede usarse en servidores.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return null;
  }

  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.error({
            title: 'Canal no válido',
            description: 'Este comando debe ejecutarse dentro del canal del ticket.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return null;
  }

  if (!parseTicketTopic(interaction.channel.topic)) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.warning({
            title: 'Ticket desconocido',
            description: 'No se encontró información del ticket asociada a este canal.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return null;
  }

  let member: GuildMember | null = null;
  if (interaction.member instanceof GuildMember) {
    member = interaction.member;
  } else {
    try {
      member = await interaction.guild.members.fetch(interaction.user.id);
    } catch {
      await interaction.reply(
        brandReplyOptions({
          embeds: [
            embedFactory.error({
              title: 'Miembro no disponible',
              description: 'No se pudo validar tu membresía para usar este comando.',
            }),
          ],
          flags: MessageFlags.Ephemeral,
        }),
      );
      return null;
    }
  }

  if (!isTicketStaff(member)) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.warning({
            title: 'Acceso denegado',
            description: 'Solo el staff de tickets o un administrador puede usar este comando.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return null;
  }

  return { channel: interaction.channel, member };
};

const ensureTicketStaffContextFromModal = async (
  interaction: ModalSubmitInteraction,
): Promise<TicketStaffContext | null> => {
  if (!interaction.guild) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.error({
            title: 'Acción no disponible',
            description: 'Este formulario solo puede utilizarse en servidores.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return null;
  }

  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.error({
            title: 'Canal no válido',
            description: 'Este formulario debe enviarse dentro del canal del ticket.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return null;
  }

  if (!parseTicketTopic(interaction.channel.topic)) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.warning({
            title: 'Ticket desconocido',
            description: 'No se encontró información del ticket asociada a este canal.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return null;
  }

  let member: GuildMember | null = null;
  if (interaction.member instanceof GuildMember) {
    member = interaction.member;
  } else {
    try {
      member = await interaction.guild.members.fetch(interaction.user.id);
    } catch {
      await interaction.reply(
        brandReplyOptions({
          embeds: [
            embedFactory.error({
              title: 'Miembro no disponible',
              description: 'No se pudo validar tu membresía para cerrar el ticket.',
            }),
          ],
          flags: MessageFlags.Ephemeral,
        }),
      );
      return null;
    }
  }

  if (!isTicketStaff(member)) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.warning({
            title: 'Acceso denegado',
            description: 'Solo el staff de tickets o un administrador puede cerrar este ticket.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return null;
  }

  return { channel: interaction.channel, member };
};

const ensureTicketStaffContextFromMessage = async (
  message: Message,
): Promise<TicketStaffContext | null> => {
  if (!message.inGuild()) {
    await message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.error({
            title: 'Acción no disponible',
            description: 'Este comando solo puede usarse en servidores.',
          }),
        ],
      }),
    );
    return null;
  }

  if (message.channel.type !== ChannelType.GuildText) {
    await message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.error({
            title: 'Canal no válido',
            description: 'Este comando debe ejecutarse dentro del canal del ticket.',
          }),
        ],
      }),
    );
    return null;
  }

  if (!parseTicketTopic(message.channel.topic)) {
    await message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.warning({
            title: 'Ticket desconocido',
            description: 'No se encontró información del ticket asociada a este canal.',
          }),
        ],
      }),
    );
    return null;
  }

  let member: GuildMember | null = null;
  if (message.member instanceof GuildMember) {
    member = message.member;
  } else {
    const guild = message.guild;
    if (!guild) {
      await message.reply(
        brandMessageOptions({
          embeds: [
            embedFactory.error({
              title: 'Acción no disponible',
              description: 'Este comando solo puede usarse en servidores.',
            }),
          ],
        }),
      );
      return null;
    }

    try {
      member = await guild.members.fetch(message.author.id);
    } catch {
      await message.reply(
        brandMessageOptions({
          embeds: [
            embedFactory.error({
              title: 'Miembro no disponible',
              description: 'No se pudo validar tu membresía para usar este comando.',
            }),
          ],
        }),
      );
      return null;
    }
  }

  if (!isTicketStaff(member)) {
    await message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.warning({
            title: 'Acceso denegado',
            description: 'Solo el staff de tickets o un administrador puede usar este comando.',
          }),
        ],
      }),
    );
    return null;
  }

  return { channel: message.channel, member };
};

const extractValidationMessage = (error: ValidationFailedError): string => {
  const [first] = Object.values(error.metadata ?? {});

  if (Array.isArray(first)) {
    return first.map((value) => String(value)).join('\n');
  }

  if (first) {
    return String(first);
  }

  return error.message;
};

registerSelectMenuHandler(TICKET_PANEL_MENU_ID, async (interaction) => {
  if (!interaction.guild) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.error({
            title: 'Accion no disponible',
            description: 'Este menu solo puede usarse dentro de un servidor de Discord.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return;
  }

  try {
    const selection = resolveTicketSelection(interaction.values[0] ?? '');

    if (!(await isFeatureEnabled('tickets'))) {
      await interaction.reply(
        brandReplyOptions({
          embeds: [buildFeatureDisabledEmbed('tickets')],
          flags: MessageFlags.Ephemeral,
        }),
      );
      return;
    }

    if (selection.type === TicketType.MM) {
      if (!(await isFeatureEnabled('middleman'))) {
        await interaction.reply(
          brandReplyOptions({
            embeds: [buildFeatureDisabledEmbed('middleman')],
            flags: MessageFlags.Ephemeral,
          }),
        );
        return;
      }

      await interaction.showModal(MiddlemanModal.build());
      return;
    }

    const option = selection.option;
    if (!option) {
      throw new ValidationFailedError({ ticketType: 'La opción seleccionada ya no está disponible.' });
    }

    const preview = buildTicketPreview(option.id);
    if (!preview) {
      throw new ValidationFailedError({ ticketType: 'No se pudo generar la vista previa del ticket.' });
    }

    await interaction.reply(
      brandReplyOptions({
        ...preview,
        flags: MessageFlags.Ephemeral,
      }),
    );
  } catch (error) {
    const { shouldLogStack, referenceId, embeds, ...payload } = mapErrorToDiscordResponse(error);

    if (shouldLogStack) {
      logger.error({ err: error, referenceId }, 'Error inesperado al mostrar la vista previa de ticket.');
    } else {
      logger.warn({ err: error, referenceId }, 'Error controlado al mostrar la vista previa de ticket.');
    }

    await interaction.reply(
      brandReplyOptions({
        ...payload,
        embeds:
          embeds ?? [
            embedFactory.error({
              title: 'No se pudo generar la información',
              description: 'Intenta seleccionar nuevamente la opción del ticket.',
            }),
          ],
        flags: MessageFlags.Ephemeral,
      }),
    );
  }
});

registerButtonHandler(TICKET_CLOSE_BUTTON_ID, async (interaction) => {
  if (!interaction.guild || interaction.channel?.type !== ChannelType.GuildText) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.warning({
            title: 'Canal incompatible',
            description: 'Este botón solo puede utilizarse dentro de un ticket de soporte.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return;
  }

  if (!(await isFeatureEnabled('tickets'))) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [buildFeatureDisabledEmbed('tickets')],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return;
  }

  const topicInfo = parseTicketTopic(interaction.channel.topic);
  if (!topicInfo) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.error({
            title: 'Ticket desconocido',
            description: 'No se pudo identificar el ticket asociado a este canal.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return;
  }

  let member: GuildMember | null = null;
  if (interaction.member && 'roles' in interaction.member) {
    member = interaction.member as GuildMember;
  } else {
    try {
      member = await interaction.guild.members.fetch(interaction.user.id);
    } catch {
      await interaction.reply(
        brandReplyOptions({
          embeds: [
            embedFactory.error({
              title: 'Miembro no disponible',
              description: 'No se pudo validar tu membresía para cerrar el ticket.',
            }),
          ],
          flags: MessageFlags.Ephemeral,
        }),
      );
      return;
    }
  }

  if (!isTicketStaff(member)) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.warning({
            title: 'Acceso denegado',
            description: 'Solo el staff de tickets o un administrador puede cerrar este ticket.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return;
  }

  try {
    if (interaction.message.editable && interaction.message.components.length > 0) {
      await interaction.message.edit({ components: [] });
    }
  } catch (error) {
    logger.warn({ err: error, channelId: interaction.channel.id }, 'No se pudo actualizar el botón de cierre.');
  }

  try {
    await interaction.showModal(TicketCloseReasonModal.build());
  } catch (error) {
    logger.error(
      { err: error, channelId: interaction.channel.id },
      'No se pudo mostrar el formulario de cierre de ticket.',
    );

    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.error({
            title: 'No se pudo iniciar el cierre',
            description: 'Intenta nuevamente o utiliza el comando `/ticket-close` con un motivo.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      }),
    );
  }
});

registerModalHandler(TicketCloseReasonModal.CUSTOM_ID, async (interaction) => {
  const context = await ensureTicketStaffContextFromModal(interaction);
  if (!context) {
    return;
  }

  if (!(await isFeatureEnabled('tickets'))) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [buildFeatureDisabledEmbed('tickets')],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return;
  }

  const reason = TicketCloseReasonModal.extractReason(interaction);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const result = await closeSupportTicketUseCase.execute({
      channelId: context.channel.id,
      actorId: interaction.user.id,
      reason,
    });

    if (!result.closed) {
      await interaction.editReply(
        brandEditReplyOptions({
          embeds: [buildTicketNotAvailableEmbed()],
        }),
      );
      return;
    }

    await interaction.editReply(
      brandEditReplyOptions({
        embeds: [buildTicketClosureConfirmationEmbed(reason)],
      }),
    );

    void dispatchTicketClosure({
      channel: context.channel,
      actorId: interaction.user.id,
      ticketId: result.ticketId,
      ownerId: result.ownerId,
      reason,
    });
  } catch (error) {
    if (error instanceof ValidationFailedError) {
      await interaction.editReply(
        brandEditReplyOptions({
          embeds: [buildTicketClosureFailedEmbed(extractValidationMessage(error))],
        }),
      );
      return;
    }

    logger.error({ err: error, channelId: context.channel.id }, 'No se pudo cerrar el ticket desde el modal.');

    await interaction.editReply(
      brandEditReplyOptions({
        embeds: [buildTicketClosureUnexpectedErrorEmbed()],
      }),
    );
  }
});

registerButtonHandler(
  TICKET_OPEN_BUTTON_PREFIX,
  async (interaction) => {
  if (!interaction.guild) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.error({
            title: 'Accion no disponible',
            description: 'Este botón solo puede utilizarse dentro de un servidor de Discord.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return;
  }

  const option = getShopOptionByButton(interaction.customId);
  if (!option) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.warning({
            title: 'Opción no disponible',
            description: 'El servicio seleccionado ya no está activo.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return;
  }

  if (!(await isFeatureEnabled('tickets'))) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [buildFeatureDisabledEmbed('tickets')],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return;
  }

  if (option.type === TicketType.MM && !(await isFeatureEnabled('middleman'))) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [buildFeatureDisabledEmbed('middleman')],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    let member: GuildMember;
    if (interaction.member && 'user' in interaction.member) {
      member = interaction.member as GuildMember;
    } else {
      member = await interaction.guild.members.fetch(interaction.user.id);
    }

    const result = await supportTicketUseCase.execute({
      guild: interaction.guild,
      member,
      type: option.type,
      channelPrefix: option.channelPrefix,
      topicTag: option.id,
      originChannelId: interaction.channel?.id,
    });

    const intro = buildTicketIntroMessage(option, member, result.staffRoleIds, result.ticket.id);

    try {
      await result.channel.send(
        brandMessageOptions({
          content: intro.content,
          embeds: intro.embeds,
          components: intro.components,
          allowedMentions: intro.allowedMentions,
        }),
      );
    } catch (error) {
      logger.warn({ err: error, channelId: result.channel.id }, 'No se pudo enviar el mensaje inicial del ticket.');
    }

    await interaction.editReply(
      brandEditReplyOptions({
        embeds: [
          embedFactory.success({
            title: 'Ticket creado',
            description: `Tu ticket #${result.ticket.id} está listo en ${result.channel.toString()}.`,
          }),
        ],
      }),
    );
  } catch (error) {
    if (error instanceof ValidationFailedError) {
      const rawHint = error.metadata?.['categoryId'];
      const configHint = typeof rawHint === 'string' ? rawHint : null;

      if (configHint) {
        await interaction.editReply(
          brandEditReplyOptions({
            embeds: [
              embedFactory.warning({
                title: 'Configuración requerida',
                description: `${configHint}\n\nContacta a un administrador para actualizar la configuración del bot.`,
              }),
            ],
          }),
        );
        return;
      }
    }

    const { shouldLogStack, referenceId, embeds, ...payload } = mapErrorToDiscordResponse(error);

    if (shouldLogStack) {
      logger.error({ err: error, referenceId }, 'Error inesperado al abrir ticket de soporte.');
    } else {
      logger.warn({ err: error, referenceId }, 'Error controlado al abrir ticket de soporte.');
    }

    const { flags: _flags, ...editPayload } = payload;
    await interaction.editReply(
      brandEditReplyOptions({
        ...editPayload,
        embeds:
          embeds ?? [
            embedFactory.error({
              title: 'No se pudo crear el ticket',
              description: 'Verifica los requisitos e inténtalo nuevamente más tarde.',
            }),
          ],
      }),
    );
  }
  },
  { match: 'prefix' },
);

const publishTicketPanel = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  if (!(await isFeatureEnabled('tickets'))) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [buildFeatureDisabledEmbed('tickets')],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return;
  }

  const panel = buildTicketPanelMessage();

  await interaction.reply(
    brandReplyOptions({
      ...panel,
      allowedMentions: { parse: [] },
    }),
  );
};

export const ticketCloseCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('ticket-close')
    .setDescription('Cierra el ticket de soporte actual.')
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Explica por qué se cierra el ticket.')
        .setRequired(true)
        .setMaxLength(1000),
    ),
  category: 'Tickets',
  examples: [
    '/ticket-close reason:"El caso fue resuelto"',
    `${env.COMMAND_PREFIX}ticket close Caso resuelto con el usuario`,
  ],
  async execute(interaction) {
    const context = await ensureTicketStaffContextFromInteraction(interaction);
    if (!context) {
      return;
    }

    if (!(await isFeatureEnabled('tickets'))) {
      await interaction.reply(
        brandReplyOptions({
          embeds: [buildFeatureDisabledEmbed('tickets')],
          flags: MessageFlags.Ephemeral,
        }),
      );
      return;
    }

    const reason = interaction.options.getString('reason', true).trim();

    await interaction.deferReply({ ephemeral: true });

    try {
      const channel = context.channel;
      const result = await closeSupportTicketUseCase.execute({
        channelId: channel.id,
        actorId: interaction.user.id,
        reason,
      });

      if (!result.closed) {
      await interaction.editReply(
        brandEditReplyOptions({
          embeds: [buildTicketNotAvailableSlashEmbed()],
        }),
      );
      return;
    }

    await interaction.editReply(
      brandEditReplyOptions({
        embeds: [buildTicketClosureConfirmationEmbed(reason)],
      }),
    );

      void dispatchTicketClosure({
        channel,
        actorId: interaction.user.id,
        ticketId: result.ticketId,
        ownerId: result.ownerId,
        reason,
      });
    } catch (error) {
      if (error instanceof ValidationFailedError) {
        await interaction.editReply(
          brandEditReplyOptions({
            embeds: [buildTicketClosureFailedEmbed(extractValidationMessage(error))],
          }),
        );
        return;
      }

      logger.error({ err: error, channelId: context.channel.id }, 'No se pudo cerrar el ticket mediante comando slash.');

      await interaction.editReply(
        brandEditReplyOptions({
          embeds: [buildTicketClosureUnexpectedErrorEmbed()],
        }),
      );
    }
  },
};

const SLASH_TRANSCRIPT_COMMAND = new SlashCommandBuilder()
  .setName('ticket-transcript')
  .setDescription('Gestiona las transcripciones del ticket de soporte actual.')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('create')
      .setDescription('Genera un ID y comienza a guardar el chat de este ticket.'),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('download')
      .setDescription('Descarga la transcripción del ticket actual o una existente.')
      .addStringOption((option) =>
        option
          .setName('id')
          .setDescription('Identificador de la transcripción a descargar.'),
      ),
  );

const TRANSCRIPT_CREATE_ALIASES = ['create', 'crear', 'start', 'iniciar'];
const TRANSCRIPT_DOWNLOAD_ALIASES = ['download', 'descargar', 'export', 'bajar'];

const isTranscriptKeyword = (value: string): boolean =>
  value === 'transcript' || value === 'transcripcion' || value === 'transcripción' || value === 'log';

export const ticketTranscriptCommand: Command = {
  data: SLASH_TRANSCRIPT_COMMAND,
  category: 'Tickets',
  examples: [
    '/ticket-transcript create',
    '/ticket-transcript download',
    `${env.COMMAND_PREFIX}ticket transcript create`,
    `${env.COMMAND_PREFIX}ticket transcript download`,
  ],
  async execute(interaction) {
    const context = await ensureTicketStaffContextFromInteraction(interaction);
    if (!context) {
      return;
    }

    if (!(await isFeatureEnabled('tickets'))) {
      await interaction.reply(
        brandReplyOptions({
          embeds: [buildFeatureDisabledEmbed('tickets')],
          flags: MessageFlags.Ephemeral,
        }),
      );
      return;
    }

    const channel = context.channel;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'create') {
      await interaction.deferReply({ ephemeral: true });

      try {
        const messages = await collectChannelMessagesForTranscript(channel);
        const result = await createTicketTranscriptUseCase.execute({
          channelId: channel.id,
          actorId: interaction.user.id,
          messages,
        });

        const embed = result.created
          ? embedFactory.success({
              title: 'Transcripción generada',
              description: `Se creó la transcripción con ID **${result.transcriptId}**. Los mensajes nuevos se guardarán automáticamente.`,
            })
          : embedFactory.warning({
              title: 'Transcripción existente',
              description: `Este ticket ya cuenta con la transcripción **${result.transcriptId}**.`,
            });

        await interaction.editReply(
          brandEditReplyOptions({
            embeds: [embed],
          }),
        );
      } catch (error) {
        logger.error(
          { err: error, channelId: channel.id },
          'No se pudo generar la transcripción del ticket mediante comando slash.',
        );

        if (error instanceof ValidationFailedError) {
          await interaction.editReply(
            brandEditReplyOptions({
              embeds: [
                embedFactory.error({
                  title: 'No se pudo crear la transcripción',
                  description: extractValidationMessage(error),
                }),
              ],
            }),
          );
          return;
        }

        await interaction.editReply(
          brandEditReplyOptions({
            embeds: [
              embedFactory.error({
                title: 'No se pudo crear la transcripción',
                description: 'Ocurrió un error inesperado al intentar guardar el chat del ticket.',
              }),
            ],
          }),
        );
      }

      return;
    }

    if (subcommand === 'download') {
      await interaction.deferReply({ ephemeral: true });

      try {
        const requestedId = interaction.options.getString('id') ?? undefined;
        const transcript = await getTicketTranscriptUseCase.execute({
          transcriptId: requestedId,
          channelId: requestedId ? undefined : channel.id,
        });

        const html = renderTranscriptAsHtml(transcript);
        const attachment = new AttachmentBuilder(Buffer.from(html, 'utf8'), {
          name: `ticket-${transcript.id}.html`,
        });

        await interaction.editReply(
          brandEditReplyOptions({
            content: `Transcripción **${transcript.id}** lista para descargar.`,
            files: [attachment],
          }),
        );
      } catch (error) {
        if (error instanceof ValidationFailedError) {
          await interaction.editReply(
            brandEditReplyOptions({
              embeds: [
                embedFactory.error({
                  title: 'No se encontró la transcripción',
                  description: extractValidationMessage(error),
                }),
              ],
            }),
          );
          return;
        }

        logger.error(
          { err: error, channelId: channel.id },
          'No se pudo descargar la transcripción del ticket mediante comando slash.',
        );

        await interaction.editReply(
          brandEditReplyOptions({
            embeds: [
              embedFactory.error({
                title: 'No se pudo descargar la transcripción',
                description: 'Ocurrió un error inesperado al generar el archivo del ticket.',
              }),
            ],
          }),
        );
      }

      return;
    }

    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.error({
            title: 'Subcomando desconocido',
            description: 'Usa **create** o **download** para gestionar transcripciones.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      }),
    );
  },
  prefix: {
    name: 'ticket',
    async execute(message, args) {
      const subcommand = args[0]?.toLowerCase();
      if (!subcommand) {
        return;
      }

      if (subcommand === 'close' || subcommand === 'cerrar') {
        if (!(await isFeatureEnabled('tickets'))) {
          await message.reply(
            brandMessageOptions({
              embeds: [buildFeatureDisabledEmbed('tickets')],
              allowedMentions: { repliedUser: false },
            }),
          );
          return;
        }

        const context = await ensureTicketStaffContextFromMessage(message);
        if (!context) {
          return;
        }

        const reason = args.slice(1).join(' ').trim();
        if (reason.length < 5) {
          await message.reply(
            brandMessageOptions({
              embeds: [buildTicketClosureReasonRequiredEmbed()],
            }),
          );
          return;
        }

        try {
          const result = await closeSupportTicketUseCase.execute({
            channelId: context.channel.id,
            actorId: message.author.id,
            reason,
          });

          if (!result.closed) {
            await message.reply(
              brandMessageOptions({
                embeds: [buildTicketNotAvailablePrefixEmbed()],
              }),
            );
            return;
          }

          await message.reply(
            brandMessageOptions({
              embeds: [buildTicketClosureConfirmationEmbed(reason)],
            }),
          );

          void dispatchTicketClosure({
            channel: context.channel,
            actorId: message.author.id,
            ticketId: result.ticketId,
            ownerId: result.ownerId,
            reason,
          });
        } catch (error) {
          if (error instanceof ValidationFailedError) {
            await message.reply(
              brandMessageOptions({
                embeds: [buildTicketClosureFailedEmbed(extractValidationMessage(error))],
              }),
            );
            return;
          }

          logger.error(
            { err: error, channelId: message.channel.id },
            'No se pudo cerrar el ticket con comando de prefijo.',
          );

          await message.reply(
            brandMessageOptions({
              embeds: [buildTicketClosureUnexpectedErrorEmbed()],
            }),
          );
        }

        return;
      }

      if (!isTranscriptKeyword(subcommand)) {
        return;
      }

      if (!(await isFeatureEnabled('tickets'))) {
        await message.reply(
          brandMessageOptions({
            embeds: [buildFeatureDisabledEmbed('tickets')],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      const action = args[1]?.toLowerCase();

      if (!action) {
        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.warning({
                title: 'Acción requerida',
                description: 'Usa `create` para generar una transcripción o `download` para descargarla.',
              }),
            ],
          }),
        );
        return;
      }

      if (TRANSCRIPT_CREATE_ALIASES.includes(action)) {
        const context = await ensureTicketStaffContextFromMessage(message);
        if (!context) {
          return;
        }

        try {
          await context.channel.sendTyping().catch(() => {});
          const messages = await collectChannelMessagesForTranscript(context.channel);
          const result = await createTicketTranscriptUseCase.execute({
            channelId: context.channel.id,
            actorId: message.author.id,
            messages,
          });

          const embed = result.created
            ? embedFactory.success({
                title: 'Transcripción creada',
                description: `Se registró la transcripción con ID **${result.transcriptId}**. Los mensajes nuevos se guardarán automáticamente.`,
              })
            : embedFactory.warning({
                title: 'Transcripción existente',
                description: `Este ticket ya cuenta con la transcripción **${result.transcriptId}**.`,
              });

          await message.reply(brandMessageOptions({ embeds: [embed] }));
        } catch (error) {
          if (error instanceof ValidationFailedError) {
            await message.reply(
              brandMessageOptions({
                embeds: [
                  embedFactory.error({
                    title: 'No se pudo crear la transcripción',
                    description: extractValidationMessage(error),
                  }),
                ],
              }),
            );
            return;
          }

          logger.error(
            { err: error, channelId: message.channel.id },
            'No se pudo crear la transcripción con comando de prefijo.',
          );

          await message.reply(
            brandMessageOptions({
              embeds: [
                embedFactory.error({
                  title: 'No se pudo crear la transcripción',
                  description: 'Ocurrió un error inesperado al intentar guardar el chat del ticket.',
                }),
              ],
            }),
          );
        }

        return;
      }

      if (TRANSCRIPT_DOWNLOAD_ALIASES.includes(action)) {
        const context = await ensureTicketStaffContextFromMessage(message);
        if (!context) {
          return;
        }

        const requestedId = args[2];

        try {
          await context.channel.sendTyping().catch(() => {});
          const transcript = await getTicketTranscriptUseCase.execute({
            transcriptId: requestedId,
            channelId: requestedId ? undefined : context.channel.id,
          });

          const html = renderTranscriptAsHtml(transcript);
          const attachment = new AttachmentBuilder(Buffer.from(html, 'utf8'), {
            name: `ticket-${transcript.id}.html`,
          });

          await message.reply(
            brandMessageOptions({
              content: `Transcripción **${transcript.id}** lista para descargar.`,
              files: [attachment],
            }),
          );
        } catch (error) {
          if (error instanceof ValidationFailedError) {
            await message.reply(
              brandMessageOptions({
                embeds: [
                  embedFactory.error({
                    title: 'No se encontró la transcripción',
                    description: extractValidationMessage(error),
                  }),
                ],
              }),
            );
            return;
          }

          logger.error(
            { err: error, channelId: message.channel.id },
            'No se pudo descargar la transcripción con comando de prefijo.',
          );

          await message.reply(
            brandMessageOptions({
              embeds: [
                embedFactory.error({
                  title: 'No se pudo descargar la transcripción',
                  description: 'Ocurrió un error inesperado al generar el archivo del ticket.',
                }),
              ],
            }),
          );
        }

        return;
      }

      await message.reply(
        brandMessageOptions({
          embeds: [
            embedFactory.warning({
              title: 'Acción no reconocida',
              description: 'Usa `create` para generar una transcripción o `download` para descargarla.',
            }),
          ],
        }),
      );
    },
  },
};

export const ticketsPanelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('tickets')
    .setDescription('Publica el panel interactivo para crear tickets de soporte.'),
  category: 'Tickets',
  examples: ['/tickets', `${env.COMMAND_PREFIX}tickets`],
  prefix: {
    name: 'tickets',
    async execute(message) {
      if (message.channel.type !== ChannelType.GuildText) {
        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.warning({
                title: 'Canal no compatible',
                description: 'El panel solo puede publicarse en canales de texto del servidor.',
              }),
            ],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      if (!(await isFeatureEnabled('tickets'))) {
        await message.reply(
          brandMessageOptions({
            embeds: [buildFeatureDisabledEmbed('tickets')],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      const panel = buildTicketPanelMessage();
      await message.channel.send(
        brandMessageOptions({
          ...panel,
          allowedMentions: { parse: [] },
        }),
      );
    },
  },
  async execute(interaction) {
    await publishTicketPanel(interaction);
  },
};
