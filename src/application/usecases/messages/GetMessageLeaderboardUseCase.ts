// =============================================================================
// RUTA: src/application/usecases/messages/GetMessageLeaderboardUseCase.ts
// =============================================================================

import type {
  IMessageCountRepository,
  MessageCountTotal,
} from '@/domain/repositories/IMessageCountRepository';

interface GetMessageLeaderboardPayload {
  readonly guildId: string;
  readonly limit?: number;
}

const DEFAULT_LIMIT = 10;

export class GetMessageLeaderboardUseCase {
  public constructor(private readonly repository: IMessageCountRepository) {}

  public async execute(payload: GetMessageLeaderboardPayload): Promise<readonly MessageCountTotal[]> {
    const guildId = BigInt(payload.guildId);
    const limit = Math.max(1, Math.min(payload.limit ?? DEFAULT_LIMIT, 25));

    return this.repository.getTopUsers(guildId, limit);
  }
}

