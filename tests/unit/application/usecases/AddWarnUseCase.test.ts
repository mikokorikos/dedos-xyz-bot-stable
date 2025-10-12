import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AddWarnUseCase } from '@/application/usecases/warns/AddWarnUseCase';
import { Warn, WarnSeverity } from '@/domain/entities/Warn';
import type {
  CreateWarnData,
  IWarnRepository,
  WarnSummary,
} from '@/domain/repositories/IWarnRepository';

class InMemoryWarnRepository implements IWarnRepository {
  private sequence = 1;
  private warns: Warn[] = [];

  public withTransaction(): IWarnRepository {
    return this;
  }

  public preload(warn: Warn): void {
    this.warns.push(warn);
  }

  public async create(data: CreateWarnData): Promise<Warn> {
    const warn = new Warn(
      this.sequence++,
      data.userId,
      data.moderatorId ?? null,
      data.severity,
      data.reason ?? null,
      new Date(),
    );
    this.warns.push(warn);

    return warn;
  }

  public async listByUser(userId: bigint): Promise<readonly Warn[]> {
    return this.warns.filter((warn) => warn.userId.toBigInt() === userId);
  }

  public async remove(): Promise<Warn | null> {
    return null;
  }

  public async removeLatestByUser(): Promise<Warn | null> {
    return null;
  }

  public async getSummary(userId: bigint): Promise<WarnSummary> {
    const warns = await this.listByUser(userId);
    const weightedScore = warns.reduce((acc, warn) => acc + warn.weight, 0);
    const lastWarnAt = warns.length > 0 ? warns[warns.length - 1]!.createdAt : null;

    return {
      total: warns.length,
      weightedScore,
      lastWarnAt,
    };
  }
}

const createMockLogger = (): Logger =>
  ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'silent',
  } as unknown as Logger);

describe('AddWarnUseCase', () => {
  let repository: InMemoryWarnRepository;
  let useCase: AddWarnUseCase;

  beforeEach(() => {
    repository = new InMemoryWarnRepository();
    const logger = createMockLogger();
    useCase = new AddWarnUseCase(repository, logger);

    repository.preload(new Warn(1, BigInt('123456789012345678'), null, WarnSeverity.MAJOR, null, new Date()));
    repository.preload(new Warn(2, BigInt('123456789012345678'), null, WarnSeverity.MAJOR, null, new Date()));
  });

  it('returns escalation progress based on accumulated severity', async () => {
    const result = await useCase.execute({
      userId: '123456789012345678',
      moderatorId: '987654321098765432',
      severity: WarnSeverity.CRITICAL,
      reason: 'Prueba',
    });

    expect(result.summary.total).toBe(3);
    expect(result.summary.weightedScore).toBe(7);
    expect(result.escalation.currentAction).toBe('TEMP_BAN');
    expect(result.escalation.nextAction).toBe('BAN');
    expect(result.escalation.remainingWeight).toBe(1);
    expect(result.warn.severity).toBe(WarnSeverity.CRITICAL);
  });
});
