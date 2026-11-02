import {Composition, staticFile} from 'remotion';
import {Film} from './Film';
import {Scene1Tree} from './scenes/Scene1Tree';
import type {Scene1Data, Scene1Props} from './scenes/Scene1Tree';
import {SCENE1} from './scenes/scene1-cues.js';
import {Scene2Folder} from './scenes/Scene2Folder';
import type {Scene2Data, Scene2Props} from './scenes/Scene2Folder';
import {SCENE2} from './scenes/scene2-cues.js';
import {Scene4Tower} from './scenes/Scene4Tower';
import type {Scene4Data, Scene4Props} from './scenes/Scene4Tower';
import {SCENE4} from './scenes/scene4-cues.js';
import {OPENING_V6, OpeningV6} from './OpeningV6';
import type {OpeningV6Props} from './OpeningV6';
import type {FilmData, FilmProps} from './data';
import beats from '../beats.json';

export const Root: React.FC = () => (
  <>
  <Composition
    id="Film"
    component={Film}
    durationInFrames={Math.round(beats.duration * beats.fps)}
    fps={beats.fps}
    width={beats.width}
    height={beats.height}
    defaultProps={{narrator: 'brian', repoUrl: 'https://github.com/eric2612115/landsight', showSourceTag: true} satisfies FilmProps}
    calculateMetadata={async ({props}) => {
      const data = (await fetch(staticFile('data/film.json')).then((r) => r.json())) as FilmData;
      return {props: {...props, data}};
    }}
  />
  {/* Scene 1 prototype, "One tree": node scene1-prepare.mjs first (public/data/scene1.json, the narration, the effects) */}
  <Composition
    id="Scene1Tree"
    component={Scene1Tree}
    durationInFrames={Math.round(SCENE1.duration * SCENE1.fps)}
    fps={SCENE1.fps}
    width={beats.width}
    height={beats.height}
    defaultProps={{} satisfies Scene1Props}
    calculateMetadata={async ({props}) => {
      const data = (await fetch(staticFile('data/scene1.json')).then((r) => r.json())) as Scene1Data;
      return {props: {...props, data}};
    }}
  />
  {/* Scene 2 prototype, "The folder bursts": node scene2-prepare.mjs first (public/data/scene2.json, the effects) */}
  <Composition
    id="Scene2Folder"
    component={Scene2Folder}
    durationInFrames={Math.round(SCENE2.duration * SCENE2.fps)}
    fps={SCENE2.fps}
    width={beats.width}
    height={beats.height}
    defaultProps={{} satisfies Scene2Props}
    calculateMetadata={async ({props}) => {
      const data = (await fetch(staticFile('data/scene2.json')).then((r) => r.json())) as Scene2Data;
      return {props: {...props, data}};
    }}
  />
  {/* Scene 4 prototype, "Six sheets, one building": node scene4-prepare.mjs first (public/tower/*.png, public/data/scene4.json, the effects) */}
  <Composition
    id="Scene4Tower"
    component={Scene4Tower}
    durationInFrames={Math.round(SCENE4.duration * SCENE4.fps)}
    fps={SCENE4.fps}
    width={beats.width}
    height={beats.height}
    defaultProps={{} satisfies Scene4Props}
    calculateMetadata={async ({props}) => {
      const data = (await fetch(staticFile('data/scene4.json')).then((r) => r.json())) as Scene4Data;
      return {props: {...props, data}};
    }}
  />
  {/* The v6 opening so far: scene 1 then scene 2, a straight cut at 15 s (both prepare scripts first) */}
  <Composition
    id="OpeningV6"
    component={OpeningV6}
    durationInFrames={Math.round(OPENING_V6.duration * OPENING_V6.fps)}
    fps={OPENING_V6.fps}
    width={beats.width}
    height={beats.height}
    defaultProps={{} satisfies OpeningV6Props}
    calculateMetadata={async ({props}) => {
      const [scene1, scene2] = await Promise.all([
        fetch(staticFile('data/scene1.json')).then((r) => r.json()) as Promise<Scene1Data>,
        fetch(staticFile('data/scene2.json')).then((r) => r.json()) as Promise<Scene2Data>,
      ]);
      return {props: {...props, scene1, scene2}};
    }}
  />
  </>
);
