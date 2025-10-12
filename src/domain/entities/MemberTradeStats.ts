// ============================================================================
// RUTA: src/domain/entities/MemberTradeStats.ts
// ============================================================================

export class MemberTradeStats {
  public constructor(
    public readonly userId: bigint,
    public tradesCompleted: number,
    public lastTradeAt: Date | null,
    public robloxUsername: string | null,
    public robloxUserId: bigint | null,
    public partnerTag: string | null,
    public updatedAt: Date,
    public vouchCount: number = 0,
    public warnCount: number = 0,
    public lastWarnAt: Date | null = null,
  ) {}

  public withAggregates(data: { vouchCount?: number; warnCount?: number; lastWarnAt?: Date | null }): this {
    if (typeof data.vouchCount === 'number') {
      this.vouchCount = Math.max(0, data.vouchCount);
    }

    if (typeof data.warnCount === 'number') {
      this.warnCount = Math.max(0, data.warnCount);
    }

    if ('lastWarnAt' in data) {
      this.lastWarnAt = data.lastWarnAt ?? null;
    }

    return this;
  }

  public registerTrade(
    completedAt: Date,
    metadata?: { robloxUsername?: string; robloxUserId?: bigint; partnerTag?: string },
  ): void {
    this.tradesCompleted += 1;
    this.lastTradeAt = completedAt;
    this.updatedAt = new Date();

    if (metadata?.robloxUsername) {
      this.robloxUsername = metadata.robloxUsername;
    }

    if (metadata?.robloxUserId !== undefined) {
      this.robloxUserId = metadata.robloxUserId ?? null;
    }

    if (metadata?.partnerTag) {
      this.partnerTag = metadata.partnerTag;
    }
  }

  public summary(): Record<string, string> {
    return {
      'Trades completados': this.tradesCompleted.toString(),
      'Ultimo trade': this.lastTradeAt ? `<t:${Math.floor(this.lastTradeAt.getTime() / 1000)}:R>` : 'N/A',
      'Usuario Roblox': this.robloxUsername ?? 'Sin registrar',
      'Partner frecuente': this.partnerTag ?? 'Sin datos',
      'Vouches confirmados': this.vouchCount.toString(),
      'Warns activos': this.warnCount.toString(),
      'Ultimo warn': this.lastWarnAt ? `<t:${Math.floor(this.lastWarnAt.getTime() / 1000)}:R>` : 'Sin registro',
    };
  }
}
