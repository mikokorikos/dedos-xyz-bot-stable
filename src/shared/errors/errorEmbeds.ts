// =============================================================================
// RUTA: src/shared/errors/errorEmbeds.ts
// =============================================================================

import { EmbedBuilder } from 'discord.js';

import { COLORS, EMBED_LIMITS } from '@/shared/config/constants';
import { applyDedosBrand } from '@/shared/utils/branding';

export const buildDiscordErrorEmbed = (
  title: string,
  description: string,
  referenceId: string,
): EmbedBuilder =>
  applyDedosBrand(
    new EmbedBuilder()
      .setColor(COLORS.danger)
      .setTitle(title.slice(0, EMBED_LIMITS.title))
      .setDescription(
        `${description.slice(0, EMBED_LIMITS.description - 40)}\n\nCódigo de referencia: \`${referenceId}\``,
      )
      .setTimestamp(new Date()),
  );
