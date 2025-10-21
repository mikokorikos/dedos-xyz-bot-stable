// =============================================================================
// RUTA: src/application/usecases/tickets/RecordTicketTranscriptMessageUseCase.ts
// =============================================================================

import type { Logger } from 'pino';

import type { TicketTranscriptMessage } from '@/domain/entities/TicketTranscript';
import type { ITicketTranscriptRepository } from '@/domain/repositories/ITicketTranscriptRepository';

interface RecordTicketTranscriptMessageParams {
  readonly channelId: string;
  readonly message: TicketTranscriptMessage;
}

interface RecordTicketTranscriptMessageResult {
  readonly recorded: boolean;
  readonly transcriptId: string | null;
}

export class RecordTicketTranscriptMessageUseCase {
  public constructor(
    private readonly transcriptRepository: ITicketTranscriptRepository,
    private readonly logger: Logger,
  ) {}

  public async execute({
    channelId,
    message,
  }: RecordTicketTranscriptMessageParams): Promise<RecordTicketTranscriptMessageResult> {
    const numericChannelId = BigInt(channelId);

    const transcript = await this.transcriptRepository.findByChannelId(numericChannelId);
    if (!transcript) {
      return { recorded: false, transcriptId: null };
    }

    const appended = transcript.appendMessages([message]);

    if (appended === 0) {
      return { recorded: false, transcriptId: transcript.id };
    }

    await this.transcriptRepository.save(transcript);

    this.logger.debug(
      { channelId, messageId: message.id, transcriptId: transcript.id },
      'Mensaje registrado en la transcripción del ticket.',
    );

    return { recorded: true, transcriptId: transcript.id };
  }
}
