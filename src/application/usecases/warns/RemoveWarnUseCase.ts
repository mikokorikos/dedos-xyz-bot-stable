// ============================================================================
// RUTA: src/application/usecases/warns/RemoveWarnUseCase.ts
// ============================================================================

import type { Logger } from 'pino';

import { type RemoveWarnDTO, RemoveWarnSchema } from '@/application/dto/warn.dto';
import type { IWarnRepository } from '@/domain/repositories/IWarnRepository';

export class RemoveWarnUseCase {
  public constructor(private readonly warnRepository: IWarnRepository, private readonly logger: Logger) {}

  public async execute(payload: RemoveWarnDTO): Promise<void> {
    const data = RemoveWarnSchema.parse(payload);

    const removed = await this.warnRepository.remove(data.warnId);

    if (!removed) {
      throw new Error(`No se encontró el warn ${data.warnId}.`);
    }

    this.logger.info({ warnId: data.warnId, userId: removed.userId }, 'Warn eliminado correctamente.');
  }
}
