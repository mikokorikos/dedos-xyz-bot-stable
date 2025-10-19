import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecordTicketTranscriptMessageUseCase } from '@/application/usecases/tickets/RecordTicketTranscriptMessageUseCase';
import {
  TicketTranscript,
  type TicketTranscriptMessage,
} from '@/domain/entities/TicketTranscript';
import type { ITicketTranscriptRepository } from '@/domain/repositories/ITicketTranscriptRepository';

const createLogger = (): Logger =>
  ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'silent',
  } as unknown as Logger);

const buildTranscript = (messages: TicketTranscriptMessage[] = []): TicketTranscript =>
  TicketTranscript.fromPrimitives({
    id: 'TCK-ABC123',
    ticketId: 90,
    channelId: BigInt('555'),
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    messages: messages.map((message) => ({
      ...message,
      createdAt: message.createdAt.toISOString(),
    })),
  });

const sampleMessage = (id: string): TicketTranscriptMessage => ({
  id,
  authorId: '4321',
  authorTag: 'tester#0002',
  authorDisplayName: 'Tester 2',
  authorAvatarUrl: null,
  content: 'Mensaje de prueba',
  createdAt: new Date('2024-06-01T12:00:00.000Z'),
  attachments: [],
  referencedMessageId: null,
});

class StubTranscriptRepository implements ITicketTranscriptRepository {
  public transcript: TicketTranscript | null = null;
  public saveCount = 0;

  public async create(): Promise<TicketTranscript> {
    throw new Error('not implemented');
  }

  public async findByTicketId(): Promise<TicketTranscript | null> {
    return this.transcript;
  }

  public async findByChannelId(channelId: bigint): Promise<TicketTranscript | null> {
    if (!this.transcript || this.transcript.channelId !== channelId) {
      return null;
    }

    return this.transcript;
  }

  public async findByTranscriptId(): Promise<TicketTranscript | null> {
    return this.transcript;
  }

  public async save(): Promise<void> {
    this.saveCount += 1;
  }
}

describe('RecordTicketTranscriptMessageUseCase', () => {
  let repository: StubTranscriptRepository;
  let logger: Logger;
  let useCase: RecordTicketTranscriptMessageUseCase;

  beforeEach(() => {
    repository = new StubTranscriptRepository();
    logger = createLogger();
    useCase = new RecordTicketTranscriptMessageUseCase(repository, logger);
  });

  it('omite mensajes cuando no existe una transcripción asociada', async () => {
    const result = await useCase.execute({
      channelId: '555',
      message: sampleMessage('m-1'),
    });

    expect(result).toEqual({ recorded: false, transcriptId: null });
    expect(repository.saveCount).toBe(0);
  });

  it('agrega el mensaje y guarda la transcripción', async () => {
    repository.transcript = buildTranscript();

    const result = await useCase.execute({
      channelId: '555',
      message: sampleMessage('m-2'),
    });

    expect(result).toEqual({ recorded: true, transcriptId: 'TCK-ABC123' });
    expect(repository.transcript?.getMessages()).toHaveLength(1);
    expect(repository.saveCount).toBe(1);
  });

  it('no duplica mensajes ya registrados', async () => {
    const message = sampleMessage('m-3');
    repository.transcript = buildTranscript([message]);

    const result = await useCase.execute({ channelId: '555', message });

    expect(result).toEqual({ recorded: false, transcriptId: 'TCK-ABC123' });
    expect(repository.transcript?.getMessages()).toHaveLength(1);
    expect(repository.saveCount).toBe(0);
  });
});
