// ============================================================================
// RUTA: src/presentation/commands/warns/warn.ts
// ============================================================================

import { GuildMember, SlashCommandBuilder } from 'discord.js';

import {
  AddWarnUseCase,
  type EscalationAction,
  type EscalationProgress,
  resolveEscalationProgress,
} from '@/application/usecases/warns/AddWarnUseCase';
import { ListWarnsUseCase } from '@/application/usecases/warns/ListWarnsUseCase';
import { RemoveWarnUseCase } from '@/application/usecases/warns/RemoveWarnUseCase';
import { WarnSeverity } from '@/domain/entities/Warn';
import type { WarnSummary } from '@/domain/repositories/IWarnRepository';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaWarnRepository } from '@/infrastructure/repositories/PrismaWarnRepository';
import type { Command } from '@/presentation/commands/types';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { COOLDOWNS, PERMISSIONS } from '@/shared/config/constants';
import { logger } from '@/shared/logger/pino';
import { cooldownManager } from '@/shared/utils/cooldown-manager';
import { mentionUser } from '@/shared/utils/discord.utils';
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
  examples: ['/warn add usuario:@Miembro severidad:Leve', '/warn list usuario:@Miembro'],
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

      await interaction.editReply({
        embeds: [
          embedFactory.warnApplied({
            userTag: mentionUser(target.id),
            moderatorTag: mentionUser(interaction.user.id),
            severity,
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
              severity,
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
