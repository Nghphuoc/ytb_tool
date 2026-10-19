import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

// Khởi tạo Google Gen AI SDK (tự động nhận diện GEMINI_API_KEY từ biến môi trường)
const ai = new GoogleGenAI();

export interface RawSceneScript {
  sentence: string;
  searchQuery: string;
  cameraEffect: 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right';
  sfxUrl: string;
}

export interface GeneratedScript {
  title: string;
  fullText: string;
  rawScenes: RawSceneScript[];
}

export async function fetchRedditAndGenerateScriptGemini(
  subreddit = 'GamingDetails'
): Promise<GeneratedScript> {
  console.log(`🔍 [Step 1] Đang lấy dữ liệu từ r/${subreddit}...`);

  let postTitle = "The Secret GTA 5 Physics Detail";
  let postText = "In GTA 5, if you shoot a cop's weapon out of their hand, they will pull out a backup pistol if they are close, or run away if they are far, showing advanced AI behavior.";

  try {
    const res = await fetch(`https://www.reddit.com/r/${subreddit}/top.json?t=week&limit=15`, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' 
      },
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const json = await res.json();
      const posts = json.data.children
        .map((c: any) => c.data)
        .filter((p: any) => !p.over_18 && p.title && p.title.length > 15);

      if (posts.length > 0) {
        const randomPost = posts[Math.floor(Math.random() * posts.length)];
        postTitle = randomPost.title;
        postText = randomPost.selftext || randomPost.title;
        console.log(`✅ Đã lấy thành công bài đăng: "${postTitle}"`);
      }
    }
  } catch (err) {
    console.warn(`⚠️ Không thể kết nối tới Reddit, dùng kho chủ đề dự phòng.`);
  }

  const prompt = `
You are an expert viral YouTube Shorts scriptwriter for a US Gaming/Entertainment channel.
Based on this game detail / story:
- Title: ${postTitle}
- Content: ${postText}

Write a fast-paced, highly engaging 35 to 45-second script (around 95-115 words total).
Break the script down into 6 to 8 short, punchy sentences (each sentence is 1 visual scene).
Rule 1: Scene 1 MUST be a shocking hook question or statement under 14 words.
Rule 2: The final scene must loop smoothly back to Scene 1.
`;

  console.log('🤖 Đang gửi sang Gemini 3.8 Flash để sinh kịch bản JSON...');

  // Gọi Gemini với cấu trúc JSON Schema được định nghĩa rõ ràng
  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash', // Model tối ưu cho tốc độ và tác vụ lập trình/JSON
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
                sentence: { type: Type.STRING, description: 'Exact spoken sentence for this scene.' },
                searchQuery: { type: Type.STRING, description: 'Specific 4-6 word YouTube search query to find exact gameplay footage.' },
                cameraEffect: { type: Type.STRING, description: 'Must be one of: zoom_in, zoom_out, pan_left, pan_right' },
                sfxUrl: { type: Type.STRING, description: 'Must be one of: sfx/whoosh.mp3, sfx/pop.mp3' },
              },
              required: ['sentence', 'searchQuery', 'cameraEffect', 'sfxUrl'],
            },
          },
        },
        required: ['title', 'scenes'],
      },
    },
  });

  const textResponse = response.text || '{}';
  if (!textResponse) {
    throw new Error('Gemini không trả về kết quả nào.');
  }

  const parsed = JSON.parse(textResponse);
  const fullText = parsed.scenes.map((s: any) => s.sentence).join(' ');

  return {
    title: parsed.title,
    fullText,
    rawScenes: parsed.scenes,
  };
}