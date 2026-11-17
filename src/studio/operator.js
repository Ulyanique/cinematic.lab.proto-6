import { OUTPUT } from "./scenes/catalog.js";
import { SCENE_NAV } from "./scenes/nav.js";
import { isInteractiveTarget } from "./ui/dom.js";
import { icon } from "./ui/icons.js";
import {
  phaseValues, phaseSegments, timelineCursorPct, timeLabel, clampSeconds,
  phaseChange, boundaryChange, boundaryPct, MIN_PHASE, MIN_HOLD, MAX_CYCLE,
} from "./operator-timeline.js";

/** Не реагировать на обычную перемотку; автопереход только при пересечении шва воспроизведением. */
export function crossedBoundary(before, after, delay, cycle) {
  return cycle > 0 && after >= delay + cycle &&
    Math.floor((after - delay) / cycle) > Math.floor((Math.max(before, delay) - delay) / cycle);
}

/**
 * Пульт: одна строка под кадром.
 *
 * Здесь всё, что относится к времени ролика, — и ничего больше. Слева
 * транспорт, в середине полоса с тремя фазами и ручками границ, справа три
 * числовых поля: «Вход», «Удержание», «Уход». Раньше это были четыре строки
 * (заголовок с пультом и авто, полоса с подписями под ней, транспорт, цикл),
 * а фазы правились только перетаскиванием: узнать длительность входа было
 * нельзя, пока не наведёшь на границу.
 *
 * Фазы правятся и цифрами, и метками на полосе — это один и тот же путь
 * (`changePhase`), поэтому цифра и метка не могут разойтись.
 */
