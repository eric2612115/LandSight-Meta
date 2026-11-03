// The console's look, shared by the simulator and FilmV4: a pale studio, ink type, one accent (the product's cobalt).
export const LOOK = {
  bg: '#e1dbd0',
  paper: '#f7f5f0',
  panel: 'rgba(251,250,247,0.95)',
  line: '#dcd8cf',
  ink: '#1d2026',
  mute: '#6c717a',
  faint: '#b8b4ab',
  accent: '#2457ff',
};
/** CSS px to output px: the console is laid out at 1600 × 900 and recorded at 1920 × 1080. */
export const PX = 1.2;
/** On-screen words carry no em-dash (as the re-voiced narration): "A planter over the lift shaft. Send back." */
export const plain = (x) => {
  const y = String(x).replace(/\s+—\s+(\S)/g, (_, c) => `. ${c.toUpperCase()}`);
  return y !== String(x) && !/[.?!]$/.test(y) ? `${y}.` : y;
};
