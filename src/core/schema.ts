export type EasingType = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold'

export interface CubicBezier {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface Keyframe<T = number> {
  time: number
  value: T
  easing?: EasingType | CubicBezier
}

export type AnimatedProperty<T = number> = T | Keyframe<T>[]

export type Vec3 = [number, number, number]

export interface Transform3D {
  position: AnimatedProperty<Vec3>
  rotation: AnimatedProperty<Vec3>
  scale: AnimatedProperty<Vec3>
  opacity: AnimatedProperty<number>
}

export type LayerType =
  | 'video'
  | 'image'
  | 'text'
  | '3d-panel'
  | 'camera'
  | 'light'
  | 'audio'
  | 'particle'

export interface EffectConfig {
  id: string
  type: string
  enabled: boolean
  params: Record<string, AnimatedProperty<number | string | boolean>>
}

export interface Layer {
  id: string
  name: string
  type: LayerType
  startTime: number
  duration: number
  inPoint?: number
  outPoint?: number
  parentId?: string | null
  visible: boolean
  locked: boolean
  solo?: boolean
  transform: Transform3D
  effects?: EffectConfig[]
  data?: Record<string, unknown>
}

export interface Composition {
  id: string
  name: string
  width: number
  height: number
  fps: number
  duration: number
  backgroundColor: string
  layers: Layer[]
}

export interface ProjectFile {
  schemaVersion: string
  appVersion: string
  name: string
  activeCompositionId: string
  compositions: Composition[]
  assets: Record<string, { id: string; name: string; kind: 'video' | 'image' | 'audio' | 'font'; src?: string }>
}

export function createDefaultTransform(): Transform3D {
  return {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    opacity: 1,
  }
}
