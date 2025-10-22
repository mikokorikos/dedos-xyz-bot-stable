// =============================================================================
// RUTA: src/presentation/commands/messages/messages.ts
// =============================================================================

import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import { GetChannelMessageStatsUseCase } from '@/application/usecases/messages/GetChannelMessageStatsUseCase';
import { GetMessageLeaderboardUseCase } from '@/application/usecases/messages/GetMessageLeaderboardUseCase';
import { GetUserMessageStatsUseCase } from '@/application/usecases/messages/GetUserMessageStatsUseCase';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaMessageCountRepository } from '@/infrastructure/repositories/PrismaMessageCountRepository';
import type { Command } from '@/presentation/commands/types';
import { buildFeatureDisabledEmbed } from '@/presentation/embeds/featureEmbeds';
import {
  buildChannelStatsEmbed,
  buildLeaderboardEmbed,
  buildMessagesPrefixGuildOnlyEmbed,
  buildMessagesSlashGuildOnlyEmbed,
  buildMessagesUnexpectedErrorEmbed,
  buildUserStatsEmbed,
} from '@/presentation/embeds/messageStatsEmbeds';
import { env } from '@/shared/config/env';
import { isFeatureEnabled } from '@/shared/config/runtime';
import { logger } from '@/shared/logger/pino';
import { brandEditReplyOptions, brandMessageOptions, brandReplyOptions } from '@/shared/utils/branding';

const repository = new PrismaMessageCountRepository(prisma);
const getUserStatsUseCase = new GetUserMessageStatsUseCase(repository);
const getLeaderboardUseCase = new GetMessageLeaderboardUseCase(repository);
const getChannelStatsUseCase = new GetChannelMessageStatsUseCase(repository);

type MessageScope = 'self' | 'top' | 'channel';

const parseScope = (raw: string | null | undefined): MessageScope => {
  if (!raw) {
    return 'self';
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'top') {
    return 'top';
  }

  if (normalized === 'channel') {
    return 'channel';
  }

  return 'self';
};

const MESSAGES_SCOPE_OPTION = 'vista';

export const messageStatsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('messages')
    .setDescription('Consulta estadisticas de mensajes personales, del canal o ranking global.')
    .addStringOption((option) =>
      option
        .setName(MESSAGES_SCOPE_OPTION)
        .setDescription('Selecciona que estadistica deseas revisar.')
        .addChoices(
          { name: 'Top de usuarios', value: 'top' },
          { name: 'Canal actual', value: 'channel' },
        ),
    ),
  category: 'Actividad',
  examples: [
    '/messages',
    '/messages vista:top',
    '/messages vista:channel',
    `${env.COMMAND_PREFIX}messages`,
    `${env.COMMAND_PREFIX}messages top`,
    `${env.COMMAND_PREFIX}messages channel`,
  ],
  prefix: {
    name: 'messages',
    async execute(message, args) {
      if (!message.inGuild()) {
        await message.reply(
          brandMessageOptions({
            embeds: [buildMessagesPrefixGuildOnlyEmbed()],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      if (!(await isFeatureEnabled('counting'))) {
        const embed = buildFeatureDisabledEmbed('counting');
        await message.reply(
          brandMessageOptions({
            embeds: [embed],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      const scope = parseScope(args.at(0));

      try {
        if (scope === 'top') {
          const leaderboard = await getLeaderboardUseCase.execute({ guildId: message.guildId });
          const embed = buildLeaderboardEmbed({ entries: leaderboard });
          await message.reply(brandMessageOptions({ embeds: [embed], allowedMentions: { repliedUser: false } }));
          return;
        }

        if (scope === 'channel') {
          const stats = await getChannelStatsUseCase.execute({
            guildId: message.guildId,
            channelId: message.channelId,
          });
          const embed = buildChannelStatsEmbed({ channelId: message.channelId, stats });
          await message.reply(brandMessageOptions({ embeds: [embed], allowedMentions: { repliedUser: false } }));
          return;
        }

        const stats = await getUserStatsUseCase.execute({
          guildId: message.guildId,
          userId: message.author.id,
        });
        const embed = buildUserStatsEmbed({
          stats,
          displayName: message.member?.displayName ?? message.author.tag,
        });
        await message.reply(brandMessageOptions({ embeds: [embed], allowedMentions: { repliedUser: false } }));
      } catch (error) {
        logger.error({ err: error, scope, userId: message.author.id }, 'Error al obtener estadisticas de mensajes (prefijo).');
        await message.reply(
          brandMessageOptions({
            embeds: [
              buildMessagesUnexpectedErrorEmbed(),
            ],
            allowedMentions: { repliedUser: false },
          }),
        );
      }
    },
  },
  async execute(interaction) {
    if (!interaction.guild || !interaction.guildId) {
      await interaction.reply({
        embeds: [buildMessagesSlashGuildOnlyEmbed()],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!(await isFeatureEnabled('counting'))) {
      await interaction.reply(
        brandReplyOptions({
          embeds: [buildFeatureDisabledEmbed('counting')],
          flags: MessageFlags.Ephemeral,
        }),
      );
      return;
    }

    const scope = parseScope(interaction.options.getString(MESSAGES_SCOPE_OPTION));

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (scope === 'top') {
        const leaderboard = await getLeaderboardUseCase.execute({ guildId: interaction.guildId });
        const embed = buildLeaderboardEmbed({ entries: leaderboard });
        await interaction.editReply(brandEditReplyOptions({ embeds: [embed] }));
        return;
      }

      if (scope === 'channel') {
        const channelId = interaction.channelId;
        const stats = await getChannelStatsUseCase.execute({
          guildId: interaction.guildId,
          channelId,
        });
        const embed = buildChannelStatsEmbed({ channelId, stats });
        await interaction.editReply(brandEditReplyOptions({ embeds: [embed] }));
        return;
      }

      const member = interaction.member;
      const displayName =
        typeof member === 'object' && member && 'nickname' in member && member.nickname
          ? member.nickname
          : interaction.user.globalName ?? interaction.user.username;
      const stats = await getUserStatsUseCase.execute({
        guildId: interaction.guildId,
        userId: interaction.user.id,
      });
      const embed = buildUserStatsEmbed({ stats, displayName });
      await interaction.editReply(brandEditReplyOptions({ embeds: [embed] }));
    } catch (error) {
      logger.error({ err: error, scope, userId: interaction.user.id }, 'Error al obtener estadisticas de mensajes.');
      await interaction.editReply(
        brandEditReplyOptions({
          embeds: [buildMessagesUnexpectedErrorEmbed()],
        }),
      );
    }
  },
};

