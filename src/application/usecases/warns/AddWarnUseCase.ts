// ============================================================================
// RUTA: src/application/usecases/warns/AddWarnUseCase.ts
// ============================================================================

import type { Logger } from 'pino';

import { type AddWarnDTO, AddWarnSchema } from '@/application/dto/warn.dto';
import type { Warn } from '@/domain/entities/Warn';
import type { IWarnRepository, WarnSummary } from '@/domain/repositories/IWarnRepository';

export type EscalationAction = 'NONE' | 'MUTE' | 'TEMP_BAN' | 'BAN';

interface EscalationStep {
  readonly action: EscalationAction;
  readonly threshold: number;
}

export const ESCALATION_STEPS: readonly EscalationStep[] = [
  { action: 'MUTE', threshold: 4 },
  { action: 'TEMP_BAN', threshold: 6 },
  { action: 'BAN', threshold: 8 },
] as const;

export interface EscalationProgress {
  readonly currentAction: EscalationAction;
  readonly nextAction: EscalationAction | null;
  readonly nextThreshold: number | null;
  readonly remainingWeight: number;
}

export interface AddWarnResult {
  readonly warn: Warn;
  readonly summary: WarnSummary;
  readonly escalation: EscalationProgress;
}

export const resolveEscalationProgress = (summary: WarnSummary): EscalationProgress => {
  const score = summary.weightedScore;

  let current: EscalationAction = 'NONE';
  for (const step of ESCALATION_STEPS) {
    if (score >= step.threshold) {
      current = step.action;
    }
  }

  const nextStep = ESCALATION_STEPS.find((step) => score < step.threshold) ?? null;
  const remainingWeight = nextStep ? Math.max(0, nextStep.threshold - score) : 0;

  return {
    currentAction: current,
    nextAction: nextStep?.action ?? null,
    nextThreshold: nextStep?.threshold ?? null,
    remainingWeight,
  };
};

export class AddWarnUseCase {
  public constructor(private readonly warnRepository: IWarnRepository, private readonly logger: Logger) {}

  public async execute(payload: AddWarnDTO): Promise<AddWarnResult> {
    const data = AddWarnSchema.parse(payload);

    const warn = await this.warnRepository.create({
      userId: BigInt(data.userId),
      moderatorId: BigInt(data.moderatorId),
      severity: data.severity,
      reason: data.reason ?? null,
    });

    const summary = await this.warnRepository.getSummary(BigInt(data.userId));
    const escalation = resolveEscalationProgress(summary);

    this.logger.info(
      { warnId: warn.id, userId: data.userId, moderatorId: data.moderatorId, severity: data.severity },
      'Warn aplicado correctamente.',
    );

    return { warn, summary, escalation };
  }
}
