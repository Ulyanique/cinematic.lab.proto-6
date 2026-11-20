import { HistoryManager } from './history.ts'
import type { Composition, Layer, ProjectFile } from './schema.ts'

export interface EditorState {
  project: ProjectFile
  currentTime: number
  playing: boolean
  selectedLayerId: string | null
  canUndo: boolean
  canRedo: boolean
}

export type EditorListener = (state: EditorState) => void

export class ProjectStore {
  private history: HistoryManager<ProjectFile>
  private currentTime = 0
  private playing = false
  private selectedLayerId: string | null = null
  private listeners = new Set<EditorListener>()

  constructor(initialProject: ProjectFile) {
    this.history = new HistoryManager(initialProject)
  }

  getState(): EditorState {
    return {
      project: this.history.state,
      currentTime: this.currentTime,
      playing: this.playing,
      selectedLayerId: this.selectedLayerId,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
    }
  }

  subscribe(listener: EditorListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    const state = this.getState()
    this.listeners.forEach((fn) => fn(state))
  }

  getActiveComposition(): Composition {
    const { project } = this.getState()
    return (
      project.compositions.find((c) => c.id === project.activeCompositionId) ??
      project.compositions[0]
    )
  }

  updateProject(updater: (project: ProjectFile) => ProjectFile): void {
    const next = updater(this.history.state)
    this.history.push(next)
    this.emit()
  }

  updateLayer(layerId: string, updater: (layer: Layer) => Layer): void {
    this.updateProject((project) => ({
      ...project,
      compositions: project.compositions.map((comp) =>
        comp.id === project.activeCompositionId
          ? {
              ...comp,
              layers: comp.layers.map((l) => (l.id === layerId ? updater(l) : l)),
            }
          : comp,
      ),
    }))
  }

  undo(): void {
    if (!this.history.canUndo) return
    this.history.undo()
    this.emit()
  }

  redo(): void {
    if (!this.history.canRedo) return
    this.history.redo()
    this.emit()
  }

  setTime(time: number): void {
    const comp = this.getActiveComposition()
    const clamped = Math.max(0, Math.min(comp.duration, time))
    if (clamped === this.currentTime) return
    this.currentTime = clamped
    this.emit()
  }

  setPlaying(playing: boolean): void {
    if (this.playing === playing) return
    this.playing = playing
    this.emit()
  }

  selectLayer(layerId: string | null): void {
    if (this.selectedLayerId === layerId) return
    this.selectedLayerId = layerId
    this.emit()
  }
}
