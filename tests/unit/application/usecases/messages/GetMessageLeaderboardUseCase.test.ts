import { describe, expect, it, vi } from 'vitest';

import { GetMessageLeaderboardUseCase } from '@/application/usecases/messages/GetMessageLeaderboardUseCase';
import type { IMessageCountRepository } from '@/domain/repositories/IMessageCountRepository';

describe('GetMessageLeaderboardUseCase', () => {
  it('delegates to the repository with normalized limits', async () => {
    const repository: IMessageCountRepository = {
      applyDeltas: vi.fn(),
      getGuildTotal: vi.fn(),
      getUserTotal: vi.fn(),
      getUserRank: vi.fn(),
      getUserTopChannels: vi.fn(),
      getTopUsers: vi.fn().mockResolvedValue([
        { userId: BigInt(1), total: 500 },
      ]),
      getChannelTotal: vi.fn(),
      getChannelTopUsers: vi.fn(),
    };

    const useCase = new GetMessageLeaderboardUseCase(repository);
    const result = await useCase.execute({ guildId: '789', limit: 50 });

    expect(repository.getTopUsers).toHaveBeenCalledWith(BigInt(789), 25);
    expect(result).toHaveLength(1);
  });
});

