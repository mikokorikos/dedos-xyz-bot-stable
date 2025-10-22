// ============================================================================
// RUTA: src/presentation/tickets/TicketPanelBuilder.ts
// ============================================================================

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type GuildMember,
  StringSelectMenuBuilder,
} from 'discord.js';

import { TicketType } from '@/domain/entities/types';
import {
  buildDecorationsTicketEmbed,
  buildNitroTicketEmbed,
  buildRobuxTicketEmbed,
  buildTicketIntroEmbed,
  buildTicketPanelOverviewEmbed,
} from '@/presentation/embeds/ticketPanelEmbeds';
import { fxService } from '@/presentation/services/community';
import { env } from '@/shared/config/env';
import { ValidationFailedError } from '@/shared/errors/domain.errors';

export const TICKET_PANEL_MENU_ID = env.TICKET_SELECT_MENU_ID ?? 'dedos:ticket:menu';
export const TICKET_OPEN_BUTTON_PREFIX = env.TICKET_OPEN_BUTTON_PREFIX ?? 'dedos:ticket:open:';
export const TICKET_CLOSE_BUTTON_ID = env.TICKET_CLOSE_BUTTON_ID ?? 'dedos:ticket:close';

type TicketEmbed = ReturnType<typeof buildTicketPanelOverviewEmbed>;

interface ShopTicketOption {
  readonly id: string;
  readonly type: TicketType;
  readonly menuLabel: string;
  readonly menuDescription: string;
  readonly channelPrefix: string;
  readonly emoji?: string;
  readonly introLines: readonly string[];
  readonly embedBuilder: () => TicketEmbed;
}

const formatTicketNumber = (ticketId: number): string => ticketId.toString().padStart(4, '0');

const SHOP_OPTIONS: readonly ShopTicketOption[] = [
  {
    id: 'buy_robux',
    type: TicketType.ROBUX,
    menuLabel: 'Comprar Robux',
    menuDescription: 'Elige grupo, juego o gamepass y abre tu ticket.',
    channelPrefix: 'robux',
    emoji: '💎',
    introLines: [
      'Indica si prefieres recibir Robux por grupo, juego o gamepass.',
      'Comparte tu usuario de Roblox y cualquier detalle adicional.',
      'Asegúrate de leer las condiciones y tiempos detallados en la información.',
    ],
    embedBuilder: () =>
      buildRobuxTicketEmbed({
        priceByGroup: fxService.formatUsdFromMxn(125),
        priceByGame: fxService.formatUsdFromMxn(125),
        priceByGamepass: fxService.formatUsdFromMxn(135),
        infoField: fxService.buildInfoField(),
        iconUrl: env.TICKET_BRAND_ICON_URL,
      }),
  },
  {
    id: 'buy_nitro',
    type: TicketType.NITRO,
    menuLabel: 'Comprar N17r0 B005tz',
    menuDescription: 'Reserva b005tz legales al mejor precio.',
    channelPrefix: 'n17r0',
    emoji: '🚀',
    introLines: [
      'Dinos cuantos meses de N17r0 B005tz necesitas y para que servidor.',
      'Comparte el metodo de pago y, si aplica, la fecha en la que lo requieres.',
      'Recuerda que el stock es limitado y puede agotarse rapidamente.',
    ],
    embedBuilder: () =>
      buildNitroTicketEmbed({
        price: fxService.formatUsdFromMxn(95),
        infoField: fxService.buildInfoField(),
        iconUrl: env.TICKET_BRAND_ICON_URL,
      }),
  },
  {
    id: 'buy_decor',
    type: TicketType.DECOR,
    menuLabel: 'Comprar decoraciones',
    menuDescription: 'Obtén efectos y regalos premium más baratos.',
    channelPrefix: 'decor',
    emoji: '🎁',
    introLines: [
      'Enumera las decoraciones o efectos que te interesan y sus precios.',
      'Indica si necesitas el regalo para un perfil específico o para ti.',
      'Te confirmaremos disponibilidad y pasos a seguir para cerrar la compra.',
    ],
    embedBuilder: () =>
      buildDecorationsTicketEmbed({
        infoField: fxService.buildInfoField(),
        iconUrl: env.TICKET_BRAND_ICON_URL,
      }),
  },
];

const SHOP_OPTION_MAP = new Map(SHOP_OPTIONS.map((option) => [option.id, option] as const));

