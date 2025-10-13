// ============================================================================
// RUTA: src/shared/config/env.ts
// ============================================================================

import { z } from 'zod';

const booleanLike = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === 'boolean') {
      return value;
    }

    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n', ''].includes(normalized)) {
      return false;
    }

    throw new Error(`Valor booleano inválido: ${value}`);
  });

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === 'string' && value.trim().length === 0) {
      return undefined;
    }

    return value;
  }, schema.optional());

const optionalUrl = emptyToUndefined(z.string().url());

const snowflakePattern = /^\d{17,20}$/u;

const commaSeparatedSnowflakes = z
  .preprocess((raw) => {
    const segments: string[] = [];

    const pushSegment = (segment: unknown) => {
      if (segment === undefined || segment === null) {
        return;
      }

      const text = typeof segment === 'string' ? segment : String(segment);

      text
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .forEach((value) => {
          if (snowflakePattern.test(value)) {
            segments.push(value);
          }
        });
    };

    if (Array.isArray(raw)) {
      raw.forEach(pushSegment);
    } else {
      pushSegment(raw);
    }

    return segments;
  }, z.array(z.string().regex(snowflakePattern)));


export const EnvSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN es obligatorio'),
  DISCORD_CLIENT_ID: z
    .string()
    .regex(/^\d{17,20}$/u, 'DISCORD_CLIENT_ID debe ser un snowflake de Discord'),
  DISCORD_GUILD_ID: z
    .string()
    .regex(/^\d{17,20}$/u, 'DISCORD_GUILD_ID debe ser un snowflake de Discord')
    .optional(),
  COMMAND_PREFIX: z
    .string()
    .min(1, 'COMMAND_PREFIX es obligatorio')
    .max(5, 'COMMAND_PREFIX debe tener máximo 5 caracteres')
    .optional()
    .default(';'),
  DATABASE_URL: optionalUrl,
  DB_AUTO_APPLY_SCHEMA: booleanLike.default(true),
  DB_ACCEPT_DATA_LOSS: booleanLike.default(false),
  ADMIN_ROLE_ID: z
    .string()
    .regex(/^\d{17,20}$/u, 'ADMIN_ROLE_ID debe ser un snowflake de Discord')
    .optional(),
  VERIFIED_ROLE_ID: z
    .string()
    .regex(/^\d{17,20}$/u, 'VERIFIED_ROLE_ID debe ser un snowflake de Discord')
    .optional(),
  VERIFICATION_CHANNEL_ID: z
    .string()
    .regex(/^\d{17,20}$/u, 'VERIFICATION_CHANNEL_ID debe ser un snowflake de Discord')
    .optional(),
  VERIFICATION_MESSAGE_ID: emptyToUndefined(z.string().regex(/^\d{17,20}$/u, 'VERIFICATION_MESSAGE_ID debe ser un snowflake de Discord')),
  VERIFY_BUTTON_CUSTOM_ID: z
    .string()
    .min(3, 'VERIFY_BUTTON_CUSTOM_ID debe tener al menos 3 caracteres')
    .max(80, 'VERIFY_BUTTON_CUSTOM_ID debe tener maximo 80 caracteres')
    .optional()
    .default('dedos:verify:button'),
  HELP_MENU_CUSTOM_ID: z
    .string()
    .min(3, 'HELP_MENU_CUSTOM_ID debe tener al menos 3 caracteres')
    .max(80, 'HELP_MENU_CUSTOM_ID debe tener maximo 80 caracteres')
    .optional()
    .default('dedos:help:menu'),
  COMMUNITY_URL: z
    .string()
    .url('COMMUNITY_URL debe ser una URL valida')
    .optional()
    .default('https://discord.gg/dedos'),
  HELP_CENTER_URL: optionalUrl,
  INVITE_CHANNEL_ID: z
    .string()
    .regex(/^\d{17,20}$/u, 'INVITE_CHANNEL_ID debe ser un snowflake de Discord')
    .optional(),
  WELCOME_GIF_PATH: emptyToUndefined(z.string()),
  WELCOME_RATE_MS: z.coerce.number().int().min(250).default(1_000),
  WELCOME_CONCURRENCY: z.coerce.number().int().min(1).max(5).default(1),
  WELCOME_MAX_QUEUE: z.coerce.number().int().min(1).max(500).default(100),
  FX_REFRESH_INTERVAL_MS: z.coerce.number().int().min(60_000).default(21_600_000),
  MXN_USD_RATE: z.coerce.number().nonnegative().optional(),
  MXN_USD_DISABLE_FETCH: booleanLike.default(false),
  MIDDLEMAN_CATEGORY_ID: z
    .string()
    .regex(/^\d{17,20}$/u, 'MIDDLEMAN_CATEGORY_ID debe ser un snowflake de Discord')
    .optional(),
  MIDDLEMAN_ROLE_ID: z
    .string()
    .regex(/^\d{17,20}$/u, 'MIDDLEMAN_ROLE_ID debe ser un snowflake de Discord')
    .optional(),
  MIDDLEMAN_HELP_UNLOCK_MS: z.coerce.number().int().min(5_000).default(60_000),
  REVIEW_CHANNEL_ID: z
    .string()
    .regex(/^\d{17,20}$/u, 'REVIEW_CHANNEL_ID debe ser un snowflake de Discord')
    .optional(),
  TICKET_CATEGORY_ID: z
    .string()
    .regex(/^\d{17,20}$/u, 'TICKET_CATEGORY_ID debe ser un snowflake de Discord')
    .optional(),
  TICKET_PANEL_CHANNEL_ID: z
    .string()
    .regex(/^\d{17,20}$/u, 'TICKET_PANEL_CHANNEL_ID debe ser un snowflake de Discord')
    .optional(),
  TICKET_SELECT_MENU_ID: z
    .string()
    .min(3, 'TICKET_SELECT_MENU_ID debe tener al menos 3 caracteres')
    .max(80, 'TICKET_SELECT_MENU_ID debe tener maximo 80 caracteres')
    .optional()
    .default('dedos:ticket:menu'),
  TICKET_OPEN_BUTTON_PREFIX: z
    .string()
    .min(3, 'TICKET_OPEN_BUTTON_PREFIX debe tener al menos 3 caracteres')
    .max(80, 'TICKET_OPEN_BUTTON_PREFIX debe tener maximo 80 caracteres')
    .optional()
    .default('dedos:ticket:open:'),
  TICKET_CLOSE_BUTTON_ID: z
    .string()
    .min(3, 'TICKET_CLOSE_BUTTON_ID debe tener al menos 3 caracteres')
    .max(80, 'TICKET_CLOSE_BUTTON_ID debe tener maximo 80 caracteres')
    .optional()
    .default('dedos:ticket:close'),
  TICKET_BRAND_ICON_URL: z
    .string()
    .url('TICKET_BRAND_ICON_URL debe ser una URL valida')
    .optional()
    .default(
      'https://cdn.discordapp.com/attachments/1412699909949358151/1417272988801175593/dedosbot_avatar.jpg',
    ),
  TICKET_STAFF_ROLE_IDS: commaSeparatedSnowflakes.default([]),

  TICKET_MAX_PER_USER: z.coerce.number().int().min(1).max(10).default(3),
  TICKET_COOLDOWN_MS: z.coerce.number().int().min(0).default(60_000),
  REDIS_URL: optionalUrl.optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DEBUG_VERBOSE: booleanLike.default(false),
  ENABLE_CACHE: booleanLike.default(false),
  ENABLE_SHARDING: booleanLike.default(false),
  SENTRY_DSN: optionalUrl.optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl.optional(),
  MYSQL_HOST: emptyToUndefined(z.string()),
  MYSQL_PORT: emptyToUndefined(z.string().regex(/^\d+$/u, 'MYSQL_PORT debe ser un número válido')),
  MYSQL_USER: emptyToUndefined(z.string()),
  MYSQL_PASSWORD: emptyToUndefined(z.string()),
  MYSQL_DATABASE: emptyToUndefined(z.string()),
  MYSQL_CONNECTION_LIMIT: emptyToUndefined(z.string().regex(/^\d+$/u, 'MYSQL_CONNECTION_LIMIT debe ser un número válido')),
});

