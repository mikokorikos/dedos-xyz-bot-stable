// ============================================================================
// RUTA: src/media/pipeline/GifToVideoPipeline.ts
// ============================================================================

import { FfmpegNotAvailableError, VideoEncoder } from '@/media/encoding/VideoEncoder';
import { GifFrameDecoder } from '@/media/gif/GifFrameDecoder';
import { GifRemoteFetcher } from '@/media/gif/GifRemoteFetcher';
import type { DecodedGif } from '@/media/gif/types';
import { FrameProcessorPipeline } from '@/media/processing/FrameProcessorPipeline';
import type { FrameOperation } from '@/media/processing/types';

export interface GifToVideoPipelineOptions {
  readonly operations?: ReadonlyArray<FrameOperation>;
}

export interface GifToVideoResult {
  readonly buffer: Buffer;
  readonly format: 'gif' | 'mp4';
  readonly metadata: DecodedGif['metadata'];
}

export class GifToVideoPipeline {
  private readonly fetcher: GifRemoteFetcher;
  private readonly decoder: GifFrameDecoder;
  private readonly processor: FrameProcessorPipeline;
  private readonly encoder: VideoEncoder;

  public constructor(options: GifToVideoPipelineOptions = {}) {
    this.fetcher = new GifRemoteFetcher();
    this.decoder = new GifFrameDecoder();
    this.processor = new FrameProcessorPipeline({ operations: options.operations });
    this.encoder = new VideoEncoder();
  }

  public async convert(sourceUrl: string): Promise<GifToVideoResult> {
    const gifBuffer = await this.fetcher.fetch(sourceUrl);
    const decoded = await this.decoder.decode(gifBuffer);
    const processedFrames = await this.processor.process(decoded.frames);

    try {
      const videoBuffer = await this.encoder.encodeFromFrames(processedFrames);

      return {
        buffer: videoBuffer,
        format: 'mp4',
        metadata: decoded.metadata,
      };
    } catch (error) {
      if (error instanceof FfmpegNotAvailableError) {
        return {
          buffer: gifBuffer,
          format: 'gif',
          metadata: decoded.metadata,
        };
      }

      throw error;
    }
  }
}
