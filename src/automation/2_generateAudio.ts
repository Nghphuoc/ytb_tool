import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import type { SceneItem, WordTiming } from '../types/types';
import type { RawSceneScript } from './1_fechRedditAndScriptGemini';

dotenv.config();

export interface ElevenLabsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export function parseCharacterToWordTimings(alignment?: ElevenLabsAlignment): WordTiming[] {
  if (!alignment || !alignment.characters || alignment.characters.length === 0) {
    return [];
  }

  const words: WordTiming[] = [];
  let currentWord = '';
  let wordStart = -1;
  let wordEnd = 0;

  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    const start = character_start_times_seconds[i] ?? 0;
    const end = character_end_times_seconds[i] ?? start;

    if (char.trim() === '') {
      if (currentWord.length > 0) {
        words.push({
          word: currentWord,
          start: Number(wordStart.toFixed(3)),
          end: Number(wordEnd.toFixed(3)),
        });
        currentWord = '';
        wordStart = -1;
      }
    } else {
      if (wordStart === -1) wordStart = start;
      currentWord += char;
      wordEnd = end;
    }
  }

  if (currentWord.length > 0) {
    words.push({
      word: currentWord,
      start: Number(wordStart.toFixed(3)),
      end: Number(wordEnd.toFixed(3)),
    });
  }

  return words;
}

export async function generateAudioAndSyncScenes(
  fullText: string,
  rawScenes: RawSceneScript[]
) {
  console.log('🎙️ [Step 2] Đang tạo giọng đọc ElevenLabs + Word Timestamps...');

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('❌ ELEVENLABS_API_KEY chưa được thiết lập trong file .env');
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: fullText,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ElevenLabs API Error (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as {
    audio_base64: string;
    alignment: ElevenLabsAlignment;
  };

  // Lưu file MP3 vào public/audio/voiceover.mp3
  const audioDir = path.join(process.cwd(), 'public', 'audio');
  fs.mkdirSync(audioDir, { recursive: true });
  fs.writeFileSync(
    path.join(audioDir, 'voiceover.mp3'),
    Buffer.from(data.audio_base64, 'base64')
  );

  const words = parseCharacterToWordTimings(data.alignment);
  const totalDurationInSeconds =
    words.length > 0 ? Number((words[words.length - 1].end + 0.4).toFixed(2)) : 30;

  // Tự động đồng bộ thời gian từng Scene khớp với mảng Words an toàn
  let wordCursor = 0;
  const syncedScenes: SceneItem[] = rawScenes.map((raw, index) => {
    const wordsInSentence = raw.sentence.trim().split(/\s+/).filter(Boolean);
    const wordCount = Math.max(1, wordsInSentence.length);

    let startTime = 0;
    let endTime = totalDurationInSeconds;

    if (words.length > 0) {
      const startWord = words[Math.min(wordCursor, words.length - 1)];
      const endWordIndex = Math.min(wordCursor + wordCount - 1, words.length - 1);
      const endWord = words[endWordIndex];

      startTime = index === 0 ? 0 : (startWord?.start ?? 0);
      endTime =
        index === rawScenes.length - 1
          ? totalDurationInSeconds
          : (endWord?.end ?? totalDurationInSeconds);
    } else {
      const sliceDuration = totalDurationInSeconds / rawScenes.length;
      startTime = index * sliceDuration;
      endTime = (index + 1) * sliceDuration;
    }

    // Defensive clamping to prevent negative/zero duration
    if (endTime <= startTime) {
      endTime = startTime + 0.5;
    }

    wordCursor += wordCount;

    return {
      id: `scene-${index + 1}`,
      mediaUrl: `scenes/scene_${index + 1}.mp4`,
      mediaType: 'video',
      startTime: Number(startTime.toFixed(3)),
      endTime: Number(endTime.toFixed(3)),
      cameraEffect: raw.cameraEffect,
      sfxUrl: raw.sfxUrl,
    };
  });

  console.log(
    `✅ Đã tạo xong Audio (${totalDurationInSeconds.toFixed(1)}s) và đồng bộ ${syncedScenes.length} scenes.`
  );

  return {
    voiceoverUrl: 'audio/voiceover.mp3',
    words,
    syncedScenes,
    totalDurationInSeconds,
  };
}

// =============================================================================
// CAPTION-ONLY MODE (voiceover = off)
// Sinh word-timings từ độ dài câu — không gọi ElevenLabs
// =============================================================================

/**
 * Tạo timings giả từ số từ trong mỗi câu (≈ 150 từ/phút).
 * Dùng khi voiceover = 'off': video chỉ có BGM + caption tự chạy.
 */
export async function generateCaptionOnlyTimings(rawScenes: RawSceneScript[]) {
  console.log('📝 [Step 2] Voiceover OFF — Tạo caption timings từ độ dài câu (150 WPM)...');

  const WORDS_PER_SECOND = 150 / 60; // ≈ 2.5 từ/giây
  const MIN_SCENE_DURATION = 3.5;    // Tối thiểu mỗi cảnh (giây)

  const words: { word: string; start: number; end: number }[] = [];
  const syncedScenes: import('../types/types').SceneItem[] = [];

  let cursor = 0;

  rawScenes.forEach((raw, index) => {
    const wordsInSentence = raw.sentence.trim().split(/\s+/).filter(Boolean);
    const wordCount = Math.max(1, wordsInSentence.length);
    const sceneDuration = Math.max(MIN_SCENE_DURATION, wordCount / WORDS_PER_SECOND);
    const secPerWord = sceneDuration / wordCount;

    const startTime = cursor;
    const endTime = cursor + sceneDuration;

    // Gán thời gian cho từng từ
    wordsInSentence.forEach((word, wi) => {
      const wStart = startTime + wi * secPerWord;
      words.push({
        word,
        start: Number(wStart.toFixed(3)),
        end: Number((wStart + secPerWord * 0.85).toFixed(3)), // 85% để tránh chồng
      });
    });

    syncedScenes.push({
      id: `scene-${index + 1}`,
      mediaUrl: `scenes/scene_${index + 1}.mp4`,
      mediaType: 'video',
      startTime: Number(startTime.toFixed(3)),
      endTime: Number(endTime.toFixed(3)),
      cameraEffect: raw.cameraEffect,
      sfxUrl: raw.sfxUrl || undefined,
    });

    cursor = endTime;
  });

  const totalDurationInSeconds = Number(cursor.toFixed(2));
  console.log(
    `✅ Caption timings: ${totalDurationInSeconds.toFixed(1)}s tổng — ${syncedScenes.length} scenes (không có voiceover).`
  );

  return {
    voiceoverUrl: null as null,
    words,
    syncedScenes,
    totalDurationInSeconds,
  };
}