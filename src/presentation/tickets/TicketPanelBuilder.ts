// ============================================================================
// RUTA: src/presentation/tickets/TicketPanelBuilder.ts
// ============================================================================

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type GuildMember,
  StringSelectMenuBuilder,
} from 'discord.js';

import { TicketType } from '@/domain/entities/types';
import { fxService } from '@/presentation/services/community';
import { env } from '@/shared/config/env';
import { ValidationFailedError } from '@/shared/errors/domain.errors';

export const TICKET_PANEL_MENU_ID = env.TICKET_SELECT_MENU_ID ?? 'dedos:ticket:menu';
export const TICKET_OPEN_BUTTON_PREFIX = env.TICKET_OPEN_BUTTON_PREFIX ?? 'dedos:ticket:open:';
export const TICKET_CLOSE_BUTTON_ID = env.TICKET_CLOSE_BUTTON_ID ?? 'dedos:ticket:close';

const SHOP_GIF_URL =
  'https://message.style/cdn/images/b6b34048e6b8e4f2d6931af81a6935dbeb06d1d1a619dcf353733ab75bbcca8c.gif';

const SHOP_PAYMENT_METHODS_FIELD = {
  name: 'Metodos de pago:',
  value:
    '<:emojigg_LTC:1417418373721096254>  -  **Litecoin**  -  <:20747paypal:1417021872889139283>  -  **PayPal**   -  <:oxxo:1417027814246449263>  -  **Oxxo**   -  💳  -  **Transferencia**\n',
};

const SHOP_CLAUSULAS_FIELD = {
  name: 'Clausulas:',
  value:
    'Los pagos mediante transferencia bancaria y OXXO están disponibles únicamente en México 🇲🇽. Los métodos PayPal <:20747paypal:1417021872889139283> y Litecoin <:emojigg_LTC:1417418373721096254> se encuentran habilitados a nivel global 🌎. En caso de utilizar PayPal, se aplicará un cargo adicional correspondiente a la comisión de la plataforma (aproximadamente 3%, variable según divisa y país de origen).',
};

interface ShopTicketOption {
  readonly id: string;
  readonly type: TicketType;
  readonly menuLabel: string;
  readonly menuDescription: string;
  readonly channelPrefix: string;
  readonly emoji?: string;
  readonly introLines: readonly string[];
  readonly embedBuilder: () => EmbedBuilder;
}

const applyBrand = (embed: EmbedBuilder, options: { includeBanner?: boolean } = {}): EmbedBuilder => {
  const icon = env.TICKET_BRAND_ICON_URL;

  embed
    .setColor(0x7400ff)
    .setAuthor({ name: '.gg/dedos', iconURL: icon })
    .setFooter({
      text: 'En caso de dudas, en el canal de tickets puedes solicitar ayuda.',
      iconURL: icon,
    });

  if (options.includeBanner ?? true) {
    embed.setImage(SHOP_GIF_URL);
  }

  if (icon) {
    embed.setThumbnail(icon);
  }

  return embed;
};

const formatTicketNumber = (ticketId: number): string => ticketId.toString().padStart(4, '0');

const buildRobuxEmbed = (): EmbedBuilder => {
  const priceByGroup = fxService.formatUsdFromMxn(125);
  const priceByGame = fxService.formatUsdFromMxn(125);
  const priceByGamepass = fxService.formatUsdFromMxn(135);

  const embed = new EmbedBuilder()
    .setTitle('COMPRAR ROBUX')
    .setDescription('💜 Dedos Shop 💜 vende robux a los mejores precios. Ofreciendo pagos por grupo o por gamepass.')
    .addFields(
      {
        name: '1000 ROBUX | PAGO POR GRUPO ',
        value: [
          'La opción **más conveniente** para adquirir Robux <:9073robux:1417021867167846420> es mediante pago por grupo. Únicamente debes unirte y permanecer en el grupo un mínimo de **2 semanas** para habilitar los envíos.',
          'Una vez cumplida la antigüedad requerida, los pagos se realizan de forma inmediata y recibirás exactamente 1000 Robux.',
          `**El costo es de $125 MXN por cada 1000 Robux** (${priceByGroup}).`,
          '**Grupo:** https://www.roblox.com/es/communities/12082479/unnamed#!/about',
        ].join('\n'),
      },
      {
        name: '1000 ROBUX | PAGO POR JUEGO',
        value: [
          'Esta es una alternativa conveniente si deseas utilizar Robux <:9073robux:1417021867167846420> para adquirir objetos o gamepasses en tu juego favoo.',
          'Realizas la compra de los Robux y recibirás el equivalente en el objeto o gamepass de tu elección.',
          `**El costo es de $125 MXN por cada 1000 Robux** (${priceByGame}).`,
        ].join('\n'),
      },
      {
        name: '1000 ROBUX | PAGO POR GAMEPASS',
        value: [
          'Esta es la opción menos recomendable<:50230exclamationpoint:1417021877829767168>, ya que funciona mediante gamepass, similar a Pls Donate.',
          'Roblox aplica una deducción del 30%, por lo que es necesario enviar 1,429 Robux para que recibas 1,000 netos.',
          'Además, el monto se acredita como pendiente y tarda entre 6 y 8 días en reflejarse en tu cuenta.',
          `**El costo es de $135 MXN por cada 1,000 Robux** (${priceByGamepass}).`,
        ].join('\n'),
      },
      SHOP_PAYMENT_METHODS_FIELD,
      SHOP_CLAUSULAS_FIELD,
      fxService.buildInfoField(),
    );

  return applyBrand(embed);
};

