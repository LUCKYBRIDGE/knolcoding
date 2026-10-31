// Keys written by the bundled activities on this origin.
const STORAGE_KEYS = ['coding-drawing:education-progress:v1', 'coding-drawing:predict-before-run:v1'];

const button = document.querySelector('#clear-progress');
const status = document.querySelector('#privacy-status');
button?.addEventListener('click', () => {
  try {
    for (const key of STORAGE_KEYS) localStorage.removeItem(key);
    status.textContent = '이 기기에 저장된 학습 진행 기록과 설정을 지웠어요.';
  } catch {
    status.textContent = '브라우저 설정 때문에 기록을 지우지 못했어요. 브라우저의 사이트 데이터 삭제 기능을 이용해 주세요.';
  }
});
