// =============================================================================
// RUTA: src/infrastructure/repositories/PrismaMessageCountRepository.ts
// =============================================================================

import type { Prisma, PrismaClient } from '@prisma/client';

import type {
  IMessageCountRepository,
  MessageCountChannelTotal,
  MessageCountDelta,
  MessageCountTotal,
} from '@/domain/repositories/IMessageCountRepository';
import { logger } from '@/shared/logger/pino';

const DEFAULT_TOP_LIMIT = 10;

const normalizeLimit = (limit: number | undefined): number =>
  Math.max(1, Math.min(limit ?? DEFAULT_TOP_LIMIT, 50));

const MESSAGE_COUNT_TABLE = 'message_counts';
let warnedMissingMessageCountTable = false;

const extractErrorMessage = (error: unknown): string => {
  if (!error) {
    return '';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message ?? '';
  }

  const candidate = (error as { message?: unknown }).message;
  return typeof candidate === 'string' ? candidate : '';
};

const getPrismaErrorCode = (error: unknown): string | null => {
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
};

const isMissingTableError = (error: unknown, table: string): boolean => {
  const code = getPrismaErrorCode(error);
  if (code === 'P2021' || code === 'P2010') {
    return true;
  }

  const message = extractErrorMessage(error).toLowerCase();
  if (!message) {
    return false;
  }

  const mentionsTable =
    message.includes(`\`${table}\``) || message.includes(`'${table}'`) || message.includes(table);

  if (!mentionsTable) {
    return false;
  }

  return (
    message.includes('does not exist') ||
    message.includes('unknown') ||
    message.includes('no such table') ||
    message.includes('1146')
  );
};

const handleMissingTable = <T>(error: unknown, fallback: T): T => {

  if (isMissingTableError(error, MESSAGE_COUNT_TABLE)) {
    if (!warnedMissingMessageCountTable) {
      warnedMissingMessageCountTable = true;
      logger.warn(
        { err: error },
        `[DB] La tabla "${MESSAGE_COUNT_TABLE}" no existe. Las estadísticas de mensajes se omitirán hasta crearla.`,
      );
    }

    return fallback;
  }

  throw error;
};

const getMessageCountDelegate = (client: PrismaClient | Prisma.TransactionClient) =>
  (client as unknown as { messageCount: any }).messageCount;

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

    try {
      await this.prisma.$transaction(async (tx) => {
        const delegate = getMessageCountDelegate(tx);
        for (const delta of grouped) {
          if (delta.delta > 0) {
            await delegate.upsert({
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

          const existing = await delegate.findUnique({
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

          await delegate.update({
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
    } catch (error) {
      handleMissingTable(error, undefined);
    }
  }

  public async getGuildTotal(guildId: bigint): Promise<number> {
    try {
      const result = await getMessageCountDelegate(this.prisma).aggregate({
        where: { guildId },
        _sum: { total: true },
      });

      return result._sum.total ?? 0;
    } catch (error) {
      return handleMissingTable(error, 0);
    }
  }

  public async getUserTotal(guildId: bigint, userId: bigint): Promise<number> {
    try {
      const result = await getMessageCountDelegate(this.prisma).aggregate({
        where: { guildId, userId },
        _sum: { total: true },
      });

      return result._sum.total ?? 0;
    } catch (error) {
      return handleMissingTable(error, 0);
    }
  }

  public async getUserRank(guildId: bigint, userId: bigint): Promise<number | null> {
    try {
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
    } catch (error) {
      return handleMissingTable(error, null);
    }
  }

  public async getUserTopChannels(
    guildId: bigint,
    userId: bigint,
    limit: number,
  ): Promise<readonly MessageCountChannelTotal[]> {
    const resolvedLimit = normalizeLimit(limit);

    try {
      const rows = (await getMessageCountDelegate(this.prisma).findMany({
        where: { guildId, userId },
        orderBy: { total: 'desc' },
        take: resolvedLimit,
      })) as Array<{ channelId: bigint; total: number }>;

      return rows.map((row) => ({ channelId: row.channelId, total: row.total }));
    } catch (error) {
      return handleMissingTable(error, [] as MessageCountChannelTotal[]);
    }
  }

  public async getTopUsers(
    guildId: bigint,
    limit: number,
  ): Promise<readonly MessageCountTotal[]> {
    const resolvedLimit = normalizeLimit(limit);

    try {
      const rows = (await getMessageCountDelegate(this.prisma).groupBy({
        by: ['userId'],
        where: { guildId },
        _sum: { total: true },
        orderBy: { _sum: { total: 'desc' } },
        take: resolvedLimit,
      })) as Array<{ userId: bigint; _sum: { total: number | null } }>;

      return rows
        .map((row) => ({ userId: row.userId, total: row._sum.total ?? 0 }))
        .filter((row) => row.total > 0);
    } catch (error) {
      return handleMissingTable(error, [] as MessageCountTotal[]);
    }
  }

  public async getChannelTotal(guildId: bigint, channelId: bigint): Promise<number> {
    try {
      const result = await getMessageCountDelegate(this.prisma).aggregate({
        where: { guildId, channelId },
        _sum: { total: true },
      });

      return result._sum.total ?? 0;
    } catch (error) {
      return handleMissingTable(error, 0);
    }
  }

  public async getChannelTopUsers(
    guildId: bigint,
    channelId: bigint,
    limit: number,
  ): Promise<readonly MessageCountTotal[]> {
    const resolvedLimit = normalizeLimit(limit);

    try {
      const rows = (await getMessageCountDelegate(this.prisma).findMany({
        where: { guildId, channelId },
        orderBy: { total: 'desc' },
        take: resolvedLimit,
      })) as Array<{ userId: bigint; total: number }>;

      return rows.map((row) => ({ userId: row.userId, total: row.total }));
    } catch (error) {
      return handleMissingTable(error, [] as MessageCountTotal[]);
    }
  }

  private buildKey(delta: MessageCountDelta): string {
    return `${delta.guildId.toString()}:${delta.channelId.toString()}:${delta.userId.toString()}`;
  }
}

