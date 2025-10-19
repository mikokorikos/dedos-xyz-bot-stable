import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateTicketTranscriptUseCase } from '@/application/usecases/tickets/CreateTicketTranscriptUseCase';
import { Ticket } from '@/domain/entities/Ticket';
import {
  TicketTranscript,
  type TicketTranscriptMessage,
} from '@/domain/entities/TicketTranscript';
import { TicketStatus, TicketType } from '@/domain/entities/types';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import type {
  CreateTicketTranscriptData,
  ITicketTranscriptRepository,
} from '@/domain/repositories/ITicketTranscriptRepository';
import { ValidationFailedError } from '@/shared/errors/domain.errors';

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

class StubTicketRepository implements ITicketRepository {
  public ticket: Ticket | null = null;

  public withTransaction(): ITicketRepository {
    return this;
  }

  public async create(): Promise<Ticket> {
    throw new Error('not implemented');
  }

  public async findById(): Promise<Ticket | null> {
    return this.ticket;
  }

  public async findByChannelId(channelId: bigint): Promise<Ticket | null> {
    if (!this.ticket || this.ticket.channelId !== channelId) {
      return null;
    }

    return this.ticket;
  }

  public async findOpenByOwner(): Promise<readonly Ticket[]> {
    return [];
  }

  public async update(): Promise<void> {}

  public async delete(): Promise<void> {}

  public async countOpenByOwner(): Promise<number> {
    return 0;
  }

  public async isParticipant(): Promise<boolean> {
    return false;
  }

  public async listParticipants(): Promise<readonly never[]> {
    return [];
  }
}

class StubTicketTranscriptRepository implements ITicketTranscriptRepository {
  public createdPayload: CreateTicketTranscriptData | null = null;
  public transcript: TicketTranscript | null = null;

  public async create(data: CreateTicketTranscriptData): Promise<TicketTranscript> {
    this.createdPayload = data;
    this.transcript = TicketTranscript.fromPrimitives({
      id: data.transcriptId,
      ticketId: data.ticketId,
      channelId: data.channelId,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      messages: data.messages.map((message) => ({
        ...message,
        createdAt: message.createdAt.toISOString(),
      })),
    });

    return this.transcript;
  }

  public async findByTicketId(): Promise<TicketTranscript | null> {
    return this.transcript;
  }

  public async findByChannelId(): Promise<TicketTranscript | null> {
    return this.transcript;
  }

  public async findByTranscriptId(transcriptId: string): Promise<TicketTranscript | null> {
    if (!this.transcript || this.transcript.id !== transcriptId) {
      return null;
    }

    return this.transcript;
  }

  public async save(): Promise<void> {}
}

const createMessage = (id: string, content: string): TicketTranscriptMessage => ({
  id,
  authorId: '1234',
  authorTag: 'tester#0001',
  authorDisplayName: 'Tester',
  authorAvatarUrl: 'https://cdn.example/avatar.png',
  content,
  createdAt: new Date('2024-05-05T10:00:00.000Z'),
  attachments: [],
  referencedMessageId: null,
});

describe('CreateTicketTranscriptUseCase', () => {
  let ticketRepository: StubTicketRepository;
  let transcriptRepository: StubTicketTranscriptRepository;
  let useCase: CreateTicketTranscriptUseCase;
  let logger: Logger;

  beforeEach(() => {
    ticketRepository = new StubTicketRepository();
    transcriptRepository = new StubTicketTranscriptRepository();
    logger = createLogger();
    useCase = new CreateTicketTranscriptUseCase(ticketRepository, transcriptRepository, logger);
    ticketRepository.ticket = new Ticket(
      10,
      BigInt(1),
      BigInt('999'),
      BigInt('321'),
      TicketType.BUY,
      TicketStatus.OPEN,
      new Date('2024-01-01T00:00:00.000Z'),
    );
  });

  it('crea una nueva transcripción cuando no existe', async () => {
    const result = await useCase.execute({
      channelId: '999',
      actorId: '777',
      messages: [createMessage('m1', 'hola')],
    });

    expect(result.created).toBe(true);
    expect(result.ticketId).toBe(10);
    expect(result.transcriptId).toMatch(/^TCK-/u);
    expect(transcriptRepository.createdPayload?.messages).toHaveLength(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: '999',
        actorId: '777',
        ticketId: 10,
      }),
      'Transcripción de ticket creada correctamente.',
    );
  });

  it('devuelve la transcripción existente si ya fue creada', async () => {
    await useCase.execute({ channelId: '999', actorId: '111', messages: [] });

    const result = await useCase.execute({ channelId: '999', actorId: '222', messages: [] });

    expect(result.created).toBe(false);
    expect(result.transcriptId).toBe(transcriptRepository.transcript?.id);
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it('lanza error de validación cuando el canal no pertenece a un ticket', async () => {
    ticketRepository.ticket = null;

    await expect(
      useCase.execute({ channelId: '999', actorId: '000', messages: [] }),
    ).rejects.toBeInstanceOf(ValidationFailedError);
  });
});
