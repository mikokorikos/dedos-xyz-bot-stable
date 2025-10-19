// =============================================================================
// RUTA: src/application/usecases/messages/GetUserMessageStatsUseCase.ts
// =============================================================================

import type { IMessageCountRepository } from '@/domain/repositories/IMessageCountRepository';

export interface UserMessageStatsResult {
  readonly total: number;
  readonly guildTotal: number;
  readonly rank: number | null;
  readonly topChannels: ReadonlyArray<{ channelId: bigint; total: number }>;
}

interface GetUserMessageStatsPayload {
  readonly guildId: string;
  readonly userId: string;
  readonly limit?: number;
}

const DEFAULT_TOP_CHANNELS = 5;

export class GetUserMessageStatsUseCase {
  public constructor(private readonly repository: IMessageCountRepository) {}

  public async execute(payload: GetUserMessageStatsPayload): Promise<UserMessageStatsResult> {
    const guildId = BigInt(payload.guildId);
    const userId = BigInt(payload.userId);
    const limit = Math.max(1, Math.min(payload.limit ?? DEFAULT_TOP_CHANNELS, 10));

    const [total, guildTotal, rank, topChannels] = await Promise.all([
      this.repository.getUserTotal(guildId, userId),
      this.repository.getGuildTotal(guildId),
      this.repository.getUserRank(guildId, userId),
      this.repository.getUserTopChannels(guildId, userId, limit),
    ]);

    return {
      total,
      guildTotal,
      rank,
      topChannels,
    };
  }
}

