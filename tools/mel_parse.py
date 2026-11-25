# MEL PDF(pdftotext -layout)를 JSON으로: python3 tools/mel_parse.py mel.txt out.json   (회사 문서라 결과 JSON은 저장소에 올리지 않음)
# 같은 번호의 운항 절차(OpsProc)가 기체 그룹(Applicable to)별로 여러 판이면 ops[번호].vs 에 모두 보관
import re, json, sys
T = open(sys.argv[1], encoding='utf-8').read().split('\n')
NOISE = [r'^\s*AAR A321 FLEET', r'^\s*MEL\s{5,}', r'MEL ITEMS\s*$', r'MEL OPERATIONAL PROCEDURES\s*$', r'^\s*A321\s*$',
         r'MINIMUM EQUIPMENT LIST', r'^\s*\d{2} - [A-Z]', r'^\s*\d{2}-\d{2}(-\d{2})* - ', r'Intentionally left blank',
         r'Continued (from|on) the', r'^\s*ATA \d+', r'^\s*A to B\s*$', r'^\s*\d{2}\s*-\s*[A-Z &]+$']
NZ = re.compile('|'.join(NOISE))
HDR = re.compile(r'^(\d{2}-\d{2}(?:-\d{2}){0,3})\s{3,}(\S.*)$')            # 항목 머리 (MI)
SUB = re.compile(r'^\s{1,6}(\d{2}-\d{2}(?:-\d{2}){0,3}[A-Z](?:\([A-Z]\))*)\b\s*(.*)$')   # 세부 항목 (MI)
OPH = re.compile(r'^(\d{2}-\d{2}(?:-\d{2}){0,3}[A-Z](?:\([A-Z]\))*)\s{3,}(\S.*)$')     # 운항 절차 머리 (MO)
VAL = re.compile(r'^\s*([A-D]|\S{1,3})\s{5,}(\S+)\s{5,}(\S+)\s{5,}(Yes|No|-|–)\s*$')

# 머리글 정리: 들여쓰기·개정표시(앞의 숫자)가 붙은 Ident 줄을 바로잡고, 제목이 길어 여러 줄로 꺾인 머리글(번호만 한 줄, 제목이 위·아래로 나뉨,
# 21-26-06A / 21-26-06B 처럼 번호가 두 줄)을 한 줄 "번호   제목"으로 합침. 번호가 둘이면 21-26-06A(B) 형태로 만든다.
IDL = re.compile(r'^(\d{2}-\d{2}(?:-\d{2}){0,3}(?:[A-Z](?:\([A-Z]\))*)?)\s*(\S.*)?$')
def prep(T):
    for j, l in enumerate(T):
        m = re.match(r'^\s*(?:\d+\s+)?(Ident\.: M[OI]-.*)$', l)
        if m:
            T[j] = m.group(1)
            if j + 1 < len(T) and T[j + 1].strip().startswith('Applicable to'): T[j + 1] = T[j + 1].strip()
            if j > 0 and re.match(r'^\s+\d{2}-\d{2}', T[j - 1]): T[j - 1] = T[j - 1].lstrip()
    return T
ALIAS = {}
def isid(x):
    t = x.strip(); m = IDL.match(t)
    return bool(t[:1].isdigit() and m and (m.group(2) is None or re.match(r'^\S+\s{3,}\S', t)))
def join_heads(T):
    r = []
    for l in T:
        if l.startswith(('Ident.: MO-', 'Ident.: MI-')) and r and (not (OPH.match(r[-1]) or HDR.match(r[-1])) or (len(r) > 1 and isid(r[-2]) and isid(r[-1]))):
            # 뒤에서부터 머리글 덩어리(번호 줄·제목 조각·빈 줄)를 모은다
            e = len(r); ids = 0; pos = len(r)
            while pos > 0 and len(r) - pos < 7:
                x = r[pos - 1]
                if not x.strip(): pos -= 1; continue
                if isid(x): ids += 1; e = pos - 1; pos -= 1; continue
                if len(x) - len(x.lstrip()) >= 30 and not NZ.search(x): e = pos - 1 if ids or True else e; pos -= 1; continue
                break
            blk = [x for x in r[e:] if x.strip()]
            idl = [x.strip() for x in blk if isid(x)]
            if idl:
                # 번호 앞쪽에 붙은 제목 조각이 번호 줄보다 위에 있으면 그대로 포함, 번호 줄 위에 번호 없는 큰 들여쓰기 줄만 있는 경우는 제외
                first = IDL.match(idl[0]).group(1); parts = []
                for x in blk:
                    if isid(x):
                        t = IDL.match(x.strip()).group(2)
                        if t: parts.append(t.strip())
                    else: parts.append(x.strip())
                key = first
                for x in idl[1:]:
                    id2 = IDL.match(x).group(1)
                    if id2[:-1] != first[:-1] and not first.endswith(')'):
                        ALIAS.setdefault(first, []).append(id2); continue
                    mm = re.search(r'([A-Z])$', id2)
                    if mm and ('(' + mm.group(1) + ')') not in key and not first.endswith(mm.group(1)): key += '(' + mm.group(1) + ')'
                r = r[:e] + [key + '        ' + ' '.join(parts)]
        r.append(l)
    return r
