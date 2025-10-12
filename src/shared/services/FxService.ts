// =============================================================================
// RUTA: src/shared/services/FxService.ts
// =============================================================================

import type { Logger } from 'pino';

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export interface FxServiceOptions {
  readonly initialRate?: number | null;
  readonly refreshIntervalMs: number;
  readonly disableAutoRefresh?: boolean;
  readonly logger: Logger;
}

const DEFAULT_RATE = 0.058;

export class FxService {
  private rate: number;

  private timer: NodeJS.Timeout | null = null;

  private lastUpdated: Date | null = null;

  private readonly logger: Logger;

  private readonly refreshIntervalMs: number;

  private readonly disableAutoRefresh: boolean;

  private usingFallback: boolean;

  public constructor(options: FxServiceOptions) {
    this.logger = options.logger;
    this.refreshIntervalMs = Math.max(60_000, options.refreshIntervalMs);
    this.disableAutoRefresh = Boolean(options.disableAutoRefresh);

    const initialRate = typeof options.initialRate === 'number' && options.initialRate > 0
      ? options.initialRate
      : DEFAULT_RATE;

    this.rate = initialRate;
    this.usingFallback = !(typeof options.initialRate === 'number' && options.initialRate > 0);
    this.lastUpdated = this.usingFallback ? null : new Date();
  }

  public start(): void {
    if (this.disableAutoRefresh || typeof fetch !== 'function') {
      return;
    }

    if (this.timer) {
      return;
    }

    const interval = setInterval(() => {
      void this.refresh();
    }, this.refreshIntervalMs);

    if (typeof interval.unref === 'function') {
      interval.unref();
    }

    this.timer = interval;

    void this.refresh();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public getRate(): number {
    return this.rate;
  }

  public getLastUpdated(): Date | null {
    return this.lastUpdated;
  }

  public isUsingFallback(): boolean {
    return this.usingFallback;
  }

  public formatUsdFromMxn(amount: number): string {
    const usdValue = amount * this.rate;
    return `~ ${USD_FORMATTER.format(usdValue)} USD`;
  }

  public buildInfoField(): { name: string; value: string } {
    const rateText = this.rate.toFixed(4);
    const detail = this.usingFallback
      ? 'Usamos una tasa predeterminada cuando no hay actualización automática disponible.'
      : 'La tasa se actualiza automáticamente cada pocas horas usando open.er-api.com.';
    const lastUpdateLine = this.lastUpdated
      ? `Última actualización: ${this.lastUpdated.toISOString()}.`
      : 'Última actualización: no disponible.';

    return {
      name: 'Conversión MXN → USD',
      value: [
        `Tasa actual: **${rateText}**.`,
        detail,
        lastUpdateLine,
      ].join('\n'),
    };
  }

  public async refresh(): Promise<void> {
    if (this.disableAutoRefresh || typeof fetch !== 'function') {
      return;
    }

    try {
      const response = await fetch('https://open.er-api.com/v6/latest/MXN', {
        headers: { 'User-Agent': 'DedosShopBot/1.0 (+https://discord.gg/dedos)' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload: unknown = await response.json();
      const nextRate = Number((payload as { rates?: { USD?: unknown } })?.rates?.USD);

      if (Number.isFinite(nextRate) && nextRate > 0) {
        this.rate = nextRate;
        this.lastUpdated = new Date();
        this.usingFallback = false;
        this.logger.info({ rate: nextRate }, '[FX] Tasa MXN → USD actualizada correctamente.');
      }
    } catch (error) {
      this.logger.warn({ err: error }, '[FX] No se pudo actualizar la tasa MXN → USD.');
    }
  }
}
