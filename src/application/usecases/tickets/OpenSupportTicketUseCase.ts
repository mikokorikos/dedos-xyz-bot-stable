// ============================================================================
// RUTA: src/application/usecases/tickets/OpenSupportTicketUseCase.ts
// ============================================================================

import type { Guild, GuildMember, TextChannel } from 'discord.js';
import { ChannelType, OverwriteType, PermissionFlagsBits } from 'discord.js';
import type { Logger } from 'pino';

import type { Ticket } from '@/domain/entities/Ticket';
import type { TicketType } from '@/domain/entities/types';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import {
  ChannelCreationError,
  TooManyOpenTicketsError,
  ValidationFailedError,
} from '@/shared/errors/domain.errors';
import { snapshotFromMember } from '@/shared/utils/discordIdentity';

const cooldownTracker = new Map<string, number>();

const buildCooldownKey = (userId: string, type: TicketType): string => `${userId}:${type}`;

interface OpenSupportTicketOptions {
  readonly categoryId?: string | null;
  readonly panelChannelId?: string | null;
  readonly staffRoleIds: readonly string[];
  readonly maxTicketsPerUser: number;
  readonly cooldownMs: number;
}

interface OpenSupportTicketParams {
  readonly guild: Guild;
  readonly member: GuildMember;
  readonly type: TicketType;
  readonly reason?: string;
  readonly channelPrefix?: string;
  readonly topicTag?: string;
  readonly originChannelId?: string;
}

