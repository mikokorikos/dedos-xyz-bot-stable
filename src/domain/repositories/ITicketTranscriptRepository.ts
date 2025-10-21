// =============================================================================
// RUTA: src/domain/repositories/ITicketTranscriptRepository.ts
// =============================================================================

import type {
  TicketTranscript,
  TicketTranscriptMessage,
} from '@/domain/entities/TicketTranscript';

export interface CreateTicketTranscriptData {
  readonly ticketId: number;
  readonly transcriptId: string;
  readonly channelId: bigint;
  readonly messages: readonly TicketTranscriptMessage[];
}

export interface ITicketTranscriptRepository {
  create(data: CreateTicketTranscriptData): Promise<TicketTranscript>;
  findByTicketId(ticketId: number): Promise<TicketTranscript | null>;
  findByChannelId(channelId: bigint): Promise<TicketTranscript | null>;
  findByTranscriptId(transcriptId: string): Promise<TicketTranscript | null>;
  save(transcript: TicketTranscript): Promise<void>;
}
