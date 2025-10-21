// =============================================================================
// RUTA: src/presentation/embeds/ticketEmbeds.ts
// =============================================================================

import type { EmbedBuilder } from 'discord.js';

import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { clampEmbedField } from '@/shared/utils/discord.utils';

export const formatTicketClosureReason = (reason: string): string => {
  const lines = reason
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return '> Sin detalles proporcionados.';
  }

  return lines.map((line) => (line.startsWith('>') ? line : `> ${line}`)).join('\n');
};

export const buildTicketClosureConfirmationEmbed = (reason: string): EmbedBuilder =>
  embedFactory.success({
    title: 'Ticket cerrado',
    description: 'Este canal se eliminará en 10 segundos.',
    fields: [
      {
        name: 'Motivo enviado',
        value: clampEmbedField(formatTicketClosureReason(reason)),
      },
    ],
  });

export const buildTicketClosureDMEmbed = (
  ticketId: number | null,
  reason: string,
): EmbedBuilder =>
  embedFactory.info({
    title: 'Tu ticket de soporte fue cerrado',
    description: ticketId
      ? `El equipo de Dedos.xyz cerró tu ticket #${ticketId}.`
      : 'El equipo de Dedos.xyz cerró tu ticket de soporte.',
    fields: [
      {
        name: 'Motivo del cierre',
        value: clampEmbedField(formatTicketClosureReason(reason)),
      },
    ],
  });

export const buildTicketNotAvailableEmbed = (): EmbedBuilder =>
  embedFactory.warning({
    title: 'Ticket no disponible',
    description: 'No se encontró información del ticket. Verifica que no haya sido eliminado o cerrado previamente.',
  });

export const buildTicketNotAvailableSlashEmbed = (): EmbedBuilder =>
  embedFactory.warning({
    title: 'Ticket no disponible',
    description: 'No se encontró información válida del ticket. Verifica que siga abierto.',
  });

export const buildTicketNotAvailablePrefixEmbed = (): EmbedBuilder =>
  embedFactory.warning({
    title: 'Ticket no disponible',
    description: 'No encontramos información del ticket. Verifica que no haya sido archivado.',
  });

export const buildTicketClosureFailedEmbed = (message: string): EmbedBuilder =>
  embedFactory.error({
    title: 'No se pudo cerrar el ticket',
    description: message,
  });

export const buildTicketClosureReasonRequiredEmbed = (): EmbedBuilder =>
  embedFactory.warning({
    title: 'Proporciona un motivo válido',
    description: 'Incluye una explicación breve del cierre (mínimo 5 caracteres).',
  });

export const buildTicketClosureUnexpectedErrorEmbed = (): EmbedBuilder =>
  buildTicketClosureFailedEmbed('Ocurrió un error inesperado al intentar cerrar el ticket.');
