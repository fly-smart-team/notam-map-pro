#!/usr/bin/env python3
"""NOTAM Pro 회귀 테스트.
  1) tests/twy-cases.json  — 유도로·주기장 노탐 문장 해석 (PDF 불필요, 저장소에 포함)
  2) OFP 스냅샷 (선택)     — 과거 OFP PDF를 넣고 분류 결과를 기록/비교
     PDF·스냅샷은 회사 자료이므로 저장소 밖 폴더에 둠:  NOTAM_TEST_DIR=/경로  (그 안에 *.pdf, 결과는 *.snap.json)
사용:  python3 tools/regress.py            비교
       python3 tools/regress.py --update   현재 결과를 기대값으로 저장(스냅샷)
"""
import asyncio, json, os, sys, glob, subprocess, time
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8799
UPDATE = '--update' in sys.argv
TDIR = os.environ.get('NOTAM_TEST_DIR', '')

def fmt(c):
    if not c: return None
    out = []
    for i in c['items']:
        if i.get('stand'): out.append('S' + i['stand'])
        elif i.get('rwy'): out.append(f"{i['ref']}@{i['rwy']}")
        elif i.get('a'): out.append(f"{i['ref']}({i['a']}~{i['b']})")
        else: out.append(i['ref'])
    return c['kind'], ','.join(out)

async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1); fails = 0
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1100, 'height': 1300}); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.route(lambda u: 'localhost' not in u, lambda r: r.abort())
            await pg.goto(f'http://localhost:{PORT}/index.html'); await pg.wait_for_timeout(1500)
            cases = json.load(open(os.path.join(ROOT, 'tests', 'twy-cases.json')))
            got = await pg.evaluate("T => T.map(t => twyClauses({ etext: t }))", [c[0] for c in cases])
            for (txt, kind, exp), g in zip(cases, got):
                r = fmt(g)
                ok = r is not None and r[0] == kind and (exp is None or r[1] == exp)
                if not ok: fails += 1; print(f'✗ 유도로 해석: {txt[:60]}\n    기대 {kind} {exp} / 실제 {r}')
            print(f'유도로 해석 {len(cases) - fails}/{len(cases)} 통과')
            for pdf in sorted(glob.glob(os.path.join(TDIR, '*.pdf'))) if TDIR else []:
                q = await b.new_page(viewport={'width': 1100, 'height': 1300}); q.on('pageerror', lambda e: errs.append(str(e)))
                await q.route(lambda u: 'localhost' not in u, lambda r: r.abort())
                await q.goto(f'http://localhost:{PORT}/index.html'); await q.wait_for_timeout(1500)
                await q.set_input_files('#pdf-input', pdf); await q.wait_for_timeout(13000)
                snap = await q.evaluate("""(() => { const R = window.__brfRows || []; const o = {};
                  R.forEach(r => { o[r.n.notamId] = [r.tier, r.why, r.manual || '', r.active ? 1 : 0]; }); return o; })()""")
                await q.close()
                sp = pdf[:-4] + '.snap.json'
                if UPDATE or not os.path.exists(sp):
                    json.dump(snap, open(sp, 'w'), ensure_ascii=False, indent=0); print(f'📸 저장 {os.path.basename(sp)} ({len(snap)}건)'); continue
                old = json.load(open(sp)); diff = []
                for k in sorted(set(old) | set(snap)):
                    if old.get(k) != snap.get(k): diff.append(f'    {k}: {old.get(k)} → {snap.get(k)}')
                if diff: fails += 1; print(f'✗ {os.path.basename(pdf)} 분류 변경 {len(diff)}건\n' + '\n'.join(diff[:30]))
                else: print(f'✓ {os.path.basename(pdf)} {len(snap)}건 동일')
            if errs: fails += 1; print('✗ 페이지 오류:', errs[:5])
            await b.close()
    finally:
        srv.terminate()
    print('결과:', '통과' if not fails else f'실패 {fails}')
    sys.exit(1 if fails else 0)

asyncio.run(main())
