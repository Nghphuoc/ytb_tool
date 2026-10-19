import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import { parseCharacterToWordTimings, type ElevenLabsAlignment } from '../src/automation/2_generateAudio';

dotenv.config();

/**
 * Utility script để test tạo giọng đọc ElevenLabs độc lập
 * Chạy thử: npx tsx scripts/generate-audio.ts "Test sentence"
 */
export async function generateVoiceWithTimestamps(
  text: string,
  voiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'
) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('❌ ELEVENLABS_API_KEY chưa được thiết lập trong .env');
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
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

  const data = (await response.json()) as {
    audio_base64: string;
    alignment: ElevenLabsAlignment;
  };

  const audioBuffer = Buffer.from(data.audio_base64, 'base64');
  const audioPath = path.join(process.cwd(), 'public', 'audio', 'voiceover.mp3');
  fs.mkdirSync(path.dirname(audioPath), { recursive: true });
  fs.writeFileSync(audioPath, audioBuffer);

  const words = parseCharacterToWordTimings(data.alignment);
  const totalDuration = words.length > 0 ? words[words.length - 1].end + 0.5 : 30;

  return {
    voiceoverUrl: 'audio/voiceover.mp3',
    words,
    totalDurationInSeconds: totalDuration,
  };
}

if (process.argv[2]) {
  generateVoiceWithTimestamps(process.argv[2])
    .then((res) => console.log('✅ Hoàn tất:', res))
    .catch(console.error);
}