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

  it('rejects GIF backgrounds', () => {
    expect(() =>
      parseMiddlemanCardConfig({
        background: {
          type: 'gif' as never,
          url: 'https://cdn.example.com/background.gif',
        },
      }),
    ).toThrowError(/Only static PNG media is supported/);
  });

  it('rejects GIF side media', () => {
    expect(() =>
      parseMiddlemanCardConfig({
        sideMedia: {
          type: 'gif' as never,
          url: 'https://cdn.example.com/side.gif',
          width: 260,
        },
      }),
    ).toThrowError(/Only static PNG media is supported/);
  });
});
