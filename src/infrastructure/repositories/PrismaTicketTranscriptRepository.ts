// =============================================================================
// RUTA: src/infrastructure/repositories/PrismaTicketTranscriptRepository.ts
// =============================================================================

import { type Prisma, type PrismaClient } from '@prisma/client';

import type {
  TicketTranscriptMessage,
  TicketTranscriptMessagePrimitive,
} from '@/domain/entities/TicketTranscript';
import { TicketTranscript } from '@/domain/entities/TicketTranscript';
import type {
  CreateTicketTranscriptData,
  ITicketTranscriptRepository,
} from '@/domain/repositories/ITicketTranscriptRepository';
import { logger } from '@/shared/logger/pino';

type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

interface TicketTranscriptDelegate {
  create(args: unknown): Promise<TicketTranscriptRecord>;
  findUnique(args: unknown): Promise<TicketTranscriptRecord | null>;
  findFirst(args: unknown): Promise<TicketTranscriptRecord | null>;
  update(args: unknown): Promise<TicketTranscriptRecord>;
}

const getTicketTranscriptDelegate = (client: PrismaClientLike): TicketTranscriptDelegate =>
  (client as unknown as { ticketTranscript: TicketTranscriptDelegate }).ticketTranscript;

interface TicketTranscriptRecord {
  id: string;
  ticketId: number;
  channelId: bigint;
  createdAt: Date;
  updatedAt: Date;
  messages: Prisma.JsonValue;
}


const TRANSCRIPT_TABLE = 'ticket_transcripts';
let warnedMissingTranscriptTable = false;

const extractErrorMessage = (error: unknown): string => {
  if (!error) {
    return '';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message ?? '';
  }

  const candidate = (error as { message?: unknown }).message;
  return typeof candidate === 'string' ? candidate : '';
};

const getPrismaErrorCode = (error: unknown): string | null => {
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
};

const isMissingTranscriptTableError = (error: unknown): boolean => {
  const code = getPrismaErrorCode(error);
  if (code === 'P2021' || code === 'P2010') {
    return true;
  }

  const message = extractErrorMessage(error).toLowerCase();
  if (!message) {
    return false;
  }

  const mentionsTable =
    message.includes(`\`${TRANSCRIPT_TABLE}\``) ||
    message.includes(`'${TRANSCRIPT_TABLE}'`) ||
    message.includes(TRANSCRIPT_TABLE);

  if (!mentionsTable) {
    return false;
  }

  return (
    message.includes('does not exist') ||
    message.includes('unknown') ||
    message.includes('no such table') ||
    message.includes('1146')
  );
};

const handleMissingTranscriptTable = <T>(error: unknown, fallback: T): T => {
  if (isMissingTranscriptTableError(error)) {
    if (!warnedMissingTranscriptTable) {
      warnedMissingTranscriptTable = true;
      logger.warn(
        { err: error },
        '[DB] La tabla "ticket_transcripts" no existe. Las transcripciones de tickets permanecerán deshabilitadas.',
      );
    }

    return fallback;
  }

  throw error;
};

const serializeMessages = (
  messages: readonly TicketTranscriptMessage[],
): readonly TicketTranscriptMessagePrimitive[] =>
  messages.map((message) => ({
    ...message,
    attachments: message.attachments.map((attachment) => ({ ...attachment })),
    createdAt: message.createdAt.toISOString(),
  }));

const toJsonArray = (values: readonly TicketTranscriptMessagePrimitive[]): Prisma.JsonArray =>
  values
    .map((value) => ({
      ...value,
      attachments: value.attachments.map((attachment) => ({ ...attachment })),
    }))
    .map((value) => ({ ...value })) as Prisma.JsonArray;

