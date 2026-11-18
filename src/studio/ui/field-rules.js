/**
 * Правила «что показывать в инспекторе».
 *
 * Одни и те же разделы схемы есть у всех роликов, но не каждый параметр имеет
 * смысл в каждом кадре: у «Фона» нет подзаголовка, у «Фотопаузы» — нечего
 * вписывать в поля. Раньше эти условия были рассыпаны по разметке панели; здесь
 * они собраны в одном месте, поэтому левый список слоёв и правый инспектор
 * скрывают одно и то же и не расходятся.
 */

/** Разделы, у которых есть короткое пояснение в шапке. */
export const SECTION_NOTES = {
  fxStack: 'Эффекты работают поверх кадра любой композиции и попадают в видео. Ползунок 0 — эффект выключен.',
  partners: 'Исходные названия показывают встроенные золотые логотипы; можно загрузить свой SVG/PNG или ввести текст.',
  lab5_video: 'Каждый слот — один визит камеры к монолиту. Пустой слот оставляет плейсхолдер: видно, что источник не назначен.',
  caption: '«Вписать в поля» уменьшает строку по ширине до ориентировочных полей 5%; длинный текст проверьте вручную.',
  transition: 'Растворение при переключении ролика в просмотре; в запись одного ролика не попадает.',
  finale: 'Если этапы фразы не помещаются, они сокращаются. Увеличьте удержание или фазу ухода на таймлайне.',
  timeline: 'Длительности фаз цикла в секундах. Полный цикл — сумма всех фаз; пульт показывает те же числа.',
};

/** Разделы, которые вообще показываются у сцены. */
export function sectionAllowed(sceneId, sectionId, labSectionAllowed) {
  if (labSectionAllowed && labSectionAllowed(sceneId, sectionId) === false) return false;
  if ((sceneId === 'partners' || sceneId.startsWith('sponsor-')) && sectionId.startsWith('stage')) return true;
  if (sceneId.startsWith('sponsor-')) {
    return ['sponsor', 'partnersLight', 'typography', 'timeline', 'playback', 'transition'].includes(sectionId);
  }
  if (sceneId === 'partners') {
    return ['partners', 'partnersLight', 'typography', 'timeline', 'playback', 'transition'].includes(sectionId);
  }
  return true;
}

/** Поля, которые в этой сцене не имеют смысла. */
export function fieldHidden(sceneId, sectionId, field) {
  const key = field.key;
  if (sectionId === 'typography') {
    if (sceneId === 'brand' && /^(subtitle|date)/.test(key)) return true;
    if ((sceneId === 'photo-pause' || sceneId === 'partners') && key !== 'font') return true;
    if (sceneId === 'finale' && key.startsWith('date')) return true;
    return false;
  }
  if (sectionId === 'logo') {
    return ['waiting', 'photo-pause', 'finale'].includes(sceneId) && (key === 'swayAmount' || key === 'swaySpeed');
  }
  if (sectionId === 'caption') {
    if (sceneId === 'brand' && /^(subtitle|date)/.test(key)) return true;
    if (sceneId === 'finale' && key.startsWith('date')) return true;
    return false;
  }
  return false;
}

/** Та же сцена, но подпись поля другая: цвет надписи у «Фона» — исходный цвет. */
export function fieldLabel(sceneId, sectionId, field) {
  if (sectionId === 'photo' && sceneId === 'brand' && field.key === 'color') return 'Исходный цвет надписи';
  return field.label;
}

/**
 * «Глаз» слоя — поле, которым слой включается и выключается.
 * Быстрое переключение в левом списке не требует открывать инспектор.
 */
export function eyeKey(section) {
  const keys = section.fields.map((f) => f.key);
  if (keys.includes('enabled')) return 'enabled';
  return null;
}

/** Раздел, который открывается первым: у лабораторий — ролики, у остальных — надписи. */
export function defaultSection(sceneId, sections) {
  const preferred = sceneId.startsWith('lab5')
    ? ['lab5_text', 'lab5_video']
    : sceneId.startsWith('lab2')
      ? ['lab2_logo', 'lab2_title']
      : ['caption', 'logo', 'timeline'];
  for (const id of preferred) {
    if (sections.some((s) => s.id === id)) return id;
  }
  return sections[0]?.id || null;
}
