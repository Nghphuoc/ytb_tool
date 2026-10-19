import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  Video,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { SceneItem, ShortVideoProps, WordTiming } from './types/types';

// --- SUB-COMPONENT 1: HIỆU ỨNG CAMERA CHUYỂN ĐỘNG MƯỢT 60FPS CHO TỪNG SCENE ---
const DynamicSceneMedia: React.FC<{ scene: SceneItem; durationInFrames: number }> = ({
  scene,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Hiệu ứng fade-in nhẹ trong 5 frame đầu mỗi cảnh
  const opacity = interpolate(frame, [0, 5], [0.4, 1], { extrapolateRight: 'clamp' });

  // Tính toán độ phóng to / dịch chuyển mượt theo từng frame (Ken Burns Effect)
  let scale = 1.05;
  let translateX = 0;

  if (scene.cameraEffect === 'zoom_in') {
    scale = interpolate(frame, [0, durationInFrames], [1.0, 1.18], {
      extrapolateRight: 'clamp',
    });
  } else if (scene.cameraEffect === 'zoom_out') {
    scale = interpolate(frame, [0, durationInFrames], [1.18, 1.0], {
      extrapolateRight: 'clamp',
    });
  } else if (scene.cameraEffect === 'pan_left') {
    scale = 1.15;
    translateX = interpolate(frame, [0, durationInFrames], [30, -30], {
      extrapolateRight: 'clamp',
    });
  } else if (scene.cameraEffect === 'pan_right') {
    scale = 1.15;
    translateX = interpolate(frame, [0, durationInFrames], [-30, 30], {
      extrapolateRight: 'clamp',
    });
  }

  // Hiệu ứng nảy nhẹ (Punch-in) ngay giây đầu chuyển cảnh
  const punchSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 160, mass: 0.6 },
  });
  const finalScale = scale * interpolate(punchSpring, [0, 1], [1.06, 1]);

  const mediaStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity,
    transform: `scale(${finalScale}) translateX(${translateX}px)`,
    willChange: 'transform, opacity',
  };

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#000' }}>
      {scene.mediaType === 'generated' ? (
        <GeneratedSceneVisual sceneId={scene.id} />
      ) : scene.mediaType === 'video' ? (
        <OffthreadVideo src={staticFile(scene.mediaUrl)} style={mediaStyle} muted />
      ) : (
        <Img src={staticFile(scene.mediaUrl)} style={mediaStyle} />
      )}
      {/* Tự động nổ Sound Effect (Whoosh/Pop) ở đầu mỗi scene nếu có */}
      {scene.sfxUrl && <Audio src={staticFile(scene.sfxUrl)} volume={0.35} />}
    </AbsoluteFill>
  );
};

const GeneratedSceneVisual: React.FC<{ sceneId: string }> = ({ sceneId }) => {
  const sceneNumber = Number(sceneId.match(/\d+/)?.[0] ?? 1);
  const palettes = [
    ['#172554', '#0f172a'],
    ['#3f1d2e', '#111827'],
    ['#164e63', '#0f172a'],
    ['#312e81', '#111827'],
  ];
  const [start, end] = palettes[(sceneNumber - 1) % palettes.length];

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        background: `radial-gradient(ellipse at 50% 45%, ${start} 0%, ${end} 75%)`,
        color: '#fff',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: '9%',
          border: '2px solid rgba(255,255,255,0.18)',
          background:
            'repeating-linear-gradient(135deg, transparent 0 42px, rgba(255,255,255,0.025) 43px 45px)',
        }}
      />
      <div style={{ zIndex: 1, textAlign: 'center', letterSpacing: 8 }}>
        <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 22 }}>
          VISUAL FALLBACK
        </div>
        <div style={{ marginTop: 12, fontSize: 64, fontWeight: 800 }}>
          SCENE {String(sceneNumber).padStart(2, '0')}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// --- SUB-COMPONENT 2: PHỤ ĐỀ NHẢY TỪNG CHỮ (KARAOKE SPRING POP-UP) ---
