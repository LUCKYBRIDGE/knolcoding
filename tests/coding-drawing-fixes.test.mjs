import assert from 'node:assert/strict';
import test from 'node:test';

import { getRequiredProblemBankModes } from '../games/coding-drawing/app.js';
import { ADVANCED_PROBLEM_MODES, createAdvancedProblemBank } from '../games/coding-drawing/advanced-problem-bank.js';
import { CommandEngine } from '../games/coding-drawing/command.js';
import { WorksheetGenerator } from '../games/coding-drawing/worksheet.js';

const levelsOf = mode => [createAdvancedProblemBank(mode)].flat(3).filter(Boolean);

test('최소 붓 이동: 선이 13칸 이상인 그림도 붓을 떼고 이동하는 경우를 계산한다', () => {
  // 붓 떼기를 고려하지 않던 이전 계산값은 괄호 안 값보다 컸다.
  const expected = {
    'debug 5 sparkle': 22, // 28
    'debug 5 cat-head': 21, // 22
    'debug 7 rocket': 24, // 25
    'debug 7 snail': 36, // 43
    'debug 7 anchor': 19, // 21
    'debug 7 key': 19, // 22
    'debug 7 leaf': 31, // 32
    'debug 9 pinwheel': 44, // 56
    'debug_guide 5 pinwheel': 22, // 28
    'debug_guide 7 rocket': 24, // 25
    'debug_guide 7 sparkle': 33, // 42
    'debug_guide 7 cat-head': 32, // 35
    'debug_guide 7 snail': 36, // 43
    'debug_guide 9 anchor': 24 // 28
  };
  const actual = {};
  for (const mode of ['debug', 'debug_guide']) {
    for (const level of levelsOf(mode)) actual[`${mode} ${level.gridSize} ${level.motifId}`] = level.minimumDrawingDistance;
  }
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value, key);
});

test('최소 붓 이동: 큰 그림도 선을 되짚기보다 붓을 떼고 이동하는 편이 짧으면 그 값을 쓴다', () => {
  // ㄷ자(12칸) + 위쪽 가운데 짧은 가지(1칸) = 13칸. 오른쪽 가운데에서 시작한다.
  // 완전탐색(작은 그림 계산을 20칸까지 넓혀 실행) 결과 17칸. 이전 계산은 20칸이었다.
  const points = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [3, 4], [2, 4], [1, 4], [0, 4]];
  const lines = points.slice(1).map(([x, y], index) => ({
    fromX: points[index][0], fromY: points[index][1], toX: x, toY: y
  }));
  lines.push({ fromX: 2, fromY: 0, toX: 2, toY: 1 });
  assert.equal(CommandEngine.getMinimumDrawingDistance({ x: 4, y: 2 }, lines), 17);
});

test('교육 모드: 미사일 활동은 단계별로 쓰는 문제은행을 모두 준비한다', () => {
  for (const mode of ['shortest', 'routing', 'efficiency']) {
    assert.deepEqual(
      [...getRequiredProblemBankModes(mode, 'education')].sort(),
      ['efficiency', 'routing', 'shortest'],
      mode
    );
  }
  assert.deepEqual(getRequiredProblemBankModes('shortest', 'stage'), ['shortest']);
});

test('활동지: 답 칸 수가 모범 답안 길이보다 모자라지 않다', () => {
  for (const mode of ['shortest', 'routing', 'chase']) {
    for (const level of levelsOf(mode)) {
      const problem = { ...level, modeType: mode };
      const slots = WorksheetGenerator.getAnswerSlotCount(problem);
      const needed = mode === 'chase'
        ? CommandEngine.analyzeChaseCapturePlans(level.starPos, level.thiefPos, level.thiefCommands, level.gridSize, level.obstacles || [], level.handcuffPos || null).earliestTurn
        : CommandEngine.analyzeShortestPaths(level.starPos, level.goalPos, level.gridSize, level.obstacles || []).distance;
      assert.ok(slots >= needed, `${mode} ${level.title}: ${slots} < ${needed}`);
      assert.ok(slots <= 24 && slots % 6 === 0, `${mode} ${level.title}: ${slots}`);
    }
  }
  assert.ok(ADVANCED_PROBLEM_MODES.includes('chase'));
});