const buildNitroEmbed = (): EmbedBuilder => {
  const priceNitro = fxService.formatUsdFromMxn(95);
  const embed = new EmbedBuilder()
    .setTitle('COMPRAR N17r0 B005tz')
    .setDescription(
      'Dedos Shop vende **N17r0 B005tz** al mejor precio de la competencia: **95 MXN por 1 mes.** ' +
        `${priceNitro} Al ser legal paid, este tipo de NB es dificil de conseguir, por lo que pedimos disculpas en caso de no contar con stock disponible. A diferencia de otros, aqui no corres riesgo de recibir advertencias en tu cuenta de Discord ni de que sea revocado antes de completar el mes contratado.`,
    )
    .addFields(SHOP_PAYMENT_METHODS_FIELD, SHOP_CLAUSULAS_FIELD, fxService.buildInfoField());

  return applyBrand(embed);
};

const buildDecorationsEmbed = (): EmbedBuilder => {
  const embed = new EmbedBuilder()
    .setTitle('COMPRAR DECORACIONES')
    .setDescription(
      '💜 Dedos Shop 💜 vende decoraciones y efectos legal paid por regalo de perfil\n$4.99 <a:51047animatedarrowwhite:1417021879411281992>    $3.1 \n$5.99  <a:51047animatedarrowwhite:1417021879411281992>    $3.3\n$6.99 <a:51047animatedarrowwhite:1417021879411281992>      $3.6 \n$7.99  <a:51047animatedarrowwhite:1417021879411281992>   $3.9\n$8.49 <a:51047animatedarrowwhite:1417021879411281992>      $4.05\n$9.99  <a:51047animatedarrowwhite:1417021879411281992>      $5\n$11.99 <a:51047animatedarrowwhite:1417021879411281992>    $5.5\nPrecio de la izquierda es a lo que discord los vende, el de la derecha es el precio que 💜 Dedos Shop 💜 lo vende.',
    )
    .addFields(SHOP_PAYMENT_METHODS_FIELD, SHOP_CLAUSULAS_FIELD, fxService.buildInfoField());

  return applyBrand(embed);
};

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
    embedBuilder: buildRobuxEmbed,
  },
  {
    id: 'buy_nitro',
    type: TicketType.NITRO,
    menuLabel: 'Comprar N17r0 B005tz',
    menuDescription: 'Reserva b005tz legales al mejor precio.',
    channelPrefix: 'n17r0',
    emoji: '✨',
    introLines: [
      'Dinos cuantos meses de N17r0 B005tz necesitas y para qué servidor.',
      'Comparte el método de pago y, si aplica, la fecha en la que lo requieres.',
      'Recuerda que el stock es limitado y puede agotarse rápidamente.',
    ],
    embedBuilder: buildNitroEmbed,
  },
  {
    id: 'buy_decor',
    type: TicketType.DECOR,
    menuLabel: 'Comprar decoraciones',
    menuDescription: 'Obtén efectos y regalos premium más baratos.',
    channelPrefix: 'decor',
    emoji: '🎀',
    introLines: [
      'Enumera las decoraciones o efectos que te interesan y sus precios.',
      'Indica si necesitas el regalo para un perfil específico o para ti.',
      'Te confirmaremos disponibilidad y pasos a seguir para cerrar la compra.',
    ],
    embedBuilder: buildDecorationsEmbed,
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

const buildPanelEmbed = (): EmbedBuilder => {
  const embed = new EmbedBuilder()
    .setTitle('COMPRA | VENTA')
    .setDescription(
      '<a:27572sparkles:1417433396958728254>En 💜 Dedos Shop 💜 puedes adquirir Robux <:9073robux:1417021867167846420>, N17r0 B005tz <a:7478evolvingbadgenitroascaling:1417021865893036093> y decoraciones premium<a:6633kittypaw14:1416604699716751370>. También contamos con servicios de asesoría y middleman dedicados para tus intercambios.\n**💠 Selecciona una opción en el menú de abajo para obtener más información.**',
    )
    .addFields(SHOP_PAYMENT_METHODS_FIELD, SHOP_CLAUSULAS_FIELD, fxService.buildInfoField());

  return applyBrand(embed);
};

export const buildTicketPanelMessage = (): {
  readonly embeds: EmbedBuilder[];
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
): { readonly embeds: EmbedBuilder[]; readonly components: [ActionRowBuilder<ButtonBuilder>] } | null => {
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
  readonly embeds: EmbedBuilder[];
  readonly components: [ActionRowBuilder<ButtonBuilder>];
  readonly allowedMentions: { readonly users: string[]; readonly roles: string[] };
} => {
  const ticketNumber = formatTicketNumber(ticketId);
  const lines = [
    `Ticket #${ticketNumber}`,
    `Hola <@${member.id}> 💜`,
    ...option.introLines,
    '',
    'Un miembro del staff te atenderá a la brevedad. Si necesitas cerrar el ticket, avisa cuando quedes conforme.',
  ];

  const embed = applyBrand(
    new EmbedBuilder()
      .setTitle(`Ticket #${ticketNumber} • ${option.menuLabel}`)
      .setDescription(lines.join('\n'))
      .setTimestamp(),
    { includeBanner: false },
  );

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
