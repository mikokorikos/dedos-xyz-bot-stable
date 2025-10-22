// =============================================================================
// RUTA: src/shared/debug/debugEmbeds.ts
// =============================================================================

import { EmbedBuilder } from 'discord.js';

import { COLORS } from '@/shared/config/constants';
import { applyDedosBrand } from '@/shared/utils/branding';

export const buildVerboseDebugEmbed = (description: string): EmbedBuilder =>
  applyDedosBrand(
    new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle('Depuración interactiva')
      .setDescription(description),
  );
