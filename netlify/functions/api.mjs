// 완도뱃길 API 중계 함수
// - /api/komsa          : KOMSA 오늘 운항 스케줄(완도군 관련 항로만) — 이 앱과 노화뱃길이 함께 쓰는 '허브'
//                          낮 15분 · 밤(21:30~05:00) 1시간 캐시 → KOMSA 호출 하루 최대 약 74회 (개발계정 100회)
// - /api/tomorrow       : KOMSA 내일 운항예보(상세, 완도군 관련 행만) — 30분 캐시
// - /api/weather/:지역  : 기상청 단기예보(지역 격자) — 1시간 캐시
// - /api/tide/:지역     : 국립해양조사원 TideBED(지역 좌표, 14일) → 안 되면 완도 조석예보 — 6시간 캐시
// - /api/band           : 선사·항구 밴드 최근 글(BAND_TOKEN 이 있을 때만) — 낮 10분 · 밤 1시간 캐시
// - /api/warn           : 기상청 기상특보 통보문(광주청 156 + 제주청 184) — 10분 캐시. 구역 고르기는 화면에서
// 인증키: Netlify 환경변수 DATA_GO_KR_KEY (공공데이터포털 일반 인증키, Decoding). 코드·대화에 넣지 않음.
// KOMSA_HUB_URL 을 넣으면 KOMSA를 직접 부르지 않고 그 주소(다른 허브)의 /api/komsa 자료를 받아 씀.

import "../../public/regions.js";
const REGIONS = globalThis.WANDO_REGIONS;
const BANDS = globalThis.WANDO_BANDS;

const FERRY_URL = "https://apis.data.go.kr/B554035/oprt-schd-info-v2/get-oprt-schd-info-v2";
const TIDE_URL = "https://apis.data.go.kr/1192136/tideFcstTime/GetTideFcstTimeApiService";
const TMR_URL = process.env.TMR_URL || "https://apis.data.go.kr/B554035/tmr-forecastnew/get_tmr_forecastnew";
const WX_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";
const WRN_URL = "https://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnMsg";
const TIDE_STATION = "DT_0027"; // 완도 조위관측소 (TideBED가 안 될 때)
const TIDE_DAYS = 14;
const SRC = "wando";

// 완도군 관련 항로 고르기: 운항항로명·출항지에 이 글자가 있으면 남김 (화면에서 노선별로 다시 고름)
export const WANDO_RE = /완도|화흥포|소안|노화|이목|넙도|서넙|당사|남성|횡간|땅끝|산양|청산|여서|장도|모도|덕우|황제|당목|일정|금일|서성|생일|가학|노력|금당|동송/;

function kstNow() { return new Date(Date.now() + 9 * 3600e3); }
function kstDate(offsetDays = 0) {
  const d = new Date(Date.now() + 9 * 3600e3 + offsetDays * 864e5);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
export function komsaCacheSeconds(now = kstNow()) {
  const m = now.getUTCHours() * 60 + now.getUTCMinutes();
  return m >= 21 * 60 + 30 || m < 5 * 60 ? 3600 : 900;
}

function json(body, cacheSeconds) {
  return new Response(JSON.stringify({ src: SRC, ...body }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      // 브라우저는 1분, Netlify 공유 캐시는 cacheSeconds 동안 보관 → 공공데이터 호출 횟수 제한
      "cache-control": "public, max-age=60",
      "netlify-cdn-cache-control": `public, durable, s-maxage=${cacheSeconds}, stale-while-revalidate=120`,
    },
  });
}

