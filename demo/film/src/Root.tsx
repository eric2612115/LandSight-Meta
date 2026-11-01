import {Composition, staticFile} from 'remotion';
import {Film} from './Film';
import type {FilmData, FilmProps} from './data';
import beats from '../beats.json';

export const Root: React.FC = () => (
  <Composition
    id="Film"
    component={Film}
    durationInFrames={Math.round(beats.duration * beats.fps)}
    fps={beats.fps}
    width={beats.width}
    height={beats.height}
    defaultProps={{narrator: 'brian', repoUrl: 'repo URL · public by Nov 4', showSourceTag: true} satisfies FilmProps}
    calculateMetadata={async ({props}) => {
      const data = (await fetch(staticFile('data/film.json')).then((r) => r.json())) as FilmData;
      return {props: {...props, data}};
    }}
  />
);
