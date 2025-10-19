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
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { env } from '@/shared/config/env';
import { logger } from '@/shared/logger/pino';
import { brandEditReplyOptions, brandMessageOptions } from '@/shared/utils/branding';

const numberFormatter = new Intl.NumberFormat('es-MX');
const percentageFormatter = new Intl.NumberFormat('es-MX', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

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

const formatChannelBreakdown = (entries: ReadonlyArray<{ channelId: bigint; total: number }>): string => {
  if (entries.length === 0) {
    return 'No registramos mensajes para este usuario.';
  }

  return entries
    .map((entry) => `• <#${entry.channelId.toString()}> — ${numberFormatter.format(entry.total)} mensajes`)
    .join('\n');
};

const formatLeaderboard = (entries: ReadonlyArray<{ userId: bigint; total: number }>): string => {
  if (entries.length === 0) {
    return 'Todavia no hay mensajes registrados.';
  }

  return entries
    .map((entry, index) => `${index + 1}. <@${entry.userId.toString()}> — ${numberFormatter.format(entry.total)} mensajes`)
    .join('\n');
};

const buildUserStatsEmbed = async (
  guildId: string,
  userId: string,
  displayName: string,
): Promise<ReturnType<typeof embedFactory.info>> => {
  const stats = await getUserStatsUseCase.execute({ guildId, userId });
  const share = stats.guildTotal > 0 ? (stats.total / stats.guildTotal) * 100 : 0;
  const rankValue = stats.rank ? `#${stats.rank}` : 'Sin posicion disponible';

  const embed = embedFactory.info({
    title: `Actividad de ${displayName}`,
    description:
      'Resumen actualizado de tus mensajes en Dedos.xyz. Estos datos se sincronizan en tiempo real y se ajustan si eliminas mensajes.',
  });

  embed.addFields(
    {
      name: 'Mensajes en el servidor',
      value: numberFormatter.format(stats.total),
      inline: true,
    },
    {
      name: 'Participacion',
      value:
        stats.guildTotal > 0
          ? `${percentageFormatter.format(share)}% del total (${numberFormatter.format(stats.guildTotal)} mensajes)`
          : 'Sin datos registrados en el servidor.',
      inline: true,
    },
    {
      name: 'Posicion actual',
      value: rankValue,
      inline: true,
    },
  );

  embed.addFields({
    name: 'Canales mas activos',
    value: formatChannelBreakdown(stats.topChannels),
  });

  return embed;
};

const buildLeaderboardEmbed = async (guildId: string): Promise<ReturnType<typeof embedFactory.info>> => {
  const leaderboard = await getLeaderboardUseCase.execute({ guildId });
  const embed = embedFactory.info({
    title: '🏆 Usuarios mas activos',
    description: 'Ranking global de mensajes en Dedos.xyz. Se actualiza automaticamente con cada mensaje.',
  });

  embed.addFields({
    name: 'Top 10',
    value: formatLeaderboard(leaderboard),
  });

  return embed;
};

const buildChannelStatsEmbed = async (
  guildId: string,
  channelId: string,
): Promise<ReturnType<typeof embedFactory.info>> => {
  const stats = await getChannelStatsUseCase.execute({ guildId, channelId });
  const embed = embedFactory.info({
    title: `Actividad en <#${channelId}>`,
    description: `Se registraron ${numberFormatter.format(stats.total)} mensajes en este canal.`,
  });

  embed.addFields({
    name: 'Participantes destacados',
    value: formatLeaderboard(stats.topUsers),
  });

  return embed;
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
            embeds: [
              embedFactory.error({
                title: 'Accion no disponible',
                description: 'Este comando solo se puede utilizar dentro de un servidor.',
              }),
            ],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      const scope = parseScope(args.at(0));

      try {
        if (scope === 'top') {
          const embed = await buildLeaderboardEmbed(message.guildId);
          await message.reply(brandMessageOptions({ embeds: [embed], allowedMentions: { repliedUser: false } }));
          return;
        }

        if (scope === 'channel') {
          const embed = await buildChannelStatsEmbed(message.guildId, message.channelId);
          await message.reply(brandMessageOptions({ embeds: [embed], allowedMentions: { repliedUser: false } }));
          return;
        }

        const embed = await buildUserStatsEmbed(
          message.guildId,
          message.author.id,
          message.member?.displayName ?? message.author.tag,
        );
        await message.reply(brandMessageOptions({ embeds: [embed], allowedMentions: { repliedUser: false } }));
      } catch (error) {
        logger.error({ err: error, scope, userId: message.author.id }, 'Error al obtener estadisticas de mensajes (prefijo).');
        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.error({
                title: 'No se pudieron cargar las estadisticas',
                description: 'Ocurrio un error inesperado. Intentalo nuevamente mas tarde.',
              }),
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
        embeds: [
          embedFactory.error({
            title: 'Accion no disponible',
            description: 'Este comando solo puede utilizarse dentro de un servidor de Discord.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const scope = parseScope(interaction.options.getString(MESSAGES_SCOPE_OPTION));

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (scope === 'top') {
        const embed = await buildLeaderboardEmbed(interaction.guildId);
        await interaction.editReply(brandEditReplyOptions({ embeds: [embed] }));
        return;
      }

      if (scope === 'channel') {
        const channelId = interaction.channelId;
        const embed = await buildChannelStatsEmbed(interaction.guildId, channelId);
        await interaction.editReply(brandEditReplyOptions({ embeds: [embed] }));
        return;
      }

      const member = interaction.member;
      const displayName =
        typeof member === 'object' && member && 'nickname' in member && member.nickname
          ? member.nickname
          : interaction.user.globalName ?? interaction.user.username;
      const embed = await buildUserStatsEmbed(interaction.guildId, interaction.user.id, displayName);
      await interaction.editReply(brandEditReplyOptions({ embeds: [embed] }));
    } catch (error) {
      logger.error({ err: error, scope, userId: interaction.user.id }, 'Error al obtener estadisticas de mensajes.');
      await interaction.editReply(
        brandEditReplyOptions({
          embeds: [
            embedFactory.error({
              title: 'No se pudieron cargar las estadisticas',
              description: 'Ocurrio un error inesperado. Intentalo nuevamente mas tarde.',
            }),
          ],
        }),
      );
    }
  },
};

