import {useMemo} from 'react';

/** The printed sheet, inline (so its text uses the page's fonts), sized to `width`; children draw in its units. */
export const Sheet: React.FC<{svg: string; viewBox: number[]; width: number; style?: React.CSSProperties; drawingStyle?: React.CSSProperties; children?: React.ReactNode}> = ({svg, viewBox, width, style, drawingStyle, children}) => {
  const [, , w, h] = viewBox;
  const height = (width * h) / w;
  const inner = useMemo(() => svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, ''), [svg]);
  return (
    <div style={{position: 'relative', width, height, ...style}}>
      <svg viewBox={viewBox.join(' ')} width={width} height={height} style={{position: 'absolute', inset: 0, fontFamily: 'Inter, Helvetica, Arial, sans-serif', ...drawingStyle}} dangerouslySetInnerHTML={{__html: inner}} />
      <svg viewBox={viewBox.join(' ')} width={width} height={height} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
        {children}
      </svg>
    </div>
  );
};
