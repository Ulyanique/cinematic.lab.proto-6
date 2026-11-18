import test from 'node:test';
import assert from 'node:assert/strict';
import { createPartnersCurtains } from '../src/studio/partners-curtains.js';
import { stageCurtainLayout } from '../src/studio/partners-stage.js';

test('GPU curtains preserve aspect and match canvas geometry on seek and reverse', () => {
  const curtains = createPartnersCurtains();
  const img = { naturalWidth: 476, naturalHeight: 1080 };
  for (const p of [0, .2, .7, 1, .7, .2, 0]) {
    curtains.update(img, p, 96, 1, true);
    const { x, imageWidth } = stageCurtainLayout(img, p, 1080, 96);
    assert.ok(Math.abs(curtains.left.position.x - (-1 + (x + imageWidth / 2) / 960)) < 1e-12);
    assert.equal(curtains.right.position.x, -curtains.left.position.x);
    assert.equal(curtains.left.scale.x, imageWidth / 960);
    assert.equal(curtains.right.scale.x, -imageWidth / 960);
  }
  curtains.update(img, .5, 96, 1, false);
  assert.equal(curtains.left.visible, false);
  assert.equal(curtains.right.visible, false);
  curtains.dispose();
});
