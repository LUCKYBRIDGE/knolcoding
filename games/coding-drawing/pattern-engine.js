import { CommandEngine, DIRECTIONS, MAX_COMMAND_DISTANCE } from './command.js';

export const COMMAND_BLOCK_IDS = Object.freeze(['A', 'B']);
export const MAX_BLOCK_REPEAT = 9;
export const MAX_PATTERN_DEFINITION_COMMANDS = 8;
export const MAX_PATTERN_MAIN_BLOCKS = 16;
export const MAX_EXPANDED_PATTERN_COMMANDS = 128;
export const MAX_EXPANDED_PATTERN_STEPS = 256;

function countCompressedCommandsForSteps(stepDirections = []) {
  let count = 0;
  let runLength = 0;
  let previousDirection = null;

  for (const direction of stepDirections) {
    if (!DIRECTIONS[direction]) return Number.POSITIVE_INFINITY;
    if (direction !== previousDirection) {
      count += Math.ceil(runLength / MAX_COMMAND_DISTANCE);
      previousDirection = direction;
      runLength = 1;
    } else {
      runLength += 1;
    }
  }
  return count + Math.ceil(runLength / MAX_COMMAND_DISTANCE);
}

function getDefinitionCandidates(targetSteps = []) {
  const candidates = new Map();
  for (let start = 0; start < targetSteps.length; start++) {
    for (let end = start + 1; end <= targetSteps.length; end++) {
      const steps = targetSteps.slice(start, end);
      const definitionCost = countCompressedCommandsForSteps(steps);
      if (definitionCost > MAX_PATTERN_DEFINITION_COMMANDS) continue;
      const key = steps.join(',');
      if (!candidates.has(key)) candidates.set(key, { steps, definitionCost });
    }
  }
  return [...candidates.values()];
}

function countMatchingRepeats(targetSteps, startIndex, definitionSteps) {
  let repeatCount = 0;
  let cursor = startIndex;
  while (repeatCount < MAX_BLOCK_REPEAT) {
    const matches = definitionSteps.every(
      (direction, offset) => targetSteps[cursor + offset] === direction
    );
    if (!matches) break;
    repeatCount += 1;
    cursor += definitionSteps.length;
  }
  return repeatCount;
}

function findMinimumMainProgramSize(targetSteps, definitions, minimumInvocations) {
  const memo = new Map();
  const requiredUsage = definitions.map(() => minimumInvocations);

  const visit = (position, usage) => {
    if (position === targetSteps.length) {
      return usage.every((count, index) => count >= requiredUsage[index])
        ? 0
        : Number.POSITIVE_INFINITY;
    }

    const memoKey = `${position}|${usage.join(',')}`;
    if (memo.has(memoKey)) return memo.get(memoKey);

    let best = Number.POSITIVE_INFINITY;
    const direction = targetSteps[position];
    let plainDistance = 0;
    while (
      plainDistance < MAX_COMMAND_DISTANCE &&
      targetSteps[position + plainDistance] === direction
    ) {
      plainDistance += 1;
      best = Math.min(best, 1 + visit(position + plainDistance, usage));
    }

    definitions.forEach((definition, definitionIndex) => {
      const maximumRepeat = countMatchingRepeats(
        targetSteps,
        position,
        definition.steps
      );
      for (let repeat = 1; repeat <= maximumRepeat; repeat++) {
        const nextUsage = [...usage];
        nextUsage[definitionIndex] = Math.min(
          minimumInvocations,
          nextUsage[definitionIndex] + repeat
        );
        best = Math.min(
          best,
          1 + visit(position + definition.steps.length * repeat, nextUsage)
        );
      }
    });

    memo.set(memoKey, best);
    return best;
  };

  return visit(0, definitions.map(() => 0));
}

/**
 * 주어진 1칸 이동열을 정확히 실행하면서 필요한 사용자 정의 블록을 모두
 * 반복 사용하는 프로그램의 전역 최소 코드 수를 완전탐색으로 계산한다.
 */
