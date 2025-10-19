// =============================================================================
// RUTA: src/shared/utils/ticketTranscripts.ts
// =============================================================================

import type { Message, TextChannel } from 'discord.js';

import type {
  TicketTranscript,
  TicketTranscriptMessage,
} from '@/domain/entities/TicketTranscript';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#039;');

const formatContent = (content: string): string =>
  escapeHtml(content).replace(/\n/gu, '<br>');

const formatTimestamp = (date: Date): string => {
  try {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'short',
      timeStyle: 'medium',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return date.toISOString();
  }
};

export const buildTranscriptMessageFromDiscordMessage = (
  message: Message,
): TicketTranscriptMessage => ({
  id: message.id,
  authorId: message.author.id,
  authorTag: message.author.tag ?? null,
  authorDisplayName: message.member?.displayName ?? message.author.username ?? null,
  authorAvatarUrl: message.author.displayAvatarURL({ extension: 'png', size: 128 }) ?? null,
  content: message.content ?? '',
  createdAt: message.createdAt ?? new Date(message.createdTimestamp),
  attachments: message.attachments.map((attachment) => ({
    name: attachment.name ?? 'archivo',
    url: attachment.url,
    contentType: attachment.contentType ?? null,
  })),
  referencedMessageId: message.reference?.messageId ?? null,
});

export const collectChannelMessagesForTranscript = async (
  channel: TextChannel,
): Promise<readonly TicketTranscriptMessage[]> => {
  const collected: TicketTranscriptMessage[] = [];
  const seen = new Set<string>();

  let before: string | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, before });

    if (batch.size === 0) {
      break;
    }

    const sorted = [...batch.values()].sort(
      (left, right) => left.createdTimestamp - right.createdTimestamp,
    );

    for (const message of sorted) {
      if (seen.has(message.id)) {
        continue;
      }

      seen.add(message.id);
      collected.push(buildTranscriptMessageFromDiscordMessage(message));
    }

    if (batch.size < 100) {
      break;
    }

    const oldest = sorted[0];
    if (!oldest) {
      break;
    }

    before = oldest.id;
  }

  return collected;
};

export const renderTranscriptAsHtml = (transcript: TicketTranscript): string => {
  const messages = transcript.getMessages();

  const rows = messages
    .map((message) => {
      const content = message.content.trim().length > 0
        ? formatContent(message.content)
        : '<em>Sin contenido</em>';
      const attachments = message.attachments
        .map(
          (attachment, index) =>
            `<li><a href="${escapeHtml(attachment.url)}" target="_blank" rel="noopener noreferrer">Adjunto ${
              index + 1
            }: ${escapeHtml(attachment.name)}</a></li>`,
        )
        .join('');
      const attachmentsBlock = attachments
        ? `<ul class="attachments">${attachments}</ul>`
        : '';
      const avatar = message.authorAvatarUrl
        ? `<img src="${escapeHtml(message.authorAvatarUrl)}" alt="Avatar de ${
            escapeHtml(message.authorDisplayName ?? message.authorTag ?? message.authorId)
          }" class="avatar" />`
        : '';
      const referenceBlock = message.referencedMessageId
        ? `<p class="reference">En respuesta a mensaje ID ${escapeHtml(
            message.referencedMessageId,
          )}</p>`
        : '';

      return `<article id="message-${message.id}" class="message">
  <header class="meta">
    ${avatar}
    <div class="author">
      <h3>${escapeHtml(message.authorDisplayName ?? message.authorTag ?? message.authorId)}</h3>
      ${message.authorTag ? `<p class="tag">${escapeHtml(message.authorTag)}</p>` : ''}
      <time datetime="${message.createdAt.toISOString()}">${formatTimestamp(message.createdAt)}</time>
    </div>
  </header>
  ${referenceBlock}
  <section class="content">${content}</section>
  ${attachmentsBlock}
</article>`;
    })
    .join('\n');

  const summary = `<p>Total de mensajes: <strong>${messages.length}</strong></p>`;

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Transcripción de ticket ${escapeHtml(transcript.id)}</title>
    <style>
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background-color: #0f172a;
        color: #f8fafc;
        margin: 0;
        padding: 24px;
      }
      header.summary {
        margin-bottom: 24px;
      }
      article.message {
        background-color: #1e293b;
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 16px;
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.3);
      }
      .meta {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
      }
      .meta .avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
      }
      .meta .author h3 {
        margin: 0;
        font-size: 1.1rem;
      }
      .meta .author .tag {
        margin: 2px 0 0;
        font-size: 0.85rem;
        color: #94a3b8;
      }
      .meta time {
        display: block;
        font-size: 0.8rem;
        color: #cbd5f5;
      }
      .content {
        margin-bottom: 12px;
        white-space: pre-wrap;
        line-height: 1.5;
      }
      .attachments {
        margin: 8px 0 0 16px;
        padding: 0;
        list-style: disc;
        color: #cbd5f5;
      }
      .attachments a {
        color: #38bdf8;
      }
      .reference {
        margin: 0 0 8px;
        font-size: 0.85rem;
        color: #facc15;
      }
    </style>
  </head>
  <body>
    <header class="summary">
      <h1>Transcripción de ticket ${escapeHtml(transcript.id)}</h1>
      ${summary}
      <p>Ticket interno #${transcript.ticketId} &middot; Canal ${transcript.channelId.toString()}</p>
      <p>Generado el ${formatTimestamp(new Date())}</p>
    </header>
    <main>
      ${rows}
    </main>
  </body>
</html>`;
};
