// =============================================================================
// RUTA: src/presentation/embeds/welcomeEmbeds.ts
// =============================================================================

import { embedFactory } from '@/presentation/embeds/EmbedFactory';

const MEMBER_COUNT_FORMATTER = new Intl.NumberFormat('es-MX');

export interface WelcomeEmbedData {
  readonly memberId: string;
  readonly memberCount: number;
  readonly verificationLink: string;
  readonly inviteLink: string;
  readonly communityUrl?: string | null;
}

export const buildWelcomeEmbed = (
  data: WelcomeEmbedData,
): ReturnType<typeof embedFactory.info> => {
  const formattedMembers = MEMBER_COUNT_FORMATTER.format(data.memberCount);

  return embedFactory.info({
    title: '¡Bienvenido a dedos!',
    description: [
      `Hola <@${data.memberId}>, gracias por unirte 👋`,
      `Ahora somos **${formattedMembers}** miembros 🎉`,
      '',
      'Primero verifica para obtener acceso a los canales:',
      `[#verificación](${data.verificationLink}) • [#invitación](${data.inviteLink})`,
      '',
      'Aquí siempre tenemos eventos activos.',
      'Más info: consulta el canal de información del servidor.',
      'Soporte: usa el canal de ayuda.',
      '',
      'Este servidor es de **trades, middleman y ventas**.',
      '',
      '¡Disfruta tu estancia y no olvides invitar a tus amigos! 🙌',
    ].join('\n'),
    footer: data.communityUrl ? `Gracias por unirte a ${data.communityUrl}` : undefined,
  });
};