export type RawEnv = z.infer<typeof EnvSchema>;

const buildDatabaseUrl = (config: RawEnv): string | undefined => {
  if (config.DATABASE_URL) {
    return config.DATABASE_URL;
  }

  const requiredKeys: Array<keyof RawEnv> = ['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
  const missing = requiredKeys.filter((key) => !config[key]);

  if (missing.length === 0) {
    const encode = (value: string) => encodeURIComponent(value);
    const host = config.MYSQL_HOST!;
    const port = config.MYSQL_PORT ?? '3306';
    const user = encode(config.MYSQL_USER!);
    const password = encode(config.MYSQL_PASSWORD!);
    const database = encode(config.MYSQL_DATABASE!);

    return `mysql://${user}:${password}@${host}:${port}/${database}`;
  }

  return undefined;
};

const parsedEnv = EnvSchema.parse(process.env);
const resolvedDatabaseUrl = buildDatabaseUrl(parsedEnv);

if (!resolvedDatabaseUrl) {
  throw new Error('Debe proporcionar DATABASE_URL o las variables MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD y MYSQL_DATABASE.');
}

process.env['DATABASE_URL'] = resolvedDatabaseUrl;

export type Env = RawEnv & { DATABASE_URL: string };

export const env: Env = {
  ...parsedEnv,
  DATABASE_URL: resolvedDatabaseUrl,
};