async function getJson(url, params) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const res = await fetch(`${url}${qs}`, { signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error("응답이 JSON이 아님: " + text.slice(0, 200).replace(/serviceKey=[^&\s"]+/g, "serviceKey=***")); }
}
const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);
// 공공데이터 응답에 header·body가 없으면 (인증키 오류 등) 받은 내용을 짧게 보여 주며 오류로 처리
function mustHave(data, ok, what) {
  if (ok) return;
  const snip = JSON.stringify(data ?? null).slice(0, 240).replace(/serviceKey=[^&\s"]+/g, "serviceKey=***");
  throw new Error(`${what} 응답 형식이 다름(인증키 확인 필요): ${snip}`);
}

// ───── KOMSA 오늘 운항 (허브) ─────
export function compactKomsa(items) {
  const out = [], names = {}, all = new Set();
  for (const x of items) {
    const route = String(x.nvg_seawy_nm || ""), from = String(x.oport_nm || "");
    if (route) all.add(route);
    if (!WANDO_RE.test(route) && !WANDO_RE.test(from)) continue;
    const o = {
      t: String(x.sail_tm ?? "").padStart(4, "0"),
      ship: x.psnshp_nm || "",
      from,
      route,
      se: x.nvg_se_nm || "",     // 정상 / 통제 / 비운 / 증선
      stts: x.nvg_stts_nm || "", // 출항전 / 출항 / 완료
      reason: x.cntrl_rsn_nm || x.nnavi_rsn_nm || x.cnls_etc_rsn || "",
    };
    // 면허항로·운항방향·항로구분 등 이름을 아직 모르는 칸도 함께 넘김 (화면에서 쓰지 않으면 무시)
    for (const [k, v] of Object.entries(x)) if (/lcns|drc|seawy_se/.test(k) && !(k in o) && typeof v !== "object") o[k] = v;
    out.push(o);
    const nk = `${from}|${route}`;
    names[nk] = (names[nk] || 0) + 1;
  }
  out.sort((a, b) => a.t.localeCompare(b.t));
  return { items: out, names, allRoutes: [...all].sort() };
}

async function komsa(key) {
  const hub = process.env.KOMSA_HUB_URL;
  if (hub) {
    const j = await getJson(hub);
    if (!j || !j.ok || !Array.isArray(j.items)) throw new Error("허브 자료 오류: " + (j?.error || "형식 다름"));
    return { ...j, via: hub };
  }
  const date = kstDate();
  const data = await getJson(FERRY_URL, { serviceKey: key, pageNo: "1", numOfRows: "1000", dataType: "JSON", rlvtYmd: date });
  const header = data?.response?.header;
  if (header && header.resultCode !== "200" && header.resultCode !== "00") throw new Error(`KOMSA 오류 ${header.resultCode} ${header.resultMsg}`);
  mustHave(data, data?.response?.body, "KOMSA");
  const total = data?.response?.body?.totalCount;
  const c = compactKomsa(arr(data?.response?.body?.items?.item));
  return { ok: true, date, fetched: new Date().toISOString(), total, ...c };
}

// ───── 내일 운항예보 (완도군 관련 행만, 묶기는 화면에서) ─────
async function tomorrow(key) {
  const hourKst = kstNow().getUTCHours();
  const date = kstDate(1);
  const data = await getJson(TMR_URL, { serviceKey: key, pageNo: "1", numOfRows: "1000", ilja: date });
  const code = data?.header?.resultCode;
  if (code && code !== "SC000" && code !== "00") throw new Error(`운항예보 오류 ${code} ${data?.header?.resultMsg || ""}`);
  mustHave(data, data?.body || data?.header, "운항예보");
  const rows = arr(data?.body?.dataList);
  if (!rows.length) return { ok: false, error: hourKst < 12 ? "내일 운항예보는 매일 12시쯤 발표됩니다." : "아직 내일 운항예보가 발표되지 않았습니다." };
  const out = rows
    .filter((x) => WANDO_RE.test(x.mhcdnm || "") || WANDO_RE.test(x.gicdName || ""))
    .map((x) => ({ mh: x.mhcdnm || "", gi: x.gicdName || "", t: String(x.chtm || ""), st: x.uhgbnm || "", rs: x.tjsunm || x.busunm || x.wdsunm || "" }));
  return { ok: true, date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`, fetched: new Date().toISOString(), rows: out };
}

// ───── 기상청 단기예보 ─────
function wxBase() {
  const n = new Date(Date.now() + 9 * 3600e3 - 15 * 60e3);
  const hours = [2, 5, 8, 11, 14, 17, 20, 23];
  let h = hours.filter((x) => x <= n.getUTCHours()).pop();
  let d = n;
  if (h === undefined) { h = 23; d = new Date(n.getTime() - 864e5); }
  return { date: d.toISOString().slice(0, 10).replace(/-/g, ""), time: String(h).padStart(2, "0") + "00" };
}
async function weather(key, region) {
  const base = wxBase();
  const data = await getJson(WX_URL, {
    serviceKey: key, pageNo: "1", numOfRows: "1000", dataType: "JSON",
    base_date: base.date, base_time: base.time, nx: String(region.wx.nx), ny: String(region.wx.ny),
  });
  const h = data?.response?.header;
  if (h && h.resultCode !== "00") throw new Error(`기상청 오류 ${h.resultCode} ${h.resultMsg}`);
  mustHave(data, data?.response?.body, "기상청");
  const map = {};
  for (const x of arr(data?.response?.body?.items?.item)) {
    const k = x.fcstDate + x.fcstTime;
    (map[k] = map[k] || { d: x.fcstDate, t: x.fcstTime })[x.category] = x.fcstValue;
  }
  const hours = Object.keys(map).sort().map((k) => {
    const v = map[k];
    return {
      d: v.d, t: v.t, tmp: +v.TMP, sky: +v.SKY, pty: +v.PTY, pop: +v.POP,
      wsd: +v.WSD, vec: +v.VEC, wav: v.WAV !== undefined ? +v.WAV : null, pcp: v.PCP, reh: +v.REH,
      tmx: v.TMX !== undefined ? +v.TMX : undefined, tmn: v.TMN !== undefined ? +v.TMN : undefined,
    };
  });
  return { ok: true, region: region.id, base: base.date + base.time, fetched: new Date().toISOString(), hours };
}

// ───── 물때: TideBED (좌표 → 가까운 기준항의 조시차·조고비로 보정한 예측 조위) ─────
const BED_BASE = process.env.TIDEBED_URL || "https://apis.data.go.kr/1192136/tidebed";
const BED_OPS = ["GetTidebedApiService", "GetTideBedApiService", "GetTidebedPredApiService", "GetTideBedPredApiService"];
let bedOp = null;
async function bedDay(key, date, pos) {
  const ops = bedOp ? [bedOp] : BED_OPS;
  let lastErr;
  for (const op of ops) {
    try {
      const data = await getJson(`${BED_BASE}/${op}`, {
        serviceKey: key, pageNo: "1", numOfRows: "300", type: "json", lat: pos.lat, lot: pos.lot, reqDate: date, min: "10",
      });
      const header = data?.header || data?.response?.header;
      if (header && header.resultCode !== "00") throw new Error(`TideBED 오류 ${header.resultCode} ${header.resultMsg}`);
      const items = arr((data?.body || data?.response?.body)?.items?.item);
      if (!items.length || items[0].slctdHgt === undefined) throw new Error("TideBED 자료 없음");
      bedOp = op;
      const info = { base: items[0].obsvtrNm || "", josi: items[0].josi || "", jogo: items[0].jogo || "" };
      const rows = items.map((x) => {
        const s = String(x.slctdDt || "");
        return [s.slice(0, 10), +s.slice(11, 13) * 60 + +s.slice(14, 16), Math.round(parseFloat(x.slctdHgt) * 10) / 10];
      }).filter((r) => r[0].length === 10 && !isNaN(r[2]));
      return { rows, info };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("TideBED 실패");
}
async function tideDay(key, date) {
  const data = await getJson(TIDE_URL, { serviceKey: key, pageNo: "1", numOfRows: "300", type: "json", obsCode: TIDE_STATION, reqDate: date, min: "10" });
  const header = data?.header || data?.response?.header;
  if (header && header.resultCode !== "00" && header.resultCode !== "200") throw new Error(`조석 오류 ${header.resultCode} ${header.resultMsg}`);
  return arr((data?.body || data?.response?.body)?.items?.item).map((x) => {
    const hm = x.predcDt.slice(11, 16).split(":");
    return [+hm[0] * 60 + +hm[1], Math.round(x.tdlvHgt * 10) / 10];
  });
}
async function tide(key, region) {
  const dates = Array.from({ length: TIDE_DAYS }, (_, i) => kstDate(i));
  try {
    const res = await Promise.all(dates.map((d) => bedDay(key, d, region.tide).catch(() => null)));
    const days = {}; let info = null;
    for (const r of res) {
      if (!r) continue; info = info || r.info;
      for (const [d, m, c] of r.rows) (days[d] = days[d] || []).push([m, c]);
    }
    for (const d of Object.keys(days)) days[d].sort((a, b) => a[0] - b[0]);
    if (Object.keys(days).length >= 3) {
      return { ok: true, region: region.id, kind: "bed", station: region.tide.label, base: info?.base || "", josi: info?.josi || "", jogo: info?.jogo || "", fetched: new Date().toISOString(), days };
    }
  } catch (e) { /* 아래 완도 예보로 */ }
  const series = await Promise.all(dates.map((d) => tideDay(key, d).catch(() => [])));
  const days = {};
  dates.forEach((d, i) => { if (series[i].length) days[`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`] = series[i]; });
  if (!Object.keys(days).length) throw new Error("조석 자료를 받지 못했습니다");
  return { ok: true, region: region.id, kind: "station", station: "완도", fetched: new Date().toISOString(), days };
}

// ───── 기상특보: 통보문의 발효현황(t6)·예비특보(t7)를 줄 단위로 넘김 (구역 고르기는 화면에서) ─────
export function parseWarnLines(text) {
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const m = raw.match(/^\s*o\s*([^:：]+?)\s*[:：]\s*(.+)$/);
    if (!m) continue;
    const kind = m[1].trim();
    if (!/주의보|경보/.test(kind)) continue;
    out.push({ kind, areas: m[2].trim() });
  }
  return out;
}
export function parsePre(text) {
  const out = []; let cur = "";
  for (const raw of String(text || "").split(/\r?\n/)) {
    const h = raw.match(/\(\d+\)\s*(.+?예비특보)/); if (h) { cur = h[1].trim(); continue; }
    const m = raw.match(/^\s*o\s*(.+?)\s*:\s*(.+)$/);
    if (!m || !cur) continue;
    out.push({ kind: cur, when: m[1].trim(), areas: m[2].trim() });
  }
  return out;
}
async function latestMsg(key, stnId) {
  const data = await getJson(WRN_URL, { serviceKey: key, pageNo: "1", numOfRows: "10", dataType: "JSON", stnId, fromTmFc: kstDate(-6), toTmFc: kstDate(0) });
  const code = data?.response?.header?.resultCode;
  if (code === "03") return null; // 최근 일주일 통보문 없음
  if (code && code !== "00") throw new Error(`기상특보 오류 ${code} ${data?.response?.header?.resultMsg || ""}`);
  const items = arr(data?.response?.body?.items?.item);
  if (!items.length) return null;
  return items.reduce((a, b) => (String(b.tmFc) > String(a.tmFc) ? b : a));
}
async function warn(key) {
  const gj = await latestMsg(key, "156");
  const active = [], pre = [];
  if (gj) { parseWarnLines(gj.t6).forEach((x) => active.push({ ...x, stn: "156" })); parsePre(gj.t7).forEach((x) => pre.push({ ...x, stn: "156" })); }
  let jjAt = "";
  try { // 남해서부 먼바다 풍랑특보는 제주청 통보문에서
    const jj = await latestMsg(key, "184");
    if (jj) {
      jjAt = String(jj.tmFc);
      parseWarnLines(jj.t6).filter((x) => /남해서부/.test(x.areas)).forEach((x) => active.push({ ...x, stn: "184" }));
      parsePre(jj.t7).filter((x) => /남해서부/.test(x.areas)).forEach((x) => pre.push({ ...x, stn: "184" }));
    }
  } catch (e) { /* 제주청 실패는 무시 */ }
  return { ok: true, at: gj ? String(gj.tmFc) : "", atJeju: jjAt, fetched: new Date().toISOString(), active, pre };
}

// ───── 밴드 최근 글 (BAND Open API) ─────
// 환경변수 BAND_TOKEN: 밴드 개발자센터에서 받은 access token. 토큰 주인 계정이 가입한 밴드만 읽을 수 있음.
// regions.js 의 BAND 목록(re)과 이름이 맞는 밴드만 고름. 글은 글자만(사진 제외), 3일 안 글만.
const BAND_API = "https://openapi.band.us";
let bandKeys = null, bandKeysAt = 0;
export function cleanBandText(s) {
  return String(s || "").replace(/<band:[^>]*>([^<]*)<\/band:[^>]*>/g, "$1").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 400);
}
async function band() {
  const token = process.env.BAND_TOKEN;
  if (!token) return { ok: false, off: true, error: "BAND_TOKEN 환경변수가 없습니다" };
  if (!bandKeys || Date.now() - bandKeysAt > 6 * 3600e3) {
    const j = await getJson(`${BAND_API}/v2.1/bands`, { access_token: token });
    if (j.result_code !== 1) throw new Error(`밴드 목록 오류 ${j.result_code} ${j.result_data?.message || ""}`);
    const list = j.result_data?.bands || [];
    bandKeys = BANDS.map((b) => { const f = list.find((x) => b.re.test(x.name || "")); return f ? { name: b.name, key: f.band_key, all: !!b.all } : null; }).filter(Boolean);
    bandKeysAt = Date.now();
  }
  const now = Date.now();
  const res = await Promise.all(bandKeys.map(async (b) => {
    try {
      const j = await getJson(`${BAND_API}/v2/band/posts`, { access_token: token, band_key: b.key, locale: "ko_KR" });
      if (j.result_code !== 1) return [];
      return (j.result_data?.items || []).slice(0, b.all ? 12 : 6).map((p) => ({ band: b.name, at: +p.created_at, text: cleanBandText(p.content) }));
    } catch { return []; }
  }));
  const items = res.flat().filter((x) => x.text && now - x.at < 3 * 864e5).sort((a, b) => b.at - a.at);
  return { ok: true, fetched: new Date().toISOString(), bands: bandKeys.map((b) => b.name), items };
}

// 인증키 정리: 앞뒤 빈칸·따옴표 제거, Encoding 키(%2B 등)를 넣었으면 Decoding 키로 풀어서 씀
export function cleanKey(k) {
  k = String(k || "").trim().replace(/^["']|["']$/g, "");
  if (/%[0-9A-Fa-f]{2}/.test(k)) { try { k = decodeURIComponent(k); } catch { /* 그대로 */ } }
  return k;
}

export default async (req) => {
  const key = cleanKey(process.env.DATA_GO_KR_KEY);
  const parts = new URL(req.url).pathname.split("/").filter(Boolean); // ["api", which, region?]
  const which = parts[1], region = REGIONS.find((r) => r.id === parts[2]);
  if (!key && which !== "band" && !(which === "komsa" && process.env.KOMSA_HUB_URL)) return json({ ok: false, error: "DATA_GO_KR_KEY 환경변수가 없습니다" }, 60);
  try {
    if (which === "komsa") return json(await komsa(key), komsaCacheSeconds());
    if (which === "tomorrow") return json(await tomorrow(key), 1800);
    if (which === "warn") return json(await warn(key), 600);
    if (which === "band") return json(await band(), komsaCacheSeconds() === 900 ? 600 : 3600);
    if (which === "weather" || which === "tide") {
      if (!region) return json({ ok: false, error: "알 수 없는 지역" }, 3600);
      return which === "weather" ? json(await weather(key, region), 3600) : json(await tide(key, region), 21600);
    }
    return json({ ok: false, error: "알 수 없는 경로" }, 60);
  } catch (e) {
    // 오류도 5분 캐시: 방문자마다 API를 다시 불러 하루 한도를 다 쓰는 일을 막음
    return json({ ok: false, error: String(e.message || e).replace(/(serviceKey|access_token)=[^&\s"]+/g, "$1=***") }, 300);
  }
};

export const config = { path: ["/api/komsa", "/api/tomorrow", "/api/warn", "/api/band", "/api/weather/:region", "/api/tide/:region"] };
