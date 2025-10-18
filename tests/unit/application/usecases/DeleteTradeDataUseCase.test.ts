import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeleteTradeDataDTO } from '@/application/dto/trade.dto';
import {
  type DeleteTradeDataResult,
  DeleteTradeDataUseCase,
} from '@/application/usecases/middleman/DeleteTradeDataUseCase';
import { Ticket } from '@/domain/entities/Ticket';
import { Trade } from '@/domain/entities/Trade';
import { TicketStatus, TicketType } from '@/domain/entities/types';
import type { IMiddlemanRepository } from '@/domain/repositories/IMiddlemanRepository';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import type { ITradeRepository } from '@/domain/repositories/ITradeRepository';
import { TradeStatus } from '@/domain/value-objects/TradeStatus';
import {
  TicketClosedError,
  TradeDataNotFoundError,
  UnauthorizedActionError,
} from '@/shared/errors/domain.errors';

class StubTicketRepository implements ITicketRepository {
  public ticket: Ticket | null = null;
  public participants = new Set<string>();
  public updated = false;

  public withTransaction(): ITicketRepository {
    return this;
  }

  public async create(): Promise<Ticket> {
    throw new Error('not implemented');
  }

  public async findById(id: number): Promise<Ticket | null> {
    if (!this.ticket || this.ticket.id !== id) {
      return null;
    }

    return this.ticket;
  }

  public async findByChannelId(): Promise<Ticket | null> {
    return this.ticket;
  }

  public async findOpenByOwner(): Promise<readonly Ticket[]> {
    return [];
  }

  public async update(ticket: Ticket): Promise<void> {
    this.ticket = ticket;
    this.updated = true;
  }

  public async delete(): Promise<void> {}

  public async countOpenByOwner(): Promise<number> {
    return 0;
  }

  public async isParticipant(ticketId: number, userId: bigint): Promise<boolean> {
    return this.ticket?.id === ticketId && this.participants.has(userId.toString());
  }

  public async listParticipants(): Promise<readonly { userId: bigint }[]> {
    return Array.from(this.participants).map((userId) => ({ userId: BigInt(userId) }));
  }
}

class StubTradeRepository implements ITradeRepository {
  public trades: Trade[] = [];

  public withTransaction(): ITradeRepository {
    return this;
  }

  public async create(): Promise<Trade> {
    throw new Error('not implemented');
  }

  public async findById(): Promise<Trade | null> {
    return null;
  }

  public async findByTicketId(ticketId: number): Promise<readonly Trade[]> {
    return this.trades.filter((trade) => trade.ticketId === ticketId);
  }

  public async findByUserId(): Promise<readonly Trade[]> {
    return [];
  }

  public async update(): Promise<void> {}

  public async delete(id: number): Promise<void> {
    this.trades = this.trades.filter((trade) => trade.id !== id);
  }
}

class StubMiddlemanRepository implements IMiddlemanRepository {
  public isMiddlemanResult = false;

  public withTransaction(): IMiddlemanRepository {
    return this;
  }

  public async isMiddleman(): Promise<boolean> {
    return this.isMiddlemanResult;
  }

  public async getClaimByTicket(): Promise<null> {
    return null;
  }

  public async createClaim(): Promise<void> {}

  public async markClosed(): Promise<void> {}

  public async markReviewRequested(): Promise<void> {}

  public async setFinalizationMessageId(): Promise<void> {}

  public async upsertProfile(): Promise<void> {}

  public async updateProfile(): Promise<void> {}

  public async getProfile(): Promise<null> {
    return null;
  }

  public async listTopProfiles(): Promise<readonly never[]> {
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

describe('DeleteTradeDataUseCase', () => {
  const OWNER_ID = '111111111111111111';
  const PARTNER_ID = '222222222222222222';
  const MIDDLEMAN_ID = '333333333333333333';

  let ticketRepo: StubTicketRepository;
  let tradeRepo: StubTradeRepository;
  let middlemanRepo: StubMiddlemanRepository;
  let useCase: DeleteTradeDataUseCase;

  const buildTrade = (id: number, userId: string): Trade =>
    new Trade(
      id,
      1,
      BigInt(userId),
      'Trader',
      null,
      null,
      TradeStatus.PENDING,
      false,
      [],
      new Date(),
    );

  beforeEach(() => {
    ticketRepo = new StubTicketRepository();
    tradeRepo = new StubTradeRepository();
    middlemanRepo = new StubMiddlemanRepository();
    useCase = new DeleteTradeDataUseCase(ticketRepo, tradeRepo, middlemanRepo, createLogger());

    ticketRepo.ticket = new Ticket(
      1,
      BigInt(OWNER_ID),
      BigInt(1),
      BigInt(OWNER_ID),
      TicketType.MM,
      TicketStatus.OPEN,
      new Date(),
    );
    ticketRepo.participants = new Set([OWNER_ID, PARTNER_ID]);

    tradeRepo.trades = [buildTrade(1, OWNER_ID), buildTrade(2, PARTNER_ID)];
  });

  const execute = (dto: Partial<DeleteTradeDataDTO>): Promise<DeleteTradeDataResult> =>
    useCase.execute({
      ticketId: 1,
      actorId: OWNER_ID,
      targetUserId: OWNER_ID,
      ...dto,
    });

  it('allows a participant to delete their own trade data', async () => {
    const result = await execute({ actorId: PARTNER_ID, targetUserId: PARTNER_ID });

    expect(tradeRepo.trades).toHaveLength(1);
    expect(tradeRepo.trades[0]?.userId.toString()).toBe(OWNER_ID);
    expect(result).toEqual({ targetUserId: PARTNER_ID, confirmationReset: false });
  });

  it('resets ticket status when confirmation was completed', async () => {
    if (!ticketRepo.ticket) {
      throw new Error('Ticket not initialized');
    }

    ticketRepo.ticket.status = TicketStatus.CONFIRMED;

    const result = await execute({ actorId: PARTNER_ID, targetUserId: PARTNER_ID });

    expect(ticketRepo.ticket.status).toBe(TicketStatus.OPEN);
    expect(ticketRepo.updated).toBe(true);
    expect(result).toEqual({ targetUserId: PARTNER_ID, confirmationReset: true });
  });

  it('allows middlemen to delete other participants data', async () => {
    middlemanRepo.isMiddlemanResult = true;

    await execute({ actorId: MIDDLEMAN_ID, targetUserId: PARTNER_ID });

    expect(tradeRepo.trades).toHaveLength(1);
  });

  it('throws when actor is not authorized', async () => {
    await expect(
      execute({ actorId: '444444444444444444', targetUserId: PARTNER_ID }),
    ).rejects.toThrow(UnauthorizedActionError);
  });

  it('throws when trade data is not found', async () => {
    await expect(execute({ targetUserId: '555555555555555555' })).rejects.toThrow(
      TradeDataNotFoundError,
    );
  });

  it('throws when ticket is closed', async () => {
    if (!ticketRepo.ticket) {
      throw new Error('Ticket not initialized');
    }

    ticketRepo.ticket.status = TicketStatus.CLOSED;

    await expect(execute({ targetUserId: PARTNER_ID })).rejects.toThrow(TicketClosedError);
  });
});

