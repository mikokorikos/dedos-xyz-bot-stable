// =============================================================================
// RUTA: src/domain/entities/TicketTranscript.ts
// =============================================================================

export interface TicketTranscriptAttachment {
  readonly name: string;
  readonly url: string;
  readonly contentType: string | null;
}

export interface TicketTranscriptMessage {
  readonly id: string;
  readonly authorId: string;
  readonly authorTag: string | null;
  readonly authorDisplayName: string | null;
  readonly authorAvatarUrl: string | null;
  readonly content: string;
  readonly createdAt: Date;
  readonly attachments: readonly TicketTranscriptAttachment[];
  readonly referencedMessageId: string | null;
}

export interface TicketTranscriptMessagePrimitive
  extends Omit<TicketTranscriptMessage, 'createdAt' | 'attachments'> {
  readonly createdAt: string;
  readonly attachments: readonly TicketTranscriptAttachment[];
}

interface TicketTranscriptProps {
  readonly id: string;
  readonly ticketId: number;
  readonly channelId: bigint;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly messages: readonly TicketTranscriptMessage[];
}

export class TicketTranscript {
  private readonly messageIds: Set<string>;

  private messages: TicketTranscriptMessage[];

  public constructor(private readonly props: TicketTranscriptProps) {
    this.messages = [...props.messages].sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );
    this.messageIds = new Set(this.messages.map((message) => message.id));
  }

  public get id(): string {
    return this.props.id;
  }

  public get ticketId(): number {
    return this.props.ticketId;
  }

  public get channelId(): bigint {
    return this.props.channelId;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public getMessages(): readonly TicketTranscriptMessage[] {
    return [...this.messages];
  }

  public appendMessages(messages: readonly TicketTranscriptMessage[]): number {
    let appended = 0;

    for (const message of messages) {
      if (this.messageIds.has(message.id)) {
        continue;
      }

      this.messages.push(message);
      this.messageIds.add(message.id);
      appended += 1;
    }

    if (appended > 0) {
      this.messages.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    }

    return appended;
  }

  public static fromPrimitives(data: {
    readonly id: string;
    readonly ticketId: number;
    readonly channelId: bigint;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly messages: readonly TicketTranscriptMessagePrimitive[];
  }): TicketTranscript {
    return new TicketTranscript({
      id: data.id,
      ticketId: data.ticketId,
      channelId: data.channelId,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      messages: data.messages.map((message) => ({
        ...message,
        createdAt: new Date(message.createdAt),
      })),
    });
  }

  public toPrimitives(): {
    readonly id: string;
    readonly ticketId: number;
    readonly channelId: bigint;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly messages: readonly TicketTranscriptMessagePrimitive[];
  } {
    return {
      id: this.props.id,
      ticketId: this.props.ticketId,
      channelId: this.props.channelId,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
      messages: this.messages.map((message) => ({
        ...message,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  }
}