export function analyzeMinimumCommandBlockCode(targetSteps = [], policy = {}) {
  const safeTargetSteps = targetSteps.filter(direction => DIRECTIONS[direction]);
  if (safeTargetSteps.length !== targetSteps.length || safeTargetSteps.length === 0) {
    return { minimumCodeSize: Number.POSITIVE_INFINITY, definitionCount: 0 };
  }

  const availableBlocks = Math.max(1, Math.min(2, policy.availableBlocks || 1));
  const requiredDefinitionCount = Math.max(
    1,
    Math.min(availableBlocks, policy.minUsedBlocks || availableBlocks)
  );
  const minimumInvocations = Math.max(2, policy.minimumInvocations || 2);
  const candidates = getDefinitionCandidates(safeTargetSteps);
  let minimumCodeSize = Number.POSITIVE_INFINITY;

  if (requiredDefinitionCount === 1) {
    for (const definition of candidates) {
      const mainSize = findMinimumMainProgramSize(
        safeTargetSteps,
        [definition],
        minimumInvocations
      );
      minimumCodeSize = Math.min(
        minimumCodeSize,
        definition.definitionCost + mainSize
      );
    }
  } else {
    for (const first of candidates) {
      for (const second of candidates) {
        const mainSize = findMinimumMainProgramSize(
          safeTargetSteps,
          [first, second],
          minimumInvocations
        );
        minimumCodeSize = Math.min(
          minimumCodeSize,
          first.definitionCost + second.definitionCost + mainSize
        );
      }
    }
  }

  return { minimumCodeSize, definitionCount: requiredDefinitionCount };
}

function cloneMove(command) {
  return {
    dir: command.dir,
    distance: Math.min(
      MAX_COMMAND_DISTANCE,
      Math.max(1, Math.trunc(command.distance || 1))
    )
  };
}

export function isMoveCommand(command) {
  return Boolean(
    command &&
    DIRECTIONS[command.dir] &&
    Number.isInteger(Number(command.distance)) &&
    Number(command.distance) >= 1 &&
    Number(command.distance) <= MAX_COMMAND_DISTANCE
  );
}

export function isCommandBlockCall(command) {
  return Boolean(
    command?.type === 'block' &&
    COMMAND_BLOCK_IDS.includes(command.blockId) &&
    Number.isInteger(Number(command.repeat)) &&
    Number(command.repeat) >= 1 &&
    Number(command.repeat) <= MAX_BLOCK_REPEAT
  );
}

export function normalizeMoveCommands(commands = []) {
  const safeMoves = commands.filter(isMoveCommand).map(cloneMove);
  return CommandEngine.compressStepList(CommandEngine.expandToStepList(safeMoves))
    .flatMap(command => {
      const chunks = [];
      let remainingDistance = command.distance;
      while (remainingDistance > 0) {
        const distance = Math.min(MAX_COMMAND_DISTANCE, remainingDistance);
        chunks.push({ dir: command.dir, distance });
        remainingDistance -= distance;
      }
      return chunks;
    });
}

export function normalizeMainProgram(program = []) {
  const normalized = [];
  for (const block of program) {
    if (isCommandBlockCall(block)) {
      normalized.push({
        type: 'block',
        blockId: block.blockId,
        repeat: Number(block.repeat)
      });
      continue;
    }
    if (!isMoveCommand(block)) continue;
    const move = cloneMove(block);
    const previous = normalized.at(-1);
    if (
      previous &&
      previous.type !== 'block' &&
      previous.dir === move.dir &&
      previous.distance + move.distance <= MAX_COMMAND_DISTANCE
    ) {
      previous.distance += move.distance;
    } else {
      normalized.push(move);
    }
  }
  return normalized;
}

