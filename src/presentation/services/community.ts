// =============================================================================
// RUTA: src/presentation/services/community.ts
// =============================================================================

import { registerButtonHandler, registerSelectMenuHandler } from '@/presentation/components/registry';
import { HelpMenuService } from '@/presentation/verification/HelpMenuService';
import { VerificationService } from '@/presentation/verification/VerificationService';
import { env } from '@/shared/config/env';
import { logger } from '@/shared/logger/pino';
import { FxService } from '@/shared/services/FxService';

import { WelcomeService } from './WelcomeService';

export const fxService = new FxService({
  initialRate: env.MXN_USD_RATE,
  refreshIntervalMs: env.FX_REFRESH_INTERVAL_MS,
  disableAutoRefresh: env.MXN_USD_DISABLE_FETCH,
  logger,
});

fxService.start();

export const verificationService = new VerificationService({ env, logger });
void verificationService.init();

export const helpMenuService = new HelpMenuService({ env, logger, verificationService });

registerButtonHandler(verificationService.buttonCustomId, async (interaction) => {
  await verificationService.verify(interaction);
});

registerSelectMenuHandler(helpMenuService.customId, async (interaction) => {
  await helpMenuService.handleInteraction(interaction);
});

export const welcomeService = new WelcomeService({ env, logger });
welcomeService.start();
