import { useEffect, useState } from 'react'
import type { EditorState, ProjectStore } from '../core/store'

export function useProjectStore(store: ProjectStore): EditorState {
  const [state, setState] = useState<EditorState>(() => store.getState())

  useEffect(() => {
    setState(store.getState())
    return store.subscribe(setState)
  }, [store])

  return state
}