export class OpenSupportTicketUseCase {
  public constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly logger: Logger,
    private readonly options: OpenSupportTicketOptions,
  ) {}

  public async execute({
    guild,
    member,
    type,
    reason,
    channelPrefix,
    topicTag,
    originChannelId,
  }: OpenSupportTicketParams): Promise<{
    readonly ticket: Ticket;
    readonly channel: TextChannel;
    readonly staffRoleIds: readonly string[];
  }> {
    const ownerId = BigInt(member.id);
    const guildId = BigInt(guild.id);

    const openTickets = await this.ticketRepo.countOpenByOwner(ownerId);
    if (openTickets >= this.options.maxTicketsPerUser) {
      throw new TooManyOpenTicketsError(this.options.maxTicketsPerUser);
    }

    const cooldownKey = buildCooldownKey(member.id, type);
    const lastOpenedAt = cooldownTracker.get(cooldownKey) ?? 0;
    const now = Date.now();
    const remaining = this.options.cooldownMs - (now - lastOpenedAt);

    if (this.options.cooldownMs > 0 && remaining > 0) {
      throw new ValidationFailedError({
        cooldown: `Debes esperar ${Math.ceil(remaining / 1000)} segundos antes de crear otro ticket de este tipo.`,
      });
    }

    const botId = guild.members.me?.id;
    if (!botId) {
      throw new ChannelCreationError('El bot no se encuentra en el servidor.');
    }

    const parentId = await this.resolveParentCategoryId(guild, originChannelId);
    if (!parentId) {
      throw new ValidationFailedError({
        categoryId:
          'Debe configurarse TICKET_CATEGORY_ID en el entorno o publicar el panel en una categoría válida.',
      });
    }

    const channelName = this.buildChannelName({ type, channelPrefix, member });
    const topic = this.buildTopic(topicTag ?? type.toLowerCase(), member.id);
    const staffRoleIds = this.filterStaffRoleIds(guild);

    let createdChannel: TextChannel;
    try {
      createdChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: parentId,
        topic,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
            type: OverwriteType.Role,
          },
          {
            id: member.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.UseExternalEmojis,
              PermissionFlagsBits.AddReactions,
            ],
            type: OverwriteType.Member,
          },
          ...staffRoleIds.map((roleId) => ({
            id: roleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.UseExternalEmojis,
              PermissionFlagsBits.AddReactions,
              PermissionFlagsBits.ManageMessages,
            ],
            type: OverwriteType.Role,
          })),
          {
            id: botId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageMessages,
            ],
            type: OverwriteType.Member,
          },
        ],
        reason: reason
          ? `Ticket (${type}) abierto por ${member.user.tag}: ${reason}`
          : `Ticket (${type}) abierto por ${member.user.tag}`,
      });
    } catch (error) {
      this.logger.error({ err: error, type, memberId: member.id }, 'Falló la creación del canal de ticket.');
      throw new ChannelCreationError((error as Error).message);
    }

    try {
      const ticket = await this.ticketRepo.create({
        guildId,
        channelId: BigInt(createdChannel.id),
        ownerId,
        type,
        participants: [{ userId: ownerId, role: 'OWNER' }],
        userSnapshots: [snapshotFromMember(member)],
      });

      cooldownTracker.set(cooldownKey, now);

      this.logger.info(
        { ticketId: ticket.id, channelId: createdChannel.id, ownerId: member.id, type },
        'Ticket de soporte creado correctamente.',
      );

      return { ticket, channel: createdChannel, staffRoleIds };
    } catch (error) {
      this.logger.error({ err: error, memberId: member.id }, 'Falló la persistencia del ticket.');

      try {
        await createdChannel.delete('Error al registrar ticket en la base de datos.');
      } catch (cleanupError) {
        this.logger.error(
          { err: cleanupError, channelId: createdChannel.id },
          'No se pudo eliminar el canal tras un fallo en el ticket.',
        );
      }

      throw error;
    }
  }

  private async resolveParentCategoryId(
    guild: Guild,
    originChannelId?: string,
  ): Promise<string | null> {
    if (this.options.categoryId) {
      return this.options.categoryId;
    }

    const channels = guild.channels as Partial<Guild['channels']> & {
      cache?: { get: (id: string) => unknown } | null;
      fetch?: (id: string) => Promise<unknown>;
    };

    const resolveFromChannelId = async (channelId: string): Promise<string | null> => {
      const cached =
        channels.cache && typeof channels.cache.get === 'function'
          ? (channels.cache.get(channelId) as {
              id?: string;
              parentId?: string | null;
            } | null)
          : null;
      const channel =
        cached ??
        (typeof channels.fetch === 'function'
          ? ((await channels.fetch(channelId).catch(() => null)) as {
              id?: string;
              parentId?: string | null;
            } | null)
          : null);

      if (channel && 'parentId' in channel && channel.parentId) {
        return channel.parentId;
      }

      return null;
    };

    if (this.options.panelChannelId) {
      const parentFromPanel = await resolveFromChannelId(this.options.panelChannelId);
      if (parentFromPanel) {
        return parentFromPanel;
      }
    }

    if (originChannelId) {
      const parentFromOrigin = await resolveFromChannelId(originChannelId);
      if (parentFromOrigin) {
        return parentFromOrigin;
      }
    }

    return null;
  }

  private filterStaffRoleIds(guild: Guild): string[] {
    const cache = guild.roles?.cache;
    if (!cache) {
      return [...this.options.staffRoleIds];
    }

    return this.options.staffRoleIds.filter((roleId) => cache.has(roleId));
  }

  private buildChannelName({
    type,
    channelPrefix,
    member,
  }: {
    readonly type: TicketType;
    readonly channelPrefix?: string;
    readonly member: GuildMember;
  }): string {
    const sanitize = (value: string | null | undefined): string => {
      if (!value) {
        return '';
      }

      return value
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    };

    const prefix = sanitize(channelPrefix) || type.toLowerCase();
    const username =
      sanitize(member.displayName) || sanitize(member.user.globalName) || sanitize(member.user.username) || 'cliente';
    const suffix =
      member.user.discriminator && member.user.discriminator !== '0'
        ? member.user.discriminator
        : member.id.slice(-4);

    const raw = `${prefix}-${username}-${suffix}`.replace(/-+/g, '-');
    return raw.length > 95 ? raw.slice(0, 95) : raw;
  }

  private buildTopic(tag: string, userId: string): string {
    const safeTag = tag.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'general';
    return `TICKET:${safeTag}:${userId}`.slice(0, 100);
  }
}
