import React from 'react'
import type { ProjectStore } from '../core/store'
import { useProjectStore } from './useProjectStore'

interface InspectorProps {
  store: ProjectStore
}

export const Inspector: React.FC<InspectorProps> = ({ store }) => {
  const state = useProjectStore(store)
  const comp = store.getActiveComposition()
  const layer = comp.layers.find((l) => l.id === state.selectedLayerId)

  if (!layer) {
    return (
      <div className="w-64 bg-neutral-900 border-l border-neutral-800 p-3 text-xs text-neutral-500">
        Выберите слой на таймлайне, чтобы редактировать его свойства.
      </div>
    )
  }

  return (
    <div className="w-64 bg-neutral-900 border-l border-neutral-800 p-3 text-xs text-neutral-200 space-y-3">
      <div className="font-semibold text-amber-300 border-b border-neutral-800 pb-1.5">
        {layer.name}
      </div>

      {/* Media upload */}
      <div className="space-y-1">
        <span className="text-neutral-400 block">Медиа (видео / фото)</span>
        <input
          type="file"
          accept="video/*,image/*"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const url = URL.createObjectURL(file)
            const kind = file.type.startsWith('video/') ? 'video' : 'image'
            store.updateLayer(layer.id, (l) => ({
              ...l,
              data: { ...l.data, mediaUrl: url, mediaKind: kind, mediaName: file.name },
            }))
          }}
          className="w-full text-[11px] text-neutral-300 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-neutral-800 file:text-amber-300 hover:file:bg-neutral-700"
        />
        {typeof layer.data?.mediaName === 'string' && (
          <div className="text-[10px] text-neutral-400 truncate">{layer.data.mediaName}</div>
        )}
      </div>

      <label className="block space-y-1">
        <span className="text-neutral-400">Название</span>
        <input
          type="text"
          value={layer.name}
          onChange={(e) =>
            store.updateLayer(layer.id, (l) => ({ ...l, name: e.target.value }))
          }
          className="w-full px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-neutral-100"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-neutral-400">Старт (с)</span>
          <input
            type="number"
            step="0.1"
            min="0"
            value={layer.startTime}
            onChange={(e) =>
              store.updateLayer(layer.id, (l) => ({
                ...l,
                startTime: Math.max(0, Number(e.target.value) || 0),
              }))
            }
            className="w-full px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-neutral-100"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-neutral-400">Длительность (с)</span>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={layer.duration}
            onChange={(e) =>
              store.updateLayer(layer.id, (l) => ({
                ...l,
                duration: Math.max(0.1, Number(e.target.value) || 0.1),
              }))
            }
            className="w-full px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-neutral-100"
          />
        </label>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={layer.visible}
            onChange={(e) =>
              store.updateLayer(layer.id, (l) => ({ ...l, visible: e.target.checked }))
            }
          />
          <span>Видимый</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={layer.locked}
            onChange={(e) =>
              store.updateLayer(layer.id, (l) => ({ ...l, locked: e.target.checked }))
            }
          />
          <span>Замок</span>
        </label>
      </div>

      {/* Transform */}
      <div className="pt-2 border-t border-neutral-800 space-y-2">
        <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
          Трансформация
        </div>
        {Array.isArray(layer.transform.position) && typeof layer.transform.position[0] === 'number' && (
          <div className="grid grid-cols-3 gap-1.5">
            {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
              <label key={axis} className="block space-y-0.5">
                <span className="text-[10px] text-neutral-500">Pos {axis}</span>
                <input
                  type="number"
                  step="5"
                  value={(layer.transform.position as [number, number, number])[idx]}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 0
                    store.updateLayer(layer.id, (l) => {
                      const pos = [...(l.transform.position as [number, number, number])] as [
                        number,
                        number,
                        number,
                      ]
                      pos[idx] = val
                      return { ...l, transform: { ...l.transform, position: pos } }
                    })
                  }}
                  className="w-full px-1.5 py-1 rounded bg-neutral-800 border border-neutral-700 text-neutral-100"
                />
              </label>
            ))}
          </div>
        )}

        {typeof layer.transform.opacity === 'number' && (
          <label className="block space-y-1">
            <div className="flex justify-between text-neutral-400">
              <span>Прозрачность</span>
              <span>{Math.round(layer.transform.opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={layer.transform.opacity}
              onChange={(e) =>
                store.updateLayer(layer.id, (l) => ({
                  ...l,
                  transform: { ...l.transform, opacity: Number(e.target.value) },
                }))
              }
              className="w-full accent-amber-400"
            />
          </label>
        )}
      </div>
    </div>
  )
}
