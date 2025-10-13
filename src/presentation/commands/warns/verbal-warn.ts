// =============================================================================
// RUTA: src/presentation/commands/warns/verbal-warn.ts
// =============================================================================

import { ChannelType, GuildMember, SlashCommandBuilder } from 'discord.js';

import type { Command } from '@/presentation/commands/types';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { PERMISSIONS } from '@/shared/config/constants';
import { env } from '@/shared/config/env';
import { logger } from '@/shared/logger/pino';
import { brandMessageOptions, brandReplyOptions } from '@/shared/utils/branding';
import { mentionUser } from '@/shared/utils/discord.utils';
import { dmQueue } from '@/shared/utils/dm-queue';
import { hasPermissions } from '@/shared/utils/permissions';

const buildVerbalWarnEmbed = (moderatorId: string, reason: string | null) =>
  embedFactory.warning({
    title: 'Advertencia verbal del staff',
    description: reason ?? 'El staff registró una advertencia verbal. Por favor evita reincidir.',
    fields: [
      { name: 'Moderador', value: mentionUser(moderatorId), inline: true },
      { name: 'Tipo', value: 'Advertencia verbal (sin registro en base de datos)', inline: true },
    ],
  });

export const verbalWarnCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('verbalwarn')
    .setDescription('Envía una advertencia verbal sin registrarla en la base de datos')
    .addUserOption((option) =>
      option.setName('usuario').setDescription('Miembro a advertir').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('razon')
        .setDescription('Motivo de la advertencia verbal')
        .setMaxLength(400)
        .setRequired(false),
    ),
  category: 'Moderación',
  examples: ['/verbalwarn usuario:@Miembro razon:Respeta las reglas', `${env.COMMAND_PREFIX}verbalwarn @Miembro`],
  prefix: {
    name: 'verbalwarn',
    async execute(message, args) {
      if (!message.guild || message.channel.type !== ChannelType.GuildText) {
        await message.reply(
          brandMessageOptions({
            content: 'Este comando solo puede usarse en servidores.',
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      if (!hasPermissions(message.member, PERMISSIONS.staff)) {
        await message.reply(
          brandMessageOptions({
            content: 'Necesitas permisos de staff para enviar advertencias verbales.',
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      const mutableArgs = [...args];

      if (mutableArgs.length === 0) {
        await message.reply(
          brandMessageOptions({
            content: 'Debes mencionar a un usuario o indicar su ID.',
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      const targetArg = mutableArgs.shift()!;
      const targetUser = message.mentions.users.first();
      const targetId = targetUser?.id ?? targetArg.replace(/<@!?|>/g, '');

      if (!/^[0-9]{17,20}$/.test(targetId)) {
        await message.reply(
          brandMessageOptions({
            content: 'No pude identificar al usuario objetivo.',
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      const reason = mutableArgs.length > 0 ? mutableArgs.join(' ').slice(0, 400) : null;

      try {
        const embed = buildVerbalWarnEmbed(message.author.id, reason);
        await dmQueue.enqueue(await message.client.users.fetch(targetId), {
          embeds: [embed],
        });

        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.success({
                title: 'Advertencia enviada',
                description: `Se notificó a ${mentionUser(targetId)} mediante mensaje directo.`,
              }),
            ],
            allowedMentions: { users: [targetId] },
          }),
        );
      } catch (error) {
        logger.warn({ err: error, userId: targetId }, 'No se pudo enviar la advertencia verbal.');
        await message.reply(
          brandMessageOptions({
            content: 'No pude enviar el mensaje directo. Verifica la configuración del usuario.',
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
          content: 'Este comando solo puede usarse dentro de un servidor.',
          ephemeral: true,
        }),
      );
      return;
    }

    const member =
      interaction.member instanceof GuildMember
        ? interaction.member
        : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

    if (!hasPermissions(member, PERMISSIONS.staff)) {
      await interaction.reply(
        brandReplyOptions({
          embeds: [
            embedFactory.error({
              title: 'Permisos insuficientes',
              description: 'Necesitas permisos de staff para enviar advertencias verbales.',
            }),
          ],
          ephemeral: true,
        }),
      );
      return;
    }

    const target = interaction.options.getUser('usuario', true);
    const reason = interaction.options.getString('razon');

    try {
      const embed = buildVerbalWarnEmbed(interaction.user.id, reason ?? null);
      await dmQueue.enqueue(target, { embeds: [embed] });

      await interaction.reply(
        brandReplyOptions({
          embeds: [
            embedFactory.success({
              title: 'Advertencia enviada',
              description: `Se notificó a ${mentionUser(target.id)} mediante mensaje directo.`,
            }),
          ],
          ephemeral: true,
        }),
      );
    } catch (error) {
      logger.warn({ err: error, userId: target.id }, 'No se pudo enviar la advertencia verbal.');
      await interaction.reply(
        brandReplyOptions({
          embeds: [
            embedFactory.warning({
              title: 'Mensaje no entregado',
              description: 'No fue posible enviar el DM. Es probable que el usuario tenga los mensajes cerrados.',
            }),
          ],
          ephemeral: true,
        }),
      );
    }
  },
};
