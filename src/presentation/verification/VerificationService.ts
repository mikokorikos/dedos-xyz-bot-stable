// =============================================================================
// RUTA: src/presentation/verification/VerificationService.ts
// =============================================================================

import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  AttachmentBuilder,
  type GuildMember,
  type MessageCreateOptions,
  type MessageReaction,
  type PartialMessageReaction,
  type User,
} from 'discord.js';
import type { Logger } from 'pino';

import {
  buildVerificationCompletedEmbed,
  buildVerificationRulesEmbed,
} from '@/presentation/embeds/verificationEmbeds';
import { resolveDedosAsset } from '@/shared/config/branding';
import type { Env } from '@/shared/config/env';
import { brandMessageOptions } from '@/shared/utils/branding';

const STATE_FILE_NAME = 'verification-state.json';

export interface VerificationServiceOptions {
  readonly env: Env;
  readonly logger: Logger;
}

interface PersistedState {
  readonly verificationMessageId: string | null;
}

const ensureDirectory = async (filePath: string): Promise<void> => {
  await fs.mkdir(dirname(filePath), { recursive: true });
};

export class VerificationService {
  private readonly env: Env;

  private readonly logger: Logger;

  private state: PersistedState;

  private readonly stateFilePath: string;

  public constructor(options: VerificationServiceOptions) {
    this.env = options.env;
    this.logger = options.logger;
    this.stateFilePath = resolve(process.cwd(), 'config', STATE_FILE_NAME);
    this.state = { verificationMessageId: options.env.VERIFICATION_MESSAGE_ID ?? null };
  }

  public get verificationMessageId(): string | null {
    return this.state.verificationMessageId;
  }

  public async init(): Promise<void> {
    try {
      const raw = await fs.readFile(this.stateFilePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      const messageId = typeof (parsed as { verificationMessageId?: unknown }).verificationMessageId === 'string'
        ? (parsed as { verificationMessageId: string }).verificationMessageId
        : null;

      if (messageId) {
        this.state = { verificationMessageId: messageId };
        this.logger.debug('[VERIFY] Estado restaurado desde disco.');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        this.logger.warn({ err: error }, '[VERIFY] No se pudo cargar el estado persistido.');
      }
    }
  }

  public async persistMessageId(messageId: string | null): Promise<void> {
    this.state = { verificationMessageId: messageId };

    try {
      await ensureDirectory(this.stateFilePath);
      await fs.writeFile(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf8');
      this.logger.info({ messageId }, '[VERIFY] Mensaje de verificación actualizado.');
    } catch (error) {
      this.logger.warn({ err: error }, '[VERIFY] No se pudo persistir el estado de verificación.');
    }
  }

  public buildRulesEmbed(): ReturnType<typeof buildVerificationRulesEmbed> {
    return buildVerificationRulesEmbed();
  }

  public buildRulesAttachments(): AttachmentBuilder[] {
    if (!this.env.WELCOME_GIF_PATH) {
      return [];
    }

    try {
      const filePath = resolveDedosAsset(this.env.WELCOME_GIF_PATH);
      return [new AttachmentBuilder(filePath).setName('dedosgif.gif')];
    } catch (error) {
      this.logger.warn({ err: error }, '[VERIFY] No se pudo cargar el GIF configurado.');
      return [];
    }
  }

  public async handleReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User,
  ): Promise<void> {
    const verificationChannelId = this.env.VERIFICATION_CHANNEL_ID;
    const roleId = this.env.VERIFIED_ROLE_ID;

    if (!verificationChannelId || !roleId) {
      return;
    }

    const message = reaction.message;
    if (!message.inGuild() || message.channelId !== verificationChannelId) {
      return;
    }

    if (this.verificationMessageId && message.id !== this.verificationMessageId) {
      return;
    }

    if ((reaction.emoji.name ?? '') !== '✅') {
      return;
    }

    let member: GuildMember | null = null;

    try {
      member = await message.guild.members.fetch(user.id);
    } catch (error) {
      this.logger.error({ err: error, userId: user.id }, '[VERIFY] No se pudo obtener al miembro para asignar el rol.');
      return;
    }

    if (!member || member.roles.cache.has(roleId)) {
      return;
    }

    try {
      await member.roles.add(roleId, 'Verificación mediante reacción en reglas');
    } catch (error) {
      this.logger.error({ err: error, userId: member.id }, '[VERIFY] No se pudo asignar el rol durante la verificación.');
      return;
    }

    const dmPayload = this.buildVerificationDm(member.id);

    try {
      await user.send(dmPayload);
    } catch (error) {
      this.logger.warn({ err: error, userId: user.id }, '[VERIFY] No se pudo enviar el DM de verificación.');
    }

    this.logger.info({ userId: member.id }, '[VERIFY] Rol de verificación asignado mediante reacción.');
  }

  private buildVerificationDm(memberId: string): MessageCreateOptions {
    const embed = buildVerificationCompletedEmbed({
      helpCenterUrl: this.env.HELP_CENTER_URL,
      communityUrl: this.env.COMMUNITY_URL,
      memberId,
    });

    const files = this.buildRulesAttachments();

    return brandMessageOptions(
      {
        embeds: [embed],
        files: files.length > 0 ? files : undefined,
        content: this.env.COMMUNITY_URL ?? undefined,
      },
      { useHeroImage: true },
    );
  }
}
