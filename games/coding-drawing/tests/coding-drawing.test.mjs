import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  ACTIVITY_MODES,
  App,
  CHALLENGE_TYPES,
  LEARNING_MODE_GROUPS,
  MAX_COMMAND_COUNT,
  MAX_COMMAND_DISTANCE,
  MISSILE_SOLUTION_RULES,
  PRESET_LEVELS,
  appendDirectionCommand,
  appendPenCommand,
  assessFixedDrawingExecution,
  assessMinimumCommandAttempt,
  buildRandomProblemBag,
  buildFixedDrawingActionPlan,
  classifyChaseCatchOutcome,
  classifyDrawingOutcome,
  getDrawingSuccessResultCopy,
  assessRouteAttempt,
  classifyMissileOutcome,
  compressAdjacentCommands,
  formatCommandCombination,
  getActiveMissileSolutionRule,
  getLevelsForGridSize,
  getLearningModeForActivity,
  getMultiSolutionGoalCount,
  getNextProblemButtonLabel,
  getObstacleMapType,
  getRandomChallengeTargetCount,
  getEducationAdvancePlan,
  getEducationProblemComplexity,
  compareEducationProblemComplexity,
  getChallengeModeHint,
  ensurePresetProblemBankMode,
  getRequiredProblemBankModes,
  getRouteSolutionSignature,
  getSupportedChallengeTypesForMode,
  getSupportedGridSizesForMode,
  partitionLevelsByObstacle,
  prepareEfficiencyLevel,
  reorderCommandList,
  chooseEducationSessionProblemKeys
} from '../app.js';
import {
  ADVANCED_PROBLEM_MODES,
  createAdvancedProblemBank
} from '../advanced-problem-bank.js';
import { expandPresetProblemBank } from '../problem-bank-expansion.js';
import { CommandEngine, DIRECTIONS } from '../command.js';
import {
  EDUCATION_LESSONS,
  EDUCATION_TOOL_POLICIES,
  PATTERN_EDUCATION_LEVELS,
  buildEducationLevelPool,
  buildEducationProblemBank,
  getEducationLesson,
  getEducationToolPolicy,
  isPatternEducationLesson
} from '../education-mode.js';
import {
  DRAWING_EDUCATION_LESSONS,
  DRAWING_EDUCATION_TOOL_POLICIES,
  analyzeMinimumDrawingCommands,
  assessDrawingEducationAttempt,
  buildDrawingEducationLevelPool,
  buildDrawingEducationProblemBank,
  getDrawingEducationLesson,
  getDrawingEducationToolPolicy,
  getDrawingRouteSignature
} from '../drawing-education-mode.js';
import {
  analyzeMinimumCommandBlockCode,
  assessCommandBlockUsage,
  assessOrderedFuelStops,
  expandCommandBlockProgram,
  normalizeMoveCommands
} from '../pattern-engine.js';
import {
  DRAWING_GRID_SIZES,
  DRAWING_MINIMUM_SPANS,
  OBSTACLE_COUNT_LIMITS,
  ROUTING_MAXIMUM_PATH_COUNTS
} from '../advanced-problem-bank.js';
import { Encoder } from '../encoder.js';
import { calculateCanvasShellSize, GridRenderer } from '../grid.js';
import { WorksheetGenerator } from '../worksheet.js';

function getDrawingVisualQuality(level) {
  const pointKey = point => `${point.x},${point.y}`;
  const edgeKey = (from, to) => [pointKey(from), pointKey(to)].sort().join('|');
  const uniqueEdges = new Map();
  for (const line of CommandEngine.expandLinesToUnitSteps(level.targetLines)) {
    const edge = {
      from: { x: line.fromX, y: line.fromY },
      to: { x: line.toX, y: line.toY }
    };
    uniqueEdges.set(edgeKey(edge.from, edge.to), edge);
  }
  const edges = [...uniqueEdges.values()];
  const points = edges.flatMap(edge => [edge.from, edge.to]);
  const width = (
    Math.max(...points.map(point => point.x)) -
    Math.min(...points.map(point => point.x)) + 1
  );
  const height = (
    Math.max(...points.map(point => point.y)) -
    Math.min(...points.map(point => point.y)) + 1
  );
  let ambiguousCrossings = 0;
  for (let firstIndex = 0; firstIndex < edges.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < edges.length; secondIndex++) {
      const first = edges[firstIndex];
      const second = edges[secondIndex];
      const firstDiagonal = (
        Math.abs(first.to.x - first.from.x) === 1 &&
        Math.abs(first.to.y - first.from.y) === 1
      );
      const secondDiagonal = (
        Math.abs(second.to.x - second.from.x) === 1 &&
        Math.abs(second.to.y - second.from.y) === 1
      );
      const firstEndpoints = new Set([pointKey(first.from), pointKey(first.to)]);
      if (
        firstDiagonal &&
        secondDiagonal &&
        !firstEndpoints.has(pointKey(second.from)) &&
        !firstEndpoints.has(pointKey(second.to)) &&
        first.from.x + first.to.x === second.from.x + second.to.x &&
        first.from.y + first.to.y === second.from.y + second.to.y
      ) {
        ambiguousCrossings++;
      }
    }
  }
  return { width, height, ambiguousCrossings };
}

test('movement commands contain exactly eight non-stationary directions', () => {
  assert.equal(Object.keys(DIRECTIONS).length, 8);
  assert.equal(
    Object.values(DIRECTIONS).every(direction => direction.dx !== 0 || direction.dy !== 0),
    true
  );
});

test('advanced problem banks can be prepared one activity at a time without changing counts', () => {
  const expectedCounts = {
    efficiency: 20,
    shortest: 20,
    routing: 40,
    debug: 45,
    debug_guide: 45,
    single_stroke: 31,
    chase: 40
  };
  assert.deepEqual(new Set(ADVANCED_PROBLEM_MODES), new Set(Object.keys(expectedCounts)));
  for (const mode of ADVANCED_PROBLEM_MODES) {
    assert.equal(createAdvancedProblemBank(mode).length, expectedCounts[mode], mode);
    assert.equal(ensurePresetProblemBankMode(mode), false, `${mode}: node tests already expanded it`);
  }

  const isolatedBrowserBank = {};
  expandPresetProblemBank(isolatedBrowserBank, ['single_stroke']);
  assert.equal(isolatedBrowserBank.single_stroke.length, expectedCounts.single_stroke);
  assert.deepEqual(Object.keys(isolatedBrowserBank), ['single_stroke']);
});

