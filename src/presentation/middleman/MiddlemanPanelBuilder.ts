// ============================================================================
// RUTA: src/presentation/middleman/MiddlemanPanelBuilder.ts
// ============================================================================

import {
  ActionRowBuilder,
  type EmbedBuilder,
  type InteractionReplyOptions,
  type MessageCreateOptions,
  StringSelectMenuBuilder,
} from 'discord.js';

import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { brandMessageOptions, brandReplyOptions } from '@/shared/utils/branding';

export const MIDDLEMAN_PANEL_MENU_ID = 'middleman:panel:menu';

type MiddlemanPanelPayload = Pick<InteractionReplyOptions, 'embeds' | 'components' | 'allowedMentions'>;

const buildMiddlemanPanelPayload = (): MiddlemanPanelPayload => {
  const embed = embedFactory.info({
    title: '🛡️ Middleman Dedos Shop',
    description:
      [
        'Asegura tus trades utilizando el equipo oficial de middleman.',
        'Selecciona una opción para conocer el flujo o abrir tu ticket de middleman.',
      ].join('\n'),
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(MIDDLEMAN_PANEL_MENU_ID)
    .setPlaceholder('Selecciona una opción')
    .addOptions(
      { label: 'Cómo funciona', value: 'info', emoji: '📖' },
      { label: 'Abrir middleman', value: 'open', emoji: '🛠️' },
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    allowedMentions: { parse: [] as const },
  };
};

export const buildMiddlemanPanelMessage = (): MessageCreateOptions =>
  brandMessageOptions(buildMiddlemanPanelPayload());

export const buildMiddlemanPanelReply = (): InteractionReplyOptions =>
  brandReplyOptions(buildMiddlemanPanelPayload());

export const buildMiddlemanInfoEmbed = (): EmbedBuilder =>
  embedFactory.info({
    title: '📖 ¿Cómo funciona el middleman?',
    description: [
      '1. Completa el formulario indicando con quién realizarás el trade y los detalles del acuerdo.',
      '2. Ambos traders registran sus datos y confirman cuando estén listos.',
      '3. Al confirmar, se notifica al equipo middleman para que supervise el intercambio.',
      '4. Usa el botón **Pedir ayuda** si necesitas asistencia adicional durante el proceso.',
    ].join('\n'),
  });
