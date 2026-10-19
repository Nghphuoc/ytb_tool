import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { RawSceneScript } from './1_fetchRedditAndScript';

export async function downloadSceneAssets(rawScenes: RawSceneScript[]): Promise<Set<number>> {
  console.log('🎬 [Step 3] Đang tự động tải video minh họa cho từng Scene bằng yt-dlp...');

  const scenesDir = path.join(process.cwd(), 'public', 'scenes');
  fs.mkdirSync(scenesDir, { recursive: true });
  const availableSceneIndices = new Set<number>();
  const downloaderCheck = spawnSync('yt-dlp', ['--version'], { stdio: 'ignore' });
  const downloaderAvailable = !downloaderCheck.error && downloaderCheck.status === 0;

  if (!downloaderAvailable) {
    console.warn(
      '⚠️ Không tìm thấy yt-dlp. Cài đặt bằng "winget install yt-dlp.yt-dlp"; sẽ dùng media dự phòng nếu có.'
    );
  }

  for (let i = 0; i < rawScenes.length; i++) {
    const query = rawScenes[i].searchQuery;
    const outputFile = path.join(scenesDir, `scene_${i + 1}.mp4`);

    // Xóa file cũ nếu có
    if (fs.existsSync(outputFile)) {
      fs.unlinkSync(outputFile);
    }

    console.log(`   ⬇️ Scene ${i + 1}: Đang tìm "${query}"...`);

    if (downloaderAvailable) {
      try {
        execFileSync(
          'yt-dlp',
          [
            `ytsearch1:${query}`,
            '--download-sections',
            '*00:00:15-00:00:22',
            '-f',
            'bestvideo[height<=1080][ext=mp4]/best[ext=mp4]',
            '--force-keyframes-at-cuts',
            '-o',
            outputFile,
            '--quiet',
            '--no-warnings',
          ],
          { stdio: 'inherit' }
        );
        if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size === 0) {
          throw new Error('yt-dlp did not create a usable video file');
        }
        availableSceneIndices.add(i);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`   ⚠️ Không tải được clip cho Scene ${i + 1} (${message}).`);
      }
    }

    if (!availableSceneIndices.has(i)) {
      console.warn(`   ⚠️ Scene ${i + 1} dùng fallback nếu có.`);
      const fallbackPath = path.join(process.cwd(), 'public', 'bg', 'gameplay_01.mp4');
      if (fs.existsSync(fallbackPath)) {
        fs.copyFileSync(fallbackPath, outputFile);
        availableSceneIndices.add(i);
      }
    }
  }

  console.log(
    `✅ Đã chuẩn bị media cho ${availableSceneIndices.size}/${rawScenes.length} scenes. Các scene còn lại sẽ dùng visual fallback.`
  );
  return availableSceneIndices;
}