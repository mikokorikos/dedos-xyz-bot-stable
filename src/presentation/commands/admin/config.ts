// ============================================================================
// RUTA: src/presentation/commands/admin/config.ts
// ============================================================================

import type { Message } from 'discord.js';
import { GuildMember, SlashCommandBuilder } from 'discord.js';

import type { Command } from '@/presentation/commands/types';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import {
  buildFeatureStatusListEmbed,
  buildFeatureUpdatedEmbed,
} from '@/presentation/embeds/featureEmbeds';
import { PERMISSIONS } from '@/shared/config/constants';
import {
  FEATURE_DISPLAY_NAMES,
  FEATURE_FLAGS,
  type FeatureFlagKey,
  getFeatureFlags,
  loadRuntimeConfig,
  updateFeatureFlag,
  updateRuntimeConfig,
} from '@/shared/config/runtime';
import { brandMessageOptions, brandReplyOptions } from '@/shared/utils/branding';
import { hasPermissions } from '@/shared/utils/permissions';

const CONFIG_KEYS = ['reviewsChannelId'] as const;
type ConfigKey = typeof CONFIG_KEYS[number];

const FEATURE_CHOICES = FEATURE_FLAGS.map((feature) => ({
  name: FEATURE_DISPLAY_NAMES[feature],
  value: feature,
}));

const FEATURE_KEY_LIST = FEATURE_FLAGS.map((feature) => `\`${feature}\``).join(', ');

const parseFeatureToggleInput = (raw: string): boolean | null => {
  const normalized = raw.trim().toLowerCase();

  if (['on', 'true', '1', 'enable', 'enabled', 'yes', 'si'].includes(normalized)) {
    return true;
  }

  if (['off', 'false', '0', 'disable', 'disabled', 'no'].includes(normalized)) {
    return false;
  }

  return null;
};

const configSlashCommand = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Gestiona la configuración runtime del bot');

configSlashCommand.addSubcommand((sub) => {
  sub
    .setName('get')
    .setDescription('Obtiene el valor de una clave de configuración')
    .addStringOption((option) =>
      option
        .setName('clave')
        .setDescription('Clave de configuración (ej. reviewsChannelId)')
        .addChoices(...CONFIG_KEYS.map((key) => ({ name: key, value: key })))
        .setRequired(true),
    );

  return sub;
});

configSlashCommand.addSubcommand((sub) => {
  sub
    .setName('set')
    .setDescription('Actualiza una clave de configuración')
    .addStringOption((option) =>
      option
        .setName('clave')
        .setDescription('Clave de configuración (ej. reviewsChannelId)')
        .addChoices(...CONFIG_KEYS.map((key) => ({ name: key, value: key })))
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('valor')
        .setDescription('Nuevo valor (usa "null" para limpiar)')
        .setRequired(true),
    );

  return sub;
});

configSlashCommand.addSubcommand((sub) => {
  sub
    .setName('features')
    .setDescription('Muestra el estado actual de las funciones configurables.');

  return sub;
});

configSlashCommand.addSubcommand((sub) => {
  sub
    .setName('feature')
    .setDescription('Habilita o deshabilita una función del bot')
    .addStringOption((option) =>
      option
        .setName('nombre')
        .setDescription('Función a modificar')
        .addChoices(...FEATURE_CHOICES)
        .setRequired(true),
    )
    .addBooleanOption((option) =>
      option
        .setName('habilitar')
        .setDescription('Selecciona true para habilitar, false para deshabilitar')
        .setRequired(true),
    );

  return sub;
});

