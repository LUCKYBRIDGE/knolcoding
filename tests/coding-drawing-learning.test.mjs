import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdvancedProblemBank } from '../games/coding-drawing/advanced-problem-bank.js';
import { CommandEngine } from '../games/coding-drawing/command.js';
import {
  PREDICT_BEFORE_RUN_STORAGE_KEY,
  createBuggyMissileProgram,
  formatGridCoordinateLabel,
  formatPredictionResultLine,
  getAdjacentDirections,
  getMissileReferenceSolution,
  isDebugProgramAvailable,
  isPredictBeforeRunAvailable,
  parsePredictBeforeRunSetting,
  serializePredictBeforeRunSetting
} from '../games/coding-drawing/learning-aids.js';

const levelsOf = mode => [createAdvancedProblemBank(mode)].flat(3).filter(Boolean);

function solves(level, commands) {
  const result = CommandEngine.simulate(level.starPos, commands, level.gridSize, level.obstacles || []);
  return !result.hitWall && !result.hitObstacle &&
    result.finalPos.x === level.goalPos.x && result.finalPos.y === level.goalPos.y;
}

function seededRandom(seed) {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

test('틀린 명령 고치기: 모든 미사일·장애물 문제에서 명령 하나만 틀린 프로그램을 만든다', () => {
  for (const mode of ['shortest', 'routing']) {
    const levels = levelsOf(mode);
    assert.ok(levels.length > 0, mode);
    for (const rule of ['shortest', 'minimum_commands']) {
      levels.forEach((level, levelIndex) => {
        for (const seed of [1, 7, 42]) {
          const label = `${mode} ${rule} ${level.gridSize} #${levelIndex} seed ${seed}`;
          const program = createBuggyMissileProgram(level, seededRandom(seed + levelIndex), { solutionRule: rule });
          assert.ok(program, label);
          const solution = getMissileReferenceSolution(level, rule);
          assert.deepEqual(program.solution, solution, label);
          assert.ok(solves(level, solution), `${label}: 정답이 성공해야 함`);
          assert.equal(program.commands.length, solution.length, label);

          const differing = program.commands
            .map((command, index) => (
              command.dir !== solution[index].dir || command.distance !== solution[index].distance ? index : -1
            ))
            .filter(index => index >= 0);
          assert.deepEqual(differing, [program.bugIndex], label);

          const buggy = program.commands[program.bugIndex];
          const original = solution[program.bugIndex];
          const isDistanceBug = buggy.dir === original.dir && Math.abs(buggy.distance - original.distance) === 1;
          const isDirectionBug = buggy.distance === original.distance && getAdjacentDirections(original.dir).includes(buggy.dir);
          assert.ok(isDistanceBug || isDirectionBug, label);
          assert.ok(buggy.distance >= 1, label);

          assert.equal(solves(level, program.commands), false, `${label}: 틀린 프로그램은 실패해야 함`);

          const restored = program.commands.map((command, index) => (
            index === program.bugIndex ? { ...original } : command
          ));
          assert.deepEqual(restored, solution, label);
          assert.ok(solves(level, restored), label);
        }
      });
    }
  }
});

test('틀린 명령 고치기: 최단 이동 기준의 정답은 최단 경로, 최소 명령 기준의 정답은 최소 명령 수다', () => {
  for (const mode of ['shortest', 'routing']) {
    for (const level of levelsOf(mode)) {
      const shortest = getMissileReferenceSolution(level, 'shortest');
      assert.equal(
        CommandEngine.expandToStepList(shortest).length,
        CommandEngine.getShortestDistance(level.starPos, level.goalPos, level.gridSize, level.obstacles || [])
      );
      const minimum = getMissileReferenceSolution(level, 'minimum_commands');
      assert.equal(
        minimum.length,
        CommandEngine.getMinimumCommandCount(level.starPos, level.goalPos, level.gridSize, level.obstacles || [])
      );
    }
  }
});

test('틀린 명령 고치기: 바꾼 방향이 앞뒤 명령과 같아져 한 묶음으로 보이는 후보는 쓰지 않는다', () => {
  for (const mode of ['shortest', 'routing']) {
    for (const level of levelsOf(mode)) {
      for (let seed = 1; seed <= 5; seed += 1) {
        const { commands } = createBuggyMissileProgram(level, seededRandom(seed));
        for (let index = 1; index < commands.length; index += 1) {
          assert.notEqual(commands[index].dir, commands[index - 1].dir);
        }
      }
    }
  }
});

test('틀린 명령 고치기: 정답을 만들 수 없는 문제는 null을 돌려준다', () => {
  assert.equal(createBuggyMissileProgram({}), null);
  assert.equal(createBuggyMissileProgram({
    gridSize: 5,
    starPos: { x: 0, y: 0 },
    goalPos: { x: 4, y: 4 },
    obstacles: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]
  }), null);
});

