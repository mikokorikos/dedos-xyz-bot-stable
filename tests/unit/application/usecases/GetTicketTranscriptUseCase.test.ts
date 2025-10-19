import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GetTicketTranscriptUseCase } from '@/application/usecases/tickets/GetTicketTranscriptUseCase';
import { TicketTranscript } from '@/domain/entities/TicketTranscript';
import type { ITicketTranscriptRepository } from '@/domain/repositories/ITicketTranscriptRepository';
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

const transcript = TicketTranscript.fromPrimitives({
  id: 'TCK-XYZ999',
  ticketId: 50,
  channelId: BigInt('8080'),
  createdAt: new Date('2024-01-05T00:00:00.000Z'),
  updatedAt: new Date('2024-01-05T00:00:00.000Z'),
  messages: [],
});

class StubTranscriptRepository implements ITicketTranscriptRepository {
  public store = new Map<string, TicketTranscript>();

  public async create(): Promise<TicketTranscript> {
    throw new Error('not implemented');
  }

  public async findByTicketId(): Promise<TicketTranscript | null> {
    return [...this.store.values()][0] ?? null;
  }

  public async findByChannelId(channelId: bigint): Promise<TicketTranscript | null> {
    return [...this.store.values()].find((item) => item.channelId === channelId) ?? null;
  }

  public async findByTranscriptId(transcriptId: string): Promise<TicketTranscript | null> {
    return this.store.get(transcriptId) ?? null;
  }

  public async save(): Promise<void> {}
}

describe('GetTicketTranscriptUseCase', () => {
  let repository: StubTranscriptRepository;
  let logger: Logger;
  let useCase: GetTicketTranscriptUseCase;

  beforeEach(() => {
    repository = new StubTranscriptRepository();
    repository.store.set(transcript.id, transcript);
    logger = createLogger();
    useCase = new GetTicketTranscriptUseCase(repository, logger);
  });

  it('obtiene la transcripción por identificador', async () => {
    const result = await useCase.execute({ transcriptId: 'TCK-XYZ999' });

    expect(result.id).toBe('TCK-XYZ999');
  });

  it('obtiene la transcripción por canal cuando no se especifica ID', async () => {
    const result = await useCase.execute({ channelId: '8080' });

    expect(result.ticketId).toBe(50);
  });

  it('lanza error si no encuentra la transcripción solicitada', async () => {
    await expect(useCase.execute({ transcriptId: 'TCK-NOPE' })).rejects.toBeInstanceOf(
      ValidationFailedError,
    );
  });

  it('exige al menos un parámetro de búsqueda', async () => {
    await expect(useCase.execute({})).rejects.toBeInstanceOf(ValidationFailedError);
  });
});
