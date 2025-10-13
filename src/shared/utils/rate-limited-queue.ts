// =============================================================================
// RUTA: src/shared/utils/rate-limited-queue.ts
// =============================================================================

import type { Logger } from 'pino';

export interface RateLimitedQueueOptions {
  readonly intervalMs: number;
  readonly concurrency: number;
  readonly maxQueue: number;
  readonly logger?: Logger;
}

type Task = () => Promise<void> | void;

export class RateLimitedQueue {
  private readonly intervalMs: number;

  private readonly concurrency: number;

  private readonly maxQueue: number;

  private readonly logger?: Logger;

  private readonly queue: Task[] = [];

  private active = 0;

  private timer: NodeJS.Timeout | null = null;

  private lastReport = 0;

  public constructor(options: RateLimitedQueueOptions) {
    this.intervalMs = Math.max(250, options.intervalMs);
    this.concurrency = Math.max(1, options.concurrency);
    this.maxQueue = Math.max(1, options.maxQueue);
    this.logger = options.logger;
  }

  public start(): void {
    if (this.timer) {
      return;
    }

    const handle = setInterval(() => this.tick(), this.intervalMs);
    if (typeof handle.unref === 'function') {
      handle.unref();
    }

    this.timer = handle;
    this.logger?.info?.('[QUEUE] Cola de bienvenida iniciada.');
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger?.info?.('[QUEUE] Cola de bienvenida detenida.');
    }
  }

  public push(task: Task): boolean {
    if (this.queue.length >= this.maxQueue) {
      this.logger?.warn?.(
        `[QUEUE] Cola llena (${this.queue.length}/${this.maxQueue}). Se descartó la nueva tarea.`,
      );
      return false;
    }

    this.queue.push(task);
    this.maybeReport();
    return true;
  }

  public size(): number {
    return this.queue.length + this.active;
  }

  private tick(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) {
        continue;
      }

      this.run(task).catch((error) => {
        this.logger?.error?.({ err: error }, '[QUEUE] Error inesperado ejecutando tarea.');
      });
    }
  }

  private async run(task: Task): Promise<void> {
    this.active += 1;
    try {
      await task();
    } finally {
      this.active -= 1;
    }
  }

  private maybeReport(): void {
    const now = Date.now();
    if (now - this.lastReport >= 10_000) {
      this.lastReport = now;
      this.logger?.info?.(
        `[QUEUE] Pendientes: ${this.queue.length}, activos: ${this.active}, total: ${this.size()}`,
      );
    }
  }
}