test('lazy browser loading prepares both drawing banks before opening drawing education', () => {
  assert.deepEqual(
    getRequiredProblemBankModes('debug', 'education'),
    ['debug', 'debug_guide']
  );
  assert.deepEqual(getRequiredProblemBankModes('debug', 'stage'), ['debug']);

  const appUrl = new URL('../app.js', import.meta.url).href;
  const script = `
    globalThis.document = { readyState: 'loading' };
    globalThis.window = { addEventListener() {} };
    const module = await import(${JSON.stringify(appUrl + '?drawing-education-lazy-test')});
    const app = Object.create(module.App.prototype);
    Object.assign(app, {
      currentMode: 'debug',
      challengeType: 'education',
      selectedEducationLesson: 'draw_sequence',
      selectedGridSize: 5,
      educationProblemBankCache: new Map()
    });
    let valid = true;
    for (const lessonId of ['draw_sequence', 'draw_methods', 'draw_minimum_commands']) {
      for (const gridSize of [5, 7, 9]) {
        app.selectedEducationLesson = lessonId;
        app.selectedGridSize = gridSize;
        const bank = app.getEducationProblemBank();
        valid &&= bank.length >= 8 && bank.every(level => (
          level.educationLesson === lessonId &&
          Array.isArray(level.targetLines) &&
          level.targetLines.length > 0 &&
          !level.goalPos &&
          !level.thiefPos
        ));
      }
    }
    if (!valid) process.exitCode = 1;
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8'
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);
});

test('canvas shell fits both the card width and remaining viewport height', () => {
  assert.equal(calculateCanvasShellSize({
    viewportHeight: 818,
    cardInnerWidth: 700,
    toolbarHeight: 68,
    contentBeforeHeight: 116,
    cardVerticalPadding: 48,
    shellHorizontalPadding: 20
  }), 576);

  assert.equal(calculateCanvasShellSize({
    viewportHeight: 767,
    cardInnerWidth: 330,
    toolbarHeight: 82,
    contentBeforeHeight: 112,
    cardVerticalPadding: 24,
    shellHorizontalPadding: 12
  }), 330);

  assert.equal(calculateCanvasShellSize({
    viewportHeight: 291,
    cardInnerWidth: 270,
    toolbarHeight: 62,
    contentBeforeHeight: 74,
    cardVerticalPadding: 12,
    shellHorizontalPadding: 8
  }), 133);

  assert.equal(calculateCanvasShellSize({
    viewportHeight: 595,
    cardInnerWidth: 500,
    toolbarHeight: 68,
    contentBeforeHeight: 420,
    cardVerticalPadding: 32,
    shellHorizontalPadding: 20,
    minimumReadableSize: 300
  }), 300);
});

test('detached worksheet canvases initialize at their requested high resolution', () => {
  const context = new Proxy({}, {
    get(target, property) {
      if (!(property in target)) target[property] = () => {};
      return target[property];
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    }
  });
  const canvas = {
    width: 800,
    height: 800,
    clientWidth: 0,
    clientHeight: 0,
    parentElement: null,
    style: { width: '400px', height: '400px' },
    getContext: () => context
  };

  const renderer = new GridRenderer(canvas);

  assert.equal(canvas.width, 800);
  assert.equal(canvas.height, 800);
  assert.equal(canvas.style.width, '400px');
  assert.equal(canvas.style.height, '400px');
  assert.equal(renderer.padding, 40);
  assert.equal(renderer.cellSize, (400 - 80) / 6);
});

test('activity and challenge choices use separate complete mode lists', () => {
  assert.deepEqual(ACTIVITY_MODES, [
    'efficiency',
    'shortest',
    'routing',
    'debug',
    'debug_guide',
    'single_stroke',
    'creator',
    'chase'
  ]);
  assert.deepEqual(CHALLENGE_TYPES, [
    'stage',
    'education',
    'random',
    'timeattack',
    'infinite',
    'multisolution'
  ]);
  assert.deepEqual(getSupportedChallengeTypesForMode('shortest'), CHALLENGE_TYPES);
  assert.deepEqual(getSupportedChallengeTypesForMode('routing'), CHALLENGE_TYPES);
  assert.deepEqual(getSupportedChallengeTypesForMode('debug'), [
    'stage',
    'education',
    'random',
    'timeattack',
    'infinite'
  ]);
  assert.deepEqual(getSupportedChallengeTypesForMode('single_stroke'), [
    'stage',
    'random',
    'timeattack',
    'infinite'
  ]);

  for (const mode of ACTIVITY_MODES) {
    if (mode === 'creator') continue;
    assert.ok(PRESET_LEVELS[mode]?.length > 0, `${mode}: selectable activity has no levels`);
  }
});

test('missile education preserves the existing modes and exposes the seven-step curriculum', () => {
  assert.deepEqual(
    EDUCATION_LESSONS.map(lesson => ({
      id: lesson.id,
      title: lesson.title,
      sizes: [...lesson.sizes]
    })),
    [
      { id: 'sequence', title: '순서대로 움직이기', sizes: [5, 7] },
      { id: 'routes', title: '여러 길 찾아보기', sizes: [5, 7] },
      { id: 'compress', title: '같은 방향 명령 묶기', sizes: [5, 7] },
      { id: 'shortest', title: '가장 짧은 길 찾기', sizes: [5, 7] },
      { id: 'minimum', title: '가장 적은 명령으로 가기', sizes: [5, 7] },
      { id: 'block_one', title: '나만의 명령 블록 만들기', sizes: [9] },
      { id: 'block_two', title: '명령 블록 A·B 조합하기', sizes: [11] }
    ]
  );
  assert.equal(getEducationLesson('missing').id, 'sequence');
  assert.equal(isPatternEducationLesson('block_one'), true);
  assert.equal(isPatternEducationLesson('minimum'), false);
  assert.ok(ACTIVITY_MODES.includes('shortest'));
  assert.ok(ACTIVITY_MODES.includes('routing'));
});

test('drawing education exposes three focused lessons without changing the original activities', () => {
  assert.deepEqual(
    DRAWING_EDUCATION_LESSONS.map(lesson => ({
      id: lesson.id,
      title: lesson.title,
      sizes: [...lesson.sizes]
    })),
    [
      { id: 'draw_sequence', title: '순서대로 그림 그리기', sizes: [5, 7, 9] },
      { id: 'draw_methods', title: '같은 그림, 다른 방법으로 그리기', sizes: [5, 7, 9] },
      { id: 'draw_minimum_commands', title: '가장 적은 명령으로 그림 그리기', sizes: [5, 7, 9] }
    ]
  );
  assert.equal(getDrawingEducationLesson('missing').id, 'draw_sequence');
  assert.ok(ACTIVITY_MODES.includes('debug'));
  assert.ok(ACTIVITY_MODES.includes('debug_guide'));
  assert.deepEqual(getSupportedGridSizesForMode('debug'), [5, 7, 9]);
});

test('education advances through each lesson before moving to the next lesson', () => {
  const lessons = DRAWING_EDUCATION_LESSONS;
  assert.deepEqual(
    getEducationAdvancePlan({
      lessons,
      lessonId: 'draw_sequence',
      levelIndex: 3,
      poolLength: 5
    }),
    { type: 'problem', nextLesson: lessons[0], nextLevelIndex: 4 }
  );
  assert.deepEqual(
    getEducationAdvancePlan({
      lessons,
      lessonId: 'draw_sequence',
      levelIndex: 4,
      poolLength: 5
    }),
    { type: 'lesson', nextLesson: lessons[1], nextLevelIndex: 0 }
  );
  assert.deepEqual(
    getEducationAdvancePlan({
      lessons,
      lessonId: 'draw_minimum_commands',
      levelIndex: 4,
      poolLength: 5
    }),
    { type: 'complete', nextLesson: null, nextLevelIndex: 0 }
  );
});

test('finishing an education lesson loads the next lesson instead of cycling its first problem', () => {
  const app = Object.create(App.prototype);
  let loadedCount = 0;
  let statusMessage = '';
  Object.assign(app, {
    selectedEducationLesson: 'draw_sequence',
    selectedGridSize: 5,
    educationLevelIndex: 4,
    educationLessonSelections: { drawing: 'draw_sequence' },
    getActiveEducationLessons: () => DRAWING_EDUCATION_LESSONS,
    getEducationLearningMode: () => 'drawing',
    getEducationLevelPool: () => Array.from({ length: 5 }),
    resetEducationWorkspace: () => {},
    updateGridSizeControl: () => {},
    updateEducationCurriculumUI: () => {},
    updateModeHierarchySummary: () => {},
    loadLevel: () => { loadedCount += 1; },
    setStatus: message => { statusMessage = message; }
  });

  const nextLessonPlan = app.advanceEducationProblem();
  assert.equal(nextLessonPlan.type, 'lesson');
  assert.equal(app.selectedEducationLesson, 'draw_methods');
  assert.equal(app.educationLessonSelections.drawing, 'draw_methods');
  assert.equal(app.educationLevelIndex, 0);
  assert.equal(loadedCount, 1);

  app.selectedEducationLesson = 'draw_methods';
  app.educationLevelIndex = 4;
  const minimumCommandPlan = app.advanceEducationProblem();
  assert.equal(minimumCommandPlan.type, 'lesson');
  assert.equal(app.selectedEducationLesson, 'draw_minimum_commands');
  assert.equal(app.educationLessonSelections.drawing, 'draw_minimum_commands');
  assert.equal(app.educationLevelIndex, 0);
  assert.equal(loadedCount, 2);

  app.selectedEducationLesson = 'draw_minimum_commands';
  app.educationLevelIndex = 4;
  const completePlan = app.advanceEducationProblem();
  assert.equal(completePlan.type, 'complete');
  assert.equal(loadedCount, 2);
  assert.match(statusMessage, /모두 마쳤어요/);
});

test('drawing education keeps later lessons locked until the prior lesson is complete', () => {
  const app = Object.create(App.prototype);
  Object.assign(app, {
    educationCompletedLessons: { drawing: new Set() },
    getEducationLearningMode: () => 'drawing'
  });

  assert.equal(app.isEducationLessonUnlocked('draw_sequence'), true);
  assert.equal(app.isEducationLessonUnlocked('draw_methods'), false);
  assert.equal(app.isEducationLessonUnlocked('draw_minimum_commands'), false);

  app.markEducationLessonComplete('draw_sequence');
  assert.equal(app.isEducationLessonUnlocked('draw_methods'), true);
  assert.equal(app.isEducationLessonUnlocked('draw_minimum_commands'), false);

  app.markEducationLessonComplete('draw_methods');
  assert.equal(app.isEducationLessonUnlocked('draw_minimum_commands'), true);
});

test('every drawing education lesson has five verified problems at each supported size', () => {
  for (const lesson of DRAWING_EDUCATION_LESSONS) {
    for (const gridSize of lesson.sizes) {
      const levels = buildDrawingEducationLevelPool(
        PRESET_LEVELS,
        lesson.id,
        gridSize
      );
      assert.equal(levels.length, 5, `${lesson.id}/${gridSize}: five problems required`);
      for (const level of levels) {
        assert.equal(level.gridSize, gridSize);
        assert.equal(level.educationLesson, lesson.id);
        assert.equal(
          CommandEngine.compareLineFigures([], level.targetLines).targetCount > 0,
          true
        );
        const minDistance = CommandEngine.getMinimumDrawingDistance(level.starPos, level.targetLines);
        if (lesson.id !== 'draw_minimum_commands' && Number.isFinite(minDistance)) {
          assert.equal(level.minimumDrawingDistance, minDistance, level.title);
        }
        assert.equal(Number.isFinite(level.minimumDrawingDistance), true, level.title);
        assert.equal(
          getDrawingEducationToolPolicy(level, lesson.id).allowPenControls,
          lesson.id === 'draw_minimum_commands',
          `${level.title}: only the minimum-command lesson opens pen controls`
        );
      }
    }
  }
});

test('drawing sequence lessons require the displayed one-step direction order', () => {
  for (const gridSize of [5, 7, 9]) {
    for (const level of buildDrawingEducationLevelPool(
      PRESET_LEVELS,
      'draw_sequence',
      gridSize
    )) {
      const commands = [{ dir: 'PEN_DOWN', distance: 1 }, ...level.referenceCommands];
      const result = CommandEngine.simulate(
        level.starPos,
        commands,
        level.gridSize,
        [],
        false
      );
      const assessment = assessDrawingEducationAttempt(
        level,
        commands,
        result
      );
      assert.equal(result.hitWall, false, level.title);
      assert.equal(assessment.isExactMatch, true, level.title);
      assert.equal(assessment.meetsLessonRule, true, level.title);
      assert.equal(
        assessment.signature,
        getDrawingRouteSignature(level.referenceCommands)
      );

      const penNoopCommands = [{ dir: 'PEN_DOWN' }, { dir: 'PEN_DOWN' }, ...level.referenceCommands];
      const penNoopResult = CommandEngine.simulate(
        level.starPos,
        penNoopCommands,
        level.gridSize,
        []
      );
      const penNoopAssessment = assessDrawingEducationAttempt(
        level,
        penNoopCommands,
        penNoopResult
      );
      assert.equal(penNoopAssessment.isExactMatch, true, level.title);
      assert.equal(penNoopAssessment.hasForbiddenPenControl, true, level.title);
      assert.equal(penNoopAssessment.meetsLessonRule, false, level.title);
    }
  }
});

test('drawing methods lessons prove two semantically different drawing paths', () => {
  for (const gridSize of [5, 7, 9]) {
    for (const level of buildDrawingEducationLevelPool(
      PRESET_LEVELS,
      'draw_methods',
      gridSize
    )) {
      const [reference, alternate] = level.witnesses;
      const referenceResult = CommandEngine.simulate(level.starPos, reference, gridSize, []);
      const alternateResult = CommandEngine.simulate(level.starPos, alternate, gridSize, []);
      const referenceAssessment = assessDrawingEducationAttempt(level, reference, referenceResult);
      const alternateAssessment = assessDrawingEducationAttempt(level, alternate, alternateResult);

      assert.equal(referenceAssessment.meetsLessonRule, true, level.title);
      assert.equal(alternateAssessment.meetsLessonRule, true, level.title);
      assert.notEqual(referenceAssessment.signature, alternateAssessment.signature, level.title);
      assert.notEqual(referenceAssessment.multisetSignature, alternateAssessment.multisetSignature, level.title);
      assert.notEqual(referenceAssessment.solutionSignature, alternateAssessment.solutionSignature, level.title);
      assert.notEqual(referenceAssessment.figureTraversalSignature, alternateAssessment.figureTraversalSignature, level.title);
      assert.equal(
        CommandEngine.compareLineFigures(alternateResult.lines, level.targetLines).isExactMatch,
        true,
        level.title
      );
      assert.equal(level.drawingTargetSolutionCount, 2);
      assert.ok(
        referenceAssessment.physicalDistance <= level.drawingMaximumDistance,
        level.title
      );
      assert.ok(
        alternateAssessment.physicalDistance <= level.drawingMaximumDistance,
        level.title
      );

      const splitCommands = CommandEngine.expandToStepList(reference)
        .map(dir => ({ dir, distance: 1 }));
      const splitResult = CommandEngine.simulate(level.starPos, splitCommands, gridSize, []);
      const splitAssessment = assessDrawingEducationAttempt(level, splitCommands, splitResult);
      assert.equal(splitAssessment.meetsLessonRule, true, level.title);
      assert.equal(splitAssessment.signature, referenceAssessment.signature, level.title);
      assert.equal(splitAssessment.normalizedRouteSignature, referenceAssessment.normalizedRouteSignature, level.title);
      assert.equal(splitAssessment.solutionSignature, referenceAssessment.solutionSignature, level.title);

      const lastStep = CommandEngine.expandToStepList(reference).at(-1);
      const lastVector = DIRECTIONS[lastStep];
      const reverseStep = Object.entries(DIRECTIONS).find(([, direction]) => (
        direction.dx === -lastVector.dx && direction.dy === -lastVector.dy
      ))?.[0];
      const retracedCommands = [
        ...reference,
        { dir: reverseStep, distance: 1 },
        { dir: lastStep, distance: 1 }
      ];
      const retracedResult = CommandEngine.simulate(level.starPos, retracedCommands, gridSize, []);
      const retracedAssessment = assessDrawingEducationAttempt(
        level,
        retracedCommands,
        retracedResult
      );
      assert.equal(retracedAssessment.isExactMatch, true, level.title);
      assert.equal(retracedAssessment.meetsLessonRule, true, level.title);
      assert.equal(
        retracedAssessment.figureTraversalSignature,
        referenceAssessment.figureTraversalSignature,
        `${level.title}: a final backtrack must remain the same meaningful method`
      );

      const penNoopCommands = [{ dir: 'PEN_DOWN' }, ...reference];
      const penNoopResult = CommandEngine.simulate(level.starPos, penNoopCommands, gridSize, []);
      const penNoopAssessment = assessDrawingEducationAttempt(level, penNoopCommands, penNoopResult);
      assert.equal(penNoopAssessment.isExactMatch, true, level.title);
      assert.equal(penNoopAssessment.hasForbiddenPenControl, true, level.title);
      assert.equal(penNoopAssessment.meetsLessonRule, false, level.title);
    }
  }
});

test('minimum-command drawing education has a proven queue-block witness and counts pen commands', () => {
  assert.equal(DRAWING_EDUCATION_TOOL_POLICIES.draw_minimum_commands.allowedDirections.length, 8);
  assert.equal(DRAWING_EDUCATION_TOOL_POLICIES.draw_minimum_commands.allowPenControls, true);
  for (const gridSize of [5, 7, 9]) {
    for (const level of buildDrawingEducationLevelPool(
      PRESET_LEVELS,
      'draw_minimum_commands',
      gridSize
    )) {
      const policy = getDrawingEducationToolPolicy(level, 'draw_minimum_commands');
      const result = CommandEngine.simulate(level.starPos, level.minimumCommandWitness, gridSize, [], false);
      const assessment = assessDrawingEducationAttempt(level, level.minimumCommandWitness, result);
      const analysis = analyzeMinimumDrawingCommands(level);
      const points = (CommandEngine.expandLinesToUnitSteps(level.targetLines) || [])
        .flatMap(line => [
          { x: line.fromX, y: line.fromY },
          { x: line.toX, y: line.toY }
        ]);
      const width = Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x)) + 1;
      const height = Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y)) + 1;
      assert.equal(policy.allowedDirections.length, 8);
      assert.equal(policy.allowPenControls, true, level.title);
      assert.ok(width >= DRAWING_MINIMUM_SPANS[gridSize], `${level.title}: drawing is too narrow`);
      assert.ok(height >= DRAWING_MINIMUM_SPANS[gridSize], `${level.title}: drawing is too short`);
      assert.equal(analysis.isValid, true, level.title);
      assert.equal(analysis.lowerBound, level.minimumCommandCount, level.title);
      assert.equal(assessment.commandCount, level.minimumCommandCount, level.title);
      assert.equal(assessment.physicalDistance, level.minimumDrawingDistance, level.title);
      assert.equal(
        level.minimumDrawingDistance,
        CommandEngine.getMinimumDrawingDistance(level.starPos, level.targetLines),
        level.title
      );
      assert.equal(assessment.meetsLessonRule, true, level.title);
      assert.equal(level.minimumCommandWitness[0].dir, 'PEN_DOWN', level.title);

      const penNoopCommands = [{ dir: 'PEN_UP' }, { dir: 'PEN_DOWN' }, ...level.minimumCommandWitness];
      const penNoopResult = CommandEngine.simulate(level.starPos, penNoopCommands, gridSize, []);
      const penNoopAssessment = assessDrawingEducationAttempt(level, penNoopCommands, penNoopResult);
      assert.equal(penNoopAssessment.isExactMatch, true, level.title);
      assert.equal(penNoopAssessment.hasForbiddenPenControl, false, level.title);
      assert.equal(penNoopAssessment.commandCount, level.minimumCommandCount + 2, level.title);
      assert.equal(penNoopAssessment.meetsLessonRule, false, level.title);

      const invalidCommands = [{ dir: 'NOT_A_DIRECTION' }, ...level.minimumCommandWitness];
      const invalidResult = CommandEngine.simulate(
        level.starPos,
        invalidCommands,
        gridSize,
        []
      );
      const invalidAssessment = assessDrawingEducationAttempt(level, invalidCommands, invalidResult);
      assert.equal(invalidAssessment.hasInvalidCommand, true, level.title);
      assert.equal(invalidAssessment.meetsLessonRule, false, level.title);

      const malformedAssessment = assessDrawingEducationAttempt(
        level,
        [null, ...level.minimumCommandWitness],
        result
      );
      assert.equal(malformedAssessment.hasInvalidCommand, true, level.title);
      assert.equal(malformedAssessment.meetsLessonRule, false, level.title);

      const wallCommands = [...level.minimumCommandWitness, { dir: 'RIGHT', distance: 99 }];
      const wallResult = CommandEngine.simulate(level.starPos, wallCommands, gridSize, []);
      const wallAssessment = assessDrawingEducationAttempt(level, wallCommands, wallResult);
      assert.equal(wallAssessment.hasUnsafeExecution, true, level.title);
      assert.equal(wallAssessment.meetsLessonRule, false, level.title);
    }
  }
});

test('minimum-command drawing includes disconnected figures that require lifting the pen', () => {
  const edgeKey = line => {
    const from = `${line.fromX},${line.fromY}`;
    const to = `${line.toX},${line.toY}`;
    return [from, to].sort().join('|');
  };
  const exactMinimumCommandCount = level => {
    const unitLines = CommandEngine.expandLinesToUnitSteps(level.targetLines);
    const segmentKeys = new Map(unitLines.map((line, index) => [edgeKey(line), index]));
    const completeMask = (1 << unitLines.length) - 1;
    const startState = {
      x: level.starPos.x,
      y: level.starPos.y,
      penDown: false,
      mask: 0,
      count: 0
    };
    const queue = [startState];
    const visited = new Set([`${startState.x},${startState.y}|false|0`]);
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      if (current.mask === completeMask) return current.count;
      for (const nextPenDown of [true, false]) {
        if (nextPenDown === current.penDown) continue;
        const key = `${current.x},${current.y}|${nextPenDown}|${current.mask}`;
        if (visited.has(key)) continue;
        visited.add(key);
        queue.push({ ...current, penDown: nextPenDown, count: current.count + 1 });
      }
      for (const direction of Object.values(DIRECTIONS)) {
        let x = current.x;
        let y = current.y;
        let mask = current.mask;
        for (let distance = 1; distance < level.gridSize; distance++) {
          const nextX = x + direction.dx;
          const nextY = y + direction.dy;
          if (nextX < 0 || nextX >= level.gridSize || nextY < 0 || nextY >= level.gridSize) break;
          if (current.penDown) {
            const edgeIndex = segmentKeys.get(edgeKey({ fromX: x, fromY: y, toX: nextX, toY: nextY }));
            if (!Number.isInteger(edgeIndex)) break;
            mask |= 1 << edgeIndex;
          }
          x = nextX;
          y = nextY;
          const key = `${x},${y}|${current.penDown}|${mask}`;
          if (visited.has(key)) continue;
          visited.add(key);
          queue.push({ x, y, penDown: current.penDown, mask, count: current.count + 1 });
        }
      }
    }
    return Number.POSITIVE_INFINITY;
  };

  for (const gridSize of [5, 7, 9]) {
    const levels = buildDrawingEducationLevelPool(
      PRESET_LEVELS,
      'draw_minimum_commands',
      gridSize
    );
    const disconnected = levels.filter(level => level.disconnectedComponentProof);
    assert.equal(disconnected.length, 1, `${gridSize}x${gridSize}`);
    const [level] = disconnected;
    assert.ok(level.minimumCommandWitness.some(command => command.dir === 'PEN_UP'));

    const witnessResult = CommandEngine.simulate(
      level.starPos,
      level.minimumCommandWitness,
      gridSize,
      [],
      false
    );
    const witnessAssessment = assessDrawingEducationAttempt(
      level,
      level.minimumCommandWitness,
      witnessResult
    );
    assert.equal(witnessAssessment.isExactMatch, true, level.title);
    assert.equal(witnessAssessment.meetsLessonRule, true, level.title);
    assert.equal(exactMinimumCommandCount(level), level.minimumCommandCount, level.title);

    const distance = level.minimumCommandWitness[1].distance;
    const airDistance = level.minimumCommandWitness[6].distance;
    const alternate = [
      { dir: 'PEN_DOWN', distance: 1 },
      { dir: 'DOWN', distance },
      { dir: 'RIGHT', distance },
      { dir: 'UP', distance },
      { dir: 'LEFT', distance },
      { dir: 'PEN_UP', distance: 1 },
      { dir: 'DOWN_RIGHT', distance: airDistance },
      { dir: 'PEN_DOWN', distance: 1 },
      { dir: 'DOWN', distance },
      { dir: 'RIGHT', distance },
      { dir: 'UP', distance },
      { dir: 'LEFT', distance }
    ];
    const alternateResult = CommandEngine.simulate(level.starPos, alternate, gridSize, [], false);
    const alternateAssessment = assessDrawingEducationAttempt(level, alternate, alternateResult);
    assert.equal(alternateAssessment.isExactMatch, true, level.title);
    assert.equal(alternateAssessment.meetsLessonRule, true, level.title);
    assert.notEqual(
      alternateAssessment.signature,
      witnessAssessment.signature,
      `${level.title}: minimum answers must not be limited to one route`
    );
  }
});

test('explicit drawing commands start with pen down and deleting it prevents drawing', () => {
  const level = buildDrawingEducationLevelPool(
    PRESET_LEVELS,
    'draw_minimum_commands',
    5
  )[0];
  const withoutInitialPen = level.minimumCommandWitness.slice(1);
  const result = CommandEngine.simulate(level.starPos, withoutInitialPen, 5, [], false);
  const assessment = assessDrawingEducationAttempt(level, withoutInitialPen, result);
  assert.equal(assessment.hasRequiredInitialPenDown, false);
  assert.equal(assessment.isExactMatch, false);
  assert.equal(assessment.meetsLessonRule, false);

  const app = Object.create(App.prototype);
  Object.assign(app, {
    currentMode: 'debug',
    challengeType: 'stage',
    currentLevel: level,
    drawSubmode: 'free',
    commands: []
  });
  assert.deepEqual(app.getDefaultDrawingCommands(), [{ dir: 'PEN_DOWN', distance: 1 }]);
  assert.equal(app.getCurrentPenState(), false);
  app.commands = app.getDefaultDrawingCommands();
  assert.equal(app.getCurrentPenState(), true);

  app.challengeType = 'education';
  app.selectedEducationLesson = 'draw_sequence';
  assert.deepEqual(app.getDefaultDrawingCommands(), [{ dir: 'PEN_DOWN', distance: 1 }]);
});

test('pen controls append after existing commands instead of jumping to the front', () => {
  const commands = [
    { dir: 'PEN_DOWN', distance: 1 },
    { dir: 'RIGHT', distance: 2 },
    { dir: 'PEN_UP', distance: 1 }
  ];
  assert.deepEqual(appendPenCommand(commands, 'PEN_DOWN'), [
    ...commands,
    { dir: 'PEN_DOWN', distance: 1 }
  ]);
  assert.deepEqual(appendPenCommand(commands, 'UNKNOWN'), commands);
  assert.notEqual(appendPenCommand(commands, 'PEN_DOWN'), commands);
});

test('command queues can be reordered without changing or losing command records', () => {
  const commands = [
    { dir: 'PEN_DOWN', distance: 1 },
    { dir: 'RIGHT', distance: 3 },
    { dir: 'UP', distance: 2 }
  ];
  assert.deepEqual(reorderCommandList(commands, 2, 1), [
    { dir: 'PEN_DOWN', distance: 1 },
    { dir: 'UP', distance: 2 },
    { dir: 'RIGHT', distance: 3 }
  ]);
  assert.deepEqual(commands, [
    { dir: 'PEN_DOWN', distance: 1 },
    { dir: 'RIGHT', distance: 3 },
    { dir: 'UP', distance: 2 }
  ]);
});

test('education progress survives a reload through validated local storage', () => {
  const previousWindow = globalThis.window;
  const records = new Map();
  globalThis.window = {
    localStorage: {
      getItem: key => records.get(key) ?? null,
      setItem: (key, value) => records.set(key, value)
    }
  };
  try {
    const app = Object.create(App.prototype);
    Object.assign(app, {
      currentMode: 'debug',
      challengeType: 'education',
      selectedEducationLesson: 'draw_methods',
      selectedGridSize: 7,
      educationLevelIndex: 3,
      educationLessonSelections: { missile: 'sequence', drawing: 'draw_methods' },
      educationCompletedLessons: { missile: new Set(['sequence']), drawing: new Set(['draw_sequence']) },
      educationProblemSelections: {
        'drawing:drawing:draw_methods:7': [
          'drawing:draw_methods:7:2',
          'drawing:draw_methods:7:4'
        ]
      },
      commands: [{ dir: 'PEN_DOWN', distance: 1 }, { dir: 'RIGHT', distance: 2 }],
      commandBlockDefinitions: { A: [], B: [] },
      commandBlockEditTarget: 'main',
      educationRouteSignatures: new Set(['route-a']),
      educationRouteEntries: [{ signature: 'route-a', display: '[2→]', distance: 2, commandCount: 2 }],
      isRestoringEducationProgress: false
    });
    assert.equal(app.saveEducationProgress({ active: true }), true);

    const restoredApp = Object.create(App.prototype);
    Object.assign(restoredApp, {
      educationLessonSelections: { missile: 'sequence', drawing: 'draw_sequence' },
      educationCompletedLessons: { missile: new Set(), drawing: new Set() },
      educationProblemSelections: {}
    });
    const restored = restoredApp.restoreEducationProgress();
    assert.equal(restored.active, true);
    assert.equal(restored.selectedLesson, 'draw_methods');
    assert.equal(restored.selectedGridSize, 7);
    assert.equal(restored.educationLevelIndex, 3);
    assert.deepEqual(restored.commands, app.commands);
    assert.deepEqual([...restoredApp.educationCompletedLessons.drawing], ['draw_sequence']);
    assert.deepEqual(restored.routeSignatures, ['route-a']);
    assert.deepEqual(
      restoredApp.educationProblemSelections['drawing:drawing:draw_methods:7'],
      app.educationProblemSelections['drawing:drawing:draw_methods:7']
    );

    assert.equal(app.saveEducationProgress({ active: false }), true);
    const paused = restoredApp.restoreEducationProgress();
    assert.equal(paused.active, false);
    assert.equal(paused.learningMode, 'drawing');
    assert.equal(paused.selectedLesson, 'draw_methods');
    assert.deepEqual(paused.commands, app.commands);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('direct drawing education safely preserves the completed brush steps across reloads', () => {
  const previousWindow = globalThis.window;
  const records = new Map();
  globalThis.window = {
    localStorage: {
      getItem: key => records.get(key) ?? null,
      setItem: (key, value) => records.set(key, value)
    }
  };
  try {
    const level = {
      gridSize: 5,
      starPos: { x: 0, y: 0 },
      referenceCommands: [{ dir: 'RIGHT', distance: 2 }],
      initialCommands: [{ dir: 'RIGHT', distance: 2 }]
    };
    const app = Object.create(App.prototype);
    Object.assign(app, {
      currentMode: 'debug',
      challengeType: 'education',
      selectedEducationLesson: 'draw_sequence',
      selectedGridSize: 5,
      educationLevelIndex: 0,
      currentLevel: level,
      educationLessonSelections: { missile: 'sequence', drawing: 'draw_sequence' },
      educationCompletedLessons: { missile: new Set(), drawing: new Set() },
      educationProblemSelections: {},
      commands: [],
      commandBlockDefinitions: { A: [], B: [] },
      commandBlockEditTarget: 'main',
      educationRouteSignatures: new Set(),
      educationRouteEntries: [],
      studentDrawHistory: [{
        type: 'move',
        fromX: 0,
        fromY: 0,
        toX: 1,
        toY: 0,
        penDown: true,
        drewLine: true,
        color: 'rainbow'
      }],
      isRestoringEducationProgress: false
    });
    assert.equal(app.saveEducationProgress({ active: true }), true);

    const restoredApp = Object.create(App.prototype);
    Object.assign(restoredApp, {
      educationLessonSelections: { missile: 'sequence', drawing: 'draw_sequence' },
      educationCompletedLessons: { missile: new Set(), drawing: new Set() },
      educationProblemSelections: {}
    });
    const restored = restoredApp.restoreEducationProgress();
    assert.deepEqual(restored.studentDrawHistory, app.studentDrawHistory);

    app.studentDrawHistory.push({
      type: 'move',
      fromX: 4,
      fromY: 4,
      toX: 8,
      toY: 8
    });
    assert.equal(app.saveEducationProgress({ active: true }), true);
    assert.equal(restoredApp.restoreEducationProgress().studentDrawHistory.length, 1);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('starting education from the beginning resets only the selected curriculum', () => {
  const app = Object.create(App.prototype);
  let requestedStart = null;
  Object.assign(app, {
    educationCompletedLessons: {
      missile: new Set(['sequence']),
      drawing: new Set(['draw_sequence', 'draw_methods'])
    },
    educationLessonSelections: {
      missile: 'compress',
      drawing: 'draw_minimum_commands'
    },
    educationProblemSelections: {
      'missile:shortest:sequence:5': ['missile-one'],
      'drawing:drawing:draw_methods:7': ['drawing-one']
    },
    renderer: null,
    startActivity(mode, options) {
      requestedStart = { mode, options };
      return true;
    }
  });

  assert.equal(app.startEducationFromBeginning('drawing'), true);
  assert.deepEqual([...app.educationCompletedLessons.drawing], []);
  assert.deepEqual([...app.educationCompletedLessons.missile], ['sequence']);
  assert.equal(app.educationLessonSelections.drawing, 'draw_sequence');
  assert.equal(app.selectedEducationLesson, 'draw_sequence');
  assert.equal(app.educationLevelIndex, 0);
  assert.equal(app.educationProblemSelections['drawing:drawing:draw_methods:7'], undefined);
  assert.deepEqual(
    app.educationProblemSelections['missile:shortest:sequence:5'],
    ['missile-one']
  );
  assert.deepEqual(requestedStart, {
    mode: 'debug',
    options: { challengeType: 'education', forceReload: true }
  });

  const drawingChallenge = Object.create(App.prototype);
  Object.assign(drawingChallenge, {
    currentMode: 'debug',
    challengeType: 'stage'
  });
  assert.equal(drawingChallenge.getEducationLearningMode(), 'drawing');
});

test('every education lesson has five selectable problems for every supported size and missile activity', () => {
  for (const activityMode of ['shortest', 'routing']) {
    for (const lesson of EDUCATION_LESSONS) {
      for (const gridSize of lesson.sizes) {
        const levels = buildEducationLevelPool(
          PRESET_LEVELS,
          activityMode,
          lesson.id,
          gridSize
        );
        assert.equal(
          levels.length,
          5,
          `${activityMode}/${lesson.id}/${gridSize}: education pool must have five problems`
        );
        assert.equal(
          levels.every(level => level.gridSize === gridSize),
          true,
          `${activityMode}/${lesson.id}/${gridSize}: wrong grid size in education pool`
        );
      }
    }
  }
});

test('education sessions choose five from a larger verified reserve bank', () => {
  for (const activityMode of ['shortest', 'routing']) {
    for (const lesson of EDUCATION_LESSONS) {
      for (const gridSize of lesson.sizes) {
        const bank = buildEducationProblemBank(
          PRESET_LEVELS,
          activityMode,
          lesson.id,
          gridSize
        );
        assert.ok(
          bank.length >= 8,
          `${activityMode}/${lesson.id}/${gridSize}: reserve bank must have at least eight problems`
        );
        assert.equal(new Set(bank.map(level => level.educationProblemKey)).size, bank.length);
      }
    }
  }

  for (const lesson of DRAWING_EDUCATION_LESSONS) {
    for (const gridSize of lesson.sizes) {
      const bank = buildDrawingEducationProblemBank(PRESET_LEVELS, lesson.id, gridSize);
      assert.ok(bank.length >= 8, `${lesson.id}/${gridSize}: drawing reserve is too small`);
      assert.equal(new Set(bank.map(level => level.educationProblemKey)).size, bank.length);
    }
  }

  const exampleBank = buildDrawingEducationProblemBank(
    PRESET_LEVELS,
    'draw_sequence',
    5
  );
  const first = chooseEducationSessionProblemKeys(exampleBank, 5, [], () => 0.25);
  const replay = chooseEducationSessionProblemKeys(exampleBank, 5, first, () => 0.25);
  assert.equal(first.length, 5);
  assert.equal(new Set(first).size, 5);
  const byKey = new Map(exampleBank.map(level => [level.educationProblemKey, level]));
  assert.equal(
    new Set(first.map(key => byKey.get(key).educationVariantGroup)).size,
    5
  );
  assert.equal(replay.length, 5);
  assert.equal(replay.every(key => !first.includes(key)), true);
});

test('education keeps a varied session but orders it by structural complexity, not grid size', () => {
  for (const activityMode of ['shortest', 'routing']) {
    for (const lesson of EDUCATION_LESSONS) {
      for (const gridSize of lesson.sizes) {
        const bank = buildEducationProblemBank(
          PRESET_LEVELS,
          activityMode,
          lesson.id,
          gridSize
        );
        const selected = chooseEducationSessionProblemKeys(bank, 5, [], () => 0.37);
        const byKey = new Map(bank.map(level => [level.educationProblemKey, level]));
        const unsorted = selected.map(key => byKey.get(key));
        const ordered = [...unsorted].sort(compareEducationProblemComplexity);
        const scores = ordered.map(getEducationProblemComplexity);
        assert.deepEqual(scores, [...scores].sort((a, b) => a - b));
        assert.deepEqual(
          ordered.map(level => level.gridSize),
          Array(ordered.length).fill(gridSize),
          `${activityMode}/${lesson.id}: size must not be used as the within-lesson difficulty axis`
        );
      }
    }
  }
});

test('minimum-command missile banks vary obstacle structure and separate shortest distance from fewest commands', () => {
  for (const gridSize of [5, 7]) {
    const levels = buildEducationProblemBank(PRESET_LEVELS, 'routing', 'minimum', gridSize);
    assert.ok(new Set(levels.map(level => level.obstacles.length)).size >= 2, `${gridSize}x${gridSize}`);
    assert.ok(new Set(levels.map(level => level.detourDistance)).size >= 2, `${gridSize}x${gridSize}`);
    assert.ok(new Set(levels.map(level => level.minimumCommandCount)).size >= 2, `${gridSize}x${gridSize}`);
    for (const level of levels) {
      assert.ok(level.minimumCommandsOnShortestRoute > level.minimumCommandCount, level.title);
      assert.match(level.educationVariantGroup, /minimum-\d+:shortest-\d+:detour-\d+:obstacles-\d+/);
    }
  }
});

test('pattern education uses ordered required fuel stops without covering every grid step', () => {
  for (const activityMode of ['shortest', 'routing']) {
    for (const [lessonId, gridSize] of [['block_one', 9], ['block_two', 11]]) {
      const levels = buildEducationProblemBank(PRESET_LEVELS, activityMode, lessonId, gridSize);
      for (const level of levels) {
        const program = expandCommandBlockProgram({
          main: level.witness.main,
          definitions: level.witness.definitions,
          availableBlocks: level.patternPolicy.availableBlocks
        });
        const result = CommandEngine.simulate(
          level.starPos,
          program.commands,
          level.gridSize,
          level.obstacles
        );
        const fuel = assessOrderedFuelStops(result.pathSteps, level.fuelStops);
        assert.equal(level.fuelMissionType, 'ordered-required', level.title);
        assert.ok(level.fuelStops.length >= 2, level.title);
        assert.ok(level.fuelStops.length < level.targetStepDirections.length, level.title);
        assert.equal(fuel.isComplete, true, level.title);
        assert.deepEqual(
          fuel.reachedAtSteps.map(stepIndex => result.pathSteps[stepIndex]).map(({ x, y }) => ({ x, y })),
          level.fuelStops,
          level.title
        );
      }
    }
  }
});

test('challenge mode copy distinguishes education, free play, fixed runs, time and multiple solutions', () => {
  assert.match(getChallengeModeHint('education', 'shortest', 5), /복습/);
  assert.match(getChallengeModeHint('stage', 'debug', 5), /기록 부담 없이/);
  assert.match(getChallengeModeHint('random', 'single_stroke', 7), /9문제/);
  assert.match(getChallengeModeHint('timeattack', 'chase', 7), /시간이 멈추는/);
  assert.match(getChallengeModeHint('multisolution', 'routing', 7), /3개/);
});

test('every reserve drawing problem has a safe exact witness and valid lesson metadata', () => {
  for (const lesson of DRAWING_EDUCATION_LESSONS) {
    for (const gridSize of lesson.sizes) {
      const bank = buildDrawingEducationProblemBank(PRESET_LEVELS, lesson.id, gridSize);
      for (const level of bank) {
        const witness = lesson.id === 'draw_sequence'
          ? [{ dir: 'PEN_DOWN', distance: 1 }, ...level.referenceCommands]
          : (lesson.id === 'draw_methods' ? level.witnesses[0] : level.minimumCommandWitness);
        const result = CommandEngine.simulate(level.starPos, witness, gridSize, [], false);
        const assessment = assessDrawingEducationAttempt(level, witness, result);
        assert.equal(result.hitWall, false, level.title);
        assert.equal(result.hitObstacle, false, level.title);
        assert.equal(assessment.isExactMatch, true, level.title);
        assert.equal(assessment.meetsLessonRule, true, level.title);
        if (lesson.id === 'draw_minimum_commands') {
          const analysis = analyzeMinimumDrawingCommands(level);
          assert.equal(analysis.isValid, true, level.title);
          assert.equal(analysis.lowerBound, level.minimumCommandCount, level.title);
        }
      }
    }
  }
});

test('every reserve missile problem has a safe solvable answer for its lesson rule', () => {
  const combinationCount = (total, selected) => {
    const count = Math.min(selected, total - selected);
    let result = 1;
    for (let index = 1; index <= count; index++) {
      result = (result * (total - count + index)) / index;
    }
    return result;
  };
  for (const activityMode of ['shortest', 'routing']) {
    for (const lesson of EDUCATION_LESSONS) {
      for (const gridSize of lesson.sizes) {
        const bank = buildEducationProblemBank(
          PRESET_LEVELS,
          activityMode,
          lesson.id,
          gridSize
        );
        for (const level of bank) {
          if (lesson.id === 'sequence') {
            const result = CommandEngine.simulate(level.starPos, level.witness.main, gridSize, []);
            assert.equal(result.hitWall, false, level.title);
            assert.deepEqual(result.finalPos, level.goalPos, level.title);
            assert.equal(
              assessOrderedFuelStops(result.pathSteps, level.checkpoints).isComplete,
              true,
              level.title
            );
          } else if (lesson.id === 'routes') {
            const dx = Math.abs(level.goalPos.x - level.starPos.x);
            const dy = Math.abs(level.goalPos.y - level.starPos.y);
            const combinations = combinationCount(dx + dy, dx);
            assert.ok(combinations >= level.educationTargetRouteCount, level.title);
          } else if (lesson.id === 'compress') {
            const optimalCommands = compressAdjacentCommands(level.sourceCommands);
            const raw = CommandEngine.simulate(level.starPos, level.sourceCommands, gridSize, []);
            const compressed = CommandEngine.simulate(level.starPos, optimalCommands, gridSize, []);
            assert.equal(raw.hitWall, false, level.title);
            assert.equal(compressed.hitWall, false, level.title);
            assert.deepEqual(raw.pathSteps, compressed.pathSteps, level.title);
            assert.ok(optimalCommands.length < level.sourceCommands.length, level.title);
          } else if (lesson.id === 'shortest') {
            const minimum = CommandEngine.getShortestDistance(
              level.starPos,
              level.goalPos,
              gridSize,
              level.obstacles || []
            );
            assert.equal(Number.isFinite(minimum), true, level.title);
          } else if (lesson.id === 'minimum') {
            const minimum = CommandEngine.analyzeMinimumCommands(
              level.starPos,
              level.goalPos,
              gridSize,
              level.obstacles || []
            );
            const result = CommandEngine.simulate(
              level.starPos,
              minimum.commands,
              gridSize,
              level.obstacles || []
            );
            assert.equal(result.hitWall, false, level.title);
            assert.equal(result.hitObstacle, false, level.title);
            assert.deepEqual(result.finalPos, level.goalPos, level.title);
            assert.equal(minimum.commandCount, level.minimumCommandCount, level.title);
          }
        }
      }
    }
  }
});

test('education tools open progressively instead of exposing unrelated controls', () => {
  assert.equal(EDUCATION_TOOL_POLICIES.sequence.allowDistanceEditing, false);
  assert.equal(EDUCATION_TOOL_POLICIES.sequence.mergeAdjacent, false);
  assert.equal(EDUCATION_TOOL_POLICIES.routes.allowDistanceEditing, false);
  assert.equal(EDUCATION_TOOL_POLICIES.compress.allowDistanceEditing, true);
  assert.equal(EDUCATION_TOOL_POLICIES.shortest.allowedDirections.length, 8);
  assert.equal(EDUCATION_TOOL_POLICIES.minimum.allowedDirections.length, 8);
  assert.equal(EDUCATION_TOOL_POLICIES.block_one.allowDirectMainMoves, false);
  assert.equal(EDUCATION_TOOL_POLICIES.block_two.allowDirectMainMoves, true);

  for (const gridSize of [5, 7]) {
    const sequenceLevels = buildEducationLevelPool(
      PRESET_LEVELS,
      'shortest',
      'sequence',
      gridSize
    );
    for (const level of sequenceLevels) {
      const policy = getEducationToolPolicy(level, 'sequence');
      const analysis = CommandEngine.simulate(
        level.starPos,
        level.witness.main,
        level.gridSize,
        []
      );
      assert.equal(policy.allowDistanceEditing, false);
      assert.equal(policy.mergeAdjacent, false);
      assert.equal(policy.maxMainCommands, level.targetStepDirections.length);
      assert.deepEqual(analysis.finalPos, level.goalPos);
      assert.equal(analysis.hitWall, false);
      assert.equal(
        assessOrderedFuelStops(analysis.pathSteps, level.checkpoints).isComplete,
        true
      );
      assert.deepEqual(
        [...policy.allowedDirections].sort(),
        [...new Set(level.targetStepDirections)].sort()
      );
    }

    const routeLevels = buildEducationLevelPool(
      PRESET_LEVELS,
      'routing',
      'routes',
      gridSize
    );
    for (const level of routeLevels) {
      const policy = getEducationToolPolicy(level, 'routes');
      const manhattanDistance = (
        Math.abs(level.goalPos.x - level.starPos.x) +
        Math.abs(level.goalPos.y - level.starPos.y)
      );
      assert.deepEqual(level.obstacles, []);
      assert.equal(policy.allowedDirections.length, 2);
      assert.equal(policy.allowDistanceEditing, false);
      assert.equal(policy.mergeAdjacent, false);
      assert.equal(policy.maxMainCommands, manhattanDistance);
      assert.equal(level.educationTargetRouteCount, 3);
    }

    const compressLevels = buildEducationLevelPool(
      PRESET_LEVELS,
      'shortest',
      'compress',
      gridSize
    );
    for (const level of compressLevels) {
      const policy = getEducationToolPolicy(level, 'compress');
      assert.equal(policy.allowDistanceEditing, true);
      assert.deepEqual(
        [...policy.allowedDirections].sort(),
        [...new Set(level.sourceCommands.map(command => command.dir))].sort()
      );
    }
  }
});

test('minimum-command education uses only maps where shortest route and fewest commands conflict', () => {
  for (const gridSize of [5, 7]) {
    const levels = buildEducationLevelPool(
      PRESET_LEVELS,
      'shortest',
      'minimum',
      gridSize
    );
    assert.equal(levels.length, 5);
    for (const level of levels) {
      assert.ok(level.obstacles.length > 0);
      assert.ok(level.minimumCommandsOnShortestRoute > level.minimumCommandCount);
      const minimum = CommandEngine.analyzeMinimumCommands(
        level.starPos,
        level.goalPos,
        level.gridSize,
        level.obstacles
      );
      const result = CommandEngine.simulate(
        level.starPos,
        minimum.commands,
        level.gridSize,
        level.obstacles
      );
      assert.equal(result.hitWall, false);
      assert.equal(result.hitObstacle, false);
      assert.deepEqual(result.finalPos, level.goalPos);
      assert.equal(minimum.commandCount, level.minimumCommandCount);
      assert.ok(
        result.lines.length > CommandEngine.getShortestDistance(
          level.starPos,
          level.goalPos,
          level.gridSize,
          level.obstacles
        )
      );
    }
  }
});

test('shortest-path education changes map constraints only when the selected activity calls for them', () => {
  for (const gridSize of [5, 7]) {
    const openLevels = buildEducationLevelPool(
      PRESET_LEVELS,
      'shortest',
      'shortest',
      gridSize
    );
    const obstacleLevels = buildEducationLevelPool(
      PRESET_LEVELS,
      'routing',
      'shortest',
      gridSize
    );
    assert.equal(openLevels.every(level => level.obstacles.length === 0), true);
    assert.equal(obstacleLevels.every(level => level.obstacles.length > 0), true);
    assert.equal(
      [...openLevels, ...obstacleLevels].every(
        level => getEducationToolPolicy(level, 'shortest').allowedDirections.length === 8
      ),
      true
    );
  }
});

test('command-block minimum code analysis distinguishes definitions from main calls', () => {
  const oneBlockTarget = [
    'UP_RIGHT', 'RIGHT',
    'UP_RIGHT', 'RIGHT',
    'UP_RIGHT', 'RIGHT'
  ];
  assert.equal(
    analyzeMinimumCommandBlockCode(oneBlockTarget, {
      availableBlocks: 1,
      minUsedBlocks: 1,
      minimumInvocations: 2
    }).minimumCodeSize,
    3
  );

  const twoBlockTarget = [
    'UP_RIGHT', 'RIGHT', 'UP_RIGHT', 'RIGHT',
    'UP',
    'UP_LEFT', 'LEFT', 'UP_LEFT', 'LEFT'
  ];
  assert.equal(
    analyzeMinimumCommandBlockCode(twoBlockTarget, {
      availableBlocks: 2,
      minUsedBlocks: 2,
      minimumInvocations: 2
    }).minimumCodeSize,
    7
  );
});

test('every 9x9 and 11x11 command-block problem has an exact, safe, globally minimal witness', () => {
  for (const [activityMode, lessons] of Object.entries(PATTERN_EDUCATION_LEVELS)) {
    for (const [lessonId, levels] of Object.entries(lessons)) {
      assert.equal(levels.length, 10);
      for (const [index, level] of levels.entries()) {
        const label = `${activityMode}/${lessonId}/${index + 1}`;
        const analysis = expandCommandBlockProgram({
          ...level.witness,
          availableBlocks: level.patternPolicy.availableBlocks
        });
        const usage = assessCommandBlockUsage(analysis, level.patternPolicy);
        const result = CommandEngine.simulate(
          level.starPos,
          analysis.commands,
          level.gridSize,
          level.obstacles
        );
        const fuel = assessOrderedFuelStops(result.pathSteps, level.fuelStops);
        const actualSteps = CommandEngine.expandToStepList(analysis.commands);
        const independentlyComputedMinimum = analyzeMinimumCommandBlockCode(
          level.targetStepDirections,
          level.patternPolicy
        ).minimumCodeSize;

        assert.equal(analysis.isValid, true, `${label}: witness program is invalid`);
        assert.equal(usage.hasEnoughRepeatedBlocks, true, `${label}: required blocks are not repeated`);
        assert.equal(result.hitWall, false, `${label}: witness hits a wall`);
        assert.equal(result.hitObstacle, false, `${label}: witness hits an obstacle`);
        assert.deepEqual(result.finalPos, level.goalPos, `${label}: witness misses the goal`);
        assert.equal(fuel.isComplete, true, `${label}: witness skips an ordered fuel stop`);
        assert.deepEqual(actualSteps, level.targetStepDirections, `${label}: witness takes a different route`);
        assert.equal(analysis.codeSize, level.minimumCodeSize, `${label}: witness code-size mismatch`);
        assert.equal(
          level.minimumCodeSize,
          independentlyComputedMinimum,
          `${label}: stored minimum is not globally minimal`
        );

        const allPoints = [
          level.starPos,
          level.goalPos,
          ...level.fuelStops,
          ...level.obstacles
        ];
        assert.equal(
          allPoints.every(point => (
            point.x >= 0 && point.y >= 0 &&
            point.x < level.gridSize && point.y < level.gridSize
          )),
          true,
          `${label}: point outside grid`
        );
      }
    }
  }
});

test('command-block validation rejects empty, unused, and insufficiently repeated definitions', () => {
  const empty = expandCommandBlockProgram({
    main: [{ type: 'block', blockId: 'A', repeat: 2 }],
    definitions: { A: [] },
    availableBlocks: 1
  });
  assert.equal(empty.isValid, false);
  assert.ok(empty.errors.includes('A_definition_empty'));

  const unused = expandCommandBlockProgram({
    main: [{ dir: 'RIGHT', distance: 1 }],
    definitions: { A: [{ dir: 'UP', distance: 1 }] },
    availableBlocks: 1
  });
  assert.equal(unused.isValid, false);
  assert.ok(unused.errors.includes('unused_definition'));
  assert.equal(unused.codeSize, 1);
  assert.equal(unused.authoredCodeSize, 2);
  assert.equal(unused.definedBlockCount, 1);

  const once = expandCommandBlockProgram({
    main: [{ type: 'block', blockId: 'A', repeat: 1 }],
    definitions: { A: [{ dir: 'UP', distance: 1 }] },
    availableBlocks: 1
  });
  assert.equal(
    assessCommandBlockUsage(once, { minUsedBlocks: 1, minimumInvocations: 2 })
      .hasEnoughRepeatedBlocks,
    false
  );
});

test('command-block normalization never creates a movement beyond the engine distance limit', () => {
  const normalized = normalizeMoveCommands([
    { dir: 'RIGHT', distance: MAX_COMMAND_DISTANCE },
    { dir: 'RIGHT', distance: 2 }
  ]);
  assert.deepEqual(normalized, [
    { dir: 'RIGHT', distance: MAX_COMMAND_DISTANCE },
    { dir: 'RIGHT', distance: 2 }
  ]);
});

test('fuel stops are credited only in the displayed order', () => {
  const stops = [{ x: 1, y: 0 }, { x: 2, y: 0 }];
  assert.equal(assessOrderedFuelStops([
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 1, y: 0 }
  ], stops).isComplete, false);
  assert.equal(assessOrderedFuelStops([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 }
  ], stops).isComplete, true);
});

test('every built-in activity has a balanced problem bank across all grid sizes', () => {
  for (const mode of ['efficiency', 'shortest', 'routing', 'debug', 'debug_guide', 'chase']) {
    const gridSizes = getSupportedGridSizesForMode(mode);
    const levels = PRESET_LEVELS[mode].flat();
    const problemsPerGrid = ['debug', 'debug_guide'].includes(mode)
      ? 15
      : (['routing', 'chase'].includes(mode) ? 10 : 5);
    assert.equal(
      levels.length,
      problemsPerGrid * gridSizes.length,
      `${mode}: unexpected built-in problem count`
    );
    assert.equal(
      new Set(levels.map(level => level.title)).size,
      levels.length,
      `${mode}: duplicate problem title`
    );
    assert.equal(
      new Set(levels.map(level => JSON.stringify({
        gridSize: level.gridSize,
        starPos: level.starPos,
        goalPos: level.goalPos,
        thiefPos: level.thiefPos,
        handcuffPos: level.handcuffPos,
        obstacles: level.obstacles,
        sourceCommands: level.sourceCommands,
        targetLines: level.targetLines,
        initialCommands: level.initialCommands,
        thiefCommands: level.thiefCommands
      }))).size,
      levels.length,
      `${mode}: duplicate problem structure`
    );

    for (const gridSize of gridSizes) {
      assert.equal(
        levels.filter(level => level.gridSize === gridSize).length,
        problemsPerGrid,
        `${mode}: expected ${problemsPerGrid} ${gridSize}x${gridSize} problems`
      );
    }

    for (const level of levels) {
      const points = [
        level.starPos,
        level.goalPos,
        level.thiefPos,
        level.handcuffPos,
        ...(level.obstacles || []),
        ...(level.targetLines || []).flatMap(line => [
          { x: line.fromX, y: line.fromY },
          { x: line.toX, y: line.toY }
        ])
      ].filter(Boolean);

      for (const point of points) {
        assert.ok(
          Number.isInteger(point.x) &&
          Number.isInteger(point.y) &&
          point.x >= 0 &&
          point.x < level.gridSize &&
          point.y >= 0 &&
          point.y < level.gridSize,
          `${level.title}: point (${point.x}, ${point.y}) leaves the grid`
        );
      }
    }
  }
});

test('selected grid sizes use complete non-repeating random problem bags', () => {
  let state = 20260731;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };

  for (const mode of ['efficiency', 'shortest', 'routing', 'debug', 'debug_guide', 'chase']) {
    for (const gridSize of getSupportedGridSizesForMode(mode)) {
      const expected = getLevelsForGridSize(PRESET_LEVELS[mode], gridSize);
      const bag = buildRandomProblemBag(PRESET_LEVELS[mode], gridSize, random);
      assert.equal(bag.length, expected.length, `${mode} ${gridSize}x${gridSize}: incomplete bag`);
      assert.equal(
        new Set(bag.map(level => level.title)).size,
        bag.length,
        `${mode} ${gridSize}x${gridSize}: repeated before the bag was exhausted`
      );
      assert.ok(
        bag.every(level => level.gridSize === gridSize),
        `${mode}: a different grid size entered the ${gridSize}x${gridSize} bag`
      );
    }

    for (const unsupportedSize of [5, 7, 9, 11].filter(size => (
      !getSupportedGridSizesForMode(mode).includes(size)
    ))) {
      assert.equal(
        getLevelsForGridSize(PRESET_LEVELS[mode], unsupportedSize).length,
        0,
        `${mode}: unsupported ${unsupportedSize}x${unsupportedSize} problems remain`
      );
    }
  }

  const app = Object.create(App.prototype);
  app.problemDrawBags = new Map();
  app.lastDrawnProblemKeys = new Map();
  app.levelIndex = 0;
  const cycle = Array.from({ length: 10 }, () => (
    app.drawNextRandomProblem('chase', PRESET_LEVELS.chase, 5, random)
  ));
  assert.equal(new Set(cycle.map(level => level.title)).size, 10);
  const firstOfNextCycle = app.drawNextRandomProblem('chase', PRESET_LEVELS.chase, 5, random);
  assert.notEqual(firstOfNextCycle.title, cycle.at(-1).title);
});

test('obstacle and open maps stay in separate balanced random groups', () => {
  let state = 17;
  const random = () => {
    state = (state * 1103515245 + 12345) >>> 0;
    return state / 4294967296;
  };

  for (const gridSize of [5, 7, 9, 11]) {
    const groups = partitionLevelsByObstacle(PRESET_LEVELS.chase, gridSize);
    assert.equal(groups.open.length, 2, `${gridSize}x${gridSize}: open-map pool changed`);
    assert.equal(groups.obstacle.length, 8, `${gridSize}x${gridSize}: obstacle-map pool changed`);
    assert.ok(groups.open.every(level => getObstacleMapType(level) === 'open'));
    assert.ok(groups.obstacle.every(level => getObstacleMapType(level) === 'obstacle'));

    const bag = buildRandomProblemBag(PRESET_LEVELS.chase, gridSize, random);
    let longestRun = 0;
    let currentRun = 0;
    let previousType = '';
    for (const level of bag) {
      const type = getObstacleMapType(level);
      currentRun = type === previousType ? currentRun + 1 : 1;
      previousType = type;
      longestRun = Math.max(longestRun, currentRun);
    }
    assert.ok(longestRun <= 3, `${gridSize}x${gridSize}: one map type is clustered too heavily`);
  }
});

test('advanced problem banks require real detours and allow multiple optimal answers', () => {
  for (const level of PRESET_LEVELS.efficiency.flat()) {
    const compressed = compressAdjacentCommands(level.sourceCommands);
    assert.ok(compressed.length >= 4, `${level.title}: too few direction changes`);
    assert.ok(
      level.sourceCommands.length >= compressed.length + 4,
      `${level.title}: source command is not meaningfully longer`
    );
    assert.ok(
      new Set(compressed.map(command => command.dir)).size >= Math.min(
        5,
        Math.ceil(compressed.length / 2)
      ),
      `${level.title}: needs more direction variety`
    );
  }
  for (const gridSize of [5, 7, 9, 11]) {
    assert.deepEqual(
      PRESET_LEVELS.efficiency
        .filter(level => level.gridSize === gridSize)
        .map(level => compressAdjacentCommands(level.sourceCommands).length),
      [4, 5, 6, 7, 8],
      `${gridSize}x${gridSize}: efficiency complexity does not grow`
    );
  }

  for (const level of PRESET_LEVELS.shortest.flat()) {
    const analysis = CommandEngine.analyzeShortestPaths(
      level.starPos,
      level.goalPos,
      level.gridSize,
      []
    );
    assert.equal(analysis.distance, level.shortestDistance, level.title);
    assert.equal(analysis.pathCount, level.solutionCount, level.title);
    assert.ok(analysis.pathCount >= 3, `${level.title}: needs multiple shortest answers`);
  }
  for (const gridSize of [5, 7, 9, 11]) {
    const levels = PRESET_LEVELS.shortest.filter(level => level.gridSize === gridSize);
    const minimumDistanceVariety = gridSize === 5 ? 2 : 4;
    assert.ok(
      new Set(levels.map(level => level.shortestDistance)).size >= minimumDistanceVariety,
      `${gridSize}x${gridSize}: shortest distances are too repetitive`
    );
    assert.ok(
      levels.some(level => [level.starPos, level.goalPos].some(point => (
        point.x > 0 && point.x < gridSize - 1 &&
        point.y > 0 && point.y < gridSize - 1
      ))),
      `${gridSize}x${gridSize}: needs an interior endpoint`
    );
  }

  for (const level of PRESET_LEVELS.routing.flat()) {
    const analysis = CommandEngine.analyzeShortestPaths(
      level.starPos,
      level.goalPos,
      level.gridSize,
      level.obstacles
    );
    const minimumDetour = 1;
    assert.equal(analysis.distance, level.shortestDistance, level.title);
    assert.equal(analysis.pathCount, level.solutionCount, level.title);
    assert.ok(
      level.detourDistance >= minimumDetour,
      `${level.title}: obstacle detour is too small`
    );
    assert.ok(analysis.pathCount >= 2, `${level.title}: needs multiple shortest detours`);
    assert.ok(
      level.obstacles.length <= OBSTACLE_COUNT_LIMITS[level.gridSize],
      `${level.title}: too many obstacles for the grid size`
    );
    for (let obstacleIndex = 0; obstacleIndex < level.obstacles.length; obstacleIndex++) {
      const reduced = CommandEngine.analyzeShortestPaths(
        level.starPos,
        level.goalPos,
        level.gridSize,
        level.obstacles.filter((_, index) => index !== obstacleIndex)
      );
      assert.ok(
        reduced.distance !== analysis.distance || reduced.pathCount !== analysis.pathCount,
        `${level.title}: obstacle ${obstacleIndex + 1} does not affect the optimal route`
      );
    }
  }
  for (const gridSize of [5, 7, 9, 11]) {
    const levels = PRESET_LEVELS.routing.filter(level => level.gridSize === gridSize);
    assert.ok(
      levels.filter(level => level.detourDistance >= 2).length >= 5,
      `${gridSize}x${gridSize}: needs more substantial detours`
    );
    if (gridSize >= 7) {
      assert.ok(
        levels.filter(level => level.detourDistance >= 3).length >= 2,
        `${gridSize}x${gridSize}: needs several deep detours`
      );
    }
    assert.ok(
      levels.every(level => (
        level.solutionCount <= ROUTING_MAXIMUM_PATH_COUNTS[gridSize]
      )),
      `${gridSize}x${gridSize}: too many equivalent shortest detours`
    );
  }

  for (const gridSize of [5, 7, 9, 11]) {
    const levels = PRESET_LEVELS.chase.filter(level => level.gridSize === gridSize);
    assert.equal(levels.filter(level => level.obstacles.length === 0).length, 2);
    assert.equal(levels.filter(level => level.obstacles.length > 0).length, 8);
  }
  for (const level of PRESET_LEVELS.chase.flat()) {
    const analysis = CommandEngine.analyzeChaseCapturePlans(
      level.starPos,
      level.thiefPos,
      level.thiefCommands,
      level.gridSize,
      level.obstacles,
      level.handcuffPos || null
    );
    assert.ok(analysis, `${level.title}: no capture plan`);
    assert.equal(analysis.earliestTurn, level.earliestCatchTurn, level.title);
    assert.equal(analysis.pathCount, level.solutionCount, level.title);
    assert.ok(analysis.pathCount >= 2, `${level.title}: needs multiple earliest captures`);

    if (level.obstacles.length > 0) {
      assert.ok(
        level.obstacles.length <= OBSTACLE_COUNT_LIMITS[level.gridSize],
        `${level.title}: too many chase obstacles for the grid size`
      );
      const openAnalysis = CommandEngine.analyzeChaseCapturePlans(
        level.starPos,
        level.thiefPos,
        level.thiefCommands,
        level.gridSize,
        []
      );
      assert.ok(openAnalysis, `${level.title}: open-map comparison is missing`);
      const obstacleOnlyAnalysis = CommandEngine.analyzeChaseCapturePlans(
        level.starPos,
        level.thiefPos,
        level.thiefCommands,
        level.gridSize,
        level.obstacles
      );
      assert.ok(
        obstacleOnlyAnalysis.earliestTurn > openAnalysis.earliestTurn,
        `${level.title}: obstacles do not change the earliest catch`
      );
    }
  }

  for (const mode of ['debug', 'debug_guide']) {
    for (const gridSize of DRAWING_GRID_SIZES) {
      const levels = PRESET_LEVELS[mode].filter(level => level.gridSize === gridSize);
      const cycleCounts = levels.map(level => level.graphProfile.cycleCount);
      assert.equal(
        new Set(levels.map(level => level.motifId)).size,
        15,
        `${mode} ${gridSize}x${gridSize}: curated motifs must be unique`
      );
      assert.ok(cycleCounts.some(count => count === 0));
      assert.ok(cycleCounts.some(count => count >= 2));
      assert.ok(
        levels.filter(level => (
          level.minimumDrawingDistance > level.graphProfile.edgeCount
        )).length >= 10,
        `${mode} ${gridSize}x${gridSize}: needs more route-planning figures`
      );
      assert.ok(
        levels.filter(level => level.graphProfile.decisionVertices >= 1).length >= 12,
        `${mode} ${gridSize}x${gridSize}: needs more figures with branch choices`
      );
      for (const level of levels) {
        const visualQuality = getDrawingVisualQuality(level);
        assert.ok(
          visualQuality.width >= DRAWING_MINIMUM_SPANS[gridSize] &&
          visualQuality.height >= DRAWING_MINIMUM_SPANS[gridSize],
          `${level.title}: figure does not use enough of the board`
        );
        assert.equal(
          visualQuality.ambiguousCrossings,
          0,
          `${level.title}: diagonal lines cross away from a grid point`
        );
      }
    }
  }
});

test('problem structures are not repeated by rotation, reflection, or translation', () => {
  const transforms = [
    point => ({ x: point.x, y: point.y }),
    point => ({ x: -point.x, y: point.y }),
    point => ({ x: point.x, y: -point.y }),
    point => ({ x: -point.x, y: -point.y }),
    point => ({ x: point.y, y: point.x }),
    point => ({ x: -point.y, y: point.x }),
    point => ({ x: point.y, y: -point.x }),
    point => ({ x: -point.y, y: -point.x })
  ];
  const segmentKey = (from, to) => {
    const fromKey = `${from.x},${from.y}`;
    const toKey = `${to.x},${to.y}`;
    return [fromKey, toKey].sort().join('|');
  };
  const canonicalDrawing = level => {
    const uniqueLines = new Map();
    for (const line of CommandEngine.expandLinesToUnitSteps(level.targetLines)) {
      uniqueLines.set(
        segmentKey(
          { x: line.fromX, y: line.fromY },
          { x: line.toX, y: line.toY }
        ),
        line
      );
    }
    return transforms.map(transform => {
      const transformed = [...uniqueLines.values()].map(line => ({
        from: transform({ x: line.fromX, y: line.fromY }),
        to: transform({ x: line.toX, y: line.toY })
      }));
      const points = transformed.flatMap(line => [line.from, line.to]);
      const minX = Math.min(...points.map(point => point.x));
      const minY = Math.min(...points.map(point => point.y));
      return transformed.map(line => segmentKey(
        { x: line.from.x - minX, y: line.from.y - minY },
        { x: line.to.x - minX, y: line.to.y - minY }
      )).sort().join(';');
    }).sort()[0];
  };
  const canonicalBoard = (level, includeThiefRoute = false) => {
    const max = level.gridSize - 1;
    const boardTransforms = [
      point => ({ x: point.x, y: point.y }),
      point => ({ x: max - point.x, y: point.y }),
      point => ({ x: point.x, y: max - point.y }),
      point => ({ x: max - point.x, y: max - point.y }),
      point => ({ x: point.y, y: point.x }),
      point => ({ x: max - point.y, y: point.x }),
      point => ({ x: point.y, y: max - point.x }),
      point => ({ x: max - point.y, y: max - point.x })
    ];
    const thiefRoute = includeThiefRoute
      ? CommandEngine.traceChaseThiefRoute(
          level.thiefPos,
          level.thiefCommands,
          level.gridSize,
          level.obstacles
        ).positions
      : [];
    return boardTransforms.map(transform => JSON.stringify({
      start: transform(level.starPos),
      ...(includeThiefRoute
        ? {
            thiefRoute: thiefRoute.map(transform),
            handcuffs: level.handcuffPos ? transform(level.handcuffPos) : null
          }
        : { goal: transform(level.goalPos) }),
      obstacles: level.obstacles
        .map(transform)
        .sort((a, b) => a.y - b.y || a.x - b.x)
    })).sort()[0];
  };

  for (const mode of ['debug', 'debug_guide']) {
    const signatures = PRESET_LEVELS[mode].flat().map(canonicalDrawing);
    assert.equal(
      new Set(signatures).size,
      signatures.length,
      `${mode}: rotated or reflected drawing duplicates remain`
    );
  }
  for (const mode of ['shortest', 'routing', 'chase']) {
    for (const gridSize of [5, 7, 9, 11]) {
      const levels = PRESET_LEVELS[mode].filter(level => level.gridSize === gridSize);
      const signatures = levels.map(level => canonicalBoard(level, mode === 'chase'));
      assert.equal(
        new Set(signatures).size,
        signatures.length,
        `${mode} ${gridSize}x${gridSize}: symmetric board duplicates remain`
      );
    }
  }
});

test('drawing mode includes the one-stroke challenge alongside the numbered activities', () => {
  assert.deepEqual(LEARNING_MODE_GROUPS, {
    missile: ['shortest', 'routing'],
    drawing: ['debug', 'debug_guide', 'single_stroke'],
    chase: ['chase'],
    creator: ['creator']
  });

  const groupedActivities = Object.values(LEARNING_MODE_GROUPS).flat();
  assert.deepEqual(groupedActivities, [
    'shortest',
    'routing',
    'debug',
    'debug_guide',
    'single_stroke',
    'chase',
    'creator'
  ]);
  assert.equal(new Set(groupedActivities).size, 7);
  assert.equal(getLearningModeForActivity('routing'), 'missile');
  assert.equal(getLearningModeForActivity('debug_guide'), 'drawing');
  assert.equal(getLearningModeForActivity('single_stroke'), 'drawing');
  assert.equal(getLearningModeForActivity('chase'), 'chase');
  assert.equal(getLearningModeForActivity('creator'), 'creator');
  assert.equal(getLearningModeForActivity('efficiency'), null);
});

test('chase keeps every arrest as a success and separately identifies the earliest arrest', () => {
  assert.deepEqual(classifyChaseCatchOutcome(0, 4), {
    isCaught: false,
    hasEarliestBenchmark: true,
    isEarliest: false,
    extraTurns: 0
  });
  assert.deepEqual(classifyChaseCatchOutcome(4, 4), {
    isCaught: true,
    hasEarliestBenchmark: true,
    isEarliest: true,
    extraTurns: 0
  });
  assert.deepEqual(classifyChaseCatchOutcome(6, 4), {
    isCaught: true,
    hasEarliestBenchmark: true,
    isEarliest: false,
    extraTurns: 2
  });
});

test('next-problem labels match the selected challenge flow', () => {
  assert.equal(getNextProblemButtonLabel('debug', 'stage'), '다음 그림 문제 ➡️');
  assert.equal(getNextProblemButtonLabel('routing', 'random'), '다음 도전 장애물 문제 ➡️');
  assert.equal(getNextProblemButtonLabel('chase', 'timeattack'), '다음 추격 문제 이어서 도전 ➡️');
  assert.equal(getNextProblemButtonLabel('single_stroke', 'infinite'), '다음 한붓그리기 문제 계속 도전 ➡️');
});

test('time attack pauses for non-interactive animation and resumes after every pause reason clears', () => {
  const app = Object.create(App.prototype);
  const startOptions = [];
  const stopOptions = [];
  app.challengeType = 'timeattack';
  app.challengeState = { timeRemaining: 42 };
  app.timerInterval = null;
  app.timerPauseReasons = new Set();
  app.stopChallengeTimer = options => stopOptions.push(options);
  app.startChallengeTimer = options => startOptions.push(options);

  app.pauseChallengeTimer('simulation');
  app.pauseChallengeTimer('result-modal');
  assert.deepEqual([...app.timerPauseReasons].sort(), ['result-modal', 'simulation']);
  assert.deepEqual(stopOptions, [
    { clearPauses: false },
    { clearPauses: false }
  ]);

  app.resumeChallengeTimer('simulation');
  assert.deepEqual(startOptions, []);
  app.resumeChallengeTimer('result-modal');
  assert.deepEqual(startOptions, [{ reset: false }]);

  app.challengeType = 'stage';
  app.pauseChallengeTimer('simulation');
  assert.deepEqual(startOptions, [{ reset: false }]);
});

test('reset cancels active effects, restores the complete level state and resumes a paused timer', () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    querySelectorAll: () => []
  };
  try {
    const calls = {
      effects: 0,
      timer: 0,
      visitedFuel: null,
      visitedCheckpoints: null,
      handcuff: null
    };
    const app = Object.create(App.prototype);
    Object.assign(app, {
      executionId: 9,
      isExecuting: true,
      challengeType: 'timeattack',
      challengeState: { timeRemaining: 31 },
      timerInterval: null,
      timerPauseReasons: new Set(['simulation']),
      currentMode: 'shortest',
      missileSolutionRule: 'shortest',
      currentLevel: {
        starPos: { x: 0, y: 4 },
        goalPos: { x: 4, y: 0 },
        obstacles: [{ x: 2, y: 2 }],
        checkpoints: [{ x: 1, y: 3 }],
        fuelStops: [{ x: 3, y: 1 }],
        handcuffPos: { x: 1, y: 1 },
        guide: '다시 시작 안내'
      },
      commands: [{ dir: 'RIGHT', distance: 2 }],
      renderer: {
        cancelEffects: () => { calls.effects += 1; },
        clearDrawnLines() {},
        setPenDown() {},
        setStarPos() {},
        setGoalPos() {},
        setObstacles() {},
        setCheckpoints() {},
        setVisitedCheckpointCount: value => { calls.visitedCheckpoints = value; },
        setFuelStops() {},
        setVisitedFuelCount: value => { calls.visitedFuel = value; },
        setHandcuffPos: (x, y) => { calls.handcuff = [x, y]; },
        setThiefPos() {},
        starAngle: 1
      },
      startChallengeTimer: options => {
        calls.timer += 1;
        assert.deepEqual(options, { reset: false });
      },
      usesExplicitPenStartCommand: () => false,
      isPatternEducationActive: () => false,
      getDefaultDrawingCommands: () => [],
      renderCommandQueue() {},
      updateCommandBlockWorkspace() {},
      updateCreatorInterface() {},
      renderThiefPlanPanel() {},
      updateStudentHistoryControls() {},
      updateStepCounter() {},
      updatePenStateUI() {},
      isEducationMode: () => false,
      saveEducationProgress() {},
      setStatus() {}
    });

    app.resetLevel();

    assert.equal(app.executionId, 10);
    assert.equal(app.isExecuting, false);
    assert.equal(calls.effects, 1);
    assert.equal(calls.timer, 1);
    assert.equal(app.timerPauseReasons.size, 0);
    assert.equal(calls.visitedCheckpoints, 0);
    assert.equal(calls.visitedFuel, 0);
    assert.deepEqual(calls.handcuff, [1, 1]);
    assert.deepEqual(app.commands, []);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('mobile problem changes scroll to the visible task instead of a hidden drawing panel', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const scrolled = [];
  const focused = [];
  const drawingTask = {
    hidden: true,
    scrollIntoView: options => scrolled.push(['drawing', options])
  };
  const gridCard = {
    scrollIntoView: options => scrolled.push(['grid', options])
  };
  const drawingHeading = { focus: options => focused.push(['drawing', options]) };
  const modeHeading = { focus: options => focused.push(['mode', options]) };

  try {
    globalThis.window = {
      matchMedia: () => ({ matches: true })
    };
    globalThis.document = {
      body: { dataset: { view: 'play' } },
      getElementById(id) {
        if (id === 'drawing-education-task-panel') return drawingTask;
        if (id === 'drawing-education-task-title') return drawingHeading;
        if (id === 'mode-title-text') return modeHeading;
        return null;
      },
      querySelector(selector) {
        return selector === '.grid-card' ? gridCard : null;
      }
    };
    globalThis.requestAnimationFrame = callback => {
      callback();
      return 1;
    };

    const app = Object.create(App.prototype);
    app.isDrawingEducationMode = () => false;
    assert.equal(app.scrollCurrentProblemIntoView(), true);
    assert.equal(scrolled.at(-1)[0], 'grid');
    assert.equal(focused.at(-1)[0], 'mode');

    drawingTask.hidden = false;
    app.isDrawingEducationMode = () => true;
    assert.equal(app.scrollCurrentProblemIntoView(), true);
    assert.equal(scrolled.at(-1)[0], 'drawing');
    assert.equal(focused.at(-1)[0], 'drawing');
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

test('all drawing targets are continuous valid 8-direction paths', () => {
  for (const mode of ['debug', 'debug_guide']) {
    for (const level of PRESET_LEVELS[mode]) {
      const unitLines = CommandEngine.expandLinesToUnitSteps(level.targetLines);
      assert.ok(unitLines, `${level.title}: invalid 8-direction target line`);
      assert.ok(unitLines.length > 0, `${level.title}: empty target path`);
      assert.deepEqual(
        { x: unitLines[0].fromX, y: unitLines[0].fromY },
        level.starPos,
        `${level.title}: target does not start at the brush`
      );

      for (let index = 1; index < unitLines.length; index++) {
        assert.deepEqual(
          { x: unitLines[index].fromX, y: unitLines[index].fromY },
          { x: unitLines[index - 1].toX, y: unitLines[index - 1].toY },
          `${level.title}: target path is disconnected`
        );
      }
    }
  }
});

test('every efficiency activity has a valid shorter command answer with the same path', () => {
  assert.equal(PRESET_LEVELS.efficiency.length >= 12, true);

  for (const rawLevel of PRESET_LEVELS.efficiency) {
    const level = prepareEfficiencyLevel(rawLevel);
    const sourceResult = CommandEngine.simulate(
      level.starPos,
      level.sourceCommands,
      level.gridSize
    );
    const efficientResult = CommandEngine.simulate(
      level.starPos,
      level.optimalCommands,
      level.gridSize
    );

    assert.equal(sourceResult.hitWall, false, `${level.title}: source leaves the grid`);
    assert.equal(efficientResult.hitWall, false, `${level.title}: answer leaves the grid`);
    assert.equal(
      level.sourceCommands.every(command => command.distance === 1),
      true,
      `${level.title}: source must show one-cell commands`
    );
    assert.equal(
      level.optimalCommands.length < level.sourceCommands.length,
      true,
      `${level.title}: answer must use fewer command groups`
    );
    assert.deepEqual(
      efficientResult.lines.map(({ fromX, fromY, toX, toY }) => ({ fromX, fromY, toX, toY })),
      sourceResult.lines.map(({ fromX, fromY, toX, toY }) => ({ fromX, fromY, toX, toY })),
      `${level.title}: efficient answer changes the path`
    );
  }
});

test('efficiency compression combines only adjacent equal directions', () => {
  assert.deepEqual(
    compressAdjacentCommands([
      { dir: 'RIGHT', distance: 1 },
      { dir: 'RIGHT', distance: 1 },
      { dir: 'UP', distance: 1 },
      { dir: 'RIGHT', distance: 1 },
      { dir: 'RIGHT', distance: 1 }
    ]),
    [
      { dir: 'RIGHT', distance: 2 },
      { dir: 'UP', distance: 1 },
      { dir: 'RIGHT', distance: 2 }
    ]
  );
});

test('every follow-the-commands drawing level matches its target exactly', () => {
  for (const level of PRESET_LEVELS.debug_guide) {
    const result = CommandEngine.simulate(
      level.starPos,
      level.initialCommands,
      level.gridSize
    );
    const comparison = CommandEngine.compareLinePaths(result.lines, level.targetLines);

    assert.equal(result.hitWall, false, `${level.title}: commands hit a wall`);
    assert.equal(comparison.isExactMatch, true, `${level.title}: commands and target disagree`);
  }
});

test('a closed drawing is correct when the same lines are traced in the opposite direction', () => {
  const level = PRESET_LEVELS.debug.find(candidate => {
    const reversedLines = candidate.targetLines
      .slice()
      .reverse()
      .map(line => ({
        fromX: line.toX,
        fromY: line.toY,
        toX: line.fromX,
        toY: line.fromY
      }));
    return !CommandEngine.compareLinePaths(
      reversedLines,
      candidate.targetLines
    ).isExactMatch;
  });
  assert.ok(level);
  const reversedLines = level.targetLines
    .slice()
    .reverse()
    .map(line => ({
      fromX: line.toX,
      fromY: line.toY,
      toX: line.fromX,
      toY: line.fromY
    }));

  assert.equal(
    CommandEngine.compareLinePaths(reversedLines, level.targetLines).isExactMatch,
    false,
    'ordered path comparison should still distinguish the reverse route'
  );

  const figureComparison = CommandEngine.compareLineFigures(
    reversedLines,
    level.targetLines
  );
  assert.equal(figureComparison.isExactMatch, true);
  assert.equal(figureComparison.matchedCount, level.graphProfile.edgeCount);

  const targetKeys = new Set(
    CommandEngine.expandLinesToUnitSteps(level.targetLines).map(line => {
      const from = `${line.fromX},${line.fromY}`;
      const to = `${line.toX},${line.toY}`;
      return [from, to].sort().join('|');
    })
  );
  let extraLine = null;
  for (let y = 0; y < level.gridSize && !extraLine; y++) {
    for (let x = 0; x < level.gridSize && !extraLine; x++) {
      for (const direction of Object.values(DIRECTIONS)) {
        const toX = x + direction.dx;
        const toY = y + direction.dy;
        if (
          toX < 0 || toX >= level.gridSize ||
          toY < 0 || toY >= level.gridSize
        ) {
          continue;
        }
        const key = [`${x},${y}`, `${toX},${toY}`].sort().join('|');
        if (!targetKeys.has(key)) {
          extraLine = { fromX: x, fromY: y, toX, toY };
          break;
        }
      }
    }
  }
  assert.ok(extraLine);
  const drawingWithExtraLine = [
    ...reversedLines,
    extraLine
  ];
  assert.equal(
    CommandEngine.compareLineFigures(drawingWithExtraLine, level.targetLines).isExactMatch,
    false,
    'an extra line must not be accepted as the same figure'
  );
});

test('drawing figures allow retracing target lines without changing the answer', () => {
  const targetLines = [
    { fromX: 0, fromY: 0, toX: 2, toY: 0 },
    { fromX: 2, fromY: 0, toX: 2, toY: 2 }
  ];
  const retracedDrawing = [
    { fromX: 0, fromY: 0, toX: 2, toY: 0 },
    { fromX: 2, fromY: 0, toX: 0, toY: 0 },
    { fromX: 0, fromY: 0, toX: 2, toY: 0 },
    { fromX: 2, fromY: 0, toX: 2, toY: 2 }
  ];

  const comparison = CommandEngine.compareLineFigures(retracedDrawing, targetLines);
  assert.equal(comparison.isExactMatch, true);
  assert.equal(comparison.matchedCount, 4);
  assert.equal(comparison.targetCount, 4);
  assert.equal(comparison.actualCount, 4);
  assert.equal(comparison.missingCount, 0);
  assert.equal(comparison.extraCount, 0);
  assert.equal(comparison.retracedCount, 4);
});

test('every built-in drawing accepts alternate traversals and rejects changed figures', () => {
  const segmentKey = line => {
    const from = `${line.fromX},${line.fromY}`;
    const to = `${line.toX},${line.toY}`;
    return from < to ? `${from}|${to}` : `${to}|${from}`;
  };

  for (const mode of ['debug', 'debug_guide']) {
    for (const level of PRESET_LEVELS[mode]) {
      const unitLines = CommandEngine.expandLinesToUnitSteps(level.targetLines);
      const reversedLines = unitLines.slice().reverse().map(line => ({
        fromX: line.toX,
        fromY: line.toY,
        toX: line.fromX,
        toY: line.fromY
      }));
      assert.equal(
        CommandEngine.compareLineFigures(reversedLines, level.targetLines).isExactMatch,
        true,
        `${level.title}: reverse traversal rejected`
      );
      assert.equal(
        CommandEngine.compareLineFigures(
          [...unitLines, ...reversedLines],
          level.targetLines
        ).isExactMatch,
        true,
        `${level.title}: retraced traversal rejected`
      );

      const removedKey = segmentKey(unitLines[0]);
      const missingLines = unitLines.filter(line => segmentKey(line) !== removedKey);
      const missingComparison = CommandEngine.compareLineFigures(
        missingLines,
        level.targetLines
      );
      assert.equal(missingComparison.isExactMatch, false, `${level.title}: missing line accepted`);
      assert.equal(missingComparison.missingCount, 1, `${level.title}: missing line count`);

      const targetKeys = new Set(unitLines.map(segmentKey));
      let extraLine = null;
      for (let y = 0; y < level.gridSize && !extraLine; y++) {
        for (let x = 0; x < level.gridSize && !extraLine; x++) {
          for (const direction of Object.values(DIRECTIONS)) {
            const toX = x + direction.dx;
            const toY = y + direction.dy;
            if (
              toX < 0 || toX >= level.gridSize ||
              toY < 0 || toY >= level.gridSize
            ) continue;
            const candidate = { fromX: x, fromY: y, toX, toY };
            if (!targetKeys.has(segmentKey(candidate))) {
              extraLine = candidate;
              break;
            }
          }
        }
      }
      assert.ok(extraLine, `${level.title}: no extra-line candidate`);
      const extraComparison = CommandEngine.compareLineFigures(
        [...unitLines, extraLine],
        level.targetLines
      );
      assert.equal(extraComparison.isExactMatch, false, `${level.title}: extra line accepted`);
      assert.equal(extraComparison.extraCount, 1, `${level.title}: extra line count`);
    }
  }
});

test('drawing comparison reports only missing and newly added visible lines', () => {
  const targetLines = [
    { fromX: 0, fromY: 0, toX: 2, toY: 0 },
    { fromX: 2, fromY: 0, toX: 2, toY: 2 }
  ];
  const incompleteDrawing = [
    { fromX: 2, fromY: 1, toX: 2, toY: 0 },
    { fromX: 2, fromY: 0, toX: 1, toY: 0 },
    { fromX: 1, fromY: 0, toX: 2, toY: 0 },
    { fromX: 1, fromY: 0, toX: 0, toY: 0 },
    { fromX: 2, fromY: 0, toX: 2, toY: 1 },
    { fromX: 2, fromY: 1, toX: 3, toY: 1 }
  ];

  const comparison = CommandEngine.compareLineFigures(incompleteDrawing, targetLines);
  assert.equal(comparison.isExactMatch, false);
  assert.equal(comparison.matchedCount, 3);
  assert.equal(comparison.targetCount, 4);
  assert.equal(comparison.actualCount, 4);
  assert.equal(comparison.missingCount, 1);
  assert.equal(comparison.extraCount, 1);
  assert.equal(comparison.retracedCount, 2);
});

test('minimum drawing distance matches an independent exhaustive walk search', () => {
  const candidateEdges = [
    { fromX: 0, fromY: 0, toX: 1, toY: 0 },
    { fromX: 1, fromY: 0, toX: 1, toY: 1 },
    { fromX: 1, fromY: 1, toX: 0, toY: 1 },
    { fromX: 0, fromY: 1, toX: 0, toY: 0 },
    { fromX: 0, fromY: 0, toX: 1, toY: 1 },
    { fromX: 1, fromY: 0, toX: 0, toY: 1 }
  ];
  const starts = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 }
  ];
  const pointKey = point => `${point.x},${point.y}`;

  const exhaustiveDistance = (start, targetLines) => {
    const adjacency = new Map();
    const edgeByPair = new Map();
    targetLines.forEach((line, edgeIndex) => {
      const from = pointKey({ x: line.fromX, y: line.fromY });
      const to = pointKey({ x: line.toX, y: line.toY });
      if (!adjacency.has(from)) adjacency.set(from, []);
      if (!adjacency.has(to)) adjacency.set(to, []);
      adjacency.get(from).push({ next: to, edgeIndex });
      adjacency.get(to).push({ next: from, edgeIndex });
      edgeByPair.set([from, to].sort().join('|'), edgeIndex);
    });

    const startKey = pointKey(start);
    if (!adjacency.has(startKey)) return Number.POSITIVE_INFINITY;
    const completeMask = (1 << targetLines.length) - 1;
    const vertices = starts.map(pointKey);
    const queue = [{ vertex: startKey, mask: 0, penDown: true, distance: 0 }];
    const best = new Map([[`${startKey}|0|true`, 0]]);

    while (queue.length > 0) {
      queue.sort((first, second) => first.distance - second.distance);
      const current = queue.shift();
      const currentKey = `${current.vertex}|${current.mask}|${current.penDown}`;
      if (best.get(currentKey) !== current.distance) continue;
      if (current.mask === completeMask) return current.distance;

      const toggleKey = `${current.vertex}|${current.mask}|${!current.penDown}`;
      if ((best.get(toggleKey) ?? Number.POSITIVE_INFINITY) > current.distance) {
        best.set(toggleKey, current.distance);
        queue.push({ ...current, penDown: !current.penDown });
      }

      const [currentX, currentY] = current.vertex.split(',').map(Number);
      for (const next of vertices) {
        if (next === current.vertex) continue;
        const [nextX, nextY] = next.split(',').map(Number);
        if (Math.max(Math.abs(nextX - currentX), Math.abs(nextY - currentY)) !== 1) continue;
        const edgeIndex = edgeByPair.get([current.vertex, next].sort().join('|'));
        if (current.penDown && !Number.isInteger(edgeIndex)) continue;
        const nextMask = current.penDown ? current.mask | (1 << edgeIndex) : current.mask;
        const stateKey = `${next}|${nextMask}|${current.penDown}`;
        const nextDistance = current.distance + 1;
        if ((best.get(stateKey) ?? Number.POSITIVE_INFINITY) <= nextDistance) continue;
        best.set(stateKey, nextDistance);
        queue.push({ vertex: next, mask: nextMask, penDown: current.penDown, distance: nextDistance });
      }
    }

    return Number.POSITIVE_INFINITY;
  };

  for (let edgeMask = 1; edgeMask < (1 << candidateEdges.length); edgeMask++) {
    const targetLines = candidateEdges.filter((_, edgeIndex) => (
      edgeMask & (1 << edgeIndex)
    ));
    for (const start of starts) {
      assert.equal(
        CommandEngine.getMinimumDrawingDistance(start, targetLines),
        exhaustiveDistance(start, targetLines),
        `edge mask ${edgeMask}, start ${pointKey(start)}`
      );
    }
  }
});

test('every drawing problem stores a valid exact minimum movement count', () => {
  for (const mode of ['debug', 'debug_guide']) {
    for (const level of PRESET_LEVELS[mode]) {
      const targetPathDistance = CommandEngine
        .expandLinesToUnitSteps(level.targetLines)
        .length;
      const visibleEdgeCount = CommandEngine
        .compareLineFigures([], level.targetLines)
        .targetCount;
      const calculatedMinimum = CommandEngine.getMinimumDrawingDistance(
        level.starPos,
        level.targetLines
      );

      assert.equal(level.minimumDrawingDistance, calculatedMinimum, level.title);
      assert.ok(calculatedMinimum >= visibleEdgeCount, level.title);
      assert.ok(calculatedMinimum <= targetPathDistance, level.title);
    }
  }
});

test('completed drawings separate ordinary success from minimum-move success', () => {
  const targetLines = [
    { fromX: 0, fromY: 0, toX: 1, toY: 0 },
    { fromX: 1, fromY: 0, toX: 1, toY: 1 },
    { fromX: 1, fromY: 1, toX: 0, toY: 1 },
    { fromX: 0, fromY: 1, toX: 0, toY: 0 }
  ];
  const minimumAttempt = [...targetLines];
  const longerAttempt = [
    targetLines[0],
    { fromX: 1, fromY: 0, toX: 0, toY: 0 },
    ...targetLines
  ];
  const minimumAssessment = CommandEngine.assessDrawingAttempt(
    { x: 0, y: 0 },
    minimumAttempt,
    targetLines
  );
  const longerAssessment = CommandEngine.assessDrawingAttempt(
    { x: 0, y: 0 },
    longerAttempt,
    targetLines
  );

  assert.equal(minimumAssessment.minimumDistance, 4);
  assert.equal(minimumAssessment.isMinimum, true);
  assert.equal(longerAssessment.isExactMatch, true);
  assert.equal(longerAssessment.actualDistance, 6);
  assert.equal(longerAssessment.extraDistance, 2);
  assert.equal(classifyDrawingOutcome(false, minimumAssessment), 'perfect');
  assert.equal(classifyDrawingOutcome(false, longerAssessment), 'success');
  assert.equal(classifyDrawingOutcome(true, longerAssessment), 'retry');

  const perfectCopy = getDrawingSuccessResultCopy(minimumAssessment, 4);
  const ordinaryCopy = getDrawingSuccessResultCopy(longerAssessment, 4);
  assert.match(perfectCopy.title, /최소 붓 이동/);
  assert.match(perfectCopy.badge, /최소 기록 4칸/);
  assert.equal(ordinaryCopy.title, '✨ 축하합니다! 목표 그림을 완성했어요!');
  assert.doesNotMatch(ordinaryCopy.title, /완벽/);
  assert.match(ordinaryCopy.badge, /그림 완성 6칸 · 최소 4칸/);
});

test('minimum drawing distance counts movement made while the pen is lifted', () => {
  const targetLines = [
    { fromX: 0, fromY: 0, toX: 1, toY: 0 },
    { fromX: 1, fromY: 0, toX: 1, toY: 1 },
    { fromX: 1, fromY: 1, toX: 0, toY: 1 },
    { fromX: 0, fromY: 1, toX: 0, toY: 0 }
  ];
  const commands = [
    { dir: 'PEN_UP' },
    { dir: 'RIGHT', distance: 1 },
    { dir: 'LEFT', distance: 1 },
    { dir: 'PEN_DOWN' },
    { dir: 'RIGHT', distance: 1 },
    { dir: 'DOWN', distance: 1 },
    { dir: 'LEFT', distance: 1 },
    { dir: 'UP', distance: 1 }
  ];
  const result = CommandEngine.simulate({ x: 0, y: 0 }, commands, 3, []);
  const assessment = CommandEngine.assessDrawingAttempt(
    { x: 0, y: 0 },
    result.lines,
    targetLines,
    commands
  );

  assert.equal(assessment.isExactMatch, true);
  assert.equal(assessment.minimumDistance, 4);
  assert.equal(assessment.actualDistance, 6);
  assert.equal(assessment.isMinimum, false);
});

test('drawing banks include retraced paths for more varied connected figures', () => {
  const segmentKey = line => {
    const from = `${line.fromX},${line.fromY}`;
    const to = `${line.toX},${line.toY}`;
    return from < to ? `${from}|${to}` : `${to}|${from}`;
  };

  for (const mode of ['debug', 'debug_guide']) {
    for (const gridSize of DRAWING_GRID_SIZES) {
      const levels = PRESET_LEVELS[mode]
        .filter(level => level.gridSize === gridSize);
      const figureSignatures = levels.map(level => {
        const unitLines = CommandEngine.expandLinesToUnitSteps(level.targetLines);
        return [...new Set(unitLines.map(segmentKey))].sort().join(';');
      });
      const retracedLevels = levels
        .filter(level => {
          const unitLines = CommandEngine.expandLinesToUnitSteps(level.targetLines);
          return new Set(unitLines.map(segmentKey)).size < unitLines.length;
        });
      const openEndedLevels = levels.filter(level => {
        const finalLine = level.targetLines.at(-1);
        return (
          finalLine.toX !== level.starPos.x ||
          finalLine.toY !== level.starPos.y
        );
      });
      assert.equal(
        new Set(figureSignatures).size,
        levels.length,
        `${mode} ${gridSize}x${gridSize}: duplicate visible figure`
      );
      assert.ok(
        retracedLevels.length >= 5,
        `${mode} ${gridSize}x${gridSize}: needs at least five retraced-path figures`
      );
      assert.ok(
        openEndedLevels.length >= 5,
        `${mode} ${gridSize}x${gridSize}: too many figures force the brush to return to its start`
      );
    }
  }
});

test('problem titles and guides do not reveal the intended shape or route', () => {
  const hintWords = [
    '대각선', '직진', '곡선', '삼각형', '삼각', '사각형', '사각',
    '집', '지붕', '왕관', '다이아몬드', '마름모', '별', '나무',
    '계단', '십자', '장벽', '요새', '미로', '포위', '길목', '코너',
    'L자', '비대칭', '수직', '수평', '세로', '가로',
    '왼쪽', '오른쪽', '위쪽', '아래쪽', '반전', '회전', '전환'
  ];

  for (const levelList of Object.values(PRESET_LEVELS)) {
    for (const level of levelList.flat()) {
      const visibleProblemCopy = `${level.title} ${level.guide || ''}`;
      for (const hintWord of hintWords) {
        assert.equal(
          visibleProblemCopy.includes(hintWord),
          false,
          `${level.title}: visible copy reveals “${hintWord}”`
        );
      }
    }
  }
});

test('drawing banks use intentional recognizable motif catalogs without title hints', () => {
  const expectedMotifs = {
    debug: {
      5: [
        'apple', 'boat', 'camera', 'cat-head', 'crown', 'envelope', 'fish',
        'heart', 'house', 'mushroom', 'rabbit-head', 'shirt', 'sparkle',
        'tree', 'umbrella'
      ],
      7: [
        'anchor', 'car', 'cup', 'flag', 'flower', 'gift', 'glasses', 'key',
        'kite', 'leaf', 'pencil', 'rocket', 'snail', 'spiral', 'star-outline'
      ],
      9: [
        'balloon', 'bird', 'bridge', 'butterfly', 'castle', 'diamond-flower',
        'hourglass', 'ladder', 'mountains', 'music-notes', 'pinwheel', 'robot',
        'tent', 'turtle', 'zigzag-shield'
      ]
    },
    debug_guide: {
      5: [
        'bird', 'butterfly', 'car', 'castle', 'cup', 'flower', 'gift',
        'glasses', 'key', 'kite', 'leaf', 'pinwheel', 'robot', 'tent', 'turtle'
      ],
      7: [
        'boat', 'cat-head', 'crown', 'envelope', 'fish', 'heart', 'house',
        'mountains', 'rabbit-head', 'rocket', 'snail', 'sparkle', 'spiral',
        'tree', 'umbrella'
      ],
      9: [
        'anchor', 'apple', 'balloon', 'bridge', 'camera', 'diamond-flower',
        'flag', 'hourglass', 'ladder', 'mushroom', 'music-notes', 'pencil',
        'shirt', 'star-outline', 'zigzag-shield'
      ]
    }
  };

  for (const [mode, motifsBySize] of Object.entries(expectedMotifs)) {
    const usedMotifs = new Set();
    for (const gridSize of DRAWING_GRID_SIZES) {
      const levels = PRESET_LEVELS[mode].filter(level => level.gridSize === gridSize);
      const motifIds = motifsBySize[gridSize];
      assert.deepEqual(
        levels.map(level => level.motifId).sort(),
        motifIds,
        `${mode} ${gridSize}x${gridSize}: recognizable motif catalog changed`
      );
      assert.ok(levels.every(level => (
        !level.title.includes(level.motifId) &&
        !level.guide.includes(level.motifId)
      )));
      motifIds.forEach(motifId => usedMotifs.add(motifId));
    }
    assert.equal(usedMotifs.size, 45, `${mode}: same motif was reused as a simple size variation`);
  }
});

test('small-grid rabbit, turtle and bird keep their recognizable feature lines', () => {
  const segmentKey = line => {
    const from = `${line.fromX},${line.fromY}`;
    const to = `${line.toX},${line.toY}`;
    return from < to ? `${from}|${to}` : `${to}|${from}`;
  };
  const expectedSignatures = {
    'debug:rabbit-head': [
      '0,0|1,0', '0,0|1,1', '0,3|1,2', '0,3|1,4', '1,0|1,1',
      '1,1|1,2', '1,1|2,2', '1,2|2,3', '1,3|1,4', '1,3|2,4',
      '1,4|2,4', '2,1|2,2', '2,1|3,0', '2,3|3,2', '2,4|3,3',
      '2,4|3,4', '3,0|4,0', '3,2|4,1', '3,2|4,3', '3,3|3,4',
      '3,4|4,3', '4,0|4,1'
    ],
    'debug_guide:turtle': [
      '0,0|1,1', '0,2|1,1', '0,2|1,3', '0,4|1,3', '1,1|2,1',
      '1,3|2,3', '2,1|3,0', '2,1|3,2', '2,3|3,2', '2,3|3,4',
      '3,2|4,2'
    ],
    'debug_guide:bird': [
      '0,1|1,0', '0,1|1,2', '1,0|2,0', '1,1|2,0', '1,1|2,2',
      '1,2|1,3', '1,2|2,2', '2,0|2,1', '2,0|3,1', '2,1|2,2',
      '2,2|2,3', '2,2|3,1', '3,1|4,1', '3,1|4,2', '4,1|4,2'
    ]
  };

  for (const [problemKey, expectedSignature] of Object.entries(expectedSignatures)) {
    const [mode, motifId] = problemKey.split(':');
    const level = PRESET_LEVELS[mode].find(candidate => (
      candidate.gridSize === 5 && candidate.motifId === motifId
    ));
    assert.ok(level, `${problemKey}: missing 5x5 motif`);
    const actualSignature = [...new Set(
      CommandEngine.expandLinesToUnitSteps(level.targetLines).map(segmentKey)
    )].sort();
    assert.deepEqual(actualSignature, expectedSignature, `${problemKey}: feature lines changed`);
  }
});

test('every missile problem has a verified shortest route', () => {
  const independentShortestDistance = level => {
    const blocked = new Set((level.obstacles || []).map(({ x, y }) => `${x},${y}`));
    const queue = [{ ...level.starPos, distance: 0 }];
    const visited = new Set([`${level.starPos.x},${level.starPos.y}`]);
    const moves = Object.values(DIRECTIONS);

    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      if (current.x === level.goalPos.x && current.y === level.goalPos.y) {
        return current.distance;
      }
      for (const move of moves) {
        const x = current.x + move.dx;
        const y = current.y + move.dy;
        const key = `${x},${y}`;
        if (
          x < 0 || x >= level.gridSize || y < 0 || y >= level.gridSize ||
          blocked.has(key) || visited.has(key)
        ) continue;
        visited.add(key);
        queue.push({ x, y, distance: current.distance + 1 });
      }
    }
    return Number.POSITIVE_INFINITY;
  };

  for (const mode of ['shortest', 'routing']) {
    for (const level of PRESET_LEVELS[mode]) {
      const validation = CommandEngine.validateRouteScenario(
        level.starPos,
        level.goalPos,
        level.gridSize,
        level.obstacles || []
      );
      assert.equal(validation.isValid, true, `${level.title}: ${validation.reason}`);

      const commands = CommandEngine.findShortestPath(
        level.starPos,
        level.goalPos,
        level.gridSize,
        level.obstacles || []
      );
      const result = CommandEngine.simulate(
        level.starPos,
        commands,
        level.gridSize,
        level.obstacles || []
      );
      const commandDistance = CommandEngine.expandToStepList(commands).length;
      const independentDistance = independentShortestDistance(level);
      const plainDistance = Math.max(
        Math.abs(level.starPos.x - level.goalPos.x),
        Math.abs(level.starPos.y - level.goalPos.y)
      );
      const obstacleKeys = new Set(
        (level.obstacles || []).map(({ x, y }) => `${x},${y}`)
      );

      assert.equal(
        obstacleKeys.size,
        (level.obstacles || []).length,
        `${level.title}: duplicate obstacle`
      );
      assert.equal(
        obstacleKeys.has(`${level.starPos.x},${level.starPos.y}`),
        false,
        `${level.title}: obstacle on start`
      );
      assert.equal(
        obstacleKeys.has(`${level.goalPos.x},${level.goalPos.y}`),
        false,
        `${level.title}: obstacle on goal`
      );
      assert.equal(result.hitWall, false, `${level.title}: shortest route hits wall`);
      assert.equal(result.hitObstacle, false, `${level.title}: shortest route hits obstacle`);
      assert.deepEqual(result.finalPos, level.goalPos, `${level.title}: shortest route misses goal`);
      assert.equal(commandDistance, independentDistance, `${level.title}: route is not minimal`);
      assert.ok(
        independentDistance >= plainDistance,
        `${level.title}: obstacles cannot make the route shorter`
      );
      assert.equal(
        CommandEngine.getShortestDistance(
          level.starPos,
          level.goalPos,
          level.gridSize,
          level.obstacles || []
        ),
        independentDistance,
        `${level.title}: displayed minimum is wrong`
      );

      const minimumCommandAnalysis = CommandEngine.analyzeMinimumCommands(
        level.starPos,
        level.goalPos,
        level.gridSize,
        level.obstacles || []
      );
      const minimumCommandResult = CommandEngine.simulate(
        level.starPos,
        minimumCommandAnalysis.commands,
        level.gridSize,
        level.obstacles || []
      );
      assert.ok(
        Number.isFinite(minimumCommandAnalysis.commandCount) &&
        minimumCommandAnalysis.commandCount > 0,
        `${level.title}: minimum command answer is missing`
      );
      assert.equal(
        minimumCommandAnalysis.commands.length,
        minimumCommandAnalysis.commandCount,
        `${level.title}: minimum command count differs from its answer`
      );
      assert.equal(minimumCommandResult.hitWall, false, `${level.title}: minimum command answer hits a wall`);
      assert.equal(minimumCommandResult.hitObstacle, false, `${level.title}: minimum command answer hits an obstacle`);
      assert.deepEqual(
        minimumCommandResult.finalPos,
        level.goalPos,
        `${level.title}: minimum command answer misses goal`
      );

      const answerCatalog = CommandEngine.enumerateShortestPaths(
        level.starPos,
        level.goalPos,
        level.gridSize,
        level.obstacles || []
      );
      assert.equal(answerCatalog.isComplete, true, `${level.title}: answer catalog is truncated`);
      assert.equal(answerCatalog.paths.length, level.solutionCount, `${level.title}: missing shortest answers`);
      assert.equal(
        new Set(answerCatalog.pathSignatures).size,
        level.solutionCount,
        `${level.title}: duplicate shortest answers`
      );
      assert.deepEqual(
        level.shortestSolutionSignatures,
        answerCatalog.pathSignatures,
        `${level.title}: stored answer catalog differs from the solver`
      );
      for (const path of answerCatalog.paths) {
        const answerResult = CommandEngine.simulate(
          level.starPos,
          CommandEngine.compressStepList(path),
          level.gridSize,
          level.obstacles || []
        );
        assert.equal(answerResult.hitWall, false, `${level.title}: catalog answer hits a wall`);
        assert.equal(answerResult.hitObstacle, false, `${level.title}: catalog answer hits an obstacle`);
        assert.deepEqual(answerResult.finalPos, level.goalPos, `${level.title}: catalog answer misses goal`);
        assert.equal(path.length, independentDistance, `${level.title}: catalog contains a longer route`);
      }
    }
  }
});

test('shortest distance handles zero-step and invalid endpoint edge cases', () => {
  assert.equal(
    CommandEngine.getShortestDistance(
      { x: 1, y: 1 },
      { x: 1, y: 1 },
      3,
      [{ x: 0, y: 0 }]
    ),
    0
  );
  assert.equal(
    CommandEngine.getShortestDistance(
      { x: 1, y: 1 },
      { x: 1, y: 1 },
      3,
      [{ x: 1, y: 1 }]
    ),
    Number.POSITIVE_INFINITY
  );
  assert.equal(
    CommandEngine.getShortestDistance(
      { x: -1, y: 0 },
      { x: 2, y: 2 },
      3,
      []
    ),
    Number.POSITIVE_INFINITY
  );
});

test('shortest path analysis counts different optimal command sequences exactly', () => {
  assert.deepEqual(
    CommandEngine.analyzeShortestPaths(
      { x: 0, y: 0 },
      { x: 2, y: 1 },
      3,
      []
    ),
    { distance: 2, pathCount: 2 }
  );
  assert.deepEqual(
    CommandEngine.analyzeShortestPaths(
      { x: 0, y: 0 },
      { x: 2, y: 1 },
      3,
      [{ x: 1, y: 0 }]
    ),
    { distance: 2, pathCount: 1 }
  );
});

test('route validation rejects malformed or completely blocked problems', () => {
  assert.equal(
    CommandEngine.validateRouteScenario(
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      3,
      [{ x: 0, y: 0 }]
    ).reason,
    'obstacle_on_start'
  );
  assert.equal(
    CommandEngine.validateRouteScenario(
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      3,
      [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]
    ).reason,
    'goal_unreachable'
  );
});

test('shortest distance matches exhaustive independent search on every 3x3 obstacle map', () => {
  const gridSize = 3;
  const cells = Array.from({ length: gridSize * gridSize }, (_, index) => ({
    x: index % gridSize,
    y: Math.floor(index / gridSize)
  }));
  const moves = Object.values(DIRECTIONS);

  const independentDistance = (start, goal, obstacles) => {
    const blocked = new Set(obstacles.map(({ x, y }) => `${x},${y}`));
    const startKey = `${start.x},${start.y}`;
    const goalKey = `${goal.x},${goal.y}`;
    if (blocked.has(startKey) || blocked.has(goalKey)) return Number.POSITIVE_INFINITY;
    if (startKey === goalKey) return 0;

    const queue = [{ ...start, distance: 0 }];
    const visited = new Set([startKey]);
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      for (const move of moves) {
        const x = current.x + move.dx;
        const y = current.y + move.dy;
        const key = `${x},${y}`;
        if (
          x < 0 || x >= gridSize || y < 0 || y >= gridSize ||
          blocked.has(key) || visited.has(key)
        ) continue;
        if (key === goalKey) return current.distance + 1;
        visited.add(key);
        queue.push({ x, y, distance: current.distance + 1 });
      }
    }
    return Number.POSITIVE_INFINITY;
  };

  for (let obstacleMask = 0; obstacleMask < 2 ** cells.length; obstacleMask++) {
    const obstacles = cells.filter((_, index) => obstacleMask & (1 << index));
    for (const start of cells) {
      for (const goal of cells) {
        const expected = independentDistance(start, goal, obstacles);
        const actual = CommandEngine.getShortestDistance(
          start,
          goal,
          gridSize,
          obstacles
        );
        assert.equal(
          actual,
          expected,
          `mask ${obstacleMask}, ${start.x},${start.y} → ${goal.x},${goal.y}`
        );
      }
    }
  }
});

test('minimum-command analysis keeps command count separate from movement distance', () => {
  assert.deepEqual(MISSILE_SOLUTION_RULES, ['shortest', 'minimum_commands']);

  const level = {
    gridSize: 7,
    starPos: { x: 0, y: 4 },
    goalPos: { x: 5, y: 0 },
    obstacles: []
  };
  const threeCommands = [
    { dir: 'UP_RIGHT', distance: 3 },
    { dir: 'RIGHT', distance: 1 },
    { dir: 'UP_RIGHT', distance: 1 }
  ];
  const twoCommands = [
    { dir: 'UP_RIGHT', distance: 4 },
    { dir: 'RIGHT', distance: 1 }
  ];
  const threeCommandResult = CommandEngine.simulate(
    level.starPos,
    threeCommands,
    level.gridSize,
    level.obstacles
  );
  const twoCommandResult = CommandEngine.simulate(
    level.starPos,
    twoCommands,
    level.gridSize,
    level.obstacles
  );
  const threeCommandAssessment = assessMinimumCommandAttempt(
    level,
    threeCommands,
    threeCommandResult
  );
  const twoCommandAssessment = assessMinimumCommandAttempt(
    level,
    twoCommands,
    twoCommandResult
  );

  assert.equal(threeCommandAssessment.traveledDistance, 5);
  assert.equal(threeCommandAssessment.isShortest, true);
  assert.equal(threeCommandAssessment.commandCount, 3);
  assert.equal(threeCommandAssessment.minimumCommandCount, 2);
  assert.equal(threeCommandAssessment.isMinimumCommand, false);
  assert.equal(threeCommandAssessment.extraCommands, 1);
  assert.equal(classifyMissileOutcome('shortest', 'shortest', threeCommandAssessment), 'success');
  assert.equal(classifyMissileOutcome('shortest', 'minimum_commands', threeCommandAssessment), 'retry');
  assert.equal(twoCommandAssessment.isMinimumCommand, true);
  assert.equal(classifyMissileOutcome('shortest', 'minimum_commands', twoCommandAssessment), 'success');
});

test('minimum-command analysis normalizes adjacent commands with the same direction', () => {
  const level = {
    gridSize: 5,
    starPos: { x: 0, y: 0 },
    goalPos: { x: 4, y: 0 },
    obstacles: []
  };
  const splitCommands = [
    { dir: 'RIGHT', distance: 2 },
    { dir: 'RIGHT', distance: 2 }
  ];
  const result = CommandEngine.simulate(
    level.starPos,
    splitCommands,
    level.gridSize,
    level.obstacles
  );
  const assessment = assessMinimumCommandAttempt(level, splitCommands, result);

  assert.equal(assessment.commandCount, 1);
  assert.equal(assessment.minimumCommandCount, 1);
  assert.equal(assessment.isMinimumCommand, true);
});

test('minimum-command count matches independent direction-change search on every 3x3 obstacle map', () => {
  const gridSize = 3;
  const cells = Array.from({ length: gridSize * gridSize }, (_, index) => ({
    x: index % gridSize,
    y: Math.floor(index / gridSize)
  }));
  const moves = Object.values(DIRECTIONS);

  const independentCommandCount = (start, goal, obstacles) => {
    const blocked = new Set(obstacles.map(({ x, y }) => `${x},${y}`));
    const startKey = `${start.x},${start.y}`;
    const goalKey = `${goal.x},${goal.y}`;
    if (blocked.has(startKey) || blocked.has(goalKey)) return Number.POSITIVE_INFINITY;
    if (startKey === goalKey) return 0;

    const initialStateKey = `${startKey},NONE`;
    const queue = [{ ...start, lastDir: 'NONE', commandCount: 0 }];
    const distances = new Map([[initialStateKey, 0]]);

    while (queue.length > 0) {
      const current = queue.shift();
      const currentStateKey = `${current.x},${current.y},${current.lastDir}`;
      if (current.commandCount !== distances.get(currentStateKey)) continue;

      for (const move of moves) {
        const x = current.x + move.dx;
        const y = current.y + move.dy;
        const positionKey = `${x},${y}`;
        if (
          x < 0 || x >= gridSize || y < 0 || y >= gridSize ||
          blocked.has(positionKey)
        ) continue;

        const commandCount = current.commandCount + (current.lastDir === move.id ? 0 : 1);
        const stateKey = `${positionKey},${move.id}`;
        if (commandCount >= (distances.get(stateKey) ?? Number.POSITIVE_INFINITY)) continue;
        distances.set(stateKey, commandCount);
        const nextState = { x, y, lastDir: move.id, commandCount };
        if (current.lastDir === move.id) queue.unshift(nextState);
        else queue.push(nextState);
      }
    }

    return Math.min(
      ...moves.map(move => distances.get(`${goalKey},${move.id}`) ?? Number.POSITIVE_INFINITY)
    );
  };

  for (let obstacleMask = 0; obstacleMask < 2 ** cells.length; obstacleMask++) {
    const obstacles = cells.filter((_, index) => obstacleMask & (1 << index));
    for (const start of cells) {
      for (const goal of cells) {
        const expected = independentCommandCount(start, goal, obstacles);
        const actual = CommandEngine.getMinimumCommandCount(
          start,
          goal,
          gridSize,
          obstacles
        );
        assert.equal(
          actual,
          expected,
          `mask ${obstacleMask}, ${start.x},${start.y} → ${goal.x},${goal.y}`
        );
      }
    }
  }
});

test('obstacle attempts distinguish a shortest safe route from a longer detour', () => {
  const level = PRESET_LEVELS.routing[0];
  const shortestCommands = CommandEngine.findShortestPath(
    level.starPos,
    level.goalPos,
    level.gridSize,
    level.obstacles
  );
  const shortestResult = CommandEngine.simulate(
    level.starPos,
    shortestCommands,
    level.gridSize,
    level.obstacles
  );
  const obstacleKeys = new Set(level.obstacles.map(({ x, y }) => `${x},${y}`));
  const oppositeDirection = {
    UP: 'DOWN',
    UP_RIGHT: 'DOWN_LEFT',
    RIGHT: 'LEFT',
    DOWN_RIGHT: 'UP_LEFT',
    DOWN: 'UP',
    DOWN_LEFT: 'UP_RIGHT',
    LEFT: 'RIGHT',
    UP_LEFT: 'DOWN_RIGHT'
  };
  const freeMove = Object.values(DIRECTIONS).find(direction => {
    const x = level.starPos.x + direction.dx;
    const y = level.starPos.y + direction.dy;
    return (
      x >= 0 && x < level.gridSize &&
      y >= 0 && y < level.gridSize &&
      !obstacleKeys.has(`${x},${y}`)
    );
  });
  const detourResult = CommandEngine.simulate(
    level.starPos,
    [
      { dir: freeMove.id, distance: 1 },
      { dir: oppositeDirection[freeMove.id], distance: 1 },
      ...shortestCommands
    ],
    level.gridSize,
    level.obstacles
  );

  const shortestAssessment = assessRouteAttempt(level, shortestResult);
  const detourAssessment = assessRouteAttempt(level, detourResult);
  assert.equal(shortestAssessment.isShortest, true);
  assert.equal(detourAssessment.reachedGoal, true);
  assert.equal(detourAssessment.isShortest, false);
  assert.equal(detourAssessment.extraDistance, 2);
  assert.equal(classifyMissileOutcome('routing', 'shortest', shortestAssessment), 'success');
  assert.equal(classifyMissileOutcome('routing', 'shortest', detourAssessment), 'retry');
});

test('multiple-solution mode accepts only new shortest direction sequences', () => {
  assert.equal(getActiveMissileSolutionRule('multisolution', 'minimum_commands'), 'shortest');
  assert.equal(getActiveMissileSolutionRule('stage', 'minimum_commands'), 'minimum_commands');
  assert.equal(getActiveMissileSolutionRule('stage', 'unknown'), 'shortest');

  const grouped = [{ dir: 'RIGHT', distance: 2 }];
  const split = [
    { dir: 'RIGHT', distance: 1 },
    { dir: 'RIGHT', distance: 1 }
  ];
  const alternate = [
    { dir: 'UP_RIGHT', distance: 1 },
    { dir: 'DOWN_RIGHT', distance: 1 }
  ];
  assert.equal(getRouteSolutionSignature(grouped), 'RIGHT>RIGHT');
  assert.equal(getRouteSolutionSignature(grouped), getRouteSolutionSignature(split));
  assert.notEqual(getRouteSolutionSignature(grouped), getRouteSolutionSignature(alternate));
  assert.equal(formatCommandCombination(grouped), '[2→]');
  assert.equal(formatCommandCombination(alternate), '[1↗] [1↘]');

  const app = Object.create(App.prototype);
  app.multiSolutionSignatures = new Set();
  app.multiSolutionAnswerSignatures = new Set([
    'RIGHT>RIGHT',
    'UP_RIGHT>DOWN_RIGHT'
  ]);
  app.multiSolutionTargetCount = 2;
  app.multiSolutionGoalCount = getMultiSolutionGoalCount(
    app.multiSolutionTargetCount
  );
  const shortestAssessment = { reachedGoal: true, isShortest: true };

  assert.deepEqual(
    app.recordMultiSolutionAttempt(grouped, shortestAssessment),
    {
      accepted: true,
      reason: 'new',
      signature: 'RIGHT>RIGHT',
      display: '[2→]',
      count: 1,
      targetCount: 2,
      answerCount: 2,
      isComplete: false,
      justCompleted: false
    }
  );
  assert.deepEqual(
    app.recordMultiSolutionAttempt(split, shortestAssessment),
    { accepted: false, reason: 'duplicate', count: 1, previousNumber: 1 }
  );
  assert.deepEqual(
    app.recordMultiSolutionAttempt(grouped, { reachedGoal: true, isShortest: false }),
    { accepted: false, reason: 'not_shortest', count: 1 }
  );
  assert.deepEqual(
    app.recordMultiSolutionAttempt(
      [{ dir: 'UP', distance: 2 }],
      shortestAssessment
    ),
    { accepted: false, reason: 'not_in_answer_catalog', count: 1 }
  );
  assert.deepEqual(
    app.recordMultiSolutionAttempt(alternate, shortestAssessment),
    {
      accepted: true,
      reason: 'new',
      signature: 'UP_RIGHT>DOWN_RIGHT',
      display: '[1↗] [1↘]',
      count: 2,
      targetCount: 2,
      answerCount: 2,
      isComplete: true,
      justCompleted: true
    }
  );
});

test('multiple-solution goals are small while every catalogued shortest answer remains valid', () => {
  assert.equal(getMultiSolutionGoalCount(0), 0);
  assert.equal(getMultiSolutionGoalCount(1), 1);
  assert.equal(getMultiSolutionGoalCount(3), 3);
  assert.equal(getMultiSolutionGoalCount(200), 3);

  const level = PRESET_LEVELS.shortest.find(entry => entry.solutionCount >= 20);
  assert.ok(level, 'needs a problem with many shortest answers');

  const app = Object.create(App.prototype);
  app.multiSolutionSignatures = new Set();
  app.multiSolutionEntries = [];
  app.multiSolutionAnswerSignatures = new Set(level.shortestSolutionSignatures);
  app.multiSolutionTargetCount = app.multiSolutionAnswerSignatures.size;
  app.multiSolutionGoalCount = getMultiSolutionGoalCount(app.multiSolutionTargetCount);

  const assessment = { reachedGoal: true, isShortest: true };
  const firstThree = level.shortestSolutionSignatures.slice(0, 3);
  for (const signature of firstThree) {
    const commands = signature.split('>').map(dir => ({ dir, distance: 1 }));
    assert.equal(app.recordMultiSolutionAttempt(commands, assessment).accepted, true);
  }
  assert.equal(app.multiSolutionSignatures.size, 3);
  assert.equal(app.multiSolutionGoalCount, 3);

  const additional = level.shortestSolutionSignatures.at(-1);
  const extraAttempt = app.recordMultiSolutionAttempt(
    additional.split('>').map(dir => ({ dir, distance: 1 })),
    assessment
  );
  assert.equal(extraAttempt.accepted, true);
  assert.equal(extraAttempt.isComplete, true);
  assert.equal(extraAttempt.justCompleted, false);
});

test('loading a new multiple-solution problem clears only that problem\'s route record', () => {
  const app = Object.create(App.prototype);
  app.challengeType = 'multisolution';
  app.currentMode = 'routing';
  app.challengeState = {
    solvedCount: 7,
    streak: 7,
    bestStreak: 7,
    score: 700,
    timeRemaining: 60
  };
  app.multiSolutionSignatures = new Set(['old-route']);
  app.multiSolutionTargetCount = 99;
  app.multiSolutionGoalCount = 3;
  app.updateChallengeUI = () => {};
  const level = PRESET_LEVELS.routing[0];

  app.resetMultiSolutionProgress(level);

  assert.equal(app.multiSolutionSignatures.size, 0);
  assert.equal(app.challengeState.solvedCount, 0);
  assert.equal(app.challengeState.streak, 0);
  assert.equal(app.challengeState.bestStreak, 0);
  assert.equal(app.challengeState.score, 0);
  assert.equal(app.multiSolutionTargetCount, level.solutionCount);
  assert.equal(app.multiSolutionGoalCount, 3);
  assert.equal(app.multiSolutionAnswerSignatures.size, level.solutionCount);
  assert.deepEqual(app.multiSolutionEntries, []);
});

test('missile solution rule switches between shortest movement and minimum commands', () => {
  const app = Object.create(App.prototype);
  app.currentMode = 'routing';
  app.missileSolutionRule = 'shortest';
  app.executionId = 1;
  app.isExecuting = false;
  app.challengeType = 'stage';
  app.stopChallengeTimer = () => {};
  app.closeAllModals = () => {};
  app.resetChallengeProgress = () => {};
  app.updateMissileSolutionRuleControl = () => {};
  app.loadLevel = () => {};
  app.updateModeHierarchySummary = () => {};
  app.setStatus = () => {};

  assert.equal(app.setMissileSolutionRule('minimum_commands'), true);
  assert.equal(app.missileSolutionRule, 'minimum_commands');
  assert.equal(app.executionId, 2);

  app.currentMode = 'debug';
  assert.equal(app.setMissileSolutionRule('shortest'), false);
  assert.equal(app.missileSolutionRule, 'minimum_commands');

  app.currentMode = 'shortest';
  app.challengeType = 'multisolution';
  assert.equal(app.setMissileSolutionRule('minimum_commands'), false);
  assert.equal(app.missileSolutionRule, 'minimum_commands');
});

test('minimum-drawing setting is opt-in and resets the current challenge when changed', () => {
  const app = Object.create(App.prototype);
  app.currentMode = 'debug';
  app.requireMinimumDrawing = false;
  app.executionId = 3;
  app.isExecuting = false;
  app.challengeType = 'stage';
  app.stopChallengeTimer = () => {};
  app.closeAllModals = () => {};
  app.resetChallengeProgress = () => {};
  app.updateDrawingRuleControl = () => {};
  app.loadLevel = () => {};
  app.updateModeHierarchySummary = () => {};
  app.setStatus = () => {};

  assert.equal(app.setRequireMinimumDrawing(true), true);
  assert.equal(app.requireMinimumDrawing, true);
  assert.equal(app.executionId, 4);

  app.currentMode = 'routing';
  assert.equal(app.setRequireMinimumDrawing(false), false);
  assert.equal(app.requireMinimumDrawing, true);

  app.currentMode = 'debug_guide';
  assert.equal(app.setRequireMinimumDrawing(false), false);
  assert.equal(app.requireMinimumDrawing, true);

  app.currentMode = 'debug';
  app.challengeType = 'education';
  assert.equal(app.setRequireMinimumDrawing(false), false);
  assert.equal(app.requireMinimumDrawing, true);
});

test('drawing education immediately hides the ordinary minimum-brush rule control', () => {
  const previousDocument = globalThis.document;
  const control = { hidden: false };
  const toggle = { checked: false };
  const challengeSelect = { value: '' };
  globalThis.document = {
    getElementById(id) {
      return {
        'drawing-minimum-rule-control': control,
        'drawing-minimum-toggle': toggle,
        'challenge-mode-select': challengeSelect
      }[id] || null;
    }
  };

  try {
    const app = Object.create(App.prototype);
    let loaded = 0;
    Object.assign(app, {
      currentMode: 'debug',
      challengeType: 'stage',
      requireMinimumDrawing: true,
      executionId: 0,
      isExecuting: false,
      selectedGridSize: 5,
      selectedEducationLesson: 'draw_sequence',
      educationLessonSelections: { drawing: 'draw_sequence' },
      stopChallengeTimer: () => {},
      resetChallengeProgress: () => {},
      resetProblemDraws: () => {},
      resetEducationWorkspace: () => {},
      updateChallengeModeControl: () => {},
      ensureEducationLessonForCurrentMode: () => ({ sizes: [5] }),
      updateGridSizeControl: () => {},
      updateMissileSolutionRuleControl: () => {},
      loadLevel: () => { loaded += 1; },
      updateModeHierarchySummary: () => {},
      getActiveEducationLesson: () => ({
        title: '순서대로 그림 그리기',
        description: '명령 순서를 익혀요.'
      }),
      setStatus: () => {}
    });

    app.updateDrawingRuleControl();
    assert.equal(control.hidden, false);
    assert.equal(toggle.checked, true);

    assert.equal(app.switchChallengeMode('education'), true);
    assert.equal(loaded, 1);
    assert.equal(challengeSelect.value, 'education');
    assert.equal(control.hidden, true);

    app.challengeType = 'stage';
    app.updateDrawingRuleControl();
    assert.equal(control.hidden, false);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('different obstacle detours are accepted when both have minimum length', () => {
  const level = {
    gridSize: 5,
    starPos: { x: 0, y: 2 },
    goalPos: { x: 4, y: 2 },
    obstacles: [{ x: 2, y: 2 }]
  };
  const upperRoute = CommandEngine.simulate(
    level.starPos,
    [
      { dir: 'UP_RIGHT', distance: 1 },
      { dir: 'RIGHT', distance: 2 },
      { dir: 'DOWN_RIGHT', distance: 1 }
    ],
    level.gridSize,
    level.obstacles
  );
  const lowerRoute = CommandEngine.simulate(
    level.starPos,
    [
      { dir: 'DOWN_RIGHT', distance: 1 },
      { dir: 'RIGHT', distance: 2 },
      { dir: 'UP_RIGHT', distance: 1 }
    ],
    level.gridSize,
    level.obstacles
  );

  assert.equal(assessRouteAttempt(level, upperRoute).isShortest, true);
  assert.equal(assessRouteAttempt(level, lowerRoute).isShortest, true);
  assert.equal(CommandEngine.getShortestDistance(
    level.starPos,
    level.goalPos,
    level.gridSize,
    level.obstacles
  ), 4);
});

test('repeated direction input supports 9, 10, 11 and longer distances', () => {
  let commands = [];
  for (let index = 0; index < MAX_COMMAND_DISTANCE + 1; index++) {
    commands = appendDirectionCommand(commands, 'RIGHT');
  }

  assert.deepEqual(commands, [
    { dir: 'RIGHT', distance: MAX_COMMAND_DISTANCE },
    { dir: 'RIGHT', distance: 1 }
  ]);
  assert.equal(
    commands.every(command => command.distance <= MAX_COMMAND_DISTANCE),
    true
  );
});

test('9, 10 and 11-step commands execute without being truncated', () => {
  for (const distance of [9, 10, 11]) {
    const result = CommandEngine.simulate(
      { x: 0, y: 0 },
      [{ dir: 'RIGHT', distance }],
      distance + 1
    );

    assert.equal(result.hitWall, false);
    assert.equal(result.lines.length, distance);
    assert.deepEqual(result.finalPos, { x: distance, y: 0 });

    const validatedPuzzle = Encoder.validatePuzzleData({
      puzzleType: 'draw',
      gridSize: 9,
      starPos: { x: 0, y: 0 },
      targetLines: [{ fromX: 0, fromY: 0, toX: 1, toY: 0 }],
      initialCommands: [{ dir: 'RIGHT', distance }],
      title: `긴 이동 ${distance}칸`
    });
    assert.deepEqual(validatedPuzzle.initialCommands, [{ dir: 'RIGHT', distance }]);
  }
});

test('long command lists are interpreted in order without losing commands', () => {
  const commands = Array.from({ length: MAX_COMMAND_COUNT }, (_, index) => ({
    dir: index % 2 === 0 ? 'RIGHT' : 'LEFT',
    distance: 1
  }));
  const result = CommandEngine.simulate({ x: 3, y: 3 }, commands, 7);

  assert.equal(result.hitWall, false);
  assert.equal(result.hitObstacle, false);
  assert.equal(result.lines.length, MAX_COMMAND_COUNT);
  assert.deepEqual(result.finalPos, { x: 3, y: 3 });
});

test('routing worksheet answers reach the goal without hitting obstacles', () => {
  for (const level of PRESET_LEVELS.routing) {
    const commands = CommandEngine.findShortestPath(
      level.starPos,
      level.goalPos,
      level.gridSize,
      level.obstacles
    );
    const result = CommandEngine.simulate(
      level.starPos,
      commands,
      level.gridSize,
      level.obstacles
    );

    assert.ok(commands.length > 0, `${level.title}: no answer generated`);
    assert.equal(result.hitWall, false, `${level.title}: answer hits a wall`);
    assert.equal(result.hitObstacle, false, `${level.title}: answer hits an obstacle`);
    assert.deepEqual(result.finalPos, level.goalPos, `${level.title}: answer misses the goal`);
  }
});

test('obstacle-aware shortest distance uses the actual detour length', () => {
  for (const level of PRESET_LEVELS.routing) {
    const shortestCommands = CommandEngine.findShortestPath(
      level.starPos,
      level.goalPos,
      level.gridSize,
      level.obstacles
    );

    assert.equal(
      CommandEngine.getShortestDistance(
        level.starPos,
        level.goalPos,
        level.gridSize,
        level.obstacles
      ),
      CommandEngine.expandToStepList(shortestCommands).length,
      `${level.title}: displayed shortest distance must include detours`
    );
  }

  const level = PRESET_LEVELS.routing[0];
  const plainDistance = Math.max(
    Math.abs(level.goalPos.x - level.starPos.x),
    Math.abs(level.goalPos.y - level.starPos.y)
  );
  assert.equal(
    CommandEngine.getShortestDistance(level.starPos, level.goalPos),
    plainDistance,
    'without obstacles the plain 8-direction distance remains available'
  );
});

test('challenge and worksheet size selection respects activity-specific sizes', () => {
  assert.deepEqual(getSupportedGridSizesForMode('debug'), [5, 7, 9]);
  assert.deepEqual(getSupportedGridSizesForMode('debug_guide'), [5, 7, 9]);
  assert.deepEqual(getSupportedGridSizesForMode('shortest'), [5, 7, 9, 11]);

  for (const [mode, levelList] of Object.entries(PRESET_LEVELS)) {
    for (const size of getSupportedGridSizesForMode(mode)) {
      const matchingLevels = getLevelsForGridSize(levelList, size);
      assert.ok(matchingLevels.length > 0, `${mode}: missing ${size}x${size} level`);

      const worksheetProblems = WorksheetGenerator.collectProblems(
        mode,
        String(size),
        4,
        PRESET_LEVELS
      );
      assert.ok(
        worksheetProblems.every(problem => problem.gridSize === size),
        `${mode}: worksheet relabeled a level to the wrong grid size`
      );
    }
  }

  for (const mode of ['debug', 'debug_guide']) {
    const worksheetProblems = WorksheetGenerator.collectProblems(
      mode,
      '11',
      4,
      PRESET_LEVELS
    );
    assert.ok(
      worksheetProblems.every(problem => problem.gridSize === 9),
      `${mode}: an explicit 11x11 worksheet request must fall back to 9x9`
    );
  }

  const mixedElevenProblems = WorksheetGenerator.collectProblems(
    'mix',
    '11',
    8,
    PRESET_LEVELS
  );
  assert.ok(mixedElevenProblems.every(problem => problem.gridSize === 11));
  assert.ok(mixedElevenProblems.every(problem => (
    !['debug', 'debug_guide'].includes(problem.modeType)
  )));
});

test('shared puzzle validation rejects unsafe or unsolvable structures', () => {
  assert.equal(
    Encoder.validatePuzzleData({
      puzzleType: 'bomb',
      gridSize: 5,
      starPos: { x: 1, y: 5 },
      goalPos: { x: 4, y: 1 }
    }),
    null,
    'out-of-range start position must be rejected'
  );

  assert.equal(
    Encoder.validatePuzzleData({
      puzzleType: 'bomb',
      gridSize: 5,
      starPos: { x: 1, y: 1 },
      goalPos: { x: 1, y: 1 }
    }),
    null,
    'overlapping start and goal must be rejected'
  );

  assert.equal(
    Encoder.validatePuzzleData({
      puzzleType: 'draw',
      gridSize: 5,
      starPos: { x: 1, y: 3 },
      targetLines: []
    }),
    null,
    'empty drawing must be rejected'
  );

  const safeLegacyPuzzle = Encoder.validatePuzzleData({
    title: '공유 문제',
    puzzleType: 'bomb',
    gridSize: 5,
    starPos: { x: 0, y: 4 },
    goalPos: { x: 4, y: 0 },
    obstacles: [],
    guide: '<img src=x onerror=alert(1)>'
  });
  assert.ok(safeLegacyPuzzle);
  assert.equal(safeLegacyPuzzle.guide.includes('<'), false, 'legacy guide HTML must be discarded');

  assert.equal(
    Encoder.validatePuzzleData({
      puzzleType: 'bomb',
      gridSize: 5,
      starPos: { x: 2, y: 2 },
      goalPos: { x: 0, y: 0 },
      obstacles: [
        { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 },
        { x: 1, y: 2 },                   { x: 3, y: 2 },
        { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 }
      ]
    }),
    null,
    'a shared bomb puzzle with no reachable goal must be rejected'
  );
});

test('valid shared puzzles survive compact encode/decode', () => {
  const puzzle = {
    title: '안전한 그림 문제',
    puzzleType: 'draw',
    gridSize: 5,
    starPos: { x: 1, y: 3 },
    targetLines: [
      { fromX: 1, fromY: 3, toX: 1, toY: 1 },
      { fromX: 1, fromY: 1, toX: 3, toY: 3 }
    ]
  };

  const encoded = Encoder.encode(puzzle);
  assert.ok(encoded);
  assert.deepEqual(Encoder.decode(encoded), Encoder.validatePuzzleData(puzzle));
});

test('shared follow-the-commands puzzles preserve their fixed command list', () => {
  const source = {
    puzzleType: 'draw',
    gridSize: 5,
    starPos: { x: 1, y: 3 },
    targetLines: [
      { fromX: 1, fromY: 3, toX: 1, toY: 1 },
      { fromX: 1, fromY: 1, toX: 3, toY: 3 },
      { fromX: 3, fromY: 3, toX: 1, toY: 3 }
    ],
    initialCommands: [
      { dir: 'UP', distance: 2 },
      { dir: 'DOWN_RIGHT', distance: 2 },
      { dir: 'LEFT', distance: 2 }
    ],
    title: '명령 따라 그리기 공유 문제'
  };

  const restored = Encoder.decode(Encoder.encode(source));
  assert.deepEqual(restored?.initialCommands, source.initialCommands);
});

test('bomb and drawing share links round-trip for every supported grid size', () => {
  const location = {
    origin: 'https://pinky-ne.com',
    pathname: '/coding-drawing/'
  };

  for (const gridSize of [5, 7, 9, 11]) {
    const puzzles = [
      {
        title: `미사일 ${gridSize}`,
        puzzleType: 'bomb',
        gridSize,
        starPos: { x: 0, y: gridSize - 1 },
        goalPos: { x: gridSize - 1, y: 0 },
        obstacles: [{ x: Math.floor(gridSize / 2), y: Math.floor(gridSize / 2) }]
      },
      {
        title: `그림 ${gridSize}`,
        puzzleType: 'draw',
        gridSize,
        starPos: { x: 0, y: gridSize - 1 },
        targetLines: [
          { fromX: 0, fromY: gridSize - 1, toX: 1, toY: gridSize - 1 },
          { fromX: 1, fromY: gridSize - 1, toX: 2, toY: gridSize - 2 }
        ]
      }
    ];

    for (const puzzle of puzzles) {
      const link = Encoder.getShareableLink(puzzle, location);
      assert.match(link, /^https:\/\/pinky-ne\.com\/coding-drawing\/#p=/);

      const sharedLocation = new URL(link);
      sharedLocation.hash += '&from=class';
      assert.deepEqual(
        Encoder.loadFromLocation(sharedLocation),
        Encoder.validatePuzzleData(puzzle),
        `${puzzle.title}: hash share link must restore exactly`
      );

      const code = Encoder.getPuzzleCodeFromLocation(sharedLocation);
      const queryLocation = new URL(`https://pinky-ne.com/coding-drawing/?p=${code}`);
      assert.deepEqual(
        Encoder.loadFromLocation(queryLocation),
        Encoder.validatePuzzleData(puzzle),
        `${puzzle.title}: query share link must remain compatible`
      );
    }
  }
});

