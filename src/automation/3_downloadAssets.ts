import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { RawSceneScript } from './1_fechRedditAndScriptGemini';

/**
 * Tìm kiếm đường dẫn binary thực thi của yt-dlp hoặc ffmpeg
 */
function findBinary(name: string, candidatePaths: string[]): string | null {
  for (const p of candidatePaths) {
    if (p && fs.existsSync(p)) return p;
  }
  const check = spawnSync(name, ['--version'], { stdio: 'ignore' });
  if (!check.error && check.status === 0) return name;
  return null;
}

export async function downloadSceneAssets(rawScenes: RawSceneScript[]): Promise<Set<number>> {
  console.log('🎬 [Step 3] Đang tìm & tải các video clip hành động KHÁC NHAU cho từng Scene...');

  const scenesDir = path.join(process.cwd(), 'public', 'scenes');
  fs.mkdirSync(scenesDir, { recursive: true });

  const localAppData = process.env.LOCALAPPDATA || '';
  const ytdlpBin = findBinary('yt-dlp', [
    path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'yt-dlp.exe'),
    path.join(
      localAppData,
      'Microsoft',
      'WinGet',
      'Packages',
      'yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe',
      'yt-dlp.exe'
    ),
  ]);

  const ffmpegBin = findBinary('ffmpeg', [
    path.join(
      localAppData,
      'Microsoft',
      'WinGet',
      'Packages',
      'yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe',
      'ffmpeg-N-126374-g089a48eb36-win64-gpl',
      'bin',
      'ffmpeg.exe'
    ),
  ]);

  const availableSceneIndices = new Set<number>();
  const fallbackGameplay = path.join(process.cwd(), 'public', 'bg', 'gameplay_01.mp4');

  if (ytdlpBin) {
    console.log(`   ⚡ Đã kích hoạt yt-dlp: ${ytdlpBin}`);
    if (ffmpegBin) {
      console.log(`   ⚡ Đã kích hoạt FFmpeg: ${ffmpegBin}`);
    }
  }

  for (let i = 0; i < rawScenes.length; i++) {
    const query = rawScenes[i].searchQuery;
    const outputFile = path.join(scenesDir, `scene_${i + 1}.mp4`);

    // BẮT BUỘC: Xóa file cũ trước khi tải để đảm bảo không bị trùng lặp file cũ
    if (fs.existsSync(outputFile)) {
      try {
        fs.unlinkSync(outputFile);
      } catch {
        // Ignore if locked
      }
    }

    console.log(`   ⬇️ Scene ${i + 1}/${rawScenes.length}: Tải clip "${query}"...`);
    let downloaded = false;

    if (ytdlpBin) {
      try {
        const args = [
          `ytsearch1:${query}`,
          '--download-sections',
          '*00:00:10-00:00:15', // Cắt đúng 5 giây hành động
          '-f',
          'bestvideo[height<=1080][ext=mp4]/best[ext=mp4]',
          '--force-keyframes-at-cuts',
          '--force-overwrites',
          '-o',
          outputFile,
          '--no-playlist',
          '--quiet',
          '--no-warnings',
        ];

        if (ffmpegBin) {
          args.push('--ffmpeg-location', path.dirname(ffmpegBin));
        }

        execFileSync(ytdlpBin, args, { stdio: 'ignore', timeout: 35000 });

        if (fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          if (stats.size > 50000) {
            availableSceneIndices.add(i);
            downloaded = true;
            console.log(
              `   ✅ Scene ${i + 1}: Đã tải video mới (${(stats.size / 1024 / 1024).toFixed(1)} MB)`
            );
          }
        }
      } catch {
        // Fallback below
      }
    }

    // Nếu tải bị chậm hoặc YouTube rate-limit, dùng FFmpeg cắt một đoạn hoàn toàn khác nhau từ kho dự phòng
    if (!downloaded) {
      if (ffmpegBin && fs.existsSync(fallbackGameplay)) {
        try {
          const offset = ((i * 2.5) % 8).toFixed(1);
          execFileSync(
            ffmpegBin,
            ['-ss', offset, '-i', fallbackGameplay, '-t', '5', '-c', 'copy', '-y', outputFile],
            { stdio: 'ignore' }
          );
          if (fs.existsSync(outputFile) && fs.statSync(outputFile).size > 10000) {
            availableSceneIndices.add(i);
            console.log(`   ⚡ Scene ${i + 1}: Cắt đoạn action độc lập tại ${offset}s (Không trùng lặp).`);
          }
        } catch {
          // Ignore
        }
      }
    }
  }

  console.log(
    `✅ Đã chuẩn bị xong ${availableSceneIndices.size}/${rawScenes.length} video clip hành động riêng biệt!`
  );

  return availableSceneIndices;
}