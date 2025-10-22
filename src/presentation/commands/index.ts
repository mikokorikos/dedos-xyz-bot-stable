// ============================================================================
// RUTA: src/presentation/commands/index.ts
// ============================================================================

import { configCommand } from '@/presentation/commands/admin/config';
import {
  commandRegistry,
  getRegisteredCommands,
  prefixCommandRegistry,
  registerCommands,
  serializeCommands,
} from '@/presentation/commands/command-registry';
import { helpCommand } from '@/presentation/commands/general/help';
import { pingCommand } from '@/presentation/commands/general/ping';
import { rulesCommand } from '@/presentation/commands/general/rules';
import { messageStatsCommand } from '@/presentation/commands/messages/messages';
import { middlemanCommand } from '@/presentation/commands/middleman/middleman';
import { middlemanDirectoryCommand } from '@/presentation/commands/middleman/mm';
import { tradeCommand } from '@/presentation/commands/middleman/trade';
import { statsCommand } from '@/presentation/commands/stats/stats';
import {
  ticketCloseCommand,
  ticketsPanelCommand,
  ticketTranscriptCommand,
} from '@/presentation/commands/tickets/tickets';
import type { Command } from '@/presentation/commands/types';
import { unwarnCommand } from '@/presentation/commands/warns/unwarn';
import { verbalWarnCommand } from '@/presentation/commands/warns/verbal-warn';
import { warnCommand } from '@/presentation/commands/warns/warn';

const commands: Command[] = [
  configCommand,
  pingCommand,
  helpCommand,
  rulesCommand,
  middlemanCommand,
  middlemanDirectoryCommand,
  messageStatsCommand,
  tradeCommand,
  statsCommand,
  ticketCloseCommand,
  ticketTranscriptCommand,
  ticketsPanelCommand,
  unwarnCommand,
  verbalWarnCommand,
  warnCommand,
];

registerCommands(commands);

export { commandRegistry, getRegisteredCommands, prefixCommandRegistry, serializeCommands };
