import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { MiddlemanProfile } from '@/domain/repositories/IMiddlemanRepository';
import type { MiddlemanCardGenerator } from '@/infrastructure/external/MiddlemanCardGenerator';

process.env['DISCORD_TOKEN'] ??= 'preview-token';
process.env['DISCORD_CLIENT_ID'] ??= '000000000000000000';
process.env['DATABASE_URL'] ??= 'mysql://preview:preview@localhost:3306/dedos_preview';

const [{ DEFAULT_MIDDLEMAN_CARD_CONFIG }, { middlemanCardGenerator }, { createModuleLogger }] = await Promise.all([
  import('@/domain/value-objects/MiddlemanCardConfig'),
  import('@/infrastructure/external/MiddlemanCardGenerator'),
  import('@/shared/logger/logger'),
]);

const previewLog = createModuleLogger('Renderer.Preview');
const OUTPUT_DIR = resolve(process.cwd(), 'tmp/previews');

const hash = (value: string): string => createHash('sha1').update(value).digest('hex');

type ProfileRenderOptions = Parameters<MiddlemanCardGenerator['renderProfileCard']>[0];
type TradeRenderOptions = Parameters<MiddlemanCardGenerator['renderTradeSummaryCard']>[0];
type StatsRenderOptions = Parameters<MiddlemanCardGenerator['renderStatsCard']>[0];

const baseProfile: MiddlemanProfile = {
  userId: BigInt('100000000000000001'),
  primaryIdentity: {
    id: 1,
    username: 'SampleTrader',
    robloxUserId: BigInt(1),
    verified: true,
    lastUsedAt: new Date(),
  },
  vouches: 128,
  ratingSum: 486,
  ratingCount: 108,
  cardConfig: DEFAULT_MIDDLEMAN_CARD_CONFIG,
};

const profileSamples: ReadonlyArray<{ id: string; options: ProfileRenderOptions }> = [
  {
    id: 'profile-middleman',
    options: {
      discordTag: '@SampleMiddleman#0001',
      discordDisplayName: 'Sample Middleman',
      discordAvatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
      discordBannerUrl: undefined,
      profile: baseProfile,
      highlight: 'Disponible para coordinar trades seguros las 24 horas.',
    },
  },
  {
    id: 'profile-unregistered',
    options: {
      discordTag: '@NewUser#0002',
      discordDisplayName: 'Usuario Nuevo',
      discordAvatarUrl: 'https://cdn.discordapp.com/embed/avatars/2.png',
      discordBannerUrl: 'https://cdn.discordapp.com/embed/avatars/4.png',
      profile: null,
      highlight: 'Sin perfil registrado: se mostrarán elementos por defecto.',
    },
  },
];

const tradeSample: { id: string; options: TradeRenderOptions } = {
  id: 'trade-summary',
  options: {
    ticketCode: 9001,
    middlemanTag: '@SampleMiddleman',
    status: 'En curso',
    participants: [
      {
        label: 'Cliente A',
        roblox: 'TraderOne',
        status: 'confirmed',
        items: ['Dominus Frigidus', 'Valkyrie Helm'],
      },
      {
        label: 'Cliente B',
        roblox: 'TraderTwo',
        status: 'pending',
        items: ['120k Robux'],
      },
    ],
    notes: 'Ambas partes aceptaron los términos. Esperando confirmación final.',
  },
};

const statsSample: { id: string; options: StatsRenderOptions } = {
  id: 'stats-overview',
  options: {
    title: 'Resumen semanal',
    subtitle: 'Actividad del equipo de middleman',
    metrics: [
      { label: 'Tickets coordinados', value: '42', emphasis: true },
      { label: 'Trades completados', value: '38' },
      { label: 'Vouches nuevos', value: '16' },
      { label: 'Tiempo promedio', value: '32m' },
      { label: 'Robux asegurados', value: '2.1M' },
      { label: 'Incidentes', value: '0', emphasis: true },
    ],
  },
};

const ensureBuffer = (attachment: unknown): attachment is Buffer => Buffer.isBuffer(attachment);

const writeAttachment = async (id: string, attachment: Buffer, extension: string): Promise<string> => {
  const filePath = resolve(OUTPUT_DIR, `${id}.${extension}`);
  await writeFile(filePath, attachment);
  return filePath;
};

const renderProfiles = async (): Promise<number> => {
  let rendered = 0;
  for (const sample of profileSamples) {
    const sampleRun = previewLog.start('renderProfileSample', {
      sampleId: sample.id,
      discordTagHash: hash(sample.options.discordTag),
    });
    try {
      const attachment = await middlemanCardGenerator.renderProfileCard(sample.options);
      if (attachment && ensureBuffer(attachment.attachment)) {
        const filePath = await writeAttachment(sample.id, attachment.attachment, 'png');
        sampleRun.success({ filePath });
        rendered += 1;
      } else {
        sampleRun.error(new Error('profile-render-failed'), { reason: 'missing-attachment' });
      }
    } catch (error) {
      sampleRun.error(error, { reason: 'render-error' });
    }
  }
  return rendered;
};

const renderTradeSummary = async (): Promise<number> => {
  const tradeRun = previewLog.start('renderTradeSummarySample', {
    sampleId: tradeSample.id,
    ticketCodeHash: hash(String(tradeSample.options.ticketCode)),
  });
  try {
    const attachment = await middlemanCardGenerator.renderTradeSummaryCard(tradeSample.options);
    if (attachment && ensureBuffer(attachment.attachment)) {
      const filePath = await writeAttachment(tradeSample.id, attachment.attachment, 'png');
      tradeRun.success({ filePath });
      return 1;
    }
    tradeRun.error(new Error('trade-render-failed'), { reason: 'missing-attachment' });
  } catch (error) {
    tradeRun.error(error, { reason: 'render-error' });
  }
  return 0;
};

const renderStats = async (): Promise<number> => {
  const statsRun = previewLog.start('renderStatsSample', {
    sampleId: statsSample.id,
    titleHash: hash(statsSample.options.title),
  });
  try {
    const attachment = await middlemanCardGenerator.renderStatsCard(statsSample.options);
    if (attachment && ensureBuffer(attachment.attachment)) {
      const filePath = await writeAttachment(statsSample.id, attachment.attachment, 'png');
      statsRun.success({ filePath });
      return 1;
    }
    statsRun.error(new Error('stats-render-failed'), { reason: 'missing-attachment' });
  } catch (error) {
    statsRun.error(error, { reason: 'render-error' });
  }
  return 0;
};

const main = async (): Promise<void> => {
  const run = previewLog.start('renderPreview', {
    profileSamples: profileSamples.length,
  });

  await mkdir(OUTPUT_DIR, { recursive: true });
  run.step('directory:prepared', { outputDir: OUTPUT_DIR });

  const profileCount = await renderProfiles();
  const tradeCount = await renderTradeSummary();
  const statsCount = await renderStats();

  run.success({ profileCount, tradeCount, statsCount });
};

main().catch((error) => {
  previewLog.error('renderPreview', 'fatal', error, { stage: 'main' });
  process.exitCode = 1;
});
