import { describe, expect, it, vi } from 'vitest';

import { GetUserMessageStatsUseCase } from '@/application/usecases/messages/GetUserMessageStatsUseCase';
import type { IMessageCountRepository } from '@/domain/repositories/IMessageCountRepository';

const createRepositoryMock = (): IMessageCountRepository => ({
  applyDeltas: vi.fn(),
  getGuildTotal: vi.fn().mockResolvedValue(0),
  getUserTotal: vi.fn().mockResolvedValue(0),
  getUserRank: vi.fn().mockResolvedValue(null),
  getUserTopChannels: vi.fn().mockResolvedValue([]),
  getTopUsers: vi.fn(),
  getChannelTotal: vi.fn(),
  getChannelTopUsers: vi.fn(),
});

describe('GetUserMessageStatsUseCase', () => {
  it('returns the aggregated stats for a user', async () => {
    const repository = createRepositoryMock();
    repository.getGuildTotal.mockResolvedValue(2000);
    repository.getUserTotal.mockResolvedValue(250);
    repository.getUserRank.mockResolvedValue(3);
    repository.getUserTopChannels.mockResolvedValue([
      { channelId: BigInt(1), total: 120 },
      { channelId: BigInt(2), total: 90 },
    ]);

    const useCase = new GetUserMessageStatsUseCase(repository);
    const result = await useCase.execute({ guildId: '123', userId: '456' });

    expect(result.total).toBe(250);
    expect(result.guildTotal).toBe(2000);
    expect(result.rank).toBe(3);
    expect(result.topChannels).toHaveLength(2);

    expect(repository.getUserTotal).toHaveBeenCalledWith(BigInt(123), BigInt(456));
    expect(repository.getUserTopChannels).toHaveBeenCalledWith(BigInt(123), BigInt(456), 5);
  });

  it('limits the requested top channels to a safe maximum', async () => {
    const repository = createRepositoryMock();

    const useCase = new GetUserMessageStatsUseCase(repository);
    await useCase.execute({ guildId: '123', userId: '456', limit: 99 });

    expect(repository.getUserTopChannels).toHaveBeenCalledWith(BigInt(123), BigInt(456), 10);
  });
});

