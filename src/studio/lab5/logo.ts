import * as THREE from "three";
import { clamp, easeInOutCubic, easeOutBack, easeOutCubic, lerp, mulberry32 } from "./math";

/** Procedural warm studio environment -> PMREM, used for the real metallic logo. */
export function createGoldEnv(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(70, 46, 70),
    new THREE.MeshBasicMaterial({ color: 0x1b0d03, side: THREE.BackSide })
  );
  scene.add(room);
  const add = (w: number, h: number, pos: [number, number, number], color: number, intensity: number) => {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
    mat.toneMapped = false;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  add(24, 24, [0, 20, 0], 0xffe2b0, 5);
  add(4, 28, [-22, 4, 7], 0xffc070, 8);
  add(5, 26, [22, 6, -9], 0xffb050, 7);
  add(34, 9, [0, 5, -28], 0xff9a30, 3.2);
  add(30, 5, [0, -9, 24], 0xff8a20, 2.2);
  add(3, 22, [12, 3, 24], 0xffd9a0, 6);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  return rt.texture;
}

function sparkTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,240,200,1)");
  gr.addColorStop(0.25, "rgba(255,190,90,0.7)");
  gr.addColorStop(1, "rgba(255,150,40,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Exact circular arc (centre = hinge) – the path the pencil really follows. */
class ArcCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private a0: number,
    private a1: number,
    private cy: number,
    private r: number
  ) {
    super();
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const a = lerp(this.a0, this.a1, t);
    return target.set(Math.cos(a) * this.r, this.cy + Math.sin(a) * this.r, 0);
  }
}

const HINGE_Y = 2.3;
const LEG = 5.0; // L1 + L2: the tips lie on a circle of this radius around the hinge
const SPAN = 0.66; // half opening angle at the end of the drawing
const ARC_SEGMENTS = 192;
const ARC_RADIAL = 8;
const ARC_R = 0.055;

export class CompassLogo {
  group = new THREE.Group();
  private inner = new THREE.Group();
  private leftPivot = new THREE.Group();
  private rightPivot = new THREE.Group();
  private mats: THREE.MeshStandardMaterial[] = [];
  private arc: THREE.Mesh;
  private arcCurve: ArcCurve;
  private capStart: THREE.Mesh;
  private capHead: THREE.Mesh;
  private spark: THREE.Mesh;
  private sparkles: THREE.Points;
  private sparkMat: THREE.PointsMaterial;
  private baseScale = 0.97;
  private emissiveCol = new THREE.Color();

