// ============================================================================
// RUTA: src/presentation/commands/stats/stats.ts
// ============================================================================

import type { Message, User } from 'discord.js';
import {
  type AttachmentBuilder,
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

import { GetMemberStatsUseCase } from '@/application/usecases/stats/GetMemberStatsUseCase';
import type { MemberTradeStats } from '@/domain/entities/MemberTradeStats';
import { prisma } from '@/infrastructure/db/prisma';
import { memberCardGenerator } from '@/infrastructure/external/MemberCardGenerator';
import { PrismaMemberStatsRepository } from '@/infrastructure/repositories/PrismaMemberStatsRepository';
import { PrismaMiddlemanRepository } from '@/infrastructure/repositories/PrismaMiddlemanRepository';
import { PrismaWarnRepository } from '@/infrastructure/repositories/PrismaWarnRepository';
import type { Command } from '@/presentation/commands/types';
import { registerSelectMenuHandler } from '@/presentation/components/registry';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { buildStatsPanelMessage, STATS_PANEL_MENU_ID } from '@/presentation/stats/StatsPanelBuilder';
import { env } from '@/shared/config/env';
import { logger } from '@/shared/logger/pino';
import { brandEditReplyOptions, brandMessageOptions, brandReplyOptions } from '@/shared/utils/branding';

const statsRepository = new PrismaMemberStatsRepository(prisma);
const middlemanRepository = new PrismaMiddlemanRepository(prisma);
const warnRepository = new PrismaWarnRepository(prisma);
const getStatsUseCase = new GetMemberStatsUseCase(statsRepository, middlemanRepository, warnRepository);

const USER_ID_PATTERN = /^(?:<@!?(\d{17,20})>|(\d{17,20}))$/u;

const parseUserId = (raw: string | undefined): string | null => {
  if (!raw) {
    return null;
  }

  const match = raw.match(USER_ID_PATTERN);
  if (!match) {
    return null;
  }

  return match[1] ?? match[2] ?? null;
};

const formatLeaderboard = (leaderboard: readonly MemberTradeStats[]): string =>
  leaderboard
    .map((entry, index) => `${index + 1}. <@${entry.userId}> - ${entry.tradesCompleted} trades`)
    .join('\n');

const buildMemberStatsPayload = async (
  target: User,
  requester: User,
): Promise<{ embed: ReturnType<typeof embedFactory.stats>; files: AttachmentBuilder[] }> => {
  const { stats, leaderboard } = await getStatsUseCase.execute(BigInt(target.id));
  const displayName = target.globalName ?? target.username ?? target.tag;
  const card = await memberCardGenerator.render(stats, displayName);

  const embed = embedFactory.stats({
    title: `Resumen de ${displayName}`,
    stats: stats.summary(),
  });

  const leaderboardLines = formatLeaderboard(leaderboard);

  embed.addFields({
    name: 'Top traders',
    value: leaderboardLines || 'Sin datos suficientes.',
  });

  if (target.id !== requester.id) {
    embed.setFooter({ text: `Solicitado por ${requester.tag}` });
  }

  const files: AttachmentBuilder[] = [];
  if (card) {
    files.push(card);
  }

  return { embed, files };
};

const resolveTargetUserFromMessage = async (message: Message, rawTarget?: string): Promise<User> => {
  const mentioned = message.mentions.users.first();
  if (mentioned) {
    return mentioned;
  }

  const parsedId = parseUserId(rawTarget);
  if (parsedId) {
    try {
      return await message.client.users.fetch(parsedId);
    } catch (error) {
      logger.warn({ err: error, userId: parsedId }, 'No se pudo obtener el usuario solicitado para stats.');
    }
  }

  return message.author;
};

const buildLeaderboardEmbed = (leaderboard: readonly MemberTradeStats[]) =>
  embedFactory.info({
    title: '🏆 Top traders',
    description: formatLeaderboard(leaderboard) || 'Sin datos suficientes.',
  });

registerSelectMenuHandler(STATS_PANEL_MENU_ID, async (interaction) => {
  const [value] = interaction.values;

  if (!value) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.warning({
            title: 'Opcion no valida',
            description: 'Selecciona una opcion disponible para continuar.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return;
  }

  if (!interaction.guild) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.error({
            title: 'Accion no disponible',
            description: 'Este panel solo puede utilizarse dentro de un servidor de Discord.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return;
  }

  if (value === 'self') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const payload = await buildMemberStatsPayload(interaction.user, interaction.user);

      await interaction.editReply(
        brandEditReplyOptions({
          embeds: [payload.embed],
          files: payload.files,
        }),
      );
    } catch (error) {
      logger.error({ err: error, userId: interaction.user.id }, 'Error al obtener estadisticas desde el panel.');
      await interaction.editReply(
        brandEditReplyOptions({
          embeds: [
            embedFactory.error({
              title: 'No se pudieron cargar las estadisticas',
              description: 'Intentalo nuevamente mas tarde.',
            }),
          ],
        }),
      );
    }
    return;
  }

  if (value === 'top') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const { leaderboard } = await getStatsUseCase.execute(BigInt(interaction.user.id));
      const embed = buildLeaderboardEmbed(leaderboard);

      await interaction.editReply(
        brandEditReplyOptions({
          embeds: [embed],
        }),
      );
    } catch (error) {
      logger.error({ err: error, userId: interaction.user.id }, 'Error al obtener el top de traders.');
      await interaction.editReply(
        brandEditReplyOptions({
          embeds: [
            embedFactory.error({
              title: 'No se pudo obtener el top',
              description: 'Ocurrio un problema al consultar el ranking.',
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
        embedFactory.warning({
          title: 'Opcion no disponible',
          description: 'La accion seleccionada no esta configurada en el panel.',
        }),
      ],
      flags: MessageFlags.Ephemeral,
    }),
  );
});


export const statsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Consulta estadisticas de comercio de un miembro')
    .addUserOption((option) =>
      option.setName('usuario').setDescription('Miembro a consultar').setRequired(false),
    ),
  category: 'General',
  examples: [
    '/stats',
    '/stats usuario:@Miembro',
    `${env.COMMAND_PREFIX}stats`,
    `${env.COMMAND_PREFIX}stats panel`,
  ],
  prefix: {
    name: 'stats',
    aliases: ['estadisticas'],
    async execute(message, args) {
      if (!message.guild) {
        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.error({
                title: 'Accion no disponible',
                description: 'Este comando solo puede usarse dentro de un servidor de Discord.',
              }),
            ],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      const [rawFirstArg] = args;

      if (rawFirstArg && rawFirstArg.toLowerCase() === 'panel') {
        const channel = message.channel;

        if (!channel || channel.type !== ChannelType.GuildText) {
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

        const panel = buildStatsPanelMessage();
        await channel.send(panel);
        return;
      }

      try {
        const target = await resolveTargetUserFromMessage(message, rawFirstArg);
        const payload = await buildMemberStatsPayload(target, message.author);

        await message.reply(
          brandMessageOptions({
            embeds: [payload.embed],
            files: payload.files,
            allowedMentions: { repliedUser: false },
          }),
        );
      } catch (error) {
        logger.error({ err: error, userId: message.author.id }, 'Error al consultar estadisticas con prefijo.');
        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.error({
                title: 'No se pudieron obtener las estadisticas',
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
    const target = interaction.options.getUser('usuario') ?? interaction.user;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const payload = await buildMemberStatsPayload(target, interaction.user);

      await interaction.editReply(
        brandEditReplyOptions({
          embeds: [payload.embed],
          files: payload.files,
        }),
      );
    } catch (error) {
      logger.error({ err: error, userId: interaction.user.id }, 'Error al consultar estadisticas del miembro.');
      await interaction.editReply(
        brandEditReplyOptions({
          embeds: [
            embedFactory.error({
              title: 'No se pudieron obtener las estadisticas',
              description: 'Ocurrio un problema al consultar la informacion. Intentalo mas tarde.',
            }),
          ],
        }),
      );
    }
  },
};
