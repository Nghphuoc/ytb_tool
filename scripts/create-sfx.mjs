import fs from 'fs';
import path from 'path';

function createWavBuffer(samples, sampleRate = 44100) {
  const numChannels = 1;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF Chunk
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // PCM Samples
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const intSample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    buffer.writeInt16LE(Math.floor(intSample), 44 + i * 2);
  }

  return buffer;
}

function synthesizeWhoosh(durationSeconds = 0.35, sampleRate = 44100) {
  const totalSamples = Math.floor(durationSeconds * sampleRate);
  const samples = new Float32Array(totalSamples);
  let b0 = 0, b1 = 0, b2 = 0;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / totalSamples;
    const env = Math.pow(Math.sin(Math.PI * t), 2);
    const white = Math.random() * 2 - 1;
    const cutoff = 0.05 + 0.35 * Math.sin(Math.PI * t);
    b0 = b0 + cutoff * (white - b0);
    b1 = b1 + cutoff * (b0 - b1);
    b2 = b2 + cutoff * (b1 - b2);
    samples[i] = b2 * env * 0.9;
  }
  return samples;
}

function synthesizePop(durationSeconds = 0.12, sampleRate = 44100) {
  const totalSamples = Math.floor(durationSeconds * sampleRate);
  const samples = new Float32Array(totalSamples);
  let phase = 0;

  for (let i = 0; i < totalSamples; i++) {
    const progress = i / totalSamples;
    const freq = 120 + 630 * Math.exp(-progress * 20);
    const env = Math.exp(-progress * 15);
    phase += (2 * Math.PI * freq) / sampleRate;
    samples[i] = Math.sin(phase) * env * 0.85;
  }
  return samples;
}

const sfxDir = path.join(process.cwd(), 'public', 'sfx');
fs.mkdirSync(sfxDir, { recursive: true });

const whooshWav = createWavBuffer(synthesizeWhoosh());
fs.writeFileSync(path.join(sfxDir, 'whoosh.wav'), whooshWav);
fs.writeFileSync(path.join(sfxDir, 'whoosh.mp3'), whooshWav);

const popWav = createWavBuffer(synthesizePop());
fs.writeFileSync(path.join(sfxDir, 'pop.wav'), popWav);
fs.writeFileSync(path.join(sfxDir, 'pop.mp3'), popWav);

console.log('✅ Đã tạo thành công các file SFX:');
console.log('   - public/sfx/whoosh.mp3 (.wav)');
console.log('   - public/sfx/pop.mp3 (.wav)');
