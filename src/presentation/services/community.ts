// =============================================================================
// RUTA: src/presentation/services/community.ts
// =============================================================================

import { registerSelectMenuHandler } from '@/presentation/components/registry';
import { buildFeatureDisabledEmbed } from '@/presentation/embeds/featureEmbeds';
import { HelpMenuService } from '@/presentation/verification/HelpMenuService';
import { VerificationService } from '@/presentation/verification/VerificationService';
import { env } from '@/shared/config/env';
import { isFeatureEnabled } from '@/shared/config/runtime';
import { logger } from '@/shared/logger/pino';
import { FxService } from '@/shared/services/FxService';
import { brandReplyOptions } from '@/shared/utils/branding';

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

registerSelectMenuHandler(helpMenuService.customId, async (interaction) => {
  if (!(await isFeatureEnabled('verification'))) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [buildFeatureDisabledEmbed('verification')],
        ephemeral: true,
      }),
    );
    return;
  }

  await helpMenuService.handleInteraction(interaction);
});

export const welcomeService = new WelcomeService({ env, logger });
welcomeService.start();
