import { describe, expect, it } from 'vitest';

import {
  containsRobuxLikeTerms,
  containsRobuxLikeTermsInCollection,
} from '@/shared/utils/robuxDetection';

describe('containsRobuxLikeTerms', () => {
  it('detects plain robux text', () => {
    expect(containsRobuxLikeTerms('robux')).toBe(true);
  });

  it('detects robux with spaces and emojis', () => {
    const sample = '🚨💸 +60K R💲BUX DISPONIBLES 💸🚨';

    expect(containsRobuxLikeTerms(sample)).toBe(true);
  });

  it('detects obfuscated variants such as bobux', () => {
    expect(containsRobuxLikeTerms('B0BUX con oferta')).toBe(true);
  });

  it('does not flag unrelated text', () => {
    expect(containsRobuxLikeTerms('intercambio de limiteds')).toBe(false);
  });
});

describe('containsRobuxLikeTermsInCollection', () => {
  it('detects robux references inside embed fields', () => {
    const values = ['Disponibles', null, 'Oferta de R💲BUX'];

    expect(containsRobuxLikeTermsInCollection(values)).toBe(true);
  });

  it('ignores when there are no matches', () => {
    const values = ['Midleman disponible', undefined];

    expect(containsRobuxLikeTermsInCollection(values)).toBe(false);
  });
});
