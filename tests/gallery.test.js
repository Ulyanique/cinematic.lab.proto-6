import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const built = await build({entryPoints:['src/studio/scenes/gallery.js'],bundle:true,format:'esm',platform:'node',write:false,loader:{'.svg':'text','.woff':'dataurl','.woff2':'dataurl','.css':'empty'}});
const gallery = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].contents).toString('base64'));
import { END_T, FLASH_T, CLIP_T0, PANEL_BEFORE } from '../src/studio/gallery/config.ts';
import { sectionAllowed } from '../src/studio/ui/field-rules.js';
import { galleryFileFor, galleryNameFor, setGalleryFile, clearGalleryFile, gallerySlotIndex, _resetGalleryMemory } from '../src/studio/gallery-media.js';
import { GALLERY_BUILTIN, isBuiltinGalleryName, migrateGalleryBuiltinClips } from '../src/studio/gallery-defaults.js';

test('gallery defaults: ten builtin clips and film timeline', () => {
  const { GALLERY_DEFAULTS, GALLERY_SLOT_COUNT, GALLERY_ID } = gallery;
  assert.equal(GALLERY_ID, 'gallery');
  assert.equal(GALLERY_SLOT_COUNT, 10);
  assert.deepEqual(Object.keys(GALLERY_DEFAULTS.gallery_video), Array.from({length:10},(_,i)=>`slot${i}`));
  assert.deepEqual(Object.values(GALLERY_DEFAULTS.gallery_video),
    Array.from({length:10},(_,i)=>`${String(i+1).padStart(2,'0')}.mp4`));
  const tl = GALLERY_DEFAULTS.timeline;
  const total = tl.drawDuration + tl.emergeDuration + tl.holdDuration + tl.fadeDuration + tl.restDuration;
  assert.ok(Math.abs(total - END_T) < 1e-9, `total ${total} vs ${END_T}`);
  assert.ok(Math.abs(tl.drawDuration - (CLIP_T0 - PANEL_BEFORE)) < 1e-9);
  assert.ok(Math.abs(tl.drawDuration + tl.holdDuration - FLASH_T) < 1e-9);
  assert.equal(GALLERY_DEFAULTS.caption.titleVisible, false);
});

test('gallery sections are restricted to slots, timeline and effects', () => {
  for (const id of ['gallery_video','timeline','playback','transition','fxStack']) assert.equal(sectionAllowed('gallery', id), true, id);
  for (const id of ['caption','logo','background','partners']) assert.equal(sectionAllowed('gallery', id), false, id);
});

test('gallery media store keeps files in session memory', () => {
  _resetGalleryMemory();
  assert.equal(galleryFileFor(3), null);
  const file = { name: 'clip.mp4', type: 'video/mp4' };
  assert.equal(setGalleryFile(3, file), 'clip.mp4');
  assert.equal(galleryFileFor(3), file);
  assert.equal(galleryNameFor(3), 'clip.mp4');
  clearGalleryFile(3);
  assert.equal(galleryFileFor(3), null);
  assert.equal(gallerySlotIndex('slot7'), 7);
  assert.equal(gallerySlotIndex('other'), -1);
});

test('builtin gallery clips: migration fills only empty slots once', () => {
  assert.equal(GALLERY_BUILTIN.length, 10);
  assert.equal(GALLERY_BUILTIN[0], '01.mp4');
  assert.ok(isBuiltinGalleryName('06.mp4') && !isBuiltinGalleryName('clip.mp4'));
  const old = { gallery_video: { slot0: '', slot1: 'мой ролик.mp4', slot2: '   ' } };
  const next = migrateGalleryBuiltinClips(old);
  assert.equal(next.gallery_video.slot0, '01.mp4');
  assert.equal(next.gallery_video.slot1, 'мой ролик.mp4');
  assert.equal(next.gallery_video.slot2, '03.mp4');
  assert.equal(next.gallery_video.slot9, '10.mp4');
  assert.equal(migrateGalleryBuiltinClips({}).gallery_video.slot5, '06.mp4');
  assert.equal(old.gallery_video.slot0, '');
});
