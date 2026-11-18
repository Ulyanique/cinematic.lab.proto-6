import test from 'node:test';
import assert from 'node:assert/strict';
import { extraTextDefaults, extraTextSections, extraTextOpacity, drawExtraTexts } from '../src/studio/extra-text.js';
import { build } from 'esbuild';
const built = await build({entryPoints:['src/studio/config.js'],bundle:true,format:'esm',platform:'node',write:false,loader:{'.svg':'text','.woff':'dataurl','.woff2':'dataurl','.css':'empty'}});
const { mergeConfig, parseConfigJSON } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].contents).toString('base64'));

test('extra text sections persist and merge independently', () => {
  const layer = {...extraTextDefaults(), text:'Моя надпись', x:300};
  const config = mergeConfig({timeline:{}}, {'extraText:abc':layer});
  assert.equal(extraTextSections(config)[0].id,'extraText:abc');
  assert.deepEqual(parseConfigJSON(JSON.stringify(config), {timeline:{}})['extraText:abc'], layer);
});
test('extra text animates with scene and is drawn on export canvas', () => {
  const timeline={startDelay:2,drawDuration:2,emergeDuration:0,holdDuration:3,fadeDuration:1,restDuration:1};
  assert.equal(extraTextOpacity(0,timeline),0);
  assert.equal(extraTextOpacity(3,timeline),1);
  assert.equal(extraTextOpacity(8,timeline),0);
  let printed=''; const ctx={save(){},restore(){},scale(){},fillText(t){printed=t;}};
  drawExtraTexts(ctx,3,{timeline,'extraText:a':{...extraTextDefaults(),text:'Привет'}},1920,1080);
  assert.equal(printed,'Привет');
});
