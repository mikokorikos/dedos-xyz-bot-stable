// =============================================================================
// RUTA: src/application/usecases/messages/GetChannelMessageStatsUseCase.ts
// =============================================================================

import type {
  IMessageCountRepository,
  MessageCountTotal,
} from '@/domain/repositories/IMessageCountRepository';

interface GetChannelMessageStatsPayload {
  readonly guildId: string;
  readonly channelId: string;
  readonly limit?: number;
}

export interface ChannelMessageStatsResult {
  readonly total: number;
  readonly topUsers: ReadonlyArray<MessageCountTotal>;
}

const DEFAULT_CHANNEL_LIMIT = 10;

export class GetChannelMessageStatsUseCase {
  public constructor(private readonly repository: IMessageCountRepository) {}

  public async execute(payload: GetChannelMessageStatsPayload): Promise<ChannelMessageStatsResult> {
    const guildId = BigInt(payload.guildId);
    const channelId = BigInt(payload.channelId);
    const limit = Math.max(1, Math.min(payload.limit ?? DEFAULT_CHANNEL_LIMIT, 25));

    const [total, topUsers] = await Promise.all([
      this.repository.getChannelTotal(guildId, channelId),
      this.repository.getChannelTopUsers(guildId, channelId, limit),
    ]);

    return { total, topUsers };
  }
}

