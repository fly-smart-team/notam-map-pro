// ===== FMS 순항 바람 입력 (Airbus CRZ WIND) =====
// OFP 'WIND AND TEMPERATURE SUMMARY'를 읽어 어느 웨이포인트에 바람·기온을 넣을지 고른다.
// 기준(Airbus 교육 자료 "A340 Cruise"): 마지막으로 넣은 값과 비교해
//   풍향 변화 > 30° · 풍속 변화 > 30KT · 기온 변화 > 5°C 중 하나라도 넘으면 그 웨이포인트에 입력.
// FMS는 입력한 바람을 다음 입력 지점까지 그대로 이어 쓰므로(propagation) '기준을 넘는 첫 지점'에 넣는다.
// 다른 파일에 의존하지 않음: FmsWind.render(ofpText, nav, el) 하나만 부르면 된다.
//   nav = [{ name:'BIKSI', fl:330 }, { name:'KAE', fl:'CLB' }, ...]  (OFP 항법로그 순서, 순항이면 숫자 FL)
const FmsWind = (() => {
  const LIM = { dir: 30, spd: 30, tmp: 5 };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 1) 바람 요약 표 읽기 → { BIKSI: { 350: {dir,spd,tmp}, ... }, ... }  (첫 번째 요약만 사용)
  function parse(text) {
    const T = String(text || '').replace(/\r/g, '');
    const st = T.search(/START OF WIND AND TEMPERATURE SUMMARY/);
    if (st < 0) return null;
    let body = T.slice(st + 10);
    const nx = body.search(/START OF WIND AND TEMPERATURE SUMMARY|END OF JEPPESEN DATAPLAN/);
    if (nx > 0) body = body.slice(0, nx);
    const out = {}, order = [];
    let rows = [];
    for (const ln of body.split('\n')) {
      const m = ln.match(/^\s*(\d{3})\s+-?\d{1,2}\s+((?:\d{5}[+-]\d{3}[+-]\d{2}\s*)+)$/);
      if (m) {
        const cells = [...m[2].matchAll(/(\d{2})(\d{3})([+-]\d{3})([+-]\d{2})/g)].map(c => ({ dir: (+c[1] * 10) % 360 || 360, spd: +c[2], tmp: +c[4] }));
        rows.push({ fl: +m[1], cells });
        continue;
      }
      const nm = ln.match(/^\s*([A-Z][A-Z0-9]{1,6}(?:\s+[A-Z][A-Z0-9]{1,6})*)\s*$/);
      if (nm && rows.length && !/\b(WIND|CMP|TMP|ISA|FL|PAGE|END|OF)\b/.test(nm[1])) {
        const names = nm[1].trim().split(/\s+/);
        for (const r of rows) {
          if (r.cells.length !== names.length) continue;
          names.forEach((n, i) => { (out[n] = out[n] || {})[r.fl] = r.cells[i]; });
        }
        names.forEach(n => { if (!order.includes(n)) order.push(n); });
        rows = rows.filter(r => r.cells.length !== names.length);
      }
    }
    return order.length ? { wp: out, order } : null;
  }

  // 바람 벡터 보간(비교용): 해당 FL 값이 없으면 위·아래 층 사이를 보간
  const toUV = w => { const a = w.dir * Math.PI / 180; return [w.spd * Math.sin(a), w.spd * Math.cos(a)]; };
  const fromUV = (u, v) => { const s = Math.hypot(u, v); let d = Math.round(Math.atan2(u, v) * 180 / Math.PI); if (d <= 0) d += 360; return { dir: d, spd: Math.round(s) }; };
  function at(lv, fl) {
    if (!lv) return null;
    if (lv[fl]) return lv[fl];
    const fls = Object.keys(lv).map(Number).sort((a, b) => a - b);
    const lo = fls.filter(x => x < fl).pop(), hi = fls.find(x => x > fl);
    if (lo == null || hi == null) return null;
    const k = (fl - lo) / (hi - lo), A = toUV(lv[lo]), B = toUV(lv[hi]);
    return { ...fromUV(A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k), tmp: Math.round(lv[lo].tmp + (lv[hi].tmp - lv[lo].tmp) * k), interp: true };
  }
  const dDir = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

  // 입력 고도 4칸: 순항 고도를 3번째 칸(아래 2칸·위 1칸). 위가 없으면 아래로 채움
  function slots(lv, cru) {
    const fls = Object.keys(lv).map(Number).sort((a, b) => a - b);
    const b = fls.filter(x => x < cru).reverse(), a = fls.filter(x => x > cru);   // 가까운 순
    const pref = [lv[cru] ? cru : null, b[0], b[1], a[0], b[2], a[1], b[3], a[2]].filter(x => x != null);
    return [...new Set(pref)].slice(0, 4).sort((x, y) => x - y);
  }

  // 2) 입력할 웨이포인트 고르기
  function plan(text, nav) {
    const W = parse(text);
    if (!W) return null;
    const flOf = {}; (nav || []).forEach(n => { if (typeof n.fl === 'number') flOf[n.name] = n.fl; });
    // 주 순항 고도 = 항법로그에서 가장 많이 나오는 FL (같으면 높은 쪽). 입력 4칸은 이 고도를 중심으로
    const cnt = {}; Object.values(flOf).forEach(f => cnt[f] = (cnt[f] || 0) + 1);
    const mainFl = Object.keys(cnt).length ? +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || b - a)[0] : null;
    const rows = [], picks = [];
    let last = null;
    for (const name of W.order) {
      const lv = W.wp[name], cru = flOf[name] != null ? flOf[name] : mainFl;
      if (!lv || cru == null || (nav && nav.length && flOf[name] == null)) continue;   // 상승·강하 구간 웨이포인트는 제외
      const cur = at(lv, cru);
      if (!cur) continue;
      const row = { name, cru, cur, why: [] };
      if (!last) row.why.push('기준점 (순항 첫 지점)');
      else {
        const ref = at(last.lv, cru);
        if (!ref) row.why.push(`순항 고도 변경 FL${cru} (이전 입력 고도 범위 밖)`);
        else {
          row.ref = ref;
          row.d = { dir: (cur.spd < 10 || ref.spd < 10) ? 0 : dDir(cur.dir, ref.dir), spd: cur.spd - ref.spd, tmp: cur.tmp - ref.tmp };
          if (row.d.dir > LIM.dir) row.why.push(`풍향 ${row.d.dir}°`);
          if (Math.abs(row.d.spd) > LIM.spd) row.why.push(`풍속 ${row.d.spd > 0 ? '+' : ''}${row.d.spd}KT`);
          if (Math.abs(row.d.tmp) > LIM.tmp) row.why.push(`기온 ${row.d.tmp > 0 ? '+' : ''}${row.d.tmp}°C`);
        }
      }
      row.pick = row.why.length > 0;
      if (row.pick) { last = { name, lv }; const c2 = lv[mainFl] ? mainFl : cru; picks.push({ name, cru: c2, wpFl: cru, why: row.why, levels: slots(lv, c2).map(fl => ({ fl, ...lv[fl] })) }); }
      rows.push(row);
    }
    return { picks, rows, mainFl };
  }

  // 3) 화면 카드
  const fmtW = w => `${String(w.dir).padStart(3, '0')}/${String(w.spd).padStart(3, '0')}`;
  const fmtT = t => (t > 0 ? '+' : '') + t;
  function html(P) {
    if (!P || !P.picks.length) return '';
    const card = p => `<div class="rounded-lg border border-sky-700/60 bg-slate-900/70 p-2">
        <div class="flex items-center gap-2 flex-wrap"><span class="mono text-[15px] font-bold text-white">${esc(p.name)}</span>${p.wpFl !== p.cru ? `<span class="text-[11px] text-slate-400">이 지점 계획 FL${p.wpFl}</span>` : ''}${p.why.map(w => `<span class="px-1.5 py-0.5 rounded ${/기준점/.test(w) ? 'bg-slate-700' : 'bg-amber-700'} text-white text-[11px]">${esc(w)}</span>`).join('')}</div>
        <table class="mono text-[13px] mt-1 w-full max-w-[340px]"><tr class="text-[10.5px] text-slate-400"><td>FL</td><td>WIND</td><td>TEMP</td></tr>
        ${p.levels.map(l => `<tr class="${l.fl === p.cru ? 'text-sky-200 font-bold' : 'text-slate-200'}"><td>${l.fl}${l.fl === p.cru ? ' ◀' : ''}</td><td>${fmtW(l)}</td><td>${fmtT(l.tmp)}</td></tr>`).join('')}</table></div>`;
    const all = P.rows.map(r => `<tr class="${r.pick ? 'text-amber-200 font-bold' : 'text-slate-300'}"><td>${r.pick ? '▶ ' : ''}${esc(r.name)}</td><td>${r.cru}</td><td>${fmtW(r.cur)}${r.cur.interp ? '*' : ''}</td><td>${fmtT(r.cur.tmp)}</td><td>${r.d ? `${r.d.dir}° / ${r.d.spd > 0 ? '+' : ''}${r.d.spd}KT / ${r.d.tmp > 0 ? '+' : ''}${r.d.tmp}°C` : '—'}</td></tr>`).join('');
    return `<div class="rounded-xl border-2 border-sky-700 bg-slate-950/40 p-2.5 flex flex-col gap-2">
      <div class="flex items-center gap-2 flex-wrap"><span class="text-[14px] font-bold text-sky-200">🧭 FMS 순항 바람 입력 (CRZ WIND)</span><span class="text-[11px] text-slate-400">${P.picks.length}곳 · 기준 풍향 &gt;30° · 풍속 &gt;30KT · 기온 &gt;5°C (Airbus)</span></div>
      <div class="grid gap-2 sm:grid-cols-2">${P.picks.map(card).join('')}</div>
      <details><summary class="cursor-pointer select-none text-[11.5px] text-slate-300">전체 웨이포인트 비교 (순항 고도, 마지막 입력값 대비)</summary>
        <table class="mono text-[11.5px] mt-1 w-full"><tr class="text-slate-500"><td>WPT</td><td>FL</td><td>WIND</td><td>TEMP</td><td>변화 (풍향/풍속/기온)</td></tr>${all}</table>
        <div class="text-[10px] text-slate-500 mt-0.5">* 표의 고도 사이를 보간한 값 (비교용)</div></details>
      <div class="text-[10.5px] text-slate-500">◀ 순항 고도. FMS는 입력한 바람을 다음 입력 지점까지 그대로 씁니다. OFP 바람 요약이 기준이며, 순항 고도가 바뀌면 다시 확인하세요.</div>
    </div>`;
  }

  function render(text, nav, el) {
    if (!el) return null;
    let P = null; try { P = plan(text, nav); } catch (e) { P = null; }
    el.innerHTML = html(P);
    return P;
  }
  return { parse, plan, html, render, LIM };
})();
if (typeof window !== 'undefined') window.FmsWind = FmsWind;
