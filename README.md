# NOTAM Pro (AI 개인용)

배포 버전 `fly-smart-team/notammap` **v104** (`release-v104`, 커밋 `22e78f6`)에서 복사해 시작한 개인용 AI 버전입니다. 배포 버전에는 반영하지 않습니다.

## 원칙
- AI 키(`ANTHROPIC_API_KEY`)는 Cloudflare Worker 비밀값에만 둡니다. 이 저장소에는 넣지 않습니다.
- AI 경로는 개인 접근 토큰이 있어야 호출됩니다.
- AI가 쓴 내용에는 항상 "AI 요약" 표시를 붙이고 원문을 함께 보여줍니다.

## v104 대비 바뀐 점
- 서비스 워커 캐시 이름 `notam-pro-v1` (배포 버전과 같은 도메인이라 분리), 자기 캐시만 정리
- 앱 이름·제목 "NOTAM Pro"

## 앱의 AI 기능
- 노탐 브리핑 위쪽 **🤖 AI 요약 (n)**: 지금 보이는 노탐 중 규칙 번역이 "요약 어려움"이거나 비어 있는 것만 AI로 요약
- 노탐을 펼치면 **🤖 AI로 요약**: 그 노탐 하나만 요약
- **🔑**: 접근 토큰 입력·변경 (이 기기에만 저장, `notamPro.aiToken`)
- AI 결과는 보라색 "AI 요약" 표시 + 원문 함께 표시, 이 기기에 저장(최근 800건)

## AI Worker (`ai-worker/worker.js`, v0.2)
별도 Cloudflare Worker `notam-ai` (GitHub 연결로 자동 배포, Root directory `/ai-worker`).
- `GET /health` · `POST /ai/notam-summary` (헤더 `X-Access-Token` 필요)
- 여러 AI를 순서대로 시도: 기본 DeepSeek → 실패 시 Claude
- 비밀값: `ACCESS_TOKEN`(필수), `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY` (키 있는 AI만 사용)
- 선택 변수: `AI_ORDER`(기본 `deepseek,anthropic`), `DEEPSEEK_MODEL`, `ANTHROPIC_MODEL`
- 같은 원문 요약은 7일 캐시 (요금 절약)
