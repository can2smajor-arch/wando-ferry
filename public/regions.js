// 완도뱃길 지역 설정 — 화면(index.html)과 서버(netlify/functions/api.mjs)가 함께 씁니다.
// 지역 하나 = 첫 화면에서 고르는 섬(또는 출발지). 지역마다 노선 묶음(groups), 날씨 격자(wx), 물때 좌표(tide), 특보 구역(warn)을 둡니다.
//
// 노선(line) 두 가지
//  1) 실시간형 {re, not, title:{out,in}, by, note, fallback}
//     - 해양교통안전공단(KOMSA) 오늘 운항 자료에서 운항항로명(route)이 re에 맞는 배를 모아 보여 줌
//     - 출항지(from)가 지역의 home에 맞으면 '나가기(out)', 아니면 '들어오기(in)'
//     - fallback: 공단 자료를 못 받을 때 보여 줄 시각(뒤에 ? = 확인 필요, 점선 표시)
//  2) 고정 시간표형 {fixed:true, dir, from, to, by, api, winter, summer, note} — 노화뱃길에서 옮겨 온 검증된 시간표
//     - 공단 자료에 없는 경유지(동천 등)가 있어 선사 시간표를 기준으로 하고, 공단 자료로 통제만 맞춰 봄
//
// tmr: 내일 운항예보 행 {mh:면허항로, gi:기항지, t:출항시각, st:운항구분, rs:사유} 중 이 묶음에 해당하는 것 고르기
// ※ 좌표·격자는 항구 부근 대략값입니다. 공단 항로명은 첫 배포 뒤 /api/komsa 의 names 목록을 보고 맞춥니다.
(function () {
  function seq(from, to, min) { const a = []; for (let h = from; h <= to; h++) a.push(String(h).padStart(2, '0') + ':' + min); return a; }
  const HG = '해광', NH = '농협';
  const tk = (a, op) => a.map((t) => ({ t, op }));

  // ───── 노화뱃길 시간표 (2026.11.19 기준 그대로) ─────
  const TK_W = [...tk([...seq(7, 16, '00'), '16:50', '17:40'], HG), ...tk([...seq(7, 16, '30'), '17:20', '18:00'], NH)];
  const TK_S_FROM_SY = [...tk(seq(7, 18, '00'), HG), ...tk([...seq(7, 16, '30'), '17:30', '18:30'], NH)];
  const TK_S_FROM_TK = [...tk(['06:40', ...seq(8, 18, '00')], HG), ...tk([...seq(7, 16, '30'), '17:30', '18:30'], NH)];
  const NB_TO_IM = [{ t: '08:57', at: '서넙도' }, { t: '09:27', at: '넙도' }, { t: '13:23', at: '서넙도' }, { t: '13:52', at: '넙도' }, { t: '16:23', at: '서넙도' }, { t: '16:52', at: '넙도' }];
  const NB_FROM_TK = ['07:20', '10:10', '13:20', '16:20'];
  const HH_OUT_W = ['07:00', '08:20', '09:20', '10:20', '11:20', '12:20', '13:20', '14:20', '15:20', '16:20', '17:20', '20:00'];
  const HH_IN_W = ['06:40', '07:50', '08:50', '09:50', '10:50', '11:50', '12:50', '13:50', '14:50', '15:50', '17:10', '21:00'];
  const HH_IN_S = ['06:40', '07:50?', '08:50?', '09:50?', '10:50?', '11:50?', '12:50?', '13:50?', '14:50?', '15:50?', '16:50?', '18:20?', '21:00'];

  // 특보 구역 (기상청 통보문의 구역 이름에서 찾음)
  const W_WANDO = { re: /완도(?!여서도)/, name: '완도' };
  const W_YEOSEO = { re: /여서도(?!\s*제외)/, name: '여서도' };
  const W_HAENAM = { re: /해남남부/, name: '해남남부(땅끝)' };
  const W_GOHEUNG = { re: /고흥/, name: '고흥' };
  const W_SEA_W = { re: /전남서부남해앞바다|남해서부앞바다(?!\()/, name: '전남서부 남해 앞바다' };
  const W_SEA_E = { re: /전남동부남해앞바다/, name: '전남동부 남해 앞바다' };
  const W_FAR_W = { re: /남해서부서쪽먼바다/, name: '남해서부 서쪽 먼바다' };
  const W_FAR_E = { re: /남해서부동쪽먼바다/, name: '남해서부 동쪽 먼바다' };

  // 실시간형 노선 만들기
  const L = (re, out, inn, by, more) => Object.assign({ re, title: { out, in: inn }, by }, more || {});
  const byRe = (re, not) => (r) => re.test(r.mh || '') && !(not && not.test(r.mh || ''));

  // 공통 노선 (지역마다 제목 방향만 다름)
  const RE = {
    cheongsan: /청산/, notYeoseo: /여서/,
    yeoseo: /여서/,
    modo: /완도-?모도|모도-?완도/,
    deogu: /덕우/,
    jeju: /완도.*(제주|추자)|(제주|추자).*완도/,
    hwaheung: /화흥포/,
    dangsa: /당사/,
    namseong: /남성|횡간/,
    iljeong: /일정/,
    dongsong: /동송/,
    seoseong: /서성/,
    gahak: /노력/,
    dangmokGahak: /당목.*(가학|금당)|(가학|금당).*당목/,
    geumdangNd: /(녹동|우두).*금당|금당.*(녹동|우두)/,
  };

  const LINKS_COMMON = [
    ['오늘 운항정보 (해양교통안전공단)', 'https://www.komsa.or.kr/prog/pssgCurState/kor/sub03_0202/list.do'],
    ['여객선 예매 (가보고싶은섬)', 'https://island.haewoon.co.kr/'],
  ];
  // 선사·항구 밴드: name 화면 이름, url 밴드 주소(모르면 null → 밴드 앱에서 검색 안내), sub 노선, re 밴드 API 목록에서 찾을 이름
  const BAND = {
    // 공단 완도운항관리센터: 완도 전 항로 통제 소식을 올림 → 모든 지역에 붙이되, 글에 그 지역 항구 이름(kw)이 있을 때만 공지 칸에 보여 줌
    komsa: { name: '완도운항관리센터', url: 'https://band.us/@kstwando', sub: '공단 · 완도 전 항로', re: /완도운항|운항관리센터|운항\s*정보\(완도/, all: true },
    soan: { name: '소안농협', url: 'https://band.us/band/70603408', sub: '동천·화흥포', re: /소안농협/ },
    nohwa: { name: '노화농협', url: 'https://band.us/band/77170845', sub: '산양·땅끝·넙도', re: /노화농협/ },
    haekwang: { name: '해광운수', url: 'https://band.us/band/99139814', sub: '산양·땅끝', re: /해광운수/ }, // 땅끝↔산양(노화) 공지만 올라옴
    dangmok: { name: '약산 당목항', url: 'https://band.us/@wandoyagsan', sub: '금일·생일', re: /당목/ },
    geumdang: { name: '완도농협 금당지점', url: 'https://band.us/band/96900810', sub: '노력↔가학 (완농페리2호)', re: /금당지점|완농페리2/ },
    cheongsan: { name: '청산도 선박운항시간표', url: 'https://band.us/@cheongsannonghyup', sub: '청산·완도', re: /청산도\s*선박/ },
  };
  const TEL_HH = [['동천 매표소', '061-553-5635'], ['화흥포 매표소', '061-555-1010'], ['소안농협 (선사)', '061-553-8188']];
  const TEL_TK = [['산양 매표소', '061-553-6107'], ['땅끝 매표소', '061-535-4268'], ['해광운수 땅끝 매표소', '061-535-5786'], ['노화농협 (선사)', '061-553-5688']];

  const R = [
    {
      id: 'wando', kw: /청산|여서|모도|덕우|제주|추자|화흥포|소안/, name: '완도읍', title: '완도항·화흥포에서 출발', desc: '청산·여서·모도·덕우·제주, 화흥포→소안·노화',
      home: /^(완도|화흥포)/, dir: ['완도에서 출발', '완도로 오는 배'],
      wx: { nx: 57, ny: 56, label: '완도읍' }, tide: { lat: '34.311', lot: '126.755', label: '완도항' },
      warn: [W_WANDO, W_SEA_W],
      groups: [
        { id: 'cs', label: '청산도', lines: [L(RE.cheongsan, '완도항 → 청산도', '청산도 → 완도항', '청산농협 · 약 50분', { not: RE.notYeoseo })], tmr: byRe(/청산/, /여서/) },
        { id: 'ys', label: '여서·장도', lines: [L(RE.yeoseo, '완도항 → 장도·청산·여서도', '여서도 → 완도항', '섬사랑7호(해광운수) · 하루 1왕복', { note: '여서도에서 출발해 청산도·장도를 거쳐 완도항으로 오는 배입니다.' })], tmr: byRe(/여서/) },
        { id: 'md', label: '모도', lines: [L(RE.modo, '완도항 → 모도', '모도 → 완도항', '섬사랑2호(해광운수) · 순환', { note: '순환 항로라 공단 자료에는 완도 출발 시각만 나옵니다.', fallback: { out: ['07:10?', '11:00?', '15:30?'] } })], tmr: byRe(/모도/) },
        { id: 'dw', label: '덕우·황제', lines: [L(RE.deogu, '완도항 → 모황·덕우·황제·생일', '덕우 쪽 → 완도항', '섬사랑5호(해광운수) · 순환', { note: '완도 → 모황 → 덕우 → 황제 → 덕우 → 생일 → 모황 → 완도 순서로 도는 배입니다(1항차, 선사 시간표). 기상·예약에 따라 들르지 않는 곳이 있습니다.' })], tmr: byRe(/덕우/) },
        { id: 'jj', label: '제주·추자', optional: true, lines: [L(RE.jeju, '완도항 → 제주·추자', '제주·추자 → 완도항', '대형 여객선')], tmr: byRe(/제주|추자/) },
        { id: 'hh', label: '화흥포→소안·노화', lines: [L(RE.hwaheung, '화흥포 → 동천(노화)·소안', '소안·동천 → 화흥포', '소안농협 · 약 35~55분', { note: '소안항에서 출발한 배가 노화 동천항을 거쳐 화흥포로 옵니다. 동천 시각은 노화·보길 지역에서 보세요.' })], tmr: byRe(/화흥포|소안/) },
      ],
      bands: [BAND.cheongsan, BAND.soan],
      tels: TEL_HH.slice(1),
      links: [['군청 시간표: 화흥포', 'https://www.wando.go.kr/wando/sub.cs?m=350']],
    },
    {
      id: 'nohwa', kw: /동천|화흥포|산양|땅끝|이목|넙|당사|남성|횡간|노화|보길/, name: '노화·보길', title: '노화도·보길도·넙도', desc: '동천↔화흥포, 산양↔땅끝, 넙도·서넙도, 당사·횡간·섬순회',
      // 노화뱃길과 같은 고정 시간표 방식
      wx: { nx: 53, ny: 53, label: '노화도' }, tide: { lat: '34.19', lot: '126.59', label: '동천항' },
      warn: [W_WANDO, W_HAENAM, W_SEA_W, W_FAR_W],
      groups: [
        {
          id: 'main', label: '완도·땅끝', dir: ['섬에서 나가기', '섬으로 들어오기'],
          ctl: /화흥포|땅끝산양/,
          lines: [
            { fixed: true, dir: 'out', from: '동천항', to: '화흥포항(완도)', by: '소안농협 · 약 35~40분', api: { port: '소안', re: /화흥포/, lo: -25, hi: -5 }, winter: HH_OUT_W, summer: ['07:00', '20:00'], noteS: '하절기 낮 시간대 배는 아직 넣지 못했습니다.' },
            { fixed: true, dir: 'out', from: '산양진항', to: '땅끝항(해남)', by: '해광운수·노화농협 · 약 30분', api: { port: '산양', re: /땅끝산양/, lo: -10, hi: 10 }, winter: TK_W, summer: TK_S_FROM_SY },
            { fixed: true, dir: 'in', from: '화흥포항(완도)', to: '동천항', by: '소안농협 · 약 35~40분', api: { port: '화흥포', re: /화흥포/, lo: -5, hi: 10 }, winter: HH_IN_W, summer: HH_IN_S, noteS: '하절기 시간표는 아직 선사 공지로 확인하지 못했습니다.' },
            { fixed: true, dir: 'in', from: '땅끝항(해남)', to: '산양진항', by: '해광운수·노화농협 · 약 30분', api: { port: '땅끝', re: /땅끝산양/, lo: -10, hi: 10 }, winter: TK_W, summer: TK_S_FROM_TK },
          ],
          tmrRows: [
            { name: '동천 ↔ 화흥포(완도)', f: (r) => /동천/.test(r.gi || '') },
            { name: '산양 ↔ 땅끝(해남)', f: (r) => r.mh === '땅끝-산양' && /산양/.test(r.gi || '') && !/횡간|넙도/.test(r.gi || '') },
          ],
        },
        {
          id: 'nb', label: '넙도·서넙도', dir: ['넙도에서 나가기', '넙도로 들어오기'],
          ctl: /넙도|서넙/,
          lines: [
            { fixed: true, dir: 'out', from: '넙도·서넙도', to: '이목항(노화)', by: '섬사랑17호', api: { port: '이목', re: /서넙/, lo: -95, hi: -50 }, winter: NB_TO_IM, summer: NB_TO_IM, note: '시각 옆 글자는 타는 곳입니다. 이목에서 출발한 배가 넙도 → 서넙도 → 넙도를 돌아 이목으로 갑니다.' },
            { fixed: true, dir: 'out', from: '넙도', to: '땅끝항(해남)', by: '노화카훼리9호(노화농협) · 직항', api: { port: '넙도', re: /넙도/, lo: -10, hi: 10 }, winter: ['08:10', '14:10', '17:10'], summer: ['08:10', '14:10', '17:10'] },
            { fixed: true, dir: 'in', from: '이목항(노화)', to: '넙도·서넙도', by: '섬사랑17호 · 넙도 거쳐 서넙도', api: { port: '이목', re: /서넙/, lo: -10, hi: 10 }, winter: ['08:00', '12:30', '15:30'], summer: ['08:00', '12:30', '15:30'], note: '이목 → 넙도 → 서넙도 → 넙도 → 이목으로 도는 배입니다.' },
            { fixed: true, dir: 'in', from: '땅끝항(해남)', to: '넙도', by: '노화카훼리 (노화농협)', api: { port: '땅끝', re: /넙도/, lo: -10, hi: 10 }, winter: NB_FROM_TK, summer: NB_FROM_TK, note: '10:10 배(노화카훼리7호)는 넙도를 거쳐 서넙도까지 갑니다.' },
          ],
          tmr: (r) => (r.mh || '').startsWith('이목-서넙') || (r.mh === '땅끝-산양' && /넙도/.test(r.gi || '')),
        },
        {
          id: 'isl', label: '당사·횡간·섬순회', dir: ['노화에서 출발', '노화로 오는 배'],
          ctl: /당사|남성|횡간/,
          lines: [
            { fixed: true, dir: 'out', from: '이목항', to: '당사도', by: '섬사랑1호 · 소안 거쳐 감', api: { port: '이목', re: /당사/, lo: -10, hi: 10 }, winter: ['07:30', '15:40'], summer: ['07:30', '15:40'] },
            { fixed: true, dir: 'out', from: '이목항', to: '섬 순회(남성)', by: '섬사랑1호', api: { port: '이목', re: /남성/, lo: -10, hi: 10 }, winter: ['09:15'], summer: ['09:15'], note: '소안 → 동천 → 횡간 → 마삭 → 산양 → 백일 → 동화 → 남성 순서로 들릅니다. 중간 섬 도착 시각은 확인하지 못했습니다.' },
            { fixed: true, dir: 'out', from: '산양진항', to: '횡간도·땅끝', by: '노화카훼리7호(노화농협)', api: { port: '산양', re: /횡간/, lo: -10, hi: 10 }, winter: ['07:40'], summer: ['07:40'] },
            { fixed: true, dir: 'in', from: '당사도', to: '이목항', by: '섬사랑1호 · 소안 거쳐 옴', api: { port: '당사', re: /당사/, lo: -10, hi: 10 }, winter: ['08:20', '16:20'], summer: ['08:20', '16:20'] },
            { fixed: true, dir: 'in', from: '섬 순회(남성)', to: '이목항', by: '섬사랑1호', api: { port: '남성', re: /남성/, lo: -10, hi: 10 }, winter: ['13:30'], summer: ['13:30'], note: '남성 → 동화 → 백일 → 흑일 → 산양 → 마삭 → 횡간 → 동천 → 소안 → 이목 순서로 옵니다. 13:30은 남성 출발 시각입니다.' },
            { fixed: true, dir: 'in', from: '땅끝항(해남)', to: '산양·횡간도', by: '노화카훼리7호(노화농협) · 흑일 거쳐 감', api: { port: '땅끝', re: /횡간/, lo: -10, hi: 10 }, winter: ['16:05'], summer: ['16:05'] },
          ],
          tmr: (r) => (/^이목-(당사|남성)/.test(r.mh || '') && /이목|산양|동천/.test(r.gi || '')) || (r.mh === '땅끝-산양' && /횡간/.test(r.gi || '')),
        },
      ],
      bands: [BAND.soan, BAND.nohwa, BAND.haekwang],
      tels: [...TEL_HH, ...TEL_TK],
      links: [['군청 시간표: 화흥포', 'https://www.wando.go.kr/wando/sub.cs?m=350'], ['군청 시간표: 땅끝', 'https://www.wando.go.kr/wando/sub.cs?m=369']],
      source: '시간표: 화흥포 항로는 소안농협 밴드 동절기 시간표(2026.9.29. 공지), 땅끝 항로 동절기는 노화농협 밴드(2026.10.1.~2027.2.말)와 해광운수 밴드 공지, 하절기는 완도군청 여객선정보. 넙도·당사·횡간·섬순회는 공단 운항 자료와 민간 시간표 참고.',
    },
    {
      id: 'soan', kw: /소안|화흥포|당사|남성|횡간/, name: '소안', title: '소안도·당사도·횡간도', desc: '소안↔화흥포(동천 경유), 이목↔당사, 섬순회·횡간',
      home: /^(소안|당사|횡간)/, dir: ['소안에서 나가기', '소안으로 들어오기'],
      wx: { nx: 55, ny: 53, label: '소안도' }, tide: { lat: '34.165', lot: '126.645', label: '소안항' },
      warn: [W_WANDO, W_SEA_W, W_FAR_W],
      groups: [
        { id: 'hh', label: '화흥포(완도)', lines: [L(RE.hwaheung, '소안항 → 동천 → 화흥포', '화흥포 → 동천 → 소안항', '소안농협 · 약 55분', { note: '노화 동천항을 거쳐 다닙니다.' })], tmr: byRe(/화흥포|소안/) },
        { id: 'ds', label: '당사도', lines: [L(RE.dangsa, '당사도 → 소안 → 이목(노화)', '이목(노화) → 소안 → 당사도', '섬사랑1호(해광운수)', { note: '공단 자료에는 이목·당사 출발 시각만 나옵니다. 소안에 들르는 시각은 선사에 확인하세요.' })], tmr: byRe(/당사/) },
        { id: 'sl', label: '횡간·섬순회', lines: [L(RE.namseong, '횡간·섬순회 쪽에서 출발', '이목·산양·땅끝에서 출발', '섬사랑1호·노화카훼리7호', { note: '섬순회 배는 이목 → 소안 → 동천 → 횡간 → 마삭 → 산양 → 백일 → 동화 → 남성 순서로 들릅니다.' })], tmr: (r) => /^이목-남성/.test(r.mh || '') || (r.mh === '땅끝-산양' && /횡간/.test(r.gi || '')) },
      ],
      bands: [BAND.soan],
      tels: TEL_HH,
      links: [['군청 시간표: 화흥포', 'https://www.wando.go.kr/wando/sub.cs?m=350']],
    },
    {
      id: 'cheongsan', kw: /청산|여서|장도|모도/, name: '청산', title: '청산도·여서도·장도·모도', desc: '청산↔완도, 여서·장도, 모도',
      home: /^(청산|도청|여서|장도|모도|모서|모동)/, dir: ['섬에서 나가기', '섬으로 들어오기'],
      wx: { nx: 59, ny: 53, label: '청산도' }, tide: { lat: '34.181', lot: '126.858', label: '도청항' },
      warn: [W_WANDO, W_YEOSEO, W_SEA_W, W_FAR_W, W_FAR_E],
      groups: [
        { id: 'cs', label: '청산↔완도', lines: [L(RE.cheongsan, '청산도 → 완도항', '완도항 → 청산도', '청산농협 · 약 50분', { not: RE.notYeoseo })], tmr: byRe(/청산/, /여서/) },
        { id: 'ys', label: '여서·장도', lines: [L(RE.yeoseo, '여서도 → 청산 → 장도 → 완도항', '완도항 → 장도 → 청산 → 여서도', '섬사랑7호(해광운수) · 하루 1왕복', { note: '청산도·장도에 들르는 시각은 선사에 확인하세요.' })], tmr: byRe(/여서/) },
        { id: 'md', label: '모도', lines: [L(RE.modo, '모도에서 출발', '완도항 → 모도', '섬사랑2호(해광운수) · 순환', { note: '순환 항로라 공단 자료에는 완도 출발 시각만 나옵니다. 모도에서 나가는 시각은 완도 출발 뒤 약 1시간입니다(선사 확인).', fallback: { in: ['07:10?', '11:00?', '15:30?'] } })], tmr: byRe(/모도/) },
      ],
      bands: [BAND.cheongsan], tels: [], links: [],
    },
    {
      id: 'geumil', kw: /일정|금일|동송|당목/, name: '금일', title: '금일도 (일정·동송)', desc: '일정↔당목(약산), 동송↔녹동·우두(고흥)',
      home: /^(일정|금일|동송)/, dir: ['금일에서 나가기', '금일로 들어오기'],
      wx: { nx: 62, ny: 57, label: '금일도' }, tide: { lat: '34.345', lot: '127.03', label: '일정항' },
      warn: [W_WANDO, W_GOHEUNG, W_SEA_W, W_SEA_E, W_FAR_E],
      groups: [
        { id: 'dm', label: '당목(약산)', lines: [L(RE.iljeong, '일정항 → 당목항', '당목항 → 일정항', '완도농협·풍진해운 · 약 15분')], tmr: byRe(/일정/) },
        { id: 'ds', label: '동송↔고흥', optional: true, lines: [L(RE.dongsong, '동송항 → 녹동·우두', '녹동·우두 → 동송항', '평화페리 · 고흥')], tmr: byRe(/동송/) },
      ],
      bands: [BAND.dangmok], tels: [], links: [],
    },
    {
      id: 'saengil', kw: /서성|생일|당목|덕우/, name: '생일', title: '생일도 (서성·용출)', desc: '서성↔당목(약산), 덕우 항로(용출)',
      home: /^(서성|생일|용출)/, dir: ['생일에서 나가기', '생일로 들어오기'],
      wx: { nx: 61, ny: 56, label: '생일도' }, tide: { lat: '34.32', lot: '126.975', label: '서성항' },
      warn: [W_WANDO, W_SEA_W, W_SEA_E, W_FAR_E],
      groups: [
        { id: 'dm', label: '당목(약산)', lines: [L(RE.seoseong, '서성항 → 당목항', '당목항 → 서성항', '완도농협 · 약 20분')], tmr: byRe(/서성/) },
        { id: 'dw', label: '완도(덕우 배)', lines: [L(RE.deogu, '덕우 항로 (생일 들름)', '완도항 출발', '섬사랑5호(해광운수) · 순환', { note: '완도↔덕우 배가 생일(용출)에 들릅니다. 생일 도착·출발 시각은 선사에 확인하세요.' })], tmr: byRe(/덕우/) },
      ],
      bands: [BAND.dangmok], tels: [], links: [],
    },
    {
      id: 'geumdang', kw: /가학|금당|노력/, name: '금당', title: '금당도 (가학)', desc: '가학↔당목(약산), 가학↔노력, 고흥 쪽 배',
      home: /^(가학|금당|울포|차우)/, dir: ['금당에서 나가기', '금당으로 들어오기'],
      wx: { nx: 63, ny: 58, label: '금당도' }, tide: { lat: '34.43', lot: '127.11', label: '가학항 부근' },
      warn: [W_WANDO, W_GOHEUNG, W_SEA_W, W_SEA_E],
      groups: [
        { id: 'dm', label: '당목(약산)', lines: [L(RE.dangmokGahak, '가학항 → 당목항(약산)', '당목항(약산) → 가학항', '선사 확인 중', { band: BAND.komsa, note: '공단 자료의 항로 이름을 확인한 뒤 맞출 예정입니다. 결항·변경 소식은 공단 완도운항관리센터 밴드에 올라옵니다.' })], tmr: byRe(RE.dangmokGahak) },
        { id: 'nr', label: '노력', lines: [L(RE.gahak, '가학항 → 노력항', '노력항 → 가학항', '완도농협 완농페리2호 · 약 20분')], tmr: byRe(/노력/) },
        { id: 'nd', label: '고흥 쪽', optional: true, lines: [L(RE.geumdangNd, '금당 → 녹동·우두', '녹동·우두 → 금당', '고흥 쪽 선사')], tmr: byRe(RE.geumdangNd) },
      ],
      bands: [BAND.geumdang], tels: [], links: [],
    },
    {
      id: 'deogu', kw: /덕우|황제/, name: '덕우·황제', title: '덕우도·황제도', desc: '완도↔덕우(모황·생일 경유)',
      home: /^(덕우|황제)/, dir: ['섬에서 나가기', '섬으로 들어오기'],
      wx: { nx: 62, ny: 54, label: '덕우도' }, tide: { lat: '34.24', lot: '127.03', label: '덕우도 부근' },
      warn: [W_WANDO, W_SEA_W, W_SEA_E, W_FAR_E],
      groups: [
        { id: 'dw', label: '완도', lines: [L(RE.deogu, '덕우·황제에서 출발', '완도항 → 덕우·황제', '섬사랑5호(해광운수) · 순환', { note: '완도 → 모황 → 덕우 → 황제 → 덕우 → 생일 → 모황 → 완도 순서로 도는 배입니다(해광운수 시간표). 공단 자료에는 완도 출발 시각만 나오니, 섬에 들르는 시각은 선사에 확인하세요.' })], tmr: byRe(/덕우/) },
      ],
      bands: [], tels: [], links: [],
    },
  ];

  R.forEach((r) => { r.links = [...(r.links || []), ...LINKS_COMMON]; r.bands = [BAND.komsa, ...(r.bands || [])]; });
  globalThis.WANDO_REGIONS = R;
  globalThis.WANDO_BANDS = Object.values(BAND);
})();
