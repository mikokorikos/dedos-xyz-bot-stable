// =============================================================================
// RUTA: src/presentation/embeds/ticketPanelEmbeds.ts
// =============================================================================

import { type APIEmbedField, EmbedBuilder } from 'discord.js';

import { applyDedosBrand } from '@/shared/utils/branding';

const SHOP_PAYMENT_METHODS_FIELD: APIEmbedField = {
  name: 'Metodos de pago:',
  value:
    '<:emojigg_LTC:1417418373721096254>  -   **Litecoin**  -   <:20747paypal:1417021872889139283>  -   **PayPal**   -   <:oxxo:141702781424649263>  -   **Oxxo**   -    🏦  -   **Transferencia**\n',
};

const SHOP_CLAUSULAS_FIELD: APIEmbedField = {
  name: 'Clausulas:',
  value:
    'Los pagos mediante transferencia bancaria y OXXO están disponibles únicamente en México 🇲🇽. Los métodos PayPal <:20747paypal:1417021872889139283> y Litecoin <:emojigg_LTC:1417418373721096254> se encuentran habilitados a nivel global 🌎. En caso de utilizar PayPal, se aplicará un cargo adicional correspondiente a la comisión de la plataforma (aproximadamente 3%, variable según divisa y país de origen).',
};

interface TicketBrandOptions {
  readonly iconUrl?: string | null;
  readonly useHeroImage?: boolean;
}

const applyTicketBrand = (embed: EmbedBuilder, options: TicketBrandOptions = {}): EmbedBuilder => {
  const icon = options.iconUrl ?? undefined;

  embed
    .setColor(0x7400ff)
    .setAuthor({ name: '.gg/dedos', iconURL: icon })
    .setFooter({
      text: 'En caso de dudas, en el canal de tickets puedes solicitar ayuda.',
      iconURL: icon,
    });

  if (icon) {
    embed.setThumbnail(icon);
  }

  return applyDedosBrand(embed, { useHeroImage: options.useHeroImage !== false });
};

interface RobuxEmbedData {
  readonly priceByGroup: string;
  readonly priceByGame: string;
  readonly priceByGamepass: string;
  readonly infoField: APIEmbedField;
  readonly iconUrl?: string | null;
}

export const buildRobuxTicketEmbed = (data: RobuxEmbedData): EmbedBuilder =>
  applyTicketBrand(
    new EmbedBuilder()
      .setTitle('COMPRAR ROBUX')
      .setDescription('Dedos Shop vende robux a los mejores precios. Ofreciendo pagos por grupo o por gamepass.')
      .addFields(
        {
          name: '1000 ROBUX | PAGO POR GRUPO ',
          value: [
            'La opción **más conveniente** para adquirir Robux <:9073robux:1417021867167846420> es mediante pago por grupo. Únicamente debes unirte y permanecer en el grupo un mínimo de **2 semanas** para habilitar los envíos.',
            'Una vez cumplida la antigüedad requerida, los pagos se realizan de forma inmediata y recibirás exactamente 1000 Robux.',
            `**El costo es de $125 MXN por cada 1000 Robux** (${data.priceByGroup}).`,
            '**Grupo:** https://www.roblox.com/es/communities/12082479/unnamed#!/about',
          ].join('\n'),
        },
        {
          name: '1000 ROBUX | PAGO POR JUEGO',
          value: [
            'Esta es una alternativa conveniente si deseas utilizar Robux <:9073robux:1417021867167846420> para adquirir objetos o gamepasses en tu juego favoo.',
            'Realizas la compra de los Robux y recibirás el equivalente en el objeto o gamepass de tu elección.',
            `**El costo es de $125 MXN por cada 1000 Robux** (${data.priceByGame}).`,
          ].join('\n'),
        },
        {
          name: '1000 ROBUX | PAGO POR GAMEPASS',
          value: [
            'Esta es la opción menos recomendable<:50230exclamationpoint:1417021877829767168>, ya que funciona mediante gamepass, similar a Pls Donate.',
            'Roblox aplica una deducción del 30%, por lo que es necesario enviar 1,429 Robux para que recibas 1,000 netos.',
            'Además, el monto se acredita como pendiente y tarda entre 6 y 8 días en reflejarse en tu cuenta.',
            `**El costo es de $135 MXN por cada 1,000 Robux** (${data.priceByGamepass}).`,
          ].join('\n'),
        },
        SHOP_PAYMENT_METHODS_FIELD,
        SHOP_CLAUSULAS_FIELD,
        data.infoField,
      ),
    { iconUrl: data.iconUrl },
  );

