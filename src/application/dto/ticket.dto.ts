// ============================================================================
// RUTA: src/application/dto/ticket.dto.ts
// ============================================================================

import { z } from 'zod';

import { TicketType } from '@/domain/entities/types';
import { SnowflakeSchema } from '@/shared/utils/validation';

const USER_MENTION_PATTERN = /^<@!?(\d{17,20})>$/u;
const USER_ID_PATTERN = /^\d{17,20}$/u;

const PartnerIdentifierSchema = z
  .string()
  .trim()
  .refine((value) => USER_MENTION_PATTERN.test(value) || USER_ID_PATTERN.test(value), {
    message: 'Debe proporcionar la mencion o ID del companero',
  })
  .transform((value) => {
    const mentionMatch = value.match(USER_MENTION_PATTERN);
    if (mentionMatch) {
      return mentionMatch[1];
    }

    return value;
  });

export const CreateGeneralTicketSchema = z.object({
  userId: SnowflakeSchema,
  guildId: SnowflakeSchema,
  type: z.nativeEnum(TicketType).refine((value) => value !== TicketType.MM, {
    message: 'El tipo de ticket general no puede ser middleman.',
  }),
  reason: z.string().trim().min(10).max(1_000),
});

export type CreateGeneralTicketDTO = z.infer<typeof CreateGeneralTicketSchema>;

export const CloseTicketSchema = z.object({
  ticketId: z.number().int().positive(),
  executorId: SnowflakeSchema,
});

export type CloseTicketDTO = z.infer<typeof CloseTicketSchema>;

export const CreateMiddlemanTicketSchema = z.object({
  userId: SnowflakeSchema,
  guildId: SnowflakeSchema,
  type: z.literal('MM'),
  context: z.string().min(10).max(1_000, 'Context must be 10-1000 chars'),
  partnerTag: PartnerIdentifierSchema,
  categoryId: SnowflakeSchema,
});

export type CreateMiddlemanTicketDTO = z.infer<typeof CreateMiddlemanTicketSchema>;

export const ClaimTicketSchema = z.object({
  ticketId: z.number().int().positive(),
  middlemanId: SnowflakeSchema,
});

export type ClaimTicketDTO = z.infer<typeof ClaimTicketSchema>;
