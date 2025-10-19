import { describe, expect, it } from 'vitest';

import { TicketTranscript } from '@/domain/entities/TicketTranscript';
import { renderTranscriptAsHtml } from '@/shared/utils/ticketTranscripts';

const buildTranscript = () =>
  TicketTranscript.fromPrimitives({
    id: 'TCK-HTML01',
    ticketId: 42,
    channelId: BigInt('1200'),
    createdAt: new Date('2024-02-01T00:00:00.000Z'),
    updatedAt: new Date('2024-02-02T00:00:00.000Z'),
    messages: [
      {
        id: 'm-1',
        authorId: '123',
        authorTag: 'user#0001',
        authorDisplayName: 'Usuario',
        authorAvatarUrl: 'https://cdn.example/avatar.png',
        content: 'Hola <b>mundo</b>',
        createdAt: '2024-02-01T10:00:00.000Z',
        attachments: [],
        referencedMessageId: null,
      },
      {
        id: 'm-2',
        authorId: '456',
        authorTag: 'staff#0002',
        authorDisplayName: 'Staff',
        authorAvatarUrl: null,
        content: 'Archivo recibido',
        createdAt: '2024-02-01T10:05:00.000Z',
        attachments: [
          {
            name: 'captura.png',
            url: 'https://cdn.example/capture.png',
            contentType: 'image/png',
          },
        ],
        referencedMessageId: 'm-1',
      },
    ],
  });

describe('renderTranscriptAsHtml', () => {
  it('incluye datos esenciales y escapa el contenido', () => {
    const transcript = buildTranscript();

    const html = renderTranscriptAsHtml(transcript);

    expect(html).toContain('Transcripción de ticket TCK-HTML01');
    expect(html).toContain('Total de mensajes: <strong>2</strong>');
    expect(html).toContain('Adjunto 1: captura.png');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;mundo&lt;/b&gt;');
    expect(html).toContain('En respuesta a mensaje ID m-1');
  });
});
