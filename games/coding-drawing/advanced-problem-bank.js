import { CommandEngine, DIRECTIONS } from './command.js';

const GRID_SIZES = Object.freeze([5, 7, 9, 11]);
export const DRAWING_GRID_SIZES = Object.freeze([5, 7, 9]);
const DIRECTION_ENTRIES = Object.freeze(Object.entries(DIRECTIONS));

export const OBSTACLE_COUNT_LIMITS = Object.freeze({
  5: 5,
  7: 6,
  9: 8,
  11: 10
});

export const ROUTING_MAXIMUM_PATH_COUNTS = Object.freeze({
  5: 20,
  7: 48,
  9: 96,
  11: 192
});

export const DRAWING_MINIMUM_SPANS = Object.freeze({
  5: 4,
  7: 5,
  9: 6,
  11: 7
});

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInteger(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

function pickRandom(random, values) {
  return values[Math.floor(random() * values.length)];
}

function shuffled(random, values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function pointKey(point) {
  return `${point.x},${point.y}`;
}

function edgeKey(from, to) {
  const fromKey = pointKey(from);
  const toKey = pointKey(to);
  return fromKey < toKey ? `${fromKey}|${toKey}` : `${toKey}|${fromKey}`;
}

function getDrawingBounds(edges) {
  const points = edges.flatMap(edge => [edge.from, edge.to]);
  return {
    minX: Math.min(...points.map(point => point.x)),
    maxX: Math.max(...points.map(point => point.x)),
    minY: Math.min(...points.map(point => point.y)),
    maxY: Math.max(...points.map(point => point.y))
  };
}

function edgesCrossBetweenGridPoints(first, second) {
  const firstDiagonal = (
    Math.abs(first.to.x - first.from.x) === 1 &&
    Math.abs(first.to.y - first.from.y) === 1
  );
  const secondDiagonal = (
    Math.abs(second.to.x - second.from.x) === 1 &&
    Math.abs(second.to.y - second.from.y) === 1
  );
  if (!firstDiagonal || !secondDiagonal) return false;

  const firstEndpoints = new Set([pointKey(first.from), pointKey(first.to)]);
  if (
    firstEndpoints.has(pointKey(second.from)) ||
    firstEndpoints.has(pointKey(second.to))
  ) {
    return false;
  }
  return (
    first.from.x + first.to.x === second.from.x + second.to.x &&
    first.from.y + first.to.y === second.from.y + second.to.y
  );
}

function centerDrawingGraph(graph, gridSize) {
  const bounds = getDrawingBounds(graph.edges);
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  const offsetX = Math.floor((gridSize - width) / 2) - bounds.minX;
  const offsetY = Math.floor((gridSize - height) / 2) - bounds.minY;
  const translate = point => ({
    x: point.x + offsetX,
    y: point.y + offsetY
  });
  return {
    ...graph,
    start: translate(graph.start),
    edges: graph.edges.map(edge => ({
      from: translate(edge.from),
      to: translate(edge.to)
    }))
  };
}

function drawingMeetsVisualQuality(graph, gridSize) {
  const minimumSpan = DRAWING_MINIMUM_SPANS[gridSize];
  const bounds = getDrawingBounds(graph.edges);
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  if (width < minimumSpan || height < minimumSpan) return false;

  for (let firstIndex = 0; firstIndex < graph.edges.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < graph.edges.length; secondIndex++) {
      if (edgesCrossBetweenGridPoints(
        graph.edges[firstIndex],
        graph.edges[secondIndex]
      )) {
        return false;
      }
    }
  }
  return true;
}

function isInside(point, gridSize) {
  return (
    point.x >= 0 &&
    point.x < gridSize &&
    point.y >= 0 &&
    point.y < gridSize
  );
}

function compressSteps(steps) {
  const commands = [];
  for (const dir of steps) {
    const previous = commands.at(-1);
    if (previous?.dir === dir) {
      previous.distance += 1;
    } else {
      commands.push({ dir, distance: 1 });
    }
  }
  return commands;
}

function directionBetween(from, to) {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  return DIRECTION_ENTRIES.find(([, vector]) => (
    vector.dx === dx && vector.dy === dy
  ))?.[0];
}

const GRID_TRANSFORMS = Object.freeze([
  (point, max) => ({ x: point.x, y: point.y }),
  (point, max) => ({ x: max - point.x, y: point.y }),
  (point, max) => ({ x: point.x, y: max - point.y }),
  (point, max) => ({ x: max - point.x, y: max - point.y }),
  point => ({ x: point.y, y: point.x }),
  (point, max) => ({ x: max - point.y, y: point.x }),
  (point, max) => ({ x: point.y, y: max - point.x }),
  (point, max) => ({ x: max - point.y, y: max - point.x })
]);

function canonicalRouteSignature(level, includeThiefRoute = false) {
  const max = level.gridSize - 1;
  const signatures = GRID_TRANSFORMS.map(transform => {
    const mapPoint = point => transform(point, max);
    const signature = {
      start: mapPoint(level.starPos),
      obstacles: (level.obstacles || [])
        .map(mapPoint)
        .sort((a, b) => a.y - b.y || a.x - b.x)
    };

    if (includeThiefRoute) {
      const thiefRoute = CommandEngine.traceChaseThiefRoute(
        level.thiefPos,
        level.thiefCommands,
        level.gridSize,
        level.obstacles || []
      );
      signature.thiefRoute = thiefRoute.positions.map(mapPoint);
      signature.handcuffs = level.handcuffPos ? mapPoint(level.handcuffPos) : null;
    } else {
      signature.goal = mapPoint(level.goalPos);
    }
    return JSON.stringify(signature);
  });
  return signatures.sort()[0];
}

function canonicalDrawingSignature(edges) {
  const signatures = GRID_TRANSFORMS.map(transform => {
    const transformedEdges = edges.map(edge => {
      const from = transform(edge.from, 0);
      const to = transform(edge.to, 0);
      return { from, to };
    });
    const allPoints = transformedEdges.flatMap(edge => [edge.from, edge.to]);
    const minX = Math.min(...allPoints.map(point => point.x));
    const minY = Math.min(...allPoints.map(point => point.y));
    return transformedEdges
      .map(edge => edgeKey(
        { x: edge.from.x - minX, y: edge.from.y - minY },
        { x: edge.to.x - minX, y: edge.to.y - minY }
      ))
      .sort()
      .join(';');
  });
  return signatures.sort()[0];
}

function makeEfficiencyProblems(gridSize) {
  const random = createSeededRandom(1100 + gridSize);
  const problems = [];
  const signatures = new Set();

  for (let attempt = 0; attempt < 20000 && problems.length < 5; attempt++) {
    const start = {
      x: randomInteger(random, 0, gridSize - 1),
      y: randomInteger(random, 0, gridSize - 1)
    };
    let cursor = { ...start };
    const runCount = 4 + problems.length;
    const groups = [];
    let previousDirection = '';

    for (let runIndex = 0; runIndex < runCount; runIndex++) {
      const candidates = shuffled(random, DIRECTION_ENTRIES)
        .filter(([dir, direction]) => {
          if (dir === previousDirection) return false;
          const firstStep = {
            x: cursor.x + direction.dx,
            y: cursor.y + direction.dy
          };
          const secondStep = {
            x: cursor.x + direction.dx * 2,
            y: cursor.y + direction.dy * 2
          };
          return isInside(firstStep, gridSize) && isInside(secondStep, gridSize);
        });
      if (candidates.length === 0) break;

      const [dir, direction] = candidates[0];
      let maximum = 0;
      while (isInside({
        x: cursor.x + direction.dx * (maximum + 1),
        y: cursor.y + direction.dy * (maximum + 1)
      }, gridSize)) {
        maximum++;
      }
      const distance = randomInteger(
        random,
        2,
        Math.min(maximum, Math.max(2, Math.floor(gridSize / 2)))
      );
      groups.push([dir, distance]);
      cursor = {
        x: cursor.x + direction.dx * distance,
        y: cursor.y + direction.dy * distance
      };
      previousDirection = dir;
    }

    if (groups.length !== runCount) continue;
    const minimumDirectionVariety = Math.min(5, Math.ceil(runCount / 2));
    if (new Set(groups.map(([dir]) => dir)).size < minimumDirectionVariety) continue;
    const signature = groups.map(([dir, distance]) => `${dir}:${distance}`).join('|');
    if (signatures.has(signature)) continue;
    signatures.add(signature);

    problems.push({
      title: '',
      gridSize,
      starPos: start,
      sourceCommands: groups.flatMap(([dir, count]) => (
        Array.from({ length: count }, () => ({ dir, distance: 1 }))
      )),
      lesson: '긴 명령을 실행 순서대로 살펴보고, 서로 이웃한 같은 방향만 정확히 묶어 보세요.',
      guide: ''
    });
  }

  if (problems.length !== 5) {
    throw new Error(`${gridSize}x${gridSize} 고급 효율 명령 문제를 만들지 못했습니다.`);
  }
  return problems;
}

function makeShortestProblems(gridSize) {
  const placements = {
    5: [
      [{ x: 0, y: 0 }, { x: 3, y: 1 }],
      [{ x: 4, y: 0 }, { x: 1, y: 2 }],
      [{ x: 1, y: 1 }, { x: 4, y: 3 }],
      [{ x: 0, y: 4 }, { x: 4, y: 1 }],
      [{ x: 1, y: 4 }, { x: 4, y: 0 }]
    ],
    7: [
      [{ x: 1, y: 1 }, { x: 4, y: 3 }],
      [{ x: 0, y: 1 }, { x: 4, y: 4 }],
      [{ x: 6, y: 1 }, { x: 1, y: 4 }],
      [{ x: 1, y: 6 }, { x: 6, y: 2 }],
      [{ x: 0, y: 6 }, { x: 6, y: 2 }]
    ],
    9: [
      [{ x: 2, y: 1 }, { x: 6, y: 4 }],
      [{ x: 0, y: 2 }, { x: 5, y: 6 }],
      [{ x: 8, y: 1 }, { x: 2, y: 5 }],
      [{ x: 1, y: 8 }, { x: 8, y: 3 }],
      [{ x: 0, y: 8 }, { x: 8, y: 2 }]
    ],
    11: [
      [{ x: 2, y: 2 }, { x: 7, y: 5 }],
      [{ x: 0, y: 3 }, { x: 6, y: 7 }],
      [{ x: 10, y: 1 }, { x: 3, y: 6 }],
      [{ x: 2, y: 10 }, { x: 10, y: 4 }],
      [{ x: 0, y: 10 }, { x: 10, y: 3 }]
    ]
  };

  return placements[gridSize].map(([starPos, goalPos]) => {
    const level = {
      title: '',
      gridSize,
      starPos,
      goalPos,
      obstacles: [],
      guide: ''
    };
    const analysis = CommandEngine.analyzeShortestPaths(
      level.starPos,
      level.goalPos,
      gridSize,
      []
    );
    level.solutionCount = analysis.pathCount;
    level.shortestDistance = analysis.distance;
    return level;
  });
}

function uniquePoints(points) {
  return [...new Map(points.map(point => [pointKey(point), point])).values()];
}

function makeObstaclePattern(gridSize, archetypeIndex, variant = 0) {
  const edge = gridSize - 1;
  const middle = Math.floor(edge / 2);
  const firstThird = Math.max(1, Math.floor(edge / 3));
  const secondThird = Math.min(edge - 1, Math.ceil(edge * 2 / 3));
  const gapA = 1 + (variant % Math.max(1, edge - 1));
  const gapB = edge - gapA;
  const points = [];

  if (archetypeIndex === 0) {
    for (let y = 0; y <= edge; y++) {
      if (y !== gapA) points.push({ x: middle, y });
    }
  } else if (archetypeIndex === 1) {
    for (let y = 0; y <= edge; y++) {
      if (y !== gapA) points.push({ x: firstThird, y });
      if (y !== gapB) points.push({ x: secondThird, y });
    }
  } else if (archetypeIndex === 2) {
    for (let y = 0; y <= middle + 1 && y <= edge; y++) {
      points.push({ x: middle, y });
    }
    for (let x = middle; x <= edge; x++) {
      points.push({ x, y: Math.min(edge, middle + 1) });
    }
    points.splice(variant % Math.max(1, points.length), 1);
  } else if (archetypeIndex === 3) {
    for (let y = 1; y <= edge - 1; y++) {
      points.push({ x: 1, y }, { x: edge - 1, y });
    }
    for (let x = 1; x <= edge - 1; x++) {
      points.push({ x, y: edge - 1 });
    }
    points.splice(variant % Math.max(1, points.length), 1);
  } else if (archetypeIndex === 4) {
    for (let coordinate = 0; coordinate <= edge; coordinate++) {
      if (coordinate === gapA) continue;
      points.push({ x: coordinate, y: coordinate });
      if (coordinate < edge) {
        points.push({ x: coordinate + 1, y: coordinate });
      }
    }
  } else if (archetypeIndex === 5) {
    const horizontalGate = gapA === middle ? gapB : gapA;
    for (let x = 0; x <= edge; x++) {
      if (x !== horizontalGate) points.push({ x, y: middle });
    }
    for (let y = middle + 1; y < edge; y++) {
      points.push({ x: middle, y });
    }
  } else if (archetypeIndex === 6) {
    const radius = Math.max(1, Math.floor(gridSize / 3));
    const min = middle - radius;
    const max = middle + radius;
    for (let coordinate = min; coordinate <= max; coordinate++) {
      points.push(
        { x: coordinate, y: min },
        { x: coordinate, y: max },
        { x: min, y: coordinate },
        { x: max, y: coordinate }
      );
    }
    const gateIndex = variant % Math.max(1, points.length);
    points.splice(gateIndex, 1);
  } else if (archetypeIndex === 7) {
    for (let coordinate = 0; coordinate <= edge; coordinate++) {
      if (coordinate !== gapA) points.push({ x: middle, y: coordinate });
      if (coordinate !== gapB) points.push({ x: coordinate, y: middle });
    }
  } else if (archetypeIndex === 8) {
    if (gridSize === 5) {
      for (let y = 0; y <= edge; y++) {
        if (y !== gapA) {
          points.push({ x: 1, y }, { x: edge - 1, y });
        }
      }
      return uniquePoints(points);
    }
    const wallXs = uniquePoints([
      { x: firstThird, y: 0 },
      { x: middle, y: 0 },
      { x: secondThird, y: 0 }
    ]).map(point => point.x);
    for (let wallIndex = 0; wallIndex < wallXs.length; wallIndex++) {
      for (let y = 0; y <= edge; y++) {
        if (y !== gapA) {
          points.push({ x: wallXs[wallIndex], y });
        }
      }
    }
  } else {
    for (let x = 1; x <= edge - 1; x++) {
      if (x !== gapA) points.push({ x, y: 1 });
      if (x !== gapB) points.push({ x, y: edge - 1 });
    }
    for (let y = 1; y <= edge - 1; y++) {
      points.push({ x: 1, y }, { x: edge - 1, y });
    }
  }

  return uniquePoints(points.filter(point => isInside(point, gridSize)));
}

function transformObstaclePattern(points, gridSize, transformIndex) {
  const transform = GRID_TRANSFORMS[transformIndex % GRID_TRANSFORMS.length];
  const max = gridSize - 1;
  return uniquePoints(points.map(point => transform(point, max)));
}

function routeObstacleIsInfluential(level, obstacleIndex) {
  const reducedObstacles = level.obstacles.filter((_, index) => index !== obstacleIndex);
  const reduced = CommandEngine.analyzeShortestPaths(
    level.starPos,
    level.goalPos,
    level.gridSize,
    reducedObstacles
  );
  return (
    reduced.distance !== level.shortestDistance ||
    reduced.pathCount !== level.solutionCount
  );
}

function pruneRouteObstacles(level, random, minimumDetour, maximumPathCount) {
  let obstacles = [...level.obstacles];
  let baseline = CommandEngine.analyzeShortestPaths(
    level.starPos,
    level.goalPos,
    level.gridSize,
    obstacles
  );

  for (const obstacle of shuffled(random, obstacles)) {
    const candidate = obstacles.filter(point => pointKey(point) !== pointKey(obstacle));
    const analysis = CommandEngine.analyzeShortestPaths(
      level.starPos,
      level.goalPos,
      level.gridSize,
      candidate
    );
    const directDistance = Math.max(
      Math.abs(level.goalPos.x - level.starPos.x),
      Math.abs(level.goalPos.y - level.starPos.y)
    );
    if (
      Number.isFinite(analysis.distance) &&
      analysis.distance - directDistance >= minimumDetour &&
      analysis.pathCount >= 2 &&
      analysis.pathCount <= maximumPathCount
    ) {
      obstacles = candidate;
      baseline = analysis;
    }
  }
  return { obstacles, analysis: baseline };
}

function makeRoutingProblems(gridSize) {
  const random = createSeededRandom(2200 + gridSize);
  const problems = [];
  const signatures = new Set();
  const profiles = {
    5: [
      [1, 20], [1, 18], [1, 16], [1, 14], [1, 12],
      [2, 16], [2, 14], [2, 12], [2, 10], [2, 8]
    ],
    7: [
      [1, 48], [1, 40], [1, 32], [2, 40], [2, 32],
      [2, 24], [2, 20], [2, 24], [3, 18], [3, 14]
    ],
    9: [
      [1, 96], [1, 80], [2, 72], [2, 56], [2, 40],
      [3, 48], [3, 36], [2, 40], [2, 48], [3, 24]
    ],
    11: [
      [1, 192], [2, 160], [2, 128], [2, 96], [2, 128],
      [3, 80], [1, 128], [2, 96], [2, 112], [3, 48]
    ]
  };

  for (let archetypeIndex = 0; archetypeIndex < 10; archetypeIndex++) {
    const [minimumDetour, maximumPathCount] = profiles[gridSize][archetypeIndex];
    let selected = null;
    const rejectionCounts = {
      placement: 0,
      detour: 0,
      pruning: 0,
      influence: 0,
      duplicate: 0
    };

    for (let attempt = 0; attempt < 30000 && !selected; attempt++) {
      let obstacles = transformObstaclePattern(
        makeObstaclePattern(gridSize, archetypeIndex, attempt),
        gridSize,
        attempt
      );
      const blocked = new Set(obstacles.map(pointKey));
      const freeCells = shuffled(
        random,
        Array.from({ length: gridSize * gridSize }, (_, index) => ({
          x: index % gridSize,
          y: Math.floor(index / gridSize)
        })).filter(point => !blocked.has(pointKey(point)))
      );
      const starPos = freeCells[0];
      const goalPos = freeCells.find(point => {
        const deltaX = Math.abs(point.x - starPos.x);
        const deltaY = Math.abs(point.y - starPos.y);
        return (
          Math.max(deltaX, deltaY) >= gridSize - 2 &&
          Math.min(deltaX, deltaY) >= Math.max(1, Math.floor(gridSize / 4))
        );
      });
      if (!starPos || !goalPos) {
        rejectionCounts.placement++;
        continue;
      }

      const directDistance = Math.max(
        Math.abs(goalPos.x - starPos.x),
        Math.abs(goalPos.y - starPos.y)
      );
      const initialAnalysis = CommandEngine.analyzeShortestPaths(
        starPos,
        goalPos,
        gridSize,
        obstacles
      );
      if (
        !Number.isFinite(initialAnalysis.distance) ||
        initialAnalysis.distance - directDistance < minimumDetour ||
        initialAnalysis.pathCount < 2 ||
        initialAnalysis.pathCount > maximumPathCount
      ) {
        rejectionCounts.detour++;
        continue;
      }

      const pruned = pruneRouteObstacles({
        starPos,
        goalPos,
        gridSize,
        obstacles,
        shortestDistance: initialAnalysis.distance,
        solutionCount: initialAnalysis.pathCount
      }, random, minimumDetour, maximumPathCount);
      obstacles = pruned.obstacles;
      if (
        obstacles.length < 2 ||
        obstacles.length > OBSTACLE_COUNT_LIMITS[gridSize] ||
        pruned.analysis.distance - directDistance < minimumDetour ||
        pruned.analysis.pathCount < 2 ||
        pruned.analysis.pathCount > maximumPathCount
      ) {
        rejectionCounts.pruning++;
        continue;
      }

      const level = {
        title: '',
        gridSize,
        starPos,
        goalPos,
        obstacles,
        solutionCount: pruned.analysis.pathCount,
        shortestDistance: pruned.analysis.distance,
        directDistance,
        detourDistance: pruned.analysis.distance - directDistance,
        obstacleArchetype: archetypeIndex,
        guide: ''
      };
      if (!obstacles.every((_, index) => routeObstacleIsInfluential(level, index))) {
        rejectionCounts.influence++;
        continue;
      }

      const signature = canonicalRouteSignature(level);
      if (signatures.has(signature)) {
        rejectionCounts.duplicate++;
        continue;
      }
      signatures.add(signature);
      selected = level;
    }

    if (!selected) {
      throw new Error(
        `${gridSize}x${gridSize} 장애물 유형 ${archetypeIndex + 1}을 만들지 못했습니다: ` +
        JSON.stringify(rejectionCounts)
      );
    }
    problems.push(selected);
  }
  return problems;
}

function makeSelfAvoidingThiefRoute(random, gridSize, obstacles = []) {
  const blocked = new Set(obstacles.map(pointKey));
  const freeCells = shuffled(
    random,
    Array.from({ length: gridSize * gridSize }, (_, index) => ({
      x: index % gridSize,
      y: Math.floor(index / gridSize)
    })).filter(point => !blocked.has(pointKey(point)))
  );
  const start = freeCells[0];
  if (!start) return null;

  const targetLength = randomInteger(
    random,
    Math.max(5, gridSize),
    Math.min(freeCells.length - 1, gridSize + Math.max(3, Math.floor(gridSize / 2)))
  );
  const visited = new Set([pointKey(start)]);
  const steps = [];
  let cursor = { ...start };

  for (let stepIndex = 0; stepIndex < targetLength; stepIndex++) {
    const candidates = shuffled(random, DIRECTION_ENTRIES)
      .filter(([, direction]) => {
        const next = {
          x: cursor.x + direction.dx,
          y: cursor.y + direction.dy
        };
        return (
          isInside(next, gridSize) &&
          !blocked.has(pointKey(next)) &&
          !visited.has(pointKey(next))
        );
      });
    if (candidates.length === 0) return null;

    const [dir, direction] = candidates[0];
    steps.push(dir);
    cursor = {
      x: cursor.x + direction.dx,
      y: cursor.y + direction.dy
    };
    visited.add(pointKey(cursor));
  }

  const commands = compressSteps(steps);
  if (commands.length < 3) return null;
  return { start, commands, positions: [...visited] };
}

function chaseObstacleIsInfluential(level, obstacleIndex) {
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
}

function reduceChaseObstaclesToLimit(level, random) {
  const maximumCount = OBSTACLE_COUNT_LIMITS[level.gridSize];
  let obstacles = [...level.obstacles];
  const initialAnalysis = CommandEngine.analyzeChaseCapturePlans(
    level.starPos,
    level.thiefPos,
    level.thiefCommands,
    level.gridSize,
    obstacles
  );
  if (!initialAnalysis) return null;

  const targetEarliestTurn = initialAnalysis.earliestTurn;
  while (obstacles.length > 1) {
    let removedObstacle = false;
    for (const obstacle of shuffled(random, obstacles)) {
      const candidate = obstacles.filter(point => pointKey(point) !== pointKey(obstacle));
      const analysis = CommandEngine.analyzeChaseCapturePlans(
        level.starPos,
        level.thiefPos,
        level.thiefCommands,
        level.gridSize,
        candidate
      );
      if (
        analysis &&
        analysis.earliestTurn === targetEarliestTurn &&
        analysis.pathCount >= 2
      ) {
        obstacles = candidate;
        removedObstacle = true;
        break;
      }
    }
    if (!removedObstacle) break;
  }

  const analysis = CommandEngine.analyzeChaseCapturePlans(
    level.starPos,
    level.thiefPos,
    level.thiefCommands,
    level.gridSize,
    obstacles
  );
  return { obstacles, analysis };
}

function makeChaseProblems(gridSize) {
  const random = createSeededRandom(3300 + gridSize);
  const problems = [];
  const signatures = new Set();
  const problemTypes = ['open', 0, 1, 2, 3, 'open', 4, 5, 6, 7];
  let openProblemIndex = 0;

  for (const problemType of problemTypes) {
    let selected = null;
    const isHandcuffOnlyProblem = problemType === 'open' && openProblemIndex === 1;
    if (problemType === 'open') openProblemIndex++;

    for (let attempt = 0; attempt < 80000 && !selected; attempt++) {
      const openProblem = problemType === 'open';
      const requiresHandcuffs = isHandcuffOnlyProblem || (
        !openProblem && [1, 3, 5, 7].includes(problemType)
      );
      let obstacles = openProblem
        ? []
        : transformObstaclePattern(
            makeObstaclePattern(gridSize, problemType, attempt),
            gridSize,
            attempt
          );
      const route = makeSelfAvoidingThiefRoute(random, gridSize, obstacles);
      if (!route) continue;

      const routeTrace = CommandEngine.traceChaseThiefRoute(
        route.start,
        route.commands,
        gridSize,
        obstacles
      );
      if (!routeTrace.isValid) continue;
      const reserved = new Set([
        ...routeTrace.positions.map(pointKey),
        ...obstacles.map(pointKey)
      ]);
      const copCandidates = shuffled(
        random,
        Array.from({ length: gridSize * gridSize }, (_, index) => ({
          x: index % gridSize,
          y: Math.floor(index / gridSize)
        })).filter(point => !reserved.has(pointKey(point)))
      );
      const starPos = copCandidates[0];
      if (!starPos) continue;

      const openAnalysis = CommandEngine.analyzeChaseCapturePlans(
        starPos,
        route.start,
        route.commands,
        gridSize,
        []
      );
      let obstacleAnalysis = CommandEngine.analyzeChaseCapturePlans(
        starPos,
        route.start,
        route.commands,
        gridSize,
        obstacles
      );
      if (
        !openAnalysis ||
        !obstacleAnalysis ||
        obstacleAnalysis.earliestTurn < 3 ||
        obstacleAnalysis.pathCount < 2
      ) {
        continue;
      }

      if (!openProblem) {
        if (obstacleAnalysis.earliestTurn <= openAnalysis.earliestTurn) continue;
        const reduced = reduceChaseObstaclesToLimit({
          starPos,
          thiefPos: route.start,
          thiefCommands: route.commands,
          gridSize,
          obstacles
        }, random);
        if (
          !reduced ||
          reduced.obstacles.length < 1 ||
          reduced.obstacles.length > OBSTACLE_COUNT_LIMITS[gridSize] ||
          !reduced.analysis ||
          reduced.analysis.pathCount < 2
        ) {
          continue;
        }
        obstacles = reduced.obstacles;
        obstacleAnalysis = reduced.analysis;
        if (obstacleAnalysis.earliestTurn <= openAnalysis.earliestTurn) continue;
      }

      let handcuffPos = null;
      let finalAnalysis = obstacleAnalysis;
      if (requiresHandcuffs) {
        const occupied = new Set([
          pointKey(starPos),
          ...routeTrace.positions.map(pointKey),
          ...obstacles.map(pointKey)
        ]);
        const handcuffCandidates = shuffled(
          random,
          Array.from({ length: gridSize * gridSize }, (_, index) => ({
            x: index % gridSize,
            y: Math.floor(index / gridSize)
          })).filter(point => !occupied.has(pointKey(point)))
        );

        for (const candidate of handcuffCandidates) {
          const analysis = CommandEngine.analyzeChaseCapturePlans(
            starPos,
            route.start,
            route.commands,
            gridSize,
            obstacles,
            candidate
          );
          if (
            analysis &&
            analysis.pathCount >= 2 &&
            analysis.earliestTurn > obstacleAnalysis.earliestTurn
          ) {
            handcuffPos = candidate;
            finalAnalysis = analysis;
            break;
          }
        }
        if (!handcuffPos) continue;
      }

      const level = {
        title: '',
        gridSize,
        starPos,
        thiefPos: route.start,
        thiefCommands: route.commands,
        obstacles,
        handcuffPos,
        solutionCount: finalAnalysis.pathCount,
        earliestCatchTurn: finalAnalysis.earliestTurn,
        obstacleDelay: obstacleAnalysis.earliestTurn - openAnalysis.earliestTurn,
        handcuffDelay: handcuffPos
          ? finalAnalysis.earliestTurn - obstacleAnalysis.earliestTurn
          : 0,
        obstacleArchetype: openProblem ? 'open' : problemType,
        thiefUniquePositionCount: routeTrace.positions.length,
        guide: ''
      };
      if (!openProblem) {
        level.influentialObstacleCount = obstacles.filter(
          (_, index) => chaseObstacleIsInfluential(level, index)
        ).length;
        if (level.influentialObstacleCount !== obstacles.length) continue;
      }

      const signature = canonicalRouteSignature(level, true);
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      selected = level;
    }

    if (!selected) {
      throw new Error(`${gridSize}x${gridSize} 도둑 잡기 유형 ${problemType}을 만들지 못했습니다.`);
    }
    problems.push(selected);
  }
  return problems;
}

const CURATED_DRAWING_MOTIFS = Object.freeze({
  debug: Object.freeze([
    { id: 'house', start: [0, 0], strokes: [
      [[0, 0], [0, 2], [2, 4], [4, 2], [4, 0], [0, 0]],
      [[1, 0], [1, 2], [2, 2], [2, 0]]
    ] },
    { id: 'envelope', start: [0, 0], strokes: [
      [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
      [[0, 4], [2, 2], [4, 4]]
    ] },
    { id: 'crown', start: [0, 0], strokes: [
      [[0, 0], [4, 0], [4, 1], [0, 1], [0, 0]],
      [[0, 1], [0, 3], [1, 2], [2, 4], [3, 2], [4, 3], [4, 1]]
    ] },
    { id: 'tree', start: [1, 0], strokes: [
      [[1, 0], [3, 0], [3, 1], [1, 1], [1, 0]],
      [[1, 1], [0, 2], [1, 2], [0, 3], [2, 4], [4, 3], [3, 2], [4, 2], [3, 1], [1, 1]]
    ] },
    { id: 'umbrella', start: [0, 2], strokes: [
      [[0, 2], [1, 3], [2, 4], [3, 3], [4, 2]],
      [[0, 2], [2, 2], [2, 4]],
      [[2, 2], [4, 2]],
      [[2, 2], [2, 0], [3, 0]]
    ] },
    { id: 'mountains', start: [0, 0], strokes: [
      [[0, 0], [1, 2], [2, 1], [3, 4], [4, 0], [0, 0]],
      [[2, 1], [3, 2], [4, 1]]
    ] },
    { id: 'boat', start: [0, 1], strokes: [
      [[0, 1], [1, 0], [3, 0], [4, 1], [0, 1]],
      [[2, 1], [2, 4]],
      [[2, 4], [4, 2], [2, 2]]
    ] },
    { id: 'fish', start: [0, 2], strokes: [
      [[0, 2], [2, 4], [4, 2], [2, 0], [0, 2]],
      [[0, 2], [0, 4], [1, 3], [0, 2]]
    ] },
    { id: 'rocket', start: [1, 1], strokes: [
      [[1, 1], [1, 3], [2, 4], [3, 3], [3, 1], [1, 1]],
      [[1, 2], [0, 0], [1, 1]],
      [[3, 2], [4, 0], [3, 1]],
      [[2, 1], [2, 0]]
    ] },
    { id: 'heart', start: [2, 0], strokes: [
      [[2, 0], [0, 2], [0, 3], [1, 4], [2, 3], [3, 4], [4, 3], [4, 2], [2, 0]]
    ] },
    { id: 'sparkle', start: [2, 0], strokes: [
      [[2, 0], [2, 4]],
      [[0, 2], [4, 2]],
      [[0, 0], [4, 4]],
      [[0, 4], [4, 0]]
    ] },
    { id: 'cat-head', start: [0, 1], strokes: [
      [[0, 0], [0, 3], [1, 4], [2, 3], [3, 4], [4, 3], [4, 0], [0, 0]],
      [[0, 2], [1, 2]],
      [[3, 2], [4, 2]],
      [[1, 1], [2, 0], [3, 1]]
    ] },
    { id: 'rabbit-head', start: [1, 2], strokes: [
      [[1, 2], [0, 4], [1, 4], [2, 2], [3, 4], [4, 4], [3, 2], [4, 1], [3, 0], [1, 0], [0, 1], [1, 2]],
      [[1, 0], [1, 1], [2, 0], [3, 1], [3, 0]],
      [[1, 2], [2, 1], [3, 2]]
    ] },
    { id: 'snail', start: [0, 0], strokes: [
      [[0, 0], [4, 0], [4, 2]],
      [[4, 2], [3, 4]],
      [[4, 2], [4, 4]],
      [[0, 0], [0, 3], [3, 3], [3, 1], [1, 1], [1, 2], [2, 2]]
    ] },
    { id: 'spiral', start: [0, 0], strokes: [
      [[0, 0], [4, 0], [4, 4], [0, 4], [0, 1], [3, 1], [3, 3], [1, 3], [1, 2], [2, 2]]
    ] },
    { id: 'star-outline', start: [2, 4], strokes: [
      [[2, 4], [3, 2], [4, 2], [3, 1], [4, 0], [2, 1], [0, 0], [1, 1], [0, 2], [1, 2], [2, 4]]
    ] },
    { id: 'apple', start: [2, 0], strokes: [
      [[2, 0], [0, 1], [0, 3], [1, 4], [2, 3], [3, 4], [4, 3], [4, 1], [2, 0]],
      [[2, 3], [2, 4], [3, 4]]
    ] },
    { id: 'mushroom', start: [0, 2], strokes: [
      [[0, 2], [1, 4], [3, 4], [4, 2], [0, 2]],
      [[1, 2], [1, 0], [3, 0], [3, 2]]
    ] },
    { id: 'pencil', start: [0, 0], strokes: [
      [[0, 0], [1, 0], [4, 3], [4, 4], [3, 4], [0, 1], [0, 0]],
      [[3, 3], [4, 3]],
      [[0, 0], [0, 1]]
    ] },
    { id: 'anchor', start: [2, 4], strokes: [
      [[2, 4], [2, 0], [1, 1], [0, 2]],
      [[2, 0], [3, 1], [4, 2]],
      [[1, 3], [3, 3]]
    ] },
    { id: 'camera', start: [0, 0], strokes: [
      [[0, 0], [4, 0], [4, 3], [0, 3], [0, 0]],
      [[1, 3], [1, 4], [3, 4], [3, 3]],
      [[2, 0], [3, 1], [2, 2], [1, 1], [2, 0]]
    ] },
    { id: 'shirt', start: [1, 0], strokes: [
      [[1, 0], [3, 0], [3, 2], [4, 3], [3, 4], [2, 3], [1, 4], [0, 3], [1, 2], [1, 0]]
    ] },
    { id: 'flag', start: [0, 0], strokes: [
      [[0, 0], [0, 4], [4, 4], [3, 3], [4, 2], [0, 2]]
    ] },
    { id: 'music-notes', start: [1, 0], strokes: [
      [[1, 0], [0, 1], [1, 2], [2, 1], [1, 0]],
      [[1, 2], [1, 4], [4, 4], [4, 1]],
      [[4, 1], [3, 0], [2, 1], [3, 2], [4, 1]]
    ] },
    { id: 'hourglass', start: [0, 0], strokes: [
      [[0, 0], [4, 0], [0, 4], [4, 4], [0, 0]]
    ] },
    { id: 'bridge', start: [0, 0], strokes: [
      [[0, 0], [0, 2], [1, 3], [2, 4], [3, 3], [4, 2], [4, 0]],
      [[0, 2], [4, 2]]
    ] },
    { id: 'balloon', start: [2, 0], strokes: [
      [[2, 0], [0, 2], [2, 4], [4, 2], [2, 0]],
      [[2, 4], [2, 2], [3, 1]]
    ] },
    { id: 'ladder', start: [0, 0], strokes: [
      [[0, 0], [0, 4]],
      [[4, 0], [4, 4]],
      [[0, 0], [4, 0]],
      [[0, 2], [4, 2]],
      [[0, 4], [4, 4]]
    ] },
    { id: 'diamond-flower', start: [2, 0], strokes: [
      [[2, 0], [0, 2], [2, 4], [4, 2], [2, 0]],
      [[0, 2], [4, 2]],
      [[2, 0], [2, 4]]
    ] },
    { id: 'zigzag-shield', start: [0, 0], strokes: [
      [[0, 0], [4, 0], [4, 3], [2, 4], [0, 3], [0, 0]],
      [[0, 2], [2, 3], [4, 2]]
    ] }
  ]),
  debug_guide: Object.freeze([
    { id: 'flower', start: [2, 0], strokes: [
      [[2, 0], [2, 3], [1, 4], [0, 3], [1, 2], [2, 3], [3, 4], [4, 3], [3, 2], [2, 3]],
      [[2, 1], [1, 0]],
      [[2, 1], [3, 0]]
    ] },
    { id: 'butterfly', start: [2, 0], strokes: [
      [[2, 0], [2, 4]],
      [[2, 3], [0, 4], [1, 2], [0, 1], [2, 2]],
      [[2, 3], [4, 4], [3, 2], [4, 1], [2, 2]]
    ] },
    { id: 'car', start: [0, 0], strokes: [
      [[0, 1], [0, 2], [1, 3], [3, 3], [4, 2], [4, 1], [0, 1]],
      [[1, 1], [0, 0], [1, 0], [2, 1]],
      [[3, 1], [2, 1], [3, 0], [4, 0], [3, 1]]
    ] },
    { id: 'castle', start: [0, 0], strokes: [
      [[0, 0], [0, 4], [1, 4], [1, 3], [2, 3], [2, 4], [3, 4], [3, 3], [4, 3], [4, 0], [0, 0]],
      [[1, 0], [1, 2], [2, 3], [3, 2], [3, 0]]
    ] },
    { id: 'key', start: [0, 2], strokes: [
      [[0, 2], [1, 4], [2, 2], [1, 0], [0, 2]],
      [[2, 2], [4, 2], [4, 1], [3, 1]]
    ] },
    { id: 'cup', start: [0, 3], strokes: [
      [[0, 3], [1, 0], [3, 0], [4, 3], [0, 3]],
      [[4, 2], [4, 1], [3, 1]]
    ] },
    { id: 'glasses', start: [0, 2], strokes: [
      [[0, 2], [1, 4], [2, 2], [1, 0], [0, 2]],
      [[2, 2], [3, 4], [4, 2], [3, 0], [2, 2]]
    ] },
    { id: 'turtle', start: [0, 2], strokes: [
      [[0, 2], [1, 1], [2, 1], [3, 2], [2, 3], [1, 3], [0, 2]],
      [[3, 2], [4, 2]],
      [[1, 1], [0, 0]],
      [[2, 1], [3, 0]],
      [[1, 3], [0, 4]],
      [[2, 3], [3, 4]]
    ] },
    { id: 'bird', start: [0, 2], strokes: [
      [[0, 2], [1, 1], [2, 1], [3, 2], [2, 3], [1, 3], [0, 2]],
      [[3, 2], [4, 1], [4, 2], [3, 2]],
      [[1, 2], [2, 1], [2, 3], [1, 2]],
      [[1, 1], [1, 0]],
      [[2, 1], [2, 0]]
    ] },
    { id: 'gift', start: [0, 0], strokes: [
      [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
      [[2, 0], [2, 4]],
      [[2, 4], [1, 3], [2, 3], [3, 3], [2, 4]]
    ] },
    { id: 'leaf', start: [0, 0], strokes: [
      [[0, 0], [1, 3], [3, 4], [4, 2], [3, 0], [0, 0]],
      [[0, 0], [3, 3]],
      [[1, 1], [1, 3]],
      [[2, 2], [3, 2]]
    ] },
    { id: 'kite', start: [2, 0], strokes: [
      [[2, 1], [0, 2], [2, 4], [4, 2], [2, 1]],
      [[2, 4], [2, 1], [1, 0], [2, 0]]
    ] },
    { id: 'robot', start: [0, 1], strokes: [
      [[0, 1], [0, 4], [4, 4], [4, 1], [0, 1]],
      [[1, 1], [1, 0]],
      [[3, 1], [3, 0]],
      [[0, 3], [4, 3]]
    ] },
    { id: 'tent', start: [0, 0], strokes: [
      [[0, 0], [2, 4], [4, 0], [0, 0]],
      [[2, 4], [2, 0], [3, 0]]
    ] },
    { id: 'pinwheel', start: [2, 2], strokes: [
      [[2, 2], [2, 4], [4, 4]],
      [[2, 2], [4, 2], [4, 0]],
      [[2, 2], [2, 0], [0, 0]],
      [[2, 2], [0, 2], [0, 4]]
    ] }
  ])
});

const DRAWING_MOTIF_LIBRARY = new Map(
  Object.values(CURATED_DRAWING_MOTIFS)
    .flat()
    .map(motif => [motif.id, motif])
);

const DRAWING_MOTIF_SELECTIONS = Object.freeze({
  debug: Object.freeze({
    5: Object.freeze([
      'house', 'envelope', 'crown', 'tree', 'umbrella',
      'boat', 'fish', 'heart', 'sparkle', 'cat-head',
      'rabbit-head', 'apple', 'mushroom', 'camera', 'shirt'
    ]),
    7: Object.freeze([
      'rocket', 'snail', 'spiral', 'star-outline', 'pencil',
      'anchor', 'flag', 'flower', 'car', 'key',
      'kite', 'leaf', 'cup', 'glasses', 'gift'
    ]),
    9: Object.freeze([
      'mountains', 'music-notes', 'butterfly', 'castle', 'turtle',
      'bird', 'robot', 'tent', 'pinwheel', 'hourglass',
      'bridge', 'balloon', 'ladder', 'diamond-flower', 'zigzag-shield'
    ])
  }),
  debug_guide: Object.freeze({
    5: Object.freeze([
      'flower', 'butterfly', 'car', 'castle', 'key',
      'cup', 'glasses', 'turtle', 'bird', 'gift',
      'leaf', 'kite', 'robot', 'tent', 'pinwheel'
    ]),
    7: Object.freeze([
      'house', 'envelope', 'crown', 'tree', 'umbrella',
      'mountains', 'boat', 'fish', 'rocket', 'heart',
      'sparkle', 'cat-head', 'rabbit-head', 'snail', 'spiral'
    ]),
    9: Object.freeze([
      'star-outline', 'apple', 'mushroom', 'pencil', 'anchor',
      'camera', 'shirt', 'flag', 'music-notes', 'hourglass',
      'bridge', 'balloon', 'ladder', 'diamond-flower', 'zigzag-shield'
    ])
  })
});

// 한붓그리기는 오일러 경로 가능 여부에 맞춘 기존 엄선 목록을 독립적으로 유지한다.
// 일반 그림의 크기별 소재를 다양화해도 한붓 문제 수와 수학적 조건은 흔들리지 않는다.
const SINGLE_STROKE_MOTIF_SELECTIONS = Object.freeze({
  5: Object.freeze([
    'house', 'envelope', 'crown', 'tree', 'umbrella',
    'boat', 'fish', 'heart', 'sparkle', 'cat-head',
    'rabbit-head', 'apple', 'mushroom', 'camera', 'shirt'
  ]),
  7: Object.freeze([
    'house', 'rocket', 'heart', 'snail', 'spiral',
    'star-outline', 'apple', 'pencil', 'anchor', 'flag',
    'flower', 'car', 'key', 'kite', 'leaf'
  ]),
  9: Object.freeze([
    'house', 'tree', 'mountains', 'boat', 'fish',
    'rocket', 'cat-head', 'snail', 'spiral', 'star-outline',
    'camera', 'music-notes', 'butterfly', 'castle', 'turtle'
  ])
});

function scaleMotifPoint(point, gridSize) {
  const scale = (gridSize - 1) / 4;
  return {
    x: Math.round(point[0] * scale),
    y: gridSize - 1 - Math.round(point[1] * scale)
  };
}

function rasterizeDrawingSegment(from, to) {
  const points = [{ ...from }];
  let x = from.x;
  let y = from.y;
  const deltaX = Math.abs(to.x - from.x);
  const deltaY = Math.abs(to.y - from.y);
  const stepX = from.x < to.x ? 1 : -1;
  const stepY = from.y < to.y ? 1 : -1;
  let error = deltaX - deltaY;

  while (x !== to.x || y !== to.y) {
    const doubledError = error * 2;
    if (doubledError > -deltaY) {
      error -= deltaY;
      x += stepX;
    }
    if (doubledError < deltaX) {
      error += deltaX;
      y += stepY;
    }
    points.push({ x, y });
  }
  return points;
}

function buildCuratedDrawingGraph(motif, gridSize) {
  const edges = new Map();
  const vertices = new Map();
  const degrees = new Map();

  for (const stroke of motif.strokes) {
    const scaledPoints = stroke.map(point => scaleMotifPoint(point, gridSize));
    for (let pointIndex = 1; pointIndex < scaledPoints.length; pointIndex++) {
      const rasterized = rasterizeDrawingSegment(
        scaledPoints[pointIndex - 1],
        scaledPoints[pointIndex]
      );
      for (let stepIndex = 1; stepIndex < rasterized.length; stepIndex++) {
        const from = rasterized[stepIndex - 1];
        const to = rasterized[stepIndex];
        if (pointKey(from) === pointKey(to)) continue;
        const key = edgeKey(from, to);
        if (edges.has(key)) continue;
        edges.set(key, { from: { ...from }, to: { ...to } });
        vertices.set(pointKey(from), { ...from });
        vertices.set(pointKey(to), { ...to });
        degrees.set(pointKey(from), (degrees.get(pointKey(from)) || 0) + 1);
        degrees.set(pointKey(to), (degrees.get(pointKey(to)) || 0) + 1);
      }
    }
  }

  const start = scaleMotifPoint(motif.start, gridSize);
  if (!vertices.has(pointKey(start))) {
    throw new Error(`${gridSize}x${gridSize} ${motif.id}: 붓 시작점이 그림과 연결되지 않습니다.`);
  }

  const visited = new Set();
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop();
    const currentKey = pointKey(current);
    if (visited.has(currentKey)) continue;
    visited.add(currentKey);
    for (const edge of edges.values()) {
      if (pointKey(edge.from) === currentKey && !visited.has(pointKey(edge.to))) {
        stack.push(edge.to);
      } else if (pointKey(edge.to) === currentKey && !visited.has(pointKey(edge.from))) {
        stack.push(edge.from);
      }
    }
  }
  if (visited.size !== vertices.size) {
    throw new Error(`${gridSize}x${gridSize} ${motif.id}: 서로 떨어진 선이 있습니다.`);
  }

  const degreeValues = [...degrees.values()];
  const graph = {
    start,
    edges: [...edges.values()],
    decisionVertices: degreeValues.filter(degree => degree >= 3).length,
    oddVertices: degreeValues.filter(degree => degree % 2 === 1).length,
    cycleCount: edges.size - vertices.size + 1
  };
  if (!drawingMeetsVisualQuality(graph, gridSize)) {
    throw new Error(`${gridSize}x${gridSize} ${motif.id}: 그림 품질 기준을 충족하지 못합니다.`);
  }
  return centerDrawingGraph(graph, gridSize);
}

function makeCoveringCommands(graph) {
  const adjacency = new Map();
  const points = new Map();
  const connect = (from, to) => {
    const fromKey = pointKey(from);
    points.set(fromKey, { ...from });
    points.set(pointKey(to), { ...to });
    if (!adjacency.has(fromKey)) adjacency.set(fromKey, []);
    adjacency.get(fromKey).push(pointKey(to));
  };
  for (const edge of graph.edges) {
    connect(edge.from, edge.to);
    connect(edge.to, edge.from);
  }
  for (const neighbors of adjacency.values()) {
    neighbors.sort((a, b) => a.localeCompare(b));
  }

  const shortestPathCache = new Map();
  const getShortestPath = (fromKey, toKey) => {
    const cacheKey = `${fromKey}>${toKey}`;
    if (shortestPathCache.has(cacheKey)) return shortestPathCache.get(cacheKey);

    const queue = [fromKey];
    const previous = new Map([[fromKey, null]]);
    for (let index = 0; index < queue.length && !previous.has(toKey); index++) {
      const current = queue[index];
      for (const neighbor of adjacency.get(current) || []) {
        if (previous.has(neighbor)) continue;
        previous.set(neighbor, current);
        queue.push(neighbor);
      }
    }
    if (!previous.has(toKey)) {
      throw new Error('그림의 두 꼭짓점을 연결하는 경로를 찾지 못했습니다.');
    }

    const pathKeys = [];
    for (let current = toKey; current !== null; current = previous.get(current)) {
      pathKeys.push(current);
    }
    pathKeys.reverse();
    const result = { distance: pathKeys.length - 1, pathKeys };
    shortestPathCache.set(cacheKey, result);
    shortestPathCache.set(`${toKey}>${fromKey}`, {
      distance: result.distance,
      pathKeys: [...pathKeys].reverse()
    });
    return result;
  };

  const getMinimumPairing = terminals => {
    if (terminals.length > 12) {
      throw new Error('최소 그림 경로를 만들기에는 홀수 꼭짓점이 너무 많습니다.');
    }
    const memo = new Map();
    const solve = mask => {
      if (mask === 0) return { cost: 0, pairs: [] };
      if (memo.has(mask)) return memo.get(mask);

      let first = 0;
      while ((mask & (1 << first)) === 0) first++;
      const withoutFirst = mask & ~(1 << first);
      let best = { cost: Number.POSITIVE_INFINITY, pairs: [] };
      for (let second = first + 1; second < terminals.length; second++) {
        if ((withoutFirst & (1 << second)) === 0) continue;
        const rest = solve(withoutFirst & ~(1 << second));
        const pairDistance = getShortestPath(
          terminals[first],
          terminals[second]
        ).distance;
        const cost = pairDistance + rest.cost;
        if (cost < best.cost) {
          best = {
            cost,
            pairs: [[terminals[first], terminals[second]], ...rest.pairs]
          };
        }
      }
      memo.set(mask, best);
      return best;
    };
    return solve((1 << terminals.length) - 1);
  };

  const startKey = pointKey(graph.start);
  const oddVertices = new Set(
    [...adjacency.entries()]
      .filter(([, neighbors]) => neighbors.length % 2 === 1)
      .map(([key]) => key)
  );
  const toggle = (set, key) => {
    if (set.has(key)) set.delete(key);
    else set.add(key);
  };

  let bestPlan = null;
  for (const endKey of [...points.keys()].sort((a, b) => a.localeCompare(b))) {
    const terminals = new Set(oddVertices);
    toggle(terminals, startKey);
    toggle(terminals, endKey);
    const pairing = getMinimumPairing([...terminals].sort((a, b) => a.localeCompare(b)));
    if (!bestPlan || pairing.cost < bestPlan.cost) {
      bestPlan = { endKey, ...pairing };
    }
  }

  const edgeInstances = [];
  const addEdgeInstance = (fromKey, toKey) => {
    edgeInstances.push({ id: edgeInstances.length, fromKey, toKey });
  };
  for (const edge of graph.edges) {
    addEdgeInstance(pointKey(edge.from), pointKey(edge.to));
  }
  for (const [fromKey, toKey] of bestPlan.pairs) {
    const { pathKeys } = getShortestPath(fromKey, toKey);
    for (let index = 1; index < pathKeys.length; index++) {
      addEdgeInstance(pathKeys[index - 1], pathKeys[index]);
    }
  }

  const multigraph = new Map();
  const addIncidentEdge = (fromKey, toKey, id) => {
    if (!multigraph.has(fromKey)) multigraph.set(fromKey, []);
    multigraph.get(fromKey).push({ id, toKey });
  };
  for (const edge of edgeInstances) {
    addIncidentEdge(edge.fromKey, edge.toKey, edge.id);
    addIncidentEdge(edge.toKey, edge.fromKey, edge.id);
  }

  const unusedEdges = new Set(edgeInstances.map(edge => edge.id));
  const stack = [startKey];
  const circuit = [];
  while (stack.length > 0) {
    const current = stack.at(-1);
    const neighbors = multigraph.get(current) || [];
    while (neighbors.length > 0 && !unusedEdges.has(neighbors.at(-1).id)) {
      neighbors.pop();
    }
    if (neighbors.length === 0) {
      circuit.push(stack.pop());
      continue;
    }
    const edge = neighbors.pop();
    unusedEdges.delete(edge.id);
    stack.push(edge.toKey);
  }

  const routeKeys = circuit.reverse();
  if (
    unusedEdges.size > 0 ||
    routeKeys.length !== edgeInstances.length + 1 ||
    routeKeys[0] !== startKey ||
    routeKeys.at(-1) !== bestPlan.endKey
  ) {
    throw new Error('최소 그림 순회 경로를 완성하지 못했습니다.');
  }

  const steps = [];
  for (let index = 1; index < routeKeys.length; index++) {
    const direction = directionBetween(
      points.get(routeKeys[index - 1]),
      points.get(routeKeys[index])
    );
    if (!direction) throw new Error('그림 순회 경로의 방향을 계산하지 못했습니다.');
    steps.push(direction);
  }
  return compressSteps(steps);
}

function makeDrawingProblems(gridSize, followCommands, sharedSignatures) {
  const mode = followCommands ? 'debug_guide' : 'debug';
  const motifIds = DRAWING_MOTIF_SELECTIONS[mode]?.[gridSize] || [];
  const motifs = motifIds.map(motifId => {
    const motif = DRAWING_MOTIF_LIBRARY.get(motifId);
    if (!motif) throw new Error(`${gridSize}x${gridSize}: ${motifId} 그림을 찾지 못했습니다.`);
    return motif;
  });
  const problems = [];

  for (const motif of motifs) {
    const graph = buildCuratedDrawingGraph(motif, gridSize);
    const signature = canonicalDrawingSignature(graph.edges);
    if (sharedSignatures.has(signature)) {
      throw new Error(`${gridSize}x${gridSize} ${motif.id}: 회전·반전된 중복 그림입니다.`);
    }

    const initialCommands = makeCoveringCommands(graph);
    const coveringResult = CommandEngine.simulate(
      graph.start,
      initialCommands,
      gridSize,
      []
    );
    const targetLines = coveringResult.lines;
    const minimumDrawingDistance = CommandEngine.getMinimumDrawingDistance(
      graph.start,
      targetLines
    );
    if (
      !Number.isFinite(minimumDrawingDistance) ||
      minimumDrawingDistance < graph.edges.length
    ) {
      throw new Error(`${gridSize}x${gridSize} ${motif.id}: 최소 붓 이동을 계산하지 못했습니다.`);
    }

    sharedSignatures.add(signature);
    problems.push({
      title: '',
      gridSize,
      motifId: motif.id,
      starPos: { ...graph.start },
      targetLines,
      ...(followCommands ? { initialCommands } : {}),
      graphProfile: {
        edgeCount: graph.edges.length,
        cycleCount: graph.cycleCount,
        decisionVertices: graph.decisionVertices,
        oddVertices: graph.oddVertices
      },
      minimumDrawingDistance,
      guide: ''
    });
  }

  if (problems.length !== 15) {
    throw new Error(`${gridSize}x${gridSize} 형상 그림 15개를 만들지 못했습니다.`);
  }
  return problems;
}

function makeSingleStrokeDrawingProblems(gridSize, sharedSignatures) {
  const motifIds = SINGLE_STROKE_MOTIF_SELECTIONS[gridSize] || [];
  const problems = [];

  for (const motifId of motifIds) {
    const motif = DRAWING_MOTIF_LIBRARY.get(motifId);
    if (!motif) continue;
    const graph = buildCuratedDrawingGraph(motif, gridSize);

    // 오일러 한붓그리기 조건: 홀수 차수 정점이 0개 또는 2개여야 함
    if (graph.oddVertices !== 0 && graph.oddVertices !== 2) continue;

    // 홀수 차수 정점이 2개인 경우 시작점이 홀수 차수 정점 중 하나여야 함
    const degreeMap = new Map();
    for (const edge of graph.edges) {
      const k1 = pointKey(edge.from);
      const k2 = pointKey(edge.to);
      degreeMap.set(k1, (degreeMap.get(k1) || 0) + 1);
      degreeMap.set(k2, (degreeMap.get(k2) || 0) + 1);
    }

    let validStartPos = { ...graph.start };
    if (graph.oddVertices === 2) {
      const oddKeys = [];
      for (const [key, degree] of degreeMap.entries()) {
        if (degree % 2 === 1) oddKeys.push(key);
      }
      const startKey = pointKey(graph.start);
      if (!oddKeys.includes(startKey) && oddKeys.length > 0) {
        const [ox, oy] = oddKeys[0].split(',').map(Number);
        validStartPos = { x: ox, y: oy };
      }
    }

    const initialCommands = makeCoveringCommands({ ...graph, start: validStartPos });
    const coveringResult = CommandEngine.simulate(
      validStartPos,
      initialCommands,
      gridSize,
      []
    );
    const targetLines = coveringResult.lines;
    const minimumDrawingDistance = CommandEngine.getMinimumDrawingDistance(
      validStartPos,
      targetLines
    );

    if (minimumDrawingDistance === graph.edges.length) {
      problems.push({
        title: '',
        gridSize,
        motifId: motif.id,
        starPos: validStartPos,
        targetLines,
        isSingleStrokePlayable: true,
        graphProfile: {
          edgeCount: graph.edges.length,
          cycleCount: graph.cycleCount,
          decisionVertices: graph.decisionVertices,
          oddVertices: graph.oddVertices
        },
        minimumDrawingDistance,
        guide: ''
      });
    }
  }

  return problems;
}

export const ADVANCED_PROBLEM_MODES = Object.freeze([
  'efficiency',
  'shortest',
  'routing',
  'debug',
  'debug_guide',
  'single_stroke',
  'chase'
]);

export function createAdvancedProblemBank(mode) {
  if (mode === 'efficiency') return GRID_SIZES.flatMap(makeEfficiencyProblems);
  if (mode === 'shortest') return GRID_SIZES.flatMap(makeShortestProblems);
  if (mode === 'routing') return GRID_SIZES.flatMap(makeRoutingProblems);
  if (mode === 'debug') {
    const signatures = new Set();
    return DRAWING_GRID_SIZES.flatMap(gridSize => (
      makeDrawingProblems(gridSize, false, signatures)
    ));
  }
  if (mode === 'debug_guide') {
    const signatures = new Set();
    return DRAWING_GRID_SIZES.flatMap(gridSize => (
      makeDrawingProblems(gridSize, true, signatures)
    ));
  }
  if (mode === 'single_stroke') {
    const signatures = new Set();
    return DRAWING_GRID_SIZES.flatMap(gridSize => (
      makeSingleStrokeDrawingProblems(gridSize, signatures)
    ));
  }
  if (mode === 'chase') return GRID_SIZES.flatMap(makeChaseProblems);
  return [];
}

export function createAdvancedProblemBanks() {
  return Object.fromEntries(
    ADVANCED_PROBLEM_MODES.map(mode => [mode, createAdvancedProblemBank(mode)])
  );
}
