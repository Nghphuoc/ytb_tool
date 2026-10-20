import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs';
import path from 'node:path';
import type { RawSceneScript } from './1_fechRedditAndScriptGemini';

type VideoCategory = 'gaming' | 'kids-pets';
const VIDEO_POLL_INTERVAL_MS = 5000;
const VIDEO_GENERATION_TIMEOUT_MS = 15 * 60 * 1000;

function getInteractionError(interaction: {
  errors?: Array<{ message?: string }>;
}): string {
  return interaction.errors
    ?.map((error) => error.message)
    .filter((message): message is string => Boolean(message))
    .join('; ') ?? '';
}

function getRateLimitMessage(error: unknown, sceneNumber: number): string | null {
  if (!(error instanceof Error) || !('status' in error) || error.status !== 429) {
    return null;
  }

  const retryAfter =
    'headers' in error &&
    error.headers instanceof Headers
      ? error.headers.get('retry-after')
      : null;
  const retryHint = retryAfter
    ? ` The server suggests retrying after ${retryAfter} seconds.`
    : '';

  return (
    `Gemini video generation hit a 429 rate limit while processing scene ${sceneNumber}. ` +
    `Check whether the API project has exhausted its quota or reached a request limit. ` +
    `If the error reports zero Free Tier quota, enable billing or upgrade the project's Gemini API tier, ` +
    `or configure GEMINI_VIDEO_MODEL to a video model with quota for this project. ` +
    `Check the active limits at https://ai.google.dev/gemini-api/docs/rate-limits.${retryHint}`
  );
}

async function withRateLimitMessage<T>(
  sceneNumber: number,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const rateLimitMessage = getRateLimitMessage(error, sceneNumber);
    if (rateLimitMessage) {
      throw new Error(rateLimitMessage, { cause: error });
    }
    throw error;
  }
}

export async function generateSceneVideos(
  title: string,
  category: VideoCategory,
  rawScenes: RawSceneScript[]
): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required to generate scene videos.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_VIDEO_MODEL || 'gemini-omni-1.1-flash';
  const scenesDir = path.join(process.cwd(), 'public', 'scenes');
  fs.mkdirSync(scenesDir, { recursive: true });

  const visualStyle =
    category === 'kids-pets'
      ? 'Wholesome, playful, colorful, family-friendly animated cinematic style.'
      : 'Cinematic, high-energy, dramatic gaming-inspired visual style.';

  for (let index = 0; index < rawScenes.length; index++) {
    const scene = rawScenes[index];
    const sceneNumber = index + 1;
    const outputFile = path.join(scenesDir, `scene_${sceneNumber}.mp4`);

    console.log(`   🎨 Scene ${sceneNumber}/${rawScenes.length}: Đang tạo video bằng AI...`);

    let interaction = await withRateLimitMessage(sceneNumber, () =>
      ai.interactions.create(
        {
          model,
          input: [
            `Create one new, standalone video scene for the YouTube Short "${title}".`,
            `Scene narration: ${scene.sentence}`,
            `Visual direction: ${scene.visualPrompt}`,
            `Style: ${visualStyle}`,
            'Portrait 9:16 composition, coherent motion, one continuous shot.',
            'Do not use existing footage or reference any video platform.',
            'Do not show captions, readable text, logos, watermarks, or user-interface elements.',
          ].join('\n'),
          background: true,
          response_format: {
            type: 'video',
            aspect_ratio: '9:16',
            resolution: '720p',
            delivery: 'inline',
          },
        },
        { retries: { strategy: 'none' } }
      )
    );
    console.log(`   🧾 Gemini task scene ${sceneNumber}: ${interaction.id}`);

    const deadline = Date.now() + VIDEO_GENERATION_TIMEOUT_MS;
    let nextProgressLog = Date.now() + 30_000;
    while (
      !interaction.output_video?.data &&
      (interaction.status === 'queued' || interaction.status === 'in_progress')
    ) {
      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out waiting for Gemini scene ${sceneNumber}; interaction ${interaction.id} is still ${interaction.status}.`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, VIDEO_POLL_INTERVAL_MS));
      const interactionId = interaction.id;
      interaction = await withRateLimitMessage(sceneNumber, () =>
        ai.interactions.get(interactionId)
      );
      if (Date.now() >= nextProgressLog) {
        console.log(`   ⏳ Scene ${sceneNumber}: Gemini vẫn đang tạo video...`);
        nextProgressLog = Date.now() + 30_000;
      }
    }

    const videoData = interaction.output_video?.data;
    if (!videoData) {
      const status = interaction.status ?? 'unknown';
      const detail = getInteractionError(interaction);
      throw new Error(
        `Gemini did not return video data for scene ${sceneNumber} (status: ${status})${
          detail ? `: ${detail}` : '.'
        }`
      );
    }

    const videoBuffer = Buffer.from(videoData, 'base64');
    if (videoBuffer.byteLength < 1024) {
      throw new Error(`Gemini returned an invalid or empty video for scene ${sceneNumber}.`);
    }

    fs.writeFileSync(outputFile, videoBuffer);
    console.log(
      `   ✅ Scene ${sceneNumber}: Đã tạo video (${(videoBuffer.byteLength / 1024 / 1024).toFixed(1)} MB)`
    );
  }

  console.log(`✅ Đã tạo xong ${rawScenes.length}/${rawScenes.length} cảnh video bằng AI.`);
}
