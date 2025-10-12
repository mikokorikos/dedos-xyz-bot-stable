// =============================================================================
// RUTA: src/application/usecases/warns/GrantWarnAmnestyUseCase.ts
// =============================================================================

import type { Logger } from 'pino';
import { z } from 'zod';

import type { IStaffActionRepository } from '@/domain/repositories/IStaffActionRepository';
import type { IWarnRepository } from '@/domain/repositories/IWarnRepository';
import type { TransactionProvider } from '@/domain/repositories/transaction';

const GrantAmnestySchema = z.object({
  warnId: z.number().int().positive().optional(),
  userId: z
    .string()
    .regex(/^\d{17,20}$/u, 'El usuario debe ser un snowflake válido de Discord')
    .optional(),
  moderatorId: z
    .string()
    .regex(/^\d{17,20}$/u, 'El moderador debe ser un snowflake válido de Discord'),
  guildId: z
    .string()
    .regex(/^\d{17,20}$/u, 'El servidor debe ser un snowflake válido de Discord')
    .optional(),
  reason: z.string().max(200).optional(),
}).superRefine((value, ctx) => {
  if (!value.warnId && !value.userId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['warnId'],
      message: 'Debes proporcionar un warnId o un userId para revocar una advertencia.',
    });
  }
});

export type GrantAmnestyDTO = z.infer<typeof GrantAmnestySchema>;

export interface GrantAmnestyResult {
  readonly warnId: number;
  readonly userId: bigint;
  readonly reason?: string | null;
}

export class GrantWarnAmnestyUseCase {
  public constructor(
    private readonly warnRepository: IWarnRepository,
    private readonly staffActionRepository: IStaffActionRepository,
    private readonly transactions: TransactionProvider,
    private readonly logger: Logger,
  ) {}

  public async execute(dto: GrantAmnestyDTO): Promise<GrantAmnestyResult> {
    const payload = GrantAmnestySchema.parse(dto);

    return this.transactions.$transaction(async (trx) => {
      const warnRepo = this.warnRepository.withTransaction(trx);
      const staffRepo = this.staffActionRepository.withTransaction(trx);

      const moderatorId = BigInt(payload.moderatorId);
      const guildId = payload.guildId ? BigInt(payload.guildId) : null;

      let removed = null;

      if (payload.warnId) {
        removed = await warnRepo.remove(payload.warnId);
      } else if (payload.userId) {
        removed = await warnRepo.removeLatestByUser(BigInt(payload.userId));
      }

      if (!removed) {
        throw new Error('No se encontró una advertencia que coincida con la solicitud.');
      }

      const removedUserId = removed.userId.toBigInt();

      await staffRepo.logAmnesty({
        guildId,
        moderatorId,
        userId: removedUserId,
        action: 'remove_warn',
        reason: payload.reason ?? null,
        reference: String(removed.id),
      });

      this.logger.info(
        { warnId: removed.id, userId: removedUserId, moderatorId },
        'Advertencia revocada mediante amnistía.',
      );

      return {
        warnId: removed.id,
        userId: removedUserId,
        reason: payload.reason ?? null,
      };
    });
  }
}
