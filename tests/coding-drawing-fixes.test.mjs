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

test('정답지: 그림 문제의 예시 명령은 모든 문제에서 목표 그림을 정확히 그린다', () => {
  for (const mode of ['debug', 'debug_guide', 'single_stroke']) {
    for (const level of levelsOf(mode)) {
      const commands = CommandEngine.buildDrawingExampleCommands(level.starPos, level.targetLines);
      assert.equal(commands[0].dir, 'PEN_DOWN', `${mode} ${level.title}`);
      const result = CommandEngine.simulate(level.starPos, commands, level.gridSize, [], false);
      assert.equal(result.hitWall, false, `${mode} ${level.title}`);
      assert.equal(CommandEngine.compareLineFigures(result.lines, level.targetLines).isExactMatch, true, `${mode} ${level.title}`);
    }
  }
});

test('두 기준 비교: 최단 이동 예시와 최소 명령 예시가 실제로 그 기준을 만족한다', () => {
  for (const mode of ['shortest', 'routing']) {
    for (const level of levelsOf(mode)) {
      const c = CommandEngine.compareRouteRules(level.starPos, level.goalPos, level.gridSize, level.obstacles || []);
      const label = `${mode} ${level.title}`;
      assert.ok(c, label);
      const shortest = CommandEngine.simulate(level.starPos, c.shortestRouteCommands, level.gridSize, level.obstacles || []);
      const minimum = CommandEngine.simulate(level.starPos, c.minimumCommandRoute, level.gridSize, level.obstacles || []);
      for (const run of [shortest, minimum]) {
        assert.deepEqual(run.finalPos, level.goalPos, label);
        assert.equal(run.hitObstacle || run.hitWall, false, label);
      }
      assert.equal(c.shortestDistance, CommandEngine.getShortestDistance(level.starPos, level.goalPos, level.gridSize, level.obstacles || []), label);
      assert.equal(c.minimumCommandRoute.length, c.minimumCommandCount, label);
      assert.ok(c.minimumCommandRouteDistance >= c.shortestDistance, label);
      if (Number.isFinite(c.commandsOnShortestRoute)) assert.ok(c.minimumCommandCount <= c.commandsOnShortestRoute, label);
    }
  }
});

test('두 기준 비교: 답이 다른 문제에서는 결과창에 차이를 알려 준다', async () => {
  const { getMissileRuleComparisonNote } = await import('../games/coding-drawing/app.js');
  const routing = levelsOf('routing');
  const differing = routing.find(level => {
    const c = CommandEngine.compareRouteRules(level.starPos, level.goalPos, level.gridSize, level.obstacles || []);
    return Number.isFinite(c?.commandsOnShortestRoute) && c.minimumCommandCount < c.commandsOnShortestRoute;
  });
  assert.ok(differing, '장애물 문제 가운데 두 기준의 답이 다른 문제가 있어야 한다');
  assert.match(getMissileRuleComparisonNote(differing, 'shortest'), /최소 명령/);
  assert.match(getMissileRuleComparisonNote(differing, 'minimum_commands'), /최단 이동/);
});
