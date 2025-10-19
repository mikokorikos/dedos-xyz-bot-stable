import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import type { IMessageCountRepository } from '@/domain/repositories/IMessageCountRepository';
import { MessageCountTracker } from '@/shared/services/message-count-tracker';

const createRepository = () => ({
  applyDeltas: vi.fn().mockResolvedValue(undefined),
  getGuildTotal: vi.fn(),
  getUserTotal: vi.fn(),
  getUserRank: vi.fn(),
  getUserTopChannels: vi.fn(),
  getTopUsers: vi.fn(),
  getChannelTotal: vi.fn(),
  getChannelTopUsers: vi.fn(),
});

const createLogger = (): Logger => ({
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: 'info',
  fatal: vi.fn(),
  trace: vi.fn(),
} as unknown as Logger);

describe('MessageCountTracker', () => {
  it('aggregates increments before flushing to the repository', async () => {
    const repositoryMock = createRepository();
    const repository = repositoryMock as unknown as IMessageCountRepository;
    const logger = createLogger();
    const tracker = new MessageCountTracker(repository, logger, {
      flushIntervalMs: 100,
      maxBatchSize: 10,
      cacheSize: 10,
    });

    tracker.recordMessage({ messageId: '1', guildId: '1', channelId: '2', userId: '3' });
    tracker.recordMessage({ messageId: '2', guildId: '1', channelId: '2', userId: '3' });

    await tracker.flush();

    expect(repositoryMock.applyDeltas).toHaveBeenCalledTimes(1);
    expect(repositoryMock.applyDeltas).toHaveBeenCalledWith([
      { guildId: BigInt(1), channelId: BigInt(2), userId: BigInt(3), delta: 2 },
    ]);
  });

  it('uses cached metadata to handle deletions without payload user id', async () => {
    const repositoryMock = createRepository();
    const repository = repositoryMock as unknown as IMessageCountRepository;
    const logger = createLogger();
    const tracker = new MessageCountTracker(repository, logger, {
      flushIntervalMs: 100,
      maxBatchSize: 10,
      cacheSize: 10,
    });

    tracker.recordMessage({ messageId: '15', guildId: '9', channelId: '99', userId: '42' });
    await tracker.flush();
    repositoryMock.applyDeltas.mockClear();

    tracker.recordDeletion({ messageId: '15', guildId: '9', channelId: '99' });
    await tracker.flush();

    expect(repositoryMock.applyDeltas).toHaveBeenCalledWith([
      { guildId: BigInt(9), channelId: BigInt(99), userId: BigInt(42), delta: -1 },
    ]);
  });
});

