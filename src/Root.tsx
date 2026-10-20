import type { FC } from 'react';
import { Composition, Folder } from 'remotion';
import { MainShort } from './MainShort';
import { ShortVideoPropsSchema, type ShortVideoProps } from './types/types';

const defaultProps: ShortVideoProps = {
  totalDurationInSeconds: 10,
  voiceoverUrl: null,
  voiceoverEnabled: true,
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
    <>
      <Composition
        id="MainShort"
        component={MainShort}
        schema={ShortVideoPropsSchema}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
        calculateMetadata={({ props }) => {
          const safeDuration = Math.max(1, props.totalDurationInSeconds || 10);
          return {
            durationInFrames: Math.ceil(safeDuration * 30),
          };
        }}
      />
    </>
  );
};