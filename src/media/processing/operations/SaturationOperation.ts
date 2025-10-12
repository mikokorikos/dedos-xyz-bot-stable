// ============================================================================
// RUTA: src/media/processing/operations/SaturationOperation.ts
// ============================================================================

import type { FrameOperation, FrameOperationContext } from '@/media/processing/types';

export class SaturationOperation implements FrameOperation {
  public constructor(private readonly factor: number) {}

  public apply({ context, metadata }: FrameOperationContext): void {
    const normalized = Number.isFinite(this.factor) ? Math.max(0, this.factor) : 1;

    if (normalized === 1) {
      return;
    }

    const previousFilter = context.filter;

    context.filter = `saturate(${normalized})`;
    context.drawImage(context.canvas, 0, 0, metadata.width, metadata.height);
    context.filter = previousFilter ?? 'none';
  }
}
