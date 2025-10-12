// =============================================================================
// RUTA: src/presentation/verification/VerificationService.ts
// =============================================================================

import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  type GuildMember,
  type MessageCreateOptions,
} from 'discord.js';
import type { Logger } from 'pino';

import { DEDOS_BRAND, resolveDedosAsset } from '@/shared/config/branding';
import type { Env } from '@/shared/config/env';
import { brandReplyOptions } from '@/shared/utils/branding';

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

  public get buttonCustomId(): string {
    return this.env.VERIFY_BUTTON_CUSTOM_ID;
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

  public buildRulesEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(DEDOS_BRAND.color)
      .setTitle('📜 Reglas y verificación de Dedos Shop')
      .setDescription(
        [
          'Para mantener una comunidad segura y divertida sigue estas indicaciones:',
          '',
          '1. Respeta a todos los miembros. Bromas son bienvenidas, el acoso no.',
          '2. Usa los canales correctos para cada tema y evita el spam.',
          '3. Los trades deben realizarse con middleman oficial o bajo tu propio riesgo.',
          '4. Prohibido contenido NSFW, malware o enlaces sospechosos.',
          '5. El staff puede sancionar a su discreción ante cualquier incumplimiento grave.',
          '',
          'Pulsa el botón **Verificarme** para obtener acceso completo al servidor.',
        ].join('\n'),
      )
      .setFooter({ text: DEDOS_BRAND.footer.text, iconURL: DEDOS_BRAND.footer.iconURL })
      .setTimestamp();
  }

  public createComponents(): ActionRowBuilder<ButtonBuilder>[] {
    const verifyButton = new ButtonBuilder()
      .setCustomId(this.buttonCustomId)
      .setLabel('Verificarme')
      .setStyle(ButtonStyle.Success);

    return [new ActionRowBuilder<ButtonBuilder>().addComponents(verifyButton)];
  }

  public buildRulesAttachments(): AttachmentBuilder[] {
    if (!this.env.WELCOME_GIF_PATH) {
      return [];
    }

    try {
      const filePath = resolveDedosAsset(this.env.WELCOME_GIF_PATH);
      return [new AttachmentBuilder(filePath).setName('dedos-welcome.gif')];
    } catch (error) {
      this.logger.warn({ err: error }, '[VERIFY] No se pudo cargar el GIF configurado.');
      return [];
    }
  }

  public async verify(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
      await interaction.reply(
        brandReplyOptions({
          content: 'Esta acción solo está disponible dentro del servidor.',
          ephemeral: true,
        }),
      );
      return;
    }

    const roleId = this.env.VERIFIED_ROLE_ID;
    if (!roleId) {
      await interaction.reply(
        brandReplyOptions({
          content: 'El rol de verificación no está configurado. Contacta a un administrador.',
          ephemeral: true,
        }),
      );
      return;
    }

    const guild = interaction.guild;
    let member: GuildMember | null = null;

    try {
      member = await guild.members.fetch(interaction.user.id);
    } catch (error) {
      this.logger.error({ err: error, userId: interaction.user.id }, '[VERIFY] No se pudo obtener al miembro.');
    }

    if (!member) {
      await interaction.reply(
        brandReplyOptions({
          content: 'No se pudo recuperar tu información de miembro. Intenta nuevamente en unos segundos.',
          ephemeral: true,
        }),
      );
      return;
    }

    if (member.roles.cache.has(roleId)) {
      await interaction.reply(
        brandReplyOptions({
          content: 'Ya estás verificado. ¡Disfruta del servidor!',
          ephemeral: true,
        }),
      );
      return;
    }

    try {
      await member.roles.add(roleId, 'Verificación mediante panel de reglas');
    } catch (error) {
      this.logger.error({ err: error, userId: member.id }, '[VERIFY] No se pudo asignar el rol.');
      await interaction.reply(
        brandReplyOptions({
          content: 'No pude asignarte el rol. Intenta nuevamente o contacta al staff.',
          ephemeral: true,
        }),
      );
      return;
    }

    const dmPayload = this.buildVerificationDm();

    try {
      await interaction.user.send(dmPayload);
    } catch (error) {
      this.logger.warn({ err: error, userId: interaction.user.id }, '[VERIFY] No se pudo enviar el DM de verificación.');
    }

    await interaction.reply(
      brandReplyOptions({
        content: '✅ ¡Listo! Ya tienes acceso completo al servidor.',
        ephemeral: true,
      }),
    );
  }

  private buildVerificationDm(): MessageCreateOptions {
    const embed = new EmbedBuilder()
      .setColor(DEDOS_BRAND.accentColor)
      .setTitle('🎉 ¡Verificación completada!')
      .setDescription(
        [
          'Gracias por verificarte en **Dedos Shop**.',
          'Explora los canales desbloqueados, revisa las reglas fijadas y abre un ticket si necesitas ayuda.',
          `Enlace útil: ${this.env.HELP_CENTER_URL ?? this.env.COMMUNITY_URL}`,
        ].join('\n'),
      )
      .setFooter({ text: DEDOS_BRAND.footer.text, iconURL: DEDOS_BRAND.footer.iconURL })
      .setTimestamp();

    const files = this.buildRulesAttachments();

    return {
      embeds: [embed],
      files: files.length > 0 ? files : undefined,
      content: this.env.COMMUNITY_URL,
    };
  }
}
