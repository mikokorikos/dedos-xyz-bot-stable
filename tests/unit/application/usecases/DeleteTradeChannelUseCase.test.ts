import { describe, expect, it } from 'vitest';

import { DeleteTradeChannelUseCase } from '@/application/usecases/middleman/DeleteTradeChannelUseCase';
import { Ticket } from '@/domain/entities/Ticket';
import { TicketStatus, TicketType } from '@/domain/entities/types';
import type { IMiddlemanRepository, MiddlemanClaim } from '@/domain/repositories/IMiddlemanRepository';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import {
  InvalidTicketStateError,
  TicketNotFoundError,
  UnauthorizedActionError,
} from '@/shared/errors/domain.errors';

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

  public async findByChannelId(): Promise<Ticket | null> {
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

  public async listParticipants(): Promise<readonly { userId: bigint; role?: string | null; joinedAt?: Date }[]> {
    return [];
  }
}

class StubMiddlemanRepository implements IMiddlemanRepository {
  public claim: MiddlemanClaim | null = null;

  public withTransaction(): IMiddlemanRepository {
    return this;
  }

  public async isMiddleman(): Promise<boolean> {
    return true;
  }

  public async getClaimByTicket(): Promise<MiddlemanClaim | null> {
    return this.claim;
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

describe('DeleteTradeChannelUseCase', () => {
  const CHANNEL_ID = BigInt('123456789012345678');
  const MIDDLEMAN_ID = BigInt('987654321098765432');

  it('allows deletion when ticket is closed and claimed by actor', async () => {
    const ticket = new Ticket(1, BigInt(1), CHANNEL_ID, BigInt(2), TicketType.MM, TicketStatus.CLOSED, new Date());
    const ticketRepo = new StubTicketRepository();
    ticketRepo.ticket = ticket;

    const middlemanRepo = new StubMiddlemanRepository();
    middlemanRepo.claim = {
      ticketId: ticket.id,
      middlemanId: MIDDLEMAN_ID,
      claimedAt: new Date(),
      vouched: true,
    };

    const useCase = new DeleteTradeChannelUseCase(ticketRepo, middlemanRepo);

    const result = await useCase.execute(CHANNEL_ID, MIDDLEMAN_ID);

    expect(result.ticketId).toBe(ticket.id);
  });

  it('throws when ticket is not found', async () => {
    const ticketRepo = new StubTicketRepository();
    const middlemanRepo = new StubMiddlemanRepository();
    const useCase = new DeleteTradeChannelUseCase(ticketRepo, middlemanRepo);

    await expect(useCase.execute(CHANNEL_ID, MIDDLEMAN_ID)).rejects.toThrow(TicketNotFoundError);
  });

  it('throws when ticket is still open', async () => {
    const ticket = new Ticket(2, BigInt(1), CHANNEL_ID, BigInt(2), TicketType.MM, TicketStatus.OPEN, new Date());
    const ticketRepo = new StubTicketRepository();
    ticketRepo.ticket = ticket;

    const middlemanRepo = new StubMiddlemanRepository();
    middlemanRepo.claim = {
      ticketId: ticket.id,
      middlemanId: MIDDLEMAN_ID,
      claimedAt: new Date(),
    };

    const useCase = new DeleteTradeChannelUseCase(ticketRepo, middlemanRepo);

    await expect(useCase.execute(CHANNEL_ID, MIDDLEMAN_ID)).rejects.toThrow(InvalidTicketStateError);
  });

  it('throws when actor is not the assigned middleman', async () => {
    const ticket = new Ticket(3, BigInt(1), CHANNEL_ID, BigInt(2), TicketType.MM, TicketStatus.CLOSED, new Date());
    const ticketRepo = new StubTicketRepository();
    ticketRepo.ticket = ticket;

    const middlemanRepo = new StubMiddlemanRepository();
    middlemanRepo.claim = {
      ticketId: ticket.id,
      middlemanId: BigInt('111111111111111111'),
      claimedAt: new Date(),
    };

    const useCase = new DeleteTradeChannelUseCase(ticketRepo, middlemanRepo);

    await expect(useCase.execute(CHANNEL_ID, MIDDLEMAN_ID)).rejects.toThrow(UnauthorizedActionError);
  });
});

