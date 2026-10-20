import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import type { ShortVideoProps } from '../types/types';
import { fetchRedditAndGenerateScriptGemini } from './1_fechRedditAndScriptGemini';
import { fetchRedditAndGenerateScript } from './1_fetchRedditAndScript';
import { generateAudioAndSyncScenes } from './2_generateAudio';
import { downloadSceneAssets } from './3_downloadAssets';
import { resolvePrompt } from './promptParser';

dotenv.config();

const HIGHLIGHT_COLORS_GAMING = ['#FFD700', '#00FF66', '#00E5FF', '#FF3366'];
const HIGHLIGHT_COLORS_KIDS = ['#FF85A1', '#FFCF56', '#7ED8F6', '#B6F7C1'];

/** BGM file selection based on video category */
const BGM_FILES: Record<string, string> = {
  gaming: 'audio/bgm_suspense.mp3',
  'kids-pets': 'audio/bgm_cute.mp3',
};

/**
 * Đo thời gian thực thi của từng công đoạn
 */
async function measureTime<T>(stepName: string, fn: () => Promise<T> | T): Promise<T> {
  const start = Date.now();
  console.log(`⏳ [Bắt đầu] ${stepName}...`);
  try {
    const result = await fn();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✅ [Hoàn tất] ${stepName} trong ${elapsed}s`);
    return result;
  } catch (error) {
    console.error(`❌ [Lỗi] ${stepName} thất bại:`, error);
    throw error;
  }
}

/**
 * Thực thi lệnh ngoại vi với cơ chế Retry
 */
function runWithRetry(
  cmd: string,
  args: string[],
  options: ExecFileSyncOptions,
  retries = 2
) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return execFileSync(cmd, args, options);
    } catch (error) {
      console.warn(`⚠️ Lần chạy thứ ${attempt}/${retries} thất bại. Đang thử lại...`);
      if (attempt === retries) throw error;
    }
  }
}

/**
 * Dọn dẹp file cũ trong thư mục out/ (giữ lại trong maxDays)
 */
function cleanupOldFiles(dir: string, maxDays = 7) {
  if (!fs.existsSync(dir)) return;
  const now = Date.now();
  const maxAgeMs = maxDays * 24 * 60 * 60 * 1000;

  for (const file of fs.readdirSync(dir)) {
    const filePath = path.join(dir, file);
    try {
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        console.log(`🧹 Đã dọn dẹp file cũ: ${file}`);
      }
    } catch {
      // Ignore cleanup error on open files
    }
  }
}

/**
 * Kiểm tra các biến môi trường cần thiết trước khi khởi chạy
 */
function validatePreflight() {
  const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  const missingKeys: string[] = [];

  if (provider === 'gemini' && !process.env.GEMINI_API_KEY) {
    missingKeys.push('GEMINI_API_KEY');
  } else if (provider === 'claude' && !process.env.ANTHROPIC_API_KEY) {
    missingKeys.push('ANTHROPIC_API_KEY');
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    missingKeys.push('ELEVENLABS_API_KEY');
  } else if (!process.env.ELEVENLABS_API_KEY.startsWith('sk_')) {
    console.error('\n❌ ELEVENLABS_API_KEY KHÔNG HỢP LỆ:');
    console.error('   Chuỗi hiện tại trong .env là "Key ID" (cf94d...), không phải Secret API Key.');
    console.error('   API Key của ElevenLabs bắt buộc phải bắt đầu bằng "sk_".');
    console.error('   👉 Cách lấy: Vào https://elevenlabs.io/app/settings/api-keys > Create Key (hoặc bấm Copy Secret Key).\n');
    throw new Error('Invalid ELEVENLABS_API_KEY format: Must start with "sk_"');
  }

  if (missingKeys.length > 0) {
    console.error('\n❌ THIẾU CẤU HÌNH BIẾN MÔI TRƯỜNG:');
    console.error(`   Vui lòng tạo file .env từ .env.example và điền: ${missingKeys.join(', ')}\n`);
    throw new Error(`Missing environment keys: ${missingKeys.join(', ')}`);
  }
}

async function runFullPipeline() {
  const pipelineStart = Date.now();
  console.log('===========================================================');
  console.log('🚀 BẮT ĐẦU DÂY CHUYỀN SẢN XUẤT YOUTUBE SHORTS TỰ ĐỘNG');
  console.log('===========================================================');

  try {
    validatePreflight();

    // Thu thập prompt (CLI parameter, Terminal trực tiếp hoặc file prompt.txt)
    const promptInfo = await resolvePrompt();

    const dataDir = path.join(process.cwd(), 'data');
    const outDir = path.join(process.cwd(), 'out');

    await measureTime('Chuẩn bị thư mục & Dọn dẹp cache', () => {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.mkdirSync(outDir, { recursive: true });
      cleanupOldFiles(outDir, 7);
    });

    // 1. Sinh kịch bản qua AI (Gemini hoặc Claude tùy cấu hình)
    const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
    const scriptData = await measureTime(`Lấy ý tưởng & Kịch bản từ AI (${provider})`, () => {
      if (provider === 'claude') {
        return fetchRedditAndGenerateScript(promptInfo);
      }
      return fetchRedditAndGenerateScriptGemini(promptInfo);
    });

    // 2. Tạo giọng đọc và đồng bộ Scene timing
    //    Nếu voiceover = 'off': bỏ qua ElevenLabs, tạo timings từ độ dài câu
    const voiceoverOn = scriptData.voiceover === 'on';
    const { generateCaptionOnlyTimings } = await import('./2_generateAudio');

    type AudioResult = Awaited<ReturnType<typeof generateAudioAndSyncScenes>>;
    const audioData = await measureTime<AudioResult>(
      voiceoverOn
        ? 'Tạo giọng đọc ElevenLabs & Đồng bộ Scene'
        : 'Bỏ qua ElevenLabs (voiceover=off) – Tạo timings từ độ dài câu',
      async () => {
        if (!voiceoverOn) {
          const result = await generateCaptionOnlyTimings(scriptData.rawScenes);
          return { ...result, voiceoverUrl: result.voiceoverUrl as string | null } as AudioResult;
        }
        return generateAudioAndSyncScenes(scriptData.fullText, scriptData.rawScenes);
      }
    );

    // 3. Tải tài nguyên video hành động (yt-dlp + FFmpeg)
    await measureTime('Tải video minh họa từng Scene', () =>
      downloadSceneAssets(scriptData.rawScenes)
    );

    // 4. Kiểm tra tài nguyên âm thanh & Tự động chọn BGM theo category
    const category = scriptData.category ?? 'gaming';
    const preferredBgmFile = BGM_FILES[category] ?? BGM_FILES['gaming'];
    const bgmPath = path.join(process.cwd(), 'public', preferredBgmFile);

    // Fallback: nếu BGM category không tồn tại, thử file còn lại
    const fallbackBgmFile = category === 'kids-pets' ? BGM_FILES['gaming'] : BGM_FILES['kids-pets'];
    const fallbackBgmPath = path.join(process.cwd(), 'public', fallbackBgmFile ?? '');

    const hasBgm = fs.existsSync(bgmPath);
    const hasFallbackBgm = !hasBgm && fs.existsSync(fallbackBgmPath);
    const activeBgmFile = hasBgm ? preferredBgmFile : hasFallbackBgm ? fallbackBgmFile : null;

    if (!hasBgm) {
      if (hasFallbackBgm) {
        console.warn(`⚠️ Không tìm thấy ${preferredBgmFile}; dùng ${fallbackBgmFile} thay thế.`);
      } else {
        console.warn(`⚠️ Không tìm thấy file BGM nào; video sẽ không có nhạc nền.`);
      }
    } else {
      console.log(`🎵 BGM tự động: ${preferredBgmFile} (category: ${category})`);
    }

    const isKidsPets = category === 'kids-pets';
    const HIGHLIGHT_COLORS = isKidsPets ? HIGHLIGHT_COLORS_KIDS : HIGHLIGHT_COLORS_GAMING;

    const randomColor = HIGHLIGHT_COLORS[Math.floor(Math.random() * HIGHLIGHT_COLORS.length)];
    const randomTilt = isKidsPets
      ? Number(((Math.random() * 1.2) - 0.6).toFixed(2))   // Kids: gentler tilt
      : Number(((Math.random() * 2.4) - 1.2).toFixed(2));  // Gaming: full tilt range
    const randomBgmVolume = isKidsPets
      ? Number((0.12 + Math.random() * 0.06).toFixed(3))   // Kids: slightly louder BGM
      : Number((0.08 + Math.random() * 0.04).toFixed(3));

    const finalProps: ShortVideoProps = {
      totalDurationInSeconds: audioData.totalDurationInSeconds,
      voiceoverUrl: voiceoverOn ? (audioData.voiceoverUrl ?? null) : null,
      voiceoverEnabled: voiceoverOn,
      backgroundVideoUrl: null,
      backgroundVideoStartFrom: 0,
      bgmUrl: activeBgmFile ?? null,
      bgmVolume: randomBgmVolume,
      highlightColor: randomColor,
      captionTiltAngle: randomTilt,
      scenes: audioData.syncedScenes.map((scene, index) => {
        const sfxAvailable =
          scene.sfxUrl && fs.existsSync(path.join(process.cwd(), 'public', scene.sfxUrl));
        const sceneFile = `scenes/scene_${index + 1}.mp4`;
        const exists = fs.existsSync(path.join(process.cwd(), 'public', sceneFile));

        return {
          ...scene,
          mediaUrl: exists ? sceneFile : scene.mediaUrl,
          mediaType: 'video' as const,
          sfxUrl: sfxAvailable ? scene.sfxUrl : undefined,
        };
      }),
      words: audioData.words,
    };

    // Lưu file Props JSON (để Remotion render CLI đọc và Studio preview)
    const propsFilePath = path.join(dataDir, 'current_props.json');
    fs.writeFileSync(propsFilePath, JSON.stringify(finalProps, null, 2), 'utf-8');
    console.log(`💾 Đã lưu cấu hình video tại: data/current_props.json`);

    // 5. Render Video Full-Screen 30fps (Tối ưu siêu tốc cho CPU Intel i5)
    const safeTitle = scriptData.title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
    const outputVideoPath = path.join(outDir, `${Date.now()}_${safeTitle}.mp4`);

    await measureTime('Render Video Remotion (1080x1920 @ 30fps Full-Screen)', () => {
      runWithRetry(
        process.execPath,
        [
          path.join(process.cwd(), 'node_modules', '@remotion', 'cli', 'remotion-cli.js'),
          'render',
          'src/index.ts',
          'MainShort',
          outputVideoPath,
          `--props=${propsFilePath}`,
          '--codec=h264',
          '--crf=23',
          '--concurrency=6',
          '--gl=angle',
        ],
        { stdio: 'inherit' },
        2
      );
    });

    const totalElapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
    console.log('\n===========================================================');
    console.log(`🎉 HOÀN TẤT TOÀN BỘ PIPELINE TRONG ${totalElapsed}s!`);
    console.log(`📌 Tiêu đề: ${scriptData.title}`);
    console.log(`📂 File kết quả: ${outputVideoPath}`);
    console.log('💡 Gợi ý: Chạy "npm run dev" để mở Remotion Studio kiểm tra.');
    console.log('===========================================================');
  } catch (error) {
    console.error('\n❌ Lỗi nghiêm trọng trong quá trình chạy Pipeline:', error);
    process.exit(1);
  }
}

runFullPipeline();