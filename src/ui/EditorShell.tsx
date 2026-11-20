import React, { useState } from 'react'
import type { ProjectStore } from '../core/store'
import { serializeProject } from '../core/project'
import { Timeline } from './Timeline'
import { Inspector } from './Inspector'
import { AssetsPanel } from './AssetsPanel'
import { useProjectStore } from './useProjectStore'

interface EditorShellProps {
  store: ProjectStore
  children?: React.ReactNode
}

export const EditorShell: React.FC<EditorShellProps> = ({ store, children }) => {
  const state = useProjectStore(store)
  const [mode, setMode] = useState<'quick' | 'pro'>('pro')

  const handleDownloadJson = () => {
    const json = serializeProject(state.project)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${state.project.name.toLowerCase().replace(/\s+/g, '-')}.clab.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="flex flex-col h-screen w-screen bg-neutral-950 text-neutral-100 overflow-hidden font-sans"
      style={{ fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif' }}
    >
      {/* Top Bar */}
      <header className="flex items-center justify-between px-4 h-10 bg-neutral-900 border-b border-neutral-800 text-xs shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-semibold tracking-wider text-amber-400">CINEMATIC LAB</span>
          <span className="text-neutral-500">/</span>
          <span className="text-neutral-200">{state.project.name}</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded bg-neutral-800 p-0.5">
            <button
              type="button"
              onClick={() => setMode('quick')}
              className={`px-2.5 py-0.5 rounded ${
                mode === 'quick' ? 'bg-amber-500/25 text-amber-300' : 'text-neutral-400'
              }`}
            >
              Шаблон
            </button>
            <button
              type="button"
              onClick={() => setMode('pro')}
              className={`px-2.5 py-0.5 rounded ${
                mode === 'pro' ? 'bg-amber-500/25 text-amber-300' : 'text-neutral-400'
              }`}
            >
              Редактор
            </button>
          </div>
          <button
            type="button"
            onClick={handleDownloadJson}
            className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
          >
            Сохранить .clab
          </button>
          <button
            type="button"
            onClick={() => {
              const url = new URL(window.location.href)
              url.searchParams.delete('editor')
              window.location.href = url.toString()
            }}
            className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400"
          >
            Студия
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex flex-1 min-h-0">
        {/* Assets & Templates */}
        <AssetsPanel store={store} />

        {/* Viewport */}
        <main className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
          {children ?? (
            <div className="text-xs text-neutral-500">Viewport ({state.currentTime.toFixed(2)}s)</div>
          )}
        </main>

        {/* Inspector */}
        <Inspector store={store} />
      </div>

      {/* Timeline (Pro mode) */}
      {mode === 'pro' && <Timeline store={store} />}
    </div>
  )
}
