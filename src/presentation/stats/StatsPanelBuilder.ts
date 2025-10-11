// ============================================================================
// RUTA: src/presentation/stats/StatsPanelBuilder.ts
// ============================================================================

import {
  ActionRowBuilder,
  type MessageCreateOptions,
  StringSelectMenuBuilder,
} from 'discord.js';

import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { brandMessageOptions } from '@/shared/utils/branding';

export const STATS_PANEL_MENU_ID = 'stats:panel:menu';

export const buildStatsPanelMessage = (): MessageCreateOptions => {
  const embed = embedFactory.info({
    title: '📊 Estadisticas de comercio',
    description:
      [
        'Consulta tu progreso como trader y descubre a los miembros mas activos.',
        'Usa el menu para ver tus estadisticas o el top de traders del servidor.',
      ].join('\n'),
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(STATS_PANEL_MENU_ID)
    .setPlaceholder('Selecciona una opcion')
    .addOptions(
      { label: 'Mis estadisticas', value: 'self', emoji: '🙋' },
      { label: 'Top traders', value: 'top', emoji: '🏆' },
    );

  return brandMessageOptions({
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    allowedMentions: { parse: [] as const },
  });
};
