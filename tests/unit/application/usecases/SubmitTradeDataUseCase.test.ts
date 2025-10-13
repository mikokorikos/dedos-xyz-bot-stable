import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SubmitTradeDataDTO } from '@/application/dto/trade.dto';
import { SubmitTradeDataUseCase } from '@/application/usecases/middleman/SubmitTradeDataUseCase';
import { Ticket } from '@/domain/entities/Ticket';
import { Trade } from '@/domain/entities/Trade';
import { TicketStatus, TicketType, type TradeItem } from '@/domain/entities/types';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import type { ITradeRepository } from '@/domain/repositories/ITradeRepository';
import { TradeStatus } from '@/domain/value-objects/TradeStatus';
import { UnauthorizedActionError } from '@/shared/errors/domain.errors';
import type { RobloxUserRecord, RobloxUsersService } from '@/shared/services/RobloxUsersService';

class MockTicketRepository implements ITicketRepository {
  public ticket: Ticket | null = null;
  public participants = new Set<string>();

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
    return null;
  }

  public async findOpenByOwner(): Promise<readonly Ticket[]> {
    return [];
  }

  public async update(): Promise<void> {}

  public async delete(): Promise<void> {}

  public async countOpenByOwner(): Promise<number> {
    return 0;
  }

  public async isParticipant(ticketId: number, userId: bigint): Promise<boolean> {
    return this.ticket?.id === ticketId && this.participants.has(userId.toString());
  }

  public async listParticipants(): Promise<readonly { userId: bigint; role?: string | null; joinedAt?: Date }[]> {
    return Array.from(this.participants).map((userId) => ({ userId: BigInt(userId) }));
  }
}

class MockTradeRepository implements ITradeRepository {
  public trades: Trade[] = [];
  public updated = false;

  public withTransaction(): ITradeRepository {
    return this;
  }

  public async create(data: {
    ticketId: number;
    userId: bigint;
    robloxUsername: string;
    robloxUserId?: bigint | null;
    status?: TradeStatus;
    confirmed?: boolean;
    items?: ReadonlyArray<TradeItem>;
  }): Promise<Trade> {
    const trade = new Trade(
      this.trades.length + 1,
      data.ticketId,
      data.userId,
      data.robloxUsername,
      data.robloxUserId ?? null,
      null,
      data.status ?? TradeStatus.PENDING,
      data.confirmed ?? false,
      data.items ? [...data.items] : [],
      new Date(),
    );
    this.trades.push(trade);
    return trade;
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

  public async update(): Promise<void> {
    this.updated = true;
  }

  public async delete(): Promise<void> {}
}

class MockRobloxUsersService implements RobloxUsersService {
  public responses = new Map<string, RobloxUserRecord | null>();

  public async lookupByUsername(username: string): Promise<RobloxUserRecord | null> {
    return this.responses.get(username) ?? null;
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

describe('SubmitTradeDataUseCase', () => {
  const OWNER_ID = '111111111111111111';
  const PARTNER_ID = '222222222222222222';
  const OTHER_ID = '333333333333333333';
  let ticketRepo: MockTicketRepository;
  let tradeRepo: MockTradeRepository;
  let robloxUsers: MockRobloxUsersService;
  let useCase: SubmitTradeDataUseCase;

  beforeEach(() => {
    ticketRepo = new MockTicketRepository();
    tradeRepo = new MockTradeRepository();
    robloxUsers = new MockRobloxUsersService();
    useCase = new SubmitTradeDataUseCase(ticketRepo, tradeRepo, robloxUsers, createLogger());

    ticketRepo.ticket = new Ticket(1, BigInt(OWNER_ID), BigInt(2), BigInt(PARTNER_ID), TicketType.MM, TicketStatus.OPEN, new Date());
    ticketRepo.participants = new Set([OWNER_ID, PARTNER_ID]);
  });

  it('creates a new trade when participant submits data', async () => {
    robloxUsers.responses.set('TraderOne', { id: BigInt('7777777777'), username: 'TraderOne' });
    const dto: SubmitTradeDataDTO = {
      ticketId: 1,
      userId: PARTNER_ID,
      robloxUsername: 'TraderOne',
      offerDescription: 'Ofrezco 100k monedas',
    };

    const trade = await useCase.execute(dto);

    expect(tradeRepo.trades).toHaveLength(1);
    expect(trade.robloxUsername).toBe('TraderOne');
    expect(trade.robloxUserId).toBe(BigInt('7777777777'));
    expect(trade.items).toHaveLength(1);
    expect(trade.confirmed).toBe(false);
  });

  it('updates existing trade and resets confirmation', async () => {
    const existing = new Trade(1, 1, BigInt(PARTNER_ID), 'OldName', null, null, TradeStatus.ACTIVE, true, [], new Date());
    tradeRepo.trades = [existing];
    robloxUsers.responses.set('UpdatedName', { id: BigInt('8888888888'), username: 'UpdatedName' });

    const dto: SubmitTradeDataDTO = {
      ticketId: 1,
      userId: PARTNER_ID,
      robloxUsername: 'UpdatedName',
      offerDescription: 'Nuevo trato con detalles',
    };

    const trade = await useCase.execute(dto);

    expect(trade.robloxUsername).toBe('UpdatedName');
    expect(trade.confirmed).toBe(false);
    expect(trade.robloxUserId).toBe(BigInt('8888888888'));
    expect(tradeRepo.updated).toBe(true);
  });

  it('keeps provided username when Roblox lookup fails', async () => {
    const dto: SubmitTradeDataDTO = {
      ticketId: 1,
      userId: PARTNER_ID,
      robloxUsername: 'UnknownUser',
      offerDescription: 'Datos incompletos',
    };

    const trade = await useCase.execute(dto);

    expect(trade.robloxUsername).toBe('UnknownUser');
    expect(trade.robloxUserId).toBeNull();
  });

  it('throws when user is not participant', async () => {
    const dto: SubmitTradeDataDTO = {
      ticketId: 1,
      userId: OTHER_ID,
      robloxUsername: 'Intruso',
      offerDescription: 'No debería funcionar',
    };

    await expect(useCase.execute(dto)).rejects.toThrow(UnauthorizedActionError);
  });
});
