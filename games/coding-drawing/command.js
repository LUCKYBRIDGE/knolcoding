/**
 * 별빛 탐험대 - 8방향 명령어 해석 및 검증 엔진
 */

export const DIRECTIONS = {
  UP:         { id: 'UP',         symbol: '↑', label: '위',         dx:  0, dy: -1 },
  UP_RIGHT:   { id: 'UP_RIGHT',   symbol: '↗', label: '오른쪽 위',   dx:  1, dy: -1 },
  RIGHT:      { id: 'RIGHT',      symbol: '→', label: '오른쪽',      dx:  1, dy:  0 },
  DOWN_RIGHT: { id: 'DOWN_RIGHT', symbol: '↘', label: '오른쪽 아래', dx:  1, dy:  1 },
  DOWN:       { id: 'DOWN',       symbol: '↓', label: '아래',       dx:  0, dy:  1 },
  DOWN_LEFT:  { id: 'DOWN_LEFT',  symbol: '↙', label: '왼쪽 아래',   dx: -1, dy:  1 },
  LEFT:       { id: 'LEFT',       symbol: '←', label: '왼쪽',       dx: -1, dy:  0 },
  UP_LEFT:    { id: 'UP_LEFT',    symbol: '↖', label: '왼쪽 위',     dx: -1, dy: -1 }
};

export const PEN_COMMANDS = {
  PEN_DOWN: { id: 'PEN_DOWN', symbol: '🖌️', label: '붓 누르기', action: 'PEN_DOWN' },
  PEN_UP:   { id: 'PEN_UP',   symbol: '✋', label: '붓 떼기',   action: 'PEN_UP' }
};

export const MAX_COMMAND_DISTANCE = 128;
const MINIMUM_DRAWING_DISTANCE_CACHE = new Map();

function getSafeCommandDistance(distance) {
  if (!Number.isFinite(distance)) return 1;
  return Math.min(MAX_COMMAND_DISTANCE, Math.max(1, Math.trunc(distance)));
}

