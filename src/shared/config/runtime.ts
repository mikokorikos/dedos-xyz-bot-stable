// =============================================================================
// RUTA: src/shared/config/runtime.ts
// =============================================================================

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RUNTIME_CONFIG_PATH = path.resolve(process.cwd(), 'config/runtime.json');

export const FEATURE_FLAGS = ['counting', 'tickets', 'middleman', 'verification'] as const;
export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number];

export type FeatureFlagConfig = Record<FeatureFlagKey, boolean>;

export const FEATURE_DISPLAY_NAMES: Record<FeatureFlagKey, string> = {
  counting: 'Conteo de mensajes',
  tickets: 'Tickets de soporte',
  middleman: 'Gestión de middleman',
  verification: 'Verificación de miembros',
};

const DEFAULT_FEATURE_FLAGS: FeatureFlagConfig = {
  counting: true,
  tickets: true,
  middleman: true,
  verification: true,
};

export interface RuntimeConfig {
  readonly reviewsChannelId: string | null;
  readonly features: FeatureFlagConfig;
}

const DEFAULT_CONFIG: RuntimeConfig = {
  reviewsChannelId: null,
  features: DEFAULT_FEATURE_FLAGS,
};

let cachedConfig: RuntimeConfig | null = null;

const mergeConfig = (partial: Partial<RuntimeConfig>, base: RuntimeConfig): RuntimeConfig => ({
  reviewsChannelId:
    partial.reviewsChannelId !== undefined ? partial.reviewsChannelId : base.reviewsChannelId,
  features: {
    ...base.features,
    ...(partial.features ?? {}),
  },
});

const normalizeConfig = (raw: Partial<RuntimeConfig> | null | undefined): RuntimeConfig =>
  mergeConfig(raw ?? {}, DEFAULT_CONFIG);

export const loadRuntimeConfig = async (): Promise<RuntimeConfig> => {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const raw = await readFile(RUNTIME_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<RuntimeConfig>;
    cachedConfig = normalizeConfig(parsed);
    return cachedConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await saveRuntimeConfig(DEFAULT_CONFIG);
      cachedConfig = DEFAULT_CONFIG;
      return DEFAULT_CONFIG;
    }

    throw error;
  }
};

export const saveRuntimeConfig = async (config: RuntimeConfig): Promise<void> => {
  cachedConfig = normalizeConfig(config);
  await writeFile(RUNTIME_CONFIG_PATH, JSON.stringify(cachedConfig, null, 2), 'utf8');
};

export const updateRuntimeConfig = async (
  partial: Partial<RuntimeConfig>,
): Promise<RuntimeConfig> => {
  const current = await loadRuntimeConfig();
  const next = mergeConfig(partial, current);
  await saveRuntimeConfig(next);
  return next;
};

export const getFeatureFlags = async (): Promise<FeatureFlagConfig> => {
  const config = await loadRuntimeConfig();
  return { ...config.features };
};

export const isFeatureEnabled = async (feature: FeatureFlagKey): Promise<boolean> => {
  const config = await loadRuntimeConfig();
  return Boolean(config.features[feature]);
};

export const updateFeatureFlag = async (
  feature: FeatureFlagKey,
  enabled: boolean,
): Promise<RuntimeConfig> => updateRuntimeConfig({ features: { [feature]: enabled } });

