// ============================================================================
// RUTA: src/media/processing/operations/BlurOperation.ts
// ============================================================================

import type { FrameOperation, FrameOperationContext } from '@/media/processing/types';

export class BlurOperation implements FrameOperation {
  public constructor(private readonly radius: number) {}

  public apply({ context, metadata }: FrameOperationContext): void {
    if (this.radius <= 0) {
      return;
    }

    const previousFilter = context.filter;

    context.filter = `blur(${this.radius}px)`;
    context.drawImage(context.canvas, 0, 0, metadata.width, metadata.height);
    context.filter = previousFilter ?? 'none';
  }
}
