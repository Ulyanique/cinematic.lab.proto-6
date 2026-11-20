import { useEffect } from 'react'
import { EditorView } from './ui/EditorView'

const isStudioMode =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('studio') === '1'

/**
 * Единая точка входа «Cinematic Lab».
 * По умолчанию открывает редактор (EditorView).
 * При ?studio=1 запускает классическую студию (src/studio/main.js).
 */
export default function App() {
  useEffect(() => {
    if (isStudioMode) {
      // @ts-ignore — студия написана на JS и стартует при загрузке модуля
      import('./studio/main.js')
    }
  }, [])

  if (!isStudioMode) {
    return <EditorView />
  }

  return (
    <button
      type="button"
      onClick={() => {
        const url = new URL(window.location.href)
        url.searchParams.delete('studio')
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
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        cursor: 'pointer',
        backdropFilter: 'blur(6px)',
      }}
    >
      Открыть редактор
    </button>
  )
}
