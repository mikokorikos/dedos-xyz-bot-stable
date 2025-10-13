// =============================================================================
// RUTA: src/presentation/commands/warns/unwarn.ts
// =============================================================================

import { ChannelType, GuildMember, SlashCommandBuilder } from 'discord.js';

import { GrantWarnAmnestyUseCase } from '@/application/usecases/warns/GrantWarnAmnestyUseCase';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaStaffActionRepository } from '@/infrastructure/repositories/PrismaStaffActionRepository';
import { PrismaWarnRepository } from '@/infrastructure/repositories/PrismaWarnRepository';
import type { Command } from '@/presentation/commands/types';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { PERMISSIONS } from '@/shared/config/constants';
import { env } from '@/shared/config/env';
import { logger } from '@/shared/logger/pino';
import { brandMessageOptions, brandReplyOptions } from '@/shared/utils/branding';
import { mentionUser } from '@/shared/utils/discord.utils';
import { hasPermissions } from '@/shared/utils/permissions';

const warnRepository = new PrismaWarnRepository(prisma);
const staffActionRepository = new PrismaStaffActionRepository(prisma);
const grantAmnestyUseCase = new GrantWarnAmnestyUseCase(warnRepository, staffActionRepository, prisma, logger);

const buildSuccessEmbed = (result: Awaited<ReturnType<typeof grantAmnestyUseCase.execute>>) =>
  embedFactory.success({
    title: 'Advertencia eliminada',
    description: `Se eliminó la advertencia **#${result.warnId}** del usuario ${mentionUser(result.userId.toString())}.`,
    fields: result.reason
      ? [{ name: 'Motivo administrativo', value: result.reason, inline: false }]
      : undefined,
  });

export const unwarnCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('unwarn')
    .setDescription('Revoca advertencias registradas de un usuario')
    .addSubcommand((sub) =>
      sub
        .setName('latest')
        .setDescription('Elimina la advertencia más reciente de un usuario')
        .addUserOption((option) =>
          option.setName('usuario').setDescription('Miembro objetivo').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('razon').setDescription('Motivo administrativo').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('by_id')
        .setDescription('Elimina una advertencia específica por ID')
        .addIntegerOption((option) =>
          option.setName('warn_id').setDescription('ID de la advertencia a eliminar').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('razon').setDescription('Motivo administrativo').setRequired(false),
        ),
    ),
  category: 'Moderación',
  examples: [
    '/unwarn latest usuario:@Miembro',
    '/unwarn by_id warn_id:42',
    `${env.COMMAND_PREFIX}unwarn @Miembro`,
  ],
  prefix: {
    name: 'unwarn',
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
            content: 'Necesitas permisos de staff para revocar advertencias.',
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      const mutableArgs = [...args];

      if (mutableArgs.length === 0) {
        await message.reply(
          brandMessageOptions({
            content: 'Debes mencionar a un usuario o proporcionar su ID.',
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      const targetArg = mutableArgs.shift()!;
      const mention = message.mentions.users.first();
      const targetId = mention?.id ?? targetArg.replace(/<@!?|>/g, '');

      if (!/^[0-9]{17,20}$/.test(targetId)) {
        await message.reply(
          brandMessageOptions({
            content: 'No pude identificar al usuario objetivo.',
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      let warnId: number | null = null;

      if (mutableArgs.length > 0) {
        const candidate = mutableArgs[0];
        if (candidate && /^\d+$/.test(candidate)) {
          warnId = Number(mutableArgs.shift());
        } else if (candidate && candidate.toLowerCase() === 'last') {
          mutableArgs.shift();
        }
      }

      const reason = mutableArgs.length > 0 ? mutableArgs.join(' ').slice(0, 200) : undefined;

      try {
        const result = await grantAmnestyUseCase.execute({
          warnId: warnId ?? undefined,
          userId: warnId ? undefined : targetId,
          moderatorId: message.author.id,
          guildId: message.guild.id,
          reason,
        });

        await message.reply(
          brandMessageOptions({
            embeds: [buildSuccessEmbed(result)],
            allowedMentions: { users: [result.userId.toString()] },
          }),
        );
      } catch (error) {
        logger.error({ err: error, messageId: message.id }, 'No se pudo revocar la advertencia.');
        await message.reply(
          brandMessageOptions({
            content: 'No se pudo eliminar la advertencia solicitada. Revisa los parámetros e intenta nuevamente.',
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
          embeds: [
            embedFactory.warning({
              title: 'Acción no disponible',
              description: 'Este comando solo puede usarse dentro de un servidor.',
            }),
          ],
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
              description: 'Necesitas permisos de staff para revocar advertencias.',
            }),
          ],
          ephemeral: true,
        }),
      );
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const reason = interaction.options.getString('razon') ?? undefined;

    try {
      const result = await grantAmnestyUseCase.execute({
        warnId: subcommand === 'by_id' ? interaction.options.getInteger('warn_id', true) : undefined,
        userId: subcommand === 'latest' ? interaction.options.getUser('usuario', true).id : undefined,
        moderatorId: interaction.user.id,
        guildId: interaction.guild.id,
        reason,
      });

      await interaction.reply(
        brandReplyOptions({
          embeds: [buildSuccessEmbed(result)],
          ephemeral: true,
        }),
      );
    } catch (error) {
      logger.warn({ err: error, interactionId: interaction.id }, 'Error revocando advertencia.');
      await interaction.reply(
        brandReplyOptions({
          embeds: [
            embedFactory.error({
              title: 'No se pudo revocar la advertencia',
              description: 'Verifica que el ID proporcionado sea correcto o que el usuario tenga advertencias registradas.',
            }),
          ],
          ephemeral: true,
        }),
      );
    }
  },
};
