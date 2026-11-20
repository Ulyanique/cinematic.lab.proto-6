import { createDefaultTransform } from '../core/schema.ts'
import type { Layer, ProjectFile } from '../core/schema.ts'
import { createEmptyProject } from '../core/project.ts'

export interface GalleryTemplateOptions {
  name?: string
  width?: number
  height?: number
  fps?: number
  panelCount?: number
  panelDuration?: number
}

export function createGalleryTemplate(options: GalleryTemplateOptions = {}): ProjectFile {
  const {
    name = 'Золотой коридор (Галерея)',
    width = 1920,
    height = 1080,
    fps = 60,
    panelCount = 7,
    panelDuration = 4.0,
  } = options

  const project = createEmptyProject(name)
  const comp = project.compositions[0]
  comp.width = width
  comp.height = height
  comp.fps = fps
  comp.duration = panelCount * panelDuration + 4

  const layers: Layer[] = []
  for (let i = 0; i < panelCount; i++) {
    const startTime = i * panelDuration
    layers.push({
      id: `panel-${i + 1}`,
      name: `Панель ${i + 1}`,
      type: '3d-panel',
      startTime,
      duration: panelDuration,
      visible: true,
      locked: false,
      transform: {
        ...createDefaultTransform(),
        position: [0, 0, -i * 12],
        opacity: [
          { time: 0, value: 0, easing: 'easeOut' },
          { time: 0.6, value: 1, easing: 'linear' },
          { time: panelDuration - 0.6, value: 1, easing: 'easeIn' },
          { time: panelDuration, value: 0 },
        ],
      },
      data: {
        slotKey: `slot${i}`,
        materialPreset: 'gold',
      },
    })
  }

  comp.layers = layers
  return project
}
