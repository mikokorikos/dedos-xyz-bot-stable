// ============================================================================
// RUTA: src/presentation/commands/general/rules.ts
// ============================================================================

import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type TextChannel } from 'discord.js';

import type { Command } from '@/presentation/commands/types';
import { helpMenuService, verificationService } from '@/presentation/services/community';
import { PERMISSIONS } from '@/shared/config/constants';
import { env } from '@/shared/config/env';
import { logger } from '@/shared/logger/pino';
import { brandMessageOptions, brandReplyOptions } from '@/shared/utils/branding';
import { hasPermissions } from '@/shared/utils/permissions';

const buildRulesPayload = () => {
  const embed = verificationService.buildRulesEmbed();
  const attachments = verificationService.buildRulesAttachments();
  const components = [helpMenuService.buildMenuRow()];

  return {
    embeds: [embed],
    files: attachments.length > 0 ? attachments : undefined,
    components,
    allowedMentions: { parse: [] as const },
  };
};

export const rulesCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('rules')
    .setDescription('Publica el panel de reglas, ayuda y verificación del servidor.')
    .addChannelOption((option) =>
      option
        .setName('canal')
        .setDescription('Canal de texto donde se publicará el mensaje')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  category: 'General',
  examples: ['/rules', `${env.COMMAND_PREFIX}rules`, `${env.COMMAND_PREFIX}reglas #canal`],
  prefix: {
    name: 'rules',
    aliases: ['reglas'],
    async execute(message, args) {
      if (!message.guild || message.channel.type !== ChannelType.GuildText) {
        await message.reply(
          brandMessageOptions({
            content: 'Este comando solo puede usarse dentro de canales de texto del servidor.',
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      if (!hasPermissions(message.member, PERMISSIONS.admin)) {
        await message.reply(
          brandMessageOptions({
            content: 'Necesitas permisos de administrador para publicar las reglas.',
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      const target = args.at(0);
      const channel = target
        ? message.mentions.channels.first() ?? message.guild.channels.cache.get(target)
        : message.channel;

      if (!channel || channel.type !== ChannelType.GuildText) {
        await message.reply(
          brandMessageOptions({
            content: 'Debes indicar un canal de texto válido para publicar las reglas.',
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      const payload = buildRulesPayload();

      try {
        const sent = await channel.send(brandMessageOptions(payload));
        await verificationService.persistMessageId(sent.id);
        try {
          await sent.react('✅');
        } catch (error) {
          logger.warn({ err: error, channelId: sent.channelId }, '[VERIFY] No se pudo añadir la reacción de verificación.');
        }
        await message.reply(
          brandMessageOptions({
            content: `Panel publicado en <#${channel.id}>.`,
            allowedMentions: { repliedUser: false },
          }),
        );
      } catch (error) {
        logger.error({ err: error, channelId: channel.id }, 'No se pudo publicar el panel de reglas.');
        await message.reply(
          brandMessageOptions({
            content: 'No se pudo publicar el panel. Revisa mis permisos e intenta de nuevo.',
            allowedMentions: { repliedUser: false },
          }),
        );
      }
    },
  },
  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply(
        brandReplyOptions({
          content: 'Solo puedo publicar las reglas dentro de un servidor.',
          ephemeral: true,
        }),
      );
      return;
    }

    const hasAdminPermission = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;

    if (!hasAdminPermission) {
      await interaction.reply(
        brandReplyOptions({
          content: 'Necesitas permisos de administrador para publicar el panel.',
          ephemeral: true,
        }),
      );
      return;
    }

    const channel = interaction.options.getChannel('canal') ?? interaction.channel;

    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply(
        brandReplyOptions({
          content: 'Debes seleccionar un canal de texto válido para publicar el panel.',
          ephemeral: true,
        }),
      );
      return;
    }

    const payload = buildRulesPayload();

    try {
      const textChannel = channel as TextChannel;
      const sent = await textChannel.send(brandMessageOptions(payload));
      await verificationService.persistMessageId(sent.id);
      try {
        await sent.react('✅');
      } catch (error) {
        logger.warn({ err: error, channelId: sent.channelId }, '[VERIFY] No se pudo añadir la reacción de verificación.');
      }
      await interaction.reply(
        brandReplyOptions({
          content: `Panel publicado correctamente en <#${channel.id}>.`,
          ephemeral: true,
        }),
      );
    } catch (error) {
      logger.error({ err: error, channelId: channel.id }, 'No se pudo publicar el panel de reglas.');
      await interaction.reply(
        brandReplyOptions({
          content: 'No se pudo publicar el panel. Verifica mis permisos e intenta de nuevo.',
          ephemeral: true,
        }),
      );
    }
  },
};
