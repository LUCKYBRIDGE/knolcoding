# knolcoding

`LUCKYBRIDGE/pinky-ne-site`에 들어 있던 코딩 관련 콘텐츠를 옮겨 온 저장소입니다.

## 콘텐츠

| 폴더 | 제목 | 설명 |
| --- | --- | --- |
| `games/algorithm-playground/` | 알고리즘 놀이터 | 라면 끓이기, 비오는 날 등교 상황을 바탕으로 순서를 조립하는 절차적 사고 활동 |
| `games/coding-drawing/` | 모눈종이 코딩 놀이터 | 8방향 모눈종이 알고리즘 코딩과 턴제 탐험 게임, 종이 활동지 PDF |

- `assets/cards/`: pinky-ne-site 허브에서 쓰던 카드 이미지
- `tests/coding-drawing.test.mjs`: pinky-ne-site 루트에 있던 모눈종이 코딩 놀이터 테스트

## 실행

두 콘텐츠 모두 정적 웹 앱입니다. 각 폴더의 `index.html`을 정적 서버로 열면 됩니다.

```bash
npx serve games
```

모눈종이 코딩 놀이터의 자체 개발 환경은 `games/coding-drawing/README.md`를 참고하세요.

## 테스트

```bash
node --test tests/coding-drawing.test.mjs
```
