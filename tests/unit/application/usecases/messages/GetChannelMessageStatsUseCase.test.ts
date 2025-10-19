import { describe, expect, it, vi } from 'vitest';

import { GetChannelMessageStatsUseCase } from '@/application/usecases/messages/GetChannelMessageStatsUseCase';
import type { IMessageCountRepository } from '@/domain/repositories/IMessageCountRepository';

describe('GetChannelMessageStatsUseCase', () => {
  it('returns channel totals and top users', async () => {
    const repository: IMessageCountRepository = {
      applyDeltas: vi.fn(),
      getGuildTotal: vi.fn(),
      getUserTotal: vi.fn(),
      getUserRank: vi.fn(),
      getUserTopChannels: vi.fn(),
      getTopUsers: vi.fn(),
      getChannelTotal: vi.fn().mockResolvedValue(320),
      getChannelTopUsers: vi.fn().mockResolvedValue([
        { userId: BigInt(1), total: 200 },
      ]),
    };

    const useCase = new GetChannelMessageStatsUseCase(repository);
    const result = await useCase.execute({ guildId: '321', channelId: '654', limit: 40 });

    expect(repository.getChannelTotal).toHaveBeenCalledWith(BigInt(321), BigInt(654));
    expect(repository.getChannelTopUsers).toHaveBeenCalledWith(BigInt(321), BigInt(654), 25);
    expect(result.total).toBe(320);
    expect(result.topUsers).toHaveLength(1);
  });
});

