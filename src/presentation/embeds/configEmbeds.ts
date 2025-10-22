// =============================================================================
// RUTA: src/presentation/embeds/configEmbeds.ts
// =============================================================================

import type { EmbedBuilder } from 'discord.js';

import { embedFactory } from '@/presentation/embeds/EmbedFactory';

const CONFIG_USAGE_LINES = [
  ';config get <clave>',
  ';config set <clave> <valor|null>',
  ';config features',
  ';config feature <clave> <on|off>',
];

export const buildConfigGuildOnlyEmbed = (): EmbedBuilder =>
  embedFactory.error({
    title: 'Acción no disponible',
    description: 'Solo usable en servidores.',
  });

export const buildConfigSlashPermissionsEmbed = (): EmbedBuilder =>
  embedFactory.error({
    title: 'Permisos insuficientes',
    description: 'Necesitas permisos de administrador.',
  });

export const buildConfigPrefixPermissionsEmbed = (): EmbedBuilder =>
  embedFactory.error({
    title: 'Permisos insuficientes',
    description: 'Necesitas permisos de administrador para usar `;config`.',
  });

export const buildConfigValueEmbed = (key: string, value: string | null): EmbedBuilder =>
  embedFactory.info({
    title: 'Configuración actual',
    fields: [{ name: key, value: String(value ?? 'null') }],
  });

export const buildConfigUpdatedEmbed = (key: string, value: string | null): EmbedBuilder =>
  embedFactory.success({
    title: 'Configuración actualizada',
    description: `La clave **${key}** ahora vale **${value ?? 'null'}**.`,
  });

export const buildConfigUsageEmbed = (): EmbedBuilder =>
  embedFactory.info({
    title: 'Uso de ;config',
    description: `Subcomandos disponibles:\n${CONFIG_USAGE_LINES.map((line) => `• \`${line}\``).join('\n')}`,
  });

export const buildConfigInvalidFeatureEmbed = (validList: string): EmbedBuilder =>
  embedFactory.warning({
    title: 'Función no válida',
    description: `Debes usar una función válida (${validList}).`,
  });

export const buildConfigFeatureStateRequiredEmbed = (): EmbedBuilder =>
  embedFactory.warning({
    title: 'Estado requerido',
    description: 'Especifica si deseas habilitar (`on`) o deshabilitar (`off`) la función.',
  });

export const buildConfigFeatureToggleInvalidValueEmbed = (): EmbedBuilder =>
  embedFactory.warning({
    title: 'Valor no reconocido',
    description:
      'Usa valores como `on`, `off`, `enable`, `disable`, `true` o `false` para actualizar la función.',
  });

export const buildConfigInvalidKeyEmbed = (validKeys: ReadonlyArray<string>): EmbedBuilder =>
  embedFactory.warning({
    title: 'Clave no válida',
    description: `Debes usar una clave válida (${validKeys.join(', ')}).`,
  });

export const buildConfigSetValueRequiredEmbed = (): EmbedBuilder =>
  embedFactory.warning({
    title: 'Valor requerido',
    description: 'Proporciona un valor para actualizar la configuración (usa `null` para limpiar).',
  });

export const buildConfigUnknownSubcommandEmbed = (): EmbedBuilder =>
  embedFactory.warning({
    title: 'Subcomando desconocido',
    description:
      'Usa `;config get <clave>`, `;config set <clave> <valor|null>`, `;config features` o `;config feature <clave> <on|off>`.',
  });
