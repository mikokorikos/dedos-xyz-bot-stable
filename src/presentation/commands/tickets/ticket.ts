// ============================================================================
// RUTA: src/presentation/commands/tickets/ticket.ts
// ============================================================================

import {
  ActionRowBuilder,
  ComponentType,
  GuildMember,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import { CloseGeneralTicketUseCase } from '@/application/usecases/tickets/CloseGeneralTicketUseCase';
import { CreateGeneralTicketUseCase } from '@/application/usecases/tickets/CreateGeneralTicketUseCase';
import { TicketType } from '@/domain/entities/types';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaTicketRepository } from '@/infrastructure/repositories/PrismaTicketRepository';
import type { Command } from '@/presentation/commands/types';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { createSupportTicketCloser } from '@/presentation/tickets/SupportTicketCloser';
import { COOLDOWNS, PERMISSIONS } from '@/shared/config/constants';
import { env } from '@/shared/config/env';
import { ChannelCreationError } from '@/shared/errors/domain.errors';
import { logger } from '@/shared/logger/pino';
import { brandMessageOptions } from '@/shared/utils/branding';
import { cooldownManager } from '@/shared/utils/cooldown-manager';
import { mentionUser } from '@/shared/utils/discord.utils';
import { hasPermissions } from '@/shared/utils/permissions';

const ticketRepository = new PrismaTicketRepository(prisma);
const createTicketUseCase = new CreateGeneralTicketUseCase(ticketRepository, logger, embedFactory);
const closeTicketUseCase = new CloseGeneralTicketUseCase(ticketRepository, logger, embedFactory);
const supportTicketCloser = createSupportTicketCloser({ ticketRepository, logger });

const SUPPORT_CLOSE_DELAY_MS = 10_000;
const SUPPORT_DELETE_DELAY_MS = 5_000;

type GeneralTicketType = Exclude<TicketType, TicketType.MM>;

const ticketOptions: Array<{ label: string; value: GeneralTicketType; description: string }> = [
  { label: 'Compra', value: TicketType.BUY, description: 'Solicita un canal para comprar un producto.' },
  { label: 'Venta', value: TicketType.SELL, description: 'Ofrece un producto a la venta.' },
  { label: 'Robux', value: TicketType.ROBUX, description: 'Solicita trades relacionados con Robux.' },
  { label: 'Nitro', value: TicketType.NITRO, description: 'Gestiona ventas o compras de Nitro.' },
  { label: 'Decoración', value: TicketType.DECOR, description: 'Pide asistencia de diseño o decoraciones.' },
];

const hasTicketStaffRole = (member: GuildMember | null): boolean => {
  if (!member) {
    return false;
  }

  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  const staffRoles = env.TICKET_STAFF_ROLE_IDS;
  return member.roles.cache.some((role) => staffRoles.includes(role.id));
};

const scheduleLockNotice = async (channel: TextChannel, delayMs: number): Promise<void> => {
  try {
    const seconds = Math.max(1, Math.round(delayMs / 1000));
    await channel.send(
      `[LOCK] Ticket cerrado por el staff. El canal se eliminará en ${seconds} segundo${seconds === 1 ? '' : 's'}.`,
    );
  } catch (error) {
    logger.warn({ err: error, channelId: channel.id }, 'No se pudo enviar el aviso de cierre de ticket.');
  }
};

const buildTypeSelect = () =>
  new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket-type-select')
      .setPlaceholder('Selecciona el tipo de ticket que deseas abrir')
      .addOptions(
        ticketOptions.map((option) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(option.label)
            .setValue(option.value)
            .setDescription(option.description),
        ),
      ),
  );

