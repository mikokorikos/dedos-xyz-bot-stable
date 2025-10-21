// =============================================================================
// RUTA: src/presentation/components/modals/TicketCloseReasonModal.ts
// =============================================================================

import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

const REASON_FIELD_ID = 'reason';

export class TicketCloseReasonModal {
  public static readonly CUSTOM_ID = 'ticket-close:reason';

  public static build(): ModalBuilder {
    return new ModalBuilder()
      .setCustomId(TicketCloseReasonModal.CUSTOM_ID)
      .setTitle('Cerrar ticket de soporte')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(REASON_FIELD_ID)
            .setLabel('Motivo del cierre')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Ej. "Completado" o "Sin respuesta del usuario"')
            .setMinLength(10)
            .setMaxLength(1000)
            .setRequired(true),
        ),
      );
  }

  public static extractReason(interaction: { fields: { getTextInputValue(customId: string): string } }): string {
    return interaction.fields.getTextInputValue(REASON_FIELD_ID).trim();
  }
}
