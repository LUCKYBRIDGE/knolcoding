/* global React, ReactDOM, htm */
const { useState, useEffect, useCallback, Fragment } = React;
const html = htm.bind(React.createElement);

// ==================== 공통 유틸리티 ====================

const shuffleArray = (list) => {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// ==================== 공통 컴포넌트 ====================

const Icon = ({ path, extra }) =>
  html`<svg xmlns="http://www.w3.org/2000/svg" className=${extra} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d=${path} />
  </svg>`;

function Block({ block, onDragStart, isGhost = false, index, totalBlocks, onQuickAction, quickActionLabel, iconPath, onTimeChange }) {
  const stackPath = 'M 0 0 H 80 V 5 H 100 V 0 H 200 V 45 H 100 V 50 H 80 V 45 H 0 Z';
  const colorMap = {
    'bg-cyan-500': 'fill-cyan-500',
    'bg-cyan-600': 'fill-cyan-600',
    'bg-emerald-500': 'fill-emerald-500',
    'bg-emerald-600': 'fill-emerald-600',
    'bg-amber-500': 'fill-amber-500',
    'bg-rose-500': 'fill-rose-500',
    'bg-orange-500': 'fill-orange-500',
    'bg-purple-500': 'fill-purple-500',
    'bg-blue-500': 'fill-blue-500',
    'bg-green-500': 'fill-green-500',
    'bg-red-500': 'fill-red-500',
    'bg-pink-500': 'fill-pink-500',
    'bg-gray-500': 'fill-gray-500',
  };

  const style = {
    filter: 'drop-shadow(0 2px 2px rgb(0 0 0 / 0.2))',
    zIndex: typeof index === 'number' && typeof totalBlocks === 'number' ? totalBlocks - index : undefined,
  };

  const handleQuickAction = (e) => {
    if (!onQuickAction) return;
    e.preventDefault();
    e.stopPropagation();
    onQuickAction();
  };

  const handleTimeClick = (e) => {
    if (!onTimeChange) return;
    e.preventDefault();
    e.stopPropagation();
    onTimeChange();
  };

  return html`
    <div
      id=${block.id}
      draggable="true"
      onDragStart=${onDragStart}
      onDoubleClick=${onQuickAction ? handleQuickAction : undefined}
      className=${`relative h-[50px] ${typeof index === 'number' ? '-mt-[5px]' : 'my-1'} cursor-grab active:cursor-grabbing font-bold transition-all duration-200 transform hover:scale-105 ${isGhost ? 'opacity-50' : ''}`}
      style=${style}
    >
      <svg viewBox="0 0 200 50" className="absolute w-full h-full" preserveAspectRatio="none">
        <path d=${stackPath} className=${colorMap[block.color]} />
      </svg>
      <div className="absolute inset-0 flex items-center pl-6 ${onQuickAction ? 'pr-12' : 'pr-4'} text-white gap-2">
        ${iconPath ? html`<${Icon} path=${iconPath} extra="h-6 w-6" />` : null}
        <span className="flex-1 truncate">${block.text}</span>
      </div>
      ${onTimeChange
        ? html`
            <button
              type="button"
              className="absolute right-${onQuickAction ? '10' : '2'} top-1/2 -translate-y-1/2 bg-white/90 text-pink-600 text-xs font-bold px-1.5 py-0.5 rounded shadow-sm hover:bg-white border border-pink-300"
              onClick=${handleTimeClick}
              title="클릭하여 시간 선택"
            >
              ⏱️
            </button>
          `
        : null}
      ${onQuickAction
        ? html`
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/70 text-gray-800 text-xs font-semibold px-2 py-0.5 rounded-full shadow-sm hover:bg-white"
              onClick=${handleQuickAction}
            >
              ${quickActionLabel}
            </button>
          `
        : null}
    </div>
  `;
}

function BlockPalette({ blocks, onDragStart, onDrop, onQuickAdd, iconPaths, onTimeChange }) {
  const handleDragOver = (e) => e.preventDefault();
  return html`
    <div
      onDrop=${onDrop}
      onDragOver=${handleDragOver}
      className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-4 border-2 border-gray-200 h-full flex flex-col min-h-[500px]"
    >
      <div className="flex items-center justify-between border-b-2 pb-2 mb-2 flex-shrink-0">
        <h2 className="text-2xl font-bold text-gray-800">블록 꾸러미</h2>
        <span className="text-xs text-gray-500">더블클릭 또는 버튼으로 추가</span>
      </div>
      <div className="flex-grow overflow-y-auto p-2">
        ${blocks.length
          ? blocks.map((block, idx) =>
              html`<${Block}
                key=${block.id + '-' + idx}
                block=${block}
                onDragStart=${(e) => onDragStart(e, block.id)}
                onQuickAction=${() => onQuickAdd(block.id)}
                quickActionLabel="＋"
                iconPath=${iconPaths ? iconPaths[block.id] : null}
                onTimeChange=${block.id === 'waitBoil' && onTimeChange ? () => onTimeChange(idx) : null}
              />`,
            )
          : html`<div className="flex items-center justify-center h-full text-gray-500">
              <p>모든 블록을 사용했어요!</p>
            </div>`}
      </div>
    </div>
  `;
}

function ExecutionSequence({ blocks, onDragStart, onDrop, onExecute, onReset, onQuickRemove, iconPaths, onTimeChange, executeLabel = "실행하기! 🚀", showStartBlock = false, startBlockText = "등교하기 버튼을 눌렀을 때", startBlockColor = "green" }) {
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    const blockId = e.dataTransfer.getData('blockId');
    if (!blockId) return;

    const dropZone = e.currentTarget;
    const draggableElements = Array.from(dropZone.querySelectorAll('[draggable="true"]'));

    if (draggableElements.length === 0) {
      setDragOverIndex(0);
      return;
    }

    const mouseY = e.clientY;
    let newIndex = draggableElements.length;

    for (let i = 0; i < draggableElements.length; i++) {
      const child = draggableElements[i];
      const rect = child.getBoundingClientRect();
      const midY = rect.top + (50 - 5) / 2;
      if (mouseY < midY) {
        newIndex = i;
        break;
      }
    }
    setDragOverIndex(newIndex);
  };

  const handleDragLeave = () => setDragOverIndex(null);

  const handleDrop = (e) => {
    e.preventDefault();
    const blockId = e.dataTransfer.getData('blockId');
    if (!blockId) {
      setDragOverIndex(null);
      return;
    }

    const dropZone = e.currentTarget;
    const draggableElements = Array.from(dropZone.querySelectorAll('[draggable="true"]'));

    let targetIndex = draggableElements.length;
    if (draggableElements.length === 0) {
      targetIndex = 0;
    } else {
      const mouseY = e.clientY;
      for (let i = 0; i < draggableElements.length; i++) {
        const child = draggableElements[i];
        const rect = child.getBoundingClientRect();
        const midY = rect.top + (50 - 5) / 2;
        if (mouseY < midY) {
          targetIndex = i;
          break;
        }
      }
    }

    onDrop(blockId, targetIndex);
    setDragOverIndex(null);
  };

  const DropIndicator = () => html`<div className="h-2 my-1 bg-blue-400 rounded-full" />`;

  const StartBlock = () => {
    const hatPath = 'M 0 10 C 0 0, 200 0, 200 10 V 45 H 100 V 50 H 80 V 45 H 0 Z';
    const colorMap = {
      green: { fill: 'fill-green-500', iconColor: 'text-green-600' },
      orange: { fill: 'fill-orange-500', iconColor: 'text-orange-600' },
      blue: { fill: 'fill-blue-500', iconColor: 'text-blue-600' },
    };
    const colors = colorMap[startBlockColor] || colorMap.green;

    return html`
      <div className="relative h-[50px]" style=${{ filter: 'drop-shadow(0 2px 2px rgb(0 0 0 / 0.2))', zIndex: 50 }}>
        <svg viewBox="0 0 200 50" className="absolute w-full h-full" preserveAspectRatio="none">
          <path d=${hatPath} className=${colors.fill} />
        </svg>
        <div className="absolute inset-0 flex items-center text-white font-bold pl-3">
          <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center mr-2 flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className=${`h-5 w-5 ${colors.iconColor}`} fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8.002v3.996a1 1 0 001.555.832l3.197-2a1 1 0 000-1.664l-3.197-2z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <span>${startBlockText}</span>
        </div>
      </div>
    `;
  };

  return html`
    <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-4 border-2 border-gray-200 h-full flex flex-col min-h-[500px]">
      <div className="border-b-2 pb-2 mb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-800">
            ${showStartBlock ? html`나의 ${startBlockColor === 'orange' ? '라면 끓이기' : '등교'} 절차 <span key="block-count" className="text-base font-normal text-gray-500 ml-2">(블록: ${blocks.length}개)</span>` : '실행 순서'}
          </h2>
          ${showStartBlock ? html`<span className="text-xs text-gray-500">더블클릭으로 되돌릴 수 있어요</span>` : null}
        </div>
        ${showStartBlock
          ? html`<p className="text-sm text-gray-500 mt-2">
              블록 꾸러미에서 원하는 블록을 <strong className="text-gray-700">드래그 & 드롭</strong>해 점선 영역에 연결해 보세요.
            </p>`
          : null}
      </div>
      <div
        onDrop=${handleDrop}
        onDragOver=${handleDragOver}
        onDragLeave=${handleDragLeave}
        className=${`flex-grow overflow-y-auto p-${showStartBlock ? '6' : '2'} min-h-[300px] border-2 border-dashed ${showStartBlock ? (startBlockColor === 'orange' ? 'border-orange-200 bg-orange-50' : 'border-blue-200 bg-sky-50') : 'border-gray-300'} rounded-lg relative`}
        style=${showStartBlock ? {
          backgroundImage: startBlockColor === 'orange'
            ? 'radial-gradient(circle, rgba(249,115,22,0.18) 2px, transparent 2px)'
            : 'radial-gradient(circle, rgba(59,130,246,0.18) 2px, transparent 2px)',
          backgroundSize: '22px 22px',
        } : {}}
      >
        ${showStartBlock ? html`<${StartBlock} />` : null}
        ${blocks.length === 0 && dragOverIndex === 0 && showStartBlock ? html`<${DropIndicator} key=${'drop-0'} />` : null}
        ${blocks.length === 0 && !showStartBlock
          ? html`
              <div className="flex items-center justify-center h-full text-gray-400">
                <p>블록을 여기로 드래그하세요</p>
              </div>
            `
          : blocks.map((block, idx) =>
              showStartBlock
                ? html`<${Fragment} key=${`${block.id}-${idx}`}>
                    ${dragOverIndex === idx ? html`<${DropIndicator} key=${'drop-' + idx} />` : null}
                    <${Block}
                      key=${`block-${block.id}-${idx}`}
                      block=${block}
                      index=${idx}
                      totalBlocks=${blocks.length}
                      onDragStart=${(e) => onDragStart(e, block.id, idx)}
                      onQuickAction=${() => onQuickRemove(idx)}
                      quickActionLabel="↩"
                      iconPath=${iconPaths ? iconPaths[block.id] : null}
                      onTimeChange=${block.id === 'waitBoil' && onTimeChange ? () => onTimeChange(idx) : null}
                    />
                  </>`
                : html`<${Block}
                    key=${`${block.id}-${idx}`}
                    block=${block}
                    index=${idx}
                    totalBlocks=${blocks.length}
                    onDragStart=${(e) => onDragStart(e, block.id, idx)}
                    onQuickAction=${() => onQuickRemove(idx)}
                    quickActionLabel="✕"
                    iconPath=${iconPaths ? iconPaths[block.id] : null}
                    onTimeChange=${block.id === 'waitBoil' && onTimeChange ? () => onTimeChange(idx) : null}
                  />`
            )}
        ${dragOverIndex === blocks.length && showStartBlock ? html`<${DropIndicator} key=${'drop-end'} />` : null}
        ${blocks.length === 0 && dragOverIndex === null && showStartBlock
          ? html`<div className="flex items-center justify-center h-full text-gray-400 text-center">
              <p className="p-4">왼쪽 꾸러미에서<br />블록을 가져와<br />여기에 연결하세요!</p>
            </div>`
          : null}
        ${dragOverIndex !== null && !showStartBlock
          ? html`
              <div
                className="absolute left-2 right-2 h-1 bg-blue-500 rounded-full"
                style=${{ top: `${dragOverIndex * 45 + 10}px` }}
              />
            `
          : null}
      </div>
      <div className="flex gap-2 mt-4 flex-shrink-0">
        <button
          onClick=${onExecute}
          className=${`flex-1 ${showStartBlock ? (startBlockColor === 'orange' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700') : 'bg-gradient-to-r from-blue-500 to-purple-600'} text-white px-6 py-3 rounded-lg font-bold text-lg shadow-lg hover:shadow-xl transition-all transform hover:scale-105`}
        >
          ${executeLabel}
        </button>
        <button
          onClick=${onReset}
          className=${`${showStartBlock ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-500'} text-white px-6 py-3 rounded-lg font-bold text-lg shadow-lg hover:shadow-xl transition-all transform hover:scale-105`}
        >
          ${showStartBlock ? '처음부터' : '초기화'}
        </button>
      </div>
    </div>
  `;
}

// ==================== 라면 끓이기 게임 ====================

const RAMEN_BLOCKS = {
  water: { id: 'water', text: '냄비에 물 받기', color: 'bg-blue-500' },
  fire: { id: 'fire', text: '냄비에 불켜기', color: 'bg-red-500' },
  waitBoil: { id: 'waitBoil', text: '30초 기다리기', color: 'bg-pink-500', seconds: 30 },
  noodle: { id: 'noodle', text: '면 넣기', color: 'bg-orange-500' },
  soup: { id: 'soup', text: '스프 넣기', color: 'bg-green-500' },
  fireOff: { id: 'fireOff', text: '불끄기', color: 'bg-gray-500' },
};

const RAMEN_BOIL_SECONDS = 30;
const RAMEN_REDUCED_WATER_SECONDS = 300;
const RAMEN_EVAPORATED_WATER_SECONDS = 600;

// 시간 설정 옵션: 30초 ~ 10분. 5분 초과는 물이 졸고, 10분 이상은 물이 날아간다.
const TIME_OPTIONS = [30, 60, 90, 120, 150, 180, 210, 240, 300, 360, 480, 600];

// 시간을 텍스트로 변환하는 함수
const formatDurationText = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes > 0 && secs > 0) {
    return `${minutes}분 ${secs}초`;
  } else if (minutes > 0) {
    return `${minutes}분`;
  } else {
    return `${secs}초`;
  }
};

const formatTimeText = (seconds) => `${formatDurationText(seconds)} 기다리기`;

// 시간 선택 모달
function TimeSelectModal({ isOpen, onClose, onSelect, currentSeconds }) {
  if (!isOpen) return null;

  return html`
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick=${onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full" onClick=${(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">⏱️ 시간 선택하기</h2>
        <p className="text-sm text-gray-600 mb-2 text-center">원하는 시간을 선택해주세요</p>
        <p className="text-xs sm:text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-6 text-center">
          물은 30초 뒤 끓고, 면은 끓는 물에서 3분 익혀요. 5분을 넘기면 물이 졸고 10분 이상이면 타요.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-6">
          ${TIME_OPTIONS.map(seconds => {
            const isSelected = seconds === currentSeconds;
            return html`
              <button
                key=${seconds}
                onClick=${() => onSelect(seconds)}
                className=${`py-4 px-4 rounded-xl font-bold text-lg transition-all transform hover:scale-105 ${
                  isSelected
                    ? 'bg-pink-500 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-pink-100'
                }`}
              >
                ${formatTimeText(seconds)}
              </button>
            `;
          })}
        </div>

        <button
          onClick=${onClose}
          className="w-full bg-gray-500 hover:bg-gray-600 text-white py-3 rounded-lg font-bold transition-all"
        >
          취소
        </button>
      </div>
    </div>
  `;
}

const RAMEN_INITIAL_PALETTE = [
  RAMEN_BLOCKS.water,
  RAMEN_BLOCKS.fire,
  { ...RAMEN_BLOCKS.waitBoil, seconds: 30, text: '30초 기다리기' }, // 기다리기 블록 1
  { ...RAMEN_BLOCKS.waitBoil, seconds: 30, text: '30초 기다리기' }, // 기다리기 블록 2
  RAMEN_BLOCKS.noodle,
  RAMEN_BLOCKS.soup,
  RAMEN_BLOCKS.fireOff,
];

const getResultImage = (resultType) => {
  const imageMap = {
    'empty': './images-game-pixel-final/ramen/emptybowl.png',
    'incomplete': './images-game-pixel-final/ramen/emptybowl.png',
    'missing_all_ingredients': './images-game-pixel-final/ramen/emptybowl.png',
    'missing_water_noodle': './images-game-pixel-final/ramen/emptybowl.png',
    'missing_water_soup': './images-game-pixel-final/ramen/emptybowl.png',
    'missing_noodle_soup': './images-game-pixel-final/ramen/coldwaterfilledpot.png',
    'soup_only': './images-game-pixel-final/ramen/dry-soup-only.png',
    'noodle_only': './images-game-pixel-final/ramen/dry-noodle-only.png',
    'no_water': './images-game-pixel-final/ramen/dry-no-water-noodle-soup.png',
    'water_only': './images-game-pixel-final/ramen/coldwaterfilledpot.png',
    'heating_water_only': './images-game-pixel-final/ramen/coldwaterfilledpot.png',
    'boiled_water_only': './images-game-pixel-final/ramen/boilingwaterfilledpot.png',
    'reduced_water_only': './images-game-pixel-final/ramen/reduced-water-pot.png',
    'soup_water': './images-game-pixel-final/ramen/soup-water-bowl.png',
    'hot_soup_water': './images-game-pixel-final/ramen/hotsoupbowl.png',
    'reduced_soup_water': './images-game-pixel-final/ramen/reduced-soup-water-bowl.png',
    'cold_no_soup': './images-game-pixel-final/ramen/cold-noodle-water.png',
    'raw_no_soup': './images-game-pixel-final/ramen/hot-raw-no-soup-bowl.png',
    'reduced_noodle_water': './images-game-pixel-final/ramen/reduced-noodle-water-bowl.png',
    'reduced_water_ramen': './images-game-pixel-final/ramen/reduced-ramen-bowl.png',
    'evaporated_empty_pot': './images-game-pixel-final/ramen/burned-empty-pot.png',
    'evaporated_burned_soup': './images-game-pixel-final/ramen/burned-soup-pot.png',
    'evaporated_burned_noodle': './images-game-pixel-final/ramen/burned-noodle-pot.png',
    'evaporated_burned_ramen': './images-game-pixel-final/ramen/evaporated-burned-ramen-pot.png',
    'burned_empty_pot': './images-game-pixel-final/ramen/burned-empty-pot.png',
    'burned_soup': './images-game-pixel-final/ramen/burned-soup-pot.png',
    'burned_noodle': './images-game-pixel-final/ramen/burned-noodle-pot.png',
    'burned_noodle_soup': './images-game-pixel-final/ramen/burned-noodle-soup-pot.png',
    'burnt_soup_water': './images-game-pixel-final/ramen/burnt-soup-water-bowl.png',
    'burnt_noodle_water': './images-game-pixel-final/ramen/burnt-noodle-water-bowl.png',
    'burnt_taste_soup': './images-game-pixel-final/ramen/burnt-soup-water-bowl.png',
    'burnt_taste_noodle': './images-game-pixel-final/ramen/burnt-noodle-water-bowl.png',
    'burnt_taste_ramen': './images-game-pixel-final/ramen/burnt-pot-taste-ramen.png',
    'burnt_soup_taste_ramen': './images-game-pixel-final/ramen/burnt-soup-taste-ramen.png',
    'burnt_noodle_taste_ramen': './images-game-pixel-final/ramen/burnt-noodle-taste-ramen.png',
    'burnt_noodle_soup_taste_ramen': './images-game-pixel-final/ramen/burnt-noodle-soup-taste-ramen.png',
    'cold': './images-game-pixel-final/ramen/coldramensouprawnoodlebowl.png',
    'raw_noodle': './images-game-pixel-final/ramen/hotsouprawnoodlebowl.png',
    'uncooked': './images-game-pixel-final/ramen/hotsouprawnoodlebowl.png',
    'barely_cooked': './images-game-pixel-final/ramen/hotsouprawnoodlebowl.png',
    'slightly_undercooked': './images-game-pixel-final/ramen/slightly-undercooked-ramen.png',
    'no_noodle': './images-game-pixel-final/ramen/hotsoupbowl.png',
    'no_soup': './images-game-pixel-final/ramen/hotwaterramenbowl.png',
    'burned': './images-game-pixel-final/ramen/burned-noodle-soup-pot.png',
    'useless_wait': './images-game-pixel-final/ramen/coldramensouprawnoodlebowl.png',
    'imperfect_success': './images-game-pixel-final/ramen/finishedramen.png',
    'very_undercooked': './images-game-pixel-final/ramen/hotsouprawnoodlebowl.png',
    'undercooked': './images-game-pixel-final/ramen/finishedramen.png',
    'chewy': './images-game-pixel-final/ramen/chewy-ramen.png',
    'soft': './images-game-pixel-final/ramen/soft-ramen.png',
    'puffy': './images-game-pixel-final/ramen/overcookedramen.png',
    'severely_overcooked': './images-game-pixel-final/ramen/severely-overcooked-ramen.png',
    'overcooked': './images-game-pixel-final/ramen/overcookedramen.png',
    'late_soup': './images-game-pixel-final/ramen/late-soup-ramen.png',
    'soup_after_fireoff': './images-game-pixel-final/ramen/late-soup-ramen.png',
    'noodle_after_fireoff': './images-game-pixel-final/ramen/hotsouprawnoodlebowl.png',
    'fire_not_off': './images-game-pixel-final/ramen/cookingpot.png',
    'perfect': './images-game-pixel-final/ramen/finishedramen.png',
  };

  return imageMap[resultType] || './images-game-pixel-final/ramen/emptypot.png';
};

const getRamenCookingStats = (sequence) => {
  const stats = {
    hasWater: false,
    waterAvailable: false,
    waterOnFireSeconds: 0,
    waterReduced: false,
    waterEvaporated: false,
    evaporationNoodleBurned: false,
    evaporationSoupBurned: false,
    hasFire: false,
    hasNoodle: false,
    hasSoup: false,
    hasFireOff: false,
    fireOn: false,
    fireBeforeWater: false,
    dryNoodleBurned: false,
    drySoupBurned: false,
    noodleAddedAfterFireOff: false,
    soupAddedAfterFireOff: false,
    soupAddedAfterNoodlesCooked: false,
    cookedSeconds: 0,
    soupCookedSeconds: 0,
    heatedWaterSeconds: 0,
    idleSeconds: 0,
  };

  const markDryBurned = () => {
    if (stats.hasNoodle) {
      stats.dryNoodleBurned = true;
    }
    if (stats.hasSoup) {
      stats.drySoupBurned = true;
    }
  };

  const markWaterEvaporated = () => {
    stats.waterAvailable = false;
    stats.waterEvaporated = true;
    if (stats.hasNoodle) {
      stats.evaporationNoodleBurned = true;
      stats.dryNoodleBurned = true;
    }
    if (stats.hasSoup) {
      stats.evaporationSoupBurned = true;
      stats.drySoupBurned = true;
    }
  };

  const addWaterHeatSeconds = (seconds) => {
    if (seconds <= 0) return;

    const remainingHeatSeconds = Math.max(0, RAMEN_BOIL_SECONDS - stats.heatedWaterSeconds);
    const heatSeconds = Math.min(seconds, remainingHeatSeconds);
    const postBoilSeconds = seconds - heatSeconds;

    stats.heatedWaterSeconds += heatSeconds;
    if (postBoilSeconds > 0 && stats.hasNoodle) {
      stats.cookedSeconds += postBoilSeconds;
    } else {
      stats.heatedWaterSeconds += postBoilSeconds;
    }
    if (postBoilSeconds > 0 && stats.hasSoup) {
      stats.soupCookedSeconds += postBoilSeconds;
    }
  };

  sequence.forEach((block) => {
    if (block.id === 'waitBoil') {
      const seconds = block.seconds || 30;
      if (stats.fireOn && stats.waterAvailable) {
        const remainingWaterSeconds = Math.max(0, RAMEN_EVAPORATED_WATER_SECONDS - stats.waterOnFireSeconds);
        const usableWaterSeconds = Math.min(seconds, remainingWaterSeconds);
        const dryFireSeconds = seconds - usableWaterSeconds;

        addWaterHeatSeconds(usableWaterSeconds);
        stats.waterOnFireSeconds += usableWaterSeconds;
        stats.waterReduced = stats.waterOnFireSeconds > RAMEN_REDUCED_WATER_SECONDS;

        if (stats.waterOnFireSeconds >= RAMEN_EVAPORATED_WATER_SECONDS) {
          markWaterEvaporated();
        }

        if (dryFireSeconds > 0) {
          markDryBurned();
          stats.idleSeconds += dryFireSeconds;
        }
      } else if (stats.fireOn && !stats.waterAvailable) {
        markDryBurned();
        stats.idleSeconds += seconds;
      } else {
        stats.idleSeconds += seconds;
      }
      return;
    }

    if (block.id === 'water') {
      stats.hasWater = true;
      stats.waterAvailable = true;
      stats.waterOnFireSeconds = 0;
      stats.waterReduced = false;
      stats.heatedWaterSeconds = 0;
      return;
    }

    if (block.id === 'fire') {
      stats.hasFire = true;
      if (!stats.waterAvailable) {
        stats.fireBeforeWater = true;
        markDryBurned();
      }
      stats.fireOn = true;
      return;
    }

    if (block.id === 'noodle') {
      stats.hasNoodle = true;
      if (stats.hasFireOff && !stats.fireOn) {
        stats.noodleAddedAfterFireOff = true;
      }
      if (stats.fireOn && !stats.waterAvailable) {
        stats.dryNoodleBurned = true;
      }
      return;
    }

    if (block.id === 'soup') {
      stats.hasSoup = true;
      if (stats.hasFireOff && !stats.fireOn) {
        stats.soupAddedAfterFireOff = true;
      }
      if (stats.cookedSeconds >= 180) {
        stats.soupAddedAfterNoodlesCooked = true;
      }
      if (stats.fireOn && !stats.waterAvailable) {
        stats.drySoupBurned = true;
      }
      return;
    }

    if (block.id === 'fireOff') {
      stats.hasFireOff = true;
      stats.fireOn = false;
    }
  });

  return stats;
};

const getRamenCookQuality = (cookedSeconds) => {
  if (cookedSeconds <= 0) {
    return {
      success: false,
      message: '😣 면이 아예 안 익었어요!',
      description: '끓는 물에서 면을 익힌 시간이 0초예요. 기다리기 블록으로 면을 익혀야 해요!',
      emoji: '😖',
      resultType: 'raw_noodle',
      cookedTime: cookedSeconds,
      remainingTime: 180,
    };
  }

  if (cookedSeconds <= 30) {
    return {
      success: false,
      message: '😣 면이 거의 안 익었어요!',
      description: `면을 ${cookedSeconds}초만 끓였어요. 아직 딱딱해서 더 끓여야 해요!`,
      emoji: '😖',
      resultType: 'uncooked',
      cookedTime: cookedSeconds,
      remainingTime: 180 - cookedSeconds,
    };
  }

  if (cookedSeconds <= 60) {
    return {
      success: false,
      message: '😕 면이 덜 익었어요!',
      description: `면을 ${cookedSeconds}초 끓였어요. 조금 익기 시작했지만 아직 설익었어요!`,
      emoji: '😖',
      resultType: 'barely_cooked',
      cookedTime: cookedSeconds,
      remainingTime: 180 - cookedSeconds,
    };
  }

  if (cookedSeconds < 120) {
    return {
      success: false,
      message: '🍜 살짝 덜 익은 라면이에요!',
      description: `면을 ${cookedSeconds}초 끓였어요. 먹기엔 이르고 아직 덜 익은 부분이 있어요!`,
      emoji: '😐',
      resultType: 'slightly_undercooked',
      cookedTime: cookedSeconds,
      remainingTime: 180 - cookedSeconds,
    };
  }

  if (cookedSeconds < 180) {
    return {
      success: true,
      message: '🍜 꼬들꼬들한 라면!',
      description: `면을 ${cookedSeconds}초 끓였어요. 살짝 덜 익은 꼬들꼬들한 라면이 됐어요!`,
      emoji: '🍜',
      resultType: 'chewy',
      cookedTime: cookedSeconds,
    };
  }

  if (cookedSeconds === 180) {
    return {
      success: true,
      message: '🎉 완벽한 라면 완성!',
      description: '면이 3분 동안 알맞게 익었고 필요한 재료가 모두 들어갔어요!',
      emoji: '🍜',
      resultType: 'perfect',
      cookedTime: cookedSeconds,
    };
  }

  if (cookedSeconds <= 240) {
    return {
      success: true,
      message: '🍜 조금 퍼진 라면!',
      description: `면을 ${cookedSeconds}초 끓였어요. 조금 부드럽고 퍼졌지만 먹을 수 있는 라면이에요!`,
      emoji: '🍜',
      resultType: 'soft',
      cookedTime: cookedSeconds,
      extraTime: cookedSeconds - 180,
    };
  }

  if (cookedSeconds <= 300) {
    return {
      success: false,
      message: '😭 라면이 많이 퍼졌어요!',
      description: `면을 ${cookedSeconds}초나 끓였어요. 면발이 많이 불어서 탱탱함이 거의 없어졌어요!`,
      emoji: '💦',
      resultType: 'puffy',
      cookedTime: cookedSeconds,
      extraTime: cookedSeconds - 180,
    };
  }

  return {
    success: false,
    message: '😭 라면이 심하게 불었어요!',
    description: `면을 ${cookedSeconds}초나 끓였어요. 너무 오래 끓여서 면발이 흐물흐물해졌어요!`,
    emoji: '💦',
    resultType: 'severely_overcooked',
    cookedTime: cookedSeconds,
    extraTime: cookedSeconds - 180,
  };
};

const evaluateRamen = (sequence) => {
  // 아무것도 안 했을 때
  if (sequence.length === 0) {
    return {
      success: false,
      message: '🍜 라면을 만들지 않았어요!',
      description: '블록을 조립해서 라면을 끓여보세요!',
      emoji: '🤔',
      resultType: 'empty'
    };
  }

  const stats = getRamenCookingStats(sequence);

  // 필수 재료 조합 체크. 빠진 재료가 여러 개일 때 단일 결과가 먼저 걸려
  // 실제 조합과 다른 메시지가 나가지 않도록 묶어서 판정한다.
  const missingWater = !stats.hasWater;
  const missingNoodle = !stats.hasNoodle;
  const missingSoup = !stats.hasSoup;
  const waterIsBoiled = stats.heatedWaterSeconds >= RAMEN_BOIL_SECONDS;
  const waterWasHeated = stats.hasFire || stats.heatedWaterSeconds > 0 || stats.cookedSeconds > 0;

  if (stats.waterEvaporated) {
    const burnedNoodle = stats.evaporationNoodleBurned || stats.dryNoodleBurned;
    const burnedSoup = stats.evaporationSoupBurned || stats.drySoupBurned;

    if (burnedNoodle && burnedSoup) {
      return {
        success: false,
        message: '🔥 물이 다 날아가 라면이 탔어요!',
        description: '불을 켠 채 10분 이상 끓여서 물이 모두 날아갔어요. 면과 스프가 냄비에 눌어붙어 타버렸어요!',
        emoji: '💥',
        resultType: 'evaporated_burned_ramen'
      };
    }

    if (burnedNoodle) {
      return {
        success: false,
        message: '🔥 물이 다 날아가 면이 탔어요!',
        description: '불을 켠 채 10분 이상 끓여서 물이 모두 날아갔어요. 스프는 없지만 면이 냄비에 눌어붙어 타버렸어요!',
        emoji: '💥',
        resultType: 'evaporated_burned_noodle'
      };
    }

    if (burnedSoup) {
      return {
        success: false,
        message: '🔥 물이 다 날아가 스프가 탔어요!',
        description: '불을 켠 채 10분 이상 끓여서 물이 모두 날아갔어요. 스프가 냄비 바닥에 눌어붙어 타버렸어요!',
        emoji: '💥',
        resultType: 'evaporated_burned_soup'
      };
    }

    return {
      success: false,
      message: '🔥 물이 다 날아가 빈 냄비가 탔어요!',
      description: '불을 켠 채 10분 이상 끓여서 물이 모두 날아갔어요. 냄비가 비어 탄 상태가 됐어요!',
      emoji: '💥',
      resultType: 'evaporated_empty_pot'
    };
  }

  if (stats.fireBeforeWater) {
    if (stats.hasWater && stats.hasNoodle && stats.hasSoup) {
      if (stats.dryNoodleBurned && stats.drySoupBurned) {
        return {
          success: false,
          message: '🔥 탄 면과 탄 스프 맛 라면이에요!',
          description: '물을 넣기 전에 면과 스프가 뜨거운 냄비에서 타버렸어요. 나중에 물을 넣어도 탄맛이 남아요!',
          emoji: '💥',
          resultType: 'burnt_noodle_soup_taste_ramen'
        };
      }

      if (stats.drySoupBurned) {
        return {
          success: false,
          message: '🔥 스프가 타서 탄맛 라면이에요!',
          description: '스프가 먼저 뜨거운 냄비에서 타버렸어요. 면은 나중에 넣어도 국물에 탄맛이 나요!',
          emoji: '💥',
          resultType: 'burnt_soup_taste_ramen'
        };
      }

      if (stats.dryNoodleBurned) {
        return {
          success: false,
          message: '🔥 면이 타서 탄맛 라면이에요!',
          description: '면이 물 없이 뜨거운 냄비에서 타버렸어요. 나중에 물과 스프를 넣어도 탄맛이 남아요!',
          emoji: '💥',
          resultType: 'burnt_noodle_taste_ramen'
        };
      }

      return {
        success: false,
        message: '🔥 냄비가 타서 탄맛 라면이에요!',
        description: '물을 넣기 전에 빈 냄비를 먼저 달궜어요. 나중에 재료를 넣어도 탄 냄비 맛이 남아요!',
        emoji: '💥',
        resultType: 'burnt_taste_ramen'
      };
    }

    if (stats.hasWater && stats.hasSoup && !stats.hasNoodle && stats.drySoupBurned) {
      return {
        success: false,
        message: '🔥 탄 스프물이에요!',
        description: '스프가 물 없이 먼저 타버렸어요. 물을 나중에 넣어도 탄 스프물이 돼요!',
        emoji: '💥',
        resultType: 'burnt_soup_water'
      };
    }

    if (stats.hasWater && stats.hasNoodle && !stats.hasSoup && stats.dryNoodleBurned) {
      return {
        success: false,
        message: '🔥 탄 면이 들어간 맹물이에요!',
        description: '면이 물 없이 먼저 타버렸고 스프도 없어요. 물을 넣어도 맛있는 라면이 되지 않아요!',
        emoji: '💥',
        resultType: 'burnt_noodle_water'
      };
    }

    if (stats.dryNoodleBurned && stats.drySoupBurned) {
      return {
        success: false,
        message: '🔥 면과 스프가 탔어요!',
        description: '물을 넣기 전에 면과 스프를 뜨거운 냄비에 넣어서 둘 다 타버렸어요!',
        emoji: '💥',
        resultType: 'burned_noodle_soup'
      };
    }

    if (stats.dryNoodleBurned) {
      return {
        success: false,
        message: '🔥 면이 탔어요!',
        description: '물을 넣기 전에 면을 뜨거운 냄비에 넣어서 면이 타버렸어요!',
        emoji: '💥',
        resultType: 'burned_noodle'
      };
    }

    if (stats.drySoupBurned) {
      return {
        success: false,
        message: '🔥 스프가 탔어요!',
        description: '물을 넣기 전에 스프를 뜨거운 냄비에 넣어서 스프가 타버렸어요!',
        emoji: '💥',
        resultType: 'burned_soup'
      };
    }

    return {
      success: false,
      message: '🔥 빈 냄비가 탔어요!',
      description: '물을 넣기 전에 불을 켜서 빈 냄비가 타버렸어요!',
      emoji: '💥',
      resultType: 'burned_empty_pot'
    };
  }

  if (missingWater && missingNoodle && missingSoup) {
    return {
      success: false,
      message: '🍜 재료를 넣지 않았어요!',
      description: '물, 면, 스프가 모두 빠졌어요. 라면을 만들려면 먼저 필요한 재료를 넣어야 해요!',
      emoji: '🤔',
      resultType: 'missing_all_ingredients'
    };
  }

  if (missingWater && missingNoodle) {
    return {
      success: false,
      message: '🧂 스프만 있어요!',
      description: '스프만으로는 라면을 만들 수 없어요. 물을 받고 면도 넣어야 해요!',
      emoji: '😰',
      resultType: 'soup_only'
    };
  }

  if (missingWater && missingSoup) {
    return {
      success: false,
      message: '🍜 면만 있어요!',
      description: '면만 넣어서는 라면이 완성되지 않아요. 물을 받고 스프도 넣어야 해요!',
      emoji: '😰',
      resultType: 'noodle_only'
    };
  }

  if (missingNoodle && missingSoup) {
    if (stats.waterReduced) {
      return {
        success: false,
        message: '💧 물이 많이 졸았어요!',
        description: '불을 켠 채 5분 넘게 끓여서 물이 많이 줄었어요. 면과 스프가 없어서 라면도 만들 수 없어요!',
        emoji: '😰',
        resultType: 'reduced_water_only'
      };
    }

    if (waterIsBoiled) {
      return {
        success: false,
        message: '♨️ 끓는 물만 있어요!',
        description: '물은 끓었지만 면과 스프가 없어요. 라면을 만들려면 면과 스프를 넣어야 해요!',
        emoji: '😅',
        resultType: 'boiled_water_only'
      };
    }

    if (waterWasHeated) {
      return {
        success: false,
        message: '🔥 물을 데우기만 했어요!',
        description: '불은 켰지만 면과 스프가 없어요. 물이 끓으면 면과 스프를 넣어야 해요!',
        emoji: '😅',
        resultType: 'heating_water_only'
      };
    }

    return {
      success: false,
      message: '💧 물만 있어요!',
      description: '물만 있으면 라면이 아니에요. 면과 스프를 넣어야 해요!',
      emoji: '😅',
      resultType: 'water_only'
    };
  }

  if (missingWater) {
    return {
      success: false,
      message: '💧 물이 없어요!',
      description: '면과 스프는 있지만 물이 없어요. 물 없이는 라면을 끓일 수 없어요!',
      emoji: '😰',
      resultType: 'no_water'
    };
  }

  if (missingNoodle) {
    if (stats.waterReduced) {
      return {
        success: false,
        message: '🥤 스프물이 너무 졸았어요!',
        description: '불을 켠 채 5분 넘게 끓여서 스프물이 많이 졸았어요. 면도 없어서 짜고 진한 스프물만 남았어요!',
        emoji: '😵',
        resultType: 'reduced_soup_water'
      };
    }

    if (waterIsBoiled) {
      return {
        success: false,
        message: '🥤 뜨거운 스프물이에요!',
        description: '물은 끓고 스프도 들어갔지만 면이 없어요. 면을 넣어야 라면이 돼요!',
        emoji: '😅',
        resultType: 'hot_soup_water'
      };
    }

    return {
      success: false,
      message: '🥤 스프물이에요!',
      description: '물과 스프는 있지만 면이 없어요. 면이 없으면 라면이 아니라 스프물이에요!',
      emoji: '😅',
      resultType: 'soup_water'
    };
  }

  if (missingSoup) {
    if (stats.waterReduced) {
      return {
        success: false,
        message: '😵 맹물 면이 너무 졸았어요!',
        description: '불을 켠 채 5분 넘게 끓여서 물이 많이 줄었어요. 스프도 없어서 맛있는 라면이 되지 않았어요!',
        emoji: '😵',
        resultType: 'reduced_noodle_water'
      };
    }

    if (!stats.hasFire) {
      return {
        success: false,
        message: '🥶 차가운 맹물 면이에요!',
        description: '불을 켜지 않았고 스프도 넣지 않았어요. 차가운 물에 면만 담겨 있어요!',
        emoji: '🙁',
        resultType: 'cold_no_soup'
      };
    }

    if (stats.cookedSeconds <= 0) {
      return {
        success: false,
        message: '😐 맹물에 덜 익은 면이에요!',
        description: '스프도 없고 면도 아직 제대로 익지 않았어요!',
        emoji: '🙁',
        resultType: 'raw_no_soup'
      };
    }

    return {
      success: false,
      message: '😐 스프가 없어요!',
      description: '면은 익었지만 스프를 넣지 않아서 라면 맛이 나지 않아요!',
      emoji: '🙁',
      resultType: 'no_soup'
    };
  }

  if (!stats.hasFire) {
    return {
      success: false,
      message: '❄️ 차가운 라면!',
      description: '불을 켜지 않아서 차가운 물에 그냥 면과 스프를 담갔어요!',
      emoji: '🥶',
      resultType: 'cold'
    };
  }

  if (stats.noodleAddedAfterFireOff) {
    return {
      success: false,
      message: '🍜 면을 너무 늦게 넣었어요!',
      description: '불을 끈 뒤에 면을 넣어서 면이 익지 않았어요. 면은 불이 켜져 있고 물이 끓을 때 넣어야 해요!',
      emoji: '😖',
      resultType: 'noodle_after_fireoff'
    };
  }

  if (stats.waterReduced) {
    return {
      success: false,
      message: '😵 국물이 많이 졸아 짠 라면이에요!',
      description: '불을 켠 채 5분 넘게 끓여서 국물이 많이 줄었어요. 면도 많이 불고 국물이 너무 진해졌어요!',
      emoji: '😵',
      resultType: 'reduced_water_ramen'
    };
  }

  const quality = getRamenCookQuality(stats.cookedSeconds);
  if (!quality.success) {
    return quality;
  }

  if (stats.soupAddedAfterFireOff) {
    return {
      success: false,
      message: '🧂 스프를 끝에 넣었어요!',
      description: '면은 익었지만 불을 끈 뒤 스프를 넣어서 국물 맛이 제대로 배지 않았어요!',
      emoji: '😐',
      resultType: 'soup_after_fireoff'
    };
  }

  if (stats.soupAddedAfterNoodlesCooked || stats.soupCookedSeconds < RAMEN_BOIL_SECONDS) {
    return {
      success: false,
      message: '🧂 스프를 너무 늦게 넣었어요!',
      description: '스프가 충분히 끓지 않아서 면과 국물에 맛이 잘 배지 않았어요!',
      emoji: '😐',
      resultType: 'late_soup'
    };
  }

  if (!stats.hasFireOff || stats.fireOn) {
    return {
      success: false,
      message: '🔥 불을 안 껐어요!',
      description: '라면은 먹을 수 있게 익었지만 마지막에 불을 끄지 않았어요. 안전을 위해 불끄기 블록이 필요해요!',
      emoji: '⚠️',
      resultType: 'fire_not_off'
    };
  }

  return quality;
};

const determineRamenState = (sequence) => {
  const stats = getRamenCookingStats(sequence);

  // 라면 봉지 상태: basic, 물, 끓는물, 조리중, 완성
  if (stats.waterEvaporated || (stats.fireOn && !stats.waterAvailable && (stats.hasNoodle || stats.hasSoup || stats.fireBeforeWater))) {
    return 'burned';
  }

  if (stats.waterReduced) {
    return 'reduced';
  }

  if (stats.hasNoodle) {
    if (stats.cookedSeconds >= 180) {
      return 'cooked'; // 완성된 라면 (3분 이상)
    }
    if (stats.hasWater && stats.hasFire) {
      return stats.heatedWaterSeconds >= RAMEN_BOIL_SECONDS ? 'cooking' : 'heating'; // 물 데우는 중 또는 조리 중
    }
  } else if (stats.hasWater && stats.hasFire) {
    return stats.heatedWaterSeconds >= RAMEN_BOIL_SECONDS ? 'boiling' : 'heating'; // 물 데우는 중 또는 끓는 물
  } else if (stats.hasWater) {
    return 'water'; // 물만
  }

  return 'package'; // 라면 봉지
};

const getRamenBlockSummaryText = (block) => {
  if (block.id === 'waitBoil') {
    return formatDurationText(block.seconds || 30);
  }
  const textMap = {
    water: '물',
    fire: '불',
    noodle: '면',
    soup: '스프',
    fireOff: '불끄기',
  };
  return textMap[block.id] || RAMEN_BLOCKS[block.id]?.text || block.text || block.id;
};

const getRamenProcedureSummary = (sequence) => {
  const sequenceLine = sequence.length === 0
    ? '없음'
    : sequence.map((block) => getRamenBlockSummaryText(block)).join(' → ');

  return {
    sequenceLine,
  };
};

function RamenDisplay({ sequence, isAnimating }) {
  const state = determineRamenState(sequence);

  const getDisplayContent = () => {
    let imagePath = '';

    switch(state) {
      case 'package':
        imagePath = './images-game-pixel-final/ramen/emptypot.png';
        return {
          imagePath,
          title: '라면 봉지',
          bgColor: 'bg-orange-100',
          borderColor: 'border-orange-300'
        };
      case 'water':
        imagePath = './images-game-pixel-final/ramen/coldwaterfilledpot.png';
        return {
          imagePath,
          title: '냄비에 물',
          bgColor: 'bg-blue-100',
          borderColor: 'border-blue-300'
        };
      case 'heating':
        imagePath = './images-game-pixel-final/ramen/coldwaterfilledpot.png';
        return {
          imagePath,
          title: '물이 데워지는 중',
          bgColor: 'bg-yellow-100',
          borderColor: 'border-yellow-300'
        };
      case 'boiling':
        imagePath = './images-game-pixel-final/ramen/boilingwaterfilledpot.png';
        return {
          imagePath,
          title: '끓는 물',
          bgColor: 'bg-red-100',
          borderColor: 'border-red-300'
        };
      case 'cooking':
        imagePath = './images-game-pixel-final/ramen/cookingpot.png';
        return {
          imagePath,
          title: '조리 중',
          bgColor: 'bg-yellow-100',
          borderColor: 'border-yellow-300'
        };
      case 'cooked':
        imagePath = './images-game-pixel-final/ramen/finishedramen.png';
        return {
          imagePath,
          title: '완성!',
          bgColor: 'bg-green-100',
          borderColor: 'border-green-300'
        };
      case 'reduced':
        imagePath = './images-game-pixel-final/ramen/reduced-ramen-bowl.png';
        return {
          imagePath,
          title: '많이 졸아듦',
          bgColor: 'bg-orange-100',
          borderColor: 'border-orange-400'
        };
      case 'burned':
        imagePath = './images-game-pixel-final/ramen/burned-noodle-soup-pot.png';
        return {
          imagePath,
          title: '탔어요',
          bgColor: 'bg-red-100',
          borderColor: 'border-red-400'
        };
      default:
        imagePath = './images-game-pixel-final/ramen/emptypot.png';
        return {
          imagePath,
          title: '라면 봉지',
          bgColor: 'bg-orange-100',
          borderColor: 'border-orange-300'
        };
    }
  };

  const content = getDisplayContent();

  return html`
    <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-6 border-2 border-orange-200 flex flex-col items-center w-full h-full">
      <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-3 mb-4 w-full">
        <p className="text-base font-bold text-orange-700 text-center">
          🔥 물 30초 → 🍜 면 3분
          <span className="block text-xs font-semibold text-orange-600 mt-1">5분 초과: 졸아듦 · 10분 이상: 탐</span>
        </p>
      </div>
      <div className=${`w-full flex-grow flex flex-col items-center justify-center rounded-xl p-8 ${content.bgColor} border-4 ${content.borderColor}`}>
        <img src=${content.imagePath} alt=${content.title} className="w-full h-full object-contain" />
      </div>
      ${isAnimating
        ? html`<p className="text-xs text-orange-500 mt-4 animate-pulse">조리 중... 🔥</p>`
        : null}
    </div>
  `;
}

function RamenResultModal({ isOpen, onClose, result, animationFrames, isDebugMode }) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!isOpen || !animationFrames || animationFrames.length === 0) return;
    setFrameIndex(0);
    if (animationFrames.length <= 1) return;

    let idx = 1;
    const timer = setInterval(() => {
      setFrameIndex(idx);
      idx += 1;
      if (idx >= animationFrames.length) {
        clearInterval(timer);
      }
    }, 800);
    return () => clearInterval(timer);
  }, [isOpen, animationFrames]);

  if (!isOpen || !result) return null;

  const currentSequence = animationFrames && animationFrames[frameIndex] ? animationFrames[frameIndex] : [];
  const currentState = determineRamenState(currentSequence);

  // Get image for current animation frame
  const getCurrentFrameImage = () => {
    switch(currentState) {
      case 'package': return './images-game-pixel-final/ramen/emptypot.png';
      case 'water': return './images-game-pixel-final/ramen/coldwaterfilledpot.png';
      case 'heating': return './images-game-pixel-final/ramen/coldwaterfilledpot.png';
      case 'boiling': return './images-game-pixel-final/ramen/boilingwaterfilledpot.png';
      case 'cooking': return './images-game-pixel-final/ramen/cookingpot.png';
      case 'cooked': return './images-game-pixel-final/ramen/finishedramen.png';
      case 'reduced': return './images-game-pixel-final/ramen/reduced-ramen-bowl.png';
      case 'burned': return './images-game-pixel-final/ramen/burned-noodle-soup-pot.png';
      default: return './images-game-pixel-final/ramen/emptypot.png';
    }
  };

  const isAnimating = frameIndex < (animationFrames?.length || 0) - 1;
  const finalImage = getResultImage(result.resultType);
  const displayImage = isAnimating ? getCurrentFrameImage() : finalImage;
  const finalSequence = animationFrames && animationFrames.length > 0
    ? animationFrames[animationFrames.length - 1]
    : currentSequence;
  const procedureSummary = getRamenProcedureSummary(finalSequence);

  return html`
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className=${`bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto border-4 ${result.success ? 'border-green-500' : 'border-red-500'}`}>
        <div className="text-center mb-6">
          <div className="relative">
            <img
              src=${displayImage}
              alt=${result.message}
              className="w-64 h-64 object-contain mx-auto mb-4"
            />
            ${isAnimating
              ? html`<div className="absolute top-2 right-2 bg-orange-500 text-white px-3 py-1 rounded-full text-sm font-bold animate-pulse">
                  조리 중... 🔥
                </div>`
              : null}
          </div>
          <h2 className=${`text-3xl font-bold mb-4 ${result.success ? 'text-green-700' : 'text-red-700'}`}>
            ${result.message}
          </h2>
          <p className="text-xl text-gray-700 leading-relaxed">
            ${result.description}
          </p>
        </div>
        <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-4 mb-6 text-left">
          <h3 className="text-base font-bold text-slate-800 mb-2">내 절차 요약</h3>
          <p className="text-sm text-slate-700 leading-relaxed">${procedureSummary.sequenceLine}</p>
        </div>
        ${result.success
          ? html`
              <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6 mb-6 text-center">
                <p className="text-green-700 text-lg font-semibold">🎊 절차를 완벽하게 이해했어요! 👍</p>
              </div>
            `
          : html`
              <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6 mb-6 text-center">
                <p className="text-red-700 text-base">💡 힌트: 올바른 순서를 생각해보세요!</p>
              </div>
            `}
        <button
          onClick=${onClose}
          className=${`w-full ${result.success ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'} text-white px-6 py-3 rounded-lg font-bold text-lg shadow-lg hover:shadow-xl transition-all`}
        >
          ${isDebugMode && !result.success ? '🔧 코드 수정하기' : '다시 도전하기'}
        </button>
      </div>
    </div>
  `;
}

function RamenIntroScreen({ onStartGame, onBack }) {
  const steamBubbles = Array.from({ length: 30 }).map((_, i) => {
    const style = {
      left: `${40 + Math.random() * 20}%`,
      bottom: '35%',
      width: `${Math.random() * 8 + 4}px`,
      height: `${Math.random() * 8 + 4}px`,
      animationDelay: `${Math.random() * 3}s`,
      animationDuration: `${Math.random() * 2 + 2}s`,
    };
    return { style, key: i };
  });

  return html`
    <div className="min-h-screen bg-gradient-to-br from-orange-200 via-red-100 to-yellow-200 flex items-center justify-center relative overflow-hidden p-4">
      
      <!-- 뒤로 가기 버튼 추가 -->
      <div className="absolute top-4 left-4 z-50">
        <button
          onClick=${onBack}
          className="bg-white/80 hover:bg-white text-orange-800 px-4 py-2 rounded-lg font-bold shadow-md transition-all border border-orange-300 backdrop-blur-sm"
        >
          ← 메뉴로 돌아가기
        </button>
      </div>

      <div className="absolute inset-0">
        ${steamBubbles.map(
          ({ style, key }) => html`
            <div
              key=${key}
              className="absolute bg-white/40 rounded-full animate-steam-rise blur-sm"
              style=${style}
            />
          `,
        )}
      </div>

      <div className="relative z-10 text-center bg-white/90 backdrop-blur-md rounded-3xl shadow-2xl p-8 sm:p-12 max-w-2xl mx-auto border-4 border-orange-300">
        <div className="text-7xl sm:text-9xl mb-4 sm:mb-6 animate-bounce">🍜</div>
        <h1 className="text-4xl sm:text-6xl font-bold mb-3 sm:mb-4 text-orange-800">라면 끓이기</h1>
        <h2 className="text-2xl sm:text-4xl font-bold mb-4 sm:mb-6 text-red-700">마스터!</h2>
        <p className="text-lg sm:text-xl text-gray-700 mb-3 sm:mb-4 leading-relaxed">
          배가 고픈데 집에는 라면밖에 없어요!
        </p>
        <p className="text-lg sm:text-xl text-gray-700 mb-3 sm:mb-4 leading-relaxed">
          맛있는 라면을 끓이려면<br />
          <strong className="text-orange-700">올바른 순서</strong>로 요리해야 해요!
        </p>
        <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-3 sm:p-4 mb-6 sm:mb-8">
          <p className="text-base sm:text-lg text-gray-800 mb-1">
            🔥 <strong className="text-orange-700">물은 불을 켠 뒤 30초 기다리면 끓어요.</strong>
          </p>
          <p className="text-base sm:text-lg text-gray-800">
            ⏱️ <strong className="text-orange-700">이 라면은 3분 동안 끓여야 해요!</strong>
          </p>
          <p className="text-sm sm:text-base text-gray-700 mt-2">
            5분을 넘기면 물이 많이 졸고, 10분 이상이면 물이 날아가 타버려요.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick=${() => onStartGame('normal')}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xl sm:text-2xl font-bold px-8 sm:px-10 py-4 sm:py-5 rounded-2xl shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-300 border-4 border-blue-300"
          >
            📝 일반 모드
          </button>
          <button
            onClick=${() => onStartGame('debug')}
            className="bg-gradient-to-r from-purple-500 to-purple-600 text-white text-xl sm:text-2xl font-bold px-8 sm:px-10 py-4 sm:py-5 rounded-2xl shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-300 border-4 border-purple-300"
          >
            🔧 오류수정 모드
          </button>
        </div>
      </div>

      <style>${`
        @keyframes steam-rise {
          0% {
            transform: translateY(0) scale(1);
            opacity: 0;
          }
          50% {
            opacity: 0.6;
          }
          100% {
            transform: translateY(-200px) scale(1.5);
            opacity: 0;
          }
        }
        .animate-steam-rise {
          animation: steam-rise linear infinite;
        }
      `}</style>
    </div>
  `;
}

// 라면 오류 패턴 생성 함수
const generateRamenBuggySequence = () => {
  const patterns = [
    // 패턴 1: 불을 먼저 켜고 물을 나중에
    [
      { ...RAMEN_BLOCKS.fire },
      { ...RAMEN_BLOCKS.water },
      { ...RAMEN_BLOCKS.waitBoil, seconds: 60, text: '1분 기다리기' },
      { ...RAMEN_BLOCKS.noodle },
      { ...RAMEN_BLOCKS.soup },
      { ...RAMEN_BLOCKS.waitBoil, seconds: 180, text: '3분 기다리기' },
      { ...RAMEN_BLOCKS.fireOff },
    ],
    // 패턴 2: 스프 없이
    [
      { ...RAMEN_BLOCKS.water },
      { ...RAMEN_BLOCKS.fire },
      { ...RAMEN_BLOCKS.waitBoil, seconds: 30, text: '30초 기다리기' },
      { ...RAMEN_BLOCKS.noodle },
      { ...RAMEN_BLOCKS.waitBoil, seconds: 180, text: '3분 기다리기' },
      { ...RAMEN_BLOCKS.fireOff },
    ],
    // 패턴 3: 면을 너무 오래 끓임
    [
      { ...RAMEN_BLOCKS.water },
      { ...RAMEN_BLOCKS.fire },
      { ...RAMEN_BLOCKS.noodle },
      { ...RAMEN_BLOCKS.soup },
      { ...RAMEN_BLOCKS.waitBoil, seconds: 240, text: '4분 기다리기' },
      { ...RAMEN_BLOCKS.fireOff },
    ],
    // 패턴 4: 불을 너무 일찍 끔
    [
      { ...RAMEN_BLOCKS.water },
      { ...RAMEN_BLOCKS.fire },
      { ...RAMEN_BLOCKS.waitBoil, seconds: 30, text: '30초 기다리기' },
      { ...RAMEN_BLOCKS.noodle },
      { ...RAMEN_BLOCKS.fireOff },
      { ...RAMEN_BLOCKS.soup },
      { ...RAMEN_BLOCKS.waitBoil, seconds: 180, text: '3분 기다리기' },
    ],
    // 패턴 5: 면이 설익음
    [
      { ...RAMEN_BLOCKS.water },
      { ...RAMEN_BLOCKS.fire },
      { ...RAMEN_BLOCKS.noodle },
      { ...RAMEN_BLOCKS.soup },
      { ...RAMEN_BLOCKS.waitBoil, seconds: 60, text: '1분 기다리기' },
      { ...RAMEN_BLOCKS.fireOff },
    ],
  ];

  const randomPattern = patterns[Math.floor(Math.random() * patterns.length)];
  return randomPattern.map(block => ({ ...block }));
};

function RamenGame({ onBack }) {
  const [showIntro, setShowIntro] = useState(true);
  const [gameMode, setGameMode] = useState('normal');
  const [palette, setPalette] = useState(() => [
    { ...RAMEN_BLOCKS.water },
    { ...RAMEN_BLOCKS.fire },
    { ...RAMEN_BLOCKS.waitBoil, seconds: 30, text: '30초 기다리기' },
    { ...RAMEN_BLOCKS.waitBoil, seconds: 30, text: '30초 기다리기' },
    { ...RAMEN_BLOCKS.noodle },
    { ...RAMEN_BLOCKS.soup },
    { ...RAMEN_BLOCKS.fireOff },
  ]);
  const [sequence, setSequence] = useState([]);
  const [displaySequence, setDisplaySequence] = useState([]);
  const [animationFrames, setAnimationFrames] = useState([]);
  const [savedAnimationFrames, setSavedAnimationFrames] = useState([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [result, setResult] = useState(null);
  const [timeModalOpen, setTimeModalOpen] = useState(false);
  const [timeModalTarget, setTimeModalTarget] = useState(null); // { type: 'palette' | 'sequence', index: number, currentSeconds: number }

  useEffect(() => {
    if (animationFrames.length === 0) return;
    if (animationFrames.length === 1) {
      setDisplaySequence(animationFrames[0]);
      setAnimationFrames([]);
      setIsAnimating(false);
      return;
    }
    setIsAnimating(true);
    let frameIndex = 0;
    setDisplaySequence(animationFrames[frameIndex]);
    frameIndex += 1;
    const timer = setInterval(() => {
      if (frameIndex >= animationFrames.length) {
        clearInterval(timer);
        setIsAnimating(false);
        setAnimationFrames([]);
        return;
      }
      setDisplaySequence(animationFrames[frameIndex]);
      frameIndex += 1;
    }, 800);
    return () => clearInterval(timer);
  }, [animationFrames]);

  const handlePaletteDragStart = (e, blockId) => {
    e.dataTransfer.setData('blockId', blockId);
    e.dataTransfer.setData('source', 'palette');
  };

  const handleSequenceDragStart = (e, blockId, index) => {
    e.dataTransfer.setData('blockId', blockId);
    e.dataTransfer.setData('source', 'sequence');
    e.dataTransfer.setData('index', index.toString());
  };

  const handlePaletteDrop = (e) => {
    e.preventDefault();
    const blockId = e.dataTransfer.getData('blockId');
    const source = e.dataTransfer.getData('source');

    if (source === 'sequence') {
      const sourceIndex = parseInt(e.dataTransfer.getData('index'));
      const block = sequence[sourceIndex];
      setSequence((prev) => prev.filter((_, i) => i !== sourceIndex));
      setPalette((prev) => [...prev, { ...block }]);
    }
  };

  const handleSequenceDrop = (blockId, targetIndex) => {
    const source = event.dataTransfer.getData('source');

    if (source === 'palette') {
      const block = palette.find((b) => b.id === blockId);
      if (!block) return;

      setPalette((prev) => {
        const index = prev.findIndex((b) => b.id === blockId);
        if (index === -1) return prev;
        return [...prev.slice(0, index), ...prev.slice(index + 1)];
      });
      setSequence((prev) => {
        const newSeq = [...prev];
        newSeq.splice(targetIndex, 0, block);
        return newSeq;
      });
    } else if (source === 'sequence') {
      const sourceIndex = parseInt(event.dataTransfer.getData('index'));
      if (sourceIndex === targetIndex) return;

      setSequence((prev) => {
        const newSeq = [...prev];
        const [block] = newSeq.splice(sourceIndex, 1);
        const adjustedTarget = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
        newSeq.splice(adjustedTarget, 0, block);
        return newSeq;
      });
    }
  };

  const handleQuickAdd = (blockId) => {
    const block = palette.find((b) => b.id === blockId);
    if (!block) return;
    setPalette((prev) => {
      const index = prev.findIndex((b) => b.id === blockId);
      if (index === -1) return prev;
      return [...prev.slice(0, index), ...prev.slice(index + 1)];
    });
    setSequence((prev) => [...prev, block]);
  };

  const handleQuickRemove = (index) => {
    const block = sequence[index];
    setSequence((prev) => prev.filter((_, i) => i !== index));
    setPalette((prev) => [...prev, { ...block }]);
  };

  // 시간 변경 핸들러 (팔레트에 있는 블록) - 모달 열기
  const handlePaletteTimeChange = (blockIndex) => {
    const block = palette[blockIndex];
    if (block.id === 'waitBoil') {
      setTimeModalTarget({
        type: 'palette',
        index: blockIndex,
        currentSeconds: block.seconds || 30
      });
      setTimeModalOpen(true);
    }
  };

  // 시간 변경 핸들러 (시퀀스에 있는 블록) - 모달 열기
  const handleSequenceTimeChange = (blockIndex) => {
    const block = sequence[blockIndex];
    if (block.id === 'waitBoil') {
      setTimeModalTarget({
        type: 'sequence',
        index: blockIndex,
        currentSeconds: block.seconds || 30
      });
      setTimeModalOpen(true);
    }
  };

  // 시간 선택 완료
  const handleTimeSelect = (selectedSeconds) => {
    if (!timeModalTarget) return;

    const timeText = formatTimeText(selectedSeconds);

    if (timeModalTarget.type === 'palette') {
      setPalette((prev) => {
        const newPalette = [...prev];
        const block = newPalette[timeModalTarget.index];
        newPalette[timeModalTarget.index] = { ...block, seconds: selectedSeconds, text: timeText };
        return newPalette;
      });
    } else if (timeModalTarget.type === 'sequence') {
      setSequence((prev) => {
        const newSequence = [...prev];
        const block = newSequence[timeModalTarget.index];
        newSequence[timeModalTarget.index] = { ...block, seconds: selectedSeconds, text: timeText };
        return newSequence;
      });
    }

    setTimeModalOpen(false);
    setTimeModalTarget(null);
  };

  const handleExecute = () => {
    const frames = (() => {
      const cookingIds = ['water', 'fire', 'waitBoil', 'noodle', 'soup', 'fireOff'];
      const snapshots = [[]];
      const current = [];
      sequence.forEach((block) => {
        if (cookingIds.includes(block.id)) {
          current.push(block);
          snapshots.push([...current]);
        }
      });
      return snapshots;
    })();
    setDisplaySequence([]);
    setAnimationFrames(frames);
    setSavedAnimationFrames(frames);

    const evaluation = evaluateRamen(sequence);
    setResult(evaluation);
  };

  const handleReset = () => {
    const newPalette = [
      { ...RAMEN_BLOCKS.water },
      { ...RAMEN_BLOCKS.fire },
      { ...RAMEN_BLOCKS.waitBoil, seconds: 30, text: '30초 기다리기' },
      { ...RAMEN_BLOCKS.waitBoil, seconds: 30, text: '30초 기다리기' },
      { ...RAMEN_BLOCKS.noodle },
      { ...RAMEN_BLOCKS.soup },
      { ...RAMEN_BLOCKS.fireOff },
    ];
    setPalette(newPalette);
    setSequence([]);
    setDisplaySequence([]);
    setAnimationFrames([]);
    setSavedAnimationFrames([]);
    setIsAnimating(false);
    setResult(null);
  };

  const handleCloseResult = () => {
    setResult(null);
  };

  const handleResultModalClose = () => {
    if (gameMode === 'debug') {
      // 오류수정 모드: 모달만 닫고 블록 유지
      setResult(null);
    } else {
      // 일반 모드: 완전 초기화
      handleReset();
    }
  };

  const handleStartGame = (mode) => {
    setGameMode(mode);
    setShowIntro(false);

    if (mode === 'debug') {
      // 인트로를 먼저 닫고, 약간의 딜레이 후 디버그 모드 초기화
      setTimeout(() => {
        const buggySeq = generateRamenBuggySequence();
        setSequence(buggySeq);

        // 팔레트에서 사용된 블록 제거
        const usedBlockIds = buggySeq.map(b => b.id);
        setPalette(prev => {
          let remaining = [...prev];
          usedBlockIds.forEach(id => {
            const idx = remaining.findIndex(b => b.id === id);
            if (idx !== -1) {
              remaining.splice(idx, 1);
            }
          });
          return remaining;
        });

        // 조립된 블록을 보여주고 나서 결과 실행
        setTimeout(() => {
          // 오류수정 모드: 즉시 결과 실행해서 보여주기
          const frames = (() => {
            const cookingIds = ['water', 'fire', 'waitBoil', 'noodle', 'soup', 'fireOff'];
            const snapshots = [[]];
            const current = [];
            buggySeq.forEach((block) => {
              if (cookingIds.includes(block.id)) {
                current.push(block);
                snapshots.push([...current]);
              }
            });
            return snapshots;
          })();

          setSavedAnimationFrames(frames);
          const evaluation = evaluateRamen(buggySeq);
          setResult(evaluation);
        }, 500);
      }, 100);
    }
  };

  if (showIntro) {
    return html`<${RamenIntroScreen} onStartGame=${handleStartGame} onBack=${onBack} />`;
  }

  return html`
    <div className="min-h-screen bg-gradient-to-br from-orange-100 via-yellow-50 to-red-100 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 flex justify-between items-center">
          <button
            onClick=${onBack}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg font-bold shadow-lg hover:bg-gray-700 transition-all"
          >
            ← 메뉴로 돌아가기
          </button>
          <h1 className="text-4xl font-bold text-center text-orange-800">🍜 라면 끓이기 마스터!</h1>
          <div className="w-32"></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-3">
            <${BlockPalette}
              blocks=${palette}
              onDragStart=${handlePaletteDragStart}
              onDrop=${handlePaletteDrop}
              onQuickAdd=${handleQuickAdd}
              onTimeChange=${handlePaletteTimeChange}
            />
          </div>
          <div className="lg:col-span-5">
            <${ExecutionSequence}
              blocks=${sequence}
              onDragStart=${handleSequenceDragStart}
              onDrop=${handleSequenceDrop}
              onExecute=${handleExecute}
              onReset=${handleReset}
              onQuickRemove=${handleQuickRemove}
              onTimeChange=${handleSequenceTimeChange}
              executeLabel="라면 끓이기! 🍜"
              showStartBlock=${true}
              startBlockText="라면 끓이기 버튼을 눌렀을 때"
              startBlockColor="orange"
            />
          </div>
          <div className="lg:col-span-4">
            <${RamenDisplay} sequence=${displaySequence} isAnimating=${isAnimating} />
          </div>
        </div>
      </div>

      <${RamenResultModal}
        isOpen=${result !== null}
        onClose=${handleResultModalClose}
        result=${result}
        animationFrames=${savedAnimationFrames}
        isDebugMode=${gameMode === 'debug'}
      />

      <${TimeSelectModal}
        isOpen=${timeModalOpen}
        onClose=${() => { setTimeModalOpen(false); setTimeModalTarget(null); }}
        onSelect=${handleTimeSelect}
        currentSeconds=${timeModalTarget?.currentSeconds || 30}
      />
    </div>
  `;
}

// ==================== 비오는날 등교 게임 ====================

const RAINY_DAY_BLOCKS = {
  socks: { id: 'socks', text: '양말 신기', color: 'bg-cyan-500', isDistraction: false },
  shoes: { id: 'shoes', text: '운동화 신기', color: 'bg-cyan-600', isDistraction: false },
  bag: { id: 'bag', text: '가방 메기', color: 'bg-emerald-500', isDistraction: false },
  raincoat: { id: 'raincoat', text: '비옷 입기', color: 'bg-emerald-600', isDistraction: false },
  tv: { id: 'tv', text: 'TV 보기', color: 'bg-amber-500', isDistraction: true },
  game: { id: 'game', text: '게임하기', color: 'bg-rose-500', isDistraction: true },
};

const RAINY_DAY_ICON_PATHS = {
  socks: 'M7 17l-4 4m14-4l-4 4M7 7l4-4 4 4M7 7v10m10-10v10',
  shoes: 'M4 7a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7zm5 0l-1-4 4 4-3 1zm6 0l1-4-4 4 3 1z',
  bag: 'M12 6.253v11.494m-5.46-3.89l5.46 3.89 5.46-3.89M3.75 9.405L12 15.25l8.25-5.845M3.75 9.405l8.25-5.845L20.25 9.405',
  raincoat: 'M5.636 18.364a9 9 0 010-12.728M18.364 5.636a9 9 0 010 12.728m-12.728 0L12 22l6.364-6.364M12 3v9',
  tv: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  game: 'M14.121 15.536c-1.171 1.952-3.07 1.952-4.242 0-1.172-1.953-1.172-5.119 0-7.072 1.171-1.952 3.07-1.952 4.242 0 1.172 1.953 1.172 5.119 0 7.072z',
};

const RAINY_DAY_INITIAL_PALETTE = Object.values(RAINY_DAY_BLOCKS);

const FEET_STATE_MAP = {
  bare: '',
  socks: 'socks',
  shoes: 'shoes',
  socks_shoes: 'socks_shoes',
  shoes_socks: 'shoes_socks',
};

const BODY_STATE_MAP = {
  bare: '',
  bag: 'backpack',
  raincoat: 'raincoat',
  bag_raincoat: 'backpack_raincoat',
  raincoat_bag: 'raincoat_backpack',
};

const FILENAME_MAP = {
  basic: '1.basic.png',
  socks: '2.socks.png',
  shoes: '3.shoes.png',
  socks_shoes: '4.socksshoes.png',
  shoes_socks: '5.shoessocks.png',
  backpack: '6.backpack.png',
  raincoat: '7.raincoat.png',
  backpack_raincoat: '8.backpackraincoat.png',
  raincoat_backpack: '9.raincoatbackpack.png',
  backpack_socks: '10.backpacksocks.png',
  backpack_shoes: '11.backpackshoes.png',
  backpack_socks_shoes: '12.backpacksocksshoes.png',
  backpack_shoes_socks: '13.backpackshoessocks.png',
  raincoat_socks: '14.raincoatsocks.png',
  raincoat_shoes: '15.raincoatshoes.png',
  raincoat_socks_shoes: '16.raincoatsocksshoes.png',
  raincoat_shoes_socks: '17.raincoatshoessocks.png',
  backpack_raincoat_socks: '18.backpackraincoatsocks.png',
  backpack_raincoat_shoes: '19.backpackraincoatshoes.png',
  backpack_raincoat_socks_shoes: '20.backpackraincoatsocksshoes.png',
  backpack_raincoat_shoes_socks: '21.backpackraincoatshoessocks.png',
  raincoat_backpack_socks: '22.raincoatbackpacksocks.png',
  raincoat_backpack_shoes: '23.raincoatbackpackshoes.png',
  raincoat_backpack_shoes_socks: '24.raincoatbackpackshoessocks.png',
  raincoat_backpack_socks_shoes: '25.raincoatbackpacksocksshoes.png',
};

const RAINY_DAY_CHARACTER_OPTIONS = [
  {
    id: 'boy',
    label: '남자아이',
    preview: 'images-game-pixel-final/rainy-day-boy/1.basic.png',
  },
  {
    id: 'girl',
    label: '여자아이',
    preview: 'images-game-pixel-final/rainy-day-girl/1.basic.png',
  },
];

const RAINY_DAY_ASSET_ROOTS = {
  boy: 'images-game-pixel-final/rainy-day-boy',
  girl: 'images-game-pixel-final/rainy-day-girl',
};

const RAINY_DAY_CHARACTER_LABELS = {
  boy: '남자아이',
  girl: '여자아이',
};

const determineCharacterState = (sequence) => {
  const ids = sequence.map((b) => b.id);
  const has = (id) => ids.includes(id);

  const socksIndex = ids.indexOf('socks');
  const shoesIndex = ids.indexOf('shoes');
  const bagIndex = ids.indexOf('bag');
  const raincoatIndex = ids.indexOf('raincoat');

  let feetKey = 'bare';
  if (has('socks') && !has('shoes')) feetKey = 'socks';
  else if (!has('socks') && has('shoes')) feetKey = 'shoes';
  else if (has('socks') && has('shoes')) feetKey = socksIndex < shoesIndex ? 'socks_shoes' : 'shoes_socks';

  let bodyKey = 'bare';
  if (has('bag') && !has('raincoat')) bodyKey = 'bag';
  else if (!has('bag') && has('raincoat')) bodyKey = 'raincoat';
  else if (has('bag') && has('raincoat')) bodyKey = bagIndex < raincoatIndex ? 'bag_raincoat' : 'raincoat_bag';

  return { feetKey, bodyKey };
};

const getImageInfo = (sequence, character = 'boy') => {
  const { feetKey, bodyKey } = determineCharacterState(sequence);
  const imageNameKey = [BODY_STATE_MAP[bodyKey], FEET_STATE_MAP[feetKey]].filter(Boolean).join('_') || 'basic';
  const finalImageName = FILENAME_MAP[imageNameKey] || '1.basic.png';
  const assetRoot = RAINY_DAY_ASSET_ROOTS[character] || RAINY_DAY_ASSET_ROOTS.boy;
  const characterLabel = RAINY_DAY_CHARACTER_LABELS[character] || RAINY_DAY_CHARACTER_LABELS.boy;
  const imageUrl = `${assetRoot}/${finalImageName}`;

  // 영어를 한글로 변환
  const toKorean = (text) => {
    return text
      .replace(/backpack/g, '가방')
      .replace(/raincoat/g, '비옷')
      .replace(/socks/g, '양말')
      .replace(/shoes/g, '운동화');
  };

  const caption = imageNameKey === 'basic' ? '기본' : toKorean(imageNameKey).replace(/_/g, ' + ');
  return { imageUrl, altText: `${characterLabel} 캐릭터 상태: ${caption}`, caption };
};

const evaluateRainyDay = (sequence) => {
  const seqIds = sequence.map((b) => b.id);
  const has = (id) => seqIds.includes(id);

  const socksIndex = seqIds.indexOf('socks');
  const shoesIndex = seqIds.indexOf('shoes');
  const bagIndex = seqIds.indexOf('bag');
  const raincoatIndex = seqIds.indexOf('raincoat');

  const orderIssues = [];

  // 시간 낭비 체크 (TV 시청, 게임하기)
  const distractionBlocks = sequence.filter(b => b.isDistraction);
  if (distractionBlocks.length > 0) {
    const distractionNames = distractionBlocks.map(b => b.text).join(', ');
    if (distractionBlocks.length === 1) {
      orderIssues.push(`${distractionNames}를 해서 등교 시간에 늦었어요! ⏰`);
    } else {
      orderIssues.push(`${distractionNames}를 해서 등교 시간에 많이 늦었어요! ⏰`);
    }
  }

  if (has('shoes') && has('socks') && shoesIndex < socksIndex) {
    orderIssues.push('양말이 흙탕물에 젖어버렸어요. 🧦');
  }
  if (has('raincoat') && has('bag') && raincoatIndex < bagIndex) {
    orderIssues.push('가방이 비에 젖어버렸어요. 🎒');
  }
  if (has('socks') && !has('shoes')) {
    orderIssues.push('신발을 안 신어서 양말이 젖고 지저분해졌어요. 🧦');
  }
  if (!has('raincoat')) {
    orderIssues.push('비옷을 안 입어서 온몸이 다 젖었어요. 🌧️');
  }
  if (!has('socks') && !has('shoes')) {
    orderIssues.push('맨발이라 발이 다 젖었어요. 🦶');
  }
  if (!has('socks') && has('shoes')) {
    orderIssues.push('양말을 안 신어서 신발 속이 끈적하고 불편해요. 🥿');
  }
  if (!has('bag')) {
    orderIssues.push('가방을 안 메서 준비물을 챙기지 못했어요. 🎒');
  }

  return {
    success: orderIssues.length === 0,
    orderIssues,
  };
};

function CharacterDisplay({ sequence, isAnimating, character }) {
  const [imageError, setImageError] = useState(false);
  const { imageUrl, altText } = getImageInfo(sequence, character);

  useEffect(() => setImageError(false), [imageUrl]);

  const ImagePanel = () =>
    html`
      <div className="w-full h-full flex items-center justify-center bg-gray-200 rounded-lg">
        <img
          src=${imageUrl}
          alt=${altText}
          className="object-contain w-full h-full"
          onError=${() => setImageError(true)}
        />
      </div>
    `;

  const ErrorPanel = () =>
    html`
      <div className="w-full h-full flex flex-col items-center justify-center bg-red-100 border-2 border-dashed border-red-400 rounded-lg p-4 text-center">
        <p className="text-red-700 font-bold text-lg mb-2">😭<br />이미지 로딩 실패!</p>
        <p className="text-red-600 text-sm">아래 경로에 파일이 있는지 확인해주세요:</p>
        <code className="text-xs font-mono bg-red-200 text-red-900 px-2 py-1 rounded mt-1 break-all w-full block">${imageUrl}</code>
      </div>
    `;

  return html`
    <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg p-5 border-2 border-blue-200 flex flex-col items-center w-full lg:h-[360px]">
      <div className="w-full max-w-[260px] h-[280px] mx-auto mb-3">
        ${imageError ? html`<${ErrorPanel} />` : html`<${ImagePanel} />`}
      </div>
      <p className="font-semibold text-center text-gray-700 p-2 bg-yellow-100 rounded-lg border border-yellow-300 w-full">
        "오늘은 내가 뭘 입어야 할까?"
      </p>
      ${isAnimating
        ? html`<p className="text-xs text-blue-500 mt-2 animate-pulse">등교 준비 중... 👟</p>`
        : null}
    </div>
  `;
}

function RainyDayResultModal({ isOpen, onClose, result, frameImages, isDebugMode, character }) {
  if (!isOpen || !result) return null;
  const bgColor = result.status === 'success' ? 'bg-green-100 border-green-500' : 'bg-red-100 border-red-500';
  const textColor = result.status === 'success' ? 'text-green-800' : 'text-red-800';
  const timeline = frameImages && frameImages.length ? frameImages : [getImageInfo([], character)];
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setFrameIndex(0);
    if (timeline.length <= 1) return;
    let idx = 1;
    const timer = setInterval(() => {
      setFrameIndex(idx);
      idx += 1;
      if (idx >= timeline.length) {
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, timeline]);

  const currentFrame = timeline[frameIndex] || timeline[0];

  return html`
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className=${`relative bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 border-4 ${bgColor} transform transition-all duration-300 scale-95 animate-modal-pop`}>
        <h2 className=${`text-3xl font-bold mb-4 ${textColor}`}>${result.title}</h2>
        <div className="flex justify-center mb-4">
          <img src=${currentFrame.imageUrl} alt=${currentFrame.altText} className="w-48 h-48 object-contain rounded-2xl border border-white shadow-inner bg-gray-50" />
        </div>
        ${timeline.length > 1
          ? html`
              <div className="mb-5">
                <p className="text-sm font-semibold text-gray-600 mb-2">입은 순서</p>
                <div className="grid grid-cols-5 gap-1.5 max-h-40 overflow-y-auto">
                  ${timeline.map(
                    (frame, idx) => html`
                      <div className="bg-gray-50 rounded-lg p-2 border border-gray-200 flex flex-col items-center text-center text-[10px] text-gray-600 w-[92px]">
                        <div className="w-full h-12 mb-1 flex items-center justify-center">
                          <img src=${frame.imageUrl} alt=${frame.altText} className="max-h-full object-contain" />
                        </div>
                        <span className="font-semibold text-gray-700 text-[11px]">STEP ${idx}</span>
                        <span>${frame.caption}</span>
                      </div>
                    `,
                  )}
                </div>
              </div>
            `
          : null}
        <div className="space-y-3 text-lg text-gray-700">
          ${result.messages.map((msg, index) => html`<p key=${index}>${msg}</p>`)}
        </div>
        <button
          onClick=${onClose}
          className="mt-8 w-full bg-blue-500 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:bg-blue-600 transition-colors"
        >
          ${isDebugMode && result.status === 'failure' ? '🔧 코드 수정하기' : '다시 해보기'}
        </button>
      </div>
      <style>${`
        @keyframes modal-pop {
          0% { transform: scale(0.9); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-modal-pop { animation: modal-pop 0.3s ease-out forwards; }
      `}</style>
    </div>
  `;
}

function IntroScreen({ onStartGame, onBack, character, onCharacterChange }) {
  const raindrops = Array.from({ length: 50 }).map((_, i) => {
    const style = {
      left: `${Math.random() * 100}%`,
      top: '-10%',
      width: `${Math.random() * 2 + 1}px`,
      height: `${Math.random() * 20 + 10}px`,
      animationDelay: `${Math.random() * 5}s`,
      animationDuration: `${Math.random() * 1 + 0.5}s`,
    };
    return html`<div key=${i} className="absolute bg-blue-300 rounded-full animate-fall" style=${style}></div>`;
  });

  return html`
    <div className="relative min-h-screen bg-sky-800 text-white flex flex-col items-center justify-center overflow-hidden p-4">
      
      <!-- 뒤로 가기 버튼 추가 -->
      <div className="absolute top-4 left-4 z-50">
        <button
          onClick=${onBack}
          className="bg-black/40 hover:bg-black/60 text-white px-4 py-2 rounded-lg font-bold shadow-md transition-all border border-sky-400 backdrop-blur-sm"
        >
          ← 메뉴로 돌아가기
        </button>
      </div>

      ${raindrops}
      <div className="relative z-10 text-center bg-black/30 backdrop-blur-sm p-8 md:p-12 rounded-2xl shadow-lg border border-sky-400 max-w-2xl">
        <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold mb-4 animate-fade-in-down">비오는날 등교 성공하기!</h1>
        <p className="text-base sm:text-lg md:text-2xl mb-6 sm:mb-8 animate-fade-in-up">
          창밖에 비가 와요! ☔<br />
          젖지 않고 학교에 갈 준비를 해볼까요?
        </p>
        <div className="mb-6">
          <p className="text-sm sm:text-base font-bold text-sky-100 mb-3">캐릭터 선택</p>
          <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
            ${RAINY_DAY_CHARACTER_OPTIONS.map((option) => {
              const selected = character === option.id;
              return html`
                <button
                  key=${option.id}
                  type="button"
                  onClick=${() => onCharacterChange(option.id)}
                  aria-pressed=${selected}
                  className=${`bg-white/95 text-slate-800 rounded-xl border-4 ${selected ? 'border-yellow-300 shadow-yellow-200' : 'border-white/50'} shadow-lg p-3 flex flex-col items-center gap-2 transition-all hover:scale-105 focus:outline-none focus:ring-4 focus:ring-yellow-200`}
                >
                  <span className="w-full h-24 rounded-lg bg-sky-50 flex items-center justify-center overflow-hidden">
                    <img src=${option.preview} alt=${`${option.label} 기본 캐릭터`} className="h-full object-contain" />
                  </span>
                  <span className="text-sm sm:text-base font-bold">${option.label}</span>
                </button>
              `;
            })}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick=${() => onStartGame('normal')}
            className="bg-blue-500 text-white font-bold py-3 sm:py-4 px-6 sm:px-8 rounded-full text-lg sm:text-xl shadow-lg hover:bg-blue-600 transition-all transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-400"
          >
            📝 일반 모드
          </button>
          <button
            onClick=${() => onStartGame('debug')}
            className="bg-purple-500 text-white font-bold py-3 sm:py-4 px-6 sm:px-8 rounded-full text-lg sm:text-xl shadow-lg hover:bg-purple-600 transition-all transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-purple-400"
          >
            🔧 오류수정 모드
          </button>
        </div>
      </div>
      <style>${`
        @keyframes fall {
          to { transform: translateY(110vh); opacity: 0; }
        }
        .animate-fall { animation: fall linear infinite; }

        @keyframes fade-in-down {
          0% { opacity: 0; transform: translateY(-20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-down { animation: fade-in-down 0.8s ease-out forwards; }

        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up { animation: fade-in-up 0.8s ease-out 0.3s forwards; opacity: 0; }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
      `}</style>
    </div>
  `;
}

// 비오는 날 등교 오류 패턴 생성 함수
const generateRainyDayBuggySequence = () => {
  const patterns = [
    // 패턴 1: 신발 먼저 신고 socks 나중에
    [
      { ...RAINY_DAY_BLOCKS.shoes },
      { ...RAINY_DAY_BLOCKS.socks },
      { ...RAINY_DAY_BLOCKS.bag },
      { ...RAINY_DAY_BLOCKS.raincoat },
    ],
    // 패턴 2: backpack 먼저 메고 raincoat 나중에
    [
      { ...RAINY_DAY_BLOCKS.socks },
      { ...RAINY_DAY_BLOCKS.bag },
      { ...RAINY_DAY_BLOCKS.shoes },
      { ...RAINY_DAY_BLOCKS.raincoat },
    ],
    // 패턴 3: socks 안 신음
    [
      { ...RAINY_DAY_BLOCKS.shoes },
      { ...RAINY_DAY_BLOCKS.bag },
      { ...RAINY_DAY_BLOCKS.raincoat },
    ],
    // 패턴 4: raincoat 안 입음
    [
      { ...RAINY_DAY_BLOCKS.socks },
      { ...RAINY_DAY_BLOCKS.shoes },
      { ...RAINY_DAY_BLOCKS.bag },
    ],
    // 패턴 5: TV 보기, 게임하기 포함
    [
      { ...RAINY_DAY_BLOCKS.tv },
      { ...RAINY_DAY_BLOCKS.socks },
      { ...RAINY_DAY_BLOCKS.shoes },
      { ...RAINY_DAY_BLOCKS.game },
      { ...RAINY_DAY_BLOCKS.bag },
      { ...RAINY_DAY_BLOCKS.raincoat },
    ],
  ];

  const randomPattern = patterns[Math.floor(Math.random() * patterns.length)];
  return randomPattern.map(block => ({ ...block }));
};

function RainyDayGame({ onBack }) {
  const [showIntro, setShowIntro] = useState(true);
  const [gameMode, setGameMode] = useState('normal');
  const [character, setCharacter] = useState('boy');
  const [palette, setPalette] = useState(shuffleArray(RAINY_DAY_INITIAL_PALETTE));
  const [sequence, setSequence] = useState([]);
  const [displaySequence, setDisplaySequence] = useState([]);
  const [animationFrames, setAnimationFrames] = useState([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [resultFrameImages, setResultFrameImages] = useState([]);
  const [result, setResult] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (animationFrames.length === 0) return;
    if (animationFrames.length === 1) {
      setDisplaySequence(animationFrames[0]);
      setAnimationFrames([]);
      setIsAnimating(false);
      return;
    }
    setIsAnimating(true);
    let frameIndex = 0;
    setDisplaySequence(animationFrames[frameIndex]);
    frameIndex += 1;
    const timer = setInterval(() => {
      if (frameIndex >= animationFrames.length) {
        clearInterval(timer);
        setIsAnimating(false);
        setAnimationFrames([]);
        return;
      }
      setDisplaySequence(animationFrames[frameIndex]);
      frameIndex += 1;
    }, 800);
    return () => clearInterval(timer);
  }, [animationFrames]);

  const handlePaletteDragStart = (e, blockId) => {
    e.dataTransfer.setData('blockId', blockId);
    e.dataTransfer.setData('source', 'palette');
  };

  const handleSequenceDragStart = (e, blockId, index) => {
    e.dataTransfer.setData('blockId', blockId);
    e.dataTransfer.setData('source', 'sequence');
    e.dataTransfer.setData('index', index.toString());
  };

  const handlePaletteDrop = (e) => {
    e.preventDefault();
    const blockId = e.dataTransfer.getData('blockId');
    const source = e.dataTransfer.getData('source');

    if (source === 'sequence') {
      const sourceIndex = parseInt(e.dataTransfer.getData('index'));
      const block = sequence[sourceIndex];
      setSequence((prev) => prev.filter((_, i) => i !== sourceIndex));
      setPalette((prev) => [...prev, { ...block }]);
    }
  };

  const handleSequenceDrop = (blockId, targetIndex) => {
    const source = event.dataTransfer.getData('source');

    if (source === 'palette') {
      const block = palette.find((b) => b.id === blockId);
      if (!block) return;

      setPalette((prev) => {
        const index = prev.findIndex((b) => b.id === blockId);
        if (index === -1) return prev;
        return [...prev.slice(0, index), ...prev.slice(index + 1)];
      });
      setSequence((prev) => {
        const newSeq = [...prev];
        newSeq.splice(targetIndex, 0, block);
        return newSeq;
      });
    } else if (source === 'sequence') {
      const sourceIndex = parseInt(event.dataTransfer.getData('index'));
      if (sourceIndex === targetIndex) return;

      setSequence((prev) => {
        const newSeq = [...prev];
        const [block] = newSeq.splice(sourceIndex, 1);
        const adjustedTarget = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
        newSeq.splice(adjustedTarget, 0, block);
        return newSeq;
      });
    }
  };

  const handleQuickAdd = (blockId) => {
    const block = palette.find((b) => b.id === blockId);
    if (!block) return;
    setPalette((prev) => {
      const index = prev.findIndex((b) => b.id === blockId);
      if (index === -1) return prev;
      return [...prev.slice(0, index), ...prev.slice(index + 1)];
    });
    setSequence((prev) => [...prev, block]);
  };

  const handleQuickRemove = (index) => {
    const block = sequence[index];
    setSequence((prev) => prev.filter((_, i) => i !== index));
    setPalette((prev) => [...prev, { ...block }]);
  };

  const handleExecute = () => {
    const frames = (() => {
      const attireIds = ['socks', 'shoes', 'bag', 'raincoat'];
      const snapshots = [[]];
      const current = [];
      sequence.forEach((block) => {
        if (attireIds.includes(block.id)) {
          current.push(block);
          snapshots.push([...current]);
        }
      });
      return snapshots;
    })();
    setDisplaySequence([]);
    setResultFrameImages(frames.map((frame) => getImageInfo(frame, character)));
    setAnimationFrames(frames);

    const evaluation = evaluateRainyDay(sequence);
    const problems = [...evaluation.orderIssues];

    if (problems.length > 0) {
      setResult({ status: 'failure', title: '등교 실패! 😥', messages: problems });
    } else {
      setResult({ status: 'success', title: '등교 성공! 🥳', messages: ['발도, 가방도 젖지 않았어요! 완벽한 절차입니다!'] });
    }

    setIsModalOpen(true);
  };

  const handleReset = () => {
    setPalette(shuffleArray(RAINY_DAY_INITIAL_PALETTE));
    setSequence([]);
    setDisplaySequence([]);
    setAnimationFrames([]);
    setIsAnimating(false);
    setResultFrameImages([]);
    setResult(null);
    setIsModalOpen(false);
  };

  const handleResultModalClose = () => {
    if (gameMode === 'debug') {
      // 오류수정 모드: 모달만 닫고 블록 유지
      setResult(null);
      setIsModalOpen(false);
    } else {
      // 일반 모드: 완전 초기화
      handleReset();
    }
  };

  const handleStartGame = (mode) => {
    setGameMode(mode);
    setShowIntro(false);

    if (mode === 'debug') {
      // 인트로를 먼저 닫고, 약간의 딜레이 후 디버그 모드 초기화
      setTimeout(() => {
        const buggySeq = generateRainyDayBuggySequence();
        setSequence(buggySeq);

        // 팔레트에서 사용된 블록 제거
        const usedBlockIds = buggySeq.map(b => b.id);
        setPalette(prev => {
          let remaining = [...prev];
          usedBlockIds.forEach(id => {
            const idx = remaining.findIndex(b => b.id === id);
            if (idx !== -1) {
              remaining.splice(idx, 1);
            }
          });
          return remaining;
        });

        // 조립된 블록을 보여주고 나서 결과 실행
        setTimeout(() => {
          // 오류수정 모드: 즉시 결과 실행해서 보여주기
          const frames = (() => {
            const attireIds = ['socks', 'shoes', 'bag', 'raincoat'];
            const snapshots = [[]];
            const current = [];
            buggySeq.forEach((block) => {
              if (attireIds.includes(block.id)) {
                current.push(block);
                snapshots.push([...current]);
              }
            });
            return snapshots;
          })();

          setResultFrameImages(frames.map((frame) => getImageInfo(frame, character)));

          const evaluation = evaluateRainyDay(buggySeq);
          const problems = [...evaluation.orderIssues];

          if (problems.length > 0) {
            setResult({ status: 'failure', title: '등교 실패! 😥', messages: problems });
          } else {
            setResult({ status: 'success', title: '등교 성공! 🥳', messages: ['발도, 가방도 젖지 않았어요! 완벽한 절차입니다!'] });
          }
          setIsModalOpen(true);
        }, 500);
      }, 100);
    }
  };

  if (showIntro) {
    return html`<${IntroScreen} onStartGame=${handleStartGame} onBack=${onBack} character=${character} onCharacterChange=${setCharacter} />`;
  }

  return html`
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-sky-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 flex justify-between items-center">
          <button
            onClick=${onBack}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg font-bold shadow-lg hover:bg-gray-700 transition-all"
          >
            ← 메뉴로 돌아가기
          </button>
          <h1 className="text-4xl font-bold text-center text-blue-800">🌧️ 비오는날 등교 성공하기!</h1>
          <div className="w-32"></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-3">
            <${BlockPalette}
              blocks=${palette}
              onDragStart=${handlePaletteDragStart}
              onDrop=${handlePaletteDrop}
              onQuickAdd=${handleQuickAdd}
              iconPaths=${RAINY_DAY_ICON_PATHS}
            />
          </div>
          <div className="lg:col-span-5">
            <${ExecutionSequence}
              blocks=${sequence}
              onDragStart=${handleSequenceDragStart}
              onDrop=${handleSequenceDrop}
              onExecute=${handleExecute}
              onReset=${handleReset}
              onQuickRemove=${handleQuickRemove}
              iconPaths=${RAINY_DAY_ICON_PATHS}
              executeLabel="등교하기! 🎒"
              showStartBlock=${true}
            />
          </div>
          <div className="lg:col-span-4">
            <${CharacterDisplay} sequence=${displaySequence} isAnimating=${isAnimating} character=${character} />
          </div>
        </div>
      </div>

      <${RainyDayResultModal} isOpen=${isModalOpen} onClose=${handleResultModalClose} result=${result} frameImages=${resultFrameImages} isDebugMode=${gameMode === 'debug'} character=${character} />
    </div>
  `;
}

// ==================== 메인 메뉴 ====================

// 절차적 사고 설명 모달
function ProceduralThinkingModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return html`
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick=${onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-2xl w-full" onClick=${(e) => e.stopPropagation()}>
        <h2 className="text-2xl sm:text-3xl font-bold text-blue-800 mb-4 text-center">🧠 절차적 사고란?</h2>

        <div className="space-y-4 text-gray-700">
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
            <p className="text-base sm:text-lg leading-relaxed">
              <strong className="text-blue-700">절차적 사고</strong>는 어떤 일을 해결하기 위해
              <strong className="text-blue-700"> 순서대로 단계를 나누어 생각</strong>하는 능력이에요.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg sm:text-xl font-bold text-gray-800">💡 왜 중요할까요?</h3>
            <ul className="space-y-2 ml-4">
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">✓</span>
                <span className="text-sm sm:text-base">복잡한 문제를 작은 단계로 나누어 쉽게 해결할 수 있어요</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">✓</span>
                <span className="text-sm sm:text-base">올바른 순서를 지켜 효율적으로 일을 처리할 수 있어요</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">✓</span>
                <span className="text-sm sm:text-base">컴퓨터 프로그래밍의 기초가 되는 사고방식이에요</span>
              </li>
            </ul>
          </div>

          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4">
            <h3 className="text-base sm:text-lg font-bold text-yellow-800 mb-2">🎯 실생활 예시</h3>
            <p className="text-sm sm:text-base text-gray-700 leading-relaxed">
              양치질을 할 때도 절차적 사고를 사용해요!<br />
              <span className="text-yellow-700">① 칫솔에 치약 묻히기 → ② 이를 닦기 → ③ 물로 헹구기</span><br />
              이런 순서를 지키지 않으면 제대로 양치를 할 수 없겠죠? 😊
            </p>
          </div>
        </div>

        <button
          onClick=${onClose}
          className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold text-base sm:text-lg transition-all"
        >
          이해했어요! 👍
        </button>
      </div>
    </div>
  `;
}

// 매뉴얼 모달
function ManualModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return html`
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick=${onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick=${(e) => e.stopPropagation()}>
        <h2 className="text-2xl sm:text-3xl font-bold text-purple-800 mb-4 text-center">📖 사용 매뉴얼</h2>

        <div className="space-y-5 text-gray-700">
          <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4">
            <h3 className="text-lg sm:text-xl font-bold text-purple-700 mb-2">🎓 학습 목표</h3>
            <p className="text-sm sm:text-base leading-relaxed">
              이 사이트는 <strong>절차적 사고력</strong>을 재미있는 게임을 통해 기를 수 있도록 만들어졌어요.
              일상생활에서 자주 하는 일들을 올바른 순서로 배열하며 논리적 사고력을 키울 수 있어요!
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg sm:text-xl font-bold text-gray-800">💡 이런 학습에 활용하세요!</h3>
            <ul className="space-y-2 ml-4">
              <li className="flex items-start">
                <span className="text-purple-500 mr-2">✓</span>
                <span className="text-sm sm:text-base"><strong>초등 실과 교과서 활용:</strong> 초등학교 실과 교과서의 내용을 다루며, 교과서와 함께 체험하면 학습 효과가 더욱 좋아요!</span>
              </li>
              <li className="flex items-start">
                <span className="text-purple-500 mr-2">✓</span>
                <span className="text-sm sm:text-base"><strong>절차적 사고 학습:</strong> 순차, 조건, 반복 등 프로그래밍의 기본 개념을 익힐 수 있어요</span>
              </li>
              <li className="flex items-start">
                <span className="text-purple-500 mr-2">✓</span>
                <span className="text-sm sm:text-base"><strong>논리적 사고력 향상:</strong> 원인과 결과, 순서의 중요성을 경험하며 논리력을 키울 수 있어요</span>
              </li>
              <li className="flex items-start">
                <span className="text-purple-500 mr-2">✓</span>
                <span className="text-sm sm:text-base"><strong>문제해결 능력:</strong> 실패와 성공을 반복하며 스스로 해결책을 찾는 능력을 기를 수 있어요</span>
              </li>
            </ul>
          </div>

          <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4">
            <h3 className="text-base sm:text-lg font-bold text-green-800 mb-2">🎮 게임 모드</h3>
            <div className="space-y-3">
              <div className="bg-white rounded-lg p-3 border border-green-200">
                <p className="font-bold text-green-700 mb-1">📝 일반 모드</p>
                <ol className="space-y-1 ml-4 list-decimal text-sm sm:text-base">
                  <li>왼쪽 <strong>블록 꾸러미</strong>에서 필요한 블록을 선택하세요</li>
                  <li>드래그 앤 드롭 또는 더블클릭으로 <strong>실행 순서</strong>에 추가하세요</li>
                  <li>블록을 올바른 순서로 배열한 후 <strong>실행 버튼</strong>을 눌러보세요</li>
                  <li>결과를 보고 무엇이 잘못되었는지 생각해보세요</li>
                  <li>성공할 때까지 순서를 바꿔가며 도전하세요!</li>
                </ol>
              </div>
              <div className="bg-white rounded-lg p-3 border border-orange-200">
                <p className="font-bold text-orange-700 mb-1">🔧 오류수정 모드</p>
                <ol className="space-y-1 ml-4 list-decimal text-sm sm:text-base">
                  <li>이미 잘못된 코드가 준비되어 있어요</li>
                  <li>먼저 <strong>실패한 결과</strong>를 확인하고 무엇이 문제인지 생각해보세요</li>
                  <li><strong>🔧 코드 수정하기</strong> 버튼을 눌러 코드를 수정하세요</li>
                  <li>블록을 빼거나 순서를 바꿔 오류를 고쳐보세요</li>
                  <li>실행 버튼을 눌러 성공할 때까지 디버깅하세요!</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
            <h3 className="text-base sm:text-lg font-bold text-blue-800 mb-2">💡 팁</h3>
            <ul className="space-y-2 text-sm sm:text-base">
              <li>• 실제 상황을 상상하며 순서를 생각해보세요</li>
              <li>• 실패해도 괜찮아요! 실패에서 배우는 것이 더 많답니다</li>
              <li>• 라면 게임에서는 ⏱️ 버튼을 눌러 기다리는 시간을 조절할 수 있어요</li>
              <li>• <strong>오류수정 모드</strong>는 디버깅 능력을 키우는 좋은 연습이에요!</li>
            </ul>
          </div>
        </div>

        <button
          onClick=${onClose}
          className="w-full mt-6 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-bold text-base sm:text-lg transition-all"
        >
          시작하기! 🚀
        </button>
      </div>
    </div>
  `;
}

function MainMenu({ onSelectGame }) {
  const [showProceduralModal, setShowProceduralModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);

  return html`
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-purple-50 to-pink-100 p-4 sm:p-6 md:p-8 flex items-center justify-center">
      <div className="max-w-5xl w-full mx-auto">
        <div className="text-center mb-8 sm:mb-10 md:mb-12">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-center mb-3 sm:mb-4 text-gray-800">
            🎮 <span
              className="cursor-pointer hover:text-blue-600 transition-colors border-b-2 border-dashed border-blue-400 hover:border-blue-600"
              onClick=${() => setShowProceduralModal(true)}
              title="클릭하여 절차적 사고와 알고리즘에 대해 알아보기"
            >알고리즘</span> 놀이터
          </h1>
          <p className="text-center text-gray-600 mb-4 text-base sm:text-lg md:text-xl px-4">
            순서를 생각하며 문제를 해결해보세요!
          </p>
          <button
            onClick=${() => setShowManualModal(true)}
            className="bg-purple-500 hover:bg-purple-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-bold text-sm sm:text-base shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
          >
            📖 사용 매뉴얼
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8 px-2 sm:px-4">
          <div
            onClick=${() => onSelectGame('rainy-day')}
            onKeyDown=${(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectGame('rainy-day');
              }
            }}
            role="button"
            tabIndex=${0}
            className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 md:p-10 cursor-pointer transform transition-all hover:scale-105 active:scale-95 hover:shadow-2xl border-4 border-blue-200 min-h-[240px] sm:min-h-[260px] md:min-h-[280px] flex flex-col items-center justify-center"
          >
            <div className="text-5xl sm:text-6xl md:text-7xl text-center mb-3 sm:mb-4">🌧️</div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-center mb-2 sm:mb-3 text-gray-800">
              비오는날 등교 성공하기
            </h2>
            <p className="text-sm sm:text-base md:text-lg text-gray-600 text-center leading-relaxed">
              비 오는 날, 학교 가기 전 준비를 올바른 순서로 해보세요!
            </p>
          </div>

          <div
            onClick=${() => onSelectGame('ramen')}
            onKeyDown=${(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectGame('ramen');
              }
            }}
            role="button"
            tabIndex=${0}
            className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 md:p-10 cursor-pointer transform transition-all hover:scale-105 active:scale-95 hover:shadow-2xl border-4 border-orange-200 min-h-[240px] sm:min-h-[260px] md:min-h-[280px] flex flex-col items-center justify-center"
          >
            <div className="text-5xl sm:text-6xl md:text-7xl text-center mb-3 sm:mb-4">🍜</div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-center mb-2 sm:mb-3 text-gray-800">
              라면 끓이기 마스터
            </h2>
            <p className="text-sm sm:text-base md:text-lg text-gray-600 text-center leading-relaxed">
              맛있는 라면을 만들기 위한 올바른 순서를 찾아보세요!
            </p>
          </div>
        </div>

        <div className="text-center mt-8 sm:mt-12">
          <p className="text-xs sm:text-sm text-gray-500">
            made by 핑키네
          </p>
        </div>
      </div>

      <${ProceduralThinkingModal} isOpen=${showProceduralModal} onClose=${() => setShowProceduralModal(false)} />
      <${ManualModal} isOpen=${showManualModal} onClose=${() => setShowManualModal(false)} />
    </div>
  `;
}

// ==================== 메인 앱 ====================

function App() {
  const [currentGame, setCurrentGame] = useState(null);

  const handleSelectGame = (game) => {
    setCurrentGame(game);
  };

  const handleBack = () => {
    setCurrentGame(null);
  };

  if (currentGame === 'ramen') {
    return html`<${RamenGame} onBack=${handleBack} />`;
  }

  if (currentGame === 'rainy-day') {
    return html`<${RainyDayGame} onBack=${handleBack} />`;
  }

  return html`<${MainMenu} onSelectGame=${handleSelectGame} />`;
}

// ==================== 렌더링 ====================

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(html`<${App} />`);
