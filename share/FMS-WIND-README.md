# FMS 순항 바람 입력 카드 — 다른 앱(노탐 배포 버전)에 넣는 방법

`fms-wind.js` 한 파일로 동작합니다. 다른 코드에 의존하지 않습니다.

- 입력: OFP 전체 텍스트 + 항법로그 목록 `[{ name, fl }]` (순항 웨이포인트는 `fl`이 숫자, 상승·강하는 `'CLB'`·`'DSC'`)
- 출력: 지정한 칸에 카드 HTML (Tailwind 클래스 사용)
- 기준(Airbus): 마지막으로 넣은 값과 비교해 순항 고도에서 풍향 > 30° · 풍속 > 30KT · 기온 > 5°C 이면 그 웨이포인트에 입력.
  입력 4칸은 주 순항 고도를 3번째 칸(아래 2칸 · 위 1칸)에 둠.

## 넣는 순서 (3단계)

1. 화면에 카드 자리 추가 — 원하는 위치(예: Flight Information 아래)에
   ```html
   <div id="fms-wind"></div>
   ```
2. `fms-wind.js` 내용을 `<script>` 안(다른 함수들 옆)에 그대로 붙여넣기
3. OFP PDF를 읽고 항법로그를 만든 직후에 한 줄 호출
   ```js
   FmsWind.render(fullText, pdfNav, document.getElementById('fms-wind'));
   ```
   - `fullText`: OFP에서 뽑은 전체 텍스트, `pdfNav`: `parseNavlog(fullText)` 결과(`name`, `fl` 필드)
   - 새 OFP를 올리거나 화면을 다시 그릴 때도 같은 줄을 부르면 됨

## 원본 위치
- https://fly-smart-team.github.io/notam-map-pro/share/fms-wind.js
