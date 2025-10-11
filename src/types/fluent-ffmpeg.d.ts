/* eslint-disable import/no-default-export */

declare module 'fluent-ffmpeg' {
  import type { Buffer } from 'node:buffer';
  import type { Readable, Writable } from 'node:stream';

  export interface FfmpegProgress {
    frames?: number;
    currentFps?: number;
    currentKbps?: number;
    targetSize?: number;
    timemark?: string;
  }

  export type FfmpegEventMap = {
    start: (commandLine: string) => void;
    progress: (progress: FfmpegProgress) => void;
    codecData: (data: Record<string, unknown>) => void;
    error: (error: Error, stdout: string, stderr: string) => void;
    end: () => void;
  };

  export interface FfmpegCommand {
    input(source: string | Readable | Buffer): FfmpegCommand;
    inputFormat(format: string): FfmpegCommand;
    inputFPS(fps: number): FfmpegCommand;
    inputOptions(options: string | string[]): FfmpegCommand;
    size(size: string): FfmpegCommand;
    videoCodec(codec: string): FfmpegCommand;
    audioCodec(codec: string): FfmpegCommand;
    noAudio(): FfmpegCommand;
    fps(fps: number): FfmpegCommand;
    duration(duration: number | string): FfmpegCommand;
    loop(duration: number): FfmpegCommand;
    output(target: string | Writable): FfmpegCommand;
    outputFormat(format: string): FfmpegCommand;
    outputOptions(options: string | string[]): FfmpegCommand;
    format(format: string): FfmpegCommand;
    complexFilter(filters: string | string[] | Array<string | string[]>): FfmpegCommand;
    addOption(option: string): FfmpegCommand;
    addOptions(options: string | string[]): FfmpegCommand;
    seekInput(seek: number | string): FfmpegCommand;
    save(filename: string): FfmpegCommand;
    pipe<T extends Writable>(stream: T, options?: { end?: boolean }): T;
    run(): FfmpegCommand;
    kill(signal?: NodeJS.Signals | number): FfmpegCommand;
    on<Event extends keyof FfmpegEventMap>(event: Event, listener: FfmpegEventMap[Event]): FfmpegCommand;
    on(event: string, listener: (...args: unknown[]) => void): FfmpegCommand;
  }

  export interface FfmpegStatic {
    (input?: string | Readable | Buffer): FfmpegCommand;
    setFfmpegPath(path: string): void;
    setFfprobePath(path: string): void;
    ffprobe(
      input: string | Readable | Buffer,
      callback: (error: Error | null, metadata: Record<string, unknown>) => void,
    ): void;
  }

  const ffmpeg: FfmpegStatic;
  export default ffmpeg;
}
