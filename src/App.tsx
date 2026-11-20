import { useEffect } from 'react'
import { EditorView } from './ui/EditorView'

const isEditorMode =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('editor') === '1'

/**
 * Единая студия «Cinematic Lab».
 * По умолчанию запускает текущую студию (src/studio/main.js).
 * При ?editor=1 открывает новый интерфейс редактора (EditorView).
 */
export default function App() {
  useEffect(() => {
    if (!isEditorMode) {
      // @ts-ignore — студия написана на JS и стартует при загрузке модуля
      import('./studio/main.js')
    }
  }, [])

  if (isEditorMode) {
    return <EditorView />
  }

  return null
}
