// =============================================================================
// RUTA: src/application/usecases/tickets/CloseSupportTicketUseCase.ts
// =============================================================================

import type { Logger } from 'pino';

import { TicketStatus } from '@/domain/entities/types';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';

interface CloseSupportTicketParams {
  readonly channelId: string;
  readonly actorId: string;
}

interface CloseSupportTicketResult {
  readonly closed: boolean;
  readonly ticketId: number | null;
}

export class CloseSupportTicketUseCase {
  public constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly logger: Logger,
  ) {}

  public async execute({ channelId, actorId }: CloseSupportTicketParams): Promise<CloseSupportTicketResult> {
    const numericChannelId = BigInt(channelId);

    const ticket = await this.ticketRepo.findByChannelId(numericChannelId);
    if (!ticket) {
      this.logger.warn({ channelId, actorId }, 'No se encontró ticket asociado al canal al intentar cerrarlo.');
      return { closed: false, ticketId: null };
    }

    let wasClosed = ticket.status === TicketStatus.CLOSED;

    if (wasClosed) {
      return { closed: true, ticketId: ticket.id };
    }

    if (!ticket.canBeClosed()) {
      try {
        ticket.confirm();
      } catch (error) {
        this.logger.warn(
          { err: error, ticketId: ticket.id, currentStatus: ticket.status },
          'No se pudo preparar el ticket para cierre manual.',
        );
      }
    }

    if (ticket.canBeClosed()) {
      try {
        ticket.close();
        wasClosed = true;
      } catch (error) {
        this.logger.warn(
          { err: error, ticketId: ticket.id, currentStatus: ticket.status },
          'No se pudo actualizar el estado del ticket a cerrado.',
        );
      }
    }

    try {
      await this.ticketRepo.update(ticket);
    } catch (error) {
      this.logger.warn(
        { err: error, ticketId: ticket.id },
        'No se pudo persistir el ticket tras intentar cerrarlo manualmente.',
      );
    }

    return { closed: wasClosed, ticketId: ticket.id };
  }
}
