import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ShortVideoProps } from '../types/types';
import { fetchRedditAndGenerateScriptGemini } from './1_fechRedditAndScriptGemini';
import { generateAudioAndSyncScenes } from './2_generateAudio';
import { downloadSceneAssets } from './3_downloadAssets';

const HIGHLIGHT_COLORS = ['#FFD700', '#00FF66', '#00E5FF', '#FF3366'];

// Hàm hỗ trợ đo thời gian từng bước
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

// Hàm hỗ trợ chạy lệnh với cơ chế Retry
function runWithRetry(cmd: string, args: string[], options: any, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return execFileSync(cmd, args, options);
    } catch (error) {
      console.warn(`⚠️ Lần chạy thứ ${attempt}/${retries} thất bại. Đang thử lại...`);
      if (attempt === retries) throw error;
    }
  }
}

// Dọn dẹp file cũ (giữ lại file trong vòng 7 ngày)
function cleanupOldFiles(dir: string, maxDays = 7) {
  if (!fs.existsSync(dir)) return;
  const now = Date.now();
  const maxAgeMs = maxDays * 24 * 60 * 60 * 1000;
  
  fs.readdirSync(dir).forEach((file) => {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);
    if (now - stats.mtimeMs > maxAgeMs) {
      fs.unlinkSync(filePath);
      console.log(`🧹 Đã dọn dẹp file cũ: ${file}`);
    }
  });
}

async function runFullPipeline() {
  const pipelineStart = Date.now();
  console.log('🚀 BẮT ĐẦU DÂY CHUYỀN SẢN XUẤT YOUTUBE SHORTS TỰ ĐỘNG...');

  try {
    // Đảm bảo các thư mục cần thiết tồn tại và dọn dẹp file rác cũ song song
    const dataDir = path.join(process.cwd(), 'data');
    const outDir = path.join(process.cwd(), 'out');
    
    await measureTime('Chuẩn bị thư mục & Dọn dẹp', () => {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.mkdirSync(outDir, { recursive: true });
      cleanupOldFiles(outDir, 7);
    });

    // 1 & 2. Chạy lấy kịch bản và chuẩn bị tài nguyên (Có thể tối ưu nếu API độc lập, ở đây giữ logic cốt lõi)
    const scriptData = await measureTime('Lấy ý tưởng & Kịch bản từ Gemini', () =>
      fetchRedditAndGenerateScriptGemini('GamingDetails')
    );

    const audioData = await measureTime('Tạo giọng đọc ElevenLabs & Đồng bộ Scene', () =>
      generateAudioAndSyncScenes(scriptData.fullText, scriptData.rawScenes)
    );

    const availableSceneIndices = await measureTime('Tải video minh họa từng Scene', () =>
      downloadSceneAssets(scriptData.rawScenes)
    );

    // 3. Chuẩn bị thông số Anti-Detection & Kiểm tra file media song song
    const backgroundVideoPath = path.join(process.cwd(), 'public', 'bg', 'gameplay_01.mp4');
    const bgmPath = path.join(process.cwd(), 'public', 'audio', 'bgm_suspense.mp3');

    const [hasBgVideo, hasBgm] = await Promise.all([
      Promise.resolve(fs.existsSync(backgroundVideoPath)),
      Promise.resolve(fs.existsSync(bgmPath)),
    ]);

    if (!hasBgVideo) console.warn('⚠️ Thiếu public/bg/gameplay_01.mp4; dùng background visual fallback.');
    if (!hasBgm) console.warn('⚠️ Thiếu public/audio/bgm_suspense.mp3; render sẽ không có nhạc nền.');

    const randomColor = HIGHLIGHT_COLORS[Math.floor(Math.random() * HIGHLIGHT_COLORS.length)];
    const randomTilt = Number(((Math.random() * 2.4) - 1.2).toFixed(2));
    const randomBgStart = Math.floor(Math.random() * 120) + 10;
    const randomBgmVolume = Number((0.08 + Math.random() * 0.04).toFixed(3));

    const finalProps: ShortVideoProps = {
      totalDurationInSeconds: audioData.totalDurationInSeconds,
      voiceoverUrl: audioData.voiceoverUrl,
      backgroundVideoUrl: hasBgVideo ? 'bg/gameplay_01.mp4' : null,
      backgroundVideoStartFrom: randomBgStart,
      bgmUrl: hasBgm ? 'audio/bgm_suspense.mp3' : null,
      bgmVolume: randomBgmVolume,
      highlightColor: randomColor,
      captionTiltAngle: randomTilt,
      scenes: audioData.syncedScenes.map((scene, index) => {
        const sfxAvailable =
          scene.sfxUrl && fs.existsSync(path.join(process.cwd(), 'public', scene.sfxUrl));
        return {
          ...scene,
          ...(availableSceneIndices.has(index) ? {} : { mediaUrl: '', mediaType: 'generated' as const }),
          sfxUrl: sfxAvailable ? scene.sfxUrl : undefined,
        };
      }),
      words: audioData.words,
    };

    // Lưu file Props JSON
    const propsFilePath = path.join(dataDir, 'current_props.json');
    fs.writeFileSync(propsFilePath, JSON.stringify(finalProps, null, 2));

    // 4. Gọi lệnh Render 60fps của Remotion (Có áp dụng Retry và tối ưu Concurrency)
    const safeTitle = scriptData.title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
    const outputVideoPath = path.join(outDir, `${Date.now()}_${safeTitle}.mp4`);

    await measureTime('Render Video Remotion (60fps)', () => {
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
          '--crf=22', // Tăng nhẹ từ 18 lên 20 giúp render nhanh hơn đáng kể mà chất lượng không giảm nhiều bằng mắt thường
          '--concurrency=2', // Tận dụng tối đa tài nguyên CPU
          '--gl=angle', 
        ],
        { stdio: 'inherit' },
        2 // Thử lại tối đa 2 lần nếu lỗi render đột ngột
      );
    });

    // Dọn dẹp file props tạm sau khi render xong để nhẹ ổ cứng
    if (fs.existsSync(propsFilePath)) {
      fs.unlinkSync(propsFilePath);
    }

    const totalElapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
    console.log(`\n🎉 HOÀN TẤT TOÀN BỘ PIPELINE TRONG ${totalElapsed}s!`);
    console.log(`📌 Tiêu đề gợi ý: ${scriptData.title}`);
    console.log(`📂 File Video: ${outputVideoPath}`);
  } catch (error) {
    console.error('❌ Lỗi nghiêm trọng trong quá trình chạy Pipeline:', error);
    process.exit(1);
  }
}

runFullPipeline();