import { z } from 'zod';

export const WordTimingSchema = z.object({
  word: z.string(),
  start: z.number().min(0), // in seconds
  end: z.number().min(0), // in seconds
});

export const CameraEffectSchema = z.enum(['zoom_in', 'zoom_out', 'pan_left', 'pan_right']);

export const SceneItemSchema = z.object({
  id: z.string(),
  mediaUrl: z.string(), // Relative to public/ directory
  mediaType: z.enum(['image', 'video', 'generated']),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  cameraEffect: CameraEffectSchema,
  sfxUrl: z.string().optional(),
});

export const ShortVideoPropsSchema = z.object({
  totalDurationInSeconds: z.number().positive(),
  voiceoverUrl: z.string().nullable(),
  /** When false, the voiceover Audio track is not rendered (caption-only mode) */
  voiceoverEnabled: z.boolean().default(true),
  backgroundVideoUrl: z.string().nullable(),
  backgroundVideoStartFrom: z.number().default(0), // Offset in seconds to prevent duplicate detection
  bgmUrl: z.string().nullable(),
  bgmVolume: z.number().min(0).max(1).default(0.1),
  highlightColor: z.string().default('#FFD700'),
  captionTiltAngle: z.number().default(0), // Subtle rotation angle (-1.5 to 1.5 deg)
  scenes: z.array(SceneItemSchema),
  words: z.array(WordTimingSchema),
});

export type WordTiming = z.infer<typeof WordTimingSchema>;
export type CameraEffect = z.infer<typeof CameraEffectSchema>;
export type SceneItem = z.infer<typeof SceneItemSchema>;
export type ShortVideoProps = z.infer<typeof ShortVideoPropsSchema>;