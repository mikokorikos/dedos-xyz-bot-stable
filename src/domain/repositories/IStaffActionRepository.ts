// =============================================================================
// RUTA: src/domain/repositories/IStaffActionRepository.ts
// =============================================================================

import type { Transactional } from '@/domain/repositories/transaction';

export interface StaffAmnestyLog {
  readonly guildId?: bigint | null;
  readonly moderatorId: bigint;
  readonly userId: bigint;
  readonly action: string;
  readonly reason?: string | null;
  readonly reference?: string | null;
}

export interface IStaffActionRepository extends Transactional<IStaffActionRepository> {
  logAmnesty(entry: StaffAmnestyLog): Promise<void>;
}
