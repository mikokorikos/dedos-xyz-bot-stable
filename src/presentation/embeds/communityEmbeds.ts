// =============================================================================
// RUTA: src/presentation/embeds/communityEmbeds.ts
// =============================================================================

import { EmbedBuilder } from 'discord.js';

import { applyDedosBrand } from '@/shared/utils/branding';

const ROBUX_WARNING_DESCRIPTION =
  'Recuerda que si te tradean algo por robux puedes ser estafado por el metodo de rembolso, ten mucho cuidado, no trades por robux con alguien que no sea de confianza. Recomendaciones:\n<a:51047animatedarrowwhite:1417021879411281992> ESTO NO SIGNIFICA QUE TE VAYAN A ESTAFAR PERO ES PARA QUE TOMES TUS PRECAUCIONES PORQUE NINGUN MIDLEMAN PUEDE SALVARTE DE ESTAS ESTAFAS';

const ROBUX_WARNING_ICON_URL =
  'https://cdn.discordapp.com/attachments/1412699909949358151/1428573126576574585/image.png?ex=68f2fde6&is=68f1ac66&hm=30933d8ec4fe981a86fb4b05b0dd79d14a04f49fd9a69bc2e7c6282f39fa6d0e&';

export const buildRobuxWarningEmbed = (): EmbedBuilder => {
  const embed = new EmbedBuilder()
    .setTitle('ADVERTENCIA DE ESTAFA')
    .setDescription(ROBUX_WARNING_DESCRIPTION)
    .setAuthor({ name: 'dedos.xyz', iconURL: ROBUX_WARNING_ICON_URL })
    .setFooter({ text: 'dedos.xyz', iconURL: ROBUX_WARNING_ICON_URL });

  return applyDedosBrand(embed, { color: 0x7406bf });
};

