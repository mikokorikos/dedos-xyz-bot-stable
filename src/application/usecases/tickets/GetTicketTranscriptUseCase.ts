// =============================================================================
// RUTA: src/application/usecases/tickets/GetTicketTranscriptUseCase.ts
// =============================================================================

import type { Logger } from 'pino';

import type { TicketTranscript } from '@/domain/entities/TicketTranscript';
import type { ITicketTranscriptRepository } from '@/domain/repositories/ITicketTranscriptRepository';
import { ValidationFailedError } from '@/shared/errors/domain.errors';

interface GetTicketTranscriptParams {
  readonly channelId?: string;
  readonly transcriptId?: string;
}

export class GetTicketTranscriptUseCase {
  public constructor(
    private readonly transcriptRepository: ITicketTranscriptRepository,
    private readonly logger: Logger,
  ) {}

  public async execute({
    channelId,
    transcriptId,
  }: GetTicketTranscriptParams): Promise<TicketTranscript> {
    if (!channelId && !transcriptId) {
      throw new ValidationFailedError({
        transcript: 'Debes proporcionar el canal o el identificador de la transcripción.',
      });
    }

    if (transcriptId) {
      const transcript = await this.transcriptRepository.findByTranscriptId(transcriptId);

      if (!transcript) {
        this.logger.warn({ transcriptId }, 'No se encontró transcripción con el identificador solicitado.');

        throw new ValidationFailedError({
          transcript: 'No existe ninguna transcripción con el identificador proporcionado.',
        });
      }

      return transcript;
    }

    const numericChannelId = BigInt(channelId!);

    const transcript = await this.transcriptRepository.findByChannelId(numericChannelId);
    if (!transcript) {
      this.logger.warn({ channelId }, 'No se encontró transcripción asociada al canal.');

      throw new ValidationFailedError({
        transcript: 'Este ticket aún no tiene una transcripción registrada.',
      });
    }

    return transcript;
  }
}
