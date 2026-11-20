import { evaluateProperty } from './easing.ts'
import type { Composition, Layer, Vec3 } from './schema.ts'

export interface EvaluatedTransform {
  position: Vec3
  rotation: Vec3
  scale: Vec3
  opacity: number
}

export interface EvaluatedLayer {
  id: string
  name: string
  type: Layer['type']
  localTime: number
  mediaTime: number
  active: boolean
  transform: EvaluatedTransform
  data?: Record<string, unknown>
}

export interface EvaluatedComposition {
  id: string
  time: number
  width: number
  height: number
  fps: number
  backgroundColor: string
  layers: EvaluatedLayer[]
}

export function evaluateLayer(layer: Layer, time: number): EvaluatedLayer {
  const localTime = time - layer.startTime
  const active = layer.visible && localTime >= 0 && localTime <= layer.duration
  const inPoint = layer.inPoint ?? 0
  const mediaTime = Math.max(0, inPoint + localTime)

  return {
    id: layer.id,
    name: layer.name,
    type: layer.type,
    localTime,
    mediaTime,
    active,
    transform: {
      position: evaluateProperty(layer.transform.position, localTime),
      rotation: evaluateProperty(layer.transform.rotation, localTime),
      scale: evaluateProperty(layer.transform.scale, localTime),
      opacity: evaluateProperty(layer.transform.opacity, localTime),
    },
    data: layer.data,
  }
}

export function evaluateComposition(composition: Composition, time: number): EvaluatedComposition {
  const clampedTime = Math.max(0, Math.min(composition.duration, time))
  return {
    id: composition.id,
    time: clampedTime,
    width: composition.width,
    height: composition.height,
    fps: composition.fps,
    backgroundColor: composition.backgroundColor,
    layers: composition.layers.map((layer) => evaluateLayer(layer, clampedTime)),
  }
}
