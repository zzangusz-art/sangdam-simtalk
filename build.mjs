// 상담시뮬레이션톡 빌드: src/ 의 CSS·데이터·엔진을 HTML 한 파일로 합친다.
//   node build.mjs  →  상담시뮬레이션톡.html (더블클릭 실행용) + dist/simtalk.html (아티팩트 게시용)
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

const css = read('src/app.css');
const dataFiles = readdirSync(join(root, 'src')).filter((f) => /^data-.*\.js$/.test(f)).sort();
const data = dataFiles.map((f) => `/* ${f} */\n` + read('src/' + f)).join('\n');
const app = read('src/app.js');

const TITLE = '상담시뮬레이션톡';
const FONTS = 'https://fonts.googleapis.com/css2?family=Gothic+A1:wght@700;800&family=Nanum+Pen+Script&family=Noto+Sans+KR:wght@400;500;700&display=swap';

const body = (standalone) => `<div class="app">
<nav class="nav" id="nav" aria-label="주 메뉴"></nav>
<main class="main"><div class="wrap" id="view"></div></main>
</div>
<div id="layer"></div>
<script>window.SIMTALK_STANDALONE = ${standalone};</script>
<script>
${safe(data)}
</script>
<script>
${safe(app)}
</script>`;

// 1) 아티팩트용: 게시 시 doctype/head/body 골격이 자동으로 씌워지므로 내용만 쓴다.
const artifact = `<title>${TITLE}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="${FONTS}">
<style>
${css}
</style>
${body(false)}
`;

// 2) 단독 실행용: 완전한 HTML 문서.
const standalone = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${TITLE}</title>
<meta name="description" content="예비 교사가 가상의 학생·학부모와 상담하며 내 답의 법적 리스크를 조문·판례와 함께 바로 첨삭받는 훈련 프로그램">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="${FONTS}">
<style>
${css}
</style>
</head>
<body>
${body(true)}
</body>
</html>
`;

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/simtalk.html'), artifact, 'utf8');
writeFileSync(join(root, `${TITLE}.html`), standalone, 'utf8');
writeFileSync(join(root, 'index.html'), standalone, 'utf8');   // GitHub Pages 가 여는 첫 화면(위 파일과 내용 동일)
// 3) 리서치 문서: 머리말(src/research-preface.md) + 법률 근거 카드 전체를 표로.
const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
for (const f of dataFiles) vm.runInContext(read('src/' + f), ctx, { filename: f });
const { LAWS, SCENARIOS, PHRASES } = ctx.SIMTALK_DATA;
const cell = (s) => String(s || '').replace(/\|/g, '/').replace(/\n/g, ' ');
const types = ['법령', '고시·지침', '판례·결정', '사건·뉴스', '통계·매뉴얼'];
let md = read('src/research-preface.md');
md += `## 근거 자료 전체 (${Object.keys(LAWS).length}건)\n`;
for (const t of types) {
  const rows = Object.values(LAWS).filter((l) => l.type === t);
  md += `\n### ${t} (${rows.length}건)\n\n| 근거 | 핵심 내용 | 상담에서는 | 출처 |\n|---|---|---|---|\n`;
  for (const l of rows) {
    md += `| **${cell(l.name)}**<br>${cell(l.title)}${l.date ? '<br>' + cell(l.date) : ''} | ${cell(l.gist)} | ${cell(l.talk)} | ${l.url ? `[${cell(l.src || '출처')}](${encodeURI(l.url)})` : cell(l.src)} |\n`;
  }
}
md += `\n---\n시나리오 ${SCENARIOS.length}개(턴 ${SCENARIOS.reduce((a, s) => a + s.turns.length, 0)}개), 말실수 사전 ${PHRASES.length}쌍에 위 근거가 연결되어 있습니다.\n`;
writeFileSync(join(root, '리서치_법률근거.md'), md, 'utf8');

console.log(`data: ${dataFiles.join(', ')}`);
console.log(`artifact  dist/simtalk.html  ${(artifact.length / 1024).toFixed(0)} KB(chars)`);
console.log(`standalone ${TITLE}.html  ${(standalone.length / 1024).toFixed(0)} KB(chars)`);
