// ============================================================================
// RUTA: src/media/processing/operations/OverlayImageOperation.ts
// ============================================================================

import { type Image, loadImage } from '@napi-rs/canvas';

import type { FrameOperation, FrameOperationContext } from '@/media/processing/types';

export interface OverlayImageOptions {
  readonly sourceUrl: string;
  readonly opacity?: number;
  readonly width?: number;
  readonly height?: number;
  readonly x?: number;
  readonly y?: number;
}

export class OverlayImageOperation implements FrameOperation {
  private loadedImagePromise?: Promise<Image>;

  public constructor(private readonly options: OverlayImageOptions) {}

  public async apply({ context, metadata }: FrameOperationContext): Promise<void> {
    const image = await this.loadImage();

    const overlayWidth = this.options.width ?? image.width ?? metadata.width;
    const overlayHeight = this.options.height ?? image.height ?? metadata.height;
    const drawX = this.options.x ?? 0;
    const drawY = this.options.y ?? 0;
    const opacity = this.normalizeOpacity(this.options.opacity);

    context.save();
    context.globalAlpha = opacity;
    context.drawImage(image, drawX, drawY, overlayWidth, overlayHeight);
    context.restore();
  }

  private async loadImage(): Promise<Image> {
    if (!this.loadedImagePromise) {
      this.loadedImagePromise = loadImage(this.options.sourceUrl);
    }

    return this.loadedImagePromise;
  }

  private normalizeOpacity(value: number | undefined): number {
    if (value === undefined) {
      return 1;
    }

    if (!Number.isFinite(value)) {
      return 1;
    }

    if (value <= 0) {
      return 0;
    }

    if (value >= 1) {
      return 1;
    }

    return value;
  }
}
