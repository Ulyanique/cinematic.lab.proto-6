import type { Composition, ProjectFile } from './schema.ts'

export const CURRENT_SCHEMA_VERSION = '1.0.0'
export const CURRENT_APP_VERSION = '0.7.0-alpha'

export function createEmptyProject(name = 'Untitled Project'): ProjectFile {
  const compId = 'comp-main'
  const mainComp: Composition = {
    id: compId,
    name: 'Main Composition',
    width: 1920,
    height: 1080,
    fps: 60,
    duration: 30,
    backgroundColor: '#000000',
    layers: [],
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: CURRENT_APP_VERSION,
    name,
    activeCompositionId: compId,
    compositions: [mainComp],
    assets: {},
  }
}

export function serializeProject(project: ProjectFile): string {
  return JSON.stringify(project, null, 2)
}

export function parseProject(json: string): ProjectFile {
  const data = JSON.parse(json) as Partial<ProjectFile>
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid project file: expected JSON object')
  }
  if (!Array.isArray(data.compositions) || data.compositions.length === 0) {
    throw new Error('Invalid project file: missing compositions')
  }
  return {
    schemaVersion: data.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    appVersion: data.appVersion ?? CURRENT_APP_VERSION,
    name: data.name ?? 'Untitled Project',
    activeCompositionId: data.activeCompositionId ?? data.compositions[0].id,
    compositions: data.compositions,
    assets: data.assets ?? {},
  }
}
