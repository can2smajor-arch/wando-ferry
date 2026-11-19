// 밴드 경로 점검 (node tools/test-band.mjs)
const now = Date.now();
globalThis.fetch = async (url) => {
  const u = new URL(url);
  if (u.pathname === "/v2.1/bands") return new Response(JSON.stringify({ result_code: 1, result_data: { bands: [
    { name: "약산 당목항", band_key: "K1" }, { name: "소안농협 선박시간정보", band_key: "K2" }, { name: "(주)해광운수", band_key: "K3" },
    { name: "노화농협", band_key: "K4" }, { name: "청산도 선박운항시간표", band_key: "K5" }, { name: "갈꽃섬 노화사랑방", band_key: "K6" } ] } }));
  const k = u.searchParams.get("band_key");
  return new Response(JSON.stringify({ result_code: 1, result_data: { items: [
    { content: `<band:refer user_key="x">관리자</band:refer> ${k} 오늘 15시 이후 결항`, created_at: now - 3600e3 },
    { content: `${k} 오래된 글`, created_at: now - 5 * 864e5 } ] } }));
};
const { default: h } = await import("../netlify/functions/api.mjs");
let j = await (await h(new Request("https://x/api/band"))).json();
console.log("토큰 없음 →", j.ok, j.off, j.error);
process.env.BAND_TOKEN = "SECRET";
j = await (await h(new Request("https://x/api/band"))).json();
console.log("밴드", j.bands.join(" / "), "\n글", j.items.map((x) => x.band + ": " + x.text).join(" | "));
console.log("사랑방 제외:", !j.bands.includes("갈꽃섬 노화사랑방"));
