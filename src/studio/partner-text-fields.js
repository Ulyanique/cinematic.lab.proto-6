/** Текст хранится в разделе сцены; те же поля доступны прямо в слое кадра. */
export function partnerTextFields(sceneId, layerId) {
  const single = sceneId.startsWith('sponsor-');
  if (!single && sceneId !== 'partners') return [];
  const section = single ? 'sponsor' : 'partners';
  const keys = { stageTitle: 'title', stageSubtitle: 'subtitle', stageSponsorLabel: 'sponsorLabel',
    stageOrganizerLabel: 'organizerLabel', stageCoorganizerLabel: 'coorganizerLabel',
    stagePartnerLabel: 'partnerLabel', stagePartnerLabel2: 'partner2Label',
    stageOrganizer1: 'organizer1', stageOrganizer2: 'organizer2', stagePartner1: 'partner1', stagePartner2: 'partner2' };
  const key = keys[layerId];
  if (!key || (single && !['stageTitle', 'stageSubtitle', 'stageSponsorLabel'].includes(layerId))) return [];
  return [{key, sourceSection:section, type:'text', label: 'Текст', maxLength:120}];
}
