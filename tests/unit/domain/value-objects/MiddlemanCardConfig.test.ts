import { describe, expect, it } from 'vitest';

import { parseMiddlemanCardConfig } from '@/domain/value-objects/MiddlemanCardConfig';

describe('MiddlemanCardConfig schema', () => {
  it('normalizes optional media entries to image types', () => {
    const config = parseMiddlemanCardConfig({
      background: {
        url: 'https://cdn.example.com/background.png',
      },
      sideMedia: {
        url: 'https://cdn.example.com/side.png',
        width: 280,
      },
    });

    expect(config.background?.type).toBe('image');
    expect(config.sideMedia?.type).toBe('image');
  });

  it('normalizes GIF backgrounds as supported media', () => {
    const config = parseMiddlemanCardConfig({
      background: {
        type: 'gif',
        url: 'https://cdn.example.com/background.gif',
      },
    });

    expect(config.background?.type).toBe('gif');
  });

  it('normalizes GIF side media as supported media', () => {
    const config = parseMiddlemanCardConfig({
      sideMedia: {
        type: 'gif',
        url: 'https://cdn.example.com/side.gif',
        width: 260,
      },
    });

    expect(config.sideMedia?.type).toBe('gif');
  });
});
