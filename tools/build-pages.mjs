// 지역 주소 페이지 만들기: public/index.html → public/<지역>/index.html (카톡 미리보기 제목·그림만 지역에 맞게 바꿈)
// index.html 이나 regions.js 를 고친 뒤에는 꼭 다시 실행: node tools/build-pages.mjs && python3 tools/make_icons.py
import fs from "node:fs";
import "../public/regions.js";
const SITE = "https://wando-ferry.netlify.app";
const base = fs.readFileSync("public/index.html", "utf8");
const set = (html, re, val) => { if (!re.test(html)) throw new Error("못 찾음: " + re); return html.replace(re, val); };
for (const r of globalThis.WANDO_REGIONS) {
  const title = `완도뱃길 – ${r.name} 배·물때·날씨`;
  const desc = `${r.title} · ${r.desc}. 다음 배·운항 통제·내일 운항예보·날씨·물때를 한 화면에`;
  let h = base;
  h = set(h, /<title>[^<]*<\/title>/, `<title>${title}</title>`);
  h = set(h, /(<meta name="description" content=")[^"]*/, `$1${desc}`);
  h = set(h, /(<meta property="og:url" content=")[^"]*/, `$1${SITE}/${r.id}/`);
  h = set(h, /(<meta property="og:title" content=")[^"]*/, `$1${title}`);
  h = set(h, /(<meta property="og:description" content=")[^"]*/, `$1${desc}`);
  h = set(h, /(<meta property="og:image" content=")[^"]*/, `$1${SITE}/og/${r.id}.png?v=1`);
  fs.mkdirSync(`public/${r.id}`, { recursive: true });
  fs.writeFileSync(`public/${r.id}/index.html`, h);
}
fs.writeFileSync("tools/regions.json", JSON.stringify(globalThis.WANDO_REGIONS.map((r) => ({ id: r.id, name: r.name, title: r.title })), null, 1));
console.log("지역 페이지", globalThis.WANDO_REGIONS.length, "개 만듦");