test('bomb creator output ignores an unrelated command queue', () => {
  const app = Object.create(App.prototype);
  app.creatorType = 'bomb';
  app.creatorGridSize = 5;
  app.commands = [{ dir: 'UP', distance: 8 }];
  app.renderer = {
    starPos: { x: 0, y: 4 },
    goalPos: { x: 4, y: 0 },
    obstacles: [{ x: 2, y: 2 }]
  };
  app.setStatus = () => {};

  const puzzle = app.buildCreatorPuzzleData();
  assert.ok(puzzle);
  assert.equal(puzzle.puzzleType, 'bomb');
  assert.equal('initialCommands' in puzzle, false);
  assert.equal('targetLines' in puzzle, false);
});

test('creator-generated bomb and drawing links remain solvable after sharing', () => {
  const location = {
    origin: 'https://pinky-ne.com',
    pathname: '/coding-drawing/'
  };
  const drawingCommands = [
    { dir: 'PEN_DOWN', distance: 1 },
    { dir: 'UP', distance: 2 },
    { dir: 'RIGHT', distance: 2 },
    { dir: 'DOWN', distance: 2 },
    { dir: 'LEFT', distance: 2 }
  ];

  for (const gridSize of [5, 7, 9, 11]) {
    const bombApp = Object.create(App.prototype);
    bombApp.creatorType = 'bomb';
    bombApp.creatorGridSize = gridSize;
    bombApp.commands = [];
    bombApp.renderer = {
      starPos: { x: 0, y: gridSize - 1 },
      goalPos: { x: gridSize - 1, y: 0 },
      obstacles: [{
        x: Math.floor(gridSize / 2),
        y: Math.floor(gridSize / 2)
      }]
    };
    bombApp.setStatus = () => {};

    const bombPuzzle = bombApp.buildCreatorPuzzleData();
    const bombLink = Encoder.getShareableLink(bombPuzzle, location);
    const restoredBomb = Encoder.loadFromLocation(new URL(bombLink));
    const bombSolution = CommandEngine.findShortestPath(
      restoredBomb.starPos,
      restoredBomb.goalPos,
      restoredBomb.gridSize,
      restoredBomb.obstacles
    );
    const bombResult = CommandEngine.simulate(
      restoredBomb.starPos,
      bombSolution,
      restoredBomb.gridSize,
      restoredBomb.obstacles
    );

    assert.ok(bombLink, `${gridSize}x${gridSize} bomb link`);
    assert.deepEqual(restoredBomb, bombPuzzle);
    assert.equal(bombResult.hitWall, false);
    assert.equal(bombResult.hitObstacle, false);
    assert.deepEqual(bombResult.finalPos, restoredBomb.goalPos);

    const drawApp = Object.create(App.prototype);
    drawApp.creatorType = 'draw';
    drawApp.creatorGridSize = gridSize;
    drawApp.commands = drawingCommands;
    drawApp.renderer = {
      starPos: { x: 1, y: gridSize - 2 }
    };
    drawApp.setStatus = () => {};

    const drawPuzzle = drawApp.buildCreatorPuzzleData();
    const drawLink = Encoder.getShareableLink(drawPuzzle, location);
    const restoredDraw = Encoder.loadFromLocation(new URL(drawLink));
    const drawResult = CommandEngine.simulate(
      restoredDraw.starPos,
      drawingCommands,
      restoredDraw.gridSize,
      [],
      false
    );
    const drawComparison = CommandEngine.compareLinePaths(
      drawResult.lines,
      restoredDraw.targetLines
    );

    assert.ok(drawLink, `${gridSize}x${gridSize} draw link`);
    assert.deepEqual(restoredDraw, drawPuzzle);
    assert.equal(drawResult.hitWall, false);
    assert.equal(drawComparison.isExactMatch, true);
  }
});

