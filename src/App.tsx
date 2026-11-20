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

  return (
    <button
      type="button"
      onClick={() => {
        const url = new URL(window.location.href)
        url.searchParams.set('editor', '1')
        window.location.href = url.toString()
      }}
      style={{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        zIndex: 9999,
        padding: '8px 14px',
        borderRadius: '8px',
        background: 'rgba(24, 24, 27, 0.9)',
        color: '#fbbf24',
        border: '1px solid rgba(251, 191, 36, 0.4)',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        backdropFilter: 'blur(6px)',
      }}
    >
      Открыть редактор (Beta)
    </button>
  )
}
