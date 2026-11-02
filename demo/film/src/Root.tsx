import {Composition, staticFile} from 'remotion';
import {Film} from './Film';
import {Scene1Tree} from './scenes/Scene1Tree';
import type {Scene1Data, Scene1Props} from './scenes/Scene1Tree';
import {SCENE1} from './scenes/scene1-cues.js';
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
  </>
);
