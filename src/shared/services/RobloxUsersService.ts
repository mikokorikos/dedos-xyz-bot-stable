// ============================================================================
// RUTA: src/shared/services/RobloxUsersService.ts
// ============================================================================

export interface RobloxUserRecord {
  readonly id: bigint;
  readonly username: string;
}

export interface RobloxUsersService {
  lookupByUsername(username: string): Promise<RobloxUserRecord | null>;
}
