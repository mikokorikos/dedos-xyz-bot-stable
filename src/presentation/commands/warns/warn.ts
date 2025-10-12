// ============================================================================
// RUTA: src/presentation/commands/warns/warn.ts
// ============================================================================

import type { Message } from 'discord.js';
import { ChannelType, GuildMember, SlashCommandBuilder } from 'discord.js';

import {
  AddWarnUseCase,
  type EscalationAction,
  type EscalationProgress,
  resolveEscalationProgress,
} from '@/application/usecases/warns/AddWarnUseCase';
import { ListWarnsUseCase } from '@/application/usecases/warns/ListWarnsUseCase';
import { RemoveWarnUseCase } from '@/application/usecases/warns/RemoveWarnUseCase';
import { type Warn, WarnSeverity } from '@/domain/entities/Warn';
import type { WarnSummary } from '@/domain/repositories/IWarnRepository';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaWarnRepository } from '@/infrastructure/repositories/PrismaWarnRepository';
import type { Command } from '@/presentation/commands/types';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { COOLDOWNS, PERMISSIONS } from '@/shared/config/constants';
import { env } from '@/shared/config/env';
import { logger } from '@/shared/logger/pino';
import { brandMessageOptions } from '@/shared/utils/branding';
import { cooldownManager } from '@/shared/utils/cooldown-manager';
import { isValidSnowflake, mentionUser } from '@/shared/utils/discord.utils';
import { dmQueue } from '@/shared/utils/dm-queue';
import { hasPermissions } from '@/shared/utils/permissions';

const warnRepository = new PrismaWarnRepository(prisma);
const addWarnUseCase = new AddWarnUseCase(warnRepository, logger);
const removeWarnUseCase = new RemoveWarnUseCase(warnRepository, logger);
const listWarnsUseCase = new ListWarnsUseCase(warnRepository);

const ESCALATION_LABELS: Record<EscalationAction, string> = {
  NONE: 'Seguimiento (sin sanción inmediata)',
  MUTE: 'Silenciamiento temporal (12 horas)',
  TEMP_BAN: 'Suspensión temporal (7 días)',
  BAN: 'Expulsión definitiva del servidor',
};

const WARN_SEVERITY_LABELS: Record<WarnSeverity, string> = {
  [WarnSeverity.MINOR]: 'Leve',
  [WarnSeverity.MAJOR]: 'Grave',
  [WarnSeverity.CRITICAL]: 'Crítica',
};

const formatEscalationFields = (
  summary: WarnSummary,
  escalation: EscalationProgress,
): Record<string, string> => {
  const fields: Record<string, string> = {
    'Advertencias registradas': summary.total.toString(),
    'Puntuación ponderada': summary.weightedScore.toString(),
    'Sanción actual': ESCALATION_LABELS[escalation.currentAction],
    'Última advertencia': summary.lastWarnAt
      ? `<t:${Math.floor(summary.lastWarnAt.getTime() / 1000)}:R>`
      : 'N/A',
  };

  if (escalation.nextAction) {
    fields['Siguiente sanción'] = ESCALATION_LABELS[escalation.nextAction];

    if (escalation.remainingWeight <= 0) {
      fields['Progreso a la sanción'] = 'La siguiente advertencia activará esta sanción.';
    } else {
      const remainingWarns = Math.max(1, Math.ceil(escalation.remainingWeight));
      const warnLabel = remainingWarns === 1 ? 'advertencia leve' : 'advertencias leves';
      fields['Progreso a la sanción'] = `Faltan ${escalation.remainingWeight} puntos de severidad (~${remainingWarns} ${warnLabel}).`;
    }
  } else {
    fields['Siguiente sanción'] =
      'No hay sanciones adicionales. Cualquier advertencia extra resultará en expulsión definitiva.';
    fields['Progreso a la sanción'] = 'Has alcanzado el límite máximo permitido.';
  }

  return fields;
};

const buildWarnSummaryFields = (
  memberTag: string,
  summary: WarnSummary,
  escalation: EscalationProgress,
): Record<string, string> => ({
  Miembro: memberTag,
  ...formatEscalationFields(summary, escalation),
});

