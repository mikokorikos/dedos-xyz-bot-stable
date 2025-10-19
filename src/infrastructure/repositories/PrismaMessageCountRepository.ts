// =============================================================================
// RUTA: src/infrastructure/repositories/PrismaMessageCountRepository.ts
// =============================================================================

import type { PrismaClient } from '@prisma/client';

import type {
  IMessageCountRepository,
  MessageCountChannelTotal,
  MessageCountDelta,
  MessageCountTotal,
} from '@/domain/repositories/IMessageCountRepository';

const DEFAULT_TOP_LIMIT = 10;

const normalizeLimit = (limit: number | undefined): number =>
  Math.max(1, Math.min(limit ?? DEFAULT_TOP_LIMIT, 50));

export class PrismaMessageCountRepository implements IMessageCountRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async applyDeltas(deltas: readonly MessageCountDelta[]): Promise<void> {
    if (deltas.length === 0) {
      return;
    }

    const merged = new Map<string, MessageCountDelta>();

    for (const delta of deltas) {
      const key = this.buildKey(delta);
      const existing = merged.get(key);
      if (existing) {
        merged.set(key, { ...existing, delta: existing.delta + delta.delta });
      } else {
        merged.set(key, delta);
      }
    }

    const grouped = Array.from(merged.values()).filter((delta) => delta.delta !== 0);

    if (grouped.length === 0) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      for (const delta of grouped) {
        if (delta.delta > 0) {
          await tx.messageCount.upsert({
            where: {
              guildId_channelId_userId: {
                guildId: delta.guildId,
                channelId: delta.channelId,
                userId: delta.userId,
              },
            },
            create: {
              guildId: delta.guildId,
              channelId: delta.channelId,
              userId: delta.userId,
              total: delta.delta,
            },
            update: {
              total: { increment: delta.delta },
            },
          });
          continue;
        }

        const existing = await tx.messageCount.findUnique({
          where: {
            guildId_channelId_userId: {
              guildId: delta.guildId,
              channelId: delta.channelId,
              userId: delta.userId,
            },
          },
        });

        if (!existing) {
          continue;
        }

        const nextTotal = Math.max(existing.total + delta.delta, 0);

        await tx.messageCount.update({
          where: {
            guildId_channelId_userId: {
              guildId: delta.guildId,
              channelId: delta.channelId,
              userId: delta.userId,
            },
          },
          data: {
            total: nextTotal,
          },
        });
      }
    });
  }

  public async getGuildTotal(guildId: bigint): Promise<number> {
    const result = await this.prisma.messageCount.aggregate({
      where: { guildId },
      _sum: { total: true },
    });

    return result._sum.total ?? 0;
  }

  public async getUserTotal(guildId: bigint, userId: bigint): Promise<number> {
    const result = await this.prisma.messageCount.aggregate({
      where: { guildId, userId },
      _sum: { total: true },
    });

    return result._sum.total ?? 0;
  }

  public async getUserRank(guildId: bigint, userId: bigint): Promise<number | null> {
    const [row] = await this.prisma.$queryRaw<{ rank: bigint }[]>
      `SELECT ranked.rank as rank
        FROM (
          SELECT user_id, RANK() OVER (ORDER BY total DESC) AS rank
          FROM (
            SELECT user_id, SUM(total) AS total
            FROM message_counts
            WHERE guild_id = ${guildId}
            GROUP BY user_id
          ) aggregated
        ) ranked
        WHERE ranked.user_id = ${userId}
        LIMIT 1`;

    if (!row) {
      return null;
    }

    return Number(row.rank);
  }

  public async getUserTopChannels(
    guildId: bigint,
    userId: bigint,
    limit: number,
  ): Promise<readonly MessageCountChannelTotal[]> {
    const resolvedLimit = normalizeLimit(limit);

    const rows = await this.prisma.messageCount.findMany({
      where: { guildId, userId },
      orderBy: { total: 'desc' },
      take: resolvedLimit,
    });

    return rows.map((row) => ({ channelId: row.channelId, total: row.total }));
  }

  public async getTopUsers(
    guildId: bigint,
    limit: number,
  ): Promise<readonly MessageCountTotal[]> {
    const resolvedLimit = normalizeLimit(limit);

    const rows = await this.prisma.messageCount.groupBy({
      by: ['userId'],
      where: { guildId },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: resolvedLimit,
    });

    return rows
      .map((row) => ({ userId: row.userId, total: row._sum.total ?? 0 }))
      .filter((row) => row.total > 0);
  }

  public async getChannelTotal(guildId: bigint, channelId: bigint): Promise<number> {
    const result = await this.prisma.messageCount.aggregate({
      where: { guildId, channelId },
      _sum: { total: true },
    });

    return result._sum.total ?? 0;
  }

  public async getChannelTopUsers(
    guildId: bigint,
    channelId: bigint,
    limit: number,
  ): Promise<readonly MessageCountTotal[]> {
    const resolvedLimit = normalizeLimit(limit);

    const rows = await this.prisma.messageCount.findMany({
      where: { guildId, channelId },
      orderBy: { total: 'desc' },
      take: resolvedLimit,
    });

    return rows.map((row) => ({ userId: row.userId, total: row.total }));
  }

  private buildKey(delta: MessageCountDelta): string {
    return `${delta.guildId.toString()}:${delta.channelId.toString()}:${delta.userId.toString()}`;
  }
}