export const configCommand: Command = {
  data: configSlashCommand,
  category: 'Administración',
  examples: [
    '/config get clave:reviewsChannelId',
    '/config set clave:reviewsChannelId valor:123456789012345678',
    '/config features',
    '/config feature nombre:tickets habilitar:false',
  ],
  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply(
        brandReplyOptions({
          embeds: [embedFactory.error({ title: 'Acción no disponible', description: 'Solo usable en servidores.' })],
          ephemeral: true,
        }),
      );
      return;
    }

    const member =
      interaction.member instanceof GuildMember
        ? interaction.member
        : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

    if (!hasPermissions(member, PERMISSIONS.admin)) {
      await interaction.reply(
        brandReplyOptions({
          embeds: [embedFactory.error({ title: 'Permisos insuficientes', description: 'Necesitas permisos de administrador.' })],
          ephemeral: true,
        }),
      );
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'features') {
      const features = await getFeatureFlags();

      await interaction.reply(
        brandReplyOptions({
          embeds: [buildFeatureStatusListEmbed(features)],
          ephemeral: true,
        }),
      );
      return;
    }

    if (subcommand === 'feature') {
      const feature = interaction.options.getString('nombre', true) as FeatureFlagKey;
      const enabled = interaction.options.getBoolean('habilitar', true);

      await updateFeatureFlag(feature, enabled);

      await interaction.reply(
        brandReplyOptions({
          embeds: [buildFeatureUpdatedEmbed(feature, enabled)],
          ephemeral: true,
        }),
      );
      return;
    }

    if (subcommand === 'get') {
      const key = interaction.options.getString('clave', true) as ConfigKey;
      const config = await loadRuntimeConfig();

      await interaction.reply(
        brandReplyOptions({
          embeds: [
            embedFactory.info({
              title: 'Configuración actual',
              fields: [
                { name: key, value: String(config[key] ?? 'null') },
              ],
            }),
          ],
          ephemeral: true,
        }),
      );
      return;
    }

    if (subcommand === 'set') {
      const key = interaction.options.getString('clave', true) as ConfigKey;
      const rawValue = interaction.options.getString('valor', true);
      const value = rawValue.toLowerCase() === 'null' ? null : rawValue;

      const updated = await updateRuntimeConfig({ [key]: value } as Record<ConfigKey, string | null>);

      await interaction.reply(
        brandReplyOptions({
          embeds: [
            embedFactory.success({
              title: 'Configuración actualizada',
              description: `La clave **${key}** ahora vale **${updated[key] ?? 'null'}**.`,
            }),
          ],
          ephemeral: true,
        }),
      );
    }
  },
  prefix: {
    name: 'config',
    async execute(message: Message, args: ReadonlyArray<string>) {
      if (!message.guild) {
        return;
      }

      const member =
        message.member instanceof GuildMember
          ? message.member
          : await message.guild.members.fetch(message.author.id).catch(() => null);

      if (!hasPermissions(member, PERMISSIONS.admin)) {
        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.error({
                title: 'Permisos insuficientes',
                description: 'Necesitas permisos de administrador para usar `;config`.',
              }),
            ],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      const [rawSubcommand, rawKey, ...rawValue] = args;

      if (!rawSubcommand) {
        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.info({
                title: 'Uso de ;config',
                description:
                  'Subcomandos disponibles:\n' +
                  [
                    ';config get <clave>',
                    ';config set <clave> <valor|null>',
                    ';config features',
                    ';config feature <clave> <on|off>',
                  ]
                    .map((line) => `• \`${line}\``)
                    .join('\n'),
              }),
            ],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      const subcommand = rawSubcommand.toLowerCase();

      if (subcommand === 'features') {
        const features = await getFeatureFlags();

        await message.reply(
          brandMessageOptions({
            embeds: [buildFeatureStatusListEmbed(features)],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      if (subcommand === 'feature') {
        const featureKey = rawKey?.toLowerCase() as FeatureFlagKey | undefined;

        if (!featureKey || !FEATURE_FLAGS.includes(featureKey)) {
          await message.reply(
            brandMessageOptions({
              embeds: [
                embedFactory.warning({
                  title: 'Función no válida',
                  description: `Debes usar una función válida (${FEATURE_KEY_LIST}).`,
                }),
              ],
              allowedMentions: { repliedUser: false },
            }),
          );
          return;
        }

        const valueInput = rawValue.join(' ').trim();

        if (valueInput.length === 0) {
          await message.reply(
            brandMessageOptions({
              embeds: [
                embedFactory.warning({
                  title: 'Estado requerido',
                  description: 'Especifica si deseas habilitar (`on`) o deshabilitar (`off`) la función.',
                }),
              ],
              allowedMentions: { repliedUser: false },
            }),
          );
          return;
        }

        const toggle = parseFeatureToggleInput(valueInput);

        if (toggle === null) {
          await message.reply(
            brandMessageOptions({
              embeds: [
                embedFactory.warning({
                  title: 'Valor no reconocido',
                  description:
                    'Usa valores como `on`, `off`, `enable`, `disable`, `true` o `false` para actualizar la función.',
                }),
              ],
              allowedMentions: { repliedUser: false },
            }),
          );
          return;
        }

        await updateFeatureFlag(featureKey, toggle);

        await message.reply(
          brandMessageOptions({
            embeds: [buildFeatureUpdatedEmbed(featureKey, toggle)],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      const key = rawKey?.toLowerCase() as ConfigKey | undefined;

      if (!key || !CONFIG_KEYS.includes(key)) {
        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.warning({
                title: 'Clave no válida',
                description: `Debes usar una clave válida (${CONFIG_KEYS.join(', ')}).`,
              }),
            ],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      if (subcommand === 'get') {
        const config = await loadRuntimeConfig();

        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.info({
                title: 'Configuración actual',
                fields: [{ name: key, value: String(config[key] ?? 'null') }],
              }),
            ],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      if (subcommand === 'set') {
        const valueInput = rawValue.join(' ');

        if (valueInput.length === 0) {
          await message.reply(
            brandMessageOptions({
              embeds: [
                embedFactory.warning({
                  title: 'Valor requerido',
                  description: 'Proporciona un valor para actualizar la configuración (usa `null` para limpiar).',
                }),
              ],
              allowedMentions: { repliedUser: false },
            }),
          );
          return;
        }

        const normalizedValue = valueInput.trim().toLowerCase() === 'null' ? null : valueInput;
        const updated = await updateRuntimeConfig({ [key]: normalizedValue } as Record<ConfigKey, string | null>);

        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.success({
                title: 'Configuración actualizada',
                description: `La clave **${key}** ahora vale **${updated[key] ?? 'null'}**.`,
              }),
            ],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      await message.reply(
        brandMessageOptions({
          embeds: [
            embedFactory.warning({
              title: 'Subcomando desconocido',
              description:
                'Usa `;config get <clave>`, `;config set <clave> <valor|null>`, `;config features` o `;config feature <clave> <on|off>`.',
            }),
          ],
          allowedMentions: { repliedUser: false },
        }),
      );
    },
  },
};
