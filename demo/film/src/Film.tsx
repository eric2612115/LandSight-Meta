import {AbsoluteFill, Sequence, useVideoConfig} from 'remotion';
import {AppBeat} from './beats/AppBeat';
import {Close} from './beats/Close';
import {ColdOpen} from './beats/ColdOpen';
import {Who} from './beats/Who';
import type {FilmProps} from './data';
import {Soundtrack} from './Soundtrack';
import {C} from './theme';

/**
 * The Landsight demo film: demo/SCRIPT.md v4's beat table, cut hard (cold/hot), 1920 × 1080, 30 fps, 3:00.
 * Paper beats are rendered here; app beats are captures of the director scenes; every number comes from film.json.
 */
export const Film: React.FC<FilmProps> = ({narrator, repoUrl, showSourceTag, data}) => {
  const {fps} = useVideoConfig();
  if (!data) return <AbsoluteFill style={{background: C.chrome}} />;
  const f = (s: number) => Math.round(s * fps);
  return (
    <AbsoluteFill style={{background: '#050506'}}>
      {data.beats.map((b) => {
        const from = f(b.start);
        const dur = f(b.end) - from;
        let body: React.ReactNode = null;
        if (b.id === 'twelve') body = <ColdOpen data={data} />;
        else if (b.id === 'who') body = <Who data={data} />;
        else if (b.id === 'close') body = <Close data={data} narrator={narrator} repoUrl={repoUrl} />;
        else if (b.scene && data.app[b.scene]) body = <AppBeat beat={b} app={data.app[b.scene]} data={data} showSourceTag={showSourceTag} />;
        return (
          <Sequence key={b.id} from={from} durationInFrames={dur} name={`${b.n} ${b.title}`}>
            {body}
          </Sequence>
        );
      })}
      <Soundtrack data={data} narrator={narrator} />
    </AbsoluteFill>
  );
};