T = join_heads(prep(T))

def clean(lines):
    out = []
    for L in lines:
        if NZ.search(L): continue
        out.append(L.rstrip())
    while out and not out[-1].strip(): out.pop()
    while out and not out[0].strip(): out.pop(0)
    # 빈 줄 여러 개를 하나로
    res = []
    for L in out:
        if not L.strip() and res and not res[-1].strip(): continue
        res.append(L)
    res = [re.sub(r'\s*\.{5,}\s*', ' …… ', l) for l in res]
    # 왼쪽 공통 들여쓰기 제거
    ind = min([len(l) - len(l.lstrip()) for l in res if l.strip()] or [0])
    return '\n'.join(l[ind:] for l in res)

items, ops = {}, {}
i, n = 0, len(T)
mode = None; cur = None; curItem = None; buf = []
def flush():
    global cur, buf
    if cur is None: return
    kind, key, meta = cur
    txt = clean(buf)
    if kind == 'MI':
        meta['text'] = txt
        items[key] = meta
    elif kind == 'MO':
        app = meta.get('app', '')
        e = ops.setdefault(key, {'t': meta['t'], 'text': '', 'vs': []})
        v = next((x for x in e['vs'] if x['app'] == app), None)
        if v: v['text'] = (v['text'] + '\n' + txt).strip()      # 같은 기체판의 이어지는 쪽
        else: e['vs'].append({'app': app, 'text': txt})
    cur = None; buf = []

while i < n:
    L = T[i]
    nxt = T[i + 1] if i + 1 < n else ''
    if nxt.startswith('Ident.: MI-') and HDR.match(L):
        flush(); m = HDR.match(L); curItem = {'no': m.group(1), 't': m.group(2).strip()}
        app = T[i + 2] if T[i + 2].startswith('Applicable to') else ''
        curItem['app'] = app.replace('Applicable to:', '').strip()
        mode = 'MI'; i += 3 if app else 2; continue
    if nxt.startswith('Ident.: MO-') and OPH.match(L):
        flush(); m = OPH.match(L); ap = T[i + 2].replace('Applicable to:', '').strip() if T[i + 2].startswith('Applicable to') else ''
        cur = ('MO', m.group(1), {'t': m.group(2).strip(), 'app': ap}); mode = 'MO'
        i += 3 if ap else 2; continue
    if nxt.startswith('Ident.: M'):   # 다른 형식 머리 → 현재 항목 종료
        flush(); mode = None; i += 2; continue
    if mode == 'MI' and curItem:
        m = SUB.match(L)
        if m and m.group(1).startswith(curItem['no']):
            flush()
            meta = {'t': curItem['t'], 'cond': m.group(2).strip(), 'app': curItem['app']}
            # 표 머리 + 값
            j = i + 1
            while j < n and not T[j].strip(): j += 1
            if 'Repair interval' in T[j]:
                v = T[j + 1].split()
                if len(v) >= 4: meta.update({'ri': v[0], 'inst': v[1], 'req': v[2], 'plac': v[3]})
                j += 2
            cur = ('MI', m.group(1), meta); buf = []; i = j; continue
    if cur is not None: buf.append(L)
    i += 1
flush()
for k, v in items.items():
    v['o'] = bool(re.search(r'^\s*\(o\)|OpsProc', v['text'], re.M))
    v['m'] = bool(re.search(r'^\s*\(m\)|MaintProc', v['text'], re.M))
    v['cd'] = 'Crew Defer' in v['text']
