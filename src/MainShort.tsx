import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { SceneItem, ShortVideoProps, WordTiming } from './types/types';

// =============================================================================
// STYLES & LAYOUT (FULL-SCREEN 9:16 ACTION MONTAGE)
// =============================================================================

const STYLES = {
  container: {
    backgroundColor: '#000000',
    overflow: 'hidden',
  } as React.CSSProperties,

  fullScreenMedia: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  } as React.CSSProperties,

  actionVideo: (scale: number, translateX: number, translateY: number): React.CSSProperties => ({
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
    willChange: 'transform',
  }),

  vignetteOverlay: {
    background:
      'radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.65) 100%)',
    pointerEvents: 'none',
    zIndex: 20,
  } as React.CSSProperties,

  progressBar: (widthPercent: number, color: string): React.CSSProperties => ({
    position: 'absolute',
    top: 0,
    left: 0,
    height: '10px',
    width: `${widthPercent}%`,
    backgroundColor: color,
    zIndex: 60,
  }),
};

// =============================================================================
// SUB-COMPONENT 1: FULL-SCREEN ACTION SCENE (Punch-in + Ken Burns)
// =============================================================================

interface DynamicActionSceneProps {
  scene: SceneItem;
  durationInFrames: number;
}

const DynamicActionScene: React.FC<DynamicActionSceneProps> = ({
  scene,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const safeDuration = Math.max(1, durationInFrames);

  // Smooth camera motion
  let baseScale = 1.08;
  let translateX = 0;
  const translateY = 0;

  switch (scene.cameraEffect) {
    case 'zoom_in':
      baseScale = interpolate(frame, [0, safeDuration], [1.05, 1.22], {
        extrapolateRight: 'clamp',
      });
      break;
    case 'zoom_out':
      baseScale = interpolate(frame, [0, safeDuration], [1.22, 1.05], {
        extrapolateRight: 'clamp',
      });
      break;
    case 'pan_left':
      baseScale = 1.15;
      translateX = interpolate(frame, [0, safeDuration], [40, -40], {
        extrapolateRight: 'clamp',
      });
      break;
    case 'pan_right':
      baseScale = 1.15;
      translateX = interpolate(frame, [0, safeDuration], [-40, 40], {
        extrapolateRight: 'clamp',
      });
      break;
  }

  // Punch-in impact spring on cut start (Giật nhẹ kiểu action movie)
  const punchSpring = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 200, mass: 0.5 },
  });
  const finalScale = baseScale * interpolate(punchSpring, [0, 1], [1.08, 1]);

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#000000' }}>
      {scene.mediaType === 'video' && scene.mediaUrl ? (
        <OffthreadVideo
          src={staticFile(scene.mediaUrl)}
          style={STYLES.actionVideo(finalScale, translateX, translateY)}
          muted
        />
      ) : scene.mediaType === 'image' && scene.mediaUrl ? (
        <Img
          src={staticFile(scene.mediaUrl)}
          style={STYLES.actionVideo(finalScale, translateX, translateY)}
        />
      ) : (
        /* Cinematic Backup Visual nếu clip đang tải lỗi */
        <FallbackCinematicVisual sceneId={scene.id} />
      )}

      {/* SFX kích hoạt đầu mỗi cảnh hành động */}
      {scene.sfxUrl && <Audio src={staticFile(scene.sfxUrl)} volume={0.4} />}
    </AbsoluteFill>
  );
};

// =============================================================================
// FALLBACK CINEMATIC VISUAL (Khi đang chờ asset)
// =============================================================================

const FallbackCinematicVisual: React.FC<{ sceneId: string }> = ({ sceneId }) => {
  const sceneNum = Number(sceneId.match(/\d+/)?.[0] ?? 1);
  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(circle at 50% 50%, #1e1b4b 0%, #030712 90%)',
        justifyContent: 'center',
        alignItems: 'center',
        color: '#ffffff',
      }}
    >
      <div style={{ textAlign: 'center', letterSpacing: 6 }}>
        <div style={{ fontSize: 24, opacity: 0.6 }}>ACTION SEQUENCE</div>
        <div style={{ fontSize: 72, fontWeight: 900, marginTop: 12 }}>
          PART {String(sceneNum).padStart(2, '0')}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// =============================================================================
