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
    defaultProps={{narrator: 'brian', repoUrl: 'https://github.com/eric2612115/landsight', showSourceTag: true} satisfies FilmProps}
    calculateMetadata={async ({props}) => {
      const data = (await fetch(staticFile('data/film.json')).then((r) => r.json())) as FilmData;
      return {props: {...props, data}};
    }}
  />
);
