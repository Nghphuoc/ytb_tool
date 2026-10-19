import fs from 'fs';
import path from 'path';
import { WordTiming } from '../src/types/types';
import { Buffer } from 'buffer';
import process from 'process';

interface ElevenLabsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

// Hàm chuyển đổi Character Timestamps của ElevenLabs sang Word Timestamps
export function parseElevenLabsTimestamps(alignment: ElevenLabsAlignment): WordTiming[] {
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

// Hàm gọi API ElevenLabs (Model Turbo v2.5)
export async function generateVoiceWithTimestamps(text: string, voiceId = 'pNInz6obpgDQGcFmaJgB') {
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
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs API Error: ${response.statusText}`);
  }

  const data = await response.json();

  // 1. Lưu file MP3 từ chuỗi base64 vào thư mục public/audio/
  const audioBuffer = Buffer.from(data.audio_base64, 'base64');
  const audioPath = path.join(process.cwd(), 'public', 'audio', 'voiceover.mp3');
  fs.mkdirSync(path.dirname(audioPath), { recursive: true });
  fs.writeFileSync(audioPath, audioBuffer);

  // 2. Chuyển đổi sang mảng WordTiming
  const words = parseElevenLabsTimestamps(data.alignment);
  const totalDuration = words.length > 0 ? words[words.length - 1].end + 0.5 : 30;

  return {
    voiceoverUrl: 'audio/voiceover.mp3',
    words,
    totalDurationInSeconds: totalDuration,
  };
}