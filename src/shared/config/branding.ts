// ============================================================================
// RUTA: src/shared/config/branding.ts
// ============================================================================

import { resolve } from 'node:path';

interface DedosBrandConfig {
  readonly color: number;
  readonly accentColor: number;
  readonly author: {
    readonly name: string;
    readonly iconURL: string;
  };
  readonly footer: {
    readonly text: string;
    readonly iconURL?: string;
  };
  readonly thumbnailURL: string;
  readonly imageURL: string | null;
}

const heroImageEnv = process.env['DEDOS_HERO_IMAGE_URL']?.trim();
const DEFAULT_HERO_IMAGE_FALLBACK = 'assets/embeds/dedosgif.gif';
const DEFAULT_HERO_IMAGE_SOURCE =
  heroImageEnv && heroImageEnv.length > 0 ? heroImageEnv : DEFAULT_HERO_IMAGE_FALLBACK;

const brandIconEnv = process.env['DEDOS_BRAND_ICON_URL']?.trim();
const DEFAULT_ICON_URL =
  'https://cdn.discordapp.com/attachments/1412699909949358151/1417020355389952031/8acfd3c22d8286c858abb3e9b4bc97cc.jpg';

export const DEDOS_BRAND: DedosBrandConfig = Object.freeze({
  color: 0x5000ab,
  accentColor: 0x5000ab,
  author: {
    name: 'discord.gg/dedos',
    iconURL:
      brandIconEnv && brandIconEnv.startsWith('http') ? brandIconEnv : DEFAULT_ICON_URL,
  },
  footer: {
    text: 'Dedos Shop • discord.gg/dedos',
    iconURL: brandIconEnv && brandIconEnv.startsWith('http') ? brandIconEnv : DEFAULT_ICON_URL,
  },
  thumbnailURL: brandIconEnv && brandIconEnv.startsWith('http') ? brandIconEnv : DEFAULT_ICON_URL,
  imageURL: DEFAULT_HERO_IMAGE_SOURCE,
});

export const resolveDedosAsset = (relativePath: string): string => resolve(process.cwd(), relativePath);
