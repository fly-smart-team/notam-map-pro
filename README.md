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
- 노탐 브리핑 위쪽 **🤖 AI 일괄 요약**: 구간(출발·도착·교체·FIR)과 ERA 공항을 골라 한 번에 요약. 아직 요약 안 된 노탐만 보내고 10건씩 4묶음 동시 처리. 선택은 기기에 저장 (`notamPro.aiSel.v1`)
- 노탐을 펼치면 **🤖 AI로 요약**: 그 노탐 하나만 요약
- **🔑**: 접근 토큰 입력·변경 (이 기기에만 저장, `notamPro.aiToken`)
- AI 결과는 보라색 "AI 요약" 표시 + 원문 함께 표시, 이 기기에 저장(최근 800건)

## Joint Brief 말하기 스크립트
- 문서 맨 위: 브리핑 언어 확인 인사말 ("안녕하세요. 한국어로 브리핑해도 될까요?") — 중국어·일본어·베트남어·태국어·필리핀어, 로마자·한글 발음, 🔊 원어 음성
- 🎙️ 브리핑 스크립트: 기장이 말하는 한국어 문장(승객·시각·교체·기상·난기류·보안·비상 연락·비상 절차·택시) 아래 짧은 영어 한 줄, 🔊 듣기
- 값은 OFP에서 자동(승객, 현지 출발·도착 시각, 교체 공항·거리, 승무원용 날씨 표현, SR 6 이상 구간, 보안 등급) — 없는 값은 빈칸
- 음성은 브라우저 내장 음성(오프라인 가능), 속도 보통/느리게. 복사·저장·인쇄에서는 🔊 버튼 제외
- 아래 1~6 항목(양식)은 한국어 그대로

## COAD 저장 요약 (`coad-ko.json`)
- Claude가 미리 작성한 COAD 한국어 요약 (API 요금 없음, 오프라인 사용 가능)
- 키 = COAD 원문 정규화 해시(`-- BY` 줄 앞까지). 회사가 원문을 고치면 키가 달라져 앱에 "⚠ COAD 내용이 바뀌었습니다"가 뜨고 AI 요약 대상이 됨
- 갱신: 새 OFP를 Claude에게 주면 바뀐 COAD만 다시 요약해 이 파일을 교체

## AI Worker (`ai-worker/worker.js`, v0.2)
별도 Cloudflare Worker `notam-ai` (GitHub 연결로 자동 배포, Root directory `/ai-worker`).
- `GET /health` · `POST /ai/notam-summary` (헤더 `X-Access-Token` 필요)
- 여러 AI를 순서대로 시도: 기본 DeepSeek → 실패 시 Claude
- 비밀값: `ACCESS_TOKEN`(필수), `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY` (키 있는 AI만 사용)
- 선택 변수: `AI_ORDER`(기본 `deepseek,anthropic`), `DEEPSEEK_MODEL`, `ANTHROPIC_MODEL`
- 같은 원문 요약은 7일 캐시 (요금 절약)
