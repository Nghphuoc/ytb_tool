import { GoogleGenAI, Type, type GenerateContentResponse } from '@google/genai';
import dotenv from 'dotenv';
import type { CameraEffect } from '../types/types';

dotenv.config();

export interface RawSceneScript {
  sentence: string;
  searchQuery: string;
  cameraEffect: CameraEffect;
  sfxUrl: string;
}

export interface GeneratedScript {
  title: string;
  fullText: string;
  rawScenes: RawSceneScript[];
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
  {
    title: 'Elden Ring Hidden Boss Mechanic',
    content:
      'Margit the Fell Omen reacts specifically to your flask healing animation. If you heal during his neutral stance, he instantly queues an input-reading dagger throw.',
  },
  {
    title: 'Cyberpunk 2077 Night City Secret Traffic Detail',
    content:
      'If you shoot a driver in Night City, their vehicle continues rolling with real momentum, crashes into walls or pedestrians, and nearby NPCs panic and flee realistically.',
  },
  {
    title: 'God of War Ragnarok Kratos Combat Detail',
    content:
      'When Kratos recalls the Leviathan Axe, it physically strikes any enemy in its direct return trajectory, staggering or cleaving them from behind.',
  },
  {
    title: 'Minecraft Ancient City Warden Mechanic',
    content:
      'The Warden in Minecraft is completely blind and detects players solely through sculk vibrations and smell, making stealth and wool blocks essential for survival.',
  },
];

import { parsePromptString, type PromptInfo } from './promptParser';

export async function fetchRedditAndGenerateScriptGemini(
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
    console.log(`   🎮 Game: ${parsedPrompt.game}`);
    console.log(`   🔍 Chi tiết: ${parsedPrompt.detail || '(Tự động sáng tạo chi tiết hot nhất)'}`);
    console.log(`   🎭 Phong cách: ${parsedPrompt.tone}`);
    gameContext = parsedPrompt.game;
    toneContext = parsedPrompt.tone;
    postTitle = parsedPrompt.detail
      ? `${parsedPrompt.game}: ${parsedPrompt.detail}`
      : `${parsedPrompt.game} Insane Secret Detail`;
    postText = `Game: ${parsedPrompt.game}. Detail/Secret: ${parsedPrompt.detail || 'Hidden lore and insane gameplay mechanics'}. Tone: ${parsedPrompt.tone}. Make each scene describe clear, specific action gameplay footage.`;
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
        console.warn(`⚠️ Reddit phản hồi status ${res.status}. Sử dụng kho chủ đề dự phòng.`);
      }
    } catch {
      console.warn('⚠️ Không thể kết nối tới Reddit. Dùng chủ đề dự phòng.');
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('❌ GEMINI_API_KEY chưa được thiết lập trong file .env');
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const modelsToTry = Array.from(new Set([modelName, 'gemini-3.5-flash-lite']));
  const currentModel = modelsToTry[0];

  const prompt = `
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
Rule 4: For each scene, searchQuery MUST be 3-5 distinct keywords describing specific, dynamic in-game action (e.g. "${gameContext} combat action", "${gameContext} secret scene", "${gameContext} boss fight"). DO NOT use generic or identical queries across scenes.
`;

  console.log(`🤖 Đang gửi sang Gemini (${currentModel}) để sinh kịch bản JSON chuẩn Schema...`);

  let response: GenerateContentResponse | null = null;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      response = await ai.models.generateContent({
        model: currentModel,
        contents: prompt,
        config: {
          temperature: 0.7,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: 'Short catchy YouTube title with #shorts' },
              scenes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    sentence: {
                      type: Type.STRING,
                      description: 'Exact spoken sentence for this scene.',
                    },
                    searchQuery: {
                      type: Type.STRING,
                      description:
                        'Specific 4-6 word YouTube search query to find exact gameplay footage.',
                    },
                    cameraEffect: {
                      type: Type.STRING,
                      enum: ['zoom_in', 'zoom_out', 'pan_left', 'pan_right'],
                      description: 'Camera motion effect',
                    },
                    sfxUrl: {
                      type: Type.STRING,
                      enum: ['sfx/whoosh.mp3', 'sfx/pop.mp3'],
                      description: 'Sound effect file path',
                    },
                  },
                  required: ['sentence', 'searchQuery', 'cameraEffect', 'sfxUrl'],
                },
              },
            },
            required: ['title', 'scenes'],
          },
        },
      });
      break;
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      const message = String((err as { message?: string })?.message || '');
      const isOverload =
        status === 503 ||
        status === 429 ||
        message.includes('high demand') ||
        message.includes('UNAVAILABLE');

      if (isOverload && attempt < maxRetries) {
        const delayMs = attempt * 3000;
        console.warn(`⚠️ Gemini API đang quá tải tạm thời (503). Đang tự động thử lại lần ${attempt}/${maxRetries} sau ${(delayMs / 1000).toFixed(1)}s...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        throw err;
      }
    }
  }

  if (!response || !response.text) {
    throw new Error('Gemini API không trả về nội dung.');
  }

  const textResponse = response.text.trim();

  const parsed = JSON.parse(textResponse) as {
    title: string;
    scenes: RawSceneScript[];
  };

  const fullText = parsed.scenes.map((s) => s.sentence).join(' ');

  return {
    title: parsed.title,
    fullText,
    rawScenes: parsed.scenes,
  };
}