// =============================================================================
// RUTA: src/presentation/verification/HelpMenuService.ts
// =============================================================================

import {
  ActionRowBuilder,
  type InteractionReplyOptions,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import type { Logger } from 'pino';

import {
  buildVerificationHelpEmbed,
  buildVerificationServicesHelpEmbed,
  buildVerificationTicketsHelpEmbed,
} from '@/presentation/embeds/verificationEmbeds';
import type { Env } from '@/shared/config/env';
import {
  FEATURE_DISPLAY_NAMES,
  FEATURE_FLAG_ENV_KEYS,
  getFeatureFlags,
  type FeatureFlagKey,
} from '@/shared/config/runtime';
import { brandReplyOptions } from '@/shared/utils/branding';

import type { VerificationService } from './VerificationService';

interface HelpMenuServiceOptions {
  readonly env: Env;
  readonly logger: Logger;
  readonly verificationService: VerificationService;
}

export class HelpMenuService {
  private readonly env: Env;

  private readonly logger: Logger;

  private readonly verificationService: VerificationService;

  public constructor(options: HelpMenuServiceOptions) {
    this.env = options.env;
    this.logger = options.logger;
    this.verificationService = options.verificationService;
  }

  public get customId(): string {
    return this.env.HELP_MENU_CUSTOM_ID;
  }

  public buildMenuRow(): ActionRowBuilder<StringSelectMenuBuilder> {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(this.customId)
      .setPlaceholder('Elige una pregunta de ayuda')
      .addOptions(this.buildOptions());

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  }

  public async handleInteraction(interaction: StringSelectMenuInteraction): Promise<void> {
    const option = interaction.values.at(0);
    if (!option) {
      await interaction.reply(
        brandReplyOptions({
          content: 'Selecciona una opción válida para continuar.',
          ephemeral: true,
        }),
      );
      return;
    }

    const response = await this.buildResponse(option, interaction);
    if (!response) {
      this.logger.warn({ option }, '[HELP] Opción de menú no reconocida.');
      await interaction.reply(
        brandReplyOptions({
          content: 'Esa opción ya no está disponible.',
          ephemeral: true,
        }),
      );
      return;
    }

    await interaction.reply(response);
  }

  private buildOptions(): StringSelectMenuOptionBuilder[] {
    return [
      new StringSelectMenuOptionBuilder().setLabel('Eventos y premios').setValue('events'),
      new StringSelectMenuOptionBuilder().setLabel('¿Qué puedo hacer en el servidor?').setValue('server'),
      new StringSelectMenuOptionBuilder().setLabel('¿Cómo verificarse?').setValue('verify'),
    ];
  }

  private async buildResponse(
    option: string,
    interaction: StringSelectMenuInteraction,
  ): Promise<InteractionReplyOptions | null> {
    switch (option) {
      case 'events':
        return this.buildEventsHelp();
      case 'server':
        return this.buildServicesHelp();
      case 'verify':
        return this.buildVerificationHelp(interaction);
      default:
        this.logger.warn({ option }, '[HELP] Solicitud de ayuda desconocida.');
        return null;
    }
  }

  private buildVerificationHelp(interaction: StringSelectMenuInteraction): InteractionReplyOptions {
    const messageId = this.verificationService.verificationMessageId;
    const channelId = this.env.VERIFICATION_CHANNEL_ID;
    const guildId = interaction.guildId ?? this.env.DISCORD_GUILD_ID ?? '0';

    const link = messageId && channelId
      ? `https://discord.com/channels/${guildId}/${channelId}/${messageId}`
      : this.env.COMMUNITY_URL;

    const embed = buildVerificationHelpEmbed(link);

    return brandReplyOptions({ embeds: [embed], ephemeral: true });
  }

  private async buildServicesHelp(): Promise<InteractionReplyOptions> {
    const features = await getFeatureFlags();
    const statusLines = Object.entries(features).map(([key, value]) => {
      const featureKey = key as FeatureFlagKey;
      const label = FEATURE_DISPLAY_NAMES[featureKey];
      const envKey = FEATURE_FLAG_ENV_KEYS[featureKey];
      const prefix = value ? '✅' : '🚫';
      return `${prefix} ${label} (env: ${envKey})`;
    });

    const embed = buildVerificationServicesHelpEmbed(statusLines);

    return brandReplyOptions({ embeds: [embed], ephemeral: true });
  }

  private buildEventsHelp(): InteractionReplyOptions {
    const embed = buildVerificationTicketsHelpEmbed();

    return brandReplyOptions({ embeds: [embed], ephemeral: true });
  }
}