export function createOperatorControls({ getState, seek, setPhase, setDuration, togglePause }) {
  const panel = document.createElement("section");
  panel.className = "operator-panel";
  panel.setAttribute("aria-label", "Пульт: транспорт и фазы текущего ролика");

  // Подпись поля видна только при наведении на пульт (или фокусе в поле): в
  // строке из четырёх чисел подписи «Вход»/«Держ.»/«Уход»/«Цикл» занимали
  // больше места, чем сами числа, и всё время спорили с кадром.
  const field = (key, label, title, min, max) => `
    <label class="operator-field" data-field="${key}" title="${title}">
      <span class="operator-field-label">${label}</span>
      <input type="number" data-phase="${key}" min="${min}" max="${max}" step="0.1"
        inputmode="decimal" aria-label="${label}: ${title}">
    </label>`;

  panel.innerHTML = `
    <div class="operator-bar">
      <div class="operator-transport">
        <button type="button" data-action="play" class="operator-icon" title="Пауза или воспроизведение" aria-label="Пауза или воспроизведение">${icon("pause", 14)}</button>
        <button type="button" data-action="prev" class="operator-icon" title="Назад на кадр" aria-label="Назад на кадр">${icon("prev", 14)}</button>
        <button type="button" data-action="next" class="operator-icon" title="Вперёд на кадр" aria-label="Вперёд на кадр">${icon("next", 14)}</button>
        <output data-role="time" aria-live="off" title="Время внутри цикла и полная длительность"></output>
      </div>

      <div class="operator-timeline">
        <div class="operator-track">
          <div class="operator-phase-band" data-role="band" aria-hidden="true"></div>
          <div class="operator-marks" data-role="marks" aria-hidden="true"></div>
          <div class="operator-cursor" data-role="cursor" aria-hidden="true"></div>
          <input type="range" data-action="seek" min="0" step="0.0166666667" aria-label="Перемотка текущего ролика">
          <button type="button" class="operator-grip operator-grip-entry" data-edge="entry"
            role="slider" aria-label="Граница входа" title="Граница входа — потяните или задайте числом справа"></button>
          <button type="button" class="operator-grip operator-grip-exit" data-edge="exit"
            role="slider" aria-label="Граница выхода" title="Граница выхода — потяните или задайте числом справа"></button>
        </div>
        <div class="operator-legend" data-role="legend" aria-hidden="true"></div>
      </div>

      <div class="operator-phases-fields">
        ${field('entry', 'Вход', 'Длительность входа: прорисовка контура и появление из тени', MIN_PHASE, MAX_CYCLE)}
        ${field('hold', 'Держ.', 'Длительность удержания: собранная заставка в кадре', MIN_HOLD, MAX_CYCLE)}
        ${field('exit', 'Уход', 'Длительность ухода: тень и пауза перед следующим кругом', MIN_PHASE, MAX_CYCLE)}
        ${field('cycle', 'Цикл', 'Полная длительность цикла ролика', 1, MAX_CYCLE)}
      </div>

      <div class="operator-tail">
        <output data-role="media" class="operator-media" aria-live="polite" hidden></output>
        <button type="button" data-action="auto" class="operator-icon" aria-pressed="false"
          title="Автопоказ: ролики сменяются по кругу без ручного переключения"
          aria-label="Автопоказ роликов по кругу">${icon("repeat", 14)}</button>
        <button type="button" data-action="pin" aria-pressed="false" class="operator-icon" title="Не скрывать пульт (R)">${icon("pinOff", 14)}</button>
      </div>
    </div>`;
  document.body.appendChild(panel);

  const range = panel.querySelector('[data-action="seek"]');
  const bandEl = panel.querySelector('[data-role="band"]');
  const cursorEl = panel.querySelector('[data-role="cursor"]');
  const marksEl = panel.querySelector('[data-role="marks"]');
  const legendEl = panel.querySelector('[data-role="legend"]');
  const trackEl = panel.querySelector(".operator-track");
  const grips = [...panel.querySelectorAll(".operator-grip")];
  const timeEl = panel.querySelector('[data-role="time"]');
  const mediaEl = panel.querySelector('[data-role="media"]');
  const autoButton = panel.querySelector('[data-action="auto"]');
  const pinButton = panel.querySelector('[data-action="pin"]');
  const playButton = panel.querySelector('[data-action="play"]');
  const inputs = {
    entry: panel.querySelector('[data-phase="entry"]'),
    hold: panel.querySelector('[data-phase="hold"]'),
    exit: panel.querySelector('[data-phase="exit"]'),
    cycle: panel.querySelector('[data-phase="cycle"]'),
  };
  let auto = false, pinned = false, dragging = false, grabbing = null;

  let idleTimer;
  function awaken() {
    document.body.classList.remove("operator-idle");
    clearTimeout(idleTimer);
    if (!pinned) idleTimer = setTimeout(() => {
      if (!panel.contains(document.activeElement) && !document.body.classList.contains("ui-on"))
        document.body.classList.add("operator-idle");
    }, 3200);
  }
  document.addEventListener("pointermove", awaken, { passive: true });
  document.addEventListener("pointerdown", awaken, { passive: true });
  document.addEventListener("keydown", (event) => { if (event.code === "Tab") awaken(); });
  panel.addEventListener("focusin", awaken);
  panel.addEventListener("focusout", awaken);
  panel.addEventListener("pointerup", (event) => {
    if (event.target.closest("button, input[type=range]")) event.target.blur();
  });
  awaken();

  function localTime(state) {
    const elapsed = state.time - state.config.timeline.startDelay;
    return elapsed < 0 ? 0 : ((elapsed % state.cycle) + state.cycle) % state.cycle;
  }

  /**
   * Полоса фаз: сегменты входа, удержания и ухода с подписями под ними.
   * Разметка пересобирается только при смене пропорций: обновлять её каждый
   * кадр (60 раз в секунду) незачем.
   */
  let barKey = "";
  function renderBar(timeline) {
    const segments = phaseSegments(timeline);
    const key = segments.map((s) => `${s.key}:${s.startPct.toFixed(2)}:${s.endPct.toFixed(2)}`).join("|");
    if (key === barKey) return;
    barKey = key;
    if (!segments.length) {
      marksEl.replaceChildren();
      legendEl.replaceChildren();
      bandEl.style.background = "none";
      return;
    }
    // Заливка полосы: у каждой фазы свой тон, чтобы границы читались без цифр.
    const stops = [];
    for (const segment of segments) {
      const tint = segment.key === "entry" ? "rgba(255,214,140,.20)"
        : segment.key === "hold" ? "rgba(255,214,140,.09)" : "rgba(150,108,64,.16)";
      stops.push(`${tint} ${segment.startPct}%`, `${tint} ${segment.endPct}%`);
    }
    bandEl.style.background = `linear-gradient(90deg, ${stops.join(", ")})`;
    // Метки внутренних стадий: конец прорисовки, начало паузы.
    marksEl.replaceChildren(...segments.flatMap((segment) => segment.ticks.map((tick) => {
      const mark = document.createElement("span");
      mark.className = "operator-mark";
      mark.style.left = `${tick / segments[segments.length - 1].end * 100}%`;
      mark.title = `${segment.label} · до ${timeLabel(tick)} с`;
      return mark;
    })));
    // Подписи фаз: в строке их не видно — они проявляются при наведении на
    // пульт. Лежат они под полосой и не участвуют в раскладке, поэтому полоса
    // стоит ровно по центру кнопок, а не съезжает вверх на высоту текста.
    legendEl.replaceChildren(...segments.map((segment) => {
      const cell = document.createElement("span");
      cell.className = `operator-legend-item operator-legend-${segment.key}`;
      cell.style.left = `${segment.startPct}%`;
      cell.style.width = `${segment.widthPct}%`;
      cell.title = `${segment.label}: ${timeLabel(segment.seconds)} с (${timeLabel(segment.start)} → ${timeLabel(segment.end)})`;
      cell.textContent = segment.widthPct > 9
        ? `${segment.label} ${timeLabel(segment.seconds)}`
        : timeLabel(segment.seconds);
      return cell;
    }));
    for (const grip of grips) {
      grip.style.left = `${boundaryPct(timeline, grip.dataset.edge)}%`;
      grip.setAttribute("aria-valuetext", `${timeLabel(boundaryPct(timeline, grip.dataset.edge) / 100 * phaseValues(timeline).cycle)} с`);
    }
  }

  function refresh() {
    const state = getState();
    const max = Math.max(0, state.cycle - 1 / OUTPUT.fps);
    range.max = String(max);
    const local = localTime(state);
    if (!dragging) range.value = String(Math.min(local, max));
    renderBar(state.config.timeline);
    cursorEl.style.left = `${timelineCursorPct(local, state.config.timeline)}%`;
    timeEl.textContent = `${local.toFixed(2)} / ${state.cycle.toFixed(2)} с`;
    // Поля фаз: не перебиваем набор — пока в поле курсор, значение не трогаем.
    const values = phaseValues(state.config.timeline);
    for (const [key, input] of Object.entries(inputs)) {
      if (document.activeElement === input) continue;
      const value = key === "cycle" ? values.cycle : values[key];
      input.value = value.toFixed(1);
    }
    // Ролик-лаборатория живёт своим фильмом: длина сцены считается из него, и
    // правка «Держ.» отвязывает её от фильма до следующей правки его настроек.
    // Об этом честно написано в подсказке поля, а не спрятано в коде сцены.
    inputs.hold.title = state.ownDuration
      ? "Длительность удержания. У этого ролика длина задаётся его фильмом: правка здесь отвязывает её от фильма"
      : "Длительность удержания: собранная заставка в кадре";
    const paused = state.config.playback.paused;
    playButton.innerHTML = icon(paused ? "play" : "pause", 14);
    playButton.setAttribute("aria-label", paused ? "Продолжить" : "Пауза");
    playButton.title = paused ? "Продолжить (Space)" : "Пауза (Space)";
    const nav = SCENE_NAV.find((scene) => scene.id === state.id);
    panel.title = nav ? `${nav.code} · ${nav.label}` : state.id;
    // Источники фильма «Монолиты»: пустой слот — не ошибка рендера, а решение,
    // которое надо видеть. Показываем, сколько занято и что не открылось.
    const media = state.media;
    mediaEl.hidden = !media;
    if (media) {
      mediaEl.textContent = media.errors.length
        ? `ролики ${media.slots}/${media.total} · не открылось ${media.errors.length}`
        : `ролики ${media.slots}/${media.total}`;
      mediaEl.classList.toggle("is-error", media.errors.length > 0);
      mediaEl.title = media.errors.length
        ? `${media.errors.join("\n")}`
        : "Сколько слотов монолитов занято роликами из папки video/";
    }
    panel.classList.toggle("operator-busy", state.recording);
    for (const grip of grips) grip.disabled = state.recording;
    for (const input of Object.values(inputs)) input.disabled = state.recording;
  }

  function jump(value) {
    const state = getState();
    if (state.recording) return;
    const max = Math.max(0, state.cycle - 1 / OUTPUT.fps);
    seek(state.config.timeline.startDelay + Math.min(max, Math.max(0, value)));
    refresh();
  }

  /** Одна точка правки фаз: и перетаскивание, и число приходят сюда. */
  function applyTimeline(next) {
    if (!next) return false;
    if (setPhase?.(next) === false) return false;
    refresh();
    return true;
  }

  // ── ручки границ: тянуть мышью и править стрелками ────────────────────
  function grab(edge, event) {
    const state = getState();
    if (state.recording) return;
    const box = trackEl.getBoundingClientRect();
    if (box.width <= 0) return;
    const seconds = Math.min(state.cycle, Math.max(0, (event.clientX - box.left) / box.width * state.cycle));
    applyTimeline(boundaryChange(state.config.timeline, edge, seconds));
  }
  for (const grip of grips) {
    grip.addEventListener("pointerdown", (event) => {
      if (getState().recording) return;
      event.preventDefault();
      event.stopPropagation();
      grabbing = { edge: grip.dataset.edge, pointerId: event.pointerId };
      grip.classList.add("drag");
      // Захват указателя — удобство (тянуть за краем ручки), а не условие:
      // без активного указателя браузер бросает исключение, и это не ошибка.
      try { grip.setPointerCapture?.(event.pointerId); } catch (_) { /* нет захвата — тянем как есть */ }
      grab(grabbing.edge, event);
    });
    grip.addEventListener("pointermove", (event) => {
      if (!grabbing || grabbing.pointerId !== event.pointerId) return;
      event.preventDefault();
      grab(grabbing.edge, event);
    });
    const release = (event) => {
      if (!grabbing || grabbing.pointerId !== event.pointerId) return;
      grabbing = null;
      grip.classList.remove("drag");
      try { grip.releasePointerCapture?.(event.pointerId); } catch (_) { /* захвата не было */ }
    };
    grip.addEventListener("pointerup", release);
    grip.addEventListener("pointercancel", release);
    // Клавиатура: шаг кадром, с Shift — полсекунды.
    grip.addEventListener("keydown", (event) => {
      const state = getState();
      if (state.recording) return;
      if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") return;
      event.preventDefault();
      const values = phaseValues(state.config.timeline);
      const edge = grip.dataset.edge;
      const current = edge === "entry" ? values.entry : values.exit;
      const step = event.shiftKey ? 0.5 : 1 / OUTPUT.fps;
      const sign = event.code === "ArrowRight" ? 1 : -1;
      applyTimeline(phaseChange(state.config.timeline, edge, current + sign * step));
    });
  }

  // ── числовые поля фаз ────────────────────────────────────────────────
  for (const [key, input] of Object.entries(inputs)) {
    // Enter и уход из поля применяют значение; набранное «12.» не считается
    // ошибкой — просто ждём следующего ввода.
    const commit = () => {
      const state = getState();
      if (state.recording) return;
      if (key === "cycle") {
        const seconds = clampSeconds(input.value, 1, MAX_CYCLE);
        if (seconds === null) { refresh(); return; }
        setDuration?.(seconds);
        refresh();
        return;
      }
      const min = key === "hold" ? MIN_HOLD : MIN_PHASE;
      const seconds = clampSeconds(input.value, min, MAX_CYCLE);
      if (seconds === null) { refresh(); return; }
      applyTimeline(phaseChange(state.config.timeline, key, seconds));
    };
    input.addEventListener("change", commit);
    input.addEventListener("keydown", (event) => {
      if (event.code === "Enter") { event.preventDefault(); commit(); input.blur(); }
      if (event.code === "Escape") { event.preventDefault(); refresh(); input.blur(); }
      // Стрелки вверх/вниз в числовом поле уже меняют значение; после них
      // нужен коммит, иначе кадр ждёт ухода из поля.
      if (event.code === "ArrowUp" || event.code === "ArrowDown") {
        setTimeout(commit, 0);
      }
    });
  }

  panel.addEventListener("pointerdown", (event) => {
    if (event.target === range) dragging = true;
  });
  window.addEventListener("pointerup", () => { dragging = false; });
  range.addEventListener("input", () => jump(Number(range.value)));

  panel.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const state = getState();
    const action = button.dataset.action;
    if (action === "auto") {
      auto = !auto;
      autoButton.setAttribute("aria-pressed", String(auto));
      autoButton.classList.toggle("is-on", auto);
    } else if (action === "pin") {
      pinned = !pinned;
      pinButton.innerHTML = icon(pinned ? "pin" : "pinOff", 14);
      pinButton.setAttribute("aria-pressed", String(pinned));
      awaken();
    } else if (!state.recording && action === "play") {
      togglePause(); refresh();
    } else if (!state.recording && (action === "prev" || action === "next")) {
      jump(localTime(state) + (action === "next" ? 1 : -1) / OUTPUT.fps);
    }
  });

  window.addEventListener("keydown", (event) => {
    if (isInteractiveTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === "Space" && !getState().recording) {
      event.preventDefault(); togglePause(); refresh();
    }
    if (event.code === "KeyR") {
      pinned = !pinned;
      pinButton.innerHTML = icon(pinned ? "pin" : "pinOff", 14);
      pinButton.setAttribute("aria-pressed", String(pinned));
      awaken();
    }
    if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
      event.preventDefault();
      const state = getState();
      jump(localTime(state) + (event.code === "ArrowRight" ? 1 : -1) / OUTPUT.fps);
    }
  });

  refresh();
  return { get auto() { return auto; }, refresh, panel, awaken };
}