// SUB-COMPONENT 2: LOWER-THIRD DYNAMIC KARAOKE SUBTITLES
// =============================================================================

interface DynamicCaptionsProps {
  words: WordTiming[];
  highlightColor: string;
  tiltAngle: number;
}

const DynamicCaptions: React.FC<DynamicCaptionsProps> = ({
  words,
  highlightColor,
  tiltAngle,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  // Gom cụm 2-3 từ để đọc nhanh theo nhịp hành động
  const wordChunks = useMemo(() => {
    if (!words || words.length === 0) return [];
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

  const activeChunk = useMemo(() => {
    return wordChunks.find(
      (chunk) => currentTime >= chunk.start - 0.05 && currentTime <= chunk.end + 0.15
    );
  }, [wordChunks, currentTime]);

  if (!activeChunk) return null;

  const chunkStartFrame = Math.floor(activeChunk.start * fps);
  const popScale = spring({
    frame: Math.max(0, frame - chunkStartFrame),
    fps,
    config: { damping: 14, stiffness: 240, mass: 0.4 },
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: '72%', // Vị trí vàng 1/3 dưới màn hình (không che hành động ở giữa)
        left: '50%',
        width: '90%',
        transform: `translate(-50%, -50%) scale(${popScale}) rotate(${tiltAngle}deg)`,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '12px',
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
              config: { damping: 10, stiffness: 280 },
            })
          : 0;

        const wordScale = interpolate(wordBump, [0, 1], [1, 1.2]);

        return (
          <span
            key={`${w.word}-${idx}`}
            style={{
              fontFamily: "'Montserrat', 'Arial Black', sans-serif",
              fontWeight: 900,
              fontSize: '60px',
              textTransform: 'uppercase',
              color: isCurrentWord ? highlightColor : '#FFFFFF',
              transform: `scale(${wordScale})`,
              display: 'inline-block',
              WebkitTextStroke: '10px #000000',
              paintOrder: 'stroke fill',
              filter: 'drop-shadow(0px 8px 16px rgba(0,0,0,0.95))',
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
};

// =============================================================================
// MAIN COMPOSITION: 100% FULL-SCREEN ACTION SHORTS ENGINE
// =============================================================================

export const MainShort: React.FC<ShortVideoProps> = ({
  voiceoverUrl,
  bgmUrl,
  bgmVolume,
  highlightColor,
  captionTiltAngle,
  scenes,
  words,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  const progressPercent = durationInFrames > 0 ? (frame / durationInFrames) * 100 : 0;

  return (
    <AbsoluteFill style={STYLES.container}>
      {/* 1. FULL-SCREEN ACTION VIDEO MONTAGE (100% diện tích màn hình) */}
      <div style={STYLES.fullScreenMedia}>
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
              <DynamicActionScene
                scene={scene}
                durationInFrames={sceneDurationFrames}
              />
            </Sequence>
          );
        })}
      </div>

      {/* 2. CINEMATIC VIGNETTE OVERLAY */}
      <AbsoluteFill style={STYLES.vignetteOverlay} hidden />

      {/* 3. LOWER-THIRD POP-UP KARAOKE SUBTITLES */}
      <DynamicCaptions
        words={words}
        highlightColor={highlightColor}
        tiltAngle={captionTiltAngle}
      />

      {/* 4. TOP RETENTION PROGRESS BAR */}
      <div style={STYLES.progressBar(progressPercent, highlightColor)} />

      {/* 5. AUDIO SYSTEM (VOICEOVER + BGM) */}
      {voiceoverUrl && <Audio src={staticFile(voiceoverUrl)} volume={1.0} />}
      {bgmUrl && <Audio src={staticFile(bgmUrl)} volume={bgmVolume} loop />}
    </AbsoluteFill>
  );
};