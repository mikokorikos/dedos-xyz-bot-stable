// ============================================================================
// RUTA: src/presentation/tickets/SupportTicketCloser.ts
// ============================================================================

import type { TextChannel } from 'discord.js';
import type { Logger } from 'pino';

import type { Ticket } from '@/domain/entities/Ticket';
import { TicketStatus } from '@/domain/entities/types';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import { InvalidTicketStateError } from '@/shared/errors/domain.errors';

interface Dependencies {
  readonly ticketRepository: ITicketRepository;
  readonly logger: Logger;
}

interface CloseOptions {
  readonly executorId: string;
  readonly deleteDelayMs?: number;
  readonly deleteReason?: string;
}

interface CloseResult {
  readonly status: 'success' | 'already-closed' | 'not-ticket';
  readonly ticketId?: number;
  readonly forced?: boolean;
}

export type SupportTicketCloser = (
  channel: TextChannel,
  options: CloseOptions,
) => Promise<CloseResult>;

export const createSupportTicketCloser = ({
  ticketRepository,
  logger,
}: Dependencies): SupportTicketCloser => {
  return async (channel, options) => {
    const { executorId, deleteDelayMs = 10_000, deleteReason } = options;
    const scheduleDeletion = (): void => {
      setTimeout(() => {
        channel
          .delete(deleteReason ?? 'Ticket de soporte archivado por el staff')
          .catch((error) =>
            logger.warn({ err: error, channelId: channel.id }, 'No se pudo eliminar el canal del ticket.'),
          );
      }, deleteDelayMs);
    };

    let ticket: Ticket | null;
    try {
      ticket = await ticketRepository.findByChannelId(BigInt(channel.id));
    } catch (error) {
      logger.error(
        { err: error, channelId: channel.id, executorId },
        'No se pudo recuperar el ticket antes de cerrarlo.',
      );
      throw error;
    }

    if (!ticket) {
      scheduleDeletion();
      logger.warn(
        { channelId: channel.id, executorId },
        'No se encontró ticket asociado al canal durante el cierre.',
      );
      return { status: 'not-ticket' };
    }

    if (ticket.status === TicketStatus.CLOSED) {
      scheduleDeletion();
      logger.info(
        { ticketId: ticket.id, channelId: channel.id, executorId },
        'El canal del ticket ya estaba cerrado. Se programó su eliminación.',
      );
      return { status: 'already-closed', ticketId: ticket.id };
    }

    let forced = false;

    if (!ticket.canBeClosed()) {
      try {
        ticket.confirm();
      } catch (error) {
        logger.warn(
          { err: error, ticketId: ticket.id, currentStatus: ticket.status },
          'No se pudo confirmar el ticket antes de cerrarlo.',
        );
      }
    }

    if (!ticket.canBeClosed()) {
      forced = true;
      ticket.status = TicketStatus.CLOSED;
      ticket.closedAt = new Date();
    } else {
      try {
        ticket.close();
      } catch (error) {
        if (error instanceof InvalidTicketStateError) {
          forced = true;
          ticket.status = TicketStatus.CLOSED;
          ticket.closedAt = new Date();
        } else {
          throw error;
        }
      }
    }

    try {
      await ticketRepository.update(ticket);
    } catch (error) {
      logger.warn({ err: error, ticketId: ticket.id }, 'No se pudo actualizar el ticket cerrado en la base de datos.');
    }

    scheduleDeletion();

    logger.info(
      { ticketId: ticket.id, channelId: channel.id, executorId, forced },
      'Ticket de soporte cerrado y canal programado para eliminación.',
    );

    return { status: 'success', ticketId: ticket.id, forced };
  };
};
