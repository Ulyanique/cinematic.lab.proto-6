import * as THREE from 'three'

function mk(size: number) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

function finish(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Мягкое круглое свечение */
export function glowTexture() {
  const s = 256
  const c = mk(s)
  const g = c.getContext('2d')!
  const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  rg.addColorStop(0, 'rgba(255,255,255,1)')
  rg.addColorStop(0.15, 'rgba(255,226,160,0.85)')
  rg.addColorStop(0.4, 'rgba(255,170,60,0.28)')
  rg.addColorStop(1, 'rgba(255,140,30,0)')
  g.fillStyle = rg
  g.fillRect(0, 0, s, s)
  return finish(c)
}

/** Звезда с лучами + горизонтальный анаморфный штрих */
export function starTexture(rays = 14, seed = 3) {
  const s = 1024
  const c = mk(s)
  const g = c.getContext('2d')!
  g.translate(s / 2, s / 2)
  g.globalCompositeOperation = 'lighter'
  let r = seed
  const rnd = () => {
    r = (r * 16807) % 2147483647
    return r / 2147483647
  }
  // лучи
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI + (rnd() - 0.5) * 0.18
    const len = s * (0.28 + rnd() * 0.22)
    const w = 2 + rnd() * 5
    g.save()
    g.rotate(a)
    for (const dir of [-1, 1]) {
      const gr = g.createLinearGradient(0, 0, dir * len, 0)
      gr.addColorStop(0, 'rgba(255,236,190,0.75)')
      gr.addColorStop(0.35, 'rgba(255,190,100,0.25)')
      gr.addColorStop(1, 'rgba(255,160,60,0)')
      g.fillStyle = gr
      g.beginPath()
      g.moveTo(0, -w)
      g.lineTo(dir * len, -0.3)
      g.lineTo(dir * len, 0.3)
      g.lineTo(0, w)
      g.closePath()
      g.fill()
    }
    g.restore()
  }
  // анаморфный штрих
  const hl = g.createLinearGradient(-s / 2, 0, s / 2, 0)
  hl.addColorStop(0, 'rgba(255,190,100,0)')
  hl.addColorStop(0.5, 'rgba(255,225,160,0.55)')
  hl.addColorStop(1, 'rgba(255,190,100,0)')
  g.fillStyle = hl
  g.fillRect(-s / 2, -3, s, 6)
  // ядро
  const core = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.2)
  core.addColorStop(0, 'rgba(255,255,255,1)')
  core.addColorStop(0.12, 'rgba(255,244,210,0.95)')
  core.addColorStop(0.35, 'rgba(255,200,110,0.4)')
  core.addColorStop(1, 'rgba(255,150,40,0)')
  g.fillStyle = core
  g.fillRect(-s / 2, -s / 2, s, s)
  return finish(c)
}

/** Фон финала — тёплое коричневое свечение как в референсе */
export function backdropTexture() {
  const s = 512
  const c = mk(s)
  const g = c.getContext('2d')!
  const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.72)
  rg.addColorStop(0, '#8a6a42')
  rg.addColorStop(0.35, '#5a4128')
  rg.addColorStop(0.75, '#241810')
  rg.addColorStop(1, '#0d0805')
  g.fillStyle = rg
  g.fillRect(0, 0, s, s)
  return finish(c)
}

/** Круглая мягкая точка для Points */
export function dotTexture() {
  const s = 64
  const c = mk(s)
  const g = c.getContext('2d')!
  const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  rg.addColorStop(0, 'rgba(255,255,255,1)')
  rg.addColorStop(0.35, 'rgba(255,225,150,0.7)')
  rg.addColorStop(1, 'rgba(255,200,100,0)')
  g.fillStyle = rg
  g.fillRect(0, 0, s, s)
  return finish(c)
}
