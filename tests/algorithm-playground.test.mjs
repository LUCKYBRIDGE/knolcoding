import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// app.js is a browser script that expects React, ReactDOM and htm globals.
// Load it in a VM with inert stubs and read back the pure judging functions.
const gameDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'games', 'algorithm-playground');
const source = readFileSync(path.join(gameDir, 'app.js'), 'utf8');
const exportNames = [
  'evaluateRamen', 'evaluateRainyDay', 'getResultImage', 'getImageInfo',
  'generateRamenBuggySequence', 'generateRainyDayBuggySequence',
  'RAMEN_BLOCKS', 'RAINY_DAY_BLOCKS', 'TIME_OPTIONS'
];
const context = {
  React: { useState: () => [], useEffect: () => {}, useCallback: (fn) => fn, Fragment: 'Fragment', createElement: () => null },
  ReactDOM: { createRoot: () => ({ render: () => {} }) },
  htm: { bind: () => () => null },
  document: { getElementById: () => ({}) },
  Math,
};
vm.runInNewContext(`${source}\nglobalThis.__app = { ${exportNames.join(', ')} };`, context);
const app = context.__app;

const R = app.RAMEN_BLOCKS;
const wait = (seconds) => ({ ...R.waitBoil, seconds });
const ramen = (...blocks) => app.evaluateRamen(blocks.map((block) => ({ ...block })));
const rainy = (...ids) => app.evaluateRainyDay(ids.map((id) => ({ ...app.RAINY_DAY_BLOCKS[id] })));

test('라면: 물이 끓은 뒤 면을 넣고 3분 끓이면 완벽한 라면이다', () => {
  assert.equal(ramen(R.water, R.fire, wait(30), R.noodle, R.soup, wait(180), R.fireOff).resultType, 'perfect');
  assert.equal(ramen(R.water, R.soup, R.fire, wait(30), R.noodle, wait(180), R.fireOff).resultType, 'perfect');
});

test('라면: 물이 끓기 전이나 물보다 먼저 면을 넣으면 성공이 아니다', () => {
  for (const blocks of [
    [R.noodle, R.soup, R.water, R.fire, wait(210), R.fireOff],
    [R.water, R.noodle, R.soup, R.fire, wait(210), R.fireOff],
    [R.water, R.fire, R.noodle, R.soup, wait(210), R.fireOff],
  ]) {
    const result = ramen(...blocks);
    assert.equal(result.success, false, blocks.map((b) => b.id).join(','));
    assert.equal(result.resultType, 'noodle_before_boil');
  }
});

test('라면: 불을 끈 뒤 면을 넣어도 다시 불을 켜고 익히면 "익지 않았다"고 하지 않는다', () => {
  const result = ramen(R.water, R.soup, R.fire, wait(30), R.fireOff, R.noodle, R.fire, wait(180), R.fireOff);
  assert.notEqual(result.resultType, 'noodle_after_fireoff');
});

test('라면: 불을 먼저 켠 뒤 물과 면을 넣으면 빈 냄비가 아니라 탄 냄비 맛 면 물로 안내한다', () => {
  const result = ramen(R.fire, R.water, R.noodle);
  assert.equal(result.resultType, 'burnt_taste_noodle');
  assert.doesNotMatch(result.message, /빈 냄비/);
});

test('라면: 결과 설명이 실제 상태와 맞는다', () => {
  assert.doesNotMatch(ramen(R.water, R.fire, wait(360), R.noodle, R.soup).description, /면도 많이 불고/);
  assert.doesNotMatch(ramen(R.water, R.fire, wait(30), R.noodle, wait(30)).description, /면은 익었지만/);
  assert.doesNotMatch(ramen(R.water, R.fire, wait(600), R.noodle, R.fireOff, R.soup).description, /스프는 없지만/);
});

test('라면: 모든 결과에 실제 이미지 파일이 있다', () => {
  const seen = new Set();
  const ids = ['water', 'fire', 'noodle', 'soup', 'fireOff'];
  const visit = (sequence, remaining, waitsLeft) => {
    if (sequence.length) seen.add(app.evaluateRamen(sequence).resultType);
    for (const id of remaining) visit([...sequence, { ...R[id] }], remaining.filter((other) => other !== id), waitsLeft);
    if (waitsLeft > 0) for (const seconds of [30, 180, 300, 600]) visit([...sequence, wait(seconds)], remaining, waitsLeft - 1);
  };
  visit([], ids, 2);
  for (const resultType of seen) {
    const image = app.getResultImage(resultType);
    assert.ok(!image.endsWith('/emptypot.png'), `${resultType} falls back to the default image`);
    assert.ok(existsSync(path.join(gameDir, image)), `${resultType}: ${image} missing`);
  }
});

test('오류 수정 모드: 라면 예제는 모두 고칠 곳이 있다', () => {
  const original = context.Math.random;
  try {
    for (let pattern = 0; pattern < 5; pattern += 1) {
      context.Math.random = () => (pattern + 0.5) / 5;
      const sequence = app.generateRamenBuggySequence();
      assert.equal(app.evaluateRamen(sequence).success, false, `pattern ${pattern + 1}: ${sequence.map((b) => b.id + (b.seconds || '')).join(',')}`);
    }
  } finally {
    context.Math.random = original;
  }
});

test('오류 수정 모드: 등교 예제는 모두 고칠 곳이 있다', () => {
  const original = context.Math.random;
  try {
    for (let pattern = 0; pattern < 5; pattern += 1) {
      context.Math.random = () => (pattern + 0.5) / 5;
      const sequence = app.generateRainyDayBuggySequence();
      assert.equal(app.evaluateRainyDay(sequence).success, false, `pattern ${pattern + 1}: ${sequence.map((b) => b.id).join(',')}`);
    }
  } finally {
    context.Math.random = original;
  }
});

test('등교: 양말→운동화, 가방→비옷 순서면 성공하고 거꾸로면 실패한다', () => {
  assert.equal(rainy('socks', 'shoes', 'bag', 'raincoat').success, true);
  assert.equal(rainy('bag', 'raincoat', 'socks', 'shoes').success, true);
  assert.equal(rainy('shoes', 'socks', 'bag', 'raincoat').success, false);
  assert.equal(rainy('socks', 'shoes', 'raincoat', 'bag').success, false);
});
