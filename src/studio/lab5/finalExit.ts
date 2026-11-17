import { smoothstep } from './math';
import { TL } from './timeline';

/** Shared deterministic timing for the emblem and the staggered title exit. */
export const logoExit = (t: number) => smoothstep(TL.exitStart, TL.exitEnd, t);
export const glyphExit = (t: number, index: number) =>
  smoothstep(TL.exitStart + index * 0.045, TL.exitStart + index * 0.045 + 1.8, t);
export const subtitleExit = (t: number) => smoothstep(TL.exitStart + 0.4, TL.exitStart + 2.4, t);