export function expandCommandBlockProgram({
  main = [],
  definitions = {},
  availableBlocks = 1
} = {}) {
  const allowedIds = COMMAND_BLOCK_IDS.slice(0, Math.max(1, Math.min(2, availableBlocks)));
  const safeDefinitions = Object.fromEntries(allowedIds.map(blockId => [
    blockId,
    normalizeMoveCommands(definitions[blockId] || [])
  ]));
  const safeMain = normalizeMainProgram(main);
  const usage = Object.fromEntries(allowedIds.map(blockId => [blockId, 0]));
  const errors = [];

  for (const blockId of allowedIds) {
    if (safeDefinitions[blockId].length > MAX_PATTERN_DEFINITION_COMMANDS) {
      errors.push(`${blockId}_definition_too_long`);
    }
  }
  if (safeMain.length > MAX_PATTERN_MAIN_BLOCKS) errors.push('main_too_long');

  const commands = [];
  const sourceMap = [];
  for (let mainIndex = 0; mainIndex < safeMain.length; mainIndex++) {
    const block = safeMain[mainIndex];
    if (block.type !== 'block') {
      commands.push(cloneMove(block));
      sourceMap.push({ mainIndex, blockId: null, definitionIndex: null, invocation: null });
      continue;
    }

    if (!allowedIds.includes(block.blockId)) {
      errors.push('unavailable_block');
      continue;
    }
    const definition = safeDefinitions[block.blockId];
    if (definition.length === 0) {
      errors.push(`${block.blockId}_definition_empty`);
      continue;
    }
    usage[block.blockId] += block.repeat;
    for (let invocation = 0; invocation < block.repeat; invocation++) {
      for (let definitionIndex = 0; definitionIndex < definition.length; definitionIndex++) {
        commands.push(cloneMove(definition[definitionIndex]));
        sourceMap.push({
          mainIndex,
          blockId: block.blockId,
          definitionIndex,
          invocation: invocation + 1,
          invocationCount: block.repeat
        });
      }
    }
  }

  const expandedStepCount = commands.reduce((total, command) => total + command.distance, 0);
  if (commands.length > MAX_EXPANDED_PATTERN_COMMANDS) errors.push('expanded_commands_too_long');
  if (expandedStepCount > MAX_EXPANDED_PATTERN_STEPS) errors.push('expanded_steps_too_long');

  const usedBlockIds = allowedIds.filter(blockId => usage[blockId] > 0);
  const unusedDefinedBlockIds = allowedIds.filter(blockId => (
    safeDefinitions[blockId].length > 0 && usage[blockId] === 0
  ));
  if (unusedDefinedBlockIds.length > 0) errors.push('unused_definition');

  const definitionBlockCount = usedBlockIds.reduce(
    (total, blockId) => total + safeDefinitions[blockId].length,
    0
  );
  const definedBlockCount = allowedIds.reduce(
    (total, blockId) => total + safeDefinitions[blockId].length,
    0
  );
  const mainBlockCount = safeMain.length;

  return {
    isValid: errors.length === 0,
    errors: [...new Set(errors)],
    commands,
    sourceMap,
    definitions: safeDefinitions,
    main: safeMain,
    usage,
    usedBlockIds,
    unusedDefinedBlockIds,
    definitionBlockCount,
    definedBlockCount,
    mainBlockCount,
    codeSize: definitionBlockCount + mainBlockCount,
    authoredCodeSize: definedBlockCount + mainBlockCount,
    expandedStepCount
  };
}

export function assessCommandBlockUsage(programAnalysis = {}, policy = {}) {
  const requiredUsedBlocks = Math.max(1, Math.min(2, policy.minUsedBlocks || 1));
  const minimumInvocations = Math.max(2, policy.minimumInvocations || 2);
  const repeatedBlockIds = (programAnalysis.usedBlockIds || []).filter(
    blockId => (programAnalysis.usage?.[blockId] || 0) >= minimumInvocations
  );
  return {
    requiredUsedBlocks,
    minimumInvocations,
    repeatedBlockIds,
    hasEnoughRepeatedBlocks: repeatedBlockIds.length >= requiredUsedBlocks,
    hasUnusedDefinitions: (programAnalysis.unusedDefinedBlockIds || []).length > 0
  };
}

export function assessOrderedFuelStops(pathSteps = [], fuelStops = []) {
  const safeStops = Array.isArray(fuelStops) ? fuelStops : [];
  let nextStopIndex = 0;
  const reachedAtSteps = [];

  for (let stepIndex = 1; stepIndex < pathSteps.length && nextStopIndex < safeStops.length; stepIndex++) {
    const step = pathSteps[stepIndex];
    const expected = safeStops[nextStopIndex];
    if (step.x === expected.x && step.y === expected.y) {
      reachedAtSteps.push(stepIndex);
      nextStopIndex += 1;
    }
  }

  return {
    reachedCount: nextStopIndex,
    targetCount: safeStops.length,
    reachedAtSteps,
    isComplete: nextStopIndex === safeStops.length,
    nextStop: safeStops[nextStopIndex] || null
  };
}
