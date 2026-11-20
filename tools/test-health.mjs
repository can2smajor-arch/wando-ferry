// 자동 점검 판정 시험 (node tools/test-health.mjs)
process.env.DATA_GO_KR_KEY = "K";
const { judgeHealth, routeChecks } = await import("../netlify/functions/api.mjs");
const R = globalThis.WANDO_REGIONS;
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "");
// 2026.11.20 실제 공단 자료의 항로 이름
const names = ["완도청산", "완도여서(청산1회)", "완도모도(순환)", "완도덕우(황제)", "제주완도", "화흥포동천-소안", "땅끝산양", "땅끝넙도", "이목서넙도(순환)", "이목당사", "이목남성8", "산양횡간", "당목일정", "일정당목", "당목서성", "노력도가학", "녹동동송(입)"];
const items = names.map((route) => ({ route, t: "0900" }));
const ok = { komsa: { ok: true, date: today, items }, weather: { ok: true, hours: [1] }, tide: { ok: true, kind: "bed" }, warn: { ok: true } };
console.log("점검 노선 수:", routeChecks(R).length);
console.log("정상 →", judgeHealth(ok, R));
console.log("이름 바뀜 →", judgeHealth({ ...ok, komsa: { ...ok.komsa, items: items.filter((x) => x.route !== "당목서성") } }, R));
console.log("키 막힘 →", judgeHealth({ ...ok, komsa: { ok: false, error: "SERVICE_KEY_IS_NOT_REGISTERED" }, tide: { ok: true, kind: "station", bedError: "x" } }, R));
