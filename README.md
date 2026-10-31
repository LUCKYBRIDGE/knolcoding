# 놀코딩 · KNOL CODING

놀면서 배우는 코딩 활동 모음. 놀퀴즈, 놀프린트, 놀아트와 같은 놀 시리즈 디자인을 쓰는 정적 웹사이트입니다. 배포 주소는 `coding.knolquiz.com`을 기준으로 합니다.

## 경로

- `/`: 놀코딩 첫 화면 (활동 카드, 수업 안내)
- `/algorithm-playground/`: 알고리즘 놀이터
- `/coding-drawing/`: 모눈종이 코딩 놀이터
- `/privacy.html`: 개인정보 처리 안내

## 폴더 구조

```text
knolcoding/
  index.html, style.css, brand-nav.mjs   첫 화면과 놀 시리즈 공통 상단 메뉴
  privacy.html, privacy.mjs, 404.html    안내 페이지
  assets/                                놀코딩 마크, 놀 시리즈 마크, 활동 카드 이미지
  games/algorithm-playground/            활동 원본 (pinky-ne-site에서 가져옴)
  games/coding-drawing/                  활동 원본 (pinky-ne-site에서 가져옴)
  build.mjs                              dist/ 생성
  server.mjs                             dist/ 미리보기 서버
```

`games/` 안의 원본은 그대로 두고, 빌드할 때 `dist/`에 복사하면서 다음을 바꿉니다.

- 두 활동 화면에 `놀코딩 홈` 링크(`../`)를 넣습니다.
- 모눈종이 코딩 놀이터의 로컬 공유 안내 문구에 `coding.knolquiz.com`을 표시합니다.
- `node_modules`, `tests`, `scripts`, `package.json` 같은 개발용 파일은 배포하지 않습니다.

바꿀 위치를 원본에서 찾지 못하면 빌드가 실패합니다. 원본을 갱신한 뒤에도 링크가 빠지지 않도록 하기 위해서입니다.

## 실행

Node.js 22 이상, 설치할 의존성은 없습니다.

```bash
npm start        # 빌드 후 http://127.0.0.1:4175 에서 미리보기
npm run build    # dist/ 만 생성
npm test         # 모눈종이 코딩 놀이터 테스트
```

## Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
- Production branch: `main`
- Custom domain: `coding.knolquiz.com`

## 활동 추가

1. `games/<폴더>/`에 활동을 넣습니다.
2. `build.mjs`의 `games` 목록에 추가하고, 화면에 `놀코딩 홈` 링크를 넣는 patch 함수를 만듭니다.
3. `index.html`의 `.activity-grid`에 카드를 추가하고 `assets/cards/`에 카드 이미지를 넣습니다.
4. 활동이 브라우저에 새로 저장하는 값이 있으면 `privacy.html` 안내와 `privacy.mjs`의 삭제 목록을 함께 고칩니다.
