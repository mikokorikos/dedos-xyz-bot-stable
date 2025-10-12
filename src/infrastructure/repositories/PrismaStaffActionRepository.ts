// =============================================================================
// RUTA: src/infrastructure/repositories/PrismaStaffActionRepository.ts
// =============================================================================

import type { Prisma, PrismaClient } from '@prisma/client';

import type {
  IStaffActionRepository,
  StaffAmnestyLog,
} from '@/domain/repositories/IStaffActionRepository';
import type { TransactionContext } from '@/domain/repositories/transaction';

type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

export class PrismaStaffActionRepository implements IStaffActionRepository {
  public constructor(private readonly prisma: PrismaClientLike) {}

  public withTransaction(context: TransactionContext): IStaffActionRepository {
    if (!PrismaStaffActionRepository.isTransactionClient(context)) {
      throw new Error('Invalid Prisma transaction context provided to staff action repository.');
    }

    return new PrismaStaffActionRepository(context);
  }

  public async logAmnesty(entry: StaffAmnestyLog): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO staff_amnesties (guild_id, moderator_id, user_id, action, reason, reference)
      VALUES (${entry.guildId ?? null}, ${entry.moderatorId}, ${entry.userId}, ${entry.action}, ${entry.reason ?? null}, ${
        entry.reference ?? null
      })
    `;
  }

  private static isTransactionClient(value: TransactionContext): value is Prisma.TransactionClient {
    return typeof value === 'object' && value !== null && '$executeRaw' in value;
  }
}
