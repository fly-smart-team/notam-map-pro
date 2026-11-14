# NOTAM Pro — Google Apps Script 이전본 (회사 구글 워크스페이스용)

Cloudflare Worker · GitHub Pages 를 쓰지 않고, 회사 구글 계정 안에서만 돌아가게 하는 구성.
- `Code.gs`      : 백엔드 (Drive 파일 제공 · 공공데이터 중계 `/dgk` `/kac` · AI 요약)
- `index.html`   : 얇은 로더 + 어댑터 (앱의 fetch 를 Apps Script 호출로 바꿔줌). **앱 본체(index.html)는 수정하지 않음**
- `appsscript.json` : 권한·배포 설정 (접근: 회사 도메인 사용자만)

## 설치 순서 (PC 권장)
1. **Drive 폴더 만들기** → 이름 `notam-pro-app`. 저장소 루트의 파일을 **폴더 구조 그대로** 올린다.
   (`index.html`, `*.json`, `mel.enc`, `mel-img/`, `hot/`, `twy/`, `ocr/`, `docs/`, `share/` …. `gas/`·`tests/`·`tools/`·`ai-worker/`·`.git` 은 불필요)
   폴더 주소의 마지막 부분이 **폴더 ID**.
2. https://script.google.com → **새 프로젝트**.
3. `Code.gs` 내용 전체 붙여넣기. **파일 추가 → HTML** 로 `index` 만들고 `gas/index.html` 내용 붙여넣기.
   프로젝트 설정 → "appsscript.json 매니페스트 파일 표시" 켜고 `appsscript.json` 내용으로 교체.
4. 프로젝트 설정 → **스크립트 속성** 추가: `ASSET_FOLDER_ID`, `KAC_KEY`, (AI 쓰면) `ACCESS_TOKEN`, `DEEPSEEK_API_KEY` / `ANTHROPIC_API_KEY`.
5. **배포 → 새 배포 → 웹 앱** : 실행 = 나, 액세스 = 우리 조직. 나온 `/exec` 주소를 폰 홈 화면에 추가.
6. 처음 한 번 권한 승인 화면(Drive 읽기, 외부 요청)이 뜨면 허용.

## 업데이트
앱 파일을 바꾸면 Drive 폴더의 해당 파일만 덮어쓰면 됨 (재배포 불필요). `Code.gs` 를 바꾸면 **배포 관리 → 새 버전**.

## 알려진 제한
- 오프라인(서비스 워커) · 홈 화면 "앱 설치" 불가 → 항상 온라인 + 로그인 필요. 첫 로드에 몇 초 걸림.
- 앱 안의 AI 설정 주소는 무시되고 Apps Script 로 연결됨 (`X-Access-Token` 값은 `ACCESS_TOKEN` 과 같아야 함).
- OFP 이미지 OCR(tesseract 워커)은 이 환경에서 동작하지 않을 수 있음 → PDF 파싱은 영향 없음. 실기기 확인 필요.
- Apps Script 하루 호출·실행시간 할당량 있음(개인용 사용량엔 충분). 회사 관리자가 Apps Script 웹앱이나 외부 요청을 막았으면 불가.
- 로컬 테스트는 가짜 `google.script.run` 으로만 했음 (파일 로딩·중계 경로 확인). 실제 구글 환경 검증은 아직.
