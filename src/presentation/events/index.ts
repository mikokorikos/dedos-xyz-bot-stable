// ============================================================================
// RUTA: src/presentation/events/index.ts
// ============================================================================

import { interactionCreateEvent } from '@/presentation/events/interactionCreate';
import { messageCreateEvent } from '@/presentation/events/messageCreate';
import { messageDeleteEvent } from '@/presentation/events/messageDelete';
import { readyEvent } from '@/presentation/events/ready';

export const events = [readyEvent, interactionCreateEvent, messageCreateEvent, messageDeleteEvent] as const;

export type AnyEventDescriptor = (typeof events)[number];
