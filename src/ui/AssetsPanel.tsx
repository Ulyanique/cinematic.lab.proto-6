import React, { useState } from 'react'
import type { ProjectStore } from '../core/store'
import { createDefaultTransform } from '../core/schema'
import { createGalleryTemplate } from '../templates/gallery-template'

interface AssetsPanelProps {
  store: ProjectStore
}

export const AssetsPanel: React.FC<AssetsPanelProps> = ({ store }) => {
  const [tab, setTab] = useState<'templates' | 'layers'>('templates')

  const applyTemplate = (preset: '16:9' | '9:16' | '1:1') => {
    const dims =
      preset === '9:16'
        ? { width: 1080, height: 1920, name: 'Вертикальный Reels (9:16)' }
        : preset === '1:1'
          ? { width: 1080, height: 1080, name: 'Квадратный пост (1:1)' }
          : { width: 1920, height: 1080, name: 'Золотой коридор (16:9)' }
    const next = createGalleryTemplate(dims)
    store.updateProject(() => next)
    store.setTime(0)
  }

  const addLayer = (type: 'text' | '3d-panel' | 'video' | 'image') => {
    const comp = store.getActiveComposition()
    const id = `${type}-${Date.now()}`
    store.updateProject((project) => ({
      ...project,
      compositions: project.compositions.map((c) =>
        c.id === comp.id
          ? {
              ...c,
              layers: [
                ...c.layers,
                {
                  id,
                  name: `Новый слой (${type})`,
                  type,
                  startTime: store.getState().currentTime,
                  duration: 4,
                  visible: true,
                  locked: false,
                  transform: createDefaultTransform(),
                },
              ],
            }
          : c,
      ),
    }))
    store.selectLayer(id)
  }

  return (
    <aside className="w-56 bg-neutral-900 border-r border-neutral-800 flex flex-col text-xs text-neutral-200 shrink-0">
      <div className="flex border-b border-neutral-800">
        <button
          type="button"
          onClick={() => setTab('templates')}
          className={`flex-1 py-2 text-center ${
            tab === 'templates' ? 'text-amber-300 border-b-2 border-amber-400' : 'text-neutral-400'
          }`}
        >
          Шаблоны
        </button>
        <button
          type="button"
          onClick={() => setTab('layers')}
          className={`flex-1 py-2 text-center ${
            tab === 'layers' ? 'text-amber-300 border-b-2 border-amber-400' : 'text-neutral-400'
          }`}
        >
          Добавить
        </button>
      </div>

      <div className="p-2.5 space-y-2 overflow-y-auto">
        {tab === 'templates' ? (
          <>
            <button
              type="button"
              onClick={() => applyTemplate('16:9')}
              className="w-full text-left p-2 rounded bg-neutral-800/80 hover:bg-neutral-800 border border-neutral-700/60"
            >
              <div className="font-medium text-neutral-100">Золотой коридор</div>
              <div className="text-[10px] text-neutral-400">1920×1080 · 16:9 · 7 панелей</div>
            </button>
            <button
              type="button"
              onClick={() => applyTemplate('9:16')}
              className="w-full text-left p-2 rounded bg-neutral-800/80 hover:bg-neutral-800 border border-neutral-700/60"
            >
              <div className="font-medium text-neutral-100">Reels / Shorts</div>
              <div className="text-[10px] text-neutral-400">1080×1920 · 9:16 · 7 панелей</div>
            </button>
            <button
              type="button"
              onClick={() => applyTemplate('1:1')}
              className="w-full text-left p-2 rounded bg-neutral-800/80 hover:bg-neutral-800 border border-neutral-700/60"
            >
              <div className="font-medium text-neutral-100">Квадратный пост</div>
              <div className="text-[10px] text-neutral-400">1080×1080 · 1:1 · 7 панелей</div>
            </button>
          </>
        ) : (
          <div className="space-y-1.5">
            {(['text', '3d-panel', 'video', 'image'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => addLayer(type)}
                className="w-full text-left px-2.5 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700"
              >
                + {type}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