const PREFIX_USAGE_LINES = [
  `${env.COMMAND_PREFIX}warn add @usuario <leve|grave|critica> [razon opcional]`,
  `${env.COMMAND_PREFIX}warn remove <warn_id>`,
  `${env.COMMAND_PREFIX}warn list @usuario`,
];

const PREFIX_USAGE_DESCRIPTION = PREFIX_USAGE_LINES.map((line) => `• \`${line}\``).join('\n');

const normalizeToken = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const SEVERITY_ALIASES: Record<string, WarnSeverity> = {
  leve: WarnSeverity.MINOR,
  ligera: WarnSeverity.MINOR,
  light: WarnSeverity.MINOR,
  minor: WarnSeverity.MINOR,
  grave: WarnSeverity.MAJOR,
  mayor: WarnSeverity.MAJOR,
  major: WarnSeverity.MAJOR,
  alta: WarnSeverity.MAJOR,
  critica: WarnSeverity.CRITICAL,
  critico: WarnSeverity.CRITICAL,
  critical: WarnSeverity.CRITICAL,
};

const extractTargetFromArgs = (
  message: Message,
  args: ReadonlyArray<string>,
): { readonly userId: string | null; readonly remaining: string[] } => {
  const mutable = [...args];
  const mention = message.mentions.users.first();

  if (mention) {
    const mentionIndex = mutable.findIndex((token) => token.includes(mention.id));
    if (mentionIndex >= 0) {
      mutable.splice(mentionIndex, 1);
    }
    return { userId: mention.id, remaining: mutable };
  }

  if (mutable.length === 0) {
    return { userId: null, remaining: mutable };
  }

  const candidate = mutable[0]!;
  const sanitized = candidate.replace(/<@!?|>/g, '');

  if (isValidSnowflake(sanitized)) {
    mutable.shift();
    return { userId: sanitized, remaining: mutable };
  }

  return { userId: null, remaining: mutable };
};

const buildWarnHistoryDescription = (warns: readonly Warn[]): string => {
  if (warns.length === 0) {
    return 'El miembro no cuenta con advertencias registradas.';
  }

  return warns
    .slice(0, 10)
    .map((warn) => {
      const timestamp = `<t:${Math.floor(warn.createdAt.getTime() / 1000)}:R>`;
      const reason = warn.reason ? ` — ${warn.reason}` : '';
      return `• **${WARN_SEVERITY_LABELS[warn.severity]}**${reason} (${timestamp})`;
    })
    .join('\n');
};

const respondWithPrefixUsage = async (message: Message): Promise<void> => {
  await message.reply(
    brandMessageOptions({
      embeds: [
        embedFactory.info({
          title: 'Uso de ;warn',
          description:
            'Subcomandos disponibles para administrar advertencias:\n' + PREFIX_USAGE_DESCRIPTION,
        }),
      ],
      allowedMentions: { repliedUser: false },
    }),
  );
};

