// =============================================================================
// RUTA: src/presentation/embeds/featureEmbeds.ts
// =============================================================================

import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import type { FeatureFlagConfig, FeatureFlagKey } from '@/shared/config/runtime';
import { FEATURE_DISPLAY_NAMES } from '@/shared/config/runtime';

const formatFeatureStatus = (enabled: boolean): string => (enabled ? '✅ Habilitada' : '🚫 Deshabilitada');

export const buildFeatureDisabledEmbed = (
  feature: FeatureFlagKey,
): ReturnType<typeof embedFactory.warning> =>
  embedFactory.warning({
    title: 'Función deshabilitada',
    description: `La función **${FEATURE_DISPLAY_NAMES[feature]}** está deshabilitada por un administrador.`,
  });

export const buildFeatureStatusListEmbed = (
  features: FeatureFlagConfig,
): ReturnType<typeof embedFactory.info> =>
  embedFactory.info({
    title: 'Estado de las funciones del bot',
    fields: Object.entries(features).map(([key, value]) => ({
      name: FEATURE_DISPLAY_NAMES[key as FeatureFlagKey],
      value: formatFeatureStatus(value),
      inline: true,
    })),
  });

export const buildFeatureUpdatedEmbed = (
  feature: FeatureFlagKey,
  enabled: boolean,
): ReturnType<typeof embedFactory.success> =>
  embedFactory.success({
    title: 'Configuración actualizada',
    description: `La función **${FEATURE_DISPLAY_NAMES[feature]}** ahora está ${enabled ? 'habilitada' : 'deshabilitada'}.`,
  });

