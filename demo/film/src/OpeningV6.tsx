import {AbsoluteFill, Sequence, useVideoConfig} from 'remotion';
import {Scene1Tree} from './scenes/Scene1Tree';
import type {Scene1Data} from './scenes/Scene1Tree';
import {SCENE1} from './scenes/scene1-cues.js';
import {Scene2Folder} from './scenes/Scene2Folder';
import type {Scene2Data} from './scenes/Scene2Folder';
import {SCENE2} from './scenes/scene2-cues.js';

/** The v6 opening so far (demo/OPENING-V6.md): hook 1 "One tree" (0:00–0:15), a straight cut, hook 2 "The folder bursts" (0:15–0:24). */
export type OpeningV6Props = {scene1?: Scene1Data; scene2?: Scene2Data};
export const OPENING_V6 = {duration: SCENE1.duration + SCENE2.duration, fps: SCENE1.fps};

export const OpeningV6: React.FC<OpeningV6Props> = ({scene1, scene2}) => {
  const {fps} = useVideoConfig();
  const cut = Math.round(SCENE1.duration * fps);
  return (
    <AbsoluteFill style={{background: '#0b0c0f'}}>
      <Sequence from={0} durationInFrames={cut} name="1 One tree">
        <Scene1Tree data={scene1} />
      </Sequence>
      <Sequence from={cut} durationInFrames={Math.round(SCENE2.duration * fps)} name="2 The folder bursts">
        <Scene2Folder data={scene2} />
      </Sequence>
    </AbsoluteFill>
  );
};
