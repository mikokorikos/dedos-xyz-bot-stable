// ============================================================================
// RUTA: src/presentation/commands/tickets/tickets.ts
// ============================================================================

import {
  ChannelType,
  type ChatInputCommandInteraction,
  type GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

import { OpenSupportTicketUseCase } from '@/application/usecases/tickets/OpenSupportTicketUseCase';
import { TicketStatus, TicketType } from '@/domain/entities/types';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaTicketRepository } from '@/infrastructure/repositories/PrismaTicketRepository';
import type { Command } from '@/presentation/commands/types';
import { MiddlemanModal } from '@/presentation/components/modals/MiddlemanModal';
import { registerButtonHandler, registerSelectMenuHandler } from '@/presentation/components/registry';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
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
import { mapErrorToDiscordResponse } from '@/shared/errors/discord-error-mapper';
import { ValidationFailedError } from '@/shared/errors/domain.errors';
import { logger } from '@/shared/logger/pino';
import { brandEditReplyOptions, brandMessageOptions, brandReplyOptions } from '@/shared/utils/branding';

const ticketRepository = new PrismaTicketRepository(prisma);

const supportTicketUseCase = new OpenSupportTicketUseCase(ticketRepository, logger, {
  categoryId: env.TICKET_CATEGORY_ID,
  panelChannelId: env.TICKET_PANEL_CHANNEL_ID,
  staffRoleIds: env.TICKET_STAFF_ROLE_IDS,
  maxTicketsPerUser: env.TICKET_MAX_PER_USER,
  cooldownMs: env.TICKET_COOLDOWN_MS,
});

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

    if (selection.type === TicketType.MM) {
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

  let member: GuildMember;
  if (interaction.member && 'user' in interaction.member) {
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

  const staffRoles = env.TICKET_STAFF_ROLE_IDS;
  const hasStaffRole = member.roles.cache.some((role) => staffRoles.includes(role.id));
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

  if (!hasStaffRole && !isAdmin) {
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

  const ticket = await ticketRepository.findByChannelId(BigInt(interaction.channel.id));
  if (ticket && ticket.status !== TicketStatus.CLOSED) {
    ticket.close();
    try {
      await ticketRepository.update(ticket);
    } catch (error) {
      logger.warn({ err: error, ticketId: ticket.id }, 'No se pudo marcar el ticket como cerrado en la base de datos.');
    }
  }

  await interaction.reply(
    brandReplyOptions({
      embeds: [
        embedFactory.success({
          title: 'Ticket cerrado',
          description: 'Este canal se eliminará en 10 segundos.',
        }),
      ],
      flags: MessageFlags.Ephemeral,
    }),
  );

  try {
    await interaction.channel.send('[LOCK] Ticket cerrado por el staff. El canal se eliminará en 10 segundos.');
  } catch (error) {
    logger.warn({ err: error, channelId: interaction.channel.id }, 'No se pudo enviar el aviso de cierre de ticket.');
  }

  setTimeout(() => {
    interaction.channel
      ?.delete('Ticket de soporte archivado por el staff')
      .catch((error) => logger.warn({ err: error, channelId: interaction.channel?.id }, 'No se pudo eliminar el canal.'));
  }, 10_000);

  logger.info(
    { channelId: interaction.channel.id, actorId: interaction.user.id, ticketId: ticket?.id },
    'Ticket de soporte cerrado manualmente.',
  );
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
  const panel = buildTicketPanelMessage();

  await interaction.reply(
    brandReplyOptions({
      ...panel,
      allowedMentions: { parse: [] },
    }),
  );
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
