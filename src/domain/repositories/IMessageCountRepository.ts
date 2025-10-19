// =============================================================================
// RUTA: src/domain/repositories/IMessageCountRepository.ts
// =============================================================================

export interface MessageCountDelta {
  readonly guildId: bigint;
  readonly channelId: bigint;
  readonly userId: bigint;
  readonly delta: number;
}

export interface MessageCountTotal {
  readonly userId: bigint;
  readonly total: number;
}

export interface MessageCountChannelTotal {
  readonly channelId: bigint;
  readonly total: number;
}

export interface IMessageCountRepository {
  applyDeltas(deltas: readonly MessageCountDelta[]): Promise<void>;
  getGuildTotal(guildId: bigint): Promise<number>;
  getUserTotal(guildId: bigint, userId: bigint): Promise<number>;
  getUserRank(guildId: bigint, userId: bigint): Promise<number | null>;
  getUserTopChannels(
    guildId: bigint,
    userId: bigint,
    limit: number,
  ): Promise<readonly MessageCountChannelTotal[]>;
  getTopUsers(guildId: bigint, limit: number): Promise<readonly MessageCountTotal[]>;
  getChannelTotal(guildId: bigint, channelId: bigint): Promise<number>;
  getChannelTopUsers(
    guildId: bigint,
    channelId: bigint,
    limit: number,
  ): Promise<readonly MessageCountTotal[]>;
}

