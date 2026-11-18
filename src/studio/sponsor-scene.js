import { PartnersScene } from "./partners-scene.js";

/** Общая сцена спонсоров, но с одним знаком в верхней части кадра. */
export class SponsorScene extends PartnersScene {
  constructor(canvas, cfg) { super(canvas, cfg, { single: true }); }
}
