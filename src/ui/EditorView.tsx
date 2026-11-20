import React, { useEffect, useMemo, useRef } from 'react'
import { evaluateComposition } from '../core/evaluator'
import { ProjectStore } from '../core/store'
import { ViewportRenderer } from '../engine/ViewportRenderer'
import { createGalleryTemplate } from '../templates/gallery-template'
import { EditorShell } from './EditorShell'
import { useProjectStore } from './useProjectStore'

export const EditorView: React.FC = () => {
  const store = useMemo(() => new ProjectStore(createGalleryTemplate()), [])
  const state = useProjectStore(store)
  const comp = store.getActiveComposition()
  const evaluated = evaluateComposition(comp, state.currentTime)
  const viewportRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<ViewportRenderer | null>(null)

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const renderer = new ViewportRenderer(el)
    rendererRef.current = renderer
    ;(window as unknown as { __bootReady?: () => void }).__bootReady?.()
    const onResize = () => renderer.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      rendererRef.current = null
    }
  }, [])

  useEffect(() => {
    rendererRef.current?.render(evaluated, state.selectedLayerId)
  }, [evaluated, state.selectedLayerId])

  useEffect(() => {
    if (!state.playing) return
    let rafId = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const next = store.getState().currentTime + dt
      if (next >= comp.duration) {
        store.setTime(0)
      } else {
        store.setTime(next)
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [state.playing, comp.duration, store])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

      if (e.code === 'Space') {
        e.preventDefault()
        store.setPlaying(!store.getState().playing)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) store.redo()
        else store.undo()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const selectedId = store.getState().selectedLayerId
        if (!selectedId) return
        e.preventDefault()
        store.updateProject((project) => ({
          ...project,
          compositions: project.compositions.map((c) =>
            c.id === project.activeCompositionId
              ? { ...c, layers: c.layers.filter((l) => l.id !== selectedId) }
              : c,
          ),
        }))
        store.selectLayer(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [store])

  return (
    <EditorShell store={store}>
      <div
        ref={viewportRef}
        onClick={(e) => {
          const picked = rendererRef.current?.pickLayer(e.clientX, e.clientY) ?? null
          store.selectLayer(picked)
        }}
        className="relative border border-neutral-800 bg-neutral-950 overflow-hidden cursor-pointer"
        style={{
          aspectRatio: `${comp.width} / ${comp.height}`,
          maxHeight: '100%',
          maxWidth: '100%',
          width: comp.width >= comp.height ? '85%' : 'auto',
          height: comp.height > comp.width ? '85%' : 'auto',
        }}
      />
    </EditorShell>
  )
}
