#!/bin/zsh

cd -- "$(dirname -- "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22 LTS가 필요합니다."
  echo "https://nodejs.org/ 에서 설치한 뒤 다시 실행해 주세요."
  read -r "?Enter 키를 누르면 창이 닫힙니다."
  exit 1
fi

node ./scripts/start-local.mjs
start_status=$?

if (( start_status != 0 )); then
  echo
  read -r "?문제를 확인한 뒤 Enter 키를 누르면 창이 닫힙니다."
fi

exit "$start_status"
