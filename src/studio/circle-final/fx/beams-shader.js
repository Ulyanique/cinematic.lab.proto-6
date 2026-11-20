// Shared beam field from circle.animaation.proto-2 (MIT; see ../LICENSE).
export const CIRCLE_BEAMS_GLSL = /* glsl */ `
    float circleBeamHash(float n) { return fract(sin(n * 127.1) * 43758.5453123); }
    vec3 circleFinalBeams(vec2 uv, float beamTime, float beamAlong) {
      vec2 p = vec2(uv.x * 1280.0, (1.0 - uv.y) * 720.0);
      vec3 acc = vec3(0.0);
      for (int side = 0; side < 2; side++) {
        vec2 q = side == 0 ? p : vec2(1280.0 - p.x, p.y);       // the two arms mirror each other
        vec2 d = vec2(0.788, 0.615), n = vec2(-0.615, 0.788);
        vec2 r = q - vec2(0.0, 330.0);
        float along = dot(r, d), perp = dot(r, n);
        float wide = mix(46.0, 16.0, smoothstep(0.0, 380.0, along));              // broad at the frame edge, thin further in
        float core = exp(-pow(perp / wide, 2.0)) + 0.35 * exp(-pow((perp - 20.0) / 85.0, 2.0));
        float lines = 0.0;
        for (int k = 0; k < 6; k++) {
          float fk = float(k) + 9.0 * float(side);
          float off = (circleBeamHash(fk + 0.3) - 0.5) * 300.0 + 6.0 * sin(beamTime * 0.2 + fk);
          lines += exp(-pow((perp - off) / (1.5 + 4.0 * circleBeamHash(fk + 3.1)), 2.0)) * (0.12 + 0.3 * circleBeamHash(fk + 11.7));
        }
        float edge = exp(-max(along, 0.0) / 240.0);
        float blob = exp(-pow((along - beamAlong) / 130.0, 2.0));
        float spot = exp(-(pow(along - beamAlong, 2.0) + perp * perp) / (34.0 * 34.0)) + 0.5 * exp(-pow(perp / 5.0, 2.0)) * exp(-pow((along - beamAlong) / 90.0, 2.0));
        float I = core * (1.1 * edge + 0.34 * blob + 0.07) + lines * (0.30 * edge + 0.12 * blob + 0.05) + spot * 1.3;
        vec3 c = mix(vec3(0.34, 0.60, 0.92) * 0.8, vec3(1.0, 0.68, 0.30), smoothstep(30.0, 400.0, along));     // teal at the frame edge, amber further in
        acc += c * I;
      }
      acc += vec3(0.03, 0.02, 0.011) * exp(-pow(length((p - vec2(645.0, 290.0)) * vec2(0.8, 1.0)) / 380.0, 2.0)) / 0.55;   // faint warm haze behind the emblem
      return acc * 0.55;
    }
`;
