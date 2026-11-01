// ===== 🧊 제방액 검색기 (FAA HOT 표) — 다른 앱에 넣을 수 있는 독립 모듈 =====
// 필요한 파일: hot-data.json (표 데이터), hot.pdf (FAA HOT 원본) — 같은 폴더
// 앱에 있으면 쓰는 것(없어도 동작): info, flightWindow, ofpOrdered, wxLive, tafElems, metarTemp, omTempAt, tafAt, pdfTaf, airportLL, pdfFlt, openPdf/hotLoad
const DX_DATA_URL = 'hot-data.json', DX_PDF_URL = 'hot.pdf';
    // HOT 표 각주(NOTES)·주의사항(CAUTIONS) 한글 번역 + 부연 설명 (쪽별)
    const DX_KO = {"d":[["이 표의 지속시간을 쓰려면 사용하는 제빙액과 희석 비율이 '방빙 성능·공력 시험 통과 목록'(Table 58 - Table 61)에 있어야 합니다. 사용 제한이 있으면 확인해 적용해야 합니다.",""],["Type I 혼합액(제빙액/물)은 어는점이 외기온도보다 최소 10°C 낮도록 섞어야 합니다.",""],["LOUT(최저 운용 사용 온도)을 반드시 지켜야 합니다.",""],["서리가 오래 이어지면 외기온도 변화가 클 수 있습니다. 이때는 제빙액을 뿌린 뒤 이륙할 때까지 '가장 낮았던 기온'에 해당하는 지속시간을 씁니다.","함정: 뿌릴 때 기온이 아니라 이륙 전까지 가장 추웠던 기온 기준입니다."],["Type III 서리 지속시간을 쓰려면 제품명을 알아야 하며, AllClear AeroClear MAX는 가열하지 않고 뿌려야 합니다.",""],["이 표의 지속시간을 쓰려면 사용하는 제빙액과 희석 비율이 '방빙 성능·공력 시험 통과 목록'(Table 58)에 있어야 합니다. 사용 제한이 있으면 확인해 적용해야 합니다.",""],["어는 안개비(Freezing mist)는 직접 관측으로 확인하는 것이 가장 정확합니다. METAR에는 절대 보고되지 않지만, 0°C 이하에서 박무(BR)가 있으면 생길 수 있습니다.","METAR에 'FZBR' 같은 표기는 없습니다. 0°C 이하 + BR이면 어는 안개비로 보고 'Freezing Fog, Freezing Mist' 열을 쓰세요."],["얼음 결정(IC)이 어는 안개(FZFG)나 어는 안개비와 섞여 있으면 '어는 안개' 지속시간을 씁니다.",""],["강설 강도는 반드시 Table 57(시정별 강설 강도)로 정해야 합니다. 시정으로 본 강도가 '강함(heavy)'이면 지속시간이 없습니다.","함정: METAR가 -SN(약한 눈)이어도 시정이 낮으면 Table 57로는 '보통'이나 '강함'이 됩니다. 주간/야간·기온·시정으로 다시 판단하세요. '강함'이면 HOT 없음 = 표로 출발 판단 불가."],["매우 약한·약한·보통 눈에 얼음 결정이 섞이면 '눈' 지속시간을 씁니다.",""],["어는 이슬비(FZDZ) 열은 약한·보통·강한 어는 이슬비를 모두 포함합니다. 어는 이슬비인지 확실히 구분할 수 없으면 '약한 어는 비' 지속시간을 씁니다.","강한 어는 이슬비(+FZDZ)도 이 열을 씁니다. 반대로 어는 비는 '약한'만 지속시간이 있고, 보통·강한 어는 비(FZRA, +FZRA)는 지속시간이 없습니다(기타 열)."],["('눈 섞인 비' 열) 이 지속시간은 '보통' 강도일 때만 씁니다. 매우 약한·약한 눈에 약한 비나 이슬비가 섞이면 '약한 어는 비(Light Freezing Rain)' 지속시간을 씁니다. 강도 확인에는 Table 57이 필요하고, 시정상 '강함'이면 지속시간이 없습니다.","함정: 약한 눈 + 비는 'Snow mixed with Rain' 열이 아니라 더 짧은 'Light Freezing Rain' 열을 봐야 합니다."],["이 조건은 0°C 이하에서 지속시간이 없습니다.","주로 'Rain on Cold-Soaked Wing(차갑게 식은 날개 위의 비)' 열에 붙습니다. 0°C 초과에서만 쓸 수 있습니다."],["'기타(Other)' 열: 강한 눈, 얼음 싸라기(PL/IP), 보통·강한 어는 비, 작은 우박(GS), 우박(GR) — 지속시간이 없습니다.","함정: 이 조건에서는 HOT가 없어 표로는 출발 판단을 할 수 없습니다."],["이 표의 지속시간을 쓰려면 사용하는 제빙액과 희석 비율이 '방빙 성능·공력 시험 통과 목록'(Table 59)에 있어야 합니다. 사용 제한이 있으면 확인해 적용해야 합니다.",""],["LOUT(최저 운용 사용 온도)을 반드시 지켜야 합니다. Type II를 쓸 수 없으면 Type I 사용을 고려합니다.","LOUT는 제품·희석 비율마다 다릅니다(뒤쪽 수용 목록 표). 너무 추워 Type II/IV를 못 쓰면 Type I만 남는데, Type I은 지속시간이 훨씬 짧습니다."],["이 조건은 -10°C 미만에서 지속시간이 없습니다.","어는 이슬비·약한 어는 비 칸에 붙는 각주입니다. -10°C보다 추우면 해당 칸은 쓸 수 없습니다."],["이 표의 지속시간을 쓰려면 사용하는 제빙액과 희석 비율이 '방빙 성능·공력 시험 통과 목록'(Table 61)에 있어야 합니다. 사용 제한이 있으면 확인해 적용해야 합니다.",""],["LOUT(최저 운용 사용 온도)을 반드시 지켜야 합니다. Type IV를 쓸 수 없으면 Type I 사용을 고려합니다.","LOUT는 제품·희석 비율마다 다릅니다(뒤쪽 수용 목록 표). 너무 추워 Type II/IV를 못 쓰면 Type I만 남는데, Type I은 지속시간이 훨씬 짧습니다."],["'기타(Other)' 열: 강한 눈, 얼음 싸라기(PL/IP), 보통·강한 어는 비, 작은 우박(GS), 우박(GR) — 지속시간이 없습니다. 다만 Type IV는 얼음 싸라기·작은 우박에 한해 별도 '허용 시간(Allowance Times)' 표가 있습니다 (Table 55 = Type IV EG · Table 56 = Type IV PG — Table 53에 검증된 제품일 때).","허용 시간 표는 제품이 Table 53(허용 시간 검증 목록)에 있고 회사가 승인한 경우에만 씁니다. 강한 눈·보통 이상 어는 비·우박은 여전히 시간이 없습니다."],["'기타(Other)' 열: 강한 눈, 얼음 싸라기(PL/IP), 보통·강한 어는 비, 작은 우박(GS), 우박(GR) — 지속시간이 없습니다. 다만 Type IV는 얼음 싸라기·작은 우박에 한해 별도 '허용 시간(Allowance Times)' 표가 있습니다 (Table 56 = Type IV PG).","허용 시간 표는 제품이 Table 53(허용 시간 검증 목록)에 있고 회사가 승인한 경우에만 씁니다. 강한 눈·보통 이상 어는 비·우박은 여전히 시간이 없습니다."],["'기타(Other)' 열: 강한 눈, 얼음 싸라기(PL/IP), 보통·강한 어는 비, 작은 우박(GS), 우박(GR) — 지속시간이 없습니다. 다만 Type IV는 얼음 싸라기·작은 우박에 한해 별도 '허용 시간(Allowance Times)' 표가 있습니다 (Table 55 = Type IV EG).","허용 시간 표는 제품이 Table 53(허용 시간 검증 목록)에 있고 회사가 승인한 경우에만 씁니다. 강한 눈·보통 이상 어는 비·우박은 여전히 시간이 없습니다."],["'기타(Other)' 열: 강한 눈, 얼음 싸라기(PL/IP), 보통·강한 어는 비, 작은 우박(GS), 우박(GR) — 지속시간이 없습니다. 다만 Type IV는 얼음 싸라기·작은 우박에 한해 별도 '허용 시간(Allowance Times)' 표가 있습니다 (조정표 Adj-54 = Type IV EG · 조정표 Adj-55 = Type IV PG — Table 53에 검증된 제품일 때).","허용 시간 표는 제품이 Table 53(허용 시간 검증 목록)에 있고 회사가 승인한 경우에만 씁니다. 강한 눈·보통 이상 어는 비·우박은 여전히 시간이 없습니다."],["'기타(Other)' 열: 강한 눈, 얼음 싸라기(PL/IP), 보통·강한 어는 비, 작은 우박(GS), 우박(GR) — 지속시간이 없습니다. 다만 Type IV는 얼음 싸라기·작은 우박에 한해 별도 '허용 시간(Allowance Times)' 표가 있습니다 (조정표 Adj-55 = Type IV PG).","허용 시간 표는 제품이 Table 53(허용 시간 검증 목록)에 있고 회사가 승인한 경우에만 씁니다. 강한 눈·보통 이상 어는 비·우박은 여전히 시간이 없습니다."],["'기타(Other)' 열: 강한 눈, 얼음 싸라기(PL/IP), 보통·강한 어는 비, 작은 우박(GS), 우박(GR) — 지속시간이 없습니다. 다만 Type IV는 얼음 싸라기·작은 우박에 한해 별도 '허용 시간(Allowance Times)' 표가 있습니다 (조정표 Adj-54 = Type IV EG).","허용 시간 표는 제품이 Table 53(허용 시간 검증 목록)에 있고 회사가 승인한 경우에만 씁니다. 강한 눈·보통 이상 어는 비·우박은 여전히 시간이 없습니다."]],"p":{"10":{"n":[[1,0],[2,1],[3,2],[4,3],[5,4]],"c":"F"},"12":{"n":[[1,5],[2,1],[3,2],[4,6],[5,7],[6,8],[7,9],[8,10],[9,11],[10,12],[11,13]],"c":"I"},"13":{"n":[[1,5],[2,1],[3,2],[4,6],[5,7],[6,8],[7,9],[8,10],[9,11],[10,12],[11,13]],"c":"I"},"15":{"n":[[1,14],[2,15],[3,6],[4,7],[5,8],[6,9],[7,10],[8,11],[9,12],[10,13],[11,16]],"c":"II"},"16":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"17":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"18":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"19":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"20":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"21":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"22":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"23":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"24":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"25":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"26":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"27":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"33":{"n":[[1,17],[2,18],[3,6],[4,7],[5,8],[6,9],[7,10],[8,11],[9,12],[10,19],[11,16]],"c":"IV"},"34":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,20],[10,16]],"c":"IV"},"35":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"36":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"37":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"38":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"39":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,21],[10,16]],"c":"IV"},"40":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"41":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,20],[10,16]],"c":"IV"},"42":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,20],[10,16]],"c":"IV"},"43":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,21],[10,16]],"c":"IV"},"44":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,21],[10,16]],"c":"IV"},"45":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,21],[10,16]],"c":"IV"},"46":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,20],[10,16]],"c":"IV"},"47":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,20],[10,16]],"c":"IV"},"48":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,20],[10,16]],"c":"IV"},"49":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,20],[10,16]],"c":"IV"},"50":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,21],[10,16]],"c":"IV"},"51":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,20],[10,16]],"c":"IV"},"52":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"53":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"54":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,20],[10,16]],"c":"IV"},"55":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,21],[10,16]],"c":"IV"},"56":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,20],[10,16]],"c":"IV"},"57":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"58":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"59":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"60":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"61":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,20],[10,16]],"c":"IV"},"62":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,21],[10,16]],"c":"IV"},"63":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"64":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"65":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"96":{"n":[[5,0],[6,1],[7,2],[8,3],[9,4]],"c":"F"},"98":{"n":[[1,5],[2,1],[3,2],[4,6],[5,7],[6,8],[7,9],[8,10],[9,11],[10,12],[11,13]],"c":"I"},"99":{"n":[[1,5],[2,1],[3,2],[4,6],[5,7],[6,8],[7,9],[8,10],[9,11],[10,12],[11,13]],"c":"I"},"101":{"n":[[1,14],[2,15],[3,6],[4,7],[5,8],[6,9],[7,10],[8,11],[9,12],[10,13],[11,16]],"c":"II"},"102":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"103":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"104":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"105":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"106":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"107":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"108":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"109":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"110":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"111":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"112":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"113":{"n":[[1,15],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"II"},"119":{"n":[[1,17],[2,18],[3,6],[4,7],[5,8],[6,9],[7,10],[8,11],[9,12],[10,22],[11,16]],"c":"IV"},"120":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,23],[10,16]],"c":"IV"},"121":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"122":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"123":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"124":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"125":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,24],[10,16]],"c":"IV"},"126":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"127":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,23],[10,16]],"c":"IV"},"128":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,23],[10,16]],"c":"IV"},"129":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,24],[10,16]],"c":"IV"},"130":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,24],[10,16]],"c":"IV"},"131":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,24],[10,16]],"c":"IV"},"132":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,23],[10,16]],"c":"IV"},"133":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,23],[10,16]],"c":"IV"},"134":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,23],[10,16]],"c":"IV"},"135":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,23],[10,16]],"c":"IV"},"136":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,24],[10,16]],"c":"IV"},"137":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,23],[10,16]],"c":"IV"},"138":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"139":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"140":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,23],[10,16]],"c":"IV"},"141":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,24],[10,16]],"c":"IV"},"142":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"143":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"144":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"145":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"146":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"147":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,23],[10,16]],"c":"IV"},"148":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,24],[10,16]],"c":"IV"},"149":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"150":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"},"151":{"n":[[1,18],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,16]],"c":"IV"}}};
    const DX_READ = [
      "시간은 '시:분'입니다. 예) 1:05 - 1:45 = 1시간 5분 ~ 1시간 45분.",
      "범위의 짧은 값은 그 강도 구간에서 강수가 '강한 쪽', 긴 값은 '약한 쪽' 기준입니다. 판단이 애매하면 짧은 값을 쓰세요.",
      "지속시간은 마지막 방빙액을 뿌리기 시작한 시각부터 셉니다. 2단계(2 STEP) 작업이면 2단계(방빙) 시작부터입니다.",
      "Fluid Concentration 100/0 · 75/25 · 50/50 = 제빙액 : 물 비율(%)입니다. 희석할수록 지속시간이 짧고 쓸 수 있는 최저 기온도 높아집니다.",
      "빨간 칸 'CAUTION: No holdover time guidelines exist' = 그 조건은 지속시간이 없습니다(표로는 출발 판단 불가).",
      "지속시간은 출발 계획용입니다. 지나면 회사 절차에 따라 재제빙 또는 이륙 전 오염 점검이 필요합니다."
    ];
    const DX_CAUT_COMMON = ['이 자료를 적용하는 책임은 사용자에게 있습니다.', '악기상, 강한 강수, 수분이 많은 조건에서는 보호 시간이 짧아집니다.', '강한 바람, 다른 항공기의 제트 후류, 날리는 눈은 지속시간을 표의 가장 짧은 값보다도 더 짧게 만들 수 있습니다.', '항공기 표면 온도가 외기온도보다 낮으면(예: 연료가 차가운 날개) 지속시간이 줄어들 수 있습니다.', '지상 제방빙액은 비행 중 착빙을 막아주지 않습니다.', '이 표는 출발 계획용이며 이륙 전 점검 절차와 함께 써야 합니다.'];
    const DX_CAUT = {
      F: ['이 자료를 적용하는 책임은 사용자에게 있습니다.', '지상 제방빙액은 비행 중 착빙을 막아주지 않습니다.', '이 표는 출발 계획용이며 이륙 전 점검 절차와 함께 써야 합니다.'],
      I: DX_CAUT_COMMON,
      II: [...DX_CAUT_COMMON, '연료탱크 부근 날개 아랫면에 서리나 얼음이 있으면(날개가 차갑게 식은 상태, cold-soaked wing) 방빙 단계에서 Type II·IV 50/50 희석액을 쓰면 안 됩니다 — 제빙액이 얼 수 있습니다.'],
      IV: [...DX_CAUT_COMMON, '연료탱크 부근 날개 아랫면에 서리나 얼음이 있으면(날개가 차갑게 식은 상태, cold-soaked wing) 방빙 단계에서 Type II·IV 50/50 희석액을 쓰면 안 됩니다 — 제빙액이 얼 수 있습니다.']
    };
    const DX_T57 = [
      ["눈·싸락눈·눈 알갱이(SN·SG·SP)일 때 Type I~IV 지속시간의 강설 강도는 METAR/SPECI 시정이나 조종사가 관측한 시정으로 이 표에서 정합니다. 날린 눈(BLSN·DRSN)이 함께 있거나, 눈에 얼음 결정·어는 안개·비·이슬비가 섞인 경우에도 이 표를 씁니다.", ""],
      ["RVR은 이 표의 시정으로 쓸 수 없습니다.", "함정: 활주로 RVR이 아니라 METAR의 우세 시정(prevailing visibility)을 씁니다."],
      ["METAR에 관제탑 시정과 지상 시정이 함께 있으면 공식 지상(surface) 시정을 우선 씁니다(본문 또는 RMK).", ""],
      ["눈과 함께 안개·연무·연기 등으로 시정이 줄면 이 표가 실제 강설 강도를 높게 볼 수 있습니다. 하지만 METAR에 보고된 강도(-SN 등)는 HOT 기준과 직접 맞지 않아 실제보다 낮게 볼 수 있으므로, 모든 눈 조건에서 이 표를 쓰는 것을 권장합니다.", ""],
      ["예) CYVO 160200Z 15011G17KT 1SM -SN DRSN OVC009 M06/M08 — METAR는 약한 눈(-SN)이지만, 야간·시정 1SM·-6°C를 이 표로 보면 '보통(moderate)'입니다. 지속시간은 METAR의 '약한'이 아니라 '보통'으로 찾아야 합니다.", "표 읽기: 주간/야간 → 기온 구간 → 시정(SM 또는 m)으로 강도를 찾습니다. 야간에는 같은 시정이라도 강도가 더 높게 나옵니다."]
    ];
    const dxTitle = s => s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\b(Mp|Iv|Ii|Abc|Eg|Pg|Llc|Adf|Aaf|Fcy)\b/gi, w => w.toUpperCase());
    const dxEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const dxIsCoad = n => /\bCOAD\d/.test(String(n.notamId || ''));
    let dxDoc = null;
    async function dxPdf() {
      if (dxDoc) return dxDoc;
      if (typeof hotLoad === 'function') { try { dxDoc = await hotLoad(); if (dxDoc) return dxDoc; } catch (e) { } }
      const r = await fetch(DX_PDF_URL); if (!r.ok) throw new Error('HOT 표 파일을 받지 못했습니다');
      const data = new Uint8Array(await r.arrayBuffer());
      dxDoc = typeof openPdf === 'function' ? await openPdf(data) : await window.pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
      return dxDoc;
    }
    // COAD 글에서 제빙액 제품 찾기 → 'sNN' 목록
    function dxCoadKeys(n) {
      const T = String(n.rawText || n.etext || '').toUpperCase().replace(/[®™]/g, '').replace(/[’`]/g, "'").replace(/\s+/g, ' ');
      let ms = dxData.fluids.filter(f => f.id[0] === 's').filter(f => { const k = f.name.toUpperCase(), alt = k.split(' ').slice(1).join(' '); return T.includes(k) || (alt.split(' ').length >= 2 && alt.length >= 10 && T.includes(alt)); });
      ms = ms.filter(x => !ms.some(o => o !== x && o.name.length > x.name.length && o.name.toUpperCase().startsWith(x.name.toUpperCase())));
      return ms.map(f => f.id).join(',');
    }
    // ===== 🧮 HOT 계산기 (FAA HOT 표 데이터: hot/hot-data.json — 원본 표와 칸별 대조 검증 후 생성) =====
    // 결과는 항상 원본 표 페이지의 해당 칸에 테두리를 그려 함께 보여준다 (눈으로 재확인용)
    let dxData = null, dxS = null;
    const DX_PRECIP = [
      ['frost', '서리 (Active Frost)'],
      ['fzfg', '어는 안개 · 어는 안개비 · 얼음 결정 (FZFG · 영하 BR · IC)'],
      ['snfg', '눈 + 어는 안개 (SN + FZFG)'],
      ['snow', '눈 · 싸락눈 · 눈 알갱이 (SN · SG · SP)'],
      ['fzdz', '어는 이슬비 (FZDZ, 강도 무관)'],
      ['lfzr', '약한 어는 비 (-FZRA)'],
      ['snra', '눈 섞인 비 (보통 눈 + 비)'],
      ['rcsw', '차가운 날개 위의 비 (Cold-Soaked Wing, 0°C 초과)'],
      ['other', '기타: 강한 눈 · 얼음 싸라기(PL) · 보통 이상 어는 비 · 우박']
    ];
    // 회사 기종 → Type I 표 날개 표면 (날개가 주로 복합재: A220·A350·787·777-9 / 나머지 알루미늄)
    const DX_AC = [
      ['A220', 'A220', 'comp', /^BCS[13]$/], ['A321', 'A321', 'alu', /^A32[01N]|^A21N$/], ['A330', 'A330', 'alu', /^A33/], ['A350', 'A350', 'comp', /^A35/],
      ['A380', 'A380', 'alu', /^A38/], ['B737', 'B737', 'alu', /^B73|^B3[89]M$/], ['B747', 'B747', 'alu', /^B74/], ['B777', 'B777 (-200/-300)', 'alu', /^B77[23LW]$/],
      ['B779', 'B777-9 (777X)', 'comp', /^B77[89]$|^B779$/], ['B787', 'B787', 'comp', /^B78/]
    ];
    const dxAcOf = id => DX_AC.find(a => a[0] === id) || DX_AC[1];
    const DX_INT = { VL: '매우 약함', L: '약함', M: '보통', H: '강함' };
    const DX_COLNM = { fzfg: '어는 안개·어는 안개비·얼음 결정', snfg: '눈+어는 안개', sn: '눈(공통)', vlsn: '매우 약한 눈', lsn: '약한 눈', msn: '보통 눈', fzdz: '어는 이슬비', lfzr: '약한 어는 비', snra: '보통 눈 섞인 비', rcsw: '차가운 날개 위의 비', other: '기타' };
    const dxHm = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    async function dxLoad() { if (!dxData) { const r = await fetch(DX_DATA_URL, { cache: 'no-cache' }); if (!r.ok) throw new Error('HOT 데이터를 받지 못했습니다'); dxData = await r.json(); } return dxData; }
    // 태양 고도(°) — 주간/야간 판단용 (NOAA 근사식)
    function dxSunElev(lat, lon, ms) {
      const d = new Date(ms), rad = Math.PI / 180, jd = ms / 864e5 + 2440587.5, n = jd - 2451545;
      const L = (280.46 + 0.9856474 * n) % 360, g = (357.528 + 0.9856003 * n) % 360;
      const lam = L + 1.915 * Math.sin(g * rad) + 0.02 * Math.sin(2 * g * rad), eps = 23.439 - 0.0000004 * n;
      const dec = Math.asin(Math.sin(eps * rad) * Math.sin(lam * rad));
      const ra = Math.atan2(Math.cos(eps * rad) * Math.sin(lam * rad), Math.cos(lam * rad)) / rad;
      const gmst = (280.46061837 + 360.98564736629 * n) % 360, ha = ((gmst + lon - ra) % 360 + 540) % 360 - 180;
      return Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha * rad)) / rad;
    }
    function dxT57(vis, night, oat) {
      const T = dxData.t57, i = T.bins.findIndex(b => b == null || vis <= b);
      return T.rows[i < 0 ? T.bins.length - 1 : i][(night ? 2 : 0) + (oat > -1 ? 1 : 0)];
    }
    // 출발 공항 METAR(없으면 ETD TAF)·COAD로 기본값 채우기
    function dxAuto() {
      const ty = (pdfFlt && pdfFlt.type) || '', acm = DX_AC.find(a => a[3].test(ty));
      const S = { ac: acm ? acm[0] : 'A321', fluid: 'g20', conc: '100/0', surf: 'alu', oat: null, precip: 'frost', intMode: 'vis', int: 'L', vis: 9999, night: false, adj: false, src: [] };
      S.surf = dxAcOf(S.ac)[2]; S.src.push(`기종: ${acm ? 'OFP ' + ty + ' → ' : '기본 '}${dxAcOf(S.ac)[1]}`);
      const dep = info.dep, w = flightWindow();
      try {
        const cd = (ofpOrdered || []).filter(n => dxIsCoad(n) && n.secCode === dep).map(n => dxCoadKeys(n)).filter(Boolean).join(',').split(',').filter(Boolean);
        const sp = cd.find(k => /^s\d/.test(k) && (dxData.fluids.find(f => f.id === k) || {}).type === 'IV') || cd.find(k => /^s\d/.test(k));
        if (sp) { S.fluid = sp; S.src.push(`제빙액: ${dep} COAD 제품`); } else S.src.push(`제빙액: ${dep} COAD에 제품 없음 → Type IV 공통 표`);
      } catch (e) { }
      const lv = (typeof wxLive !== 'undefined' && wxLive[dep]) || {};
      let el = null, raw = '', when = Date.now(), srcTxt = '';
      if (lv.metar) { el = tafElems(lv.metar.split(/\s+/).slice(2)); raw = lv.metar; srcTxt = 'METAR'; S.oat = metarTemp(lv.metar); }
      else if (pdfTaf && pdfTaf[dep] && w) { const r = tafAt(pdfTaf[dep], w.etd); el = { ...r.st, wx: [...(r.st.wx || []), ...r.notes.flatMap(g => (g.el && g.el.wx) || [])] }; raw = pdfTaf[dep].raw || ''; when = w.etd; srcTxt = 'ETD TAF'; }
      if (S.oat == null && lv.om && w) { const t = omTempAt(lv.om, w.etd); if (t != null) { S.oat = Math.round(t); S.src.push('기온: ETD 예보 기온'); } } else if (S.oat != null) S.src.push('기온: 현재 METAR');
      if (el) {
        const wx = (el.wx || []).join(' ');
        S.vis = el.vis ?? 9999;
        const ll = airportLL(dep); if (ll) S.night = dxSunElev(ll[0], ll[1], when) < 0;
        const t = S.oat;
        if (/\+(SH)?SN|PL|GR|GS/.test(wx)) S.precip = 'other';
        else if (/(^|\s)(\+)?FZRA/.test(wx) && !/-FZRA/.test(wx)) S.precip = 'other';
        else if (/-FZRA/.test(wx)) S.precip = 'lfzr';
        else if (/FZDZ/.test(wx)) S.precip = 'fzdz';
        else if (/SN|SG/.test(wx) && /FZFG/.test(wx)) S.precip = 'snfg';
        else if (/SN|SG/.test(wx) && /RA|DZ/.test(wx)) S.precip = 'snra';
        else if (/SN|SG/.test(wx)) S.precip = 'snow';
        else if (/FZFG|IC/.test(wx) || (/BR|FG/.test(wx) && t != null && t <= 0)) S.precip = 'fzfg';
        else if (/RA|DZ/.test(wx) && t != null && t > 0) S.precip = 'rcsw';
        else S.precip = 'frost';
        S.src.push(`강수: ${srcTxt} ${wx || '현상 없음'}${S.precip === 'frost' ? ' → 서리 기준 (강수 없음)' : ''}`);
        S.src.push(`시정 ${S.vis >= 9999 ? '10km 이상' : S.vis + 'm'} · ${S.night ? '야간' : '주간'} (태양 고도 기준)`);
      } else S.src.push('METAR/TAF 없음 — 직접 입력하세요');
      if (S.oat == null) S.oat = 0;
      return S;
    }
    function dxCalc(S) {
      const D = dxData, f = D.fluids.find(x => x.id === S.fluid), R = { msgs: [], notes: [] };
      if (!f) return { err: '제빙액을 고르세요' };
      const ty = f.type, oat = +S.oat;
      const inBand = b => (b.lo == null || oat >= b.lo) && (b.hi == null || oat < b.hi);
      if (S.precip === 'frost') {
        const Fr = S.adj ? D.frost.adj : D.frost.main; R.page = Fr.p; R.pw = Fr.w; R.table = S.adj ? 'Table Adj-1' : 'Table 1'; R.col = '서리';
        if (ty === 'I') { const v = Fr.t1[S.surf]; R.ok = true; R.min = R.max = v[0]; R.box = v[1]; R.band = '모든 기온 (LOUT 이상)'; R.msgs.push('Type I 서리 지속시간은 기온과 관계없이 한 값입니다. 혼합액 어는점이 외기온도보다 10°C 이상 낮아야 합니다.'); return R; }
        const b = Fr.bands.find(inBand); if (!b) return { ...R, err: '이 기온에 해당하는 구간이 없습니다' };
        R.band = b.lbl; const row = b.rows.find(r => r.c === S.conc);
        if (!row) return { ...R, err: `이 기온(${b.lbl})에서는 ${S.conc} 희석액을 쓸 수 없습니다 (가능: ${b.rows.map(r => r.c).join(', ')})` };
        const v = row.v[ty === 'II' ? 'ii' : 'iv']; if (!v) return { ...R, noHot: '이 기온에서는 서리 지속시간이 없습니다 (No Holdover Time Guidelines Exist)' };
        R.ok = true; R.min = R.max = v[0]; R.box = v[1]; R.conc = S.conc;
        R.msgs.push('서리 표의 Type II·IV 값은 제품과 관계없는 공통 값입니다. 서리가 오래 이어지면 이륙 전까지 가장 추웠던 기온 기준으로 다시 확인하세요.');
        return R;
      }
      const src = ty === 'I' ? f[S.surf] : f, pg = S.adj ? src.pa : src.p, T = D.tables[pg];
      R.page = pg; R.pw = T.w; R.table = `${S.adj ? 'Table Adj-' : 'Table '}${src.t}`;
      // 강수 → 표의 열
      let col = S.precip, int = null;
      if (['snow', 'snfg', 'snra'].includes(S.precip)) {
        int = S.intMode === 'vis' ? dxT57(+S.vis, S.night, oat) : S.int; R.int = int;
        if (S.intMode === 'vis') R.msgs.push(`Table 57: 시정 ${+S.vis >= 9999 ? '10km 이상' : S.vis + 'm'} · ${S.night ? '야간' : '주간'} · ${oat > -1 ? '-1°C 초과' : '-1°C 이하'} → 강설 강도 '${DX_INT[int]}'`);
        if (int === 'H') return { ...R, noHot: "강설 강도가 '강함(heavy)'이라 지속시간이 없습니다 (Table 57 · 각주)." };
      }
      if (S.precip === 'snow') col = T.cols.includes('sn') ? 'sn' : { VL: 'vlsn', L: 'lsn', M: 'msn' }[int];
      if (S.precip === 'snra') { if (int === 'VL' || int === 'L') { col = 'lfzr'; R.msgs.push("약한 눈 + 비는 '눈 섞인 비' 열이 아니라 '약한 어는 비' 열을 씁니다 (각주)."); } else col = 'snra'; }
      if (S.precip === 'other') return { ...R, col: DX_COLNM.other, noHot: "강한 눈·얼음 싸라기·보통 이상 어는 비·우박은 지속시간이 없습니다. (Type IV는 얼음 싸라기·작은 우박에 한해 회사 승인 시 Allowance Times 표 사용)" };
      R.col = DX_COLNM[col] || col;
      const b = T.bands.find(inBand);
      const minLo = Math.min(...T.bands.filter(x => x.lo != null).map(x => x.lo));
      if (!b) return { ...R, err: oat < minLo ? `외기온도 ${oat}°C는 이 제빙액 표의 최저 온도(${minLo}°C)보다 낮아 쓸 수 없습니다 (LOUT). Type I 사용을 고려하세요.` : '이 기온에 해당하는 구간이 없습니다' };
      R.band = b.lbl;
      const row = ty === 'I' ? b.rows[0] : b.rows.find(r => r.c === S.conc);
      if (!row) return { ...R, err: `이 기온(${b.lbl})에서는 ${S.conc} 희석액을 쓸 수 없습니다 (가능: ${b.rows.map(r => r.c).join(', ')}). LOUT 확인.` };
      R.conc = ty === 'I' ? 'Type I 혼합액' : S.conc;
      const cf = (T.colfn[col] || []), allFn = Object.values(T.colfn).flat(), base = allFn.length ? Math.min(...allFn) : 1;
      for (let i = 1; i < base; i++) R.notes.push(i);
      cf.forEach(n => R.notes.push(n));
      const v = row.v[col];
      if (!v) return { ...R, noHot: '이 조건은 표에서 빨간 칸(No holdover time guidelines exist)입니다 — 지속시간이 없습니다.' };
      if (v[3]) R.notes.push(+v[3]);
      // 각주 조건 적용: '0°C 이하 지속시간 없음' · '-10°C 미만 지속시간 없음' (같은 기온 구간 안에서도 걸림)
      const K = DX_KO.p[pg], txt = n => { const it = K && K.n.find(x => x[0] === n); return it ? DX_KO.d[it[1]][0] : ''; };
      const fnSet = [...new Set([...cf, ...(v[3] ? [+v[3]] : [])])];
      if (fnSet.some(n => /0°C 이하에서 지속시간이 없습니다/.test(txt(n))) && oat <= 0) return { ...R, noHot: `각주: 이 조건(${R.col})은 0°C 이하에서 지속시간이 없습니다.` };
      if (fnSet.some(n => /-10°C 미만에서 지속시간이 없습니다/.test(txt(n))) && oat < -10) return { ...R, noHot: `각주: 이 조건(${R.col})은 -10°C 미만에서 지속시간이 없습니다.` };
      R.ok = true; R.min = v[0]; R.max = v[1]; R.box = v[2];
      if (S.precip === 'fzdz') R.msgs.push('어는 이슬비인지 확실하지 않으면 약한 어는 비 값을 쓰세요.');
      return R;
    }
    function dxFluidOpts(sel) {
      const g = t => dxData.fluids.filter(f => f.type === t).map(f => `<option value="${f.id}" ${f.id === sel ? 'selected' : ''}>${dxEsc(f.id.startsWith('s') ? `Table ${f.t} · ${dxTitle(f.name)}` : f.name)}</option>`).join('');
      return `<optgroup label="Type I">${g('I')}</optgroup><optgroup label="Type II">${g('II')}</optgroup><optgroup label="Type IV">${g('IV')}</optgroup>`;
    }
    async function dxOpen() {
      try { await dxLoad(); } catch (e) { alert(e.message); return; }
      dxS = dxAuto();
      let m = document.getElementById('dx-modal');
      if (!m) {
        m = document.createElement('div'); m.id = 'dx-modal';
        m.style.cssText = 'position:fixed;inset:0;z-index:9600;background:rgba(2,6,23,.85);overflow:auto';
        document.body.appendChild(m);
        m.addEventListener('input', dxFromForm); m.addEventListener('change', dxFromForm);
        m.addEventListener('click', e => {
          if (e.target.closest('[data-dx-close]')) { m.style.display = 'none'; document.body.style.overflow = ''; }
          if (e.target.closest('[data-dx-auto]')) { dxS = dxAuto(); dxDraw(true); }
        });
      }
      m.style.display = 'block'; document.body.style.overflow = 'hidden';
      dxDraw(true);
    }
    function dxFromForm(e) {
      const m = document.getElementById('dx-modal'), q = n => m.querySelector(`[name="${n}"]`);
      const S = dxS;
      if (e && e.target && e.target.name === 'ac') { S.ac = q('ac').value; S.surf = dxAcOf(S.ac)[2]; q('surf').value = S.surf; }
      S.fluid = q('fluid').value; S.conc = q('conc').value; S.surf = q('surf').value; S.oat = q('oat').value === '' ? 0 : +q('oat').value;
      S.precip = q('precip').value; S.intMode = m.querySelector('[name="intMode"]:checked').value; S.int = q('int').value; S.vis = +q('vis').value || 0; S.night = q('night').value === '1'; S.adj = q('adj').checked;
      dxDraw(e && e.target && e.target.name === 'fluid');
    }
    const dxSel = (name, opts, v) => `<select name="${name}" class="w-full bg-slate-900 border border-slate-600 rounded-md px-2 py-1.5 text-[13px] text-slate-100">${opts.map(([k, l]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${dxEsc(l)}</option>`).join('')}</select>`;
    function dxDraw(full) {
      const m = document.getElementById('dx-modal'), S = dxS, f = dxData.fluids.find(x => x.id === S.fluid) || {};
      const lab = (t, inner, hide) => `<label style="display:${hide ? 'none' : 'block'}"><div class="text-[11px] text-slate-400 mb-0.5">${t}</div>${inner}</label>`;
      const isSnow = ['snow', 'snfg', 'snra'].includes(S.precip);
      if (full) m.innerHTML = `<div style="max-width:1100px;margin:0 auto;padding:12px">
        <div class="flex items-center gap-2 flex-wrap mb-2"><span class="text-[15px] font-bold text-cyan-200">🧊 제방액 검색기 (HOT)</span><span class="text-[11px] text-slate-400">${dxEsc(dxData.ver)}</span>
          <span class="ml-auto flex gap-1.5"><button type="button" data-dx-auto class="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-600 text-[12px] text-slate-200">↺ METAR·COAD로 다시 채우기</button><button type="button" data-dx-close class="px-2.5 py-1 rounded-md bg-rose-700 text-white text-[12px] font-bold">닫기 ✕</button></span></div>
        <div data-dx-src class="text-[11px] text-slate-400 mb-2"></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px" class="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
          ${lab('기종', dxSel('ac', DX_AC.map(a => [a[0], `${a[1]} — 날개 ${a[2] === 'comp' ? '복합재' : '알루미늄'}`]), S.ac))}
          ${lab('제빙액', `<select name="fluid" class="w-full bg-slate-900 border border-slate-600 rounded-md px-2 py-1.5 text-[13px] text-slate-100">${dxFluidOpts(S.fluid)}</select>`)}
          ${lab('희석 비율 (제빙액/물 %)', dxSel('conc', [['100/0', '100/0'], ['75/25', '75/25'], ['50/50', '50/50']], S.conc))}
          ${lab('날개 표면 (Type I 표, 기종에 따라 자동)', dxSel('surf', [['alu', '알루미늄 (Table 2)'], ['comp', '복합재 (Table 3)']], S.surf))}
          ${lab('외기온도 (°C)', `<input name="oat" type="number" step="1" value="${S.oat}" class="w-full bg-slate-900 border border-slate-600 rounded-md px-2 py-1.5 text-[14px] mono text-slate-100">`)}
          ${lab('강수·기상 종류', dxSel('precip', DX_PRECIP, S.precip))}
          <div data-dx-int style="display:${isSnow ? 'block' : 'none'}"><div class="text-[11px] text-slate-400 mb-0.5">강설 강도</div>
            <div class="flex gap-3 text-[12px] text-slate-200 mb-1"><label><input type="radio" name="intMode" value="vis" ${S.intMode === 'vis' ? 'checked' : ''}> 시정으로 계산 (Table 57)</label><label><input type="radio" name="intMode" value="sel" ${S.intMode === 'sel' ? 'checked' : ''}> 직접 선택</label></div>
            <div class="flex gap-1.5"><input name="vis" type="number" step="100" value="${S.vis}" class="w-24 bg-slate-900 border border-slate-600 rounded-md px-2 py-1 text-[13px] mono text-slate-100" title="시정 (m)"><span class="text-[11px] text-slate-400 self-center">m</span>${dxSel('night', [['0', '주간'], ['1', '야간']], S.night ? '1' : '0')}${dxSel('int', [['VL', '매우 약함'], ['L', '약함'], ['M', '보통'], ['H', '강함']], S.int)}</div></div>
          <label class="flex items-center gap-2 text-[12px] text-amber-200 self-end"><input type="checkbox" name="adj" ${S.adj ? 'checked' : ''}> 플랩·슬랫을 미리 내리고 제방빙 (76% 조정표)</label>
        </div>
        <div data-dx-out class="mt-3"></div></div>`;
      // 필드 표시 조건
      const q = n => m.querySelector(`[name="${n}"]`);
      q('conc').closest('label').style.display = f.type === 'I' ? 'none' : 'block';
      q('surf').closest('label').style.display = f.type === 'I' ? 'block' : 'none';
      m.querySelector('[data-dx-int]').style.display = isSnow ? 'block' : 'none';
      q('vis').style.display = q('night').style.display = S.intMode === 'vis' ? '' : 'none'; q('int').style.display = S.intMode === 'sel' ? '' : 'none';
      m.querySelector('[data-dx-src]').textContent = '자동 채움: ' + (S.src.join(' · ') || '—');
      const R = dxCalc(S), out = m.querySelector('[data-dx-out]');
      const K = DX_KO.p[R.page], noteHtml = K && R.notes && R.notes.length ? `<div class="mt-2 text-[13px] leading-snug"><div class="font-bold text-cyan-200 mb-1">📘 이 칸에 붙은 각주</div>${[...new Set(R.notes)].sort((a, b) => a - b).map(n => { const it = K.n.find(x => x[0] === n); if (!it) return ''; const d = DX_KO.d[it[1]]; return `<div class="flex gap-2 my-1"><b class="text-cyan-300 w-5 shrink-0">${n}</b><div class="text-slate-200">${dxEsc(d[0])}${d[1] ? `<div class="text-amber-300 text-[12px]">⚠ ${dxEsc(d[1])}</div>` : ''}</div></div>`; }).join('')}</div>` : '';
      const head = R.ok ? `<div class="text-[12px] text-slate-400">지속시간 (HOT)</div><div class="mono font-bold text-emerald-300" style="font-size:40px;line-height:1.1">${R.min === R.max ? dxHm(R.min) : `${dxHm(R.min)} ~ ${dxHm(R.max)}`}</div>
            <div class="text-[12px] text-slate-300">${R.min === R.max ? '' : `짧은 값 ${dxHm(R.min)} = 이 구간에서 강수가 강한 쪽 · 긴 값 ${dxHm(R.max)} = 약한 쪽`}</div>`
        : `<div class="text-[18px] font-bold text-rose-300">${R.noHot ? '⛔ 지속시간 없음' : '⚠ 계산할 수 없음'}</div><div class="text-[13px] text-rose-100 mt-1">${dxEsc(R.noHot || R.err || '')}</div>`;
      out.innerHTML = `<div class="rounded-xl border ${R.ok ? 'border-emerald-600' : 'border-rose-600'} bg-slate-950 p-3">
          ${head}
          <div class="text-[12px] text-slate-300 mt-2">${[R.table && `${dxEsc(R.table)} (${R.page}쪽)`, R.band && `기온 구간: ${dxEsc(R.band)}`, R.conc && `희석: ${dxEsc(R.conc)}`, R.col && `열: ${dxEsc(R.col)}`, R.int && `강설 강도: ${DX_INT[R.int]}`, `기종: ${dxAcOf(S.ac)[1]}${(dxData.fluids.find(x => x.id === S.fluid) || {}).type === 'I' ? ` → Type I ${S.surf === 'comp' ? '복합재' : '알루미늄'} 표${S.surf !== dxAcOf(S.ac)[2] ? ' (기종 기본과 다르게 선택함)' : ''}` : ''}`].filter(Boolean).join(' · ')}</div>
          ${R.msgs.map(t => `<div class="text-[12.5px] text-amber-200 mt-1">• ${dxEsc(t)}</div>`).join('')}
          ${noteHtml}
          <div class="text-[11px] text-slate-500 mt-2">회사 기종은 모두 고속 항공기(회전 속도 약 100KT 이상) 기준입니다 — LOUT는 수용 목록(Table 58~61)의 고속 항공기 값을 봅니다. 참고용 계산입니다. 아래 원본 표의 빨간 테두리 칸으로 값을 다시 확인하고, 회사 절차·LOUT·제품 목록(Table 58~61)을 따르세요.</div>
        </div>
        <div class="mt-3 rounded-xl bg-white p-1" data-dx-page style="min-height:120px"><div class="text-[12px] text-slate-500 p-2">원본 표 불러오는 중… (${R.page || ''}쪽)</div></div>`;
      dxRenderPage(R);
    }
    async function dxRenderPage(R) {
      const box = document.querySelector('#dx-modal [data-dx-page]'); if (!box || !R.page) { if (box) box.innerHTML = ''; return; }
      try {
        const doc = await dxPdf();
        const page = await doc.getPage(R.page), v0 = page.getViewport({ scale: 1 });
        const cssW = Math.max(320, box.clientWidth - 8), dpr = window.devicePixelRatio || 1, scale = cssW * dpr / v0.width;
        const vp = page.getViewport({ scale }), cv = document.createElement('canvas');
        cv.width = vp.width; cv.height = vp.height; cv.style.width = cssW + 'px';
        const ctx = cv.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        if (R.box) { const k = vp.width / (R.pw || v0.width), [x0, y0, x1, y1] = R.box, pad = 3 * dpr; ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 3.5 * dpr; ctx.strokeRect(x0 * k - pad, y0 * k - pad, (x1 - x0) * k + 2 * pad, (y1 - y0) * k + 2 * pad); }
        box.innerHTML = ''; box.appendChild(cv);
      } catch (e) { box.innerHTML = `<div class="text-[12px] text-rose-600 p-2">원본 표를 열지 못했습니다: ${dxEsc(e.message || e)}</div>`; }
    }
    document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-dx-open]')) dxOpen(); });
