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
import {StoryV7} from './scenes/StoryV7';
import type {StoryV7Data, StoryV7Props} from './scenes/StoryV7';
import {V7} from './scenes/story-v7-cues.js';
import {AnimaticV7} from './scenes/AnimaticV7';
import type {AnimaticData, AnimaticV7Props} from './scenes/AnimaticV7';
import {ANIM} from './scenes/animatic-v7-cues.js';
import {AnimaticV8} from './scenes/AnimaticV8';
import type {AnimaticV8Data, AnimaticV8Props} from './scenes/AnimaticV8';
import {V8} from './scenes/animatic-v8-cues.js';
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
  {/* Film v7, Part 1 (demo/SCRIPT-V7.md): node story-v7-prepare.mjs first (public/data/story-v7.json, the textures, the voice, M1, the effects, the mix); render with --gl=angle */}
  <Composition
    id="StoryV7"
    component={StoryV7}
    durationInFrames={Math.round(V7.duration * V7.fps)}
    fps={V7.fps}
    width={V7.width}
    height={V7.height}
    defaultProps={{live: {}, audio: 'mix'} satisfies StoryV7Props}
    calculateMetadata={async ({props}) => {
      const [story, scene1] = await Promise.all([
        fetch(staticFile('data/story-v7.json')).then((r) => r.json()) as Promise<StoryV7Data>,
        fetch(staticFile('data/scene1.json')).then((r) => r.json()) as Promise<Scene1Data>,
      ]);
      return {props: {...props, story, scene1}};
    }}
  />
  {/* Film v7 animatic, the whole 3:00 in previz: node animatic-v7-prepare.mjs first (the voice, the ticks, public/data/animatic-v7.json) */}
  <Composition
    id="AnimaticV7"
    component={AnimaticV7}
    durationInFrames={ANIM.duration * ANIM.fps}
    fps={ANIM.fps}
    width={ANIM.width}
    height={ANIM.height}
    defaultProps={{} satisfies AnimaticV7Props}
    calculateMetadata={async ({props}) => {
      const data = (await fetch(staticFile('data/animatic-v7.json')).then((r) => r.json())) as AnimaticData;
      return {props: {...props, data}};
    }}
  />
  {/* Film v8 animatic, one journey: the world's sheet textures come from story-v7.json (node story-v7-prepare.mjs --no-audio --no-mix --no-pdf); public/v8 holds the hi-res L-1 and the /try capture; render with --gl=angle */}
  <Composition
    id="AnimaticV8"
    component={AnimaticV8}
    durationInFrames={V8.duration * V8.fps}
    fps={V8.fps}
    width={V8.width}
    height={V8.height}
    defaultProps={{} satisfies AnimaticV8Props}
    calculateMetadata={async ({props}) => {
      const story = (await fetch(staticFile('data/story-v7.json')).then((r) => r.json())) as StoryV7Data;
      const data: AnimaticV8Data = {sheets: story.sheets.map((s) => ({id: s.id, png: s.png}))};
      return {props: {...props, data}};
    }}
  />
  </>
);
