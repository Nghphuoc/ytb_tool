import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import type { CameraEffect } from '../types/types';

dotenv.config();

export interface RawSceneScript {
  sentence: string;
  visualPrompt: string;
  cameraEffect: CameraEffect;
  sfxUrl: string;
}

export interface GeneratedScript {
  title: string;
  fullText: string;
  rawScenes: RawSceneScript[];
  /** Whether to generate ElevenLabs voiceover for this video */
  voiceover: 'on' | 'off';
  /** Video category — drives BGM selection and prompt template */
  category: 'gaming' | 'kids-pets';
}

const FALLBACK_TOPICS = [
  {
    title: 'The Secret GTA 5 Physics Detail',
    content:
      "In GTA 5, if you shoot a cop's weapon out of their hand, they will pull out a backup pistol if they are close, or run away if they are far, showing advanced AI behavior.",
  },
  {
    title: 'Red Dead Redemption 2 Insane Animal AI',
    content:
      'In RDR2, possums actually play dead when threatened. If you approach one, its eyes remain open tracking your movements, and it will scramble away once your back is turned.',
  },
];

import { parsePromptString, type PromptInfo } from './promptParser';

export async function fetchRedditAndGenerateScript(
  customPrompt?: PromptInfo | string | null,
  subreddit = process.env.SUBREDDIT_SOURCE || 'GamingDetails'
): Promise<GeneratedScript> {
  const parsedPrompt: PromptInfo | null =
    typeof customPrompt === 'string'
      ? parsePromptString(customPrompt)
      : customPrompt ?? null;

  const randomFallback = FALLBACK_TOPICS[Math.floor(Math.random() * FALLBACK_TOPICS.length)];
  let postTitle = randomFallback.title;
  let postText = randomFallback.content;
  let gameContext = 'Gaming';
  let toneContext = 'Suspenseful, high-energy and viral';

  if (parsedPrompt) {
    console.log(`🎯 [Step 1] Sử dụng prompt theo format chuẩn:`);
    console.log(`   🎮 Game/Chủ đề: ${parsedPrompt.game}`);
    console.log(`   🔍 Chi tiết: ${parsedPrompt.detail || '(Tự động sáng tạo chi tiết hot nhất)'}`);
    console.log(`   🎭 Phong cách: ${parsedPrompt.tone}`);
    console.log(`   🔉 Voiceover: ${parsedPrompt.voiceover.toUpperCase()}`);
    console.log(`   🏷️  Category: ${parsedPrompt.category}`);
    gameContext = parsedPrompt.game;
    toneContext = parsedPrompt.tone;
    postTitle = parsedPrompt.detail
      ? `${parsedPrompt.game}: ${parsedPrompt.detail}`
      : `${parsedPrompt.game} Insane Secret Detail`;
    postText = `Game/Topic: ${parsedPrompt.game}. Detail/Secret: ${parsedPrompt.detail || 'Hidden lore and insane gameplay mechanics'}. Tone: ${parsedPrompt.tone}.`;
  } else {
    console.log(`🔍 [Step 1] Đang lấy dữ liệu từ r/${subreddit}...`);

    try {
      const res = await fetch(`https://www.reddit.com/r/${subreddit}/top.json?t=week&limit=15`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const json = (await res.json()) as {
          data?: {
            children?: Array<{
              data?: {
                over_18?: boolean;
                title?: string;
                selftext?: string;
              };
            }>;
          };
        };

        const posts =
          json.data?.children
            ?.map((c) => c.data)
            .filter((p): p is { over_18?: boolean; title: string; selftext?: string } =>
              Boolean(p && !p.over_18 && p.title && p.title.length > 15)
            ) ?? [];

        if (posts.length > 0) {
          const randomPost = posts[Math.floor(Math.random() * posts.length)];
          postTitle = randomPost.title;
          postText = randomPost.selftext || randomPost.title;
          console.log(`✅ Đã lấy thành công bài đăng từ Reddit: "${postTitle}"`);
        }
      } else {
        console.warn(`⚠️ Reddit phản hồi mã lỗi ${res.status}, sử dụng dữ liệu dự phòng.`);
      }
    } catch (err) {
      console.warn(`⚠️ Không thể kết nối trực tiếp tới Reddit (${err instanceof Error ? err.message : String(err)}). Dùng chủ đề dự phòng.`);
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('❌ ANTHROPIC_API_KEY chưa được thiết lập trong file .env');
  }

  const anthropic = new Anthropic({ apiKey });

  const category = parsedPrompt?.category ?? 'gaming';
  const isKidsPets = category === 'kids-pets';

  const prompt = isKidsPets
    ? `
You are an expert viral YouTube Shorts scriptwriter for a Kids & Pets entertainment channel.
Create a fun, wholesome, and hilarious short video script based on:
- Subject / Character: ${gameContext}
- Story / Moment: ${postText}
- Tone / Style: ${toneContext}

Write a fast-paced, cheerful 35 to 45-second script (around 100-200 words total).
Break the script into 6 to 8 short, punchy sentences (each sentence = 1 visual scene).
Rule 1: Scene 1 MUST be an irresistibly cute or funny hook under 14 words.
Rule 2: The final scene loops back to Scene 1 with a playful callback.
Rule 3: Keep language simple, joyful, and safe for all ages. NO scary, violent, or mature content.
Rule 4: For each scene, visualPrompt MUST describe a distinct, specific visual moment for an AI video generator, including the subject, action, environment, and camera framing. Do not describe searching for existing footage.
Rule 5: Do not include written text, subtitles, logos, or watermarks in visualPrompt.
Rule 6: Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
{
  "title": "Short catchy YouTube title #shorts",
  "scenes": [
    {
      "sentence": "Exact caption sentence for this scene.",
      "visualPrompt": "Detailed visual prompt for generating this scene as a new video",
      "cameraEffect": "zoom_in",
      "sfxUrl": "sfx/pop.mp3"
    }
  ]
}
Allowed values for cameraEffect: "zoom_in", "zoom_out", "pan_left", "pan_right".
Allowed values for sfxUrl: "sfx/whoosh.mp3", "sfx/pop.mp3".
`
    : `
You are an expert viral YouTube Shorts scriptwriter for a US Gaming/Entertainment channel.
Based on this game topic and requirements:
- Game: ${gameContext}
- Story / Secret: ${postText}
- Tone / Style: ${toneContext}

Write a fast-paced, highly engaging 35 to 45-second script (around 95-115 words total).
Break the script down into 6 to 8 short, punchy sentences (each sentence is 1 visual scene).
Rule 1: Scene 1 MUST be a shocking hook question or statement under 14 words.
Rule 2: The final scene must loop smoothly back to Scene 1.
Rule 3: Keep sentences concise and conversational in American English.
Rule 4: For each scene, visualPrompt MUST describe a distinct, specific visual moment for an AI video generator, including the subject, action, environment, and camera framing. Do not describe searching for existing footage.
Rule 5: Do not include written text, subtitles, logos, or watermarks in visualPrompt.
Rule 6: Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
{
  "title": "Short catchy YouTube title #shorts",
  "scenes": [
    {
      "sentence": "Exact spoken sentence for this scene.",
      "visualPrompt": "Detailed visual prompt for generating this scene as a new video",
      "cameraEffect": "zoom_in",
      "sfxUrl": "sfx/whoosh.mp3"
    }
  ]
}
Allowed values for cameraEffect: "zoom_in", "zoom_out", "pan_left", "pan_right".
Allowed values for sfxUrl: "sfx/whoosh.mp3", "sfx/pop.mp3".
`;

  console.log('🤖 Đang gửi sang Claude API để sinh kịch bản JSON...');
  const msg = await anthropic.messages.create({
    model: 'claude-3-7-sonnet-latest',
    max_tokens: 1500,
    temperature: 0.7,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = msg.content.find((block) => block.type === 'text');
  const textResponse = textBlock ? textBlock.text.trim() : '';
  const cleanJson = textResponse.replace(/^```json|```$/g, '').trim();
  const parsed = JSON.parse(cleanJson) as {
    title: string;
    scenes: RawSceneScript[];
  };

  const fullText = parsed.scenes.map((s) => s.sentence).join(' ');

  return {
    title: parsed.title,
    fullText,
    rawScenes: parsed.scenes,
    voiceover: parsedPrompt?.voiceover ?? 'on',
    category,
  };
}