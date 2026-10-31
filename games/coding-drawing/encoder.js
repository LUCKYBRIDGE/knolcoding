/**
 * 별빛 탐험대 - 초경량 URL & QR 코드 데이터 압축 인코더
 * 모눈종이 퍼즐 데이터를 극소형 단축 키(Short Keys)로 압축하여 선명한 QR 코드 및 숏 URL 생성
 */

import { MAX_COMMAND_DISTANCE } from './command.js';

const INITIAL_COMMAND_DIRECTION_CODES = Object.freeze({
  UP: 'u',
  UP_RIGHT: 'r',
  RIGHT: 'e',
  DOWN_RIGHT: 'd',
  DOWN: 'n',
  DOWN_LEFT: 'l',
  LEFT: 'w',
  UP_LEFT: 'q'
});

const INITIAL_COMMAND_CODE_DIRECTIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(INITIAL_COMMAND_DIRECTION_CODES).map(([direction, code]) => [code, direction])
  )
);

export const Encoder = {
  MAX_ENCODED_LENGTH: 12000,

  isBombReachable(starPos, goalPos, gridSize, obstacles = []) {
    const obstacleKeys = new Set(obstacles.map(({ x, y }) => `${x},${y}`));
    const startKey = `${starPos.x},${starPos.y}`;
    const goalKey = `${goalPos.x},${goalPos.y}`;
    const queue = [{ ...starPos }];
    const visited = new Set([startKey]);
    const steps = [-1, 0, 1];

    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      for (const dx of steps) {
        for (const dy of steps) {
          if (dx === 0 && dy === 0) continue;
          const next = { x: current.x + dx, y: current.y + dy };
          if (
            next.x < 0 ||
            next.x >= gridSize ||
            next.y < 0 ||
            next.y >= gridSize
          ) {
            continue;
          }

          const key = `${next.x},${next.y}`;
          if (key === goalKey) return true;
          if (visited.has(key) || obstacleKeys.has(key)) continue;
          visited.add(key);
          queue.push(next);
        }
      }
    }

    return false;
  },

  /**
   * 데이터를 초단축 키(Short Keys) 구조로 압축
   */
  compress(data) {
    if (!data) return {};
    const compressed = {};

    if (data.puzzleType) compressed.t = data.puzzleType === 'draw' ? 'd' : 'b';
    if (data.gridSize) compressed.g = data.gridSize;

    if (data.starPos) compressed.s = [data.starPos.x, data.starPos.y];
    if (data.goalPos) compressed.e = [data.goalPos.x, data.goalPos.y];

    if (data.obstacles && data.obstacles.length > 0) {
      compressed.o = data.obstacles.map(obs => [obs.x, obs.y]);
    }

    if (data.targetLines && data.targetLines.length > 0) {
      compressed.l = data.targetLines.map(line => [line.fromX, line.fromY, line.toX, line.toY]);
    }

    if (data.initialCommands && data.initialCommands.length > 0) {
      compressed.c = data.initialCommands.map(command => [
        INITIAL_COMMAND_DIRECTION_CODES[command.dir],
        command.distance
      ]);
    }

    if (data.title) compressed.n = data.title;
    return compressed;
  },

  /**
   * 단축 키 데이터를 원본 퍼즐 객체로 복원
   */
  decompress(compressed) {
    if (!compressed) return null;
    if (compressed.puzzleType || compressed.starPos) return compressed; // 기존 포맷 호환

    const data = {
      title: compressed.n || (compressed.t === 'd' ? '🎨 친구의 그림 문제' : '🚀 친구의 미사일 문제'),
      puzzleType: compressed.t === 'd' ? 'draw' : 'bomb',
      playerType: compressed.t === 'd' ? 'brush' : 'missile',
      gridSize: compressed.g || 7,
      starPos: compressed.s ? { x: compressed.s[0], y: compressed.s[1] } : { x: 1, y: 5 },
      guide: compressed.t === 'd'
        ? '🖌️ 제시된 무지개 그림 안내를 따라 똑같이 이동 명령을 조립해 보세요!'
        : '🚀 미사일을 조종하여 장애물(🔴)을 피하고 🎯 목표점에 도착하세요!'
    };

    if (compressed.e) {
      data.goalPos = { x: compressed.e[0], y: compressed.e[1] };
    }

    if (compressed.o) {
      data.obstacles = compressed.o.map(obs => ({ x: obs[0], y: obs[1] }));
    }

    if (compressed.l) {
      data.targetLines = compressed.l.map(line => ({
        fromX: line[0], fromY: line[1], toX: line[2], toY: line[3]
      }));
    }

    if (compressed.c) {
      data.initialCommands = compressed.c.map(command => ({
        dir: INITIAL_COMMAND_CODE_DIRECTIONS[command[0]],
        distance: command[1]
      }));
    }

    return data;
  },

  /**
   * 공유 링크에서 읽은 퍼즐을 허용된 크기와 좌표 범위로 검증하고
   * 화면에 사용할 안전한 필드만 새 객체로 반환합니다.
   */
  validatePuzzleData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

    const puzzleType = data.puzzleType === 'draw' ? 'draw' : (data.puzzleType === 'bomb' ? 'bomb' : null);
    const gridSize = Number(data.gridSize);
    if (!puzzleType || ![5, 7, 9, 11].includes(gridSize)) return null;

    const isValidPosition = position => (
      position &&
      Number.isInteger(position.x) &&
      Number.isInteger(position.y) &&
      position.x >= 0 &&
      position.x < gridSize &&
      position.y >= 0 &&
      position.y < gridSize
    );
    const samePosition = (a, b) => a.x === b.x && a.y === b.y;

    if (!isValidPosition(data.starPos)) return null;
    const starPos = { x: data.starPos.x, y: data.starPos.y };
    const titleFallback = puzzleType === 'draw'
      ? '🎨 친구의 그림 문제'
      : '🚀 친구의 미사일 문제';
    const safeData = {
      title: typeof data.title === 'string' && data.title.trim()
        ? data.title.trim().slice(0, 80)
        : titleFallback,
      puzzleType,
      playerType: puzzleType === 'draw' ? 'brush' : 'missile',
      gridSize,
      starPos,
      guide: puzzleType === 'draw'
        ? '🖌️ 제시된 무지개 그림 안내를 따라 똑같이 이동 명령을 조립해 보세요!'
        : '🚀 미사일을 조종하여 장애물(🔴)을 피하고 🎯 목표점에 도착하세요!'
    };

    if (puzzleType === 'bomb') {
      if (!isValidPosition(data.goalPos) || samePosition(starPos, data.goalPos)) return null;
      safeData.goalPos = { x: data.goalPos.x, y: data.goalPos.y };

      const obstacles = Array.isArray(data.obstacles) ? data.obstacles : [];
      if (obstacles.length > gridSize * gridSize - 2) return null;

      const obstacleKeys = new Set();
      safeData.obstacles = [];
      for (const obstacle of obstacles) {
        if (!isValidPosition(obstacle)) return null;
        if (samePosition(starPos, obstacle) || samePosition(safeData.goalPos, obstacle)) return null;

        const key = `${obstacle.x},${obstacle.y}`;
        if (obstacleKeys.has(key)) continue;
        obstacleKeys.add(key);
        safeData.obstacles.push({ x: obstacle.x, y: obstacle.y });
      }

      if (!this.isBombReachable(starPos, safeData.goalPos, gridSize, safeData.obstacles)) {
        return null;
      }
    } else {
      if (!Array.isArray(data.targetLines) || data.targetLines.length === 0 || data.targetLines.length > 128) {
        return null;
      }

      safeData.targetLines = [];
      let previousEnd = starPos;
      for (const line of data.targetLines) {
        if (
          !line ||
          !Number.isInteger(line.fromX) ||
          !Number.isInteger(line.fromY) ||
          !Number.isInteger(line.toX) ||
          !Number.isInteger(line.toY)
        ) {
          return null;
        }

        const from = { x: line.fromX, y: line.fromY };
        const to = { x: line.toX, y: line.toY };
        if (!isValidPosition(from) || !isValidPosition(to) || !samePosition(from, previousEnd)) {
          return null;
        }

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const isEightDirectionLine = (
          (dx !== 0 || dy !== 0) &&
          (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))
        );
        if (!isEightDirectionLine) return null;

        safeData.targetLines.push({
          fromX: from.x,
          fromY: from.y,
          toX: to.x,
          toY: to.y
        });
        previousEnd = to;
      }
    }

    if (Array.isArray(data.initialCommands) && data.initialCommands.length > 0) {
      const allowedDirections = new Set([
        'UP', 'UP_RIGHT', 'RIGHT', 'DOWN_RIGHT',
        'DOWN', 'DOWN_LEFT', 'LEFT', 'UP_LEFT'
      ]);
      if (data.initialCommands.length > 128) return null;

      safeData.initialCommands = [];
      for (const command of data.initialCommands) {
        if (
          !command ||
          !allowedDirections.has(command.dir) ||
          !Number.isInteger(command.distance) ||
          command.distance < 1 ||
          command.distance > MAX_COMMAND_DISTANCE
        ) {
          return null;
        }
        safeData.initialCommands.push({ dir: command.dir, distance: command.distance });
      }
    }

    return safeData;
  },

  /**
   * 퍼즐 객체를 초경량 URL 안전 문자열로 압축 인코딩
   */
  encode(puzzleData) {
    try {
      const validatedData = this.validatePuzzleData(puzzleData);
      if (!validatedData) return '';

      const compactData = this.compress(validatedData);
      const jsonString = JSON.stringify(compactData);
      const base64 = btoa(encodeURIComponent(jsonString).replace(/%([0-9A-F]{2})/g, (match, p1) => {
        return String.fromCharCode('0x' + p1);
      }));
      return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) {
      console.error('Encoding error:', e);
      return '';
    }
  },

  /**
   * URL 문자열에서 퍼즐 객체 복원
   */
  decode(encodedString) {
    if (
      typeof encodedString !== 'string' ||
      encodedString.length === 0 ||
      encodedString.length > this.MAX_ENCODED_LENGTH ||
      !/^[A-Za-z0-9_-]+={0,2}$/.test(encodedString)
    ) {
      return null;
    }

    try {
      let base64 = encodedString.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }
      const jsonString = decodeURIComponent(
        Array.prototype.map.call(atob(base64), (c) => {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join('')
      );
      const raw = JSON.parse(jsonString);
      return this.validatePuzzleData(this.decompress(raw));
    } catch (e) {
      console.error('Decoding error:', e);
      return null;
    }
  },

  /**
   * 초경량 숏 공유 URL 생성
   */
  getShareableLink(puzzleData, locationLike = (typeof window !== 'undefined' ? window.location : null)) {
    const code = this.encode(puzzleData);
    if (!code || !locationLike) return '';

    const origin = locationLike.origin || '';
    const pathname = locationLike.pathname || '';
    if (!origin || !pathname) return '';

    const baseUrl = origin + pathname;
    return `${baseUrl}#p=${code}`;
  },

  /**
   * 선명한 카메라 스캔용 QR 코드 이미지 API 주소 생성
   */
  getQRCodeUrl(shareUrl) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(shareUrl)}`;
  },

  /**
   * URL 해시에서 퍼즐 데이터 읽기
   */
  getPuzzleCodeFromLocation(locationLike) {
    if (!locationLike) return '';

    const hashParams = new URLSearchParams(String(locationLike.hash || '').replace(/^#/, ''));
    const hashCode = hashParams.get('p') || hashParams.get('puzzle');
    if (hashCode) return hashCode.trim();

    const queryParams = new URLSearchParams(String(locationLike.search || '').replace(/^\?/, ''));
    return (queryParams.get('p') || queryParams.get('puzzle') || '').trim();
  },

  loadFromLocation(locationLike) {
    const code = this.getPuzzleCodeFromLocation(locationLike);
    return code ? this.decode(code) : null;
  },

  loadFromURL() {
    if (typeof window === 'undefined') return null;
    return this.loadFromLocation(window.location);
  }
};