const handlePrefixWarnAdd = async (message: Message, args: ReadonlyArray<string>): Promise<void> => {
  if (!message.guild) {
    return;
  }

  const { userId, remaining } = extractTargetFromArgs(message, args);
  if (!userId) {
    await message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.warning({
            title: 'Usuario no válido',
            description: 'Debes mencionar a un usuario o proporcionar su ID numérica.',
          }),
        ],
        allowedMentions: { repliedUser: false },
      }),
    );
    return;
  }

  if (remaining.length === 0) {
    await message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.warning({
            title: 'Falta la severidad',
            description: 'Indica si la advertencia es leve, grave o crítica.',
          }),
        ],
        allowedMentions: { repliedUser: false },
      }),
    );
    return;
  }

  const severityToken = normalizeToken(remaining[0]!);
  const severity = SEVERITY_ALIASES[severityToken];

  if (!severity) {
    await message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.warning({
            title: 'Severidad no válida',
            description: 'Usa leve, grave o crítica para definir la advertencia.',
          }),
        ],
        allowedMentions: { repliedUser: false },
      }),
    );
    return;
  }

  const reason = remaining.slice(1).join(' ').trim() || undefined;

  let targetMember: GuildMember | null = null;
  try {
    targetMember = await message.guild.members.fetch(userId);
  } catch {
    targetMember = null;
  }

  if (!targetMember) {
    await message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.error({
            title: 'Miembro no encontrado',
            description: 'No pude encontrar a ese usuario en el servidor.',
          }),
        ],
        allowedMentions: { repliedUser: false },
      }),
    );
    return;
  }

  if (targetMember.user.bot) {
    await message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.warning({
            title: 'Acción no permitida',
            description: 'No puedes advertir a un bot.',
          }),
        ],
        allowedMentions: { repliedUser: false },
      }),
    );
    return;
  }

  const cooldownKey = `warn:${message.author.id}`;
  if (!cooldownManager.consume(cooldownKey, message.author.id, COOLDOWNS.warnCommand)) {
    await message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.warning({
            title: 'Espera un momento',
            description: 'Estás ejecutando este comando demasiado rápido. Inténtalo de nuevo en unos segundos.',
          }),
        ],
        allowedMentions: { repliedUser: false },
      }),
    );
    return;
  }

  let result: Awaited<ReturnType<typeof addWarnUseCase.execute>>;
  try {
    result = await addWarnUseCase.execute({
      userId,
      moderatorId: message.author.id,
      severity,
      reason,
    });
  } catch (error) {
    logger.error({ err: error, messageId: message.id }, 'No se pudo registrar la advertencia vía prefijo.');
    await message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.error({
            title: 'No se pudo registrar la advertencia',
            description: 'Ocurrió un problema al guardar la advertencia. Intenta nuevamente.',
          }),
        ],
        allowedMentions: { repliedUser: false },
      }),
    );
    return;
  }

  const staffSummaryFields = buildWarnSummaryFields(
    mentionUser(userId),
    result.summary,
    result.escalation,
  );
  const dmSummaryFields = buildWarnSummaryFields(targetMember.user.tag, result.summary, result.escalation);
  const severityLabel = WARN_SEVERITY_LABELS[severity];

  await message.reply(
    brandMessageOptions({
      embeds: [
        embedFactory.warnApplied({
          userTag: mentionUser(userId),
          moderatorTag: mentionUser(message.author.id),
          severity: severityLabel,
          reason,
        }),
        embedFactory.warnSummary(staffSummaryFields),
      ],
      allowedMentions: { users: [userId], repliedUser: false },
    }),
  );

  try {
    await dmQueue.enqueue(targetMember.user, {
      embeds: [
        embedFactory.warnApplied({
          userTag: targetMember.user.toString(),
          moderatorTag: mentionUser(message.author.id),
          severity: severityLabel,
          reason,
        }),
        embedFactory.warnSummary(dmSummaryFields),
      ],
    });
  } catch (error) {
    logger.warn({ err: error, userId }, 'No se pudo enviar la advertencia por DM.');
  }
};

const handlePrefixWarnRemove = async (message: Message, args: ReadonlyArray<string>): Promise<void> => {
  if (args.length === 0) {
    await message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.warning({
            title: 'Falta el ID de la advertencia',
            description: 'Especifica el ID numérico de la advertencia que deseas eliminar.',
          }),
        ],
        allowedMentions: { repliedUser: false },
      }),
    );
    return;
  }

  const warnIdToken = args[0]!;
  if (!/^\d+$/.test(warnIdToken)) {
    await message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.warning({
            title: 'ID inválido',
            description: 'El ID de la advertencia debe ser un número entero positivo.',
          }),
        ],
        allowedMentions: { repliedUser: false },
      }),
    );
    return;
  }

  const warnId = Number.parseInt(warnIdToken, 10);

  try {
    await removeWarnUseCase.execute({ warnId });
  } catch (error) {
    logger.warn({ err: error, warnId, messageId: message.id }, 'No se pudo eliminar la advertencia vía prefijo.');
    await message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.error({
            title: 'No se pudo eliminar la advertencia',
            description: 'Verifica el ID proporcionado e inténtalo nuevamente.',
          }),
        ],
        allowedMentions: { repliedUser: false },
      }),
    );
    return;
  }

  await message.reply(
    brandMessageOptions({
      embeds: [
        embedFactory.success({
          title: 'Advertencia eliminada',
          description: `La advertencia #${warnId} fue eliminada correctamente.`,
        }),
      ],
      allowedMentions: { repliedUser: false },
    }),
  );
};

