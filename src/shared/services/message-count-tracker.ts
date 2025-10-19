// =============================================================================
// RUTA: src/shared/services/message-count-tracker.ts
// =============================================================================

import type { Logger } from 'pino';

import type {
  IMessageCountRepository,
  MessageCountDelta,
} from '@/domain/repositories/IMessageCountRepository';

interface RecordMessagePayload {
  readonly messageId: string;
  readonly guildId: string;
  readonly channelId: string;
  readonly userId: string;
}

interface RecordDeletionPayload {
  readonly messageId: string;
  readonly guildId: string;
  readonly channelId: string;
  readonly userId?: string;
  readonly isBot?: boolean;
}

interface TrackerOptions {
  readonly flushIntervalMs?: number;
  readonly maxBatchSize?: number;
  readonly cacheSize?: number;
}

interface CachedMessage {
  readonly guildId: bigint;
  readonly channelId: bigint;
  readonly userId: bigint;
}

const DEFAULT_FLUSH_INTERVAL = 2_000;
const DEFAULT_MAX_BATCH = 250;
const DEFAULT_CACHE_SIZE = 50_000;

export class MessageCountTracker {
  private readonly flushIntervalMs: number;
  private readonly maxBatchSize: number;
  private readonly cacheSize: number;
  private readonly pending = new Map<string, MessageCountDelta>();
  private readonly cache = new Map<string, CachedMessage>();
  private flushTimer: NodeJS.Timeout | null = null;
  private flushing = false;

  public constructor(
    private readonly repository: IMessageCountRepository,
    private readonly logger: Logger,
    options: TrackerOptions = {},
  ) {
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL;
    this.maxBatchSize = options.maxBatchSize ?? DEFAULT_MAX_BATCH;
    this.cacheSize = options.cacheSize ?? DEFAULT_CACHE_SIZE;

    process.on('beforeExit', () => {
      void this.flush().catch((error) => {
        this.logger.error({ err: error }, 'Error al sincronizar los conteos de mensajes antes de cerrar.');
      });
    });
  }

  public recordMessage(payload: RecordMessagePayload): void {
    const normalized = this.normalizePayload(payload);
    this.rememberMessage(payload.messageId, normalized);
    this.enqueueDelta({ ...normalized, delta: 1 });
  }

  public recordDeletion(payload: RecordDeletionPayload): void {
    if (payload.isBot) {
      this.cache.delete(payload.messageId);
      return;
    }

    const cached = this.cache.get(payload.messageId);
    if (payload.userId) {
      const normalized = this.normalizePayload({
        messageId: payload.messageId,
        guildId: payload.guildId,
        channelId: payload.channelId,
        userId: payload.userId,
      });
      this.enqueueDelta({ ...normalized, delta: -1 });
      this.cache.delete(payload.messageId);
      return;
    }

    if (!cached) {
      this.logger.debug(
        { messageId: payload.messageId, channelId: payload.channelId, guildId: payload.guildId },
        'No se encontro en cache el mensaje eliminado para ajustar el conteo.',
      );
      return;
    }

    this.enqueueDelta({ ...cached, delta: -1 });
    this.cache.delete(payload.messageId);
  }

  public async flush(): Promise<void> {
    if (this.pending.size === 0 || this.flushing) {
      return;
    }

    const deltas = Array.from(this.pending.values());
    this.pending.clear();

    this.flushing = true;
    try {
      await this.repository.applyDeltas(deltas);
    } catch (error) {
      this.logger.error({ err: error }, 'Error al sincronizar los conteos de mensajes.');
      for (const delta of deltas) {
        const key = this.buildKey(delta.guildId, delta.channelId, delta.userId);
        const existing = this.pending.get(key);
        this.pending.set(key, {
          guildId: delta.guildId,
          channelId: delta.channelId,
          userId: delta.userId,
          delta: (existing?.delta ?? 0) + delta.delta,
        });
      }
    } finally {
      this.flushing = false;
    }
  }

  private normalizePayload(payload: RecordMessagePayload): Omit<MessageCountDelta, 'delta'> {
    return {
      guildId: BigInt(payload.guildId),
      channelId: BigInt(payload.channelId),
      userId: BigInt(payload.userId),
    };
  }

  private rememberMessage(messageId: string, payload: Omit<MessageCountDelta, 'delta'>): void {
    if (this.cache.has(messageId)) {
      this.cache.set(messageId, payload);
      return;
    }

    if (this.cache.size >= this.cacheSize) {
      const oldestEntry = this.cache.keys().next();
      if (!oldestEntry.done) {
        this.cache.delete(oldestEntry.value);
      }
    }

    this.cache.set(messageId, payload);
  }

  private enqueueDelta(delta: MessageCountDelta): void {
    const key = this.buildKey(delta.guildId, delta.channelId, delta.userId);
    const existing = this.pending.get(key);

    if (existing) {
      const nextDelta = existing.delta + delta.delta;
      if (nextDelta === 0) {
        this.pending.delete(key);
      } else {
        this.pending.set(key, { ...existing, delta: nextDelta });
      }
      return;
    }

    this.pending.set(key, { ...delta });

    if (this.pending.size >= this.maxBatchSize) {
      void this.flush();
      return;
    }

    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.flushIntervalMs).unref();
  }

  private buildKey(guildId: bigint, channelId: bigint, userId: bigint): string {
    return `${guildId.toString()}:${channelId.toString()}:${userId.toString()}`;
  }
}

