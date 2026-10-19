import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export interface PromptInfo {
  game: string;
  detail: string;
  tone: string;
  raw: string;
}

/**
 * Phân tích chuỗi prompt theo format chuẩn:
 * [Tên Game] | [Chi tiết / Bí mật chính] | [Phong cách video]
 */
export function parsePromptString(text: string): PromptInfo {
  const cleanText = text.trim();
  const parts = cleanText.split('|').map((p) => p.trim().replace(/^\[|\]$/g, ''));

  const game = parts[0] || 'Gaming Detail';
  const detail = parts[1] || '';
  const tone = parts[2] || 'Hồi hộp, kịch tính và cuốn hút';

  return {
    game,
    detail,
    tone,
    raw: cleanText,
  };
}

/**
 * Đọc prompt từ file prompt.txt (bỏ qua các dòng comment bắt đầu bằng # hoặc //)
 */
export function readPromptFromFile(
  filePath = path.join(process.cwd(), 'prompt.txt')
): PromptInfo | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const validLines = fileContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('//'));

  if (validLines.length === 0) {
    return null;
  }

  // Lấy dòng prompt cuối cùng hợp lệ
  const targetLine = validLines[validLines.length - 1];
  return parsePromptString(targetLine);
}

/**
 * Lấy prompt từ CLI args, Interactive Terminal hoặc file prompt.txt
 */
export async function resolvePrompt(): Promise<PromptInfo | null> {
  const args = process.argv.slice(2);

  // 1. Kiểm tra cờ --prompt hoặc --topic
  const flagIdx = args.findIndex(
    (a) => a === '--prompt' || a === '-p' || a === '--topic' || a === '-t'
  );
  if (flagIdx !== -1 && args[flagIdx + 1]) {
    const parsed = parsePromptString(args[flagIdx + 1]);
    console.log(`🎯 Nhận prompt từ tham số CLI: "${parsed.raw}"`);
    return parsed;
  }

  // 2. Kiểm tra --prompt="xyz" hoặc --topic="xyz"
  const eqArg = args.find((a) => a.startsWith('--prompt=') || a.startsWith('--topic='));
  if (eqArg) {
    const rawVal = eqArg.split('=').slice(1).join('=');
    const parsed = parsePromptString(rawVal);
    console.log(`🎯 Nhận prompt từ tham số CLI: "${parsed.raw}"`);
    return parsed;
  }

  // 3. Nếu truyền trực tiếp chuỗi không cờ (ví dụ: npm run auto -- "GTA 5 | ...")
  const freeArg = args.find((a) => !a.startsWith('-'));
  if (freeArg) {
    const parsed = parsePromptString(freeArg);
    console.log(`🎯 Nhận prompt từ tham số dòng lệnh: "${parsed.raw}"`);
    return parsed;
  }

  // 4. Nếu đang chạy trong terminal tương tác (Interactive TTY)
  if (input.isTTY) {
    const filePrompt = readPromptFromFile();
    const defaultHint = filePrompt ? `"${filePrompt.raw}" (từ prompt.txt)` : 'Cào tự động từ Reddit';

    console.log('\n┌─────────────────────────────────────────────────────────────────┐');
    console.log('│ 🎬 NHẬP PROMPT TẠO VIDEO SHORTS                                 │');
    console.log('│ Cú pháp chuẩn: [Tên Game] | [Chi tiết / Bí mật] | [Phong cách]  │');
    console.log('│ 👉 Bấm [Enter] để dùng mặc định: ' + defaultHint.slice(0, 30) + '...│');
    console.log('└─────────────────────────────────────────────────────────────────┘');

    const rl = readline.createInterface({ input, output });
    try {
      const answer = await rl.question('👉 Nhập prompt: ');
      rl.close();

      if (answer && answer.trim().length > 0) {
        const parsed = parsePromptString(answer.trim());
        console.log(`✅ Đã nhận prompt trực tiếp: "${parsed.raw}"`);
        return parsed;
      }
    } catch {
      rl.close();
    }

    if (filePrompt) {
      console.log(`📄 Sử dụng prompt từ file prompt.txt: "${filePrompt.raw}"`);
      return filePrompt;
    }
  } else {
    // Không phải TTY (chạy background / CI)
    const filePrompt = readPromptFromFile();
    if (filePrompt) {
      console.log(`📄 Tự động nạp prompt từ prompt.txt: "${filePrompt.raw}"`);
      return filePrompt;
    }
  }

  // 5. Kiểm tra biến môi trường CUSTOM_TOPIC
  if (process.env.CUSTOM_TOPIC && process.env.CUSTOM_TOPIC.trim().length > 0) {
    const parsed = parsePromptString(process.env.CUSTOM_TOPIC.trim());
    console.log(`🌐 Sử dụng prompt từ .env (CUSTOM_TOPIC): "${parsed.raw}"`);
    return parsed;
  }

  return null;
}
