// ============================================================================
// RUTA: src/application/usecases/middleman/DeleteTradeDataUseCase.ts
// ============================================================================

import type { Logger } from 'pino';

import {
  type DeleteTradeDataDTO,
  DeleteTradeDataSchema,
} from '@/application/dto/trade.dto';
import { TicketStatus } from '@/domain/entities/types';
import type { IMiddlemanRepository } from '@/domain/repositories/IMiddlemanRepository';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import type { ITradeRepository } from '@/domain/repositories/ITradeRepository';
import {
  TicketClosedError,
  TicketNotFoundError,
  TradeDataNotFoundError,
  UnauthorizedActionError,
} from '@/shared/errors/domain.errors';

export interface DeleteTradeDataResult {
  readonly targetUserId: string;
  readonly confirmationReset: boolean;
}

export class DeleteTradeDataUseCase {
  public constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly tradeRepo: ITradeRepository,
    private readonly middlemanRepo: IMiddlemanRepository,
    private readonly logger: Logger,
  ) {}

  public async execute(dto: DeleteTradeDataDTO): Promise<DeleteTradeDataResult> {
    const payload = DeleteTradeDataSchema.parse(dto);

    const ticket = await this.ticketRepo.findById(payload.ticketId);

    if (!ticket) {
      throw new TicketNotFoundError(String(payload.ticketId));
    }

    if (ticket.isClosed()) {
      throw new TicketClosedError(ticket.id);
    }

    const actorId = BigInt(payload.actorId);
    const targetUserId = BigInt(payload.targetUserId ?? payload.actorId);

    const trades = await this.tradeRepo.findByTicketId(ticket.id);
    const trade = trades.find((current) => current.userId === targetUserId) ?? null;

    if (!trade) {
      throw new TradeDataNotFoundError(payload.targetUserId ?? payload.actorId);
    }

    const actorIsOwner = ticket.isOwnedBy(actorId);
    const actorIsParticipant =
      actorIsOwner || (await this.ticketRepo.isParticipant(ticket.id, actorId));

    const [actorIsMiddleman, claim] = await Promise.all([
      this.middlemanRepo.isMiddleman(actorId),
      this.middlemanRepo.getClaimByTicket(ticket.id),
    ]);

    const actorIsAssignedMiddleman = claim?.middlemanId === actorId;
    const actorMatchesTarget = trade.userId === actorId;

    if (!actorMatchesTarget && !actorIsOwner && !actorIsMiddleman) {
      throw new UnauthorizedActionError('middleman:trade:delete');
    }

    if (!actorMatchesTarget && actorIsMiddleman && !actorIsAssignedMiddleman) {
      this.logger.debug(
        {
          ticketId: ticket.id,
          actorId: payload.actorId,
          targetUserId: payload.targetUserId ?? payload.actorId,
        },
        'Middleman sin reclamo directo eliminando datos de trade.',
      );
    }

    if (actorMatchesTarget && !actorIsParticipant && !actorIsMiddleman) {
      throw new UnauthorizedActionError('middleman:trade:delete');
    }

    await this.tradeRepo.delete(trade.id);

    let confirmationReset = false;

    if (ticket.status === TicketStatus.CONFIRMED) {
      ticket.status = TicketStatus.OPEN;
      await this.ticketRepo.update(ticket);
      confirmationReset = true;
    }

    this.logger.info(
      {
        ticketId: ticket.id,
        actorId: payload.actorId,
        targetUserId: trade.userId.toString(),
      },
      'Datos de trade eliminados.',
    );

    return {
      targetUserId: trade.userId.toString(),
      confirmationReset,
    };
  }
}