for e in ops.values():
    e['text'] = e['vs'][0]['text']
    if len(e['vs']) == 1: del e['vs']
# 번호가 묶인 절차(21-26-06A(B), 26-12-02A & 26-12-03A 등)는 개별 번호로도 찾을 수 있게 별칭을 둔다 (alias 로 본문을 가리킴)
for a, bs in ALIAS.items():
    if a in ops:
        for b in bs: ops.setdefault(b, {'t': ops[a]['t'], 'text': '', 'alias': a})
for k in list(ops):
    m = re.match(r'^(.*\d)([A-Z])((?:\([A-Z]\))+)$', k)
    if m and 'alias' not in ops[k]:
        for L in [m.group(2)] + re.findall(r'\(([A-Z])\)', m.group(3)):
            ops.setdefault(m.group(1) + L, {'t': ops[k]['t'], 'text': '', 'alias': k})

# ---- MEL ENTRIES: "ECAM Alert: ○○○" 477개 (AIRCRAFT STATUS | CONDITION OF DISPATCH 표) ----
ATA_NAMES = {}
for L in T:
    m = re.match(r'^\s*ATA (\d{2}) ([A-Z][^.]{3,60})$', L)
    if m and m.group(1) not in ATA_NAMES: ATA_NAMES[m.group(1)] = m.group(2).strip()
ecam = []
eidx = [k for k, l in enumerate(T) if re.match(r'^\s*ECAM Alert:', l)]
STOP = re.compile(r'^\s*AAR A321 FLEET|^\s*MEL\s{5,}|Continued (from|on) the')
for a, b in zip(eidx, eidx[1:] + [len(T)]):
    blk = T[a:b]
    name = re.sub(r'^\s*ECAM Alert:\s*', '', blk[0]).strip()
    idm = re.search(r'Ident\.: ME-(\d{2})-(\d+\.\d+) / (\d{2} [A-Z]{3} \d{2})', '\n'.join(blk[:4]))
    apm = re.search(r'Applicable to:\s*(.+)', '\n'.join(blk[:5]))
    hdr = next((k for k, l in enumerate(blk) if 'CONDITION OF DISPATCH' in l), None)
    if hdr is None: continue
    col = blk[hdr].index('CONDITION OF DISPATCH') - 4
    rows, st, cd = [], [], []
    def push():
        global st, cd
        if st or cd: rows.append({'st': ' '.join(st).strip(), 'cd': ' '.join(cd).strip()})
        st, cd = [], []
    for l in blk[hdr + 1:]:
        if STOP.search(l): break
        if not l.strip(): continue
        if re.match(r'^\s*\.{20,}', l): push(); continue
        off = len(l) - len(l.lstrip())
        parts = re.split(r'\s{3,}', l.strip())
        if len(parts) == 1:
            m = re.search(r'(?<=\S) (?=Refer to |NO DISPATCH|Apply )', parts[0])
            if m and not parts[0].startswith(('Refer to','NO DISPATCH','Apply ')): parts = [parts[0][:m.start()], parts[0][m.end():]]
        if len(parts) >= 2: st.append(parts[0]); cd.append(' '.join(parts[1:]))
        elif off >= col - 10: cd.append(parts[0])
        else: st.append(parts[0])
    push()
    txt = ' '.join(r['cd'] for r in rows)
    refs = []
    for r in re.findall(r'Item\s+(\d{2}[-–]\d{2}(?:[-–]\d{2}){0,2}[A-Z]?(?:\([A-Z]\))?)', txt):
        r = r.replace('–', '-')
        if r not in refs: refs.append(r)
    fcom = []
    for r in re.findall(r'(FCOM/[A-Z0-9\-/]+)', txt):
        if r not in fcom: fcom.append(r)
    ecam.append({'n': name, 'ata': idm.group(1) if idm else '', 'id': idm.group(2) if idm else '', 'dt': idm.group(3) if idm else '',
                 'app': apm.group(1).strip() if apm else '', 'rows': rows, 'refs': refs, 'fcom': fcom})
print('ecam', len(ecam), 'ata', len(ATA_NAMES), file=sys.stderr)
print('items', len(items), 'ops', len(ops), 'multi', sum(1 for e in ops.values() if len(e.get('vs', [])) > 1), file=sys.stderr)
json.dump({'items': items, 'ops': ops, 'ecam': ecam, 'ata': ATA_NAMES}, open(sys.argv[2], 'w'), ensure_ascii=False)
