// =============================================================================
// RUTA: src/presentation/services/WelcomeService.ts
// =============================================================================

import { AttachmentBuilder, type GuildMember } from 'discord.js';
import type { Logger } from 'pino';

import { buildWelcomeEmbed } from '@/presentation/embeds/welcomeEmbeds';
import { resolveDedosAsset } from '@/shared/config/branding';
import type { Env } from '@/shared/config/env';
import { brandMessageOptions } from '@/shared/utils/branding';
import { RateLimitedQueue } from '@/shared/utils/rate-limited-queue';

interface WelcomeServiceOptions {
  readonly env: Env;
  readonly logger: Logger;
}

const MAX_DESCRIPTION_LENGTH = 2000;

const sanitizeUrl = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    return url.toString();
  } catch {
    return undefined;
  }
};

export class WelcomeService {
  private readonly env: Env;

  private readonly logger: Logger;

  private readonly queue: RateLimitedQueue;

  private readonly welcomeGifPath: string | null;

  public constructor(options: WelcomeServiceOptions) {
    this.env = options.env;
    this.logger = options.logger;
    this.queue = new RateLimitedQueue({
      intervalMs: options.env.WELCOME_RATE_MS,
      concurrency: options.env.WELCOME_CONCURRENCY,
      maxQueue: options.env.WELCOME_MAX_QUEUE,
      logger: options.logger,
    });

    this.welcomeGifPath = options.env.WELCOME_GIF_PATH ?? null;
  }

  public start(): void {
    this.queue.start();
  }

  public stop(): void {
    this.queue.stop();
  }

  public enqueue(member: GuildMember | null): boolean {
    if (!member) {
      return false;
    }

    return this.queue.push(async () => {
      await this.sendWelcome(member);
    });
  }

  private buildEmbed(member: GuildMember) {
    const verificationLink = this.env.VERIFICATION_CHANNEL_ID
      ? `https://discord.com/channels/${member.guild.id}/${this.env.VERIFICATION_CHANNEL_ID}`
      : sanitizeUrl(this.env.HELP_CENTER_URL) ?? this.env.COMMUNITY_URL;

    const inviteLink = this.env.INVITE_CHANNEL_ID
      ? `https://discord.com/channels/${member.guild.id}/${this.env.INVITE_CHANNEL_ID}`
      : this.env.COMMUNITY_URL;

    const embed = buildWelcomeEmbed({
      memberId: member.id,
      memberCount: member.guild.memberCount,
      verificationLink: verificationLink ?? this.env.COMMUNITY_URL ?? 'https://discord.com',
      inviteLink: inviteLink ?? this.env.COMMUNITY_URL ?? 'https://discord.com',
      communityUrl: this.env.COMMUNITY_URL,
    });

    if (embed.data.description && embed.data.description.length > MAX_DESCRIPTION_LENGTH) {
      embed.setDescription(embed.data.description.slice(0, MAX_DESCRIPTION_LENGTH));
    }

    return embed;
  }

  private buildAttachments(): AttachmentBuilder[] {
    if (!this.welcomeGifPath) {
      return [];
    }

    try {
      const resolved = resolveDedosAsset(this.welcomeGifPath);
      return [new AttachmentBuilder(resolved).setName('welcome.gif')];
    } catch (error) {
      this.logger.warn({ err: error }, '[WELCOME] No se pudo resolver el GIF configurado.');
      return [];
    }
  }

  private async sendWelcome(member: GuildMember): Promise<void> {
    try {
      const embed = this.buildEmbed(member);
      const attachments = this.buildAttachments();
      const files = attachments.length > 0 ? attachments : undefined;

      await member.send(
        brandMessageOptions(
          {
            embeds: [embed],
            files,
            content: this.env.COMMUNITY_URL ?? undefined,
          },
          { useHeroImage: true },
        ),
      );

      this.logger.info({ userId: member.id }, '[WELCOME] DM de bienvenida enviado.');
    } catch (error) {
      this.logger.warn({ err: error, userId: member.id }, '[WELCOME] No se pudo enviar el DM de bienvenida.');
    }
  }
}
