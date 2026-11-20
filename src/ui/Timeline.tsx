import React, { useRef } from 'react'
import type { ProjectStore } from '../core/store'
import { useProjectStore } from './useProjectStore'

interface TimelineProps {
  store: ProjectStore
}

export const Timeline: React.FC<TimelineProps> = ({ store }) => {
  const state = useProjectStore(store)
  const comp = store.getActiveComposition()
  const trackAreaRef = useRef<HTMLDivElement>(null)

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = trackAreaRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    store.setTime(ratio * comp.duration)
  }

  const playheadPct = comp.duration > 0 ? (state.currentTime / comp.duration) * 100 : 0

  return (
    <div className="flex flex-col bg-neutral-950 text-neutral-200 border-t border-neutral-800 select-none text-xs">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-neutral-800 bg-neutral-900">
        <button
          type="button"
          onClick={() => store.setPlaying(!state.playing)}
          className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 font-medium"
        >
          {state.playing ? 'Pause' : 'Play'}
        </button>
        <span className="font-mono text-neutral-400">
          {state.currentTime.toFixed(2)}s / {comp.duration.toFixed(2)}s
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            disabled={!state.canUndo}
            onClick={() => store.undo()}
            className="px-2 py-1 rounded bg-neutral-800 disabled:opacity-40 hover:bg-neutral-700"
          >
            Undo
          </button>
          <button
            type="button"
            disabled={!state.canRedo}
            onClick={() => store.redo()}
            className="px-2 py-1 rounded bg-neutral-800 disabled:opacity-40 hover:bg-neutral-700"
          >
            Redo
          </button>
        </div>
      </div>

      {/* Layers & Tracks */}
      <div className="flex min-h-[160px] max-h-[260px] overflow-y-auto">
        {/* Layer names */}
        <div className="w-52 shrink-0 border-r border-neutral-800 bg-neutral-900/60">
          {comp.layers.map((layer) => {
            const selected = state.selectedLayerId === layer.id
            return (
              <div
                key={layer.id}
                onClick={() => store.selectLayer(layer.id)}
                className={`flex items-center gap-2 px-2.5 h-7 border-b border-neutral-800/60 cursor-pointer ${
                  selected ? 'bg-amber-500/15 text-amber-200' : 'hover:bg-neutral-800/50'
                }`}
              >
                <button
                  type="button"
                  title="Visibility"
                  onClick={(e) => {
                    e.stopPropagation()
                    store.updateLayer(layer.id, (l) => ({ ...l, visible: !l.visible }))
                  }}
                  className={`w-4 text-center ${layer.visible ? 'text-neutral-200' : 'text-neutral-600'}`}
                >
                  {layer.visible ? '●' : '○'}
                </button>
                <span className="truncate flex-1">{layer.name}</span>
                <span className="text-[10px] text-neutral-500 uppercase">{layer.type}</span>
              </div>
            )
          })}
        </div>

        {/* Track bars */}
        <div
          ref={trackAreaRef}
          onClick={handleScrub}
          className="relative flex-1 bg-neutral-950 cursor-ew-resize"
        >
          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-px bg-amber-400 pointer-events-none z-10"
            style={{ left: `${playheadPct}%` }}
          />
          {comp.layers.map((layer) => {
            const leftPct = (layer.startTime / comp.duration) * 100
            const widthPct = (layer.duration / comp.duration) * 100
            const selected = state.selectedLayerId === layer.id
            return (
              <div key={layer.id} className="relative h-7 border-b border-neutral-800/40">
                <div
                  onClick={(e) => {
                    e.stopPropagation()
                    store.selectLayer(layer.id)
                  }}
                  className={`absolute top-1 bottom-1 rounded-sm cursor-pointer ${
                    selected
                      ? 'bg-amber-500/50 border border-amber-300'
                      : 'bg-sky-500/35 border border-sky-400/40'
                  }`}
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
