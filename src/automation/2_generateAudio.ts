import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { SceneItem, WordTiming } from '../types/types';
import { RawSceneScript } from './1_fetchRedditAndScript';

dotenv.config();

interface ElevenLabsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

function parseCharacterToWordTimings(alignment: ElevenLabsAlignment): WordTiming[] {
  const words: WordTiming[] = [];
  let currentWord = '';
  let wordStart = -1;
  let wordEnd = 0;

  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    const start = character_start_times_seconds[i];
    const end = character_end_times_seconds[i];

    if (char.trim() === '') {
      if (currentWord.length > 0) {
        words.push({ word: currentWord, start: wordStart, end: wordEnd });
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
    words.push({ word: currentWord, start: wordStart, end: wordEnd });
  }
  return words;
}

export async function generateAudioAndSyncScenes(
  fullText: string,
  rawScenes: RawSceneScript[]
) {
  console.log('🎙️ [Step 2] Đang tạo giọng đọc ElevenLabs + Word Timestamps...');

  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
  const apiKey = process.env.ELEVENLABS_API_KEY;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey!,
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
    throw new Error(`ElevenLabs Error: ${await response.text()}`);
  }

  const data = await response.json();

  // Lưu file MP3 vào public/audio/voiceover.mp3
  const audioDir = path.join(process.cwd(), 'public', 'audio');
  fs.mkdirSync(audioDir, { recursive: true });
  fs.writeFileSync(
    path.join(audioDir, 'voiceover.mp3'),
    Buffer.from(data.audio_base64, 'base64')
  );

  const words = parseCharacterToWordTimings(data.alignment);
  const totalDurationInSeconds = words.length > 0 ? words[words.length - 1].end + 0.4 : 30;

  // Tự động đồng bộ thời gian từng Scene khớp với mảng Words
  let wordCursor = 0;
  const syncedScenes: SceneItem[] = rawScenes.map((raw, index) => {
    const wordCount = raw.sentence.trim().split(/\s+/).length;
    const startWord = words[Math.min(wordCursor, words.length - 1)];
    const endWordIndex = Math.min(wordCursor + wordCount - 1, words.length - 1);
    const endWord = words[endWordIndex];

    const startTime = index === 0 ? 0 : startWord.start;
    const endTime =
      index === rawScenes.length - 1 ? totalDurationInSeconds : endWord.end;

    wordCursor += wordCount;

    return {
      id: `scene-${index + 1}`,
      mediaUrl: `scenes/scene_${index + 1}.mp4`,
      mediaType: 'video',
      startTime,
      endTime,
      cameraEffect: raw.cameraEffect,
      sfxUrl: raw.sfxUrl,
    };
  });

  console.log(`✅ Đã tạo xong Audio (${totalDurationInSeconds.toFixed(1)}s) và đồng bộ ${syncedScenes.length} scenes.`);

  return {
    voiceoverUrl: 'audio/voiceover.mp3',
    words,
    syncedScenes,
    totalDurationInSeconds,
  };
}