test('drawing creator uses the same explicit pen-start rule as the player', () => {
  const app = Object.create(App.prototype);
  const messages = [];
  app.creatorType = 'draw';
  app.creatorGridSize = 5;
  app.renderer = { starPos: { x: 1, y: 3 } };
  app.setStatus = message => messages.push(message);

  app.commands = [{ dir: 'RIGHT', distance: 1 }];
  assert.equal(app.buildCreatorPuzzleData(), null);
  assert.match(messages.at(-1), /붓 누르기/);

  app.commands = [
    { dir: 'PEN_DOWN', distance: 1 },
    { dir: 'RIGHT', distance: 1 }
  ];
  const puzzle = app.buildCreatorPuzzleData();
  assert.ok(puzzle);
  assert.equal(puzzle.targetLines.length, 1);
});

test('random challenge ends at the available non-repeating problem count', () => {
  const app = Object.create(App.prototype);
  app.challengeType = 'random';
  app.currentMode = 'debug';
  app.currentLevel = { gridSize: 5 };
  app.selectedGridSize = 5;
  app.challengeState = {
    solvedCount: 8,
    streak: 2,
    bestStreak: 4,
    score: 300,
    timeRemaining: 60
  };
  app.updateChallengeUI = () => {};

  assert.equal(app.onChallengeSuccess(), false);
  assert.equal(app.challengeState.solvedCount, 9);
  assert.equal(app.challengeState.streak, 3);
  assert.equal(app.challengeState.bestStreak, 4);

  app.onChallengeFailure();
  assert.equal(app.challengeState.streak, 0);
  assert.equal(app.challengeState.bestStreak, 4);

  assert.equal(app.onChallengeSuccess(), true);
  assert.equal(app.challengeState.solvedCount, 10);
  assert.equal(app.challengeState.streak, 1);
  assert.equal(app.challengeState.bestStreak, 4);
});