const normalizeMessages = (
  value: Prisma.JsonValue,
): TicketTranscriptMessagePrimitive[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: TicketTranscriptMessagePrimitive[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const candidate = item as Record<string, unknown>;
    const idRaw = candidate['id'];
    const authorIdRaw = candidate['authorId'];
    const createdAtRaw = candidate['createdAt'];

    const id = typeof idRaw === 'string' ? idRaw : undefined;
    const authorId = typeof authorIdRaw === 'string' ? authorIdRaw : undefined;
    const createdAt = typeof createdAtRaw === 'string' ? createdAtRaw : undefined;

    if (!id || !authorId || !createdAt) {
      continue;
    }

    const attachmentsValue = candidate['attachments'];
    const attachments = Array.isArray(attachmentsValue)
      ? (attachmentsValue.filter(
          (attachment): attachment is { name: string; url: string; contentType: string | null } =>
            !!attachment &&
            typeof attachment === 'object' &&
            typeof (attachment as Record<string, unknown>)['name'] === 'string' &&
            typeof (attachment as Record<string, unknown>)['url'] === 'string',
        ) as TicketTranscriptMessagePrimitive['attachments'])
      : [];

    normalized.push({
      id,
      authorId,
      authorTag: typeof candidate['authorTag'] === 'string' ? candidate['authorTag'] : null,
      authorDisplayName:
        typeof candidate['authorDisplayName'] === 'string' ? candidate['authorDisplayName'] : null,
      authorAvatarUrl:
        typeof candidate['authorAvatarUrl'] === 'string' ? candidate['authorAvatarUrl'] : null,
      content: typeof candidate['content'] === 'string' ? candidate['content'] : '',
      createdAt,
      attachments,
      referencedMessageId:
        typeof candidate['referencedMessageId'] === 'string' ? candidate['referencedMessageId'] : null,
    });
  }

  return normalized;
};

export class PrismaTicketTranscriptRepository implements ITicketTranscriptRepository {
  public constructor(private readonly prisma: PrismaClientLike) {}

  public async create(data: CreateTicketTranscriptData): Promise<TicketTranscript> {
    const record = await getTicketTranscriptDelegate(this.prisma).create({
      data: {
        id: data.transcriptId,
        ticketId: data.ticketId,
        channelId: data.channelId,
        messages: toJsonArray(serializeMessages(data.messages)),
      },
    });

    return this.toDomain(record);
  }

  public async findByTicketId(ticketId: number): Promise<TicketTranscript | null> {
    try {
      const record = await getTicketTranscriptDelegate(this.prisma).findUnique({
        where: { ticketId },
      });

      return record ? this.toDomain(record) : null;
    } catch (error) {
      return handleMissingTranscriptTable(error, null);
    }
  }

  public async findByChannelId(channelId: bigint): Promise<TicketTranscript | null> {
    try {
      const record = await getTicketTranscriptDelegate(this.prisma).findFirst({
        where: { channelId },
      });

      return record ? this.toDomain(record) : null;
    } catch (error) {
      return handleMissingTranscriptTable(error, null);
    }
  }

  public async findByTranscriptId(transcriptId: string): Promise<TicketTranscript | null> {
    try {
      const record = await getTicketTranscriptDelegate(this.prisma).findUnique({
        where: { id: transcriptId },
      });

      return record ? this.toDomain(record) : null;
    } catch (error) {
      return handleMissingTranscriptTable(error, null);
    }
  }

  public async save(transcript: TicketTranscript): Promise<void> {
    const primitives = transcript.toPrimitives();

    try {
      await getTicketTranscriptDelegate(this.prisma).update({
        where: { id: primitives.id },
        data: {
          messages: toJsonArray(primitives.messages),
        },
      });
    } catch (error) {
      handleMissingTranscriptTable(error, undefined);
    }
  }

  private toDomain(record: TicketTranscriptRecord): TicketTranscript {
    return TicketTranscript.fromPrimitives({
      id: record.id,
      ticketId: record.ticketId,
      channelId: record.channelId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      messages: normalizeMessages(record.messages),
    });
  }
}
