// ============================================================================
// RUTA: src/application/usecases/middleman/DeleteTradeChannelUseCase.ts
// ============================================================================

import type { TicketStatus } from '@/domain/entities/types';
import type { IMiddlemanRepository } from '@/domain/repositories/IMiddlemanRepository';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import {
  InvalidTicketStateError,
  TicketNotFoundError,
  UnauthorizedActionError,
} from '@/shared/errors/domain.errors';

export interface DeleteTradeChannelResult {
  readonly ticketId: number;
  readonly ticketStatus: TicketStatus;
}

export class DeleteTradeChannelUseCase {
  public constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly middlemanRepo: IMiddlemanRepository,
  ) {}

  public async execute(channelId: bigint, actorId: bigint): Promise<DeleteTradeChannelResult> {
    const ticket = await this.ticketRepo.findByChannelId(channelId);

    if (!ticket) {
      throw new TicketNotFoundError(channelId.toString());
    }

    if (!ticket.isClosed()) {
      throw new InvalidTicketStateError(ticket.status, 'CLOSED');
    }

    const claim = await this.middlemanRepo.getClaimByTicket(ticket.id);

    if (!claim || claim.middlemanId !== actorId) {
      throw new UnauthorizedActionError('middleman:trade:cleanup');
    }

    return { ticketId: ticket.id, ticketStatus: ticket.status };
  }
}