test('single-stroke random challenge safely caps the 7x7 run at its nine unique problems', () => {
  assert.equal(getRandomChallengeTargetCount('single_stroke', 7), 9);
  assert.equal(getRandomChallengeTargetCount('single_stroke', 5), 10);
  assert.equal(getRandomChallengeTargetCount('debug', 5), 10);
});

test('drawing minimum-command metrics count every queue block but only movement as physical distance', () => {
  const app = Object.create(App.prototype);
  const commands = [
    { dir: 'RIGHT', distance: 3 },
    { dir: 'PEN_UP' },
    { dir: 'UP_LEFT', distance: 2 },
    { dir: 'PEN_DOWN' },
    { dir: 'DOWN', distance: 1 }
  ];
  const metrics = app.getDrawingEducationCommandMetrics(commands, {
    minimumCommandCount: 5
  });

  assert.deepEqual(metrics, {
    commandCount: 5,
    physicalDistance: 6,
    minimumCommandCount: 5
  });

  assert.deepEqual(
    app.getDrawingEducationCommandMetrics([null], { minimumCommandCount: 1 }),
    { commandCount: 1, physicalDistance: 0, minimumCommandCount: 1 }
  );
});

test('editing a drawing command keeps pen controls in the real command queue', () => {
  const app = Object.create(App.prototype);
  Object.assign(app, {
    commandBlockEditTarget: 'main',
    isPatternEducationActive: () => false
  });

  const normalized = app.normalizeEditedCommandQueue([
    { dir: 'RIGHT', distance: 1 },
    { dir: 'PEN_UP' },
    { dir: 'PEN_DOWN' },
    { dir: 'RIGHT', distance: 2 }
  ]);

  assert.deepEqual(normalized, [
    { dir: 'RIGHT', distance: 1 },
    { dir: 'PEN_UP', distance: 1 },
    { dir: 'PEN_DOWN', distance: 1 },
    { dir: 'RIGHT', distance: 2 }
  ]);
});

