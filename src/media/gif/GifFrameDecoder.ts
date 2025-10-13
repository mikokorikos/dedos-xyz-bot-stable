// ============================================================================
// RUTA: src/media/gif/GifFrameDecoder.ts
// ============================================================================

import { type Canvas, type CanvasImageSource, createCanvas, loadImage } from '@napi-rs/canvas';

import type { DecodedGif, GifFrame } from '@/media/gif/types';

const DEFAULT_DELAY_CS = 5;

const isCanvasWithSize = (source: CanvasImageSource): source is Canvas =>
  typeof source === 'object' && source !== null && 'getContext' in source;

export class GifFrameDecoder {
  public async decode(buffer: Buffer): Promise<DecodedGif> {
    const source = await loadImage(buffer);
    const width = this.resolveWidth(source);
    const height = this.resolveHeight(source);

    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);

    const frame: GifFrame = {
      imageData: context.getImageData(0, 0, width, height),
      delayCentiseconds: DEFAULT_DELAY_CS,
    };

    return {
      metadata: {
        width,
        height,
        loopCount: null,
      },
      frames: [frame],
    };
  }

  private resolveWidth(source: CanvasImageSource): number {
    if (typeof source === 'object' && source !== null && 'width' in source && typeof source.width === 'number') {
      return Math.max(1, source.width);
    }

    if (isCanvasWithSize(source)) {
      return Math.max(1, source.width ?? 0);
    }

    return 1;
  }

  private resolveHeight(source: CanvasImageSource): number {
    if (typeof source === 'object' && source !== null && 'height' in source && typeof source.height === 'number') {
      return Math.max(1, source.height);
    }

    if (isCanvasWithSize(source)) {
      return Math.max(1, source.height ?? 0);
    }

    return 1;
  }
}
