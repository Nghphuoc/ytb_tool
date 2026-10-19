import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

export async function fetchRedditAndGenerateScript(
  subreddit = 'GamingDetails'
): Promise<GeneratedScript> {
  console.log(`🔍 [Step 1] Đang lấy dữ liệu từ r/${subreddit}...`);

  let postTitle = "The Secret GTA 5 Physics Detail";
  let postText = "In GTA 5, if you shoot a cop's weapon out of their hand, they will pull out a backup pistol if they are close, or run away if they are far, showing advanced AI behavior.";

  try {
    // Thêm User-Agent giả lập trình duyệt thật để Reddit không chặn kết nối
    const res = await fetch(`https://www.reddit.com/r/${subreddit}/top.json?t=week&limit=15`, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      },
      signal: AbortSignal.timeout(15000), // Timeout 15 giây
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
    } else {
      console.warn(`⚠️ Reddit phản hồi mã lỗi ${res.status}, sử dụng dữ liệu dự phòng.`);
    }
  } catch (err) {
    console.warn(`⚠️ Không thể kết nối trực tiếp tới Reddit (Lỗi mạng/Chặn IP), tự động dùng kho chủ đề dự phòng.`);
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
Rule 3: Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
{
  "title": "Short catchy YouTube title #shorts",
  "scenes": [
    {
      "sentence": "Exact spoken sentence for this scene.",
      "searchQuery": "Specific 4-6 word YouTube search query to find exact gameplay footage of this scene",
      "cameraEffect": "zoom_in",
      "sfxUrl": "sfx/whoosh.mp3"
    }
  ]
}
Allowed values for cameraEffect: "zoom_in", "zoom_out", "pan_left", "pan_right".
Allowed values for sfxUrl: "sfx/whoosh.mp3", "sfx/pop.mp3".
`;

  console.log('🤖 Đang gửi sang Claude API để sinh kịch bản chuẩn cấu trúc JSON...');
  const msg = await anthropic.messages.create({
    model: 'claude-3-7-sonnet-latest',
    max_tokens: 1500,
    temperature: 0.7,
    messages: [{ role: 'user', content: prompt }],
  });

  const textResponse = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
  const cleanJson = textResponse.replace(/^```json|```$/g, '').trim();
  const parsed = JSON.parse(cleanJson);

  const fullText = parsed.scenes.map((s: any) => s.sentence).join(' ');

  return {
    title: parsed.title,
    fullText,
    rawScenes: parsed.scenes,
  };
}