// =============================================================================
// RUTA: src/shared/services/messageCountTracker.ts
// =============================================================================

import { prisma } from '@/infrastructure/db/prisma';
import { PrismaMessageCountRepository } from '@/infrastructure/repositories/PrismaMessageCountRepository';
import { logger } from '@/shared/logger/pino';

import { MessageCountTracker } from './message-count-tracker';

const repository = new PrismaMessageCountRepository(prisma);

export const messageCountTracker = new MessageCountTracker(repository, logger);

