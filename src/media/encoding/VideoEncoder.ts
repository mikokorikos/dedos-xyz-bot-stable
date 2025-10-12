// ============================================================================
// RUTA: src/media/encoding/VideoEncoder.ts
// ============================================================================

import { PassThrough, type Readable } from 'node:stream';

import { createCanvas } from '@napi-rs/canvas';
import type { FfmpegStatic } from 'fluent-ffmpeg';

import type { ProcessedFrame } from '@/media/processing/FrameProcessorPipeline';

export interface VideoEncoderOptions {
  readonly fps?: number;
  readonly format?: 'mp4' | 'webm';
  readonly pixelFormat?: string;
}

export class VideoEncoderError extends Error {
  public constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'VideoEncoderError';
  }
}

export class FfmpegNotAvailableError extends VideoEncoderError {
  public constructor() {
    super('FFmpeg no está disponible en el entorno de ejecución.');
    this.name = 'FfmpegNotAvailableError';
  }
}

export class VideoEncodingFailedError extends VideoEncoderError {
  public constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'VideoEncodingFailedError';
  }
}

export class VideoEncoder {
  public constructor(private readonly defaults: VideoEncoderOptions = {}) {}

  public async encodeFromFrames(frames: ReadonlyArray<ProcessedFrame>, options: VideoEncoderOptions = {}): Promise<Buffer> {
    if (frames.length === 0) {
      throw new VideoEncoderError('Se requieren frames para generar un video.');
    }

    const ffmpeg = await this.loadFfmpeg();

    if (!ffmpeg) {
      throw new FfmpegNotAvailableError();
    }

    const fps = options.fps ?? this.defaults.fps ?? this.estimateFps(frames);
    const format = options.format ?? this.defaults.format ?? 'mp4';
    const pixelFormat = options.pixelFormat ?? this.defaults.pixelFormat ?? 'yuv420p';

    const inputStream = await this.buildFrameStream(frames);

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const command = ffmpeg()
        .input(inputStream)
        .inputFormat('image2pipe')
        .inputOptions([`-framerate ${fps}`])
        .videoCodec('libx264')
        .outputOptions([`-pix_fmt ${pixelFormat}`])
        .format(format)
        .on('start', () => {
          // intentionally empty, hook reserved for debugging
        })
        .on('progress', () => {
          // no-op: progress events are ignored but listeners are required for typings
        })
        .on('error', (error: Error, stdout: string, stderr: string) => {
          reject(new VideoEncodingFailedError('La conversión del GIF a video falló.', { error, stdout, stderr }));
        })
        .on('end', () => {
          resolve(Buffer.concat(chunks));
        });

      const outputStream = command.pipe(new PassThrough());

      outputStream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      outputStream.on('error', (error) => {
        reject(new VideoEncodingFailedError('Error al leer la salida de FFmpeg.', error));
      });
    });
  }

  private async loadFfmpeg(): Promise<FfmpegStatic | null> {
    try {
      const [{ default: ffmpeg }, installer] = await Promise.all([
        import('fluent-ffmpeg'),
        import('@ffmpeg-installer/ffmpeg').catch(() => null),
      ]);

      if (installer && 'path' in installer && installer?.path) {
        ffmpeg.setFfmpegPath(installer.path);
      }

      return ffmpeg;
    } catch (error) {
      if (process.env['NODE_ENV'] !== 'production') {
        // eslint-disable-next-line no-console -- se utiliza para depuración local si no está disponible FFmpeg
        console.warn('FFmpeg no se pudo cargar:', error);
      }
      return null;
    }
  }

  private estimateFps(frames: ReadonlyArray<ProcessedFrame>): number {
    if (frames.length === 0) {
      return 24;
    }

    const totalDelay = frames.reduce((sum, frame) => sum + frame.delayCentiseconds, 0);

    if (totalDelay <= 0) {
      return 24;
    }

    const averageDelay = totalDelay / frames.length;
    const frameDurationSeconds = averageDelay / 100;

    if (frameDurationSeconds <= 0) {
      return 24;
    }

    return Math.min(60, Math.max(1, Math.round(1 / frameDurationSeconds)));
  }

  private async buildFrameStream(frames: ReadonlyArray<ProcessedFrame>): Promise<Readable> {
    const stream = new PassThrough();

    (async () => {
      try {
        for (const frame of frames) {
          const canvas = createCanvas(frame.imageData.width, frame.imageData.height);
          const context = canvas.getContext('2d');
          context.putImageData(frame.imageData, 0, 0);

          const pngBuffer = await canvas.encode('png');
          stream.write(pngBuffer);
        }

        stream.end();
      } catch (error) {
        stream.destroy(error as Error);
      }
    })().catch((error) => {
      stream.destroy(error as Error);
    });

    return stream;
  }
}