test('학습 보조 표시 조건: 미사일 두 활동의 일반 플레이에서만 켜고 지정한 도전 방식은 뺀다', () => {
  for (const mode of ['shortest', 'routing']) {
    for (const type of ['stage', 'random', 'timeattack', 'infinite']) {
      assert.equal(isDebugProgramAvailable(mode, type), true, `${mode} ${type}`);
    }
    assert.equal(isDebugProgramAvailable(mode, 'multisolution'), false);
    assert.equal(isDebugProgramAvailable(mode, 'education'), false);
    for (const type of ['stage', 'random', 'infinite', 'multisolution']) {
      assert.equal(isPredictBeforeRunAvailable(mode, type), true, `${mode} ${type}`);
    }
    assert.equal(isPredictBeforeRunAvailable(mode, 'timeattack'), false);
    assert.equal(isPredictBeforeRunAvailable(mode, 'education'), false);
  }
  for (const mode of ['efficiency', 'debug', 'debug_guide', 'single_stroke', 'creator', 'chase', 'custom']) {
    assert.equal(isDebugProgramAvailable(mode, 'stage'), false, mode);
    assert.equal(isPredictBeforeRunAvailable(mode, 'stage'), false, mode);
  }
});

test('좌표 라벨: 모눈종이 축 라벨처럼 가운데가 (0, 0)이고 오른쪽·위가 +다', () => {
  assert.equal(formatGridCoordinateLabel({ x: 2, y: 2 }, 5), '(0, 0)');
  assert.equal(formatGridCoordinateLabel({ x: 0, y: 0 }, 5), '(-2, +2)');
  assert.equal(formatGridCoordinateLabel({ x: 4, y: 4 }, 5), '(+2, -2)');
  assert.equal(formatGridCoordinateLabel({ x: 10, y: 3 }, 11), '(+5, +2)');
  assert.equal(formatGridCoordinateLabel({ x: 3, y: 6 }, 7), '(0, -3)');

  assert.equal(
    formatPredictionResultLine({ x: 4, y: 0 }, { x: 4, y: 0 }, 5),
    '🔮 예측: (+2, +2) → 실제: (+2, +2) — 맞혔어요!'
  );
  assert.equal(
    formatPredictionResultLine({ x: 1, y: 1 }, { x: 3, y: 2 }, 5),
    '🔮 예측: (-1, +1) → 실제: (+1, 0) — 다르게 멈췄어요. 어느 명령에서 달라졌는지 살펴보세요.'
  );
});

test('예측 설정 저장: 새 키를 쓰고 잘못된 저장값은 꺼짐으로 읽는다', () => {
  assert.equal(PREDICT_BEFORE_RUN_STORAGE_KEY, 'coding-drawing:predict-before-run:v1');
  assert.equal(parsePredictBeforeRunSetting(serializePredictBeforeRunSetting(true)), true);
  assert.equal(parsePredictBeforeRunSetting(serializePredictBeforeRunSetting(false)), false);
  for (const raw of [null, undefined, '', '{', 'yes', '1', '"true"', '{"enabled":true}', 1, true]) {
    assert.equal(parsePredictBeforeRunSetting(raw), false, String(raw));
  }
  assert.equal(serializePredictBeforeRunSetting('true'), 'false');
});