const handlePrefixWarnList = async (message: Message, args: ReadonlyArray<string>): Promise<void> => {
  if (!message.guild) {
    return;
  }

  const { userId } = extractTargetFromArgs(message, args);
  if (!userId) {
    await message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.warning({
            title: 'Usuario no válido',
            description: 'Debes mencionar a un usuario o proporcionar su ID numérica.',
          }),
        ],
        allowedMentions: { repliedUser: false },
      }),
    );
    return;
  }

  let result: Awaited<ReturnType<typeof listWarnsUseCase.execute>>;
  try {
    result = await listWarnsUseCase.execute({ userId });
  } catch (error) {
    logger.warn({ err: error, userId, messageId: message.id }, 'No se pudo listar advertencias vía prefijo.');
    await message.reply(
      brandMessageOptions({
        embeds: [
          embedFactory.error({
            title: 'No se pudo obtener la información',
            description: 'Ocurrió un error al consultar las advertencias del usuario.',
          }),
        ],
        allowedMentions: { repliedUser: false },
      }),
    );
    return;
  }

  const escalation = resolveEscalationProgress(result.summary);
  const summaryFields = buildWarnSummaryFields(mentionUser(userId), result.summary, escalation);
  const historyDescription = buildWarnHistoryDescription(result.warns);

  await message.reply(
    brandMessageOptions({
      embeds: [
        embedFactory.warnSummary(summaryFields),
        embedFactory.info({
          title: result.warns.length ? 'Historial de advertencias' : 'Sin advertencias activas',
          description: historyDescription,
        }),
      ],
      allowedMentions: { users: [userId], repliedUser: false },
    }),
  );
};