const PANEL_ENTRIES = [
  ...SHOP_OPTIONS.map((option) => ({
    value: option.id,
    label: option.menuLabel,
    description: option.menuDescription.slice(0, 100),
    emoji: option.emoji,
    type: option.type,
  })),
  {
    value: 'mm',
    label: 'Middleman dedicado',
    description: 'Pide ayuda del staff para trades externos a la tienda.',
    emoji: '🛡️',
    type: TicketType.MM,
  },
];

const buildPanelEmbed = (): TicketEmbed =>
  buildTicketPanelOverviewEmbed({
    infoField: fxService.buildInfoField(),
    iconUrl: env.TICKET_BRAND_ICON_URL,
  });

export const buildTicketPanelMessage = (): {
  readonly embeds: TicketEmbed[];
  readonly components: [ActionRowBuilder<StringSelectMenuBuilder>];
  readonly allowedMentions: { readonly parse: [] };
} => {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(TICKET_PANEL_MENU_ID)
    .setPlaceholder('Selecciona el servicio que necesitas')
    .addOptions(
      PANEL_ENTRIES.map((entry) => ({
        label: entry.label,
        value: entry.value,
        description: entry.description,
        emoji: entry.emoji,
      })),
    );

  return {
    embeds: [buildPanelEmbed()],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    allowedMentions: { parse: [] as const },
  };
};

export const buildTicketPreview = (
  optionId: string,
): { readonly embeds: TicketEmbed[]; readonly components: [ActionRowBuilder<ButtonBuilder>] } | null => {
  const option = SHOP_OPTION_MAP.get(optionId);
  if (!option) {
    return null;
  }

  const button = new ButtonBuilder()
    .setCustomId(`${TICKET_OPEN_BUTTON_PREFIX}${option.id}`)
    .setLabel('Abrir ticket')
    .setStyle(ButtonStyle.Primary);

  return {
    embeds: [option.embedBuilder()],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
  };
};

export const buildTicketIntroMessage = (
  option: ShopTicketOption,
  member: GuildMember,
  staffRoleIds: readonly string[],
  ticketId: number,
): {
  readonly content: string;
  readonly embeds: TicketEmbed[];
  readonly components: [ActionRowBuilder<ButtonBuilder>];
  readonly allowedMentions: { readonly users: string[]; readonly roles: string[] };
} => {
  const ticketNumber = formatTicketNumber(ticketId);
  const introLines = [`Hola <@${member.id}> 👋`, ...option.introLines];

  const embed = buildTicketIntroEmbed({
    ticketNumber,
    menuLabel: option.menuLabel,
    introLines,
    iconUrl: env.TICKET_BRAND_ICON_URL,
  });

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(TICKET_CLOSE_BUTTON_ID)
      .setLabel('Cerrar ticket')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️'),
  );

  const mentions = [member.toString(), ...staffRoleIds.map((roleId) => `<@&${roleId}>`)];

  return {
    content: mentions.join(' '),
    embeds: [embed],
    components: [buttonRow],
    allowedMentions: { users: [member.id], roles: [...staffRoleIds] },
  };
};

export const resolveTicketSelection = (value: string): { readonly type: TicketType; readonly option?: ShopTicketOption } => {
  const entry = PANEL_ENTRIES.find((candidate) => candidate.value === value);
  if (!entry) {
    throw new ValidationFailedError({ ticketType: 'El tipo de ticket seleccionado no está disponible.' });
  }

  const option = SHOP_OPTION_MAP.get(entry.value);

  return { type: entry.type, option: option ?? undefined };
};

export const getShopOptionByButton = (customId: string): ShopTicketOption | null => {
  if (!customId.startsWith(TICKET_OPEN_BUTTON_PREFIX)) {
    return null;
  }

  const optionId = customId.slice(TICKET_OPEN_BUTTON_PREFIX.length);
  return SHOP_OPTION_MAP.get(optionId) ?? null;
};

export const parseTicketTopic = (topic: string | null | undefined): { optionId: string; userId: string } | null => {
  if (!topic || !topic.startsWith('TICKET:')) {
    return null;
  }

  const parts = topic.split(':');
  if (parts.length < 3) {
    return null;
  }

  const [_, optionId, userId] = parts;
  if (!optionId || !userId) {
    return null;
  }

  return { optionId, userId };
};

export const getShopOption = (optionId: string): ShopTicketOption | null => SHOP_OPTION_MAP.get(optionId) ?? null;
