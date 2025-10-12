import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import { GrantWarnAmnestyUseCase } from '@/application/usecases/warns/GrantWarnAmnestyUseCase';
import { Warn, WarnSeverity } from '@/domain/entities/Warn';
import type { IStaffActionRepository } from '@/domain/repositories/IStaffActionRepository';
import type { IWarnRepository, WarnSummary } from '@/domain/repositories/IWarnRepository';
import type { TransactionContext, TransactionProvider } from '@/domain/repositories/transaction';

class InMemoryWarnRepository implements IWarnRepository {
  public constructor(private warns: Array<{ id: number; userId: bigint }>) {}

  public withTransaction(): IWarnRepository {
    return this;
  }

  public async create(): Promise<never> {
    throw new Error('Not implemented');
  }

  public async listByUser(): Promise<readonly never[]> {
    return [];
  }

  public async remove(id: number) {
    const index = this.warns.findIndex((warn) => warn.id === id);
    if (index === -1) {
      return null;
    }

    const [removed] = this.warns.splice(index, 1);
    return new Warn(removed.id, removed.userId, BigInt(1), WarnSeverity.MINOR, null, new Date());
  }

  public async removeLatestByUser(userId: bigint) {
    const index = this.warns.findIndex((warn) => warn.userId === userId);
    if (index === -1) {
      return null;
    }

    const [removed] = this.warns.splice(index, 1);
    return new Warn(removed.id, removed.userId, BigInt(1), WarnSeverity.MINOR, null, new Date());
  }

  public async getSummary(): Promise<WarnSummary> {
    return { total: this.warns.length, weightedScore: 0, lastWarnAt: null };
  }
}

class RecordingStaffActionRepository implements IStaffActionRepository {
  public readonly entries: unknown[] = [];

  public withTransaction(): IStaffActionRepository {
    return this;
  }

  public async logAmnesty(entry: unknown): Promise<void> {
    this.entries.push(entry);
  }
}

class ImmediateTransactionProvider implements TransactionProvider {
  public async $transaction<TResult>(handler: (ctx: TransactionContext) => Promise<TResult>): Promise<TResult> {
    return handler({});
  }
}

describe('GrantWarnAmnestyUseCase', () => {
  it('removes a warn by ID and records the amnesty', async () => {
    const warnRepo = new InMemoryWarnRepository([
      { id: 1, userId: BigInt('123456789012345678') },
    ]);
    const staffRepo = new RecordingStaffActionRepository();
    const logger = { info: vi.fn() } as unknown as Logger;

    const useCase = new GrantWarnAmnestyUseCase(
      warnRepo,
      staffRepo,
      new ImmediateTransactionProvider(),
      logger,
    );

    const result = await useCase.execute({
      warnId: 1,
      moderatorId: '555555555555555555',
      guildId: '666666666666666666',
    });

    expect(result.warnId).toBe(1);
    expect(result.userId).toBe(BigInt('123456789012345678'));
    expect(staffRepo.entries).toHaveLength(1);
  });

  it('removes the latest warn when warnId is not provided', async () => {
    const warnRepo = new InMemoryWarnRepository([
      { id: 10, userId: BigInt('223456789012345678') },
      { id: 11, userId: BigInt('323456789012345678') },
    ]);
    const staffRepo = new RecordingStaffActionRepository();
    const logger = { info: vi.fn() } as unknown as Logger;

    const useCase = new GrantWarnAmnestyUseCase(
      warnRepo,
      staffRepo,
      new ImmediateTransactionProvider(),
      logger,
    );

    const result = await useCase.execute({
      userId: '223456789012345678',
      moderatorId: '777777777777777777',
    });

    expect(result.warnId).toBe(10);
    expect(staffRepo.entries[0]).toMatchObject({ userId: BigInt('223456789012345678') });
  });

  it('throws when no matching warn exists', async () => {
    const warnRepo = new InMemoryWarnRepository([]);
    const staffRepo = new RecordingStaffActionRepository();
    const logger = { info: vi.fn() } as unknown as Logger;

    const useCase = new GrantWarnAmnestyUseCase(
      warnRepo,
      staffRepo,
      new ImmediateTransactionProvider(),
      logger,
    );

    await expect(
      useCase.execute({ warnId: 1, moderatorId: '888888888888888888' }),
    ).rejects.toThrow('No se encontró una advertencia');
  });
});
