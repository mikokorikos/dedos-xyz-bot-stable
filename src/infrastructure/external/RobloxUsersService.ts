// ============================================================================
// RUTA: src/infrastructure/external/RobloxUsersService.ts
// ============================================================================

import type { Logger } from 'pino';

import type { RobloxUserRecord, RobloxUsersService } from '@/shared/services/RobloxUsersService';

const ROBLOX_LOOKUP_ENDPOINT = 'https://users.roblox.com/v1/usernames/users';

const normalizeRobloxUserId = (value: unknown): bigint | null => {
  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    try {
      return BigInt(Math.trunc(value));
    } catch {
      return null;
    }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }

  return null;
};

export class RobloxUsersClient implements RobloxUsersService {
  public constructor(private readonly logger: Logger) {}

  public async lookupByUsername(username: string): Promise<RobloxUserRecord | null> {
    const normalized = username.trim();
    if (!normalized) {
      return null;
    }

    try {
      const response = await fetch(ROBLOX_LOOKUP_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [normalized], excludeBannedUsers: false }),
      });

      if (!response.ok) {
        this.logger.warn(
          { status: response.status, username: normalized },
          'Fallo al consultar Roblox para validar usuario.',
        );
        return null;
      }

      const payload = (await response.json()) as {
        readonly data?: ReadonlyArray<{
          readonly requestedUsername?: string;
          readonly id?: number | string;
          readonly name?: string;
        }>;
      };

      const normalizedLower = normalized.toLowerCase();
      const entry = payload.data?.find((item) =>
        item.requestedUsername?.toLowerCase() === normalizedLower,
      );

      if (!entry?.id) {
        return null;
      }

      const robloxUserId = normalizeRobloxUserId(entry.id);
      if (!robloxUserId) {
        this.logger.warn(
          { username: normalized, receivedId: entry.id },
          'El identificador de Roblox recibido no es válido.',
        );
        return null;
      }

      return {
        id: robloxUserId,
        username: entry.name?.trim() && entry.name.length > 0 ? entry.name : normalized,
      };
    } catch (error) {
      this.logger.error({ err: error, username: normalized }, 'Error al validar usuario de Roblox.');
      return null;
    }
  }
}
