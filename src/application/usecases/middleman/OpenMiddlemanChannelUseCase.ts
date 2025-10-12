// ============================================================================
// RUTA: src/application/usecases/middleman/OpenMiddlemanChannelUseCase.ts
// ============================================================================

import {
  ChannelType,
  type Guild,
  type GuildMember,
  OverwriteType,
  PermissionFlagsBits,
  type TextChannel,
} from 'discord.js';
import type { Logger } from 'pino';

import { type CreateMiddlemanTicketDTO, CreateMiddlemanTicketSchema } from '@/application/dto/ticket.dto';
import { TicketType } from '@/domain/entities/types';
import type { ITicketRepository, TicketParticipantInput } from '@/domain/repositories/ITicketRepository';
import type { TransactionProvider } from '@/domain/repositories/transaction';
import { middlemanCardGenerator } from '@/infrastructure/external/MiddlemanCardGenerator';
import type { EmbedFactory } from '@/presentation/embeds/EmbedFactory';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import {
  ChannelCleanupError,
  ChannelCreationError,
  TooManyOpenTicketsError,
  ValidationFailedError,
} from '@/shared/errors/domain.errors';
import { brandMessageOptions } from '@/shared/utils/branding';
import { sanitizeChannelName } from '@/shared/utils/discord.utils';
import { snapshotFromMember } from '@/shared/utils/discordIdentity';

const USER_MENTION_RE = /^<@!?([0-9]{17,20})>$/u;
const USER_ID_RE = /^[0-9]{17,20}$/u;

const MAX_OPEN_TICKETS = 3;

const extractUserIdFromMentionOrId = (input: string): string | undefined => {
  const mention = input.match(USER_MENTION_RE);
  if (mention) {
    return mention[1];
  }

  if (USER_ID_RE.test(input)) {
    return input;
  }

  return undefined;
};

const normalizeIdentifier = (value: string): string => value.normalize('NFKC').trim().toLowerCase();

const collectCandidateLabels = (member: GuildMember): readonly string[] => {
  const user = member.user;
  const discriminator = user.discriminator && user.discriminator !== '0'
    ? `${user.username}#${user.discriminator}`
    : null;

  const candidates = [
    user.username,
    discriminator,
    user.globalName ?? null,
    'displayName' in member ? member.displayName : null,
  ].filter((value): value is string => Boolean(value && value.trim().length > 0));

  return candidates.map((entry) => normalizeIdentifier(entry));
};

const resolveFromCache = (guild: Guild, normalized: string): GuildMember[] => {
  const cache = guild.members.cache;
  if (!cache || typeof cache.forEach !== 'function') {
    return [];
  }

  const matches: GuildMember[] = [];
  cache.forEach((member) => {
    if (!member) {
      return;
    }

    const candidates = collectCandidateLabels(member);
    if (candidates.includes(normalized)) {
      matches.push(member);
    }
  });

  return matches;
};

const searchMembers = async (
  guild: Guild,
  normalized: string,
  logger: Logger,
): Promise<GuildMember[]> => {
  if (typeof guild.members.search !== 'function') {
    return [];
  }

  try {
    const results = await guild.members.search({ query: normalized, limit: 5 });
    return Array.from(results.values()).filter((member): member is GuildMember => Boolean(member));
  } catch (error) {
    logger.warn(
      { err: error, guildId: guild.id, query: normalized },
      'Fallo al buscar miembros del gremio para middleman.',
    );
    return [];
  }
};

const buildAmbiguousError = (members: ReadonlyArray<GuildMember>): ValidationFailedError => {
  const preview = members
    .slice(0, 5)
    .map((member) => `• ${member.user.username} (${member.id})`)
    .join('\n');

  return new ValidationFailedError({
    partnerTag:
      'Se encontraron multiples usuarios con ese nombre. Especifica la **mencion** o **ID**.' +
      (preview ? `\n${preview}` : ''),
  });
};

