// 서버 함수 점검: 공공데이터 응답을 흉내 내어 각 경로를 불러 봄 (node tools/test-api.mjs)
process.env.DATA_GO_KR_KEY = "TESTKEY";
const calls = [];
globalThis.fetch = async (url) => {
  calls.push(String(url));
  const u = new URL(url);
  let body;
  if (u.pathname.includes("oprt-schd")) body = { response: { header: { resultCode: "200" }, body: { totalCount: 4, items: { item: [
    { sail_tm: 710, psnshp_nm: "섬사랑2호", oport_nm: "완도", nvg_seawy_nm: "완도-모도(순환)", nvg_se_nm: "정상", nvg_stts_nm: "완료", lcns_seawy_nm: "완도-모도", nvg_drc_nm: "정방향" },
    { sail_tm: 715, psnshp_nm: "섬사랑7호", oport_nm: "여서", nvg_seawy_nm: "완도-여서(청산2회)", nvg_se_nm: "통제", nvg_stts_nm: "출항전", cntrl_rsn_nm: "풍랑주의보" },
    { sail_tm: 900, psnshp_nm: "퀸메리", oport_nm: "목포", nvg_seawy_nm: "목포-제주", nvg_se_nm: "정상" },
    { sail_tm: 630, psnshp_nm: "완농페리3호", oport_nm: "당목", nvg_seawy_nm: "당목-일정", nvg_se_nm: "정상" },
  ] } } } };
  else if (u.pathname.includes("tmr")) body = { header: { resultCode: "SC000" }, body: { dataList: [
    { mhcdnm: "완도-청산", gicdName: "완도", chtm: "0700", uhgbnm: "운항" }, { mhcdnm: "목포-제주", gicdName: "목포", chtm: "0900", uhgbnm: "운항" } ] } };
  else if (u.pathname.includes("VilageFcst")) body = { response: { header: { resultCode: "00" }, body: { items: { item: [
    { fcstDate: "20261120", fcstTime: "0600", category: "TMP", fcstValue: "7" }, { fcstDate: "20261120", fcstTime: "0600", category: "WSD", fcstValue: "5.1" } ] } } } };
  else if (u.pathname.includes("tidebed")) { const d = u.searchParams.get("reqDate"); const D = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}`;
    body = { header: { resultCode: "00" }, body: { items: { item: [0, 360, 720, 1080].map((m) => ({ slctdDt: `${D} ${String(m/60|0).padStart(2,"0")}:00`, slctdHgt: String(200 + m/10), obsvtrNm: "완도" })) } } }; }
  else if (u.pathname.includes("WthrWrn")) body = { response: { header: { resultCode: "00" }, body: { items: { item: [{ tmFc: 202611200400,
    t6: "o 풍랑주의보 : 남해서부앞바다(전남서부남해앞바다), 남해서부서쪽먼바다\r\no 강풍주의보 : 전라남도(완도(여서도 제외), 해남)\r\no 건조주의보 : 강원도(속초)", t7: "(1) 풍랑 예비특보\r\no 11월 21일 오후 : 여서도" }] } } } };
  else body = {};
  return new Response(JSON.stringify(body));
};
const { default: handler, komsaCacheSeconds } = await import("../netlify/functions/api.mjs");
const get = async (p) => { const r = await handler(new Request("https://x" + p)); return { j: await r.json(), cc: r.headers.get("netlify-cdn-cache-control") }; };
const k = await get("/api/komsa");
console.log("komsa", k.j.ok, k.j.items.length, "건", k.j.items.map((x) => x.t + " " + x.route + " " + x.se).join(" | "), "\n names", JSON.stringify(k.j.names), "\n extra", JSON.stringify(k.j.items[0]), "\n cache", k.cc);
const t = await get("/api/tomorrow"); console.log("tomorrow", t.j.ok, JSON.stringify(t.j.rows));
const w = await get("/api/weather/cheongsan"); console.log("weather", w.j.ok, w.j.hours.length, calls.find((c) => c.includes("Vilage")).match(/nx=\d+&ny=\d+/)[0]);
const td = await get("/api/tide/geumil"); console.log("tide", td.j.ok, td.j.kind, Object.keys(td.j.days).length, "일", calls.find((c) => c.includes("tidebed")).match(/lat=[\d.]+&lot=[\d.]+/)[0]);
const wr = await get("/api/warn"); console.log("warn", JSON.stringify(wr.j.active), JSON.stringify(wr.j.pre));
console.log("bad region", (await get("/api/tide/xx")).j.error);
for (const h of [0, 4, 5, 12, 21, 22]) { const d = new Date(Date.UTC(2026, 10, 20, h, 40)); process.stdout.write(`${h}:40→${komsaCacheSeconds(d)}s  `); }
let n = 0; for (let m = 0; m < 1440; ) { const s = komsaCacheSeconds(new Date(Date.UTC(2026, 10, 20, 0, m))); n++; m += s / 60; } console.log("\n하루 최대 KOMSA 호출 ≈", n);
// 키가 오류 문구에 새지 않는지
globalThis.fetch = async (url) => new Response("<html>SERVICE KEY IS NOT REGISTERED " + url + "</html>");
console.log("err", (await get("/api/komsa")).j.error.includes("TESTKEY") ? "키 노출!" : "키 가림 OK");
// 키 정리·형식 오류 점검
const { cleanKey } = await import("../netlify/functions/api.mjs");
console.log("cleanKey", cleanKey(' "abc%2Bdef%3D%3D" '), cleanKey("abc+def=="));
globalThis.fetch = async () => new Response(JSON.stringify({ resultCode: "30", resultMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" }));
console.log("형식 오류 →", (await get("/api/weather/soan")).j.error);
