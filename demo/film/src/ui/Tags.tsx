import {C, FONT} from '../theme';

/** Bottom-right on every app beat: the provenance line; amber "mock data" while a clip is not from the repo run. */
export const CornerTag: React.FC<{mock?: boolean}> = ({mock}) => (
  <div
    style={{
      position: 'absolute',
      right: 30,
      bottom: 6,
      display: 'flex',
      gap: 14,
      alignItems: 'center',
      padding: '2px 14px',
      borderRadius: 10,
      background: 'rgba(16,18,22,0.85)',
      fontFamily: FONT.sans,
      fontSize: 28,
      fontWeight: 300,
      color: C.mute,
      fontStyle: 'italic',
    }}
  >
    {mock ? <span style={{color: C.amber, fontStyle: 'normal', fontWeight: 500, fontSize: 22, fontFamily: FONT.mono}}>MOCK DATA · RE-CAPTURE</span> : null}
    <span>synthetic drawings · answer key in repo</span>
  </div>
);

/** On the paper beats: what you see is rendered, not filmed. */
export const RenderedTag: React.FC<{dark?: boolean}> = ({dark}) => (
  <div
    style={{
      position: 'absolute',
      right: 34,
      top: 26,
      fontFamily: FONT.mono,
      fontSize: 22,
      letterSpacing: 2,
      color: dark ? 'rgba(232,234,237,0.42)' : 'rgba(40,30,20,0.5)',
      textTransform: 'uppercase',
    }}
  >
    rendered
  </div>
);
