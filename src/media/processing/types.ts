// ============================================================================
// RUTA: src/media/processing/types.ts
// ============================================================================

import type { SKRSContext2D } from '@napi-rs/canvas';

import type { GifFrame } from '@/media/gif/types';

export interface FrameMetadata {
  readonly index: number;
  readonly width: number;
  readonly height: number;
}

export interface FrameOperationContext {
  readonly context: SKRSContext2D;
  readonly metadata: FrameMetadata;
  readonly frame: GifFrame;
}

export interface FrameOperation {
  apply(context: FrameOperationContext): Promise<void> | void;
}
