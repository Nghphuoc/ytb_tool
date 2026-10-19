export interface WordTiming {
  word: string;
  start: number; // tính bằng giây (ví dụ: 0.12)
  end: number;   // tính bằng giây (ví dụ: 0.45)
}

export interface SceneItem {
  id: string;
  mediaUrl: string; // Đường dẫn trong thư mục public/ (VD: "scenes/scene_1.jpg")
  mediaType: 'image' | 'video' | 'generated';
  startTime: number; // Giây bắt đầu của scene
  endTime: number;   // Giây kết thúc của scene
  cameraEffect: 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right';
  sfxUrl?: string;   // VD: "sfx/whoosh.mp3"
}

export interface ShortVideoProps {
  totalDurationInSeconds: number;
  voiceoverUrl: string | null;
  backgroundVideoUrl: string | null;
  backgroundVideoStartFrom: number; // Random giây bắt đầu để chống trùng lặp
  bgmUrl: string | null;
  bgmVolume: number;
  highlightColor: string; // VD: "#FFD700" (Vàng) hoặc "#00FF66" (Xanh lá)
  captionTiltAngle: number; // Random từ -1.5 đến 1.5 độ để chống quét
  scenes: SceneItem[];
  words: WordTiming[];
}