const buildReasonModal = (type: GeneralTicketType) =>
  new ModalBuilder()
    .setCustomId(`ticket-open-${type}`)
    .setTitle(`Abrir ticket de ${type.toLowerCase()}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Describe brevemente el motivo del ticket')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(10)
          .setMaxLength(1000)
          .setRequired(true),
      ),
    );

export const ticketCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Administra tickets generales')
    .addSubcommand((sub) => sub.setName('open').setDescription('Abre un nuevo ticket general'))
    .addSubcommand((sub) =>
      sub
        .setName('close')
        .setDescription('Cierra el ticket actual')
        .addIntegerOption((option) =>
          option
            .setName('ticket_id')
            .setDescription('Identificador del ticket a cerrar')
            .setRequired(false),
        ),
  )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Cierra y elimina el ticket actual')
        .addIntegerOption((option) =>
          option
            .setName('ticket_id')
            .setDescription('Identificador del ticket a eliminar')
            .setRequired(false),
        ),
    ),
  category: 'Tickets',
  examples: ['/ticket open', '/ticket close', '/ticket delete', `${env.COMMAND_PREFIX}ticket close`],
  prefix: {
    name: 'ticket',
    async execute(message, args) {
      const [rawSubcommand, rawTicketId] = args;
      const subcommand = rawSubcommand?.toLowerCase();

      if (!subcommand || subcommand === 'help') {
        const prefix = env.COMMAND_PREFIX;
        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.info({
                title: 'Comandos de ticket disponibles',
                description: [
                  `• \`${prefix}ticket close\` — Cierra el ticket actual y elimina el canal en unos segundos.`,
                  `• \`${prefix}ticket delete\` — Elimina el canal del ticket casi de inmediato.`,
                  '• Usa `/ticket open` para crear un ticket general con formulario interactivo.',
                ].join('\n'),
              }),
            ],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      if (!message.inGuild() || !(message.channel instanceof TextChannel)) {
        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.error({
                title: 'Canal no válido',
                description: 'Este comando solo puede usarse dentro de un canal de ticket.',
              }),
            ],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      const textChannel = message.channel;
      const member = message.member instanceof GuildMember ? message.member : null;

      if (!hasTicketStaffRole(member)) {
        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.warning({
                title: 'Acceso denegado',
                description: 'Solo el staff de soporte puede cerrar tickets manualmente.',
              }),
            ],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      if (subcommand !== 'close' && subcommand !== 'delete') {
        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.warning({
                title: 'Subcomando desconocido',
                description: 'Usa `close` o `delete` para administrar el ticket.',
              }),
            ],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      const deleteDelay = subcommand === 'delete' ? SUPPORT_DELETE_DELAY_MS : SUPPORT_CLOSE_DELAY_MS;
      const deleteReason =
        subcommand === 'delete'
          ? 'Ticket de soporte eliminado mediante comando de texto'
          : 'Ticket de soporte cerrado mediante comando de texto';

      const ticketIdFilter = rawTicketId ? Number.parseInt(rawTicketId, 10) : null;

      if (rawTicketId && Number.isNaN(ticketIdFilter)) {
        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.error({
                title: 'Identificador inválido',
                description: 'El ID proporcionado debe ser un número entero.',
              }),
            ],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      let channelTicketId: number | null = null;

      if (ticketIdFilter !== null) {
        try {
          const ticket = await ticketRepository.findByChannelId(BigInt(textChannel.id));
          channelTicketId = ticket?.id ?? null;
        } catch (error) {
          logger.error({ err: error, channelId: textChannel.id }, 'No se pudo validar el ticket del canal.');
        }

        if (channelTicketId === null || channelTicketId !== ticketIdFilter) {
          await message.reply(
            brandMessageOptions({
              embeds: [
                embedFactory.warning({
                  title: 'Ticket incompatible',
                  description: 'El ID proporcionado no coincide con el ticket de este canal.',
                }),
              ],
              allowedMentions: { repliedUser: false },
            }),
          );
          return;
        }
      }

      try {
        const result = await supportTicketCloser(textChannel, {
          executorId: message.author.id,
          deleteDelayMs: deleteDelay,
          deleteReason,
        });

        if (result.status === 'not-ticket') {
          await message.reply(
            brandMessageOptions({
              embeds: [
                embedFactory.warning({
                  title: 'Ticket no registrado',
                  description:
                    'No se encontró un ticket asociado a este canal, pero se programó la eliminación del mismo.',
                }),
              ],
              allowedMentions: { repliedUser: false },
            }),
          );
          return;
        }

        const ticketLabel = result.ticketId ? `#${result.ticketId}` : 'actual';
        const seconds = Math.max(1, Math.round(deleteDelay / 1000));
        const description =
          result.status === 'already-closed'
            ? `El ticket ${ticketLabel} ya estaba cerrado. El canal se eliminará en ${seconds} segundo${
                seconds === 1 ? '' : 's'
              }.`
            : `El ticket ${ticketLabel} se cerró correctamente. El canal se eliminará en ${seconds} segundo${
                seconds === 1 ? '' : 's'
              }.`;

        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.success({
                title: subcommand === 'delete' ? 'Ticket eliminado' : 'Ticket cerrado',
                description,
              }),
            ],
            allowedMentions: { repliedUser: false },
          }),
        );

        await scheduleLockNotice(textChannel, deleteDelay);
      } catch (error) {
        logger.error({ err: error, channelId: textChannel.id }, 'No se pudo cerrar el ticket por comando de texto.');

        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.error({
                title: 'Fallo al cerrar el ticket',
                description: 'Intenta nuevamente o utiliza el botón del panel.',
              }),
            ],
            allowedMentions: { repliedUser: false },
          }),
        );
      }
    },
  },
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'open') {
      if (!interaction.guild) {
        await interaction.reply({
          embeds: [
            embedFactory.error({
              title: 'Acción no disponible',
              description: 'Solo puedes abrir tickets en un servidor.',
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      const cooldownKey = `ticket:${interaction.user.id}`;
      if (!cooldownManager.consume(cooldownKey, interaction.user.id, COOLDOWNS.generalTicket)) {
        const remaining = Math.ceil(cooldownManager.remaining(cooldownKey, interaction.user.id) / 1000);
        await interaction.reply({
          embeds: [
            embedFactory.warning({
              title: 'Espera un momento',
              description: `Debes esperar ${remaining} segundos antes de abrir otro ticket general.`,
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      const message = await interaction.reply({
        embeds: [
          embedFactory.info({
            title: 'Selecciona el tipo de ticket',
            description: 'Elige el tipo de ticket que deseas abrir para continuar con el formulario.',
          }),
        ],
        components: [buildTypeSelect()],
        ephemeral: true,
        fetchReply: true,
      });

      try {
        const selectInteraction = await message.awaitMessageComponent({
          componentType: ComponentType.StringSelect,
          time: 60_000,
          filter: (component) => component.user.id === interaction.user.id,
        });

        const selectedValue = selectInteraction.values.at(0);

        if (!selectedValue) {
          throw new ChannelCreationError('No se seleccionó un tipo de ticket válido.');
        }

        const selectedOption = ticketOptions.find((option) => option.value === selectedValue);

        if (!selectedOption) {
          throw new ChannelCreationError('El tipo de ticket seleccionado no es válido.');
        }

        const modal = buildReasonModal(selectedOption.value);
        await selectInteraction.showModal(modal);

        const modalInteraction = await selectInteraction.awaitModalSubmit({
          filter: (modalSubmit) => modalSubmit.user.id === interaction.user.id,
          time: 120_000,
        });

        const reason = modalInteraction.fields.getTextInputValue('reason');

        await modalInteraction.deferReply({ ephemeral: true });

        const { channel } = await createTicketUseCase.execute(
          {
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            type: selectedOption.value,
            reason,
          },
          interaction.guild,
        );

        await modalInteraction.editReply({
          embeds: [
            embedFactory.success({
              title: 'Ticket creado',
              description: `Tu ticket se ha creado correctamente en ${channel.toString()}.`,
            }),
          ],
        });
      } catch (error) {
        if (error instanceof ChannelCreationError) {
          await interaction.editReply({
            embeds: [
              embedFactory.error({
                title: 'No se pudo crear el ticket',
                description: error.message,
              }),
            ],
            components: [],
          });
          return;
        }

        await interaction.editReply({
          embeds: [
            embedFactory.error({
              title: 'Sesión expirada',
              description: 'No recibimos una selección a tiempo. Ejecuta el comando de nuevo para intentarlo.',
            }),
          ],
          components: [],
        });
      }

      return;
    }

    if (subcommand === 'close' || subcommand === 'delete') {
      if (!interaction.guild) {
        await interaction.reply({
          embeds: [
            embedFactory.error({
              title: 'Acción no disponible',
              description: 'Este comando solo puede usarse en servidores.',
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      const isDelete = subcommand === 'delete';
      const channel = interaction.channel;
      const ticketIdOption = interaction.options.getInteger('ticket_id');

      if (!(channel instanceof TextChannel)) {
        await interaction.reply({
          embeds: [
            embedFactory.error({
              title: 'Canal no válido',
              description: 'Ejecuta el comando dentro del canal del ticket.',
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      const textChannel = channel;
      const guildMember =
        interaction.member instanceof GuildMember
          ? interaction.member
          : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      const deleteDelay = isDelete ? SUPPORT_DELETE_DELAY_MS : SUPPORT_CLOSE_DELAY_MS;
      const deleteReason = isDelete
        ? 'Ticket de soporte eliminado mediante comando slash'
        : 'Ticket de soporte cerrado mediante comando slash';

      let channelTicketId: number | null = null;

      try {
        const ticket = await ticketRepository.findByChannelId(BigInt(textChannel.id));
        channelTicketId = ticket?.id ?? null;
      } catch (error) {
        logger.error({ err: error, channelId: textChannel.id }, 'No se pudo validar el ticket del canal para el cierre.');
      }

      if (channelTicketId !== null && (ticketIdOption === null || ticketIdOption === channelTicketId)) {
        if (!hasTicketStaffRole(guildMember ?? null)) {
          await interaction.reply({
            embeds: [
              embedFactory.warning({
                title: 'Acceso denegado',
                description: 'Solo el staff autorizado puede cerrar tickets de soporte.',
              }),
            ],
            ephemeral: true,
          });
          return;
        }

        await interaction.deferReply({ ephemeral: true });

        try {
          const result = await supportTicketCloser(textChannel, {
            executorId: interaction.user.id,
            deleteDelayMs: deleteDelay,
            deleteReason,
          });

          if (result.status === 'not-ticket') {
            await interaction.editReply({
              embeds: [
                embedFactory.warning({
                  title: 'Ticket no registrado',
                  description:
                    'No se encontró un ticket asociado a este canal, pero se programó la eliminación del mismo.',
                }),
              ],
            });
            return;
          }

          const ticketLabel = result.ticketId ? `#${result.ticketId}` : 'actual';
          const seconds = Math.max(1, Math.round(deleteDelay / 1000));
          const description =
            result.status === 'already-closed'
              ? `El ticket ${ticketLabel} ya estaba cerrado. El canal se eliminará en ${seconds} segundo${
                  seconds === 1 ? '' : 's'
                }.`
              : `El ticket ${ticketLabel} se cerró correctamente. El canal se eliminará en ${seconds} segundo${
                  seconds === 1 ? '' : 's'
                }.`;

          await interaction.editReply({
            embeds: [
              embedFactory.success({
                title: isDelete ? 'Ticket eliminado' : 'Ticket cerrado',
                description,
              }),
            ],
          });

          await scheduleLockNotice(textChannel, deleteDelay);
        } catch (error) {
          logger.error({ err: error, channelId: textChannel.id }, 'No se pudo cerrar el ticket desde el comando slash.');
          await interaction.editReply({
            embeds: [
              embedFactory.error({
                title: 'Fallo al cerrar el ticket',
                description: 'Intenta nuevamente o utiliza el botón del panel.',
              }),
            ],
          });
        }

        return;
      }

      if (ticketIdOption === null) {
        await interaction.reply({
          embeds: [
            embedFactory.warning({
              title: 'Ticket no identificado',
              description: 'Proporciona el ID del ticket o ejecuta el comando dentro del canal correspondiente.',
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      const executorIsStaff = hasPermissions(guildMember, PERMISSIONS.staff);

      await interaction.deferReply({ ephemeral: true });

      try {
        await closeTicketUseCase.execute(
          { ticketId: ticketIdOption, executorId: interaction.user.id },
          textChannel,
          { executorIsStaff },
        );

        await interaction.editReply({
          embeds: [
            embedFactory.success({
              title: 'Ticket cerrado',
              description: `El ticket #${ticketIdOption} fue cerrado por ${mentionUser(interaction.user.id)}.`,
            }),
          ],
        });

        if (isDelete) {
          await scheduleLockNotice(textChannel, deleteDelay);
          setTimeout(() => {
            textChannel
              .delete('Ticket general eliminado mediante comando slash')
              .catch((error) =>
                logger.warn({ err: error, channelId: textChannel.id }, 'No se pudo eliminar el canal tras cerrar el ticket.'),
              );
          }, deleteDelay);
        }
      } catch (error) {
        logger.error({ err: error, channelId: textChannel.id }, 'Fallo al cerrar el ticket general desde el comando slash.');
        await interaction.editReply({
          embeds: [
            embedFactory.error({
              title: 'No se pudo cerrar el ticket',
              description: 'Verifica tus permisos e inténtalo de nuevo.',
            }),
          ],
        });
      }

      return;
    }
  },
};