test('minimum-command drawing app approval follows the shared assessment result', async () => {
  const level = buildDrawingEducationLevelPool(
    PRESET_LEVELS,
    'draw_minimum_commands',
    5
  )[0];
  const modalResults = [];
  const app = Object.create(App.prototype);
  Object.assign(app, {
    selectedEducationLesson: 'draw_minimum_commands',
    commands: level.minimumCommandWitness.map(command => ({ ...command })),
    executionId: 11,
    renderer: {
      starPos: { x: 0, y: 0 },
      triggerRainbowCelebration: async () => {}
    },
    getActiveEducationLesson: () => getDrawingEducationLesson('draw_minimum_commands'),
    getEducationAdvanceButtonText: () => '다음 문제로',
    setStatus: () => {},
    showResultModal: modal => modalResults.push(modal)
  });

  const previousWindow = globalThis.window;
  globalThis.window = {};
  try {
    const witnessResult = CommandEngine.simulate(
      level.starPos,
      app.commands,
      level.gridSize,
      []
    );
    app.renderer.starPos = witnessResult.finalPos;
    await app.evaluateDrawingEducationResult(witnessResult, level, 11);
    assert.equal(modalResults.at(-1).isSuccess, true);
    assert.match(modalResults.at(-1).badge, new RegExp(`내 명령 ${level.minimumCommandCount}개`));

    app.commands = [{ dir: 'PEN_UP' }, { dir: 'PEN_DOWN' }, ...level.minimumCommandWitness];
    const extraCommandResult = CommandEngine.simulate(
      level.starPos,
      app.commands,
      level.gridSize,
      []
    );
    await app.evaluateDrawingEducationResult(extraCommandResult, level, 11);
    assert.equal(modalResults.at(-1).isSuccess, false);
    assert.match(modalResults.at(-1).badge, new RegExp(`내 명령 ${level.minimumCommandCount + 2}개`));
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('drawing methods app treats split commands as the same normalized route', async () => {
  const level = buildDrawingEducationLevelPool(PRESET_LEVELS, 'draw_methods', 5)[0];
  const modalResults = [];
  const app = Object.create(App.prototype);
  Object.assign(app, {
    selectedEducationLesson: 'draw_methods',
    commands: level.referenceCommands.map(command => ({ ...command })),
    executionId: 12,
    educationRouteSignatures: new Set(),
    educationRouteEntries: [],
    renderer: {
      starPos: { x: 0, y: 0 },
      triggerRainbowCelebration: async () => {}
    },
    getActiveEducationLesson: () => getDrawingEducationLesson('draw_methods'),
    getEducationAdvanceButtonText: () => '다음 문제로',
    renderMultiSolutionList: () => {},
    renderDrawingEducationTask: () => {},
    setStatus: () => {},
    showResultModal: modal => modalResults.push(modal)
  });

  const previousWindow = globalThis.window;
  globalThis.window = {};
  try {
    const firstResult = CommandEngine.simulate(level.starPos, app.commands, level.gridSize, []);
    app.renderer.starPos = firstResult.finalPos;
    await app.evaluateDrawingEducationResult(firstResult, level, 12);
    assert.equal(modalResults.at(-1).isSuccess, true);
    assert.equal(app.educationRouteEntries.length, 1);

    app.commands = CommandEngine.expandToStepList(level.referenceCommands)
      .map(dir => ({ dir, distance: 1 }));
    const splitResult = CommandEngine.simulate(level.starPos, app.commands, level.gridSize, []);
    await app.evaluateDrawingEducationResult(splitResult, level, 12);
    assert.equal(modalResults.at(-1).isSuccess, false);
    assert.match(modalResults.at(-1).title, /전에 찾은 방법/);
    assert.equal(app.educationRouteEntries.length, 1);

    const lastStep = CommandEngine.expandToStepList(level.referenceCommands).at(-1);
    const lastVector = DIRECTIONS[lastStep];
    const reverseStep = Object.entries(DIRECTIONS).find(([, direction]) => (
      direction.dx === -lastVector.dx && direction.dy === -lastVector.dy
    ))?.[0];
    app.commands = [
      ...level.referenceCommands,
      { dir: reverseStep, distance: 1 },
      { dir: lastStep, distance: 1 }
    ];
    const retracedResult = CommandEngine.simulate(level.starPos, app.commands, level.gridSize, []);
    await app.evaluateDrawingEducationResult(retracedResult, level, 12);
    assert.equal(modalResults.at(-1).isSuccess, false);
    assert.match(modalResults.at(-1).title, /전에 찾은 방법/);
    assert.equal(app.educationRouteEntries.length, 1);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('drawing education safely falls back to the first current lesson after an obsolete saved lesson id', () => {
  const app = Object.create(App.prototype);
  Object.assign(app, {
    selectedEducationLesson: 'obsolete-drawing-lesson',
    educationLessonSelections: { drawing: 'obsolete-drawing-lesson' },
    isEducationMode: () => true,
    getEducationLearningMode: () => 'drawing',
    getActiveEducationLessons: () => DRAWING_EDUCATION_LESSONS,
    getActiveEducationLesson: () => getDrawingEducationLesson(app.selectedEducationLesson)
  });

  const lesson = app.ensureEducationLessonForCurrentMode();
  assert.equal(lesson.id, 'draw_sequence');
  assert.equal(app.selectedEducationLesson, 'draw_sequence');
  assert.equal(app.educationLessonSelections.drawing, 'draw_sequence');
});

test('minimum-command drawing counter uses queue count and never treats pen commands as movement', () => {
  const previousDocument = globalThis.document;
  const counter = { textContent: '' };
  globalThis.document = {
    getElementById(id) {
      return id === 'step-counter' ? counter : null;
    }
  };

  try {
    const app = Object.create(App.prototype);
    Object.assign(app, {
      currentMode: 'debug',
      challengeType: 'education',
      selectedEducationLesson: 'draw_minimum_commands',
      currentLevel: {
        targetLines: [],
        minimumCommandCount: 4
      },
      commands: [
        { dir: 'RIGHT', distance: 3 },
        { dir: 'PEN_UP' },
        { dir: 'LEFT', distance: 2 },
        { dir: 'PEN_DOWN' },
        { dir: 'DOWN', distance: 1 }
      ],
      isPatternEducationActive: () => false,
      getActiveEducationToolPolicy: () => ({ mergeAdjacent: true }),
      isDrawingEducationMode: () => true,
      isStudentDrawMode: () => false,
      updateEfficiencyStats: () => {}
    });

    app.updateStepCounter();
    assert.equal(counter.textContent, '내 명령 5개 · 최소 4개 · 실제 붓 이동 6칸');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('sequence lesson is a fixed-command direct-drawing activity without a student command queue', () => {
  const level = buildDrawingEducationLevelPool(PRESET_LEVELS, 'draw_sequence', 5)[0];
  const app = Object.create(App.prototype);
  Object.assign(app, {
    currentMode: 'debug',
    challengeType: 'education',
    selectedEducationLesson: 'draw_sequence',
    currentLevel: level
  });

  assert.deepEqual(level.initialCommands, level.referenceCommands);
  assert.equal(app.isFixedCommandDrawingMode(), true);
  assert.equal(app.isStudentDrawMode(), true);
  assert.deepEqual(app.getFixedDrawingCommands(), level.referenceCommands);
});

test('presented drawing commands keep all eight movement directions available even when the answer points left', () => {
  const app = Object.create(App.prototype);
  Object.assign(app, {
    currentMode: 'debug',
    challengeType: 'education',
    selectedEducationLesson: 'draw_sequence',
    currentLevel: {
      gridSize: 5,
      starPos: { x: 2, y: 2 },
      educationLesson: 'draw_sequence',
      referenceCommands: [{ dir: 'LEFT', distance: 1 }],
      educationToolPolicy: { allowedDirections: ['LEFT'] }
    }
  });

  assert.deepEqual(
    Object.keys(DIRECTIONS).filter(direction => app.canUseEducationDirection(direction)),
    Object.keys(DIRECTIONS)
  );
});

test('fixed drawing restores continuous saved attempts even when they differ from the presented commands', () => {
  const app = Object.create(App.prototype);
  Object.assign(app, {
    currentMode: 'debug',
    challengeType: 'education',
    selectedEducationLesson: 'draw_sequence',
    currentLevel: {
      gridSize: 5,
      starPos: { x: 0, y: 0 },
      referenceCommands: [{ dir: 'RIGHT', distance: 2 }]
    }
  });
  const restored = app.getRestorableFixedDrawingHistory([
    { type: 'move', fromX: 0, fromY: 0, toX: 0, toY: 1, drewLine: true },
    { type: 'move', fromX: 0, fromY: 1, toX: 1, toY: 1, drewLine: true },
    { type: 'move', fromX: 4, fromY: 4, toX: 3, toY: 4, drewLine: true }
  ]);
  assert.equal(restored.length, 2);
  assert.deepEqual(
    restored.map(({ fromX, fromY, toX, toY }) => ({ fromX, fromY, toX, toY })),
    [
      { fromX: 0, fromY: 0, toX: 0, toY: 1 },
      { fromX: 0, fromY: 1, toX: 1, toY: 1 }
    ]
  );
});

test('straight pointer movement fills every crossed grid point without gaps', () => {
  const app = Object.create(App.prototype);
  app.currentLevel = { gridSize: 7 };
  app.renderer = {
    gridSize: 7,
    starPos: { x: 0, y: 6 }
  };

  const recorded = [];
  app.recordStudentMove = (x, y) => {
    recorded.push({ x, y });
    app.renderer.starPos = { x, y };
    return true;
  };

  assert.equal(app.recordStudentPathTo(5, 1), true);
  assert.deepEqual(recorded, [
    { x: 1, y: 5 },
    { x: 2, y: 4 },
    { x: 3, y: 3 },
    { x: 4, y: 2 },
    { x: 5, y: 1 }
  ]);
});

test('a distant pointer target is rejected when it is not on one straight 8-direction line', () => {
  const app = Object.create(App.prototype);
  app.currentMode = 'debug_guide';
  app.currentLevel = { gridSize: 7 };
  app.renderer = {
    gridSize: 7,
    starPos: { x: 0, y: 0 }
  };
  app.setStatus = () => {};

  const recorded = [];
  app.recordStudentMove = (x, y) => {
    recorded.push({ x, y });
    app.renderer.starPos = { x, y };
    return true;
  };

  globalThis.window = {};
  try {
    assert.equal(app.recordStudentPathTo(3, 2), false);
    assert.deepEqual(recorded, []);
    assert.deepEqual(app.renderer.starPos, { x: 0, y: 0 });
  } finally {
    delete globalThis.window;
  }
});

test('continuous pointer dragging interpolates a free non-straight path through adjacent grid points', () => {
  const app = Object.create(App.prototype);
  app.currentLevel = { gridSize: 7 };
  app.renderer = {
    gridSize: 7,
    starPos: { x: 0, y: 0 }
  };

  const recorded = [];
  app.recordStudentMove = (x, y) => {
    recorded.push({ x, y });
    app.renderer.starPos = { x, y };
    return true;
  };

  assert.equal(
    app.recordStudentPathTo(3, 2, { interpolateFreePath: true }),
    true
  );
  assert.deepEqual(recorded, [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 2 }
  ]);
  assert.ok(recorded.every((point, index) => {
    const previous = index === 0 ? { x: 0, y: 0 } : recorded[index - 1];
    return (
      Math.abs(point.x - previous.x) <= 1 &&
      Math.abs(point.y - previous.y) <= 1
    );
  }));
});

test('slightly uneven diagonal dragging records a diagonal move instead of two cardinal moves', () => {
  const app = Object.create(App.prototype);
  app.currentLevel = { gridSize: 7 };
  app.renderer = {
    gridSize: 7,
    cellSize: 50,
    starPos: { x: 0, y: 0 }
  };

  const recorded = [];
  app.recordStudentMove = (x, y) => {
    recorded.push({ x, y });
    app.renderer.starPos = { x, y };
    return true;
  };

  const gestureState = {
    anchorX: 100,
    anchorY: 100,
    lastDx: 0,
    lastDy: 0
  };

  assert.equal(app.recordStudentDragGesture(130, 120, gestureState), true);
  assert.deepEqual(recorded, [{ x: 1, y: 1 }]);

  // 다음 포인터 표본이 새 격자점보다 조금 뒤에 있어도 방금 이동을 되돌리지 않는다.
  assert.equal(app.recordStudentDragGesture(140, 130, gestureState), false);
  assert.deepEqual(recorded, [{ x: 1, y: 1 }]);

  assert.equal(app.recordStudentDragGesture(180, 170, gestureState), true);
  assert.deepEqual(recorded, [{ x: 1, y: 1 }, { x: 2, y: 2 }]);
});

test('fixed drawing action plans keep grouped straight commands as ordered unit steps', () => {
  assert.deepEqual(
    buildFixedDrawingActionPlan([
      { dir: 'DOWN_RIGHT', distance: 3 },
      { dir: 'LEFT', distance: 2 }
    ]).map(({ dir, commandIndex, substepIndex }) => ({ dir, commandIndex, substepIndex })),
    [
      { dir: 'DOWN_RIGHT', commandIndex: 0, substepIndex: 0 },
      { dir: 'DOWN_RIGHT', commandIndex: 0, substepIndex: 1 },
      { dir: 'DOWN_RIGHT', commandIndex: 0, substepIndex: 2 },
      { dir: 'LEFT', commandIndex: 1, substepIndex: 0 },
      { dir: 'LEFT', commandIndex: 1, substepIndex: 1 }
    ]
  );
});

test('follow-the-commands grading requires the exact order even when the final figure matches', () => {
  const level = {
    initialCommands: [
      { dir: 'RIGHT', distance: 1 },
      { dir: 'DOWN', distance: 1 },
      { dir: 'UP_LEFT', distance: 1 }
    ],
    targetLines: [
      { fromX: 0, fromY: 0, toX: 1, toY: 0 },
      { fromX: 1, fromY: 0, toX: 1, toY: 1 },
      { fromX: 1, fromY: 1, toX: 0, toY: 0 }
    ]
  };
  const reversedHistory = [
    { type: 'move', fromX: 0, fromY: 0, toX: 1, toY: 1 },
    { type: 'move', fromX: 1, fromY: 1, toX: 1, toY: 0 },
    { type: 'move', fromX: 1, fromY: 0, toX: 0, toY: 0 }
  ];
  const reversedLines = reversedHistory.map(({ fromX, fromY, toX, toY }) => ({
    fromX, fromY, toX, toY
  }));
  const assessment = assessFixedDrawingExecution(level, reversedHistory, reversedLines);

  assert.equal(assessment.isExactMatch, true);
  assert.equal(assessment.isExactOrder, false);
  assert.equal(assessment.isSuccess, false);
});

test('drawing education sequence grading uses the presented commands and an otherwise blank target grid', () => {
  const level = {
    referenceCommands: [
      { dir: 'RIGHT', distance: 2 },
      { dir: 'DOWN_LEFT', distance: 1 }
    ],
    targetLines: [
      { fromX: 0, fromY: 0, toX: 1, toY: 0 },
      { fromX: 1, fromY: 0, toX: 2, toY: 0 },
      { fromX: 2, fromY: 0, toX: 1, toY: 1 }
    ]
  };
  const history = [
    { type: 'move', fromX: 0, fromY: 0, toX: 1, toY: 0 },
    { type: 'move', fromX: 1, fromY: 0, toX: 2, toY: 0 },
    { type: 'move', fromX: 2, fromY: 0, toX: 1, toY: 1 }
  ];
  const lines = history.map(({ fromX, fromY, toX, toY }) => ({
    fromX, fromY, toX, toY
  }));

  const assessment = assessFixedDrawingExecution(level, history, lines);
  assert.equal(assessment.expectedActionCount, 3);
  assert.equal(assessment.isExactOrder, true);
  assert.equal(assessment.isExactMatch, true);
  assert.equal(assessment.isSuccess, true);
});

test('presented drawing commands render as read-only text instead of command input controls', () => {
  const source = App.prototype.renderDrawingEducationTask.toString();
  assert.match(source, /document\.createElement\('span'\)/);
  assert.doesNotMatch(source, /item\.addEventListener/);
});

test('fixed follow-the-commands activity permits wrong steps without changing the presented commands', () => {
  const app = Object.create(App.prototype);
  app.currentMode = 'debug_guide';
  app.currentLevel = {
    gridSize: 5,
    starPos: { x: 0, y: 1 },
    initialCommands: [{ dir: 'UP', distance: 1 }]
  };
  app.commands = [{ dir: 'UP', distance: 1 }];
  app.isExecuting = false;
  app.studentDrawnLines = [];
  app.studentRedoLines = [];
  app.activeBrushColor = 'rainbow';
  app.renderer = {
    gridSize: 5,
    starPos: { x: 0, y: 1 },
    addDrawnLine() {},
    setStarPos(x, y) {
      this.starPos = { x, y };
    }
  };
  app.updateStudentHistoryControls = () => {};
  app.setStatus = () => {};

  globalThis.window = {};
  try {
    app.addCommand('RIGHT');
    app.addCommand('UP');
  } finally {
    delete globalThis.window;
  }

  assert.deepEqual(app.commands, [{ dir: 'UP', distance: 1 }]);
  assert.deepEqual(
    app.studentDrawnLines.map(({ fromX, fromY, toX, toY }) => ({ fromX, fromY, toX, toY })),
    [
      { fromX: 0, fromY: 1, toX: 1, toY: 1 },
      { fromX: 1, fromY: 1, toX: 1, toY: 0 }
    ]
  );
});

test('fixed drawing permits a different straight path and leaves correctness to submission', () => {
  const app = Object.create(App.prototype);
  app.currentMode = 'debug_guide';
  app.currentLevel = {
    gridSize: 5,
    starPos: { x: 0, y: 0 },
    initialCommands: [{ dir: 'RIGHT', distance: 3 }],
    targetLines: [
      { fromX: 0, fromY: 0, toX: 1, toY: 0 },
      { fromX: 1, fromY: 0, toX: 2, toY: 0 },
      { fromX: 2, fromY: 0, toX: 3, toY: 0 }
    ]
  };
  app.commands = app.currentLevel.initialCommands.map(command => ({ ...command }));
  app.isExecuting = false;
  app.isPenDown = true;
  app.studentDrawnLines = [];
  app.studentRedoLines = [];
  app.studentDrawHistory = [];
  app.studentRedoHistory = [];
  app.activeBrushColor = 'rainbow';
  app.renderer = {
    gridSize: 5,
    starPos: { x: 0, y: 0 },
    addDrawnLine() {},
    setStarPos(x, y) {
      this.starPos = { x, y };
    }
  };
  app.updateStudentHistoryControls = () => {};
  app.updateStepCounter = () => {};
  app.setStatus = () => {};

  globalThis.window = {};
  try {
    assert.equal(app.recordStudentPathTo(3, 3), true);
    assert.deepEqual(app.renderer.starPos, { x: 3, y: 3 });
    assert.equal(app.studentDrawHistory.length, 3);
    assert.equal(app.recordStudentPathTo(4, 3), true);
    assert.deepEqual(app.renderer.starPos, { x: 4, y: 3 });
    assert.equal(app.studentDrawHistory.length, 4);
  } finally {
    delete globalThis.window;
  }

  const assessment = assessFixedDrawingExecution(
    app.currentLevel,
    app.studentDrawHistory,
    app.studentDrawnLines
  );
  assert.equal(assessment.isExactOrder, false);
  assert.equal(assessment.isSuccess, false);
});

test('fixed drawing progress does not mark a presented command complete after a wrong move', () => {
  const app = Object.create(App.prototype);
  Object.assign(app, {
    currentMode: 'debug_guide',
    currentLevel: {
      gridSize: 5,
      initialCommands: [{ dir: 'RIGHT', distance: 2 }]
    },
    studentDrawHistory: [
      { type: 'move', fromX: 0, fromY: 0, toX: 0, toY: 1 }
    ],
    studentDrawnLines: [],
    studentRedoHistory: [],
    studentRedoLines: []
  });

  const progress = app.getFixedDrawingProgress();
  assert.equal(progress.actualActionCount, 1);
  assert.equal(progress.matchedActionCount, 0);
  assert.equal(progress.completedCommandCount, 0);
  assert.equal(progress.hasMismatch, true);
  assert.equal(progress.isComplete, false);
});

test('student drawing permits tracing the same directed line again', () => {
  const app = Object.create(App.prototype);
  app.currentMode = 'debug_guide';
  app.currentLevel = { gridSize: 5, starPos: { x: 0, y: 0 } };
  app.isExecuting = false;
  app.studentDrawnLines = [];
  app.studentRedoLines = [];
  app.activeBrushColor = 'rainbow';
  app.renderer = {
    gridSize: 5,
    starPos: { x: 0, y: 0 },
    addDrawnLine() {},
    setStarPos(x, y) {
      this.starPos = { x, y };
    }
  };
  app.updateStudentHistoryControls = () => {};
  app.setStatus = () => {};

  globalThis.window = {};
  try {
    assert.equal(app.recordStudentMove(1, 0), true);
    assert.equal(app.recordStudentMove(0, 0), true);
    assert.equal(app.recordStudentMove(1, 0), true);
    assert.equal(app.studentDrawnLines.length, 3);

    const comparison = CommandEngine.compareLineFigures(
      app.studentDrawnLines,
      [{ fromX: 0, fromY: 0, toX: 1, toY: 0 }]
    );
    assert.equal(comparison.isExactMatch, true);
    assert.equal(comparison.retracedCount, 2);
  } finally {
    delete globalThis.window;
  }
});

test('student drawing undo and redo move one line at a time', () => {
  const app = Object.create(App.prototype);
  app.currentMode = 'debug_guide';
  app.currentLevel = { starPos: { x: 1, y: 3 } };
  app.isExecuting = false;
  app.studentDrawnLines = [
    { fromX: 1, fromY: 3, toX: 1, toY: 2, color: 'rainbow' },
    { fromX: 1, fromY: 2, toX: 1, toY: 1, color: '#38bdf8' }
  ];
  app.studentRedoLines = [];
  app.renderer = {
    drawnLines: [],
    starPos: { x: 1, y: 1 },
    starAngle: 0,
    setDrawnLines(lines) {
      this.drawnLines = lines.map(line => ({ ...line }));
    },
    setStarPos(x, y) {
      this.starPos = { x, y };
    }
  };
  app.updateStudentHistoryControls = () => {};
  app.setStatus = () => {};

  assert.equal(app.undoStudentDrawStep(), true);
  assert.equal(app.studentDrawnLines.length, 1);
  assert.equal(app.studentRedoLines.length, 1);
  assert.deepEqual(app.renderer.starPos, { x: 1, y: 2 });
  assert.deepEqual(app.renderer.drawnLines, app.studentDrawnLines);

  assert.equal(app.redoStudentDrawStep(), true);
  assert.equal(app.studentDrawnLines.length, 2);
  assert.equal(app.studentRedoLines.length, 0);
  assert.deepEqual(app.renderer.starPos, { x: 1, y: 1 });
  assert.deepEqual(app.renderer.drawnLines, app.studentDrawnLines);
});

test('student drawing history restores pen-up cursor moves and counts every physical step', () => {
  const app = Object.create(App.prototype);
  app.currentMode = 'debug_guide';
  app.challengeType = 'stage';
  app.currentLevel = { gridSize: 5, starPos: { x: 0, y: 0 } };
  app.isExecuting = false;
  app.isPenDown = true;
  app.studentDrawnLines = [];
  app.studentRedoLines = [];
  app.studentDrawHistory = [];
  app.studentRedoHistory = [];
  app.activeBrushColor = 'rainbow';
  app.renderer = {
    gridSize: 5,
    starPos: { x: 0, y: 0 },
    drawnLines: [],
    addDrawnLine() {},
    setDrawnLines(lines) {
      this.drawnLines = lines.map(line => ({ ...line }));
    },
    setStarPos(x, y) {
      this.starPos = { x, y };
    },
    setPenDown(isPenDown) {
      this.isPenDown = isPenDown;
    }
  };
  app.updateStudentHistoryControls = () => {};
  app.updateStepCounter = () => {};
  app.setStatus = () => {};

  globalThis.window = {};
  try {
    assert.equal(app.drawStudentStep('RIGHT'), true);
    assert.equal(app.drawStudentStep('PEN_UP'), true);
    assert.equal(app.drawStudentStep('RIGHT'), true);
    assert.equal(app.studentDrawnLines.length, 1);
    assert.equal(app.getStudentDrawingMovementDistance(), 2);
    assert.deepEqual(app.renderer.starPos, { x: 2, y: 0 });

    assert.equal(app.undoStudentDrawStep(), true);
    assert.deepEqual(app.renderer.starPos, { x: 1, y: 0 });
    assert.equal(app.isPenDown, false);
    assert.equal(app.studentDrawnLines.length, 1);

    assert.equal(app.undoStudentDrawStep(), true);
    assert.deepEqual(app.renderer.starPos, { x: 1, y: 0 });
    assert.equal(app.isPenDown, true);

    assert.equal(app.redoStudentDrawStep(), true);
    assert.equal(app.redoStudentDrawStep(), true);
    assert.deepEqual(app.renderer.starPos, { x: 2, y: 0 });
    assert.equal(app.isPenDown, false);
  } finally {
    delete globalThis.window;
  }
});

test('unknown directions cannot enter the command queue', () => {
  const regularApp = Object.create(App.prototype);
  regularApp.currentMode = 'chase';
  regularApp.isExecuting = false;
  regularApp.commands = [];
  regularApp.isStudentDrawMode = () => false;
  regularApp.renderCommandQueue = () => {};
  regularApp.updateStepCounter = () => {};

  regularApp.addCommand('UNKNOWN_DIRECTION');
  assert.deepEqual(regularApp.commands, []);
});

test('chase activities mix open maps with obstacle maps and remain catchable', () => {
  const chaseLevels = PRESET_LEVELS.chase.flat();
  assert.ok(chaseLevels.some(level => (level.obstacles || []).length === 0));
  assert.ok(chaseLevels.some(level => (level.obstacles || []).length > 0));

  for (const gridSize of [5, 7, 9, 11]) {
    const sizeLevels = chaseLevels.filter(level => level.gridSize === gridSize);
    const obstacleLevels = sizeLevels.filter(level => (level.obstacles || []).length > 0);
    const openLevels = sizeLevels.filter(level => (level.obstacles || []).length === 0);
    assert.ok(obstacleLevels.length >= 7, `${gridSize}x${gridSize}: too few obstacle chase problems`);
    assert.ok(openLevels.length >= 2, `${gridSize}x${gridSize}: too few open chase problems`);
    assert.equal(
      sizeLevels.filter(level => level.handcuffPos).length,
      5,
      `${gridSize}x${gridSize}: handcuff-map pool changed`
    );
    assert.equal(
      sizeLevels.filter(level => level.handcuffPos && level.obstacles.length === 0).length,
      1,
      `${gridSize}x${gridSize}: needs one handcuff-only map`
    );
    assert.equal(
      sizeLevels.filter(level => level.handcuffPos && level.obstacles.length > 0).length,
      4,
      `${gridSize}x${gridSize}: needs four handcuff-and-obstacle maps`
    );
    assert.equal(
      sizeLevels.filter(level => !level.handcuffPos && level.obstacles.length > 0).length,
      4,
      `${gridSize}x${gridSize}: needs four obstacle-only maps`
    );
    assert.equal(
      sizeLevels.filter(level => !level.handcuffPos && level.obstacles.length === 0).length,
      1,
      `${gridSize}x${gridSize}: needs one plain chase map`
    );
  }

  for (const level of chaseLevels) {
    const scenario = CommandEngine.validateChaseScenario(
      level.starPos,
      level.thiefPos,
      level.thiefCommands,
      level.gridSize,
      level.obstacles,
      level.handcuffPos || null
    );
    assert.equal(scenario.isValid, true, `${level.title}: ${scenario.reason}`);

    const obstacleKeys = new Set((level.obstacles || []).map(obstacle => `${obstacle.x},${obstacle.y}`));
    assert.equal(obstacleKeys.size, (level.obstacles || []).length, `${level.title}: duplicate obstacle`);
    assert.equal(obstacleKeys.has(`${level.starPos.x},${level.starPos.y}`), false, `${level.title}: obstacle on cop`);
    assert.equal(obstacleKeys.has(`${level.thiefPos.x},${level.thiefPos.y}`), false, `${level.title}: obstacle on thief`);
    if (level.handcuffPos) {
      const handcuffKey = `${level.handcuffPos.x},${level.handcuffPos.y}`;
      assert.equal(obstacleKeys.has(handcuffKey), false, `${level.title}: handcuffs on obstacle`);
      assert.notEqual(handcuffKey, `${level.starPos.x},${level.starPos.y}`, `${level.title}: handcuffs on cop`);
      assert.ok(level.handcuffDelay >= 1, `${level.title}: handcuffs do not change the route`);
    }

    let thiefPos = { ...level.thiefPos };
    for (const dirKey of CommandEngine.expandToStepList(level.thiefCommands)) {
      const direction = DIRECTIONS[dirKey];
      const nextPos = {
        x: thiefPos.x + direction.dx,
        y: thiefPos.y + direction.dy
      };
      assert.ok(
        nextPos.x >= 0 &&
        nextPos.x < level.gridSize &&
        nextPos.y >= 0 &&
        nextPos.y < level.gridSize,
        `${level.title}: thief route leaves the grid`
      );
      assert.equal(
        obstacleKeys.has(`${nextPos.x},${nextPos.y}`),
        false,
        `${level.title}: published thief route is blocked`
      );
      thiefPos = nextPos;
    }

    const plan = CommandEngine.findChaseCapturePlan(
      level.starPos,
      level.thiefPos,
      level.thiefCommands,
      level.gridSize,
      level.obstacles,
      level.handcuffPos || null
    );
    assert.ok(plan, `${level.title}: no capture plan`);

    const result = CommandEngine.simulateChase(
      level.starPos,
      plan.commands,
      level.thiefPos,
      level.thiefCommands,
      level.gridSize,
      level.obstacles,
      level.handcuffPos || null
    );
    assert.equal(result.caught, true, `${level.title}: generated plan does not catch`);
    if (level.handcuffPos) {
      assert.equal(result.handcuffsCollected, true, `${level.title}: generated plan skips handcuffs`);
      assert.ok(
        result.handcuffsCollectedTurn < result.caughtTurn,
        `${level.title}: capture happens before the handcuffs are collected`
      );
    }
    assert.ok(
      result.caughtTurn <= CommandEngine.expandToStepList(level.thiefCommands).length,
      `${level.title}: capture occurs after escape`
    );
  }
});

test('every chase size includes distinct structures and non-repeating thief routes', () => {
  for (const gridSize of [5, 7, 9, 11]) {
    const sizeLevels = PRESET_LEVELS.chase
      .filter(level => level.gridSize === gridSize);

    assert.deepEqual(
      new Set(sizeLevels.map(level => level.obstacleArchetype)),
      new Set(['open', 0, 1, 2, 3, 4, 5, 6, 7]),
      `${gridSize}x${gridSize}: a chase obstacle structure is missing`
    );

    for (const level of sizeLevels) {
      const trace = CommandEngine.traceChaseThiefRoute(
        level.thiefPos,
        level.thiefCommands,
        level.gridSize,
        level.obstacles || []
      );
      const positionKeys = trace.positions.map(({ x, y }) => `${x},${y}`);
      assert.equal(
        new Set(positionKeys).size,
        positionKeys.length,
        `${level.title}: the thief revisits a previous cell`
      );
      assert.ok(
        level.thiefCommands.length >= 3,
        `${level.title}: the thief route has too few direction changes`
      );

      if ((level.obstacles || []).length === 0) continue;
      const openAnalysis = CommandEngine.analyzeChaseCapturePlans(
        level.starPos,
        level.thiefPos,
        level.thiefCommands,
        level.gridSize,
        []
      );
      assert.ok(openAnalysis, `${level.title}: missing open-map comparison`);
      const obstacleOnlyAnalysis = CommandEngine.analyzeChaseCapturePlans(
        level.starPos,
        level.thiefPos,
        level.thiefCommands,
        level.gridSize,
        level.obstacles
      );
      assert.ok(
        obstacleOnlyAnalysis.earliestTurn > openAnalysis.earliestTurn,
        `${level.title}: the obstacle structure does not delay capture`
      );

      const influentialCount = level.obstacles.filter((_, obstacleIndex) => {
        const reduced = CommandEngine.analyzeChaseCapturePlans(
          level.starPos,
          level.thiefPos,
          level.thiefCommands,
          level.gridSize,
          level.obstacles.filter((_, index) => index !== obstacleIndex),
          level.handcuffPos || null
        );
        return (
          !reduced ||
          reduced.earliestTurn !== level.earliestCatchTurn ||
          reduced.pathCount !== level.solutionCount
        );
      }).length;
      assert.equal(
        influentialCount,
        level.obstacles.length,
        `${level.title}: an obstacle is irrelevant to the optimal capture`
      );
    }
  }
});

test('every chase plan catches the moving thief in the mathematically earliest turn', () => {
  const independentlyAnalyzeEarliestCapture = level => {
    const thiefRoute = CommandEngine.traceChaseThiefRoute(
      level.thiefPos,
      level.thiefCommands,
      level.gridSize,
      level.obstacles || []
    );
    if (!thiefRoute.isValid) return null;

    const obstacleKeys = new Set(
      (level.obstacles || []).map(({ x, y }) => `${x},${y}`)
    );
    const actions = Object.values(DIRECTIONS);
    const startsWithHandcuffs = !level.handcuffPos;
    let reachableCopStates = new Map([[
      `${level.starPos.x},${level.starPos.y}|${startsWithHandcuffs ? 1 : 0}`,
      1
    ]]);

    for (let turn = 1; turn < thiefRoute.positions.length; turn++) {
      const thiefPos = thiefRoute.positions[turn];
      const thiefKey = `${thiefPos.x},${thiefPos.y}`;

      let captureCount = reachableCopStates.get(`${thiefKey}|1`) || 0;

      const nextCopStates = new Map();
      for (const [copStateKey, statePathCount] of reachableCopStates) {
        const [copKey, handcuffState] = copStateKey.split('|');
        if (copKey === thiefKey && handcuffState === '1') continue;
        const [copX, copY] = copKey.split(',').map(Number);
        for (const action of actions) {
          const x = copX + action.dx;
          const y = copY + action.dy;
          const nextKey = `${x},${y}`;
          if (
            x < 0 || x >= level.gridSize ||
            y < 0 || y >= level.gridSize ||
            obstacleKeys.has(nextKey)
          ) continue;
          const hasHandcuffs = handcuffState === '1' || Boolean(
            level.handcuffPos &&
            x === level.handcuffPos.x &&
            y === level.handcuffPos.y
          );
          if (hasHandcuffs && nextKey === thiefKey) {
            captureCount += statePathCount;
            continue;
          }
          const nextStateKey = `${nextKey}|${hasHandcuffs ? 1 : 0}`;
          nextCopStates.set(
            nextStateKey,
            (nextCopStates.get(nextStateKey) || 0) + statePathCount
          );
        }
      }
      if (captureCount > 0) return { earliestTurn: turn, pathCount: captureCount };
      reachableCopStates = nextCopStates;
    }

    return null;
  };

  for (const level of PRESET_LEVELS.chase.flat()) {
    const independentAnalysis = independentlyAnalyzeEarliestCapture(level);
    assert.ok(independentAnalysis, `${level.title}: independent search found no capture`);
    const plan = CommandEngine.findChaseCapturePlan(
      level.starPos,
      level.thiefPos,
      level.thiefCommands,
      level.gridSize,
      level.obstacles || [],
      level.handcuffPos || null
    );
    assert.ok(plan, `${level.title}: missing capture plan`);
    assert.equal(
      plan.caughtTurn,
      independentAnalysis.earliestTurn,
      `${level.title}: capture plan is not earliest`
    );

    const engineAnalysis = CommandEngine.analyzeChaseCapturePlans(
      level.starPos,
      level.thiefPos,
      level.thiefCommands,
      level.gridSize,
      level.obstacles || [],
      level.handcuffPos || null
    );
    assert.equal(
      engineAnalysis.pathCount,
      independentAnalysis.pathCount,
      `${level.title}: earliest command count is incorrect`
    );

    const result = CommandEngine.simulateChase(
      level.starPos,
      plan.commands,
      level.thiefPos,
      level.thiefCommands,
      level.gridSize,
      level.obstacles || [],
      level.handcuffPos || null
    );
    assert.equal(result.caught, true, `${level.title}: earliest plan misses thief`);
    assert.equal(
      result.caughtTurn,
      independentAnalysis.earliestTurn,
      `${level.title}: simulation reports the wrong catch turn`
    );
  }
});

test('chase analysis counts different earliest interception commands exactly', () => {
  const thiefCommands = [{ dir: 'LEFT', distance: 2 }];
  const openAnalysis = CommandEngine.analyzeChaseCapturePlans(
    { x: 0, y: 0 },
    { x: 2, y: 2 },
    thiefCommands,
    3,
    []
  );
  assert.equal(openAnalysis.earliestTurn, 2);
  assert.equal(openAnalysis.pathCount, 2);
  assert.equal(openAnalysis.caughtPhase, 'cop_turn');
  assert.equal(
    CommandEngine.simulateChase(
      { x: 0, y: 0 },
      openAnalysis.commands,
      { x: 2, y: 2 },
      thiefCommands,
      3,
      []
    ).caughtTurn,
    2
  );

  const blockedAnalysis = CommandEngine.analyzeChaseCapturePlans(
    { x: 0, y: 0 },
    { x: 2, y: 2 },
    thiefCommands,
    3,
    [{ x: 1, y: 1 }]
  );
  assert.equal(blockedAnalysis.earliestTurn, 2);
  assert.equal(blockedAnalysis.pathCount, 1);
  assert.equal(blockedAnalysis.caughtPhase, 'cop_turn');
  assert.equal(
    CommandEngine.simulateChase(
      { x: 0, y: 0 },
      blockedAnalysis.commands,
      { x: 2, y: 2 },
      thiefCommands,
      3,
      [{ x: 1, y: 1 }]
    ).caughtTurn,
    2
  );
});

test('handcuff chase requires pickup before the moving thief can be arrested', () => {
  const thiefCommands = [{ dir: 'LEFT', distance: 4 }];
  const handcuffPos = { x: 1, y: 0 };

  const missedResult = CommandEngine.simulateChase(
    { x: 0, y: 0 },
    [{ dir: 'RIGHT', distance: 1 }],
    { x: 2, y: 0 },
    [{ dir: 'LEFT', distance: 1 }],
    5,
    [],
    { x: 0, y: 1 }
  );
  assert.equal(missedResult.caught, false);
  assert.equal(missedResult.missedCaptureWithoutHandcuffs, true);
  assert.equal(missedResult.handcuffsCollected, false);

  const analysis = CommandEngine.analyzeChaseCapturePlans(
    { x: 0, y: 0 },
    { x: 4, y: 2 },
    thiefCommands,
    5,
    [],
    handcuffPos
  );
  assert.ok(analysis);
  const result = CommandEngine.simulateChase(
    { x: 0, y: 0 },
    analysis.commands,
    { x: 4, y: 2 },
    thiefCommands,
    5,
    [],
    handcuffPos
  );
  assert.equal(result.caught, true);
  assert.equal(result.handcuffsCollected, true);
  assert.ok(result.handcuffsCollectedTurn < result.caughtTurn);
  assert.equal(result.caughtTurn, analysis.earliestTurn);
});

test('chase validation rejects handcuffs on blocked or thief-route cells', () => {
  const args = [
    { x: 0, y: 0 },
    { x: 4, y: 2 },
    [{ dir: 'LEFT', distance: 3 }],
    5
  ];
  assert.equal(
    CommandEngine.validateChaseScenario(...args, [{ x: 1, y: 1 }], { x: 1, y: 1 }).reason,
    'handcuffs_on_obstacle'
  );
  assert.equal(
    CommandEngine.validateChaseScenario(...args, [], { x: 3, y: 2 }).reason,
    'handcuffs_on_thief_route'
  );
  assert.equal(
    CommandEngine.validateChaseScenario(...args, [], { x: 0, y: 0 }).reason,
    'handcuffs_on_cop_start'
  );
});

test('chase validation rejects a thief route into an obstacle', () => {
  const validation = CommandEngine.validateChaseScenario(
    { x: 0, y: 0 },
    { x: 2, y: 2 },
    [{ dir: 'LEFT', distance: 1 }],
    3,
    [{ x: 1, y: 2 }]
  );
  assert.equal(validation.isValid, false);
  assert.equal(validation.reason, 'thief_hits_obstacle');

  const result = CommandEngine.simulateChase(
    { x: 0, y: 0 },
    [],
    { x: 2, y: 2 },
    [{ dir: 'LEFT', distance: 1 }],
    3,
    [{ x: 1, y: 2 }]
  );
  assert.equal(result.invalidThiefRoute, true);
  assert.equal(result.thiefRouteError, 'thief_hits_obstacle');
});

test('chase validation rejects a map that completely blocks every capture route', () => {
  const validation = CommandEngine.validateChaseScenario(
    { x: 0, y: 0 },
    { x: 2, y: 2 },
    [{ dir: 'LEFT', distance: 1 }],
    3,
    [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ]
  );
  assert.equal(validation.isValid, false);
  assert.equal(validation.reason, 'no_capture_route');
});

test('chase validation rejects overlapping actors and malformed obstacles', () => {
  assert.equal(
    CommandEngine.validateChaseScenario(
      { x: 1, y: 1 },
      { x: 1, y: 1 },
      [{ dir: 'LEFT', distance: 1 }],
      3,
      []
    ).reason,
    'same_cop_and_thief_start'
  );
  assert.equal(
    CommandEngine.validateChaseScenario(
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      [{ dir: 'LEFT', distance: 1 }],
      3,
      [{ x: 3, y: 0 }]
    ).reason,
    'obstacle_outside'
  );
});

test('chase obstacle collision stops the cop before the blocked point', () => {
  const result = CommandEngine.simulateChase(
    { x: 0, y: 2 },
    [{ dir: 'RIGHT', distance: 1 }],
    { x: 2, y: 0 },
    [{ dir: 'LEFT', distance: 2 }],
    3,
    [{ x: 1, y: 2 }]
  );

  assert.equal(result.caught, false);
  assert.equal(result.hitObstacle, true);
  assert.deepEqual(result.finalCopPos, { x: 0, y: 2 });
});

test('chase ends when the published thief route is finished', () => {
  const result = CommandEngine.simulateChase(
    { x: 0, y: 2 },
    [
      { dir: 'UP', distance: 1 },
      { dir: 'UP_RIGHT', distance: 1 },
      { dir: 'RIGHT', distance: 1 }
    ],
    { x: 2, y: 0 },
    [{ dir: 'LEFT', distance: 1 }],
    3,
    []
  );

  assert.equal(result.caught, false);
  assert.equal(result.turnLog.length, 1);
});

test('single-stroke drawing assessment approves continuous stroke without pen-up', () => {
  const targetLines = [
    { fromX: 1, fromY: 3, toX: 1, toY: 1 },
    { fromX: 1, fromY: 1, toX: 3, toY: 3 },
    { fromX: 3, fromY: 3, toX: 1, toY: 3 }
  ];
  const actualLines = [...targetLines];
  const commands = [
    { dir: 'UP', distance: 2 },
    { dir: 'DOWN_RIGHT', distance: 2 },
    { dir: 'LEFT', distance: 2 }
  ];

  const evalResult = CommandEngine.assessSingleStrokeDrawing({ x: 1, y: 3 }, actualLines, targetLines, commands);
  assert.equal(evalResult.isExactMatch, true);
  assert.equal(evalResult.hasPenUpCommand, false);
  assert.equal(evalResult.isSingleStroke, true);
  assert.equal(evalResult.isSuccess, true);
});

test('single-stroke drawing assessment rejects attempt using pen-up command', () => {
  const targetLines = [
    { fromX: 1, fromY: 3, toX: 1, toY: 1 },
    { fromX: 1, fromY: 1, toX: 3, toY: 3 },
    { fromX: 3, fromY: 3, toX: 1, toY: 3 }
  ];
  const actualLines = [...targetLines];
  const commands = [
    { dir: 'PEN_UP', distance: 1 },
    { dir: 'UP', distance: 2 },
    { dir: 'PEN_DOWN', distance: 1 },
    { dir: 'DOWN_RIGHT', distance: 2 },
    { dir: 'LEFT', distance: 2 }
  ];

  const evalResult = CommandEngine.assessSingleStrokeDrawing({ x: 1, y: 3 }, actualLines, targetLines, commands);
  assert.equal(evalResult.isExactMatch, true);
  assert.equal(evalResult.hasPenUpCommand, true);
  assert.equal(evalResult.isSingleStroke, false);
  assert.equal(evalResult.isSuccess, false);
  assert.match(evalResult.reason, /붓을 떼지 않고/);
});

test('single-stroke drawing assessment rejects incomplete figures', () => {
  const targetLines = [
    { fromX: 0, fromY: 2, toX: 0, toY: 0 },
    { fromX: 0, fromY: 0, toX: 2, toY: 2 },
    { fromX: 2, fromY: 2, toX: 0, toY: 2 }
  ];
  const incompleteLines = [targetLines[0]];
  const result = CommandEngine.assessSingleStrokeDrawing(
    { x: 0, y: 2 },
    incompleteLines,
    targetLines,
    [{ dir: 'UP', distance: 2 }]
  );

  assert.equal(result.isExactMatch, false);
  assert.ok(result.missingCount > 0);
  assert.equal(result.isSuccess, false);
});

test('single-stroke app evaluation uses the entered commands to reject pen-up', async () => {
  const targetLines = [
    { fromX: 0, fromY: 2, toX: 0, toY: 0 },
    { fromX: 0, fromY: 0, toX: 2, toY: 2 },
    { fromX: 2, fromY: 2, toX: 0, toY: 2 }
  ];
  const level = {
    gridSize: 3,
    starPos: { x: 0, y: 2 },
    targetLines
  };
  const app = Object.create(App.prototype);
  const resultModal = [];
  Object.assign(app, {
    currentMode: 'single_stroke',
    challengeType: 'stage',
    commands: [
      { dir: 'PEN_UP', distance: 1 },
      { dir: 'UP', distance: 2 },
      { dir: 'PEN_DOWN', distance: 1 },
      { dir: 'DOWN_RIGHT', distance: 2 },
      { dir: 'LEFT', distance: 2 }
    ],
    executionId: 7,
    setStatus: () => {},
    showResultModal: modal => resultModal.push(modal)
  });

  globalThis.window = {};
  try {
    await app.evaluateResult({
      hitWall: false,
      hitObstacle: false,
      lines: targetLines
    }, level, 7);
  } finally {
    delete globalThis.window;
  }

  assert.equal(resultModal.length, 1);
  assert.equal(resultModal[0].isSuccess, false);
  assert.match(resultModal[0].badge, /붓 떼기/);
});

test('drawing command simulation reaches evaluation without stale line state', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousSetTimeout = globalThis.setTimeout;
  globalThis.window = {};
  globalThis.document = {
    getElementById: () => null,
    querySelectorAll: () => []
  };
  globalThis.setTimeout = callback => {
    callback();
    return 0;
  };

  try {
    const app = Object.create(App.prototype);
    const evaluated = [];
    Object.assign(app, {
      currentMode: 'debug',
      challengeType: 'stage',
      commands: [{ dir: 'PEN_DOWN', distance: 1 }, { dir: 'RIGHT', distance: 1 }],
      currentLevel: {
        gridSize: 5,
        starPos: { x: 0, y: 0 },
        targetLines: [{ fromX: 0, fromY: 0, toX: 1, toY: 0 }]
      },
      isExecuting: false,
      executionId: 0,
      renderer: {
        clearDrawnLines() {},
        setVisitedCheckpointCount() {},
        setVisitedFuelCount() {},
        setStarPos() {},
        setPenDown() {},
        addDrawnLine() {}
      },
      waitForCanvasView: async () => true,
      setStatus: () => {},
      evaluateResult: async result => evaluated.push(result)
    });

    assert.doesNotThrow(() => app.updatePenStateUI());
    await app.runSimulation();
    assert.equal(evaluated.length, 1);
    assert.equal(evaluated[0].lines.length, 1);
    assert.equal(app.isExecuting, false);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    globalThis.setTimeout = previousSetTimeout;
  }
});
