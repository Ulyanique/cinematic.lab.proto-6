import { createSharedSceneConfig } from './shared-visuals.js';
import { createSceneTimeline } from './scene-timeline.js';

export const CIRCLE_FINAL_ID = 'circle-final';
export const CIRCLE_FINAL_DEFAULTS = createSharedSceneConfig(createSceneTimeline(12));
Object.assign(CIRCLE_FINAL_DEFAULTS.timeline, { drawDuration: 1.7, emergeDuration: 0, holdDuration: 7.3, fadeDuration: 2, restDuration: 1 });
CIRCLE_FINAL_DEFAULTS.caption.titleVisible = false;
