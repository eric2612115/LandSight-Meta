import {Config} from '@remotion/cli/config';

// The captures are H.264 already; frames are JPEG while rendering. Output is overwritten so `npm run render` can be
// re-run as is. Concurrency 4 suits an M-series laptop with the frontend dev server running.
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
Config.setConcurrency(4);
Config.setCrf(18);
