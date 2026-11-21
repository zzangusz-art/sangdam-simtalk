// 데이터 무결성 점검: node validate.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = dirname(fileURLToPath(import.meta.url));
const ctx = {};
ctx.window = ctx;                       // 브라우저처럼 window 가 곧 전역
vm.createContext(ctx);
for (const f of readdirSync(join(root, 'src')).filter((f) => /^data-.*\.js$/.test(f)).sort()) {
  vm.runInContext(readFileSync(join(root, 'src', f), 'utf8'), ctx, { filename: f });
}
const D = ctx.SIMTALK_DATA;
const { TAGS, TOPICS, MAJORS, LAWS = {}, SCENARIOS = [], PHRASES = [] } = D;
const errs = [], warns = [];
const E = (m) => errs.push(m), W = (m) => warns.push(m);
const LAW_TYPES = ['법령', '고시·지침', '판례·결정', '사건·뉴스', '통계·매뉴얼'];
const majorKeys = new Set(MAJORS.map((m) => m.k).concat('공통'));
const usedLaws = new Set();
const law = (id, where) => { usedLaws.add(id); if (!LAWS[id]) E(`${where}: 없는 근거 id "${id}"`); };
const tag = (t, where) => { if (!TAGS[t]) E(`${where}: 없는 유형 "${t}"`); };

for (const [k, t] of Object.entries(TAGS)) {
  if (!t.label || !t.why || !t.ax || !t.sev) E(`TAGS.${k}: 필드 누락`);
  (t.laws || []).forEach((id) => law(id, `TAGS.${k}`));
}
for (const [id, l] of Object.entries(LAWS)) {
  for (const f of ['type', 'name', 'title', 'gist', 'talk']) if (!l[f]) E(`LAWS.${id}: ${f} 누락`);
  if (!LAW_TYPES.includes(l.type)) E(`LAWS.${id}: type "${l.type}"`);
  if (l.url && !/^https:\/\//.test(l.url)) E(`LAWS.${id}: url은 https 여야 함`);
  if (!l.url) W(`LAWS.${id}: 출처 url 없음`);
}
const ids = new Set();
for (const s of SCENARIOS) {
  const w = `시나리오 ${s.id}`;
  if (ids.has(s.id)) E(`${w}: id 중복`); ids.add(s.id);
  for (const f of ['who', 'levels', 'majors', 'topic', 'title', 'sub', 'diff', 'channel', 'persona', 'scene', 'goal', 'laws', 'turns', 'ending', 'after']) if (s[f] == null) E(`${w}: ${f} 누락`);
  if (!['student', 'parent'].includes(s.who)) E(`${w}: who`);
  (s.levels || []).forEach((l) => { if (!['초', '중', '고'].includes(l)) E(`${w}: level ${l}`); });
  (s.majors || []).forEach((m) => { if (!majorKeys.has(m)) E(`${w}: major ${m}`); });
  (s.majors || []).forEach((m) => {
    const def = MAJORS.find((x) => x.k === m);
    if (def && !(s.levels || []).some((l) => def.levels.includes(l))) E(`${w}: 전공 ${m} 은 학교급 ${s.levels} 에 없음`);
  });
  if (!TOPICS[s.topic]) E(`${w}: topic ${s.topic}`);
  if (!s.persona || !s.persona.name || !s.persona.role || !s.persona.tone) E(`${w}: persona`);
  if (!s.ending || !s.ending.good || !s.ending.mid || !s.ending.bad) E(`${w}: ending`);
  if (!(s.after || []).length) E(`${w}: after 비어 있음`);
  if ((s.goal || []).length < 2) W(`${w}: goal 2개 미만`);
  (s.laws || []).forEach((id) => law(id, w));
  if ((s.turns || []).length < 3) E(`${w}: 턴 3개 미만`);
  (s.turns || []).forEach((t, i) => {
    const tw = `${w} 턴${i + 1}`;
    if (!Array.isArray(t.msg) || !t.msg.length) E(`${tw}: msg`);
    if (!t.tip) W(`${tw}: tip 없음`);
    (t.laws || []).forEach((id) => law(id, tw));
    const g = (t.opts || []).map((o) => o.g);
    if (g.length < 3) E(`${tw}: 선택지 3개 미만`);
    if (g.filter((x) => x === 'safe').length !== 1) E(`${tw}: safe 선택지는 정확히 1개 (${g})`);
    if (!g.includes('risk')) E(`${tw}: risk 선택지 없음`);
    (t.opts || []).forEach((o, j) => {
      const ow = `${tw} 선택지${j + 1}`;
      if (!o.t || !o.fb || !o.re) E(`${ow}: t/fb/re 누락`);
      if (!['safe', 'warn', 'risk'].includes(o.g)) E(`${ow}: g`);
      if (o.g !== 'safe' && !(o.tags || []).length) E(`${ow}: 안전하지 않은 선택지에 유형 태그 없음`);
      (o.tags || []).forEach((x) => tag(x, ow));
      (o.laws || []).forEach((id) => law(id, ow));
    });
    // 길이로 정답이 드러나지 않는지: safe 가 유독 길면 경고
    const len = (t.opts || []).map((o) => (o.t || '').length), sIdx = g.indexOf('safe');
    const others = len.filter((_, k) => k !== sIdx);
    if (sIdx >= 0 && others.length && len[sIdx] > Math.max(...others) * 1.6) W(`${tw}: safe 선택지가 다른 것보다 눈에 띄게 김 (${len})`);
  });
}
const pids = new Set();
for (const p of PHRASES) {
  const w = `표현 ${p.id}`;
  if (pids.has(p.id)) E(`${w}: id 중복`); pids.add(p.id);
  for (const f of ['who', 'ctx', 'bad', 'good', 'why', 'tag', 'laws']) if (p[f] == null) E(`${w}: ${f} 누락`);
  if (!['student', 'parent'].includes(p.who)) E(`${w}: who`);
  tag(p.tag, w); (p.laws || []).forEach((id) => law(id, w));
}
for (const id of Object.keys(LAWS)) if (!usedLaws.has(id)) W(`LAWS.${id}: 어디에서도 쓰이지 않음`);

// 범위 표
const count = {};
for (const s of SCENARIOS) for (const l of s.levels) { const k = `${s.who}/${l}`; count[k] = (count[k] || 0) + 1; }
const majorCount = {};
for (const s of SCENARIOS) for (const m of s.majors) majorCount[m] = (majorCount[m] || 0) + 1;
for (const m of MAJORS) if (!majorCount[m.k]) W(`전공 ${m.k}: 전용 시나리오 없음`);
const typeCount = {};
for (const l of Object.values(LAWS)) typeCount[l.type] = (typeCount[l.type] || 0) + 1;

console.log(`시나리오 ${SCENARIOS.length} · 표현 ${PHRASES.length} · 근거 ${Object.keys(LAWS).length} · 유형 ${Object.keys(TAGS).length}`);
console.log('상대/학교급:', JSON.stringify(count));
console.log('전공:', JSON.stringify(majorCount));
console.log('근거 유형:', JSON.stringify(typeCount));
console.log(`턴 합계 ${SCENARIOS.reduce((a, s) => a + s.turns.length, 0)}`);
if (warns.length) console.log('\n경고 ' + warns.length + '건\n- ' + warns.join('\n- '));
if (errs.length) { console.log('\n오류 ' + errs.length + '건\n- ' + errs.join('\n- ')); process.exit(1); }
console.log('\n오류 없음');