  constructor(env: THREE.Texture) {
    const mk = (opts: THREE.MeshStandardMaterialParameters) => {
      const m = new THREE.MeshStandardMaterial({
        metalness: 1,
        roughness: 0.2,
        envMap: env,
        envMapIntensity: 2.0,
        emissive: 0xff8a18,
        emissiveIntensity: 0,
        ...opts,
      });
      this.mats.push(m);
      return m;
    };
    const gold = mk({ color: 0xffc04d, flatShading: true });
    const goldSmooth = mk({ color: 0xffc860, roughness: 0.16 });
    const dark = mk({ color: 0x3a2008, roughness: 0.4, envMapIntensity: 1.2, flatShading: true });

    this.inner.position.y = -0.65;
    this.group.add(this.inner);

    const hinge = new THREE.Group();
    hinge.position.set(0, HINGE_Y, 0);
    this.inner.add(hinge);

    // hinge barrel (hex) + side rings whose hexagons are aligned with the barrel's
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.34, 6), goldSmooth);
    barrel.rotation.x = Math.PI / 2;
    hinge.add(barrel);
    for (const z of [-0.2, 0.2]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.055, 6, 6), gold);
      ring.rotation.z = Math.PI / 6;
      ring.position.z = z;
      hinge.add(ring);
    }
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 6), dark);
    screw.rotation.x = Math.PI / 2;
    screw.position.z = 0.27;
    hinge.add(screw);

    // handle
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.12, 0.75, 6), goldSmooth);
    stem.position.y = 0.62;
    hinge.add(stem);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 6), gold);
    collar.rotation.x = Math.PI / 2;
    collar.rotation.z = Math.PI / 6;
    collar.position.y = 0.98;
    hinge.add(collar);
    const knob = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), gold);
    knob.scale.set(1, 1.45, 1);
    knob.position.y = 1.32;
    hinge.add(knob);

    // legs – the pencil leg sits slightly in front so the two can pass each other cleanly
    this.leftPivot.position.z = -0.11;
    this.rightPivot.position.z = 0.11;
    hinge.add(this.leftPivot, this.rightPivot);
    const L1 = 3.3;
    const L2 = LEG - L1;
    // true 4-sided diamond sections (rotated 45°), proper points instead of sliver caps
    const prism = (rTop: number, rBot: number, h: number) => {
      const g = new THREE.CylinderGeometry(rTop, rBot, h, 4, 1);
      g.rotateY(Math.PI / 4);
      g.scale(1, 1, 0.75);
      return g;
    };
    const buildLeg = (pivot: THREE.Group, kind: "needle" | "pencil") => {
      const upper = new THREE.Mesh(prism(0.19, 0.115, L1), gold);
      upper.position.y = -L1 / 2;
      pivot.add(upper);
      const knee = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), goldSmooth);
      knee.position.y = -L1;
      knee.scale.z = 0.8;
      pivot.add(knee);
      if (kind === "needle") {
        const lower = new THREE.Mesh(prism(0.105, 0.0, L2), gold);
        lower.position.y = -L1 - L2 / 2;
        pivot.add(lower);
      } else {
        const holder = new THREE.Mesh(prism(0.115, 0.09, 1.15), gold);
        holder.position.y = -L1 - 0.575;
        pivot.add(holder);
        const lead = new THREE.Mesh(prism(0.075, 0.0, L2 - 1.15), dark);
        lead.position.y = -L1 - 1.15 - (L2 - 1.15) / 2;
        pivot.add(lead);
      }
    };
    buildLeg(this.leftPivot, "needle");
    buildLeg(this.rightPivot, "pencil");

    // the arc drawn by the pencil: exact circle, capped ends (no open tube ends)
    this.arcCurve = new ArcCurve(-Math.PI / 2 - SPAN, -Math.PI / 2 + SPAN, HINGE_Y, LEG);
    const tube = new THREE.TubeGeometry(this.arcCurve, ARC_SEGMENTS, ARC_R, ARC_RADIAL, false);
    tube.setDrawRange(0, 0);
    this.arc = new THREE.Mesh(tube, goldSmooth);
    this.arc.position.z = 0.11;
    this.inner.add(this.arc);
    const capGeo = new THREE.SphereGeometry(ARC_R, 10, 8);
    this.capStart = new THREE.Mesh(capGeo, goldSmooth);
    this.capHead = new THREE.Mesh(capGeo, goldSmooth);
    this.capStart.position.copy(this.arcCurve.getPoint(0)).setZ(0.11);
    this.capStart.visible = false;
    this.capHead.visible = false;
    this.inner.add(this.capStart, this.capHead);

    // glowing pencil tip
    const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.6, 1.8), toneMapped: false });
    this.spark = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), sparkMat);
    this.inner.add(this.spark);

    // orbiting sparkles (deterministic)
    const rand = mulberry32(31337);
    const n = 420;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const r = 3.6 + rand() * 3.2;
      arr[i * 3] = Math.cos(a) * r;
      arr[i * 3 + 1] = (rand() - 0.5) * 8.5;
      arr[i * 3 + 2] = Math.sin(a) * r * 0.55;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    this.sparkMat = new THREE.PointsMaterial({
      map: sparkTexture(),
      size: 0.28,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0xffc070,
    });
    this.sparkles = new THREE.Points(sg, this.sparkMat);
    this.sparkles.frustumCulled = false;
    this.group.add(this.sparkles);

    this.group.visible = false;
  }

  /** tl = seconds since the explosion; time = global time. */
  update(tl: number, time: number) {
    const vis = tl > 0.12;
    this.group.visible = vis;
    if (!vis) return;

    const sIn = easeOutBack((tl - 0.12) / 1.5, 1.05);
    this.group.scale.setScalar(Math.max(this.baseScale * sIn, 0.0001));

    // 1) legs unfold symmetrically (+ small overshoot), 2) both swing to the start of the arc,
    // 3) the pencil leg sweeps across and draws the arc – its tip is exactly the arc's head.
    const open = lerp(0.012, 0.36, easeOutBack((tl - 0.95) / 0.85, 1.2));
    const reposition = easeInOutCubic((tl - 1.75) / 0.65);
    const arcP = easeInOutCubic((tl - 2.4) / 1.7);
    const needleAngle = lerp(open, SPAN, reposition); // magnitude, leans left
    const pencilAngle = tl < 2.4 ? lerp(open, -SPAN, reposition) : lerp(-SPAN, SPAN, arcP);
    this.leftPivot.rotation.z = -needleAngle;
    this.rightPivot.rotation.z = pencilAngle;

    // arc: drawn by whole segments (indices), head capped with a sphere that sits on the exact tip
    const segs = Math.floor(arcP * ARC_SEGMENTS);
    this.arc.geometry.setDrawRange(0, segs * ARC_RADIAL * 6);
    const drawing = arcP > 0.001;
    this.capStart.visible = drawing;
    this.capHead.visible = drawing;
    this.arcCurve.getPoint(segs / ARC_SEGMENTS, this.capHead.position);
    this.capHead.position.z = 0.11;
    const tip = this.arcCurve.getPoint(arcP);
    this.spark.position.copy(tip);
    this.spark.position.z = 0.11;
    const sparkVis = arcP > 0.001 && arcP < 0.999 ? 1 : 0;
    this.spark.scale.setScalar(sparkVis * (1 + Math.sin(time * 9) * 0.12));

    // spin-in, then gentle sway so the facets keep glinting
    const spin = (1 - easeOutCubic(tl / 3.2)) * -1.4;
    this.group.rotation.y = spin + Math.sin(time * 0.55) * 0.32;
    this.group.rotation.x = Math.sin(time * 0.37) * 0.045;
    this.group.position.y = 5.8 + Math.sin(time * 0.8) * 0.1;

    // white-hot -> molten gold
    const hot = Math.exp(-tl * 1.25);
    this.emissiveCol.setRGB(1, lerp(0.5, 0.92, hot), lerp(0.1, 0.65, hot));
    const pulse = Math.exp(-Math.pow((tl - 4.05) / 0.35, 2)) * 1.2; // flash when the arc completes
    const em = 0.08 + hot * 6 + pulse;
    for (const m of this.mats) {
      m.emissive.copy(this.emissiveCol);
      m.emissiveIntensity = em;
      m.envMapRotation.y = time * 0.4 + Math.sin(time * 0.3) * 0.5;
      m.envMapIntensity = 2.0 + pulse;
    }
    this.sparkMat.opacity = clamp((tl - 2.0) / 1.5) * 0.9;
    this.sparkles.rotation.y = time * 0.25;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    for (const m of this.mats) m.dispose();
    this.sparkMat.map?.dispose();
    this.sparkMat.dispose();
  }
}