export const CommandEngine = {
  /**
   * 시작점과 명령어 목록으로부터 전체 좌표 이동 궤적 시뮬레이션
   * @param {Object} startPos {x, y}
   * @param {Array} commands [{dir: 'UP', distance: 2}, ...] 또는 [{dir: 'PEN_DOWN'}, {dir: 'PEN_UP'}]
   * @param {number} gridSize
   * @param {Array} obstacles [{x, y}]
   * @param {boolean} initialPenDown 기본 붓 상태 (기본값 true: 붓 누름)
   */
  simulate(startPos, commands, gridSize = 7, obstacles = [], initialPenDown = true) {
    let current = { ...startPos };
    let isPenDown = initialPenDown !== false;
    const pathSteps = [{ ...current, penDown: isPenDown }];
    const lines = [];
    let hitWall = false;
    let hitObstacle = false;

    for (let cmdIdx = 0; cmdIdx < commands.length; cmdIdx++) {
      const cmd = commands[cmdIdx];
      
      const cmdType = cmd.dir || cmd.type || cmd.action;
      if (cmdType === 'PEN_DOWN') {
        isPenDown = true;
        pathSteps.push({ ...current, penDown: isPenDown, cmdIdx, isPenToggle: true });
        continue;
      }
      if (cmdType === 'PEN_UP') {
        isPenDown = false;
        pathSteps.push({ ...current, penDown: isPenDown, cmdIdx, isPenToggle: true });
        continue;
      }

      const dirInfo = DIRECTIONS[cmd.dir];
      if (!dirInfo) continue;

      const dist = getSafeCommandDistance(cmd.distance);
      for (let s = 0; s < dist; s++) {
        const nextX = current.x + dirInfo.dx;
        const nextY = current.y + dirInfo.dy;

        // 벽 충돌 검사
        if (nextX < 0 || nextX >= gridSize || nextY < 0 || nextY >= gridSize) {
          hitWall = true;
          break;
        }

        // 장애물 충돌 검사
        const isObs = obstacles.some(o => o.x === nextX && o.y === nextY);
        if (isObs) {
          hitObstacle = true;
          if (isPenDown) {
            lines.push({ fromX: current.x, fromY: current.y, toX: nextX, toY: nextY, cmdIdx, subStep: s + 1, totalSubSteps: dist });
          }
          current = { x: nextX, y: nextY };
          pathSteps.push({ ...current, penDown: isPenDown });
          break;
        }

        if (isPenDown) {
          lines.push({ fromX: current.x, fromY: current.y, toX: nextX, toY: nextY, cmdIdx, subStep: s + 1, totalSubSteps: dist });
        }
        current = { x: nextX, y: nextY };
        pathSteps.push({ ...current, penDown: isPenDown });
      }

      if (hitWall || hitObstacle) break;
    }

    return {
      finalPos: current,
      pathSteps,
      lines,
      hitWall,
      hitObstacle
    };
  },

  /**
   * 최단 이동 칸 수를 계산합니다.
   * 장애물이 없으면 8방향 체비쇼프 거리로 충분하지만, 장애물이 있으면
   * 실제 BFS 우회 경로의 칸 수를 사용해야 합니다.
   * @param {Object} start
   * @param {Object} goal
   * @param {number} gridSize
   * @param {Array<Object>} obstacles
   * @returns {number}
   */
  getShortestDistance(start, goal, gridSize = 7, obstacles = []) {
    const isInside = position => (
      position &&
      Number.isInteger(position.x) &&
      Number.isInteger(position.y) &&
      Number.isInteger(gridSize) &&
      gridSize > 0 &&
      position.x >= 0 &&
      position.x < gridSize &&
      position.y >= 0 &&
      position.y < gridSize
    );
    if (!isInside(start) || !isInside(goal)) {
      return Number.POSITIVE_INFINITY;
    }

    const safeObstacles = Array.isArray(obstacles) ? obstacles : [];
    const obstacleKeys = new Set(
      safeObstacles
        .filter(isInside)
        .map(({ x, y }) => `${x},${y}`)
    );
    const startKey = `${start.x},${start.y}`;
    const goalKey = `${goal.x},${goal.y}`;
    if (obstacleKeys.has(startKey) || obstacleKeys.has(goalKey)) {
      return Number.POSITIVE_INFINITY;
    }
    if (startKey === goalKey) return 0;

    const dx = Math.abs(start.x - goal.x);
    const dy = Math.abs(start.y - goal.y);
    if (safeObstacles.length === 0) {
      return Math.max(dx, dy);
    }

    const path = this.findShortestPath(start, goal, gridSize, safeObstacles);
    return path.length > 0
      ? this.expandToStepList(path).length
      : Number.POSITIVE_INFINITY;
  },

  /**
   * 목표점까지 도착하는 데 필요한 최소 명령 묶음 수를 계산합니다.
   * 한 명령은 한 방향으로 장애물이나 경계를 통과하지 않고 여러 칸 이동할 수 있습니다.
   * 따라서 이 값은 실제 이동 칸 수를 최소화하는 최단 거리와 독립적입니다.
   */
  analyzeMinimumCommands(start, goal, gridSize = 7, obstacles = []) {
    const isInside = position => (
      position &&
      Number.isInteger(position.x) &&
      Number.isInteger(position.y) &&
      Number.isInteger(gridSize) &&
      gridSize > 0 &&
      position.x >= 0 &&
      position.x < gridSize &&
      position.y >= 0 &&
      position.y < gridSize
    );
    if (!isInside(start) || !isInside(goal) || !Array.isArray(obstacles)) {
      return { commandCount: Number.POSITIVE_INFINITY, commands: [] };
    }

    const obstacleKeys = new Set(
      obstacles
        .filter(isInside)
        .map(({ x, y }) => `${x},${y}`)
    );
    const startKey = `${start.x},${start.y}`;
    const goalKey = `${goal.x},${goal.y}`;
    if (obstacleKeys.has(startKey) || obstacleKeys.has(goalKey)) {
      return { commandCount: Number.POSITIVE_INFINITY, commands: [] };
    }
    if (startKey === goalKey) {
      return { commandCount: 0, commands: [] };
    }

    const queue = [{ ...start }];
    const commandCounts = new Map([[startKey, 0]]);
    const predecessors = new Map();

    for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
      const current = queue[queueIndex];
      const currentKey = `${current.x},${current.y}`;
      const nextCommandCount = commandCounts.get(currentKey) + 1;

      for (const direction of Object.values(DIRECTIONS)) {
        for (let distance = 1; distance <= MAX_COMMAND_DISTANCE; distance++) {
          const next = {
            x: current.x + direction.dx * distance,
            y: current.y + direction.dy * distance
          };
          if (!isInside(next)) break;

          const nextKey = `${next.x},${next.y}`;
          if (obstacleKeys.has(nextKey)) break;
          if (commandCounts.has(nextKey)) continue;

          commandCounts.set(nextKey, nextCommandCount);
          predecessors.set(nextKey, {
            previousKey: currentKey,
            dir: direction.id,
            distance
          });
          queue.push(next);
        }
      }
    }

    if (!commandCounts.has(goalKey)) {
      return { commandCount: Number.POSITIVE_INFINITY, commands: [] };
    }

    const commands = [];
    let currentKey = goalKey;
    while (currentKey !== startKey) {
      const predecessor = predecessors.get(currentKey);
      if (!predecessor) {
        return { commandCount: Number.POSITIVE_INFINITY, commands: [] };
      }
      commands.push({ dir: predecessor.dir, distance: predecessor.distance });
      currentKey = predecessor.previousKey;
    }
    commands.reverse();

    return {
      commandCount: commandCounts.get(goalKey),
      commands
    };
  },

  getMinimumCommandCount(start, goal, gridSize = 7, obstacles = []) {
    return this.analyzeMinimumCommands(start, goal, gridSize, obstacles).commandCount;
  },

  /**
   * 같은 문제를 '최단 이동'과 '최소 명령' 두 기준으로 푼 예시를 나란히 계산합니다.
   * 두 기준은 판정에서는 서로 독립이며, 이 값은 결과창·정답지에서 비교를 보여 주는 데만 씁니다.
   * commandsOnShortestRoute는 최단 경로들 가운데 명령 묶음이 가장 적은 경우의 수이고,
   * 최단 경로가 너무 많아 다 셀 수 없으면 null입니다.
   */
  compareRouteRules(start, goal, gridSize = 7, obstacles = []) {
    const minimum = this.analyzeMinimumCommands(start, goal, gridSize, obstacles);
    if (!Number.isFinite(minimum.commandCount)) return null;
    const shortest = this.enumerateShortestPaths(start, goal, gridSize, obstacles, 5000);
    let shortestRouteCommands = null;
    if (shortest.isComplete && shortest.paths.length > 0) {
      for (const path of shortest.paths) {
        const commands = this.compressStepList(path);
        if (!shortestRouteCommands || commands.length < shortestRouteCommands.length) {
          shortestRouteCommands = commands;
        }
      }
    }
    const fallbackRoute = shortestRouteCommands || this.findShortestPath(start, goal, gridSize, obstacles);
    return {
      shortestDistance: this.expandToStepList(fallbackRoute).length,
      shortestRouteCommands: fallbackRoute,
      commandsOnShortestRoute: shortestRouteCommands ? shortestRouteCommands.length : null,
      minimumCommandCount: minimum.commandCount,
      minimumCommandRoute: minimum.commands,
      minimumCommandRouteDistance: this.expandToStepList(minimum.commands).length
    };
  },

  /**
   * 그림 문제의 예시 명령(정답 한 가지)을 만듭니다.
   * 붓을 뗀 채 시작해 [붓 누르기]로 시작하고, 아직 긋지 않은 선이 이어지면 그 선을 긋고,
   * 막히면 붓을 떼고 가장 가까운 남은 선의 끝점으로 옮겨 다시 긋습니다.
   * 목표 선을 모두 긋고 목표에 없는 선은 긋지 않으므로 그림은 항상 정답과 같지만,
   * 최소 명령·최소 붓 이동이라는 보장은 없습니다(정답지에는 '예시'로 표시).
   */
  buildDrawingExampleCommands(startPos, targetLines = []) {
    const unitLines = this.expandLinesToUnitSteps(targetLines) || [];
    if (!startPos || unitLines.length === 0) return [];
    const key = (x, y) => `${x},${y}`;
    const edgeKey = (a, b) => [a, b].sort().join('|');
    const remaining = new Map();
    const adjacency = new Map();
    for (const line of unitLines) {
      const from = key(line.fromX, line.fromY);
      const to = key(line.toX, line.toY);
      remaining.set(edgeKey(from, to), true);
      if (!adjacency.has(from)) adjacency.set(from, new Set());
      if (!adjacency.has(to)) adjacency.set(to, new Set());
      adjacency.get(from).add(to);
      adjacency.get(to).add(from);
    }
    const parse = value => value.split(',').map(Number);
    const directionBetween = (fromKey, toKey) => {
      const [fx, fy] = parse(fromKey);
      const [tx, ty] = parse(toKey);
      const dx = Math.sign(tx - fx);
      const dy = Math.sign(ty - fy);
      return Object.values(DIRECTIONS).find(direction => direction.dx === dx && direction.dy === dy).id;
    };
    const unusedDegree = vertex => [...(adjacency.get(vertex) || [])]
      .filter(next => remaining.has(edgeKey(vertex, next))).length;

    const commands = [];
    const pushMove = dir => {
      const last = commands[commands.length - 1];
      if (last && last.dir === dir) last.distance += 1;
      else commands.push({ dir, distance: 1 });
    };

    let current = key(startPos.x, startPos.y);
    let penDown = false;
    let lastDirection = null;
    while (remaining.size > 0) {
      const options = [...(adjacency.get(current) || [])]
        .filter(next => remaining.has(edgeKey(current, next)));
      if (options.length > 0) {
        if (!penDown) {
          commands.push({ dir: 'PEN_DOWN', distance: 1 });
          penDown = true;
        }
        // 같은 방향으로 이어 그으면 명령 묶음이 줄어든다. 다음으로 막다른 끝을 피한다.
        options.sort((a, b) => (
          Number(directionBetween(current, b) === lastDirection) - Number(directionBetween(current, a) === lastDirection) ||
          (unusedDegree(b) > 1) - (unusedDegree(a) > 1)
        ));
        const next = options[0];
        remaining.delete(edgeKey(current, next));
        lastDirection = directionBetween(current, next);
        pushMove(lastDirection);
        current = next;
        continue;
      }
      // 남은 선의 끝점 가운데 가장 가까운 곳(홀수 차수 우선)으로 붓을 떼고 이동한다.
      const [cx, cy] = parse(current);
      const candidates = [...adjacency.keys()].filter(vertex => unusedDegree(vertex) > 0);
      candidates.sort((a, b) => {
        const [ax, ay] = parse(a);
        const [bx, by] = parse(b);
        const distanceA = Math.max(Math.abs(ax - cx), Math.abs(ay - cy));
        const distanceB = Math.max(Math.abs(bx - cx), Math.abs(by - cy));
        return distanceA - distanceB || (unusedDegree(b) % 2) - (unusedDegree(a) % 2);
      });
      const target = candidates[0];
      if (penDown) {
        commands.push({ dir: 'PEN_UP', distance: 1 });
        penDown = false;
      }
      let [x, y] = [cx, cy];
      const [tx, ty] = parse(target);
      while (x !== tx || y !== ty) {
        const dx = Math.sign(tx - x);
        const dy = Math.sign(ty - y);
        pushMove(Object.values(DIRECTIONS).find(direction => direction.dx === dx && direction.dy === dy).id);
        x += dx;
        y += dy;
      }
      current = target;
      lastDirection = null;
    }
    return commands;
  },

  /**
   * 최단 이동 거리와 서로 다른 1칸 단위 최단 경로의 수를 함께 계산합니다.
   * 경로 수는 학습 문제의 복수 정답 여부를 검증하는 용도로 사용하며,
   * 지나치게 큰 수는 안전한 정수 범위에서 고정합니다.
   */
  analyzeShortestPaths(start, goal, gridSize = 7, obstacles = []) {
    const isInside = position => (
      position &&
      Number.isInteger(position.x) &&
      Number.isInteger(position.y) &&
      Number.isInteger(gridSize) &&
      gridSize > 0 &&
      position.x >= 0 &&
      position.x < gridSize &&
      position.y >= 0 &&
      position.y < gridSize
    );
    if (!isInside(start) || !isInside(goal) || !Array.isArray(obstacles)) {
      return { distance: Number.POSITIVE_INFINITY, pathCount: 0 };
    }

    const obstacleKeys = new Set(
      obstacles
        .filter(isInside)
        .map(({ x, y }) => `${x},${y}`)
    );
    const startKey = `${start.x},${start.y}`;
    const goalKey = `${goal.x},${goal.y}`;
    if (obstacleKeys.has(startKey) || obstacleKeys.has(goalKey)) {
      return { distance: Number.POSITIVE_INFINITY, pathCount: 0 };
    }
    if (startKey === goalKey) return { distance: 0, pathCount: 1 };

    const queue = [{ ...start }];
    const distances = new Map([[startKey, 0]]);
    const pathCounts = new Map([[startKey, 1]]);
    const countLimit = Number.MAX_SAFE_INTEGER;

    for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
      const current = queue[queueIndex];
      const currentKey = `${current.x},${current.y}`;
      const nextDistance = distances.get(currentKey) + 1;

      for (const direction of Object.values(DIRECTIONS)) {
        const next = {
          x: current.x + direction.dx,
          y: current.y + direction.dy
        };
        if (!isInside(next)) continue;

        const nextKey = `${next.x},${next.y}`;
        if (obstacleKeys.has(nextKey)) continue;

        if (!distances.has(nextKey)) {
          distances.set(nextKey, nextDistance);
          pathCounts.set(nextKey, pathCounts.get(currentKey));
          queue.push(next);
          continue;
        }
        if (distances.get(nextKey) !== nextDistance) continue;

        pathCounts.set(
          nextKey,
          Math.min(
            countLimit,
            pathCounts.get(nextKey) + pathCounts.get(currentKey)
          )
        );
      }
    }

    return {
      distance: distances.get(goalKey) ?? Number.POSITIVE_INFINITY,
      pathCount: pathCounts.get(goalKey) ?? 0
    };
  },

  /**
   * 실제 1칸 방향 순서를 기준으로 모든 최단 경로를 열거합니다.
   * 내장 문제의 정답 목록과 여러 풀이 찾기의 완료 판정에 사용합니다.
   */
  enumerateShortestPaths(start, goal, gridSize = 7, obstacles = [], maxPaths = 5000) {
    const analysis = this.analyzeShortestPaths(start, goal, gridSize, obstacles);
    if (!Number.isFinite(analysis.distance) || analysis.pathCount === 0) {
      return { ...analysis, paths: [], pathSignatures: [], isComplete: true };
    }
    if (analysis.distance === 0) {
      return {
        ...analysis,
        paths: [[]],
        pathSignatures: [''],
        isComplete: true
      };
    }

    const isInside = position => (
      position.x >= 0 &&
      position.x < gridSize &&
      position.y >= 0 &&
      position.y < gridSize
    );
    const obstacleKeys = new Set(
      obstacles
        .filter(obstacle => (
          obstacle &&
          Number.isInteger(obstacle.x) &&
          Number.isInteger(obstacle.y) &&
          isInside(obstacle)
        ))
        .map(({ x, y }) => `${x},${y}`)
    );
    const startKey = `${start.x},${start.y}`;
    const goalKey = `${goal.x},${goal.y}`;
    const queue = [{ ...start }];
    const distances = new Map([[startKey, 0]]);
    const predecessors = new Map();

    for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
      const current = queue[queueIndex];
      const currentKey = `${current.x},${current.y}`;
      const currentDistance = distances.get(currentKey);
      if (currentDistance >= analysis.distance) continue;

      for (const direction of Object.values(DIRECTIONS)) {
        const next = {
          x: current.x + direction.dx,
          y: current.y + direction.dy
        };
        if (!isInside(next)) continue;
        const nextKey = `${next.x},${next.y}`;
        if (obstacleKeys.has(nextKey)) continue;

        const nextDistance = currentDistance + 1;
        if (!distances.has(nextKey)) {
          distances.set(nextKey, nextDistance);
          predecessors.set(nextKey, [{ previousKey: currentKey, dir: direction.id }]);
          queue.push(next);
        } else if (distances.get(nextKey) === nextDistance) {
          predecessors.get(nextKey).push({ previousKey: currentKey, dir: direction.id });
        }
      }
    }

    const safeMaxPaths = Math.max(1, Math.trunc(maxPaths));
    const paths = [];
    const collect = (currentKey, reversedSteps) => {
      if (paths.length >= safeMaxPaths) return;
      if (currentKey === startKey) {
        paths.push([...reversedSteps].reverse());
        return;
      }
      for (const predecessor of predecessors.get(currentKey) || []) {
        collect(predecessor.previousKey, [...reversedSteps, predecessor.dir]);
        if (paths.length >= safeMaxPaths) return;
      }
    };
    collect(goalKey, []);

    const pathSignatures = paths.map(path => path.join('>'));
    return {
      ...analysis,
      paths,
      pathSignatures,
      isComplete: paths.length === analysis.pathCount
    };
  },

  /**
   * 두 좌표 사이의 8방향 최단 명령어 추천 생성
   * @param {Object} start
   * @param {Object} goal
   * @returns {Array} [{dir, distance}]
   */
  generateOptimalCommands(start, goal) {
    let x = start.x;
    let y = start.y;
    const cmds = [];

    while (x !== goal.x || y !== goal.y) {
      let dx = 0;
      let dy = 0;

      if (goal.x > x) dx = 1;
      else if (goal.x < x) dx = -1;

      if (goal.y > y) dy = 1;
      else if (goal.y < y) dy = -1;

      // dx, dy에 맞는 방향 찾기
      let foundDir = null;
      for (const key in DIRECTIONS) {
        if (DIRECTIONS[key].dx === dx && DIRECTIONS[key].dy === dy) {
          foundDir = key;
          break;
        }
      }

      if (foundDir) {
        // 직전 명령과 같은 방향이면 distance 증가
        const lastCmd = cmds[cmds.length - 1];
        if (lastCmd && lastCmd.dir === foundDir) {
          lastCmd.distance += 1;
        } else {
          cmds.push({ dir: foundDir, distance: 1 });
        }
      }

      x += dx;
      y += dy;
    }

    return cmds;
  },

  /**
   * 장애물을 피하는 8방향 최소 이동 경로를 명령어 목록으로 생성합니다.
   * 경로가 없으면 빈 배열을 반환합니다.
   */
  findShortestPath(start, goal, gridSize = 7, obstacles = []) {
    if (!start || !goal || !Number.isInteger(gridSize) || gridSize < 1) return [];
    const safeObstacles = Array.isArray(obstacles) ? obstacles : [];

    const isInside = ({ x, y }) => (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      x < gridSize &&
      y >= 0 &&
      y < gridSize
    );

    if (!isInside(start) || !isInside(goal)) return [];

    const obstacleKeys = new Set(
      safeObstacles
        .filter(isInside)
        .map(({ x, y }) => `${x},${y}`)
    );
    const startKey = `${start.x},${start.y}`;
    const goalKey = `${goal.x},${goal.y}`;

    if (obstacleKeys.has(startKey) || obstacleKeys.has(goalKey)) return [];
    if (startKey === goalKey) return [];

    const directionEntries = Object.entries(DIRECTIONS);
    const queue = [{ x: start.x, y: start.y, steps: [] }];
    const visited = new Set([startKey]);

    for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
      const current = queue[queueIndex];

      for (const [dirKey, dirInfo] of directionEntries) {
        const next = {
          x: current.x + dirInfo.dx,
          y: current.y + dirInfo.dy
        };
        if (!isInside(next)) continue;

        const nextKey = `${next.x},${next.y}`;
        if (visited.has(nextKey) || obstacleKeys.has(nextKey)) continue;

        const nextSteps = [...current.steps, dirKey];
        if (nextKey === goalKey) {
          return this.compressStepList(nextSteps);
        }

        visited.add(nextKey);
        queue.push({ ...next, steps: nextSteps });
      }
    }

    return [];
  },

  /**
   * 고정 목표 경로 문제의 좌표·장애물·도달 가능성을 검증합니다.
   */
  validateRouteScenario(start, goal, gridSize = 7, obstacles = []) {
    const isInside = position => (
      position &&
      Number.isInteger(position.x) &&
      Number.isInteger(position.y) &&
      Number.isInteger(gridSize) &&
      gridSize > 0 &&
      position.x >= 0 &&
      position.x < gridSize &&
      position.y >= 0 &&
      position.y < gridSize
    );
    if (!isInside(start)) return { isValid: false, reason: 'start_outside' };
    if (!isInside(goal)) return { isValid: false, reason: 'goal_outside' };
    if (start.x === goal.x && start.y === goal.y) {
      return { isValid: false, reason: 'same_start_and_goal' };
    }
    if (!Array.isArray(obstacles)) {
      return { isValid: false, reason: 'invalid_obstacles' };
    }

    const obstacleKeys = new Set();
    for (const obstacle of obstacles) {
      if (!isInside(obstacle)) return { isValid: false, reason: 'obstacle_outside' };
      const key = `${obstacle.x},${obstacle.y}`;
      if (obstacleKeys.has(key)) return { isValid: false, reason: 'duplicate_obstacle' };
      obstacleKeys.add(key);
    }

    if (obstacleKeys.has(`${start.x},${start.y}`)) {
      return { isValid: false, reason: 'obstacle_on_start' };
    }
    if (obstacleKeys.has(`${goal.x},${goal.y}`)) {
      return { isValid: false, reason: 'obstacle_on_goal' };
    }

    const shortestDistance = this.getShortestDistance(
      start,
      goal,
      gridSize,
      obstacles
    );
    if (!Number.isFinite(shortestDistance)) {
      return { isValid: false, reason: 'goal_unreachable' };
    }

    return {
      isValid: true,
      reason: '',
      shortestDistance,
      shortestCommands: this.findShortestPath(start, goal, gridSize, obstacles)
    };
  },

  /**
   * 1칸 단위 방향 목록을 연속 거리 명령어로 압축합니다.
   */
  compressStepList(steps) {
    const commands = [];
    steps.forEach(dirKey => {
      if (typeof dirKey === 'object' && dirKey !== null) {
        commands.push({ ...dirKey });
        return;
      }
      if (dirKey === 'PEN_DOWN' || dirKey === 'PEN_UP') {
        commands.push({ dir: dirKey, distance: 1 });
        return;
      }
      const last = commands[commands.length - 1];
      if (last && last.dir === dirKey && last.dir !== 'PEN_DOWN' && last.dir !== 'PEN_UP') {
        last.distance += 1;
      } else {
        commands.push({ dir: dirKey, distance: 1 });
      }
    });
    return commands;
  },

  /**
   * 긴 직선 선분을 채점 가능한 1칸 단위 8방향 선분으로 펼칩니다.
   * 8방향으로 표현할 수 없는 선분이 하나라도 있으면 null을 반환합니다.
   */
  expandLinesToUnitSteps(lines = []) {
    const unitLines = [];

    for (const line of lines) {
      if (!line) return null;

      const dx = line.toX - line.fromX;
      const dy = line.toY - line.fromY;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      if (distance === 0) continue;

      const isEightDirectionLine = (
        dx === 0 ||
        dy === 0 ||
        Math.abs(dx) === Math.abs(dy)
      );
      if (!isEightDirectionLine) return null;

      const stepX = Math.sign(dx);
      const stepY = Math.sign(dy);
      let x = line.fromX;
      let y = line.fromY;

      for (let step = 0; step < distance; step++) {
        const nextX = x + stepX;
        const nextY = y + stepY;
        unitLines.push({ fromX: x, fromY: y, toX: nextX, toY: nextY });
        x = nextX;
        y = nextY;
      }
    }

    return unitLines;
  },

  /**
   * 두 그림 경로를 순서와 방향까지 포함해 1칸 단위로 비교합니다.
   */
  compareLinePaths(actualLines = [], targetLines = []) {
    const actual = this.expandLinesToUnitSteps(actualLines);
    const target = this.expandLinesToUnitSteps(targetLines);

    if (!actual || !target) {
      return { isValid: false, isExactMatch: false, matchedCount: 0, targetCount: 0 };
    }

    let matchedCount = 0;
    const comparisonLength = Math.min(actual.length, target.length);
    for (let index = 0; index < comparisonLength; index++) {
      const actualLine = actual[index];
      const targetLine = target[index];
      const isSame = (
        actualLine.fromX === targetLine.fromX &&
        actualLine.fromY === targetLine.fromY &&
        actualLine.toX === targetLine.toX &&
        actualLine.toY === targetLine.toY
      );
      if (isSame) matchedCount++;
    }

    return {
      isValid: true,
      isExactMatch: actual.length === target.length && matchedCount === target.length,
      matchedCount,
      targetCount: target.length
    };
  },

  /**
   * 완성된 그림을 선의 실행 순서와 진행 방향에 관계없이 비교합니다.
   * 같은 선을 여러 번 지나도 종이에 남는 선은 하나이므로 중복 횟수는 무시합니다.
   * 목표에 없는 선이 추가되거나 목표 선이 빠진 경우에만 다른 그림으로 판정합니다.
   */
  compareLineFigures(actualLines = [], targetLines = []) {
    const actual = this.expandLinesToUnitSteps(actualLines);
    const target = this.expandLinesToUnitSteps(targetLines);

    if (!actual || !target) {
      return {
        isValid: false,
        isExactMatch: false,
        matchedCount: 0,
        targetCount: 0,
        actualCount: 0,
        missingCount: 0,
        extraCount: 0,
        retracedCount: 0
      };
    }

    const segmentKey = line => {
      const from = `${line.fromX},${line.fromY}`;
      const to = `${line.toX},${line.toY}`;
      return from < to ? `${from}|${to}` : `${to}|${from}`;
    };

    const actualSegments = new Set(actual.map(segmentKey));
    const targetSegments = new Set(target.map(segmentKey));
    const matchedCount = [...actualSegments]
      .filter(key => targetSegments.has(key))
      .length;
    const missingCount = [...targetSegments]
      .filter(key => !actualSegments.has(key))
      .length;
    const extraCount = [...actualSegments]
      .filter(key => !targetSegments.has(key))
      .length;

    return {
      isValid: true,
      isExactMatch: missingCount === 0 && extraCount === 0,
      matchedCount,
      targetCount: targetSegments.size,
      actualCount: actualSegments.size,
      missingCount,
      extraCount,
      retracedCount: actual.length - actualSegments.size
    };
  },

  /**
   * 주어진 시작점에서 목표 그림의 모든 선을 적어도 한 번 그리는 최소 이동 칸 수를 계산합니다.
   * 목표 선을 무방향 그래프로 보고, 홀수 차수 꼭짓점들을 연결하는 최소 중복 이동을
   * 열린 우편배달부 경로(Open Chinese Postman Path)로 정확히 구합니다.
   */
  getMinimumDrawingDistance(startPos, targetLines = []) {
    const unitLines = this.expandLinesToUnitSteps(targetLines);
    if (!unitLines || unitLines.length === 0 || !startPos) {
      return Number.POSITIVE_INFINITY;
    }

    const pointKey = (x, y) => `${x},${y}`;
    const segmentKey = line => {
      const from = pointKey(line.fromX, line.fromY);
      const to = pointKey(line.toX, line.toY);
      return from < to ? `${from}|${to}` : `${to}|${from}`;
    };
    const uniqueEdges = new Map();
    for (const line of unitLines) {
      uniqueEdges.set(segmentKey(line), line);
    }
    const distanceCacheKey = `${startPos.x},${startPos.y}|${[...uniqueEdges.keys()].sort().join(';')}`;
    if (MINIMUM_DRAWING_DISTANCE_CACHE.has(distanceCacheKey)) {
      return MINIMUM_DRAWING_DISTANCE_CACHE.get(distanceCacheKey);
    }
    const rememberDistance = value => {
      MINIMUM_DRAWING_DISTANCE_CACHE.set(distanceCacheKey, value);
      return value;
    };

    const adjacency = new Map();
    const connect = (from, to) => {
      if (!adjacency.has(from)) adjacency.set(from, new Set());
      adjacency.get(from).add(to);
    };
    for (const line of uniqueEdges.values()) {
      const from = pointKey(line.fromX, line.fromY);
      const to = pointKey(line.toX, line.toY);
      connect(from, to);
      connect(to, from);
    }

    const startKey = pointKey(startPos.x, startPos.y);
    if (!adjacency.has(startKey)) return Number.POSITIVE_INFINITY;

    // 작은 그림은 붓을 떼고 목표선의 다른 꼭짓점으로 이동하는 경우까지
    // 상태 공간에서 완전탐색한다. 따라서 연결된 그림에서도 불필요한 되짚기보다
    // 공중 이동이 짧은 해를 정확히 찾고, 끊어진 그림도 같은 기준으로 계산된다.
    if (uniqueEdges.size <= 12) {
      const indexedEdges = [...uniqueEdges.values()];
      const edgeIndexes = new Map(indexedEdges.map((line, index) => [segmentKey(line), index]));
      const completeMask = (1 << indexedEdges.length) - 1;
      const coordinates = key => {
        const [x, y] = key.split(',').map(Number);
        return { x, y };
      };
      const airDistance = (fromKey, toKey) => {
        const from = coordinates(fromKey);
        const to = coordinates(toKey);
        return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
      };
      const queue = [];
      const pushQueue = entry => {
        queue.push(entry);
        let index = queue.length - 1;
        while (index > 0) {
          const parent = Math.floor((index - 1) / 2);
          if (queue[parent].distance <= queue[index].distance) break;
          [queue[parent], queue[index]] = [queue[index], queue[parent]];
          index = parent;
        }
      };
      const popQueue = () => {
        const first = queue[0];
        const last = queue.pop();
        if (queue.length > 0) {
          queue[0] = last;
          let index = 0;
          while (true) {
            const left = index * 2 + 1;
            const right = left + 1;
            let smallest = index;
            if (left < queue.length && queue[left].distance < queue[smallest].distance) smallest = left;
            if (right < queue.length && queue[right].distance < queue[smallest].distance) smallest = right;
            if (smallest === index) break;
            [queue[index], queue[smallest]] = [queue[smallest], queue[index]];
            index = smallest;
          }
        }
        return first;
      };
      pushQueue({ vertex: startKey, mask: 0, penDown: true, distance: 0 });
      const best = new Map([[`${startKey}|0|true`, 0]]);
      while (queue.length > 0) {
        const current = popQueue();
        const currentState = `${current.vertex}|${current.mask}|${current.penDown}`;
        if (best.get(currentState) !== current.distance) continue;
        if (current.mask === completeMask) return rememberDistance(current.distance);

        const toggleState = `${current.vertex}|${current.mask}|${!current.penDown}`;
        if ((best.get(toggleState) ?? Number.POSITIVE_INFINITY) > current.distance) {
          best.set(toggleState, current.distance);
          pushQueue({ ...current, penDown: !current.penDown });
        }

        if (current.penDown) {
          for (const next of adjacency.get(current.vertex) || []) {
            const from = coordinates(current.vertex);
            const to = coordinates(next);
            const edgeIndex = edgeIndexes.get(segmentKey({
              fromX: from.x,
              fromY: from.y,
              toX: to.x,
              toY: to.y
            }));
            const nextMask = current.mask | (1 << edgeIndex);
            const nextDistance = current.distance + 1;
            const nextState = `${next}|${nextMask}|true`;
            if ((best.get(nextState) ?? Number.POSITIVE_INFINITY) <= nextDistance) continue;
            best.set(nextState, nextDistance);
            pushQueue({ vertex: next, mask: nextMask, penDown: true, distance: nextDistance });
          }
        } else {
          for (const next of adjacency.keys()) {
            if (next === current.vertex) continue;
            const nextDistance = current.distance + airDistance(current.vertex, next);
            const nextState = `${next}|${current.mask}|false`;
            if ((best.get(nextState) ?? Number.POSITIVE_INFINITY) <= nextDistance) continue;
            best.set(nextState, nextDistance);
            pushQueue({ vertex: next, mask: current.mask, penDown: false, distance: nextDistance });
          }
        }
      }
      return rememberDistance(Number.POSITIVE_INFINITY);
    }

    const vertices = [...adjacency.keys()];
    const reachable = new Set([startKey]);
    const connectivityQueue = [startKey];
    for (let index = 0; index < connectivityQueue.length; index++) {
      for (const next of adjacency.get(connectivityQueue[index]) || []) {
        if (reachable.has(next)) continue;
        reachable.add(next);
        connectivityQueue.push(next);
      }
    }
    if (reachable.size !== vertices.length) {
      const components = [];
      const assigned = new Set();
      for (const vertex of vertices) {
        if (assigned.has(vertex)) continue;
        const componentVertices = [];
        const queue = [vertex];
        assigned.add(vertex);
        for (let index = 0; index < queue.length; index++) {
          const current = queue[index];
          componentVertices.push(current);
          for (const next of adjacency.get(current) || []) {
            if (assigned.has(next)) continue;
            assigned.add(next);
            queue.push(next);
          }
        }
        components.push(componentVertices);
      }
      // 여러 조각으로 끊어진 그림은 붓을 든 채 조각 사이를 이동할 수 있다.
      // 각 조각 안의 열린 우편배달부 최솟값과 조각 사이 8방향 공중 이동을
      // 부분집합 동적 계획법으로 결합한다.
      if (components.length > 8) return Number.POSITIVE_INFINITY;
      const coordinates = key => {
        const [x, y] = key.split(',').map(Number);
        return { x, y };
      };
      const airDistance = (fromKey, toKey) => {
        const from = coordinates(fromKey);
        const to = coordinates(toKey);
        return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
      };
      const routeTables = components.map(componentVertices => {
        const componentSet = new Set(componentVertices);
        const edgeCount = [...uniqueEdges.values()].filter(line => (
          componentSet.has(pointKey(line.fromX, line.fromY)) &&
          componentSet.has(pointKey(line.toX, line.toY))
        )).length;
        const oddVertices = componentVertices.filter(
          vertex => adjacency.get(vertex).size % 2 === 1
        );
        if (oddVertices.length > 12) return null;
        const routeCosts = new Map();
        const toggle = (set, vertex) => {
          if (set.has(vertex)) set.delete(vertex);
          else set.add(vertex);
        };
        const pairingCost = terminals => {
          if (terminals.length === 0) return 0;
          const memo = new Map();
          const solve = mask => {
            if (mask === 0) return 0;
            if (memo.has(mask)) return memo.get(mask);
            let first = 0;
            while ((mask & (1 << first)) === 0) first++;
            const withoutFirst = mask & ~(1 << first);
            let best = Number.POSITIVE_INFINITY;
            for (let partner = first + 1; partner < terminals.length; partner++) {
              if ((withoutFirst & (1 << partner)) === 0) continue;
              // 홀수 꼭짓점 사이는 붓을 떼고 8방향으로 곧장 이동한다.
              // 선을 되짚는 거리는 이 공중 이동 거리보다 짧을 수 없다.
              best = Math.min(
                best,
                airDistance(terminals[first], terminals[partner]) +
                  solve(withoutFirst & ~(1 << partner))
              );
            }
            memo.set(mask, best);
            return best;
          };
          return solve((1 << terminals.length) - 1);
        };
        for (const entry of componentVertices) {
          for (const exit of componentVertices) {
            const terminals = new Set(oddVertices);
            toggle(terminals, entry);
            toggle(terminals, exit);
            routeCosts.set(
              `${entry}>${exit}`,
              edgeCount + pairingCost([...terminals])
            );
          }
        }
        return { vertices: componentVertices, routeCosts };
      });
      if (routeTables.some(table => !table)) return Number.POSITIVE_INFINITY;

      let states = new Map();
      for (let componentIndex = 0; componentIndex < routeTables.length; componentIndex++) {
        const table = routeTables[componentIndex];
        for (const entry of table.vertices) {
          for (const exit of table.vertices) {
            const cost = airDistance(startKey, entry) + table.routeCosts.get(`${entry}>${exit}`);
            const key = `${1 << componentIndex}|${componentIndex}|${exit}`;
            states.set(key, Math.min(states.get(key) ?? Number.POSITIVE_INFINITY, cost));
          }
        }
      }
      const fullMask = (1 << routeTables.length) - 1;
      for (let visitedCount = 1; visitedCount < routeTables.length; visitedCount++) {
        const nextStates = new Map(states);
        for (const [stateKey, currentCost] of states) {
          const [maskText, lastComponentText, lastExit] = stateKey.split('|');
          const mask = Number(maskText);
          const lastComponent = Number(lastComponentText);
          if (mask.toString(2).replaceAll('0', '').length !== visitedCount) continue;
          for (let nextComponent = 0; nextComponent < routeTables.length; nextComponent++) {
            if ((mask & (1 << nextComponent)) !== 0 || nextComponent === lastComponent) continue;
            const table = routeTables[nextComponent];
            for (const entry of table.vertices) {
              for (const exit of table.vertices) {
                const nextMask = mask | (1 << nextComponent);
                const nextCost = currentCost + airDistance(lastExit, entry) + table.routeCosts.get(`${entry}>${exit}`);
                const nextKey = `${nextMask}|${nextComponent}|${exit}`;
                nextStates.set(nextKey, Math.min(nextStates.get(nextKey) ?? Number.POSITIVE_INFINITY, nextCost));
              }
            }
          }
        }
        states = nextStates;
      }
      let best = Number.POSITIVE_INFINITY;
      for (const [stateKey, cost] of states) {
        if (Number(stateKey.split('|')[0]) === fullMask) best = Math.min(best, cost);
      }
      return rememberDistance(best);
    }

    // 연결된 큰 그림: 시작점에서 출발해 모든 선을 한 번씩 긋고, 홀수 꼭짓점은
    // 붓을 떼고 8방향으로 이동해 짝짓는다(작은 그림의 완전탐색과 같은 기준).
    // 선을 되짚는 거리는 8방향 공중 이동 거리보다 짧을 수 없으므로 공중 이동만 고려한다.
    const airDistanceBetween = (fromKey, toKey) => {
      const [fromX, fromY] = fromKey.split(',').map(Number);
      const [toX, toY] = toKey.split(',').map(Number);
      return Math.max(Math.abs(fromX - toX), Math.abs(fromY - toY));
    };

    const oddVertices = vertices.filter(
      vertex => adjacency.get(vertex).size % 2 === 1
    );
    // 비정상적으로 복잡한 공유 그림이 지수 시간의 짝짓기 계산을
    // 유발하지 않도록 홀수 꼭짓점이 12개를 넘으면 효율 지표만 생략합니다.
    if (oddVertices.length > 12) return Number.POSITIVE_INFINITY;

    const toggleVertex = (set, vertex) => {
      if (set.has(vertex)) set.delete(vertex);
      else set.add(vertex);
    };
    const minimumPairingCost = terminals => {
      if (terminals.length === 0) return 0;
      const memo = new Map();
      const fullMask = (1n << BigInt(terminals.length)) - 1n;

      const solve = mask => {
        if (mask === 0n) return 0;
        if (memo.has(mask)) return memo.get(mask);

        let first = 0;
        while ((mask & (1n << BigInt(first))) === 0n) first++;
        const withoutFirst = mask & ~(1n << BigInt(first));
        let best = Number.POSITIVE_INFINITY;

        for (let partner = first + 1; partner < terminals.length; partner++) {
          const partnerBit = 1n << BigInt(partner);
          if ((withoutFirst & partnerBit) === 0n) continue;
          const distance = airDistanceBetween(terminals[first], terminals[partner]);
          const remaining = withoutFirst & ~partnerBit;
          best = Math.min(best, distance + solve(remaining));
        }

        memo.set(mask, best);
        return best;
      };

      return solve(fullMask);
    };

    let minimumRepeatedDistance = Number.POSITIVE_INFINITY;
    for (const endKey of vertices) {
      const terminals = new Set(oddVertices);
      toggleVertex(terminals, startKey);
      toggleVertex(terminals, endKey);
      minimumRepeatedDistance = Math.min(
        minimumRepeatedDistance,
        minimumPairingCost([...terminals])
      );
    }

    return rememberDistance(uniqueEdges.size + minimumRepeatedDistance);
  },

  /**
   * 그림 완성 여부와 최소 붓 이동 달성 여부를 함께 계산합니다.
   */
  assessDrawingAttempt(startPos, actualLines = [], targetLines = [], executedCommands = null) {
    const comparison = this.compareLineFigures(actualLines, targetLines);
    const actualUnitLines = this.expandLinesToUnitSteps(actualLines);
    const commandMovementDistance = Array.isArray(executedCommands)
      ? this.expandToStepList(executedCommands)
          .reduce((total, step) => total + (DIRECTIONS[step] ? 1 : 0), 0)
      : null;
    // 명령 조립 활동에서는 붓을 뗀 채 이동한 칸도 실제 움직임이다. 명령이
    // 없는 직접 그리기 활동은 기존처럼 기록된 붓 동작에서 거리를 계산한다.
    const actualDistance = Number.isFinite(commandMovementDistance)
      ? commandMovementDistance
      : (actualUnitLines?.length ?? 0);
    const minimumDistance = this.getMinimumDrawingDistance(startPos, targetLines);
    const isMinimum = (
      comparison.isExactMatch &&
      Number.isFinite(minimumDistance) &&
      actualDistance === minimumDistance
    );

    return {
      ...comparison,
      actualDistance,
      minimumDistance,
      isMinimum,
      extraDistance: (
        comparison.isExactMatch && Number.isFinite(minimumDistance)
          ? Math.max(0, actualDistance - minimumDistance)
          : 0
      )
    };
  },

  /**
   * 한붓그리기 조건(붓 떼기 없음 + 그림 100% 완성)을 평가합니다.
   */
  assessSingleStrokeDrawing(startPos, actualLines = [], targetLines = [], executedCommands = []) {
    const comparison = this.compareLineFigures(actualLines, targetLines);
    const hasPenUpCommand = executedCommands.some(cmd => cmd.type === 'PEN_UP' || cmd.dir === 'PEN_UP');
    const isSingleStroke = comparison.isExactMatch && !hasPenUpCommand;

    let failureReason = null;
    if (!comparison.isExactMatch) {
      failureReason = '목표 그림과 똑같이 완성해야 합니다!';
    } else if (hasPenUpCommand) {
      failureReason = '한붓그리기는 붓을 떼지 않고(붓 떼기 없이) 그려야 합니다!';
    }

    return {
      ...comparison,
      hasPenUpCommand,
      isSingleStroke,
      isSuccess: isSingleStroke,
      reason: failureReason || '🎨 한붓그리기로 완벽 성공!'
    };
  },

  /**
   * 명령어 배열 [{dir: 'LEFT', distance: 2}]을 1칸 단위 턴별 이동 배열 ['LEFT', 'LEFT']로 펼치기
   * @param {Array} commands
   * @returns {Array<string>}
   */
  expandToStepList(commands) {
    const steps = [];
    commands.forEach(cmd => {
      const dir = cmd.dir || cmd.type || cmd.action;
      if (dir === 'PEN_DOWN' || dir === 'PEN_UP') {
        steps.push(dir);
        return;
      }
      const dist = getSafeCommandDistance(cmd.distance);
      for (let i = 0; i < dist; i++) {
        steps.push(dir);
      }
    });
    return steps;
  },

  /**
   * 공개된 도둑 이동 계획을 경찰과 분리해 먼저 검증합니다.
   * 도둑이 벽이나 장애물에 닿는 문제는 정상 추격 문제로 사용하지 않습니다.
   */
  traceChaseThiefRoute(thiefStartPos, thiefCommands, gridSize = 7, obstacles = []) {
    const isInside = position => (
      position &&
      Number.isInteger(position.x) &&
      Number.isInteger(position.y) &&
      position.x >= 0 &&
      position.x < gridSize &&
      position.y >= 0 &&
      position.y < gridSize
    );
    const obstacleKeys = new Set(
      obstacles.map(obstacle => `${obstacle.x},${obstacle.y}`)
    );
    const positions = thiefStartPos ? [{ ...thiefStartPos }] : [];

    if (!isInside(thiefStartPos)) {
      return { isValid: false, reason: 'thief_start_outside', positions, invalidTurn: 0 };
    }
    if (obstacleKeys.has(`${thiefStartPos.x},${thiefStartPos.y}`)) {
      return { isValid: false, reason: 'thief_start_blocked', positions, invalidTurn: 0 };
    }

    let thiefPos = { ...thiefStartPos };
    const thiefSteps = this.expandToStepList(thiefCommands || []);
    for (let index = 0; index < thiefSteps.length; index++) {
      const direction = DIRECTIONS[thiefSteps[index]];
      if (!direction) {
        return {
          isValid: false,
          reason: 'invalid_thief_direction',
          positions,
          invalidTurn: index + 1
        };
      }

      const next = {
        x: thiefPos.x + direction.dx,
        y: thiefPos.y + direction.dy
      };
      if (!isInside(next)) {
        return {
          isValid: false,
          reason: 'thief_hits_wall',
          positions,
          invalidTurn: index + 1
        };
      }
      if (obstacleKeys.has(`${next.x},${next.y}`)) {
        return {
          isValid: false,
          reason: 'thief_hits_obstacle',
          positions,
          invalidTurn: index + 1
        };
      }

      thiefPos = next;
      positions.push({ ...thiefPos });
    }

    return { isValid: true, reason: '', positions, invalidTurn: 0 };
  },

  /**
   * 모드 5: 턴제 도둑잡기 시뮬레이션 엔진
   * 턴 진행 규칙: 1턴 = 1칸 이동.
   * 매 턴마다 (1) 도둑 1칸 이동 -> 체포 검사 -> (2) 경찰 1칸 이동 -> 체포 검사
   */
  simulateChase(copStartPos, copCommands, thiefStartPos, thiefCommands, gridSize = 7, obstacles = [], handcuffPos = null) {
    const thiefSteps = this.expandToStepList(thiefCommands);
    const copSteps = this.expandToStepList(copCommands);
    const thiefRoute = this.traceChaseThiefRoute(
      thiefStartPos,
      thiefCommands,
      gridSize,
      obstacles
    );

    if (!thiefRoute.isValid) {
      return {
        caught: false,
        caughtTurn: 0,
        caughtPhase: '',
        hitObstacle: false,
        hitWall: false,
        handcuffsCollected: !handcuffPos,
        handcuffsCollectedTurn: 0,
        missedCaptureWithoutHandcuffs: false,
        invalidThiefRoute: true,
        thiefRouteError: thiefRoute.reason,
        invalidThiefTurn: thiefRoute.invalidTurn,
        finalCopPos: { ...copStartPos },
        finalThiefPos: thiefRoute.positions.at(-1) || { ...thiefStartPos },
        turnLog: [],
        totalThiefTurns: thiefSteps.length,
        totalCopTurns: copSteps.length
      };
    }

    let copPos = { ...copStartPos };
    let thiefPos = { ...thiefStartPos };

    const turnLog = [];
    let caught = false;
    let caughtTurn = 0;
    let caughtPhase = '';
    let hitObstacle = false;
    let hitWall = false;
    let handcuffsCollected = !handcuffPos;
    let handcuffsCollectedTurn = 0;
    let missedCaptureWithoutHandcuffs = false;

    // 도둑의 공개된 이동 계획이 끝나면 탈출한 것으로 처리한다.
    // 경찰이 더 긴 명령을 넣어 도주 완료 뒤 정지한 도둑을 잡는 편법을 허용하지 않는다.
    const maxTurns = thiefSteps.length;

    for (let t = 0; t < maxTurns; t++) {
      const turnNum = t + 1;

      // [Phase 1] 도둑이 먼저 1칸 이동 (장애물 우회 / 진입 불가)
      if (t < thiefSteps.length) {
        const dirInfo = DIRECTIONS[thiefSteps[t]];
        if (dirInfo) {
          const nx = thiefPos.x + dirInfo.dx;
          const ny = thiefPos.y + dirInfo.dy;
          const isObs = obstacles.some(o => o.x === nx && o.y === ny);
          if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize && !isObs) {
            thiefPos = { x: nx, y: ny };
          }
        }
      }

      // 도둑 이동 직후 체포 판정 (도둑이 경찰 좌표로 자진 진입)
      if (thiefPos.x === copPos.x && thiefPos.y === copPos.y && handcuffsCollected) {
        caught = true;
        caughtTurn = turnNum;
        caughtPhase = 'thief_turn';
        turnLog.push({ turn: turnNum, thiefPos: { ...thiefPos }, copPos: { ...copPos }, caught: true });
        break;
      } else if (thiefPos.x === copPos.x && thiefPos.y === copPos.y) {
        missedCaptureWithoutHandcuffs = true;
      }

      // [Phase 2] 경찰이 그 다음 1칸 이동
      if (t < copSteps.length) {
        const dirInfo = DIRECTIONS[copSteps[t]];
        if (dirInfo) {
          const nx = copPos.x + dirInfo.dx;
          const ny = copPos.y + dirInfo.dy;

          if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) {
            hitWall = true;
            turnLog.push({ turn: turnNum, thiefPos: { ...thiefPos }, copPos: { ...copPos }, hitWall: true });
            break;
          }

          const isObs = obstacles.some(o => o.x === nx && o.y === ny);
          if (isObs) {
            hitObstacle = true;
            turnLog.push({ turn: turnNum, thiefPos: { ...thiefPos }, copPos: { ...copPos }, hitObstacle: true });
            break;
          }

          copPos = { x: nx, y: ny };
          if (
            !handcuffsCollected &&
            handcuffPos &&
            copPos.x === handcuffPos.x &&
            copPos.y === handcuffPos.y
          ) {
            handcuffsCollected = true;
            handcuffsCollectedTurn = turnNum;
          }
        }
      }

      // 경찰 이동 직후 체포 판정 (경찰이 도둑 좌표로 진입)
      if (copPos.x === thiefPos.x && copPos.y === thiefPos.y && handcuffsCollected) {
        caught = true;
        caughtTurn = turnNum;
        caughtPhase = 'cop_turn';
        turnLog.push({ turn: turnNum, thiefPos: { ...thiefPos }, copPos: { ...copPos }, caught: true });
        break;
      } else if (copPos.x === thiefPos.x && copPos.y === thiefPos.y) {
        missedCaptureWithoutHandcuffs = true;
      }

      turnLog.push({
        turn: turnNum,
        thiefPos: { ...thiefPos },
        copPos: { ...copPos },
        caught: false,
        handcuffsCollected,
        missedCaptureWithoutHandcuffs
      });
    }

    return {
      caught,
      caughtTurn,
      caughtPhase,
      hitObstacle,
      hitWall,
      handcuffsCollected,
      handcuffsCollectedTurn,
      missedCaptureWithoutHandcuffs,
      finalCopPos: copPos,
      finalThiefPos: thiefPos,
      turnLog,
      totalThiefTurns: thiefSteps.length,
      totalCopTurns: copSteps.length
    };
  },

  /**
   * 공개된 도둑 경로와 장애물을 기준으로 체포 가능한 한 가지 경찰 경로를 찾습니다.
   * 차례별 너비 우선 탐색이므로 처음 찾은 계획의 caughtTurn은 최소 체포 차례입니다.
   * 각 명령은 한 차례에 한 칸이며, 도둑의 마지막 차례 안에 체포해야 합니다.
   */
  findChaseCapturePlan(copStartPos, thiefStartPos, thiefCommands, gridSize = 7, obstacles = [], handcuffPos = null) {
    const analysis = this.analyzeChaseCapturePlans(
      copStartPos,
      thiefStartPos,
      thiefCommands,
      gridSize,
      obstacles,
      handcuffPos
    );
    if (!analysis) return null;
    return {
      commands: analysis.commands,
      caughtTurn: analysis.earliestTurn,
      caughtPhase: analysis.caughtPhase
    };
  },

  /**
   * 가장 이른 체포 차례와 그 차례에 가능한 서로 다른 경찰 명령열의 수를 계산합니다.
   * 같은 위치에 도착한 경로도 명령열이 다르면 별개의 풀이로 셉니다.
   */
  analyzeChaseCapturePlans(copStartPos, thiefStartPos, thiefCommands, gridSize = 7, obstacles = [], handcuffPos = null) {
    const thiefRoute = this.traceChaseThiefRoute(
      thiefStartPos,
      thiefCommands,
      gridSize,
      obstacles
    );
    if (!thiefRoute.isValid || thiefRoute.positions.length < 2) return null;

    const obstacleKeys = new Set(
      (Array.isArray(obstacles) ? obstacles : [])
        .map(obstacle => `${obstacle.x},${obstacle.y}`)
    );
    const isInside = position => (
      position &&
      Number.isInteger(position.x) &&
      Number.isInteger(position.y) &&
      position.x >= 0 &&
      position.x < gridSize &&
      position.y >= 0 &&
      position.y < gridSize
    );
    if (
      !isInside(copStartPos) ||
      obstacleKeys.has(`${copStartPos.x},${copStartPos.y}`) ||
      (handcuffPos && (
        !isInside(handcuffPos) ||
        obstacleKeys.has(`${handcuffPos.x},${handcuffPos.y}`) ||
        (handcuffPos.x === copStartPos.x && handcuffPos.y === copStartPos.y)
      ))
    ) {
      return null;
    }

    const countLimit = Number.MAX_SAFE_INTEGER;
    const startsWithHandcuffs = !handcuffPos;
    let states = new Map([[
      `${copStartPos.x},${copStartPos.y}|${startsWithHandcuffs ? 1 : 0}`,
      {
        copPos: { ...copStartPos },
        hasHandcuffs: startsWithHandcuffs,
        pathCount: 1,
        sampleSteps: []
      }
    ]]);

    for (let turnIndex = 0; turnIndex < thiefRoute.positions.length - 1; turnIndex++) {
      const thiefPos = thiefRoute.positions[turnIndex + 1];
      let captureCount = 0;
      let capturePhase = '';
      let sampleSteps = null;
      const caughtBeforeCopMove = new Set();

      for (const [stateKey, state] of states) {
        if (
          !state.hasHandcuffs ||
          state.copPos.x !== thiefPos.x ||
          state.copPos.y !== thiefPos.y
        ) continue;
        captureCount = Math.min(countLimit, captureCount + state.pathCount);
        capturePhase = 'thief_turn';
        if (!sampleSteps) sampleSteps = state.sampleSteps;
        caughtBeforeCopMove.add(stateKey);
      }

      const nextStates = new Map();
      for (const [stateKey, state] of states) {
        if (caughtBeforeCopMove.has(stateKey)) continue;
        for (const [dirKey, direction] of Object.entries(DIRECTIONS)) {
          const nextCopPos = {
            x: state.copPos.x + direction.dx,
            y: state.copPos.y + direction.dy
          };
          if (
            !isInside(nextCopPos) ||
            obstacleKeys.has(`${nextCopPos.x},${nextCopPos.y}`)
          ) {
            continue;
          }

          const nextSteps = [...state.sampleSteps, dirKey];
          const hasHandcuffs = state.hasHandcuffs || Boolean(
            handcuffPos &&
            nextCopPos.x === handcuffPos.x &&
            nextCopPos.y === handcuffPos.y
          );
          if (
            hasHandcuffs &&
            nextCopPos.x === thiefPos.x &&
            nextCopPos.y === thiefPos.y
          ) {
            captureCount = Math.min(countLimit, captureCount + state.pathCount);
            capturePhase = capturePhase === 'thief_turn' ? 'mixed' : 'cop_turn';
            if (!sampleSteps) sampleSteps = nextSteps;
            continue;
          }

          const nextKey = `${nextCopPos.x},${nextCopPos.y}|${hasHandcuffs ? 1 : 0}`;
          const existing = nextStates.get(nextKey);
          if (existing) {
            existing.pathCount = Math.min(
              countLimit,
              existing.pathCount + state.pathCount
            );
          } else {
            nextStates.set(nextKey, {
              copPos: nextCopPos,
              hasHandcuffs,
              pathCount: state.pathCount,
              sampleSteps: nextSteps
            });
          }
        }
      }

      if (captureCount > 0) {
        return {
          earliestTurn: turnIndex + 1,
          pathCount: captureCount,
          caughtPhase: capturePhase,
          commands: sampleSteps.map(dir => ({ dir, distance: 1 }))
        };
      }

      states = nextStates;
      if (states.size === 0) break;
    }

    return null;
  },

  /**
   * 추격 문제의 도둑 경로와 경찰 체포 가능성을 한 번에 검증합니다.
   */
  validateChaseScenario(copStartPos, thiefStartPos, thiefCommands, gridSize = 7, obstacles = [], handcuffPos = null) {
    const isInside = position => (
      position &&
      Number.isInteger(position.x) &&
      Number.isInteger(position.y) &&
      Number.isInteger(gridSize) &&
      gridSize > 0 &&
      position.x >= 0 &&
      position.x < gridSize &&
      position.y >= 0 &&
      position.y < gridSize
    );
    if (!isInside(copStartPos)) {
      return { isValid: false, reason: 'cop_start_outside', thiefRoute: null, capturePlan: null };
    }
    if (!isInside(thiefStartPos)) {
      return { isValid: false, reason: 'thief_start_outside', thiefRoute: null, capturePlan: null };
    }
    if (
      copStartPos.x === thiefStartPos.x &&
      copStartPos.y === thiefStartPos.y
    ) {
      return { isValid: false, reason: 'same_cop_and_thief_start', thiefRoute: null, capturePlan: null };
    }
    if (!Array.isArray(obstacles)) {
      return { isValid: false, reason: 'invalid_obstacles', thiefRoute: null, capturePlan: null };
    }

    const obstacleKeys = new Set();
    for (const obstacle of obstacles) {
      if (!isInside(obstacle)) {
        return { isValid: false, reason: 'obstacle_outside', thiefRoute: null, capturePlan: null };
      }
      const key = `${obstacle.x},${obstacle.y}`;
      if (obstacleKeys.has(key)) {
        return { isValid: false, reason: 'duplicate_obstacle', thiefRoute: null, capturePlan: null };
      }
      obstacleKeys.add(key);
    }
    if (obstacleKeys.has(`${copStartPos.x},${copStartPos.y}`)) {
      return { isValid: false, reason: 'obstacle_on_cop', thiefRoute: null, capturePlan: null };
    }
    if (obstacleKeys.has(`${thiefStartPos.x},${thiefStartPos.y}`)) {
      return { isValid: false, reason: 'obstacle_on_thief', thiefRoute: null, capturePlan: null };
    }

    if (handcuffPos) {
      if (!isInside(handcuffPos)) {
        return { isValid: false, reason: 'handcuffs_outside', thiefRoute: null, capturePlan: null };
      }
      const handcuffKey = `${handcuffPos.x},${handcuffPos.y}`;
      if (obstacleKeys.has(handcuffKey)) {
        return { isValid: false, reason: 'handcuffs_on_obstacle', thiefRoute: null, capturePlan: null };
      }
      if (handcuffKey === `${copStartPos.x},${copStartPos.y}`) {
        return { isValid: false, reason: 'handcuffs_on_cop_start', thiefRoute: null, capturePlan: null };
      }
      if (handcuffKey === `${thiefStartPos.x},${thiefStartPos.y}`) {
        return { isValid: false, reason: 'handcuffs_on_thief_route', thiefRoute: null, capturePlan: null };
      }
    }

    const thiefRoute = this.traceChaseThiefRoute(
      thiefStartPos,
      thiefCommands,
      gridSize,
      obstacles
    );
    if (!thiefRoute.isValid) {
      return {
        isValid: false,
        reason: thiefRoute.reason,
        thiefRoute,
        capturePlan: null
      };
    }
    if (
      handcuffPos &&
      thiefRoute.positions.some(position => (
        position.x === handcuffPos.x && position.y === handcuffPos.y
      ))
    ) {
      return {
        isValid: false,
        reason: 'handcuffs_on_thief_route',
        thiefRoute,
        capturePlan: null
      };
    }

    const capturePlan = this.findChaseCapturePlan(
      copStartPos,
      thiefStartPos,
      thiefCommands,
      gridSize,
      obstacles,
      handcuffPos
    );
    return {
      isValid: Boolean(capturePlan),
      reason: capturePlan ? '' : 'no_capture_route',
      thiefRoute,
      capturePlan
    };
  }
};
