// =============================================================================
// RUTA: src/presentation/embeds/verificationEmbeds.ts
// =============================================================================

import { embedFactory } from '@/presentation/embeds/EmbedFactory';

interface VerificationCompleteOptions {
  readonly helpCenterUrl?: string | null;
  readonly communityUrl?: string | null;
  readonly memberId?: string;
}

export const buildVerificationRulesEmbed = (): ReturnType<typeof embedFactory.info> =>
  embedFactory.info({
    title: '🎮 Reglas del Servidor',
    description:
      'Antes de participar en nuestra comunidad, asegúrate de leer cuidadosamente estas reglas. El cumplimiento garantiza una convivencia sana y una experiencia divertida para todos. ✅',
    fields: [
      {
        name: '📋 Reglas Generales',
        value:
          '**1. Respeto básico**\n' +
          '• Insultos casuales permitidos dentro del contexto de broma.\n' +
          '• Prohibido el acoso persistente, amenazas graves o ataques personales.\n' +
          '• Estrictamente prohibido el doxxing o compartir datos personales.\n\n' +
          '**2. Convivencia**\n' +
          '• Usa cada canal según su propósito.\n' +
          '• Respeta a moderadores y sus decisiones.\n' +
          '• Si surge un conflicto, resuélvelo en privado o pide mediación a un mod.',
      },
      {
        name: '🛒 Trading e Intercambios',
        value:
          '• Puedes tradear **cualquier ítem, cuenta o servicio gaming** en el canal de trading.\n' +
          '• **Trading con MM oficial:** protegido y regulado.\n' +
          '• **Trading directo:** bajo tu propio riesgo. No nos hacemos responsables de estafas.\n' +
          '• Prohibido el comercio de cuentas robadas o contenido ilegal.\n' +
          '• Para usar el MM oficial, contacta a un moderador.',
      },
      {
        name: '🚫 Contenido Prohibido',
        value:
          '**4. NSFW**\n' +
          '• Prohibido cualquier contenido sexual explícito, incluyendo avatares y nombres.\n\n' +
          '**5. Spam y Flood**\n' +
          '• No repitas mensajes ni hagas menciones masivas.\n' +
          '• Evita flood de imágenes, stickers o emojis.\n' +
          '• Máximo **5 mensajes seguidos** sin respuesta de otros.\n\n' +
          '**6. Contenido Malicioso**\n' +
          '• Prohibido compartir virus, malware, IP grabbers o links peligrosos.\n' +
          '• No publiques phishing o estafas. Reporta cualquier link sospechoso.',
      },
      {
        name: '⚖️ Sistema de Sanciones',
        value:
          '• **1ra vez:** Advertencia verbal.\n' +
          '• **2da vez:** Timeout temporal (1–24h).\n' +
          '• **3ra vez:** Expulsión (Kick).\n' +
          '• **Casos graves:** Ban inmediato (ej. doxxing, malware, amenazas serias).',
      },
    ],
    footer: 'Básicamente: diviértete, comercia y sé respetuoso. No arruines la experiencia.',
  });

export const buildVerificationCompletedEmbed = (
  options: VerificationCompleteOptions,
): ReturnType<typeof embedFactory.info> =>
  embedFactory.info({
    title: '✅ ¡Verificación completada!',
    description: [
      options.memberId ? `¡Gracias por verificarte, <@${options.memberId}>!` : '¡Gracias por verificarte!',
      'Ya tienes acceso completo al servidor.',
      options.helpCenterUrl && options.helpCenterUrl.length > 0
        ? `Si necesitas ayuda, visita ${options.helpCenterUrl}.`
        : options.communityUrl
          ? `Si necesitas ayuda, visita ${options.communityUrl}.`
          : undefined,
    ]
      .filter(Boolean)
      .join('\n'),
    footer: options.communityUrl ? `Bienvenido a ${options.communityUrl}` : undefined,
  });

export const buildVerificationHelpEmbed = (link: string): ReturnType<typeof embedFactory.info> =>
  embedFactory.info({
    title: 'Verificación',
    description: [
      'Para verificarte, reacciona con la ✅ en el mensaje de reglas.',
      `Puedes abrirlo directamente aquí: ${link}`,
    ].join('\n'),
  });

export const buildVerificationServicesHelpEmbed = (): ReturnType<typeof embedFactory.info> =>
  embedFactory.info({
    title: '¿Qué puedo hacer en el servidor?',
    description: [
      'Estas son las principales actividades dentro del servidor:',
      '',
      '- Participa en eventos y gana recompensas por tu actividad.',
      '- Usa nuestro middleman oficial sin propinas obligatorias.',
      '- Compra en la tienda con los mejores precios del mercado.',
      '- Convive, tradea y aporta sugerencias para seguir creciendo.',
    ].join('\n'),
  });

export const buildVerificationTicketsHelpEmbed = (): ReturnType<typeof embedFactory.info> =>
  embedFactory.info({
    title: 'Eventos y premios',
    description:
      'Los eventos son dinámicas especiales que premian a los usuarios más activos del servidor.\n\n' +
      '**Siempre hay eventos en curso.**\n\n' +
      'Para ver los eventos actuales:\n' +
      '- Revisa el canal de anuncios (desbloqueado tras verificarte).\n' +
      '- Encontrarás toda la información: reglas, fechas, cómo participar y premios.',
  });
