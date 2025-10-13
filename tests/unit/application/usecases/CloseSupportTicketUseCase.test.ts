import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CloseSupportTicketUseCase } from '@/application/usecases/tickets/CloseSupportTicketUseCase';
import { Ticket } from '@/domain/entities/Ticket';
import { TicketStatus, TicketType } from '@/domain/entities/types';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';

class StubTicketRepository implements ITicketRepository {
  public ticket: Ticket | null = null;
  public updateShouldFail = false;
  public updatedTicket: Ticket | null = null;

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

  public async update(ticket: Ticket): Promise<void> {
    if (this.updateShouldFail) {
      throw new Error('update failed');
    }

    this.ticket = ticket;
    this.updatedTicket = ticket;
  }

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

describe('CloseSupportTicketUseCase', () => {
  let ticketRepo: StubTicketRepository;
  let logger: Logger;
  let useCase: CloseSupportTicketUseCase;

  beforeEach(() => {
    ticketRepo = new StubTicketRepository();
    logger = createLogger();
    useCase = new CloseSupportTicketUseCase(ticketRepo, logger);
  });

  const createTicket = (status: TicketStatus, channelId = '123'): Ticket =>
    new Ticket(
      1,
      BigInt(1),
      BigInt(channelId),
      BigInt(5),
      TicketType.BUY,
      status,
      new Date(),
    );

  it('registra advertencia cuando no encuentra el ticket', async () => {
    const result = await useCase.execute({ channelId: '123', actorId: '999' });

    expect(result).toEqual({ closed: false, ticketId: null });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: '123', actorId: '999' }),
      'No se encontró ticket asociado al canal al intentar cerrarlo.',
    );
  });

  it('cierra el ticket cuando ya puede cerrarse', async () => {
    ticketRepo.ticket = createTicket(TicketStatus.CLAIMED);

    const result = await useCase.execute({ channelId: '123', actorId: '321' });

    expect(result).toEqual({ closed: true, ticketId: 1 });
    expect(ticketRepo.ticket?.status).toBe(TicketStatus.CLOSED);
    expect(ticketRepo.updatedTicket).not.toBeNull();
  });

  it('confirma el ticket antes de cerrarlo cuando está abierto', async () => {
    ticketRepo.ticket = createTicket(TicketStatus.OPEN);

    const result = await useCase.execute({ channelId: '123', actorId: '321' });

    expect(result.closed).toBe(true);
    expect(ticketRepo.ticket?.status).toBe(TicketStatus.CLOSED);
  });

  it('registra advertencia cuando falla la persistencia', async () => {
    ticketRepo.ticket = createTicket(TicketStatus.CLAIMED);
    ticketRepo.updateShouldFail = true;

    const result = await useCase.execute({ channelId: '123', actorId: '321' });

    expect(result).toEqual({ closed: true, ticketId: 1 });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 1 }),
      'No se pudo persistir el ticket tras intentar cerrarlo manualmente.',
    );
  });
});
