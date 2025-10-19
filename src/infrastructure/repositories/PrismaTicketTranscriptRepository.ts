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

type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

type TicketTranscriptRecord = Prisma.TicketTranscriptGetPayload<Prisma.TicketTranscriptDefaultArgs>;

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
    const record = await this.prisma.ticketTranscript.create({
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
    const record = await this.prisma.ticketTranscript.findUnique({
      where: { ticketId },
    });

    return record ? this.toDomain(record) : null;
  }

  public async findByChannelId(channelId: bigint): Promise<TicketTranscript | null> {
    const record = await this.prisma.ticketTranscript.findFirst({
      where: { channelId },
    });

    return record ? this.toDomain(record) : null;
  }

  public async findByTranscriptId(transcriptId: string): Promise<TicketTranscript | null> {
    const record = await this.prisma.ticketTranscript.findUnique({
      where: { id: transcriptId },
    });

    return record ? this.toDomain(record) : null;
  }

  public async save(transcript: TicketTranscript): Promise<void> {
    const primitives = transcript.toPrimitives();

    await this.prisma.ticketTranscript.update({
      where: { id: primitives.id },
      data: {
        messages: toJsonArray(primitives.messages),
      },
    });
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
