// ============================================================================
// RUTA: src/media/processing/FrameProcessorPipeline.ts
// ============================================================================

import { createCanvas, type ImageData } from '@napi-rs/canvas';

import type { GifFrame } from '@/media/gif/types';
import type { FrameMetadata, FrameOperation } from '@/media/processing/types';

export interface ProcessedFrame {
  readonly imageData: ImageData;
  readonly delayCentiseconds: number;
}

export interface FrameProcessorPipelineOptions {
  readonly operations?: ReadonlyArray<FrameOperation>;
}

export class FrameProcessorPipeline {
  private readonly operations: ReadonlyArray<FrameOperation>;

  public constructor(options: FrameProcessorPipelineOptions = {}) {
    this.operations = options.operations ?? [];
  }

  public async process(frames: ReadonlyArray<GifFrame>): Promise<ProcessedFrame[]> {
    const results: ProcessedFrame[] = [];

    for (const [index, frame] of frames.entries()) {
      const processed = await this.processFrame(frame, index);
      results.push(processed);
    }

    return results;
  }

  private async processFrame(frame: GifFrame, index: number): Promise<ProcessedFrame> {
    const { imageData } = frame;
    const canvas = createCanvas(imageData.width, imageData.height);
    const context = canvas.getContext('2d');

    context.putImageData(imageData, 0, 0);

    const metadata: FrameMetadata = {
      index,
      width: imageData.width,
      height: imageData.height,
    };

    for (const operation of this.operations) {
      await operation.apply({
        context,
        metadata,
        frame,
      });
    }

    const processedImageData = context.getImageData(0, 0, imageData.width, imageData.height);

    return {
      imageData: processedImageData,
      delayCentiseconds: frame.delayCentiseconds,
    };
  }
}
