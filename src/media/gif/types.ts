// ============================================================================
// RUTA: src/media/gif/types.ts
// ============================================================================

import type { ImageData } from '@napi-rs/canvas';

export interface GifFrame {
  readonly imageData: ImageData;
  readonly delayCentiseconds: number;
}

export interface GifMetadata {
  readonly width: number;
  readonly height: number;
  readonly loopCount: number | null;
}

export interface DecodedGif {
  readonly metadata: GifMetadata;
  readonly frames: ReadonlyArray<GifFrame>;
}
