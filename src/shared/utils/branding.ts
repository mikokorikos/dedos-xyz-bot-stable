// ============================================================================
// RUTA: src/shared/utils/branding.ts
// ============================================================================

import { existsSync } from 'node:fs';
import { basename } from 'node:path';

import type {
  APIAttachment,
  APIEmbed,
  Attachment,
  AttachmentBuilder,
  AttachmentPayload,
  BufferResolvable,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  JSONEncodable,
  MessageCreateOptions,
  MessageEditOptions,
} from 'discord.js';
import { AttachmentBuilder as DiscordAttachmentBuilder, EmbedBuilder } from 'discord.js';
import type { Stream } from 'stream';

import { DEDOS_BRAND, resolveDedosAsset } from '@/shared/config/branding';

const heroImageSource = typeof DEDOS_BRAND.imageURL === 'string' && DEDOS_BRAND.imageURL.length > 0
  ? DEDOS_BRAND.imageURL
  : null;

const heroImageRelativePath = heroImageSource && !heroImageSource.startsWith('http') ? heroImageSource : null;
const heroImageName = heroImageRelativePath ? basename(heroImageRelativePath) : null;
const heroImageAbsolutePath = heroImageRelativePath ? resolveDedosAsset(heroImageRelativePath) : null;

const resolveHeroImageSource = (): string | null => {
  if (!heroImageSource) {
    return null;
  }

  if (!heroImageRelativePath) {
    return heroImageSource;
  }

  if (!heroImageName || !heroImageAbsolutePath || !existsSync(heroImageAbsolutePath)) {
    return null;
  }

  return `attachment://${heroImageName}`;
};

export interface BrandDecorations {
  readonly useHeroImage?: boolean;
  readonly color?: number;
  readonly timestamp?: Date;
}

const createHeroImageAttachment = (): AttachmentBuilder | null => {
  if (!heroImageRelativePath || !heroImageName || !heroImageAbsolutePath) {
    return null;
  }

  if (!existsSync(heroImageAbsolutePath)) {
    return null;
  }

  return new DiscordAttachmentBuilder(heroImageAbsolutePath, {
    name: heroImageName,
  });
};

type AttachmentLike =
  | BufferResolvable
  | AttachmentBuilder
  | Stream
  | JSONEncodable<APIAttachment>
  | Attachment
  | AttachmentPayload;

interface BrandableOptions {
  embeds?: readonly (APIEmbed | JSONEncodable<APIEmbed> | EmbedBuilder)[];
  files?: readonly AttachmentLike[];
}

const ensureHeroImageIncluded = (
  files: readonly AttachmentLike[] | undefined,
): readonly AttachmentLike[] | undefined => {
  if (!heroImageRelativePath || !heroImageName || !heroImageAbsolutePath) {
    return files;
  }

  const existingFiles = files ? Array.from(files) : [];
  const alreadyIncluded = existingFiles.some(
    (file) => file instanceof DiscordAttachmentBuilder && file.name === heroImageName,
  );

  if (!alreadyIncluded) {
    const attachment = createHeroImageAttachment();
    if (attachment) {
      existingFiles.push(attachment);
    }
  }

  return existingFiles;
};

export const applyDedosBrand = <T extends EmbedBuilder>(
  embed: T,
  decorations: BrandDecorations = {},
): T => {
  const desiredColor = decorations.color ?? DEDOS_BRAND.color;
  if (!embed.data.color || decorations.color !== undefined) {
    embed.setColor(desiredColor);
  }

  if (!embed.data.author) {
    embed.setAuthor(DEDOS_BRAND.author);
  }

  if (!embed.data.thumbnail) {
    embed.setThumbnail(DEDOS_BRAND.thumbnailURL);
  }

  if (!embed.data.footer) {
    embed.setFooter({
      text: DEDOS_BRAND.footer.text,
      iconURL: DEDOS_BRAND.footer.iconURL,
    });
  }

  if (!embed.data.timestamp) {
    embed.setTimestamp(decorations.timestamp ?? new Date());
  }

  const shouldUseHeroImage = decorations.useHeroImage !== false;
  const heroImageUrl = resolveHeroImageSource();
  if (shouldUseHeroImage && heroImageUrl && !embed.data.image) {
    embed.setImage(heroImageUrl);
  }

  return embed;
};

const decorateEmbeds = (
  embeds: readonly (APIEmbed | JSONEncodable<APIEmbed> | EmbedBuilder)[] | undefined,
  decorations: BrandDecorations,
): readonly (APIEmbed | JSONEncodable<APIEmbed> | EmbedBuilder)[] | undefined => {
  if (!embeds || embeds.length === 0) {
    return embeds;
  }

  return embeds.map((embed) => {
    if (embed instanceof EmbedBuilder) {
      return applyDedosBrand(embed, decorations);
    }

    return embed;
  });
};

const hasHeroImage = (
  embeds: readonly (APIEmbed | JSONEncodable<APIEmbed> | EmbedBuilder)[] | undefined,
  expectedUrl: string | null,
): boolean => {
  if (!embeds) {
    return false;
  }

  if (!expectedUrl) {
    return false;
  }

  const heroUrl = expectedUrl;
  return embeds.some((embed) => {
    if (embed instanceof EmbedBuilder) {
      return embed.data.image?.url === heroUrl;
    }

    if (typeof embed === 'object' && embed !== null && 'image' in embed) {
      const image = (embed).image;
      return Boolean(image && 'url' in image && image?.url === heroUrl);
    }

    return false;
  });
};

const withBranding = <T extends BrandableOptions>(
  options: T,
  decorations: BrandDecorations = {},
): T => {
  if (!options.embeds || options.embeds.length === 0) {
    return options;
  }

  const embeds = decorateEmbeds(options.embeds, decorations);
  const heroUrl = resolveHeroImageSource();
  const wantsHeroImage = decorations.useHeroImage !== false;
  const needsHeroImage = Boolean(heroUrl) && (hasHeroImage(embeds, heroUrl) || wantsHeroImage);
  const files = needsHeroImage ? ensureHeroImageIncluded(options.files) : options.files;

  return {
    ...options,
    embeds,
    files,
  } as T;
};

export const brandReplyOptions = (
  options: InteractionReplyOptions,
  decorations?: BrandDecorations,
): InteractionReplyOptions => withBranding(options, decorations ?? {});

export const brandEditReplyOptions = (
  options: InteractionEditReplyOptions,
  decorations?: BrandDecorations,
): InteractionEditReplyOptions => withBranding(options, decorations ?? {});

export const brandMessageOptions = (
  options: MessageCreateOptions,
  decorations?: BrandDecorations,
): MessageCreateOptions => withBranding(options, decorations ?? {});

export const brandMessageEditOptions = (
  options: MessageEditOptions,
  decorations?: BrandDecorations,
): MessageEditOptions => withBranding(options, decorations ?? {});
