// =============================================================================
// RUTA: src/presentation/verification/HelpMenuService.ts
// =============================================================================

import {
  ActionRowBuilder,
  EmbedBuilder,
  type InteractionReplyOptions,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import type { Logger } from 'pino';

import { DEDOS_BRAND } from '@/shared/config/branding';
import type { Env } from '@/shared/config/env';
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
      .setPlaceholder('Selecciona una pregunta frecuente')
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

    const response = this.buildResponse(option, interaction);
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
      new StringSelectMenuOptionBuilder().setLabel('¿Cómo verificarse?').setValue('verification'),
      new StringSelectMenuOptionBuilder().setLabel('¿Qué ofrece Dedos Shop?').setValue('services'),
      new StringSelectMenuOptionBuilder().setLabel('¿Cómo comprar o vender?').setValue('tickets'),
    ];
  }

  private buildResponse(option: string, interaction: StringSelectMenuInteraction): InteractionReplyOptions | null {
    switch (option) {
      case 'verification':
        return this.buildVerificationHelp(interaction);
      case 'services':
        return this.buildServicesHelp();
      case 'tickets':
        return this.buildTicketsHelp();
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

    const embed = new EmbedBuilder()
      .setColor(DEDOS_BRAND.accentColor)
      .setTitle('Verificación del servidor')
      .setDescription(
        [
          'Para acceder a todos los canales pulsa el botón **Verificarme** en el mensaje de reglas.',
          `Puedes abrirlo directamente aquí: ${link}`,
          'Si el botón no aparece, vuelve a publicar las reglas con `/rules`.',
        ].join('\n'),
      )
      .setFooter({ text: DEDOS_BRAND.footer.text, iconURL: DEDOS_BRAND.footer.iconURL });

    return brandReplyOptions({ embeds: [embed], ephemeral: true });
  }

  private buildServicesHelp(): InteractionReplyOptions {
    const embed = new EmbedBuilder()
      .setColor(DEDOS_BRAND.color)
      .setTitle('¿Qué puedo hacer en Dedos Shop?')
      .setDescription(
        [
          '• Usa nuestro middleman oficial para trades seguros sin propinas obligatorias.',
          '• Compra productos y servicios con precios actualizados en MXN y USD.',
          '• Comparte sugerencias y participa en eventos de la comunidad.',
        ].join('\n'),
      )
      .setFooter({ text: DEDOS_BRAND.footer.text, iconURL: DEDOS_BRAND.footer.iconURL });

    return brandReplyOptions({ embeds: [embed], ephemeral: true });
  }

  private buildTicketsHelp(): InteractionReplyOptions {
    const embed = new EmbedBuilder()
      .setColor(DEDOS_BRAND.color)
      .setTitle('Compras, ventas y soporte')
      .setDescription(
        [
          '• Abre un ticket desde el panel de `/tickets panel` para recibir atención personalizada.',
          '• Comparte los detalles de tu compra/venta para obtener una cotización rápida.',
          '• Revisa los métodos de pago y cláusulas en el panel antes de confirmar el trato.',
        ].join('\n'),
      )
      .setFooter({ text: DEDOS_BRAND.footer.text, iconURL: DEDOS_BRAND.footer.iconURL });

    return brandReplyOptions({ embeds: [embed], ephemeral: true });
  }
}
