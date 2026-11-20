export class HistoryManager<T> {
  private past: T[] = []
  private future: T[] = []
  private current: T
  private maxSize: number

  constructor(initialState: T, maxSize = 100) {
    this.current = initialState
    this.maxSize = maxSize
  }

  get state(): T {
    return this.current
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  push(nextState: T): T {
    this.past.push(this.current)
    if (this.past.length > this.maxSize) {
      this.past.shift()
    }
    this.current = nextState
    this.future = []
    return this.current
  }

  undo(): T {
    if (!this.canUndo) return this.current
    const prev = this.past.pop()!
    this.future.push(this.current)
    this.current = prev
    return this.current
  }

  redo(): T {
    if (!this.canRedo) return this.current
    const next = this.future.pop()!
    this.past.push(this.current)
    this.current = next
    return this.current
  }

  clear(newInitialState?: T): void {
    this.past = []
    this.future = []
    if (newInitialState !== undefined) {
      this.current = newInitialState
    }
  }
}
