import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

/** FXAA runs after OutputPass, on the final sRGB scene, and needs no MSAA framebuffer. */
export function createAntialiasPass() {
  return new ShaderPass(FXAAShader);
}

/** The shader samples the composer's input texture in physical pixels, not CSS pixels. */
export function resizeAntialias(pass: ShaderPass, width: number, height: number, pixelRatio: number) {
  pass.uniforms.resolution.value.set(1 / Math.max(1, Math.floor(width * pixelRatio)), 1 / Math.max(1, Math.floor(height * pixelRatio)));
}
