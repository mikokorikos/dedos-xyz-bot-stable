// =============================================================================
// RUTA: src/presentation/embeds/messageStatsEmbeds.ts
// =============================================================================

import type { ChannelMessageStatsResult } from '@/application/usecases/messages/GetChannelMessageStatsUseCase';
import type { UserMessageStatsResult } from '@/application/usecases/messages/GetUserMessageStatsUseCase';
import type { MessageCountTotal } from '@/domain/repositories/IMessageCountRepository';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';

const numberFormatter = new Intl.NumberFormat('es-MX');
const percentageFormatter = new Intl.NumberFormat('es-MX', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const formatChannelBreakdown = (
  entries: ReadonlyArray<{ channelId: bigint; total: number }>,
): string => {
  if (entries.length === 0) {
    return 'No registramos mensajes para este usuario.';
  }

  return entries
    .map((entry) => `• <#${entry.channelId.toString()}> — ${numberFormatter.format(entry.total)} mensajes`)
    .join('\n');
};

const formatLeaderboard = (entries: ReadonlyArray<MessageCountTotal>): string => {
  if (entries.length === 0) {
    return 'Todavía no hay mensajes registrados.';
  }

  return entries
    .map(
      (entry, index) =>
        `${index + 1}. <@${entry.userId.toString()}> — ${numberFormatter.format(entry.total)} mensajes`,
    )
    .join('\n');
};

export const buildUserStatsEmbed = (
  payload: {
    readonly displayName: string;
    readonly stats: UserMessageStatsResult;
  },
): ReturnType<typeof embedFactory.info> => {
  const { stats, displayName } = payload;
  const share = stats.guildTotal > 0 ? (stats.total / stats.guildTotal) * 100 : 0;
  const rankValue = stats.rank ? `#${stats.rank}` : 'Sin posición disponible';

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
      name: 'Participación',
      value:
        stats.guildTotal > 0
          ? `${percentageFormatter.format(share)}% del total (${numberFormatter.format(stats.guildTotal)} mensajes)`
          : 'Sin datos registrados en el servidor.',
      inline: true,
    },
    {
      name: 'Posición actual',
      value: rankValue,
      inline: true,
    },
  );

  embed.addFields({
    name: 'Canales más activos',
    value: formatChannelBreakdown(stats.topChannels),
  });

  return embed;
};

export const buildLeaderboardEmbed = (
  payload: { readonly entries: ReadonlyArray<MessageCountTotal> },
): ReturnType<typeof embedFactory.info> => {
  const embed = embedFactory.info({
    title: '🏆 Usuarios más activos',
    description: 'Ranking global de mensajes en Dedos.xyz. Se actualiza automáticamente con cada mensaje.',
  });

  embed.addFields({
    name: 'Top 10',
    value: formatLeaderboard(payload.entries),
  });

  return embed;
};

export const buildChannelStatsEmbed = (
  payload: { readonly channelId: string; readonly stats: ChannelMessageStatsResult },
): ReturnType<typeof embedFactory.info> => {
  const embed = embedFactory.info({
    title: `Actividad en <#${payload.channelId}>`,
    description: `Se registraron ${numberFormatter.format(payload.stats.total)} mensajes en este canal.`,
  });

  embed.addFields({
    name: 'Participantes destacados',
    value: formatLeaderboard(payload.stats.topUsers),
  });

  return embed;
};

