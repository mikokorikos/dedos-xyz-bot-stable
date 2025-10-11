// ============================================================================
// RUTA: src/media/gif/GifRemoteFetcher.ts
// ============================================================================

import { URL } from 'node:url';

export class GifRemoteFetcher {
  public async fetch(sourceUrl: string): Promise<Buffer> {
    const url = new URL(sourceUrl);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`No se pudo descargar el GIF. Código de estado ${response.status}.`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
