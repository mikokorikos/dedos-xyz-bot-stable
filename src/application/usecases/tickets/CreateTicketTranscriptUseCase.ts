// =============================================================================
// RUTA: src/application/usecases/tickets/CreateTicketTranscriptUseCase.ts
// =============================================================================

import { randomUUID } from 'node:crypto';

import type { Logger } from 'pino';

import type { TicketTranscriptMessage } from '@/domain/entities/TicketTranscript';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import type { ITicketTranscriptRepository } from '@/domain/repositories/ITicketTranscriptRepository';
import { ValidationFailedError } from '@/shared/errors/domain.errors';

interface CreateTicketTranscriptParams {
  readonly channelId: string;
  readonly actorId: string;
  readonly messages?: readonly TicketTranscriptMessage[];
}

interface CreateTicketTranscriptResult {
  readonly transcriptId: string;
  readonly ticketId: number;
  readonly created: boolean;
}

const generateTranscriptId = async (
  repository: ITicketTranscriptRepository,
): Promise<string> => {
  let attempts = 0;

  while (attempts < 5) {
    const id = `TCK-${randomUUID().replace(/-/gu, '').slice(0, 10).toUpperCase()}`;
    const existing = await repository.findByTranscriptId(id);

    if (!existing) {
      return id;
    }

    attempts += 1;
  }

  throw new Error('No se pudo generar un identificador único para la transcripción del ticket.');
};

export class CreateTicketTranscriptUseCase {
  public constructor(
    private readonly ticketRepository: ITicketRepository,
    private readonly transcriptRepository: ITicketTranscriptRepository,
    private readonly logger: Logger,
  ) {}

  public async execute({
    channelId,
    actorId,
    messages,
  }: CreateTicketTranscriptParams): Promise<CreateTicketTranscriptResult> {
    const numericChannelId = BigInt(channelId);

    const ticket = await this.ticketRepository.findByChannelId(numericChannelId);
    if (!ticket) {
      this.logger.warn(
        { channelId, actorId },
        'Se intentó crear una transcripción en un canal sin ticket asociado.',
      );

      throw new ValidationFailedError({
        ticket: 'Este canal no pertenece a un ticket registrado.',
      });
    }

    const existing = await this.transcriptRepository.findByTicketId(ticket.id);
    if (existing) {
      return {
        transcriptId: existing.id,
        ticketId: ticket.id,
        created: false,
      };
    }

    const transcriptId = await generateTranscriptId(this.transcriptRepository);

    const transcript = await this.transcriptRepository.create({
      ticketId: ticket.id,
      transcriptId,
      channelId: ticket.channelId,
      messages: messages ? [...messages] : [],
    });

    this.logger.info(
      { channelId, actorId, transcriptId, ticketId: ticket.id },
      'Transcripción de ticket creada correctamente.',
    );

    return {
      transcriptId: transcript.id,
      ticketId: transcript.ticketId,
      created: true,
    };
  }
}
