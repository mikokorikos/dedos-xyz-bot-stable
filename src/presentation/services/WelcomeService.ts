// =============================================================================
// RUTA: src/presentation/services/WelcomeService.ts
// =============================================================================

import { AttachmentBuilder, EmbedBuilder, type GuildMember } from 'discord.js';
import type { Logger } from 'pino';

import { DEDOS_BRAND, resolveDedosAsset } from '@/shared/config/branding';
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

  private buildEmbed(member: GuildMember): EmbedBuilder {
    const verificationLink = this.env.VERIFICATION_CHANNEL_ID
      ? `https://discord.com/channels/${member.guild.id}/${this.env.VERIFICATION_CHANNEL_ID}`
      : sanitizeUrl(this.env.HELP_CENTER_URL) ?? this.env.COMMUNITY_URL;

    const inviteLink = this.env.INVITE_CHANNEL_ID
      ? `https://discord.com/channels/${member.guild.id}/${this.env.INVITE_CHANNEL_ID}`
      : this.env.COMMUNITY_URL;

    const descriptionLines = [
      `Hola <@${member.id}>, ¡bienvenido a **Dedos Shop**! ✨`,
      '',
      `Ahora somos **${member.guild.memberCount}** miembros.`,
      'Para desbloquear el servidor verifica tu cuenta en el canal correspondiente.',
      `• Verificación: ${verificationLink}`,
      `• Invitación: ${inviteLink}`,
      '',
      'Revisa los canales fijados para conocer reglas, anuncios y promociones.',
      '¿Necesitas ayuda? Usa `/help` o abre un ticket desde el panel.',
      '',
      'Este servidor está enfocado en trades seguros, middleman y ventas confiables.',
      '¡Disfruta tu estancia y comparte la comunidad con tus amigos! 👋',
    ];

    const description = descriptionLines.join('\n').slice(0, MAX_DESCRIPTION_LENGTH);

    const embed = new EmbedBuilder()
      .setColor(DEDOS_BRAND.color)
      .setTitle('🎉 ¡Bienvenido a Dedos Shop!')
      .setAuthor({ name: DEDOS_BRAND.author.name, iconURL: DEDOS_BRAND.author.iconURL })
      .setDescription(description)
      .setFooter({ text: DEDOS_BRAND.footer.text, iconURL: DEDOS_BRAND.footer.iconURL })
      .setTimestamp();

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
        brandMessageOptions({
          embeds: [embed],
          files,
          content: this.env.COMMUNITY_URL,
        }),
      );

      this.logger.info({ userId: member.id }, '[WELCOME] DM de bienvenida enviado.');
    } catch (error) {
      this.logger.warn({ err: error, userId: member.id }, '[WELCOME] No se pudo enviar el DM de bienvenida.');
    }
  }
}