interface NitroEmbedData {
  readonly price: string;
  readonly infoField: APIEmbedField;
  readonly iconUrl?: string | null;
}

export const buildNitroTicketEmbed = (data: NitroEmbedData): EmbedBuilder =>
  applyTicketBrand(
    new EmbedBuilder()
      .setTitle('COMPRAR N17r0 B005tz')
      .setDescription(
        'Dedos Shop vende **N17r0 B005tz** al mejor precio de la competencia: **95 MXN por 1 mes.** ' +
          `${data.price} Al ser legal paid, este tipo de NB es dificil de conseguir, por lo que pedimos disculpas en caso de no contar con stock disponible. A diferencia de otros, aqui no corres riesgo de recibir advertencias en tu cuenta de Discord ni de que sea revocado antes de completar el mes contratado.`,
      )
      .addFields(SHOP_PAYMENT_METHODS_FIELD, SHOP_CLAUSULAS_FIELD, data.infoField),
    { iconUrl: data.iconUrl },
  );

interface DecorationsEmbedData {
  readonly infoField: APIEmbedField;
  readonly iconUrl?: string | null;
}

export const buildDecorationsTicketEmbed = (data: DecorationsEmbedData): EmbedBuilder =>
  applyTicketBrand(
    new EmbedBuilder()
      .setTitle('COMPRAR DECORACIONES')
      .setDescription(
        'Dedos Shop vende decoraciones y efectos legal paid por regalo de perfil\n$4.99 <a:51047animatedarrowwhite:1417021879411281992>    $3.1 \n$5.99  <a:51047animatedarrowwhite:1417021879411281992>    $3.3\n$6.99 <a:51047animatedarrowwhite:1417021879411281992>      $3.6 \n$7.99  <a:51047animatedarrowwhite:1417021879411281992>   $3.9\n$8.49 <a:51047animatedarrowwhite:1417021879411281992>      $4.05\n$9.99  <a:51047animatedarrowwhite:1417021879411281992>      $5\n$11.99 <a:51047animatedarrowwhite:1417021879411281992>    $5.5\nPrecio de la izquierda es a lo que discord los vende, el de la derecha es el precio que Dedos Shop lo vende.',
      )
      .addFields(SHOP_PAYMENT_METHODS_FIELD, SHOP_CLAUSULAS_FIELD, data.infoField),
    { iconUrl: data.iconUrl },
  );

interface TicketPanelEmbedData {
  readonly infoField: APIEmbedField;
  readonly iconUrl?: string | null;
}

export const buildTicketPanelOverviewEmbed = (data: TicketPanelEmbedData): EmbedBuilder =>
  applyTicketBrand(
    new EmbedBuilder()
      .setTitle('COMPRA | VENTA')
      .setDescription(
        '<a:27572sparkles:1417433396958728254>En 𝔻𝕖𝕕𝕠𝕤 𝕊𝕙𝕠𝕡 puedes pets de Grow a Garden, Robux <:9073robux:1417021867167846420>, N17r0 B005tz <a:7478evolvingbadgenitroascaling:1417021865893036093>, Decoraciones<a:6633kittypaw14:1416604699716751370>, Tambien ofrecemos otros servicios de streaming a cambio de dinero o pets (Para mas informacion abre un ticket de ayuda). \n𝔻𝕖𝕕𝕠𝕤 𝕊𝕙𝕠𝕡 tambien **te compra tus PETS de Grow a Garden por robux.**\n**📌 Selecciona una opción en el menú de abajo para obtener más información.**',
      )
      .addFields(SHOP_PAYMENT_METHODS_FIELD, SHOP_CLAUSULAS_FIELD, data.infoField),
    { iconUrl: data.iconUrl },
  );

interface TicketIntroEmbedData {
  readonly ticketNumber: string;
  readonly menuLabel: string;
  readonly introLines: readonly string[];
  readonly iconUrl?: string | null;
}

export const buildTicketIntroEmbed = (data: TicketIntroEmbedData): EmbedBuilder =>
  applyTicketBrand(
    new EmbedBuilder()
      .setTitle(`Ticket abierto: ${data.menuLabel}`)
      .setDescription(
        [
          ...data.introLines,
          `Ticket #${data.ticketNumber}`,
          '',
          'Un miembro del staff te atenderá a la brevedad. Si necesitas cerrar el ticket, avisa cuando quedes conforme.',
        ].join('\n'),
      )
      .setTimestamp(),
    { iconUrl: data.iconUrl, useHeroImage: true },
  );