export const warnCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Gestiona advertencias de miembros')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Aplica una advertencia a un miembro')
        .addUserOption((option) =>
          option.setName('usuario').setDescription('Miembro a advertir').setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('severidad')
            .setDescription('Nivel de severidad de la advertencia')
            .addChoices(
              { name: 'Leve', value: WarnSeverity.MINOR },
              { name: 'Grave', value: WarnSeverity.MAJOR },
              { name: 'Crítica', value: WarnSeverity.CRITICAL },
            )
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('razon')
            .setDescription('Motivo de la advertencia')
            .setMaxLength(400)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Elimina una advertencia existente por ID')
        .addIntegerOption((option) =>
          option.setName('warn_id').setDescription('ID de la advertencia a eliminar').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Lista las advertencias de un miembro')
        .addUserOption((option) =>
          option.setName('usuario').setDescription('Miembro a consultar').setRequired(true),
        ),
    ),
  category: 'Moderación',
  examples: [
    '/warn add usuario:@Miembro severidad:Leve',
    '/warn list usuario:@Miembro',
    `${env.COMMAND_PREFIX}warn add @Miembro leve Incumplimiento de reglas`,
    `${env.COMMAND_PREFIX}warn list @Miembro`,
  ],
  prefix: {
    name: 'warn',
    async execute(message, args) {
      if (!message.guild || message.channel.type !== ChannelType.GuildText) {
        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.warning({
                title: 'Canal no compatible',
                description: 'Este comando solo puede usarse en canales de texto del servidor.',
              }),
            ],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      if (!hasPermissions(message.member, PERMISSIONS.staff)) {
        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.warning({
                title: 'Permisos insuficientes',
                description: 'Necesitas permisos de staff para administrar advertencias.',
              }),
            ],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      if (args.length === 0) {
        await respondWithPrefixUsage(message);
        return;
      }

      const [subcommandRaw, ...rest] = args;
      const subcommand = normalizeToken(subcommandRaw ?? '');

      if (!subcommand || subcommand === 'help') {
        await respondWithPrefixUsage(message);
        return;
      }

      if (subcommand === 'add') {
        await handlePrefixWarnAdd(message, rest);
        return;
      }

      if (subcommand === 'remove' || subcommand === 'delete' || subcommand === 'del') {
        await handlePrefixWarnRemove(message, rest);
        return;
      }

      if (subcommand === 'list' || subcommand === 'mostrar' || subcommand === 'ver') {
        await handlePrefixWarnList(message, rest);
        return;
      }

      await message.reply(
        brandMessageOptions({
          embeds: [
            embedFactory.warning({
              title: 'Subcomando desconocido',
              description: 'Usa `add`, `remove` o `list` para administrar advertencias.',
            }),
          ],
          allowedMentions: { repliedUser: false },
        }),
      );
    },
  },
  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({
        embeds: [embedFactory.error({ title: 'Acción no disponible', description: 'Solo disponible en servidores.' })],
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    const member =
      interaction.member instanceof GuildMember
        ? interaction.member
        : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

    if (!hasPermissions(member, PERMISSIONS.staff)) {
      await interaction.reply({
        embeds: [embedFactory.error({ title: 'Permisos insuficientes', description: 'Necesitas permisos de staff para usar este comando.' })],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'add') {
      const target = interaction.options.getUser('usuario', true);
      const severity = interaction.options.getString('severidad', true) as WarnSeverity;
      const reason = interaction.options.getString('razon') ?? undefined;

      if (target.bot) {
        await interaction.reply({
          embeds: [embedFactory.error({ title: 'No permitido', description: 'No puedes advertir a otros bots.' })],
          ephemeral: true,
        });
        return;
      }

      const cooldownKey = `warn:${interaction.user.id}`;
      if (!cooldownManager.consume(cooldownKey, interaction.user.id, COOLDOWNS.warnCommand)) {
        await interaction.reply({
          embeds: [
            embedFactory.warning({
              title: 'Espera un momento',
              description: 'Estás ejecutando este comando demasiado rápido. Inténtalo de nuevo en unos segundos.',
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const result = await addWarnUseCase.execute({
        userId: target.id,
        moderatorId: interaction.user.id,
        severity,
        reason,
      });

      const staffSummaryFields = buildWarnSummaryFields(
        mentionUser(target.id),
        result.summary,
        result.escalation,
      );
      const dmSummaryFields = buildWarnSummaryFields(target.tag, result.summary, result.escalation);
      const severityLabel = WARN_SEVERITY_LABELS[severity];

      await interaction.editReply({
        embeds: [
          embedFactory.warnApplied({
            userTag: mentionUser(target.id),
            moderatorTag: mentionUser(interaction.user.id),
            severity: severityLabel,
            reason,
          }),
          embedFactory.warnSummary(staffSummaryFields),
        ],
      });

      try {
        await dmQueue.enqueue(target, {
          embeds: [
            embedFactory.warnApplied({
              userTag: target.toString(),
              moderatorTag: mentionUser(interaction.user.id),
              severity: severityLabel,
              reason,
            }),
            embedFactory.warnSummary(dmSummaryFields),
          ],
        });
      } catch (error) {
        logger.warn({ err: error, userId: target.id }, 'No se pudo enviar la advertencia por DM.');
      }

      return;
    }

    if (subcommand === 'remove') {
      const warnId = interaction.options.getInteger('warn_id', true);

      await interaction.deferReply({ ephemeral: true });
      await removeWarnUseCase.execute({ warnId });

      await interaction.editReply({
        embeds: [embedFactory.success({ title: 'Advertencia eliminada', description: `La advertencia #${warnId} fue eliminada.` })],
      });
      return;
    }

    if (subcommand === 'list') {
      const target = interaction.options.getUser('usuario', true);

      await interaction.deferReply({ ephemeral: true });

      const { warns, summary } = await listWarnsUseCase.execute({ userId: target.id });
      const escalation = resolveEscalationProgress(summary);
      const summaryFields = buildWarnSummaryFields(mentionUser(target.id), summary, escalation);

      const historyDescription = warns.length
        ? warns
            .slice(0, 10)
            .map((warn) => {
              const timestamp = `<t:${Math.floor(warn.createdAt.getTime() / 1000)}:R>`;
              const reason = warn.reason ? ` — ${warn.reason}` : '';
              return `• **${WARN_SEVERITY_LABELS[warn.severity]}**${reason} (${timestamp})`;
            })
            .join('\n')
        : 'El miembro no cuenta con advertencias registradas.';

      await interaction.editReply({
        embeds: [
          embedFactory.warnSummary(summaryFields),
          embedFactory.info({
            title: warns.length ? 'Historial de advertencias' : 'Sin advertencias activas',
            description: historyDescription,
          }),
        ],
      });
      return;
    }
  },
};
