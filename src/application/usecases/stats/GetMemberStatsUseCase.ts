// ============================================================================
// RUTA: src/application/usecases/stats/GetMemberStatsUseCase.ts
// ============================================================================

import { MemberTradeStats } from '@/domain/entities/MemberTradeStats';
import type { IMemberStatsRepository } from '@/domain/repositories/IMemberStatsRepository';
import type { IMiddlemanRepository } from '@/domain/repositories/IMiddlemanRepository';
import type { IWarnRepository } from '@/domain/repositories/IWarnRepository';

export interface MemberStatsResult {
  readonly stats: MemberTradeStats;
  readonly leaderboard: readonly MemberTradeStats[];
}

export class GetMemberStatsUseCase {
  public constructor(
    private readonly statsRepository: IMemberStatsRepository,
    private readonly middlemanRepository: IMiddlemanRepository,
    private readonly warnRepository: IWarnRepository,
  ) {}

  public async execute(userId: bigint): Promise<MemberStatsResult> {
    const [stats, leaderboard, profile, warnSummary] = await Promise.all([
      this.statsRepository.getByUserId(userId),
      this.statsRepository.topMembers(5),
      this.middlemanRepository.getProfile(userId).catch(() => null),
      this.warnRepository.getSummary(userId).catch(() => ({
        total: 0,
        weightedScore: 0,
        lastWarnAt: null,
      })),
    ]);

    const baseStats =
      stats ?? new MemberTradeStats(userId, 0, null, null, null, null, new Date(), 0, 0, null);

    baseStats.withAggregates({
      vouchCount: profile?.vouches ?? 0,
      warnCount: warnSummary.total,
      lastWarnAt: warnSummary.lastWarnAt ?? null,
    });

    return { stats: baseStats, leaderboard };
  }
}