const DynamicCaptions: React.FC<{
  words: WordTiming[];
  highlightColor: string;
  tiltAngle: number;
}> = ({ words, highlightColor, tiltAngle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  // Gom mảng từ thành từng cụm 3 từ (Chunk of 3 words) để dễ đọc trên Shorts
  const wordChunks = useMemo(() => {
    const chunks: { words: WordTiming[]; start: number; end: number }[] = [];
    const CHUNK_SIZE = 3;
    for (let i = 0; i < words.length; i += CHUNK_SIZE) {
      const slice = words.slice(i, i + CHUNK_SIZE);
      chunks.push({
        words: slice,
        start: slice[0].start,
        end: slice[slice.length - 1].end,
      });
    }
    return chunks;
  }, [words]);

  // Tìm cụm từ đang phát ở thời điểm hiện tại
  const activeChunk = wordChunks.find(
    (c) => currentTime >= c.start - 0.05 && currentTime <= c.end + 0.15
  );

  if (!activeChunk) return null;

  // Hiệu ứng pop-in cho cả cụm chữ khi mới xuất hiện
  const chunkStartFrame = Math.floor(activeChunk.start * fps);
  const popScale = spring({
    frame: Math.max(0, frame - chunkStartFrame),
    fps,
    config: { damping: 12, stiffness: 220, mass: 0.5 },
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: '48%',
        left: '50%',
        width: '92%',
        transform: `translate(-50%, -50%) scale(${popScale}) rotate(${tiltAngle}deg)`,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '14px',
        zIndex: 50,
        pointerEvents: 'none',
      }}
    >
      {activeChunk.words.map((w, idx) => {
        const isCurrentWord = currentTime >= w.start && currentTime <= w.end + 0.05;
        const wordStartFrame = Math.floor(w.start * fps);
        const wordBump = isCurrentWord
          ? spring({
              frame: Math.max(0, frame - wordStartFrame),
              fps,
              config: { damping: 10, stiffness: 260 },
            })
          : 0;

        const wordScale = interpolate(wordBump, [0, 1], [1, 1.18]);

        return (
          <span
            key={`${w.word}-${idx}`}
            style={{
              fontFamily: "'Montserrat', 'Arial Black', sans-serif",
              fontWeight: 900,
              fontSize: '64px',
              textTransform: 'uppercase',
              color: isCurrentWord ? highlightColor : '#FFFFFF',
              transform: `scale(${wordScale})`,
              display: 'inline-block',
              // Viền đen dày + Đổ bóng sâu giúp chữ nổi bật trên mọi nền video
              WebkitTextStroke: '10px #000000',
              paintOrder: 'stroke fill',
              filter: 'drop-shadow(0px 8px 12px rgba(0,0,0,0.85))',
              transition: 'color 0.05s ease',
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
};

// --- MAIN COMPONENT: TỔNG HỢP TOÀN BỘ VIDEO SHORTS ---
export const MainShort: React.FC<ShortVideoProps> = ({
  voiceoverUrl,
  backgroundVideoUrl,
  backgroundVideoStartFrom,
  bgmUrl,
  bgmVolume,
  highlightColor,
  captionTiltAngle,
  scenes,
  words,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  // Thanh Progress Bar mỏng chạy trên đỉnh màn hình kích thích giữ chân người xem
  const progressPercent = (frame / durationInFrames) * 100;

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a', overflow: 'hidden' }}>
      {/* 1. NỬA TRÊN (55% chiều cao): Hiển thị các Scene minh họa theo kịch bản */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '55%',
          overflow: 'hidden',
          borderBottom: '6px solid #111',
        }}
      >
        {scenes.map((scene) => {
          const startFrame = Math.floor(scene.startTime * fps);
          const sceneDurationFrames = Math.max(
            1,
            Math.floor((scene.endTime - scene.startTime) * fps)
          );

          return (
            <Sequence
              key={scene.id}
              from={startFrame}
              durationInFrames={sceneDurationFrames}
            >
              <DynamicSceneMedia
                scene={scene}
                durationInFrames={sceneDurationFrames}
              />
            </Sequence>
          );
        })}
      </div>

      {/* 2. NỬA DƯỚI (45% chiều cao): Video Gameplay 4K60fps chạy liên tục */}
      <div
  style={{
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '100%',
    height: '45%',
    overflow: 'hidden',
  }}
>
  <Video
    src={staticFile(backgroundVideoUrl || "bg/gameplay_01.mp4")}
    muted
    style={{
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transform: 'scale(1.04)',
    }}
  />
</div>

      {/* 3. LỚP PHỦ CHỐNG QUÉT BẢN QUYỀN (Vignette + Color Contrast nhẹ) */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle, rgba(0,0,0,0) 60%, rgba(0,0,0,0.55) 100%)',
          pointerEvents: 'none',
          zIndex: 20,
        }}
      />

      {/* 4. LỚP PHỤ ĐỀ NHẢY TỪNG TỪ NGAY TÂM MÀN HÌNH (Giữa ranh giới trên/dưới) */}
      <DynamicCaptions
        words={words}
        highlightColor={highlightColor}
        tiltAngle={captionTiltAngle}
      />

      {/* 5. THANH TIẾN TRÌNH (PROGRESS BAR) TRÊN CÙNG */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: '8px',
          width: `${progressPercent}%`,
          backgroundColor: highlightColor,
          zIndex: 60,
        }}
      />

      {/* 6. HỆ THỐNG ÂM THANH (Giọng đọc chính + Nhạc nền) */}
      {voiceoverUrl && <Audio src={staticFile(voiceoverUrl)} volume={1.0} />}
      {bgmUrl && <Audio src={staticFile(bgmUrl)} volume={bgmVolume} loop />}
    </AbsoluteFill>
  );
};