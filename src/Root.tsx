import type { FC } from 'react';
import { Composition, type AnyZodObject } from 'remotion';
import { MainShort } from './MainShort';
import type { ShortVideoProps } from './types/types';

type MainCompositionProps = ShortVideoProps & Record<string, unknown>;

const defaultProps: MainCompositionProps = {
  totalDurationInSeconds: 10,
  voiceoverUrl: null,
  backgroundVideoUrl: null,
  backgroundVideoStartFrom: 15,
  bgmUrl: null,
  bgmVolume: 0.1,
  highlightColor: '#FFD700',
  captionTiltAngle: -0.8,
  scenes: [
    {
      id: 'scene-1',
      mediaUrl: '',
      mediaType: 'generated',
      startTime: 0,
      endTime: 5,
      cameraEffect: 'zoom_in',
    },
    {
      id: 'scene-2',
      mediaUrl: '',
      mediaType: 'generated',
      startTime: 5,
      endTime: 10,
      cameraEffect: 'pan_right',
    },
  ],
  words: [
    { word: 'Have', start: 0.1, end: 0.3 },
    { word: 'you', start: 0.3, end: 0.5 },
    { word: 'ever', start: 0.5, end: 0.8 },
    { word: 'noticed', start: 0.8, end: 1.2 },
    { word: 'this', start: 1.2, end: 1.5 },
    { word: 'creepy', start: 1.5, end: 1.9 },
    { word: 'detail', start: 1.9, end: 2.4 },
    { word: 'in', start: 2.4, end: 2.6 },
    { word: 'GTA 5?', start: 2.6, end: 3.2 },
  ],
};

export const RemotionRoot: FC = () => {
  return (
    <Composition<AnyZodObject, MainCompositionProps>
      id="MainShort"
      component={MainShort}
      fps={60}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => {
        return {
          durationInFrames: Math.ceil(props.totalDurationInSeconds * 60),
        };
      }}
    />
  );
};