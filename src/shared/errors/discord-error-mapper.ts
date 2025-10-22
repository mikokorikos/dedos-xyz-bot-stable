// ============================================================================
// RUTA: src/shared/errors/discord-error-mapper.ts
// ============================================================================

import { randomUUID } from 'node:crypto';

import type { InteractionReplyOptions } from 'discord.js';
import { MessageFlags } from 'discord.js';

import { type DedosError, isDedosError } from '@/shared/errors/base.error';

import { buildDiscordErrorEmbed } from './errorEmbeds';

const GENERIC_MESSAGE = 'Ha ocurrido un error inesperado. Nuestro equipo ya fue notificado.';

export interface DiscordErrorResponse extends InteractionReplyOptions {
  readonly shouldLogStack: boolean;
  readonly referenceId: string;
}

const resolveMessage = (error: DedosError | unknown): { message: string; expose: boolean } => {
  if (isDedosError(error)) {
    return { message: error.message, expose: error.exposeMessage };
  }

  const unknownError = error as Partial<DedosError> | undefined;
  if (typeof unknownError?.message === 'string') {
    return { message: unknownError.message, expose: false };
  }

  return { message: GENERIC_MESSAGE, expose: false };
};

export const mapErrorToDiscordResponse = (error: unknown): DiscordErrorResponse => {
  const referenceId = randomUUID();
  const { message, expose } = resolveMessage(error);

  const description = expose ? message : GENERIC_MESSAGE;
  const shouldLogStack = isDedosError(error) ? !error.exposeMessage : true;

  return {
    embeds: [buildDiscordErrorEmbed('Ha ocurrido un problema', description, referenceId)],
    flags: MessageFlags.Ephemeral,
    shouldLogStack,
    referenceId,
  };
};