const resolveUserId = async (
  input: string,
  guild: Guild,
  logger: Logger,
): Promise<string> => {
  const direct = extractUserIdFromMentionOrId(input);
  if (direct) {
    return direct;
  }

  const normalized = normalizeIdentifier(input);
  if (!normalized) {
    throw new ValidationFailedError({
      partnerTag:
        'No se pudo resolver el usuario. Pega la **mencion** (`<@...>`) o el **ID** (17-20 digitos).',
    });
  }

  const cacheHits = resolveFromCache(guild, normalized);
  const [singleCacheHit] = cacheHits;
  if (singleCacheHit && cacheHits.length === 1) {
    return singleCacheHit.id;
  }

  if (cacheHits.length > 1) {
    throw buildAmbiguousError(cacheHits);
  }

  const searchHits = await searchMembers(guild, normalized, logger);
  const [singleSearchHit] = searchHits;
  if (singleSearchHit && searchHits.length === 1) {
    return singleSearchHit.id;
  }

  if (searchHits.length > 1) {
    throw buildAmbiguousError(searchHits);
  }

  throw new ValidationFailedError({
    partnerTag:
      'No se encontró ningún usuario con ese nombre. Usa la **mención** (`<@...>`) o el **ID**.',
  });
};

export class OpenMiddlemanChannelUseCase {
  public constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly transactions: TransactionProvider,
    private readonly logger: Logger,
    private readonly embeds: EmbedFactory = embedFactory,
  ) {}

  public async execute(
    dto: CreateMiddlemanTicketDTO,
    guild: Guild,
  ): Promise<{ ticket: Awaited<ReturnType<ITicketRepository['create']>>; channel: TextChannel }> {
    this.logger.debug(
      { input: dto, partnerTag: dto.partnerTag },
      'Recibida solicitud para abrir ticket de middleman.',
    );

    const payload = CreateMiddlemanTicketSchema.parse(dto);
    this.logger.debug(
      { partnerTag: payload.partnerTag, userId: payload.userId, guildId: payload.guildId },
      'Entrada de middleman validada correctamente.',
    );
    const ownerId = BigInt(payload.userId);
    const guildId = BigInt(payload.guildId);

    this.logger.debug({ ownerId: payload.userId }, 'Validando límite de tickets abiertos.');
    const openTickets = await this.ticketRepo.countOpenByOwner(ownerId);
    if (openTickets >= MAX_OPEN_TICKETS) {
      throw new TooManyOpenTicketsError(MAX_OPEN_TICKETS);
    }

    const channelName = sanitizeChannelName(`mm-${payload.userId}`);
    const botId = guild.members.me?.id;

    if (!botId) {
      throw new ChannelCreationError('El bot no está presente en el gremio.');
    }

    this.logger.debug({ channelName, guildId: payload.guildId }, 'Creando canal de middleman.');

    const { partnerTag } = payload;

    if (!partnerTag) {
      throw new ValidationFailedError({
        partnerTag: 'Debes mencionar o introducir el ID de la persona con la que harás el trade.',
      });
    }

    const partnerIdStr = await resolveUserId(partnerTag, guild, this.logger);
    const partnerId = BigInt(partnerIdStr);

    const ownerMember = await guild.members.fetch(payload.userId).catch(() => null);
    if (!ownerMember) {
      throw new ChannelCreationError('No se pudo validar al solicitante dentro del servidor.');
    }

    const partnerMember = await guild.members.fetch(partnerIdStr).catch(() => null);

    if (!partnerMember) {
      throw new ValidationFailedError({
        partnerTag: 'La persona mencionada debe estar en el servidor para crear un ticket de middleman.',
      });
    }

    const ownerSnapshot = snapshotFromMember(ownerMember);
    const partnerSnapshot = snapshotFromMember(partnerMember);

    let createdChannel: TextChannel;
    try {
      createdChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        topic: payload.context.slice(0, 1000),
        parent: payload.categoryId,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
            type: OverwriteType.Role,
          },
          {
            id: payload.userId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
            type: OverwriteType.Member,
          },
          {
            id: partnerIdStr,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
            type: OverwriteType.Member,
          },
          {
            id: botId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ReadMessageHistory,
            ],
            type: OverwriteType.Member,
          },
        ],
      });
    } catch (error) {
      this.logger.error(
        {
          err: error,
          channelName,
          guildId: payload.guildId,
          ownerId: payload.userId,
          partnerId: partnerIdStr,
          categoryId: payload.categoryId,
        },
        'Falló la creación del canal de middleman.',
      );
      throw new ChannelCreationError(String(error));
    }

    const participants: TicketParticipantInput[] = [
      { userId: ownerId, role: 'OWNER' },
      { userId: partnerId, role: 'PARTNER' },
    ];

    try {
      const ticket = await this.transactions.$transaction(async (tx) => {
        const transactionalRepo = this.ticketRepo.withTransaction(tx);

        return transactionalRepo.create({
          guildId,
          channelId: BigInt(createdChannel.id),
          ownerId,
          type: TicketType.MM,
          participants,
          userSnapshots: [ownerSnapshot, partnerSnapshot],
        });
      });

      const ownerMention = `<@${payload.userId}>`;
      const partnerMention = `<@${partnerIdStr}>`;
      const embed = this.embeds.ticketCreated({
        ticketId: ticket.id,
        type: 'Middleman',
        ownerTag: ownerMention,
        description: payload.context,
      });

      const descriptionParts = [`**Participantes:** ${ownerMention} y ${partnerMention}`];
      const contextSummary = payload.context.trim();
      if (contextSummary.length > 0) {
        descriptionParts.push('', contextSummary);
      }
      embed.setDescription(descriptionParts.join('\n'));

      const tradeCard = await middlemanCardGenerator.renderTradeSummaryCard({
        ticketCode: ticket.id,
        middlemanTag: 'Pendiente de asignar',
        status: 'En espera de middleman',
        participants: [
          {
            label: ownerMember.displayName ?? ownerMember.user.tag,
            status: 'pending',
          },
          {
            label: partnerMember.displayName ?? partnerMember.user.tag,
            status: 'pending',
          },
        ],
        notes: contextSummary.length > 0 ? contextSummary : undefined,
      });

      await createdChannel.send(
        brandMessageOptions(
          {
            embeds: [embed],
            files: tradeCard ? [tradeCard] : [],
            allowedMentions: { users: [payload.userId, partnerIdStr], repliedUser: false },
          },
          { useHeroImage: true },
        ),
      );

      await createdChannel.send(
        brandMessageOptions({
          embeds: [
            this.embeds.info({
              title: 'Información del trade',
              description: [
                '1. Completa tus datos con **Mis datos de trade**.',
                '2. Confirma cuando estés listo usando **Confirmar trade**.',
                '3. El equipo middleman será notificado después de que ambos traders confirmen.',
              ].join('\n'),
            }),
          ],
          allowedMentions: { parse: [] },
        }),
      );

      this.logger.info(
        {
          ticketId: ticket.id,
          channelId: createdChannel.id,
          ownerId: payload.userId,
          partnerId: partnerIdStr,
          guildId: payload.guildId,
        },
        'Ticket de middleman creado exitosamente.',
      );

      return { ticket, channel: createdChannel };
    } catch (error) {
      this.logger.error(
        {
          err: error,
          ownerId: payload.userId,
          partnerId: partnerIdStr,
          guildId: payload.guildId,
          channelId: createdChannel.id,
        },
        'Fallo al persistir ticket de middleman.',
      );

      try {
        await createdChannel.delete('Error al registrar el ticket de middleman.');
      } catch (cleanupError) {
        this.logger.error(
          {
            err: cleanupError,
            channelId: createdChannel.id,
            guildId: payload.guildId,
            ownerId: payload.userId,
          },
          'Fallo al limpiar canal tras error.',
        );
        throw new ChannelCleanupError(createdChannel.id, cleanupError);
      }

      throw error;
    }
  }
}


