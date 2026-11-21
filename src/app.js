(function () {
  'use strict';

  var D = window.SIMTALK_DATA || {};
  var TAGS = D.TAGS || {}, TOPICS = D.TOPICS || {}, MAJORS = D.MAJORS || [], LAWS = D.LAWS || {};
  var SCENARIOS = D.SCENARIOS || [], PHRASES = D.PHRASES || [], META = D.META || {};
  var STANDALONE = !!window.SIMTALK_STANDALONE;

  var AXES = { legal: '법적 안전', empathy: '공감·경청', process: '절차 준수', boundary: '경계·중립' };
  var GRADE = { safe: { label: '안전', pts: 10 }, warn: { label: '주의', pts: 5 }, risk: { label: '위험', pts: 0 } };
  var LAW_TYPES = ['법령', '고시·지침', '판례·결정', '사건·뉴스', '통계·매뉴얼'];

  /* ---------- 도구 ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* 무시 */ }

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('simtalk:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('simtalk:' + k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } }
  };

  var profile = store.get('profile', { who: 'all', level: 'all', major: 'all' });
  var settings = store.get('settings', { mode: 'choice', timer: 30, fb: 'instant', voice: 'off' });
  if (!settings.voice) { settings.voice = 'off'; }
  var history = store.get('history', []);
  var quizBest = store.get('quizBest', null);

  var view = $('#view'), layer = $('#layer'), nav = $('#nav');
  var sample = null;      // AI(Claude) 호출 함수. 없으면 null
  var sim = null;         // 진행 중인 상담
  var quiz = null;        // 진행 중인 퀴즈
  var ui = { lawType: 'all', lawQ: '', phWho: 'all', phTag: 'all', resetAsk: false };
  var toastId = 0;
  var flowSeq = 0;      // 비동기 흐름 식별자(상담이 바뀌면 이전 흐름 무효)

  /* ---------- 내비 ---------- */
  var NAV = [
    { k: 'home', label: '훈련 고르기', d: 'M4 5h16v11H9l-5 4z' },
    { k: 'quiz', label: '말실수 퀴즈', d: 'M13 2 4 14h7l-1 8 9-12h-7z' },
    { k: 'phrases', label: '말실수 사전', d: 'M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2zM9 8h6M9 12h6' },
    { k: 'laws', label: '법률 근거', d: 'M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0zM8 21h8' },
    { k: 'record', label: '내 기록', d: 'M4 20V10M10 20V4M16 20v-7M22 20H2' }
  ];
  function renderNav(cur) {
    var active = (cur === 'sim' || cur === 'report') ? 'home' : cur;
    nav.innerHTML =
      '<div class="brand"><i>빨간펜 첨삭</i><b>상담시뮬레이션톡</b><span>예비 교사 법률 대처 훈련</span></div>' +
      '<div class="nav-list">' + NAV.map(function (n) {
        return '<button class="nav-btn" data-go="' + n.k + '"' + (n.k === active ? ' aria-current="page"' : '') + '>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + n.d + '"/></svg>' +
          '<span>' + n.label + '</span></button>';
      }).join('') + '</div>' +
      '<div class="nav-foot">교육·훈련용 자료입니다. 실제 사안은 학교 관리자, 교육청 교육활동보호센터, 변호사와 상의하세요.' +
      (META.asOf ? '<br>법령 기준일 ' + esc(META.asOf) : '') + '</div>';
  }

  /* ---------- 라우팅 ---------- */
  var ROUTES = { home: renderHome, quiz: renderQuiz, phrases: renderPhrases, laws: renderLaws, record: renderRecord, sim: renderSim, report: renderReport };
  function current() { var h = (location.hash || '#home').slice(1); return ROUTES[h] ? h : 'home'; }
  function go(name) { if (current() === name) { render(); } else { location.hash = name; } }
  function render() {
    var r = current();
    if (r !== 'sim') { stopTimer(); voiceStop(); }
    if (r !== 'quiz') { stopQuizTimer(); }
    if ((r === 'sim' || r === 'report') && !sim) { r = 'home'; }
    renderNav(r);
    var shell = $('.app');
    if (shell) { shell.classList.toggle('in-sim', r === 'sim' && !!sim && sim.stage !== 'brief'); }
    ROUTES[r]();
    if (r !== 'sim') { window.scrollTo(0, 0); }
  }
  window.addEventListener('hashchange', render);

  function refocus(attr, group, val) {
    var els = document.querySelectorAll('[' + attr + '="' + group + '"]');
    for (var i = 0; i < els.length; i++) { if (els[i].dataset.val === val) { try { els[i].focus({ preventScroll: true }); } catch (e) { /* 무시 */ } return; } }
  }
  function toast(msg) {
    var id = ++toastId;
    var old = $('.toast'); if (old) { old.remove(); }
    var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { if (id === toastId && t.parentNode) { t.remove(); } }, 3200);
  }

  /* ---------- 공통 조각 ---------- */
  function lawChip(id) {
    var l = LAWS[id]; if (!l) { return ''; }
    return '<button class="lawchip" data-law="' + esc(id) + '">' + esc(l.name) + '</button>';
  }
  function lawChips(ids) { return (ids || []).map(lawChip).join(' '); }
  function tagLabel(t) { return TAGS[t] ? TAGS[t].label : t; }
  function whoLabel(w) { return w === 'parent' ? '학부모' : '학생'; }
  function bestOf(id) {
    var b = null; history.forEach(function (h) { if (h.id === id && (b == null || h.score > b)) { b = h.score; } });
    return b;
  }
  function isSpec(s) { return profile.major !== 'all' && s.majors.indexOf(profile.major) >= 0; }
  function matchScenarios() {
    return SCENARIOS.filter(function (s) {
      return (profile.who === 'all' || s.who === profile.who) &&
        (profile.level === 'all' || s.levels.indexOf(profile.level) >= 0) &&
        (profile.major === 'all' || s.majors.indexOf('공통') >= 0 || s.majors.indexOf(profile.major) >= 0);
    }).sort(function (a, b) { return (isSpec(b) ? 1 : 0) - (isSpec(a) ? 1 : 0) || a.diff - b.diff; });
  }
  function majorsFor(level) {
    return MAJORS.filter(function (m) { return level === 'all' || m.levels.indexOf(level) >= 0; });
  }
  function scCard(s) {
    var b = bestOf(s.id);
    return '<button class="sc-card" data-sc="' + esc(s.id) + '">' +
      '<div class="row" style="justify-content:space-between">' +
      '<span class="who ' + s.who + '"><i></i>' + whoLabel(s.who) + ' 상담</span>' +
      '<span class="row" style="gap:6px">' + (isSpec(s) ? '<span class="tag spec">내 전공</span>' : '') +
      '<span class="tag">' + esc(s.levels.join('·')) + '</span></span></div>' +
      '<h3>' + esc(s.title) + '</h3>' +
      '<p class="hook">“' + esc(s.sub) + '”</p>' +
      '<div class="foot"><span class="row" style="gap:6px"><span class="tag">' + esc(TOPICS[s.topic] || s.topic) + '</span>' +
      '<span class="diff" title="난이도 ' + s.diff + '/3" aria-label="난이도 ' + s.diff + '/3">' + '●'.repeat(s.diff) + '<span style="opacity:.25">' + '●'.repeat(3 - s.diff) + '</span></span></span>' +
      (b == null ? '<span>' + esc(s.channel) + ' · ' + s.turns.length + '턴</span>' : '<span class="best">최고 ' + b + '점</span>') +
      '</div></button>';
  }

  /* ---------- 홈 ---------- */
  function topMistake() {
    var c = {}; history.forEach(function (h) { (h.tags || []).forEach(function (t) { c[t] = (c[t] || 0) + 1; }); });
    var best = null; Object.keys(c).forEach(function (k) { if (!best || c[k] > c[best]) { best = k; } });
    return best;
  }
  function renderHome() {
    if (profile.major !== 'all' && !majorsFor(profile.level).some(function (m) { return m.k === profile.major; })) { profile.major = 'all'; }
    var list = matchScenarios();
    var avg = history.length ? Math.round(history.reduce(function (a, h) { return a + h.score; }, 0) / history.length) : null;
    var tm = topMistake();
    var counts = { law: 0, cas: 0, news: 0 };
    Object.keys(LAWS).forEach(function (k) {
      var t = LAWS[k].type;
      if (t === '판례·결정') { counts.cas++; } else if (t === '사건·뉴스') { counts.news++; } else { counts.law++; }
    });
    function chip(group, val, label) {
      return '<button class="chip" data-pick="' + group + '" data-val="' + esc(val) + '" aria-pressed="' + (profile[group] === val) + '">' + esc(label) + '</button>';
    }
    view.innerHTML =
      '<section class="hero">' +
      '<div><div class="eyebrow">예비 교사를 위한 법률 대처 훈련</div>' +
      '<h1>상담시뮬레이션톡</h1>' +
      '<p>학생과 학부모의 한마디에 제한 시간 안에 답해 보세요. 그 답이 법적으로 안전했는지, 어떤 조문과 판례에 걸리는지 바로 첨삭해 드립니다.</p>' +
      '<div class="row"><button class="btn chalk" data-act="quick">내 조건으로 바로 시작</button>' +
      '<button class="btn ghost" data-go="quiz">10문항 말실수 퀴즈</button></div></div>' +
      '<div class="demo" aria-hidden="true">' +
      '<div class="bubble them">선생님… 이거 비밀 지켜 주실 거죠?</div>' +
      '<div class="bubble me struck">그럼, 선생님만 알고 있을게.</div>' +
      '<div class="memo risk"><span class="stamp">위험! <small>비밀보장 절대 약속</small></span>' +
      '<span>학대·학교폭력을 알게 된 교사는 신고 의무가 있어 이 약속을 지킬 수 없습니다.</span></div>' +
      '</div></section>' +

      '<section class="card picker" aria-label="훈련 조건">' +
      '<div class="picker-row"><span>상대</span><div class="chips">' + chip('who', 'all', '전체') + chip('who', 'student', '학생') + chip('who', 'parent', '학부모') + '</div></div>' +
      '<div class="picker-row"><span>학교급</span><div class="chips">' + chip('level', 'all', '전체') + chip('level', '초', '초등학교') + chip('level', '중', '중학교') + chip('level', '고', '고등학교') + '</div></div>' +
      '<div class="picker-row"><span>전공</span><div class="chips">' + chip('major', 'all', '전체') +
      majorsFor(profile.level).map(function (m) { return chip('major', m.k, m.k); }).join('') + '</div></div>' +
      '</section>' +

      '<section class="stats">' +
      '<div class="stat"><b>' + history.length + '<span style="font-size:14px;font-weight:500"> 회</span></b><span>완료한 상담 훈련</span></div>' +
      '<div class="stat"><b>' + (avg == null ? '–' : avg) + '<span style="font-size:14px;font-weight:500"> 점</span></b><span>평균 점수</span></div>' +
      '<div class="stat"><b class="text">' + (tm ? esc(tagLabel(tm)) : '아직 기록 없음') + '</b><span>내가 가장 자주 한 말실수</span></div>' +
      '</section>' +

      '<section style="display:grid;gap:14px">' +
      '<div class="sec-head"><h2>상담 시나리오 ' + list.length + '개</h2>' +
      '<span class="muted small">법령·지침 ' + counts.law + '건 · 판례 ' + counts.cas + '건 · 사건 ' + counts.news + '건 반영</span></div>' +
      (list.length ? '<div class="grid">' + list.map(scCard).join('') + '</div>'
        : '<div class="empty">이 조건에 맞는 시나리오가 없습니다. 조건을 하나 풀어 보세요.</div>') +
      '</section>' +
      '<p class="notice">이 프로그램은 교육·훈련용이며 법률 자문이 아닙니다. 법령과 판례는 ' + esc(META.asOf || '') + ' 기준으로 정리했고 이후 개정될 수 있습니다. 실제 사안은 학교 관리자, 교육청 교육활동보호센터(1395), 변호사와 상의하세요. 등장하는 인물과 대화는 실제 사례 유형을 바탕으로 만든 가상입니다.</p>';
  }

  /* ---------- 음성: 상대 말 읽어 주기와 내 말 받아쓰기 ----------
     게시된 링크에서는 Claude가 제공하는 tts·dictation 기능을, 단독 실행 파일에서는 브라우저의 Web Speech API를 쓴다.
     어느 쪽이든 쓸 수 없으면 null로 두고 글자로만 진행한다. */
  var voice = { tts: null, stt: null, muted: false, speaking: false, last: Promise.resolve(), lastText: '', mic: 'idle', base: '', fin: '', part: '' };
  function noop() { /* 일부러 비움 */ }
  /* 괄호 속 지문은 읽지 않는다: “(가방을 두고 일어서며) 그냥 두고 갈게요” → “그냥 두고 갈게요” */
  function spoken(text) { return String(text || '').replace(/\([^)]*\)/g, ' ').replace(/…+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function voiceWhy() {
    return STANDALONE ? '이 브라우저는 음성 기능을 지원하지 않습니다. Chrome이나 Edge에서 열어 주세요.'
      : '이 화면에서는 음성을 쓸 수 없습니다. Chrome·Edge의 claude.ai 또는 Claude 데스크톱 앱 본창에서 열어 주세요.';
  }
  /* 저장된 설정을 지금 쓸 수 있는 범위로 낮춰서 읽는다(저장값 자체는 바꾸지 않는다) */
  function effVoice() {
    var v = settings.voice || 'off';
    if (v === 'talk' && (!voice.stt || settings.mode === 'choice')) { v = 'listen'; }
    if (v === 'listen' && !voice.tts) { v = 'off'; }
    return v;
  }
  function voiceOn() { return !!(sim && sim.voice && sim.voice !== 'off' && voice.tts && !voice.muted && current() === 'sim'); }
  function setSpeaking(on) { voice.speaking = !!on; refreshVoiceUi(); }
  function refreshVoiceUi() {
    var b = $('#voiceBtn');
    if (b) {
      b.hidden = !voice.tts;
      b.textContent = voice.muted ? '소리 켜기' : '소리 끄기';
      b.setAttribute('aria-pressed', String(!voice.muted));
    }
    var av = $('.phone-head .avatar'); if (av) { av.classList.toggle('speaking', !!voice.speaking); }
    var m = $('#micBtn');
    if (m) {
      m.hidden = !voice.stt;
      m.classList.toggle('live', voice.mic === 'listening');
      m.textContent = voice.mic === 'listening' ? '듣는 중 · 눌러서 멈춤' : voice.mic === 'starting' ? '마이크 준비 중…' : voice.mic === 'finishing' ? '마무리 중…' : '말하기';
      m.setAttribute('aria-pressed', String(voice.mic === 'listening'));
    }
  }

  /* 읽어 주기 제공자 */
  function capTts(t) {
    try {
      t.onState(function (e) {
        setSpeaking(e.state === 'starting' || e.state === 'speaking');
        if (e.state === 'idle' && e.reason) { sayFailed({ code: 'stopped', reason: e.reason }); }
      });
    } catch (e) { /* 상태 알림 없이도 동작 */ }
    return {
      say: function (text, who) { return t.add(text, { voice: who === 'student' ? 'airy' : 'rounded', language: 'ko' }); },
      stop: function () { try { return Promise.resolve(t.stop()).catch(noop); } catch (e) { return Promise.resolve(); } }
    };
  }
  function webTts() {
    var synth = window.speechSynthesis;
    if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') { return null; }
    function ko() {
      var vs = [];
      try { vs = synth.getVoices() || []; } catch (e) { /* 무시 */ }
      for (var i = 0; i < vs.length; i++) { if (/^ko/i.test(vs[i].lang)) { return vs[i]; } }
      return null;
    }
    ko();                                               // 목소리 목록을 미리 불러 둔다
    return {
      say: function (text, who) {
        return new Promise(function (res, rej) {
          var u = new window.SpeechSynthesisUtterance(text);
          u.lang = 'ko-KR'; var v = ko(); if (v) { u.voice = v; }
          u.rate = 1.05; u.pitch = who === 'student' ? 1.2 : 0.9;
          var begun = false, done = false;
          u.onstart = function () { begun = true; setSpeaking(true); };
          u.onend = function () { done = true; setSpeaking(!!synth.pending); res(); };
          u.onerror = function (e) {
            done = true; setSpeaking(false);
            var err = e && e.error;
            rej({ code: err === 'not-allowed' ? 'no_gesture' : (err === 'canceled' || err === 'interrupted') ? 'stopped' : 'upstream_error', reason: 'stopped' });
          };
          synth.speak(u);
          // 소리가 3초 안에 시작되지 않으면(목소리 없음 등) 기다리지 않고 글자로 넘어간다
          setTimeout(function () { if (!begun && !done && !synth.speaking) { try { synth.cancel(); } catch (e2) { /* 무시 */ } rej({ code: 'no_start' }); } }, 3000);
        });
      },
      stop: function () { try { synth.cancel(); } catch (e) { /* 무시 */ } setSpeaking(false); return Promise.resolve(); }
    };
  }
  function sayFailed(e) {
    var code = e && e.code, reason = e && e.reason;
    if (code === 'not_granted' || code === 'unavailable' || reason === 'not_granted' || reason === 'unavailable') {
      if (voice.tts) { voice.tts = null; toast('이 화면에서는 읽어 주기를 쓸 수 없어 글자로만 진행합니다'); }
    } else if (code === 'no_start') {
      if (voice.tts) { voice.tts = null; toast('이 브라우저에서 소리를 재생하지 못해 글자로 이어 갑니다'); }
    } else if (code === 'no_gesture' || code === 'rate_limited' || reason === 'viewer_stopped' || reason === 'rate_limited') {
      if (!voice.muted) {
        voice.muted = true;
        toast(code === 'rate_limited' || reason === 'rate_limited' ? '읽어 주기가 잠시 제한되어 글자로 이어 갑니다' : '읽어 주기를 멈췄습니다. 다시 들으려면 소리 켜기를 누르세요');
      }
    }
    refreshVoiceUi();
  }
  /* 한 문장을 읽는다. 끝나거나 실패하면 resolve 하며 reject 하지 않는다. */
  function say(text) {
    var s = spoken(text);
    if (!voiceOn() || !s || voice.mic !== 'idle') { return Promise.resolve(); }
    voice.lastText = s;
    var p;
    try { p = voice.tts.say(s.slice(0, 1900), sim.sc.who); } catch (e) { p = Promise.reject({ code: 'upstream_error' }); }
    voice.last = Promise.resolve(p).then(noop, sayFailed);
    return voice.last;
  }
  /* 다 읽을 때까지 기다리되, 소리가 막혀도 흐름이 멈추지 않게 글자 수에 비례한 한도를 둔다 */
  function sayWait(text) {
    if (!voiceOn()) { return Promise.resolve(); }
    return Promise.race([say(text), sleep(clamp(4000 + String(text).length * 260, 6000, 30000))]);
  }
  function voiceStop() {
    if (voice.tts) { voice.tts.stop(); }
    micStop();
    voice.speaking = false;
  }
  function toggleVoice() {
    if (!sim || !voice.tts) { return; }
    if (voice.muted) {
      voice.muted = false;
      var s = voice.lastText;                           // 누른 그 자리에서 마지막 말을 다시 읽어 준다
      if (s && voiceOn()) { try { voice.last = Promise.resolve(voice.tts.say(s, sim.sc.who)).then(noop, sayFailed); } catch (e) { /* 무시 */ } }
    } else {
      voice.muted = true; voice.tts.stop();
    }
    refreshVoiceUi();
  }

  /* 받아쓰기 제공자 */
  function capStt(d) {
    var lang = 'ko';
    try {
      d.onPartial(function (e) { micPartial(e.text); });
      d.onFinal(function (e) { micFinal(e.text); });
      d.onState(function (e) { micState(e.state); });
    } catch (e) { return null; }
    return {
      start: function () {
        var p = lang ? d.start({ language: lang }) : d.start();
        return Promise.resolve(p).catch(function (e) {
          if (e && e.code === 'unavailable' && lang) { lang = ''; throw { code: 'lang_unavailable' }; }
          throw e;
        });
      },
      stop: function () { try { return Promise.resolve(d.stop()).catch(noop); } catch (e) { return Promise.resolve(); } }
    };
  }
  function webStt() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (typeof SR !== 'function') { return null; }
    var rec = null;
    return {
      start: function () {
        return new Promise(function (res, rej) {
          var started = false;
          try { rec = new SR(); } catch (e) { rej({ code: 'unavailable' }); return; }
          rec.lang = 'ko-KR'; rec.interimResults = true; rec.continuous = true;
          rec.onstart = function () { started = true; micState('listening'); res(); };
          rec.onresult = function (ev) {
            var interim = '';
            for (var i = ev.resultIndex; i < ev.results.length; i++) {
              var r = ev.results[i];
              if (r.isFinal) { micFinal(r[0].transcript); } else { interim += r[0].transcript; }
            }
            micPartial(interim);
          };
          rec.onerror = function (ev) {
            var er = ev && ev.error;
            var code = (er === 'not-allowed' || er === 'service-not-allowed') ? 'not_granted' : er === 'no-speech' ? 'no_speech' : er === 'aborted' ? 'stopped' : 'upstream_error';
            if (!started) { rej({ code: code }); } else if (code !== 'stopped' && code !== 'no_speech') { micFailed({ code: code }); }
          };
          rec.onend = function () { micState('idle'); if (!started) { rej({ code: 'stopped' }); } };
          micState('starting');
          try { rec.start(); } catch (e) { micState('idle'); rej({ code: 'upstream_error' }); }
        });
      },
      stop: function () {
        if (rec) { try { rec.stop(); } catch (e) { /* 무시 */ } }
        return sleep(350);                               // 마지막 인식 결과가 들어올 시간을 준다
      }
    };
  }
  function micText() {
    var ta = $('#freeText');
    if (ta) { ta.value = (voice.base + voice.fin + voice.part).replace(/^\s+/, '').slice(0, 400); }
  }
  function micPartial(t) { voice.part = t || ''; micText(); }
  function micFinal(t) { voice.fin += t || ''; voice.part = ''; micText(); }
  function micState(state) { voice.mic = state || 'idle'; if (voice.mic === 'idle') { voice.part = ''; } refreshVoiceUi(); }
  function micFailed(e) {
    var code = e && e.code;
    voice.mic = 'idle';
    if (code === 'not_granted') { voice.stt = null; toast('마이크 사용이 허용되지 않았습니다. 글자로 입력해 주세요'); }
    else if (code === 'unavailable') { voice.stt = null; toast('이 화면에서는 받아쓰기를 쓸 수 없습니다. 글자로 입력해 주세요'); }
    else if (code === 'lang_unavailable') { toast('한국어 받아쓰기를 바로 쓸 수 없어 기본 언어로 바꿨습니다. 한 번 더 눌러 주세요'); }
    else if (code === 'rate_limited') { toast('받아쓰기가 잠시 제한되었습니다. 조금 뒤에 다시 눌러 주세요'); }
    else if (code !== 'dismissed' && code !== 'stopped' && code !== 'no_speech') { toast('받아쓰기를 시작하지 못했습니다. 다시 누르거나 글자로 입력해 주세요'); }
    refreshVoiceUi();
  }
  function toggleMic() {
    if (!sim || !voice.stt || !sim.awaiting || sim.busy) { return; }
    if (voice.mic === 'listening' || voice.mic === 'starting') { voice.stt.stop(); return; }
    if (voice.mic === 'finishing') { return; }
    var p = voice.stt.start();                           // 사용자의 클릭에서 곧바로 불러야 마이크가 열린다
    var ta = $('#freeText');
    voice.base = ta && ta.value.trim() ? ta.value.replace(/\s*$/, ' ') : ''; voice.fin = ''; voice.part = '';
    if (voice.tts) { voice.tts.stop(); }                 // 내가 말하는 동안에는 읽기를 멈춘다
    Promise.resolve(p).catch(micFailed);
  }
  function micStop() {
    if (voice.stt && voice.mic !== 'idle') { return Promise.resolve(voice.stt.stop()).catch(noop); }
    return Promise.resolve();
  }

  /* ---------- 상담 준비 ---------- */
  function openScenario(id) {
    var sc = SCENARIOS.filter(function (s) { return s.id === id; })[0];
    if (!sc) { return; }
    stopTimer();
    sim = { sc: sc, stage: 'brief' };
    go('sim');
  }
  function seg(group, opts, cur) {
    return '<div class="seg" role="group">' + opts.map(function (o) {
      return '<button data-set="' + group + '" data-val="' + esc(o[0]) + '" aria-pressed="' + (String(cur) === String(o[0])) + '"' + (o[2] ? ' disabled title="' + esc(o[2]) + '"' : '') + '>' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }
  function renderBrief() {
    var sc = sim.sc;
    if (settings.mode === 'ai' && !sample) { settings.mode = 'choice'; }
    view.innerHTML =
      '<div class="row"><button class="btn ghost small" data-go="home">← 목록으로</button></div>' +
      '<div class="brief">' +
      '<section class="card" style="display:grid;gap:16px">' +
      '<div class="row"><span class="who ' + sc.who + '"><i></i>' + whoLabel(sc.who) + ' 상담</span>' +
      '<span class="tag">' + esc(sc.levels.join('·')) + '</span><span class="tag">' + esc(sc.majors.join('·')) + '</span>' +
      '<span class="tag">' + esc(TOPICS[sc.topic] || '') + '</span></div>' +
      '<h1>' + esc(sc.title) + '</h1>' +
      '<dl class="kv">' +
      '<dt>상대</dt><dd>' + esc(sc.persona.name) + ' · ' + esc(sc.persona.role) + '</dd>' +
      '<dt>상황</dt><dd>' + esc(sc.scene) + '</dd>' +
      '<dt>채널</dt><dd>' + esc(sc.channel) + '</dd>' +
      '<dt>상대 상태</dt><dd>' + esc(sc.persona.tone) + '</dd>' +
      '</dl>' +
      '<div><b class="small muted">이번 훈련에서 볼 것</b><ul class="goal-list">' + sc.goal.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul></div>' +
      '<details class="fold"><summary>관련 법령·판례 미리 보기</summary><div class="row" style="margin-top:10px">' + lawChips(sc.laws) + '</div></details>' +
      '</section>' +
      '<section class="card" style="display:grid;gap:16px">' +
      // AI 자유 대화는 Claude 링크에서만 되므로 웹·단독 실행 파일에서는 선택지 자체를 보이지 않는다
      '<div class="opt-group"><b>응답 방식</b>' + seg('mode', [
        ['choice', '선택지 고르기'], ['free', '직접 입력']
      ].concat(STANDALONE ? [] : [['ai', 'AI 자유 대화', sample ? '' : 'Claude 앱에서 연 링크에서만 쓸 수 있습니다']]), settings.mode) +
      '<span class="hint">' + (settings.mode === 'choice' ? '상대의 말에 세 가지 답 중 하나를 고릅니다. 가장 빠르게 감을 잡는 방식입니다.'
        : settings.mode === 'free' ? '내 말로 직접 답합니다. 위험 표현을 키워드로 찾아 주는 보조 분석이라 맥락까지 읽지는 못하고, 상대의 반응은 준비된 대본에서 골라져 어색할 수 있습니다.'
          : 'AI가 상대 역할을 맡아 내 말에 반응하고, 내장된 법률 근거만으로 첨삭합니다. 내 Claude 사용량이 쓰입니다.') + '</span></div>' +
      '<div class="opt-group"><b>턴당 제한 시간</b>' + seg('timer', [[0, '없음'], [20, '20초'], [30, '30초'], [45, '45초']], settings.timer) +
      '<span class="hint">' + (STANDALONE ? '직접 입력은' : '직접 입력과 AI 대화는') + ' 타이핑 시간을 감안해 2배로 적용합니다.</span></div>' +
      '<div class="opt-group"><b>첨삭 시점</b>' + seg('fb', [['instant', '답할 때마다 바로'], ['after', '끝나고 한꺼번에']], settings.fb) + '</div>' +
      '<div class="opt-group"><b>음성(전화 상담처럼)</b>' + seg('voice', [
        ['off', '끔'], ['listen', '상대 말 듣기', voice.tts ? '' : voiceWhy()], ['talk', '듣고 말하기', voice.stt ? '' : voiceWhy()]
      ], effVoice()) +
      '<span class="hint">' + (!voice.tts && !voice.stt ? voiceWhy()
        : effVoice() === 'talk' ? '상대의 말을 소리로 듣고 마이크로 답합니다. 말한 내용이 글자로 바뀌면 확인하고 보내세요. 처음 한 번 마이크 사용을 허용해야 합니다.'
          : effVoice() === 'listen' ? '상대의 말을 소리로 읽어 줍니다. 다 듣고 나면 제한 시간이 시작됩니다.'
            : '상대의 말을 소리로 듣고 내 답은 말로 할 수 있습니다. 말하기는 ' + (STANDALONE ? '직접 입력에서' : '직접 입력과 AI 대화에서') + ' 쓸 수 있습니다.') + '</span></div>' +
      '<button class="btn" data-act="start">상담 시작</button>' +
      '</section></div>';
  }

  /* ---------- 상담 진행 ---------- */
  function startSim() {
    var sc = sim.sc;
    sim = {
      sc: sc, stage: 'run', mode: settings.mode, timer: Number(settings.timer) || 0, fb: settings.fb, voice: effVoice(),
      turn: 0, log: [], items: [], risk: 15, trust: 50, token: 0, awaiting: false, shuffled: [], ai: [], busy: false, started: Date.now()
    };
    if (sim.mode === 'ai' && !sample) { sim.mode = 'free'; }
    voice.muted = false; voice.lastText = ''; voice.last = Promise.resolve();
    var shell = $('.app'); if (shell) { shell.classList.add('in-sim'); }
    renderSim();
    pushItem({ k: 'sys', text: sc.channel + ' · ' + sc.persona.name + ' 님과의 상담이 시작되었습니다' });
    runTurn();
  }
  function maxTurns() { return sim.sc.turns.length; }
  function stale(tk) { return !sim || sim.token !== tk; }

  function renderSim() {
    if (sim.stage === 'brief') { renderBrief(); return; }
    var sc = sim.sc;
    var wide = true;
    try { wide = window.matchMedia('(min-width: 981px)').matches; } catch (e) { /* 무시 */ }
    view.innerHTML =
      '<div class="row" style="justify-content:space-between"><button class="btn ghost small" data-act="quit">← 상담 그만두기</button>' +
      '<span class="muted small" id="turnInfo"></span></div>' +
      '<div class="sim">' +
      '<section class="phone">' +
      '<div class="phone-head"><div class="avatar ' + sc.who + '">' + esc(sc.persona.name.charAt(0)) + '</div>' +
      '<div class="grow"><b>' + esc(sc.persona.name) + '</b><span>' + esc(sc.persona.role) + ' · ' + esc(sc.channel) + '</span></div>' +
      (sim.voice !== 'off' && voice.tts ? '<button class="btn ghost small" data-act="voiceToggle" id="voiceBtn" aria-pressed="true">소리 끄기</button>' : '') +
      '<span class="tag">' + (sim.mode === 'choice' ? '선택지' : sim.mode === 'free' ? '직접 입력' : 'AI 대화') + '</span></div>' +
      '<div class="chat" id="chat" aria-live="polite"></div>' +
      '<div class="reply" id="reply"></div>' +
      '</section>' +
      '<aside class="side">' +
      '<details class="card fold"' + (wide ? ' open' : '') + '><summary>상담 브리핑</summary>' +
      '<p class="small">' + esc(sc.scene) + '</p>' +
      '<ul class="goal-list small">' + sc.goal.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul></details>' +
      '<div class="card" id="gauges"></div>' +
      '<div class="card"><h3>관련 근거</h3><div class="row">' + lawChips(sc.laws) + '</div></div>' +
      '</aside></div>';
    var chat = $('#chat');
    sim.items.forEach(function (it) { chat.appendChild(itemEl(it)); });
    chat.scrollTop = chat.scrollHeight;
    updateSide();
    if (sim.stage === 'end') { setReply('end'); }
    else if (sim.awaiting) { setReply('input'); startTimer(); }
    else { setReply('wait'); }
    refreshVoiceUi();
  }

  function memoHtml(e) {
    var g = e.g, tags = (e.tags || []).map(tagLabel).filter(Boolean).join(' · ');
    var stamp = g === 'safe' ? '좋아요' : g === 'warn' ? '아슬아슬' : '위험!';
    return '<span class="stamp">' + stamp + ' <small>' + GRADE[g].label + (tags ? ' · ' + esc(tags) : '') + '</small></span>' +
      '<span>' + esc(e.fb) + '</span>' +
      (e.pos && e.pos.length ? '<span class="small muted">잘 들어간 요소: ' + esc(e.pos.join(', ')) + '</span>' : '') +
      (e.better && g !== 'safe' ? '<div class="better"><b>이렇게 말했다면</b>' + esc(e.better) + '</div>' : '') +
      (e.laws && e.laws.length ? '<div class="row">' + lawChips(e.laws) + '</div>' : '');
  }
  function itemEl(it) {
    var el = document.createElement('div');
    if (it.k === 'them') { el.className = 'bubble them'; el.textContent = it.text; }
    else if (it.k === 'me') { el.className = 'bubble me' + (it.struck ? ' struck' : ''); el.textContent = it.text; }
    else if (it.k === 'sys') { el.className = 'sys'; el.textContent = it.text; }
    else if (it.k === 'memo') { el.className = 'memo ' + it.entry.g; el.innerHTML = memoHtml(it.entry); }
    return el;
  }
  function pushItem(it) {
    sim.items.push(it);
    var chat = $('#chat');
    if (chat && current() === 'sim') { chat.appendChild(itemEl(it)); chat.scrollTop = chat.scrollHeight; }
  }
  function typingOn() {
    var chat = $('#chat'); if (!chat) { return; }
    var t = document.createElement('div'); t.className = 'typing'; t.id = 'typing'; t.innerHTML = '<i></i><i></i><i></i>';
    chat.appendChild(t); chat.scrollTop = chat.scrollHeight;
  }
  function typingOff() { var t = $('#typing'); if (t) { t.remove(); } }
  function typing(text) {
    typingOn();
    var ms = reduceMotion ? 250 : voiceOn() ? 450 : clamp(500 + (text || '').length * 18, 700, 1700);
    return sleep(ms).then(typingOff);
  }
  /* 상대의 말을 화면에 올리고, 음성이 켜져 있으면 다 읽을 때까지 기다린다 */
  function themSay(text, tk) {
    if (stale(tk)) { return Promise.resolve(); }
    pushItem({ k: 'them', text: text }); sim.ai.push({ role: 'them', text: text });
    return sayWait(text);
  }

  function updateSide() {
    var g = $('#gauges'); if (!g || !sim) { return; }
    g.innerHTML = '<h3>상담 상태</h3>' +
      '<div class="gauge risk"><div class="row"><span>법적 리스크</span><b>' + Math.round(sim.risk) + '</b></div><div class="gauge-bar"><i style="width:' + sim.risk + '%"></i></div></div>' +
      '<div class="gauge"><div class="row"><span>상대의 신뢰</span><b>' + Math.round(sim.trust) + '</b></div><div class="gauge-bar"><i style="width:' + sim.trust + '%"></i></div></div>' +
      (sim.fb === 'after' ? '<p class="hint">첨삭은 상담이 끝난 뒤 리포트에서 보여 드립니다.</p>' : '');
    var ti = $('#turnInfo');
    if (ti) { ti.textContent = '턴 ' + Math.min(sim.turn + 1, maxTurns()) + ' / ' + maxTurns(); }
  }

  function setReply(state) {
    var box = $('#reply'); if (!box) { return; }
    if (state === 'wait') {
      box.innerHTML = '<span class="hint">' + esc(sim.sc.persona.name) + ' 님이 말하는 중입니다…</span>'; return;
    }
    if (state === 'end') {
      box.innerHTML = '<div class="row" style="justify-content:space-between"><span class="hint">상담이 끝났습니다. 내 답이 어땠는지 확인해 보세요.</span>' +
        '<button class="btn" data-go="report">결과 리포트 보기</button></div>'; return;
    }
    var timerHtml = '<div class="timer" id="timer" hidden><b id="timerNum"></b><div class="timer-bar"><i id="timerBar"></i></div></div>';
    if (sim.mode === 'choice') {
      box.innerHTML = timerHtml + '<div class="opts">' + sim.shuffled.map(function (o, i) {
        return '<button class="opt" data-opt="' + i + '">' + esc(o.t) + '</button>';
      }).join('') + '</div>';
    } else {
      box.innerHTML = timerHtml + '<div class="free"><label class="sr" for="freeText">내 답변</label>' +
        '<textarea id="freeText" placeholder="교사로서 뭐라고 답하시겠어요? (Enter 전송 · Shift+Enter 줄바꿈)" maxlength="400"></textarea>' +
        '<div class="row"><span class="hint grow">' + (sim.mode === 'ai' ? 'AI가 상대 역할과 첨삭을 맡습니다.' : '키워드 기반 보조 분석입니다. 맥락 판단에는 한계가 있습니다.') + '</span>' +
        (sim.voice === 'talk' && voice.stt ? '<button class="btn ghost mic" data-act="mic" id="micBtn" aria-pressed="false">말하기</button>' : '') +
        '<button class="btn" data-act="send">보내기</button></div></div>';
      var ta = $('#freeText'); if (ta) { try { ta.focus({ preventScroll: true }); } catch (e) { /* 무시 */ } }
      refreshVoiceUi();
    }
  }

  /* 타이머 */
  function timeLimit() {
    if (!sim || !sim.timer) { return 0; }
    return sim.mode === 'choice' ? sim.timer : sim.timer * 2;
  }
  function startTimer() {
    stopTimer();
    var total = timeLimit(); var box = $('#timer');
    sim.tStart = Date.now();
    if (!total || !box) { return; }
    box.hidden = false; sim.tEnd = Date.now() + total * 1000;
    function tick() {
      var left = Math.max(0, sim.tEnd - Date.now());
      var num = $('#timerNum'), bar = $('#timerBar'), wrap = $('#timer');
      if (!num || !bar) { stopTimer(); return; }
      num.textContent = '남은 시간 ' + Math.ceil(left / 1000) + '초';
      bar.style.transform = 'scaleX(' + (left / (total * 1000)) + ')';
      wrap.classList.toggle('hurry', left < 8000);
      if (left <= 0) { stopTimer(); onTimeout(); }
    }
    tick(); sim.tId = setInterval(tick, 200);
  }
  function stopTimer() { if (sim && sim.tId) { clearInterval(sim.tId); sim.tId = null; } }

  function bestOpt(t) { return t.opts.filter(function (o) { return o.g === 'safe'; })[0] || t.opts[0]; }
  function curTurn() { return sim.sc.turns[Math.min(sim.turn, sim.sc.turns.length - 1)]; }

  function norm(s) { return String(s || '').replace(/[\s.,!?…“”"'~()·\-]/g, ''); }
  /* 직전 반응(prev)이 다음 메시지(m)와 8자 이상 겹치면 같은 말로 본다(최장 공통 부분 문자열) */
  function covered(prev, m) {
    var a = norm(prev), b = norm(m); if (!a || b.length < 4) { return false; }
    var need = Math.min(8, b.length), best = 0, row = [];
    for (var j = 0; j <= b.length; j++) { row.push(0); }
    for (var i = 1; i <= a.length; i++) {
      var cur = [0];
      for (var k = 1; k <= b.length; k++) { cur[k] = a.charAt(i - 1) === b.charAt(k - 1) ? row[k - 1] + 1 : 0; if (cur[k] > best) { best = cur[k]; } }
      row = cur;
    }
    return best >= need;
  }
  function runTurn(prev) {
    var tk = sim.token = ++flowSeq; var t = curTurn();
    sim.awaiting = false; setReply('wait');
    var p = Promise.resolve();
    t.msg.filter(function (m) { return !covered(prev, m); }).forEach(function (m) {
      p = p.then(function () { if (stale(tk)) { return; } return typing(m).then(function () { return themSay(m, tk); }); });
    });
    p.then(function () {
      if (stale(tk)) { return; }
      sim.shuffled = shuffle(t.opts.slice()); sim.awaiting = true; setReply('input'); startTimer();
    });
  }

  function applyGauges(e, opt) {
    var dr = e.g === 'safe' ? -6 : e.g === 'warn' ? 10 : 24;
    var dt = e.g === 'safe' ? 10 : e.g === 'warn' ? -3 : -12;
    if (opt && typeof opt.tr === 'number') { dt = opt.tr; }
    sim.risk = clamp(sim.risk + dr, 0, 100); sim.trust = clamp(sim.trust + dt, 0, 100);
  }
  function elapsed() { return Math.round((Date.now() - (sim.tStart || Date.now())) / 100) / 10; }

  function commit(entry, reaction, opt) {
    stopTimer(); sim.awaiting = false; micStop();
    entry.sec = entry.sec == null ? elapsed() : entry.sec;
    sim.log.push(entry); applyGauges(entry, opt);
    if (sim.fb === 'instant') { pushItem({ k: 'memo', entry: entry }); }
    updateSide(); setReply('wait');
    var tk = sim.token = ++flowSeq;
    var p = reaction ? typing(reaction).then(function () { return themSay(reaction, tk); }) : Promise.resolve();
    return p.then(function () {
      if (stale(tk)) { return; }
      sim.turn++;
      if (sim.turn >= maxTurns() || entry.end) { endSim(); return; }
      if (sim.mode === 'ai') { sim.awaiting = true; setReply('input'); startTimer(); }
      else { runTurn(reaction); }
    });
  }

  function choose(i) {
    if (!sim || !sim.awaiting) { return; }
    var t = curTurn(), o = sim.shuffled[i]; if (!o) { return; }
    sim.awaiting = false;
    pushItem({ k: 'me', text: o.t, struck: sim.fb === 'instant' && o.g === 'risk' });
    commit({
      turn: sim.turn, kind: 'choice', them: t.msg.join(' '), text: o.t, g: o.g, tags: o.tags || [], fb: o.fb,
      laws: o.laws || t.laws || [], better: o.g === 'safe' ? '' : bestOpt(t).t
    }, o.re, o);
  }

  function onTimeout() {
    if (!sim || !sim.awaiting) { return; }
    var t = curTurn();
    sim.awaiting = false;
    pushItem({ k: 'sys', text: '제한 시간 안에 답하지 못했습니다' });
    commit({
      turn: sim.turn, kind: 'timeout', them: t.msg.join(' '), text: '', g: 'warn', tags: ['silence'], pts: 3, sec: timeLimit(),
      fb: '즉답이 어려울 때 침묵하거나 얼버무리면 상대는 회피로 받아들입니다. “지금 바로 답하기 어려운 내용이라, 확인하고 오늘 중으로 다시 연락드리겠습니다”처럼 시간을 버는 문장을 준비해 두세요.',
      laws: [], better: bestOpt(t).t
    }, sim.sc.who === 'parent' ? '여보세요? 선생님, 듣고 계세요?' : '…선생님?');
  }

  /* ---------- 직접 입력: 키워드 보조 분석 ---------- */
  var NEG = /(수\s*(는|가)?\s*없|어렵|어려워|못\s*(해|합|하)|않(아|습|을|겠)|안\s*(돼|됩|되)|힘들|곤란|불가|드릴\s*수\s*없|말아)/;
  var RULES = [
    { tag: 'secret', re: /(비밀|아무(한테|에게)도|선생님만|우리(만|끼리))[^.?!\n]{0,16}(지켜|지킬|보장|약속|안\s*말|말\s*안|알고\s*있을게|얘기\s*안)/ },
    { tag: 'guarantee', re: /(반드시|무조건|꼭|확실히|100\s*%|책임지고|장담)[^.?!\n]{0,22}(처벌|전학|징계|해결|조치|분리|퇴학|막아|없도록|없게|바꿔)/ },
    { tag: 'guarantee', re: /(생기부|생활기록부|기록)에?[^.?!\n]{0,10}(안\s*남|남지\s*않)/ },
    { tag: 'blame', re: /(가해자|가해\s*학생이\s*맞|(걔|그\s*애|그\s*학생)가[^.?!\n]{0,8}(때린|괴롭힌|한)\s*(게|것이)\s*맞|문제아|원래\s*그런\s*(애|아이|학생)|상습범)/ },
    { tag: 'privacy', re: /(연락처|전화번호|집\s*주소|부모님?\s*번호)[^.?!\n]{0,14}(알려\s*드리|드릴게|보내\s*드리|알려\s*줄게)/ },
    { tag: 'privacy', re: /(그\s*(애|아이|학생|친구)|걔|상대\s*학생|그\s*집)[^.?!\n]{0,16}(ADHD|치료\s*받|약을?\s*먹|한부모|이혼|기초수급|형편이|징계\s*받|전에도\s*그런)/i },
    { tag: 'privacy', re: /((자폐|ADHD|지적\s*장애|우울증)(가|이)?\s*있어서)|병이니까/i },
    { tag: 'demean', re: /(한심|구제\s*불능|바보|멍청|쓰레기|꺼져|너\s*같은\s*(애|놈|것)|그것도\s*못|커서\s*뭐가|싹수|머리가\s*나쁘|입\s*닥|닥쳐|그\s*(꼴|모양)이)/ },
    { tag: 'parentblame', re: /(가정\s*교육|댁에서는[^.?!\n]{0,14}(안\s*하|어떻게)|(집|가정)에서(는)?\s*(도대체|대체)?\s*어떻게\s*(가르치|지도)|부모(님)?가\s*그러(니|시니))/ },
    { tag: 'threat', re: /((생기부|생활기록부|세특|태도\s*점수)[^.?!\n]{0,14}(적어\s*버|적을\s*거|깎|다시\s*봐야|불이익))|(계속\s*(이러|그러)(시면|면)[^.?!\n]{0,18}(처리|징계|각오|맡기\s*어렵))|급식\s*못\s*먹/ },
    { tag: 'side', re: /(그럴\s*(애|아이|학생)(는|가)?\s*아니(라고|에요|죠|야)|저도\s*그렇게\s*생각)/ },
    { tag: 'discriminate', re: /((다른\s*(애|아이|친구)들은|누구는|형은|언니는|동생은)[^.?!\n]{0,14}(너는|넌|왜\s*너만))|(다문화라|장애(가\s*있어서|라서)|한부모라|여자(애)?가\s*무슨|남자(애)?가\s*무슨)/ },
    { tag: 'sexual', re: /(예쁘네|예뻐졌|몸매|섹시|살\s*(좀\s*)?(빼|쪘)|치마가|남자\s*친구\s*있|여자\s*친구\s*있)/ },
    { tag: 'private', re: /(개인\s*(번호|카톡|인스타|연락처)[^.?!\n]{0,8}(알려|줄게|드릴게)|따로\s*(만나|밥)|둘이서?만\s*(만나|얘기)|밤에(도)?\s*(연락|전화)(해|하세요|주세요))/ },
    { tag: 'coverup', re: /(그냥\s*넘어가|없던\s*(일|걸)로|일을?\s*키우지|좋게\s*좋게|신고(는|까지)?\s*(하지\s*말|안\s*해도|할\s*필요)|애들\s*(끼리\s*)?(싸움|장난)|별일\s*아니|화해하고\s*끝)/ },
    { tag: 'emotional', re: /(고소하(세요|시든)|신고하(세요|시든가)|마음대로\s*하세요|법대로\s*하(세요|시죠)|저도\s*가만\s*안|어이가\s*없|말이\s*됩니까|교권\s*침해로\s*(신고|고발)하겠)/ },
    { tag: 'diagnose', re: /(ADHD|자폐|우울증|분노\s*조절\s*장애|경계선\s*지능|정신(과|병))[^.?!\n]{0,14}(같|인\s*것|예요|입니다|네요|맞)/i },
    { tag: 'gift', re: /(감사히\s*받|잘\s*(쓸|먹을)게요|성의(니까|라)|이번만\s*받)/ },
    { tag: 'favor', re: /(점수|성적|세특|생기부|등급)[^.?!\n]{0,14}(올려\s*(줄|드릴)|잘\s*써\s*(줄|드릴)|고쳐\s*(줄|드릴)|봐\s*(줄|드릴))/ },
    { tag: 'force', re: /(당장\s*사과|사과\s*시키겠|무릎\s*꿇|엎드려|맞아야|벌\s*세우)/ },
    { tag: 'legaljudge', re: /(학교\s*폭력|학폭|아동\s*학대|성희롱|성추행)(이|은|는|가)?[^.?!\n]{0,8}(아니에요|아닙니다|아니야|맞아요|맞습니다|확실합니다|해당\s*안)/ },
    { tag: 'admit', re: /((전부|모두|다)\s*(제|저의|학교)\s*(잘못|책임|과실)|제가\s*(다|전부)\s*책임|치료비[^.?!\n]{0,10}(제가|학교가)\s*(다|전부))/ },
    { tag: 'lead', re: /((아빠|엄마|그\s*(애|형|친구|선생님))가?[^.?!\n]{0,10}(때렸지|만졌지|그랬지|한\s*거\s*맞지))|증거\s*있(어|니|나요)/ },
    { tag: 'evidence', re: /((사진|영상|캡처)[^.?!\n]{0,12}(선생님한테|나한테|저한테|제게)\s*(보내|전송))|녹음\s*(하지\s*마|끄세요|지우)/ },
    { tag: 'politics', re: /(대통령|정당|여당|야당|보수|진보|좌파|우파)[^.?!\n]{0,16}(이\s*(맞|옳)|지지|뽑아|잘못됐)/ }
  ];
  var GOOD = [
    { label: '공감·경청', re: /(속상|놀라셨|놀랐|걱정|힘들었|힘드셨|마음이|말해\s*줘서|말씀해\s*주셔서|용기|이해(해|합니다|가\s*됩)|당황|불안)/ },
    { label: '사실 확인', re: /(확인(해|하고|한\s*뒤|이\s*필요)|살펴|파악|알아보|양쪽|사실\s*관계|들어\s*보)/ },
    { label: '절차 안내', re: /(절차|규정|지침|법령|학칙|기준|전담|위원회|심의|민원\s*대응|교감|교장|관리자|담당\s*(부서|선생님)|상담\s*(예약|일정)|공제회|이의\s*신청)/ },
    { label: '보고·신고 고지', re: /(보고|기록|신고|알려야|알릴\s*수밖에|도와줄\s*수\s*있는\s*(어른|분)|전문\s*기관|상담\s*선생님|위\s*클래스|Wee)/i },
    { label: '시한 약속', re: /(오늘\s*(중|안)|내일\s*(까지|오전|오후)|\d+\s*시(까지)?|다시\s*(연락|전화)|회신)/ },
    { label: '한계 고지', re: /(수(는|가)?\s*없(습니다|어요|어|다)|드리기\s*어렵|약속(할|드릴)\s*수(는)?\s*없|단정(하기|할\s*수)|제\s*권한|말씀드리기\s*어렵|알려\s*드릴\s*수\s*없|결정할\s*수\s*없|비밀로\s*할\s*수(는)?\s*없)/ }
  ];
  function analyze(text) {
    var tags = [], pos = [];
    RULES.forEach(function (r) {
      var m = r.re.exec(text); if (!m) { return; }
      var tail = text.slice(m.index + m[0].length, m.index + m[0].length + 14);
      if (NEG.test(m[0].slice(-6) + tail)) { return; }           // “약속할 수는 없어”처럼 부정·한계 고지는 제외
      if (tags.indexOf(r.tag) < 0) { tags.push(r.tag); }
    });
    GOOD.forEach(function (g) { if (g.re.test(text)) { pos.push(g.label); } });
    var sev = 'safe';
    tags.forEach(function (t) { var s = (TAGS[t] && TAGS[t].sev) || 'risk'; if (s === 'risk') { sev = 'risk'; } else if (sev !== 'risk') { sev = 'warn'; } });
    var fb, laws = [];
    if (tags.length) {
      fb = tags.map(function (t) { return TAGS[t] ? TAGS[t].why : ''; }).filter(Boolean).join(' ');
      tags.forEach(function (t) { ((TAGS[t] && TAGS[t].laws) || []).forEach(function (id) { if (laws.indexOf(id) < 0) { laws.push(id); } }); });
    } else if (text.replace(/\s/g, '').length < 10) {
      sev = 'warn'; tags = ['cold']; fb = '위험 표현은 없지만 너무 짧습니다. 상대의 감정을 받아 주는 말과 다음 절차를 함께 담아야 민원으로 번지지 않습니다.';
    } else if (pos.length === 0) {
      sev = 'warn'; tags = ['cold']; fb = '위험 표현은 찾지 못했습니다. 다만 공감, 사실 확인, 절차 안내 가운데 어느 것도 보이지 않아 상대가 방어적으로 느낄 수 있습니다.';
    } else {
      fb = '키워드 분석에서 위험 표현이 나오지 않았고, 필요한 요소가 들어 있습니다. 아래 권장 답과 비교해 빠진 점이 없는지 확인해 보세요.';
    }
    return { g: sev, tags: tags, pos: pos, fb: fb, laws: laws };
  }

  function sendFree() {
    if (!sim || !sim.awaiting || sim.busy) { return; }
    if (voice.stt && voice.mic !== 'idle') {            // 말하는 중에 보내면 마지막 말까지 받아 적은 뒤 보낸다
      var cur = sim;
      micStop().then(function () { voice.mic = 'idle'; refreshVoiceUi(); if (sim === cur) { sendFree(); } });
      return;
    }
    var ta = $('#freeText'); var text = ta ? ta.value.trim() : '';
    if (!text) { toast('답변을 입력해 주세요'); return; }
    if (sim.mode === 'ai') { sendAI(text); return; }
    var t = curTurn(), a = analyze(text);
    sim.awaiting = false;
    pushItem({ k: 'me', text: text, struck: sim.fb === 'instant' && a.g === 'risk' });
    commit({
      turn: sim.turn, kind: 'free', them: t.msg.join(' '), text: text, g: a.g, tags: a.tags, pos: a.pos, fb: a.fb,
      laws: a.laws.length ? a.laws : (t.laws || []), better: bestOpt(t).t
    }, pickReaction(t, a));
  }
  /* 직접 입력의 상대 반응: 같은 등급의 준비된 선택지 중 유형이 가장 많이 겹치는 것의 반응을 쓴다 */
  function pickReaction(t, a) {
    var same = t.opts.filter(function (o) { return o.g === a.g; });
    if (!same.length) { same = t.opts.filter(function (o) { return o.g !== 'safe'; }); }
    if (!same.length) { same = t.opts; }
    var best = same[0], bestN = -1;
    same.forEach(function (o) {
      var n = (o.tags || []).filter(function (x) { return a.tags.indexOf(x) >= 0; }).length;
      if (n > bestN) { best = o; bestN = n; }
    });
    return best.re;
  }

  /* ---------- AI 자유 대화 ---------- */
  function aiPrompt(text, hint) {
    var sc = sim.sc;
    var laws = sc.laws.map(function (id) { var l = LAWS[id]; return l ? '- [' + id + '] ' + l.name + ' (' + l.title + '): ' + l.gist + ' → ' + l.talk : ''; }).filter(Boolean).join('\n');
    var tags = Object.keys(TAGS).map(function (k) { return k + '=' + TAGS[k].label; }).join(', ');
    var press = sc.turns.map(function (t, i) { return (i + 1) + ') ' + t.msg.join(' '); }).join('\n');
    var tips = sc.turns.map(function (t) { return t.tip; }).filter(Boolean).map(function (x) { return '- ' + x; }).join('\n');
    var convo = sim.ai.map(function (m) { return (m.role === 'them' ? sc.persona.name : '교사') + ': ' + m.text; }).join('\n');
    var left = maxTurns() - sim.turn - 1;
    return [
      '당신은 한국의 예비 교사 상담 훈련 시뮬레이터 엔진입니다. 아래 두 가지 일을 한 번에 합니다.',
      '(1) 역할 연기: [상대 인물]이 되어 교사의 마지막 말에 현실적으로 반응하는 한국어 대사를 1~3문장으로 씁니다. 교사가 공감하고 절차를 안내하면 조금 누그러지고, 단정·약속·회피·비하가 나오면 더 몰아붙입니다. 아직 꺼내지 않은 [압박 포인트]가 있으면 자연스럽게 이어서 제기합니다. 욕설이나 실존 인물 언급은 쓰지 않습니다.',
      '(2) 첨삭: 교사의 마지막 말을 [법률 기준]과 [상담 원칙]에 비추어 평가합니다. [법률 기준]에 없는 조문이나 판례를 새로 만들어 내지 않습니다. 법적으로 문제 될 소지가 없고 공감과 절차 안내가 있으면 safe, 위법은 아니지만 공감 부족·모호함·불필요한 약속이 있으면 warn, 법적 분쟁이나 의무 위반으로 이어질 수 있으면 risk입니다.',
      '',
      '[상황] ' + sc.levels.join('·') + ' / ' + sc.majors.join('·') + ' / ' + sc.channel + '\n' + sc.scene,
      '[상대 인물] ' + sc.persona.name + ' (' + sc.persona.role + '), 현재 상태: ' + sc.persona.tone,
      '[압박 포인트]\n' + press,
      '[상담 원칙]\n' + tips,
      '[법률 기준]\n' + laws,
      '[말실수 유형 코드] ' + tags,
      '[지금까지의 대화]\n' + convo,
      '[교사의 마지막 말] ' + text,
      hint ? '[키워드 탐지 참고(오탐 가능)] ' + hint : '',
      '[남은 턴] ' + left + (left <= 0 ? ' — 이번이 마지막이므로 reply는 대화를 마무리하는 말로 쓰고 end를 true로 합니다.' : ''),
      '',
      '아래 형식의 JSON 객체 하나만 출력합니다. 다른 글은 쓰지 않습니다.',
      '{"reply":"상대 인물의 대사","grade":"safe|warn|risk","tags":["말실수 유형 코드 0~3개"],"why":"평가 이유 2문장 이내, 존댓말","better":"더 안전한 교사 발언 예시 1~2문장","lawIds":["법률 기준의 대괄호 안 id 0~3개"],"end":false}'
    ].filter(function (x) { return x !== ''; }).join('\n');
  }
  function sendAI(text) {
    var t = curTurn(), a = analyze(text);
    sim.awaiting = false; sim.busy = true; stopTimer();
    var sec = elapsed();
    pushItem({ k: 'me', text: text }); sim.ai.push({ role: 'me', text: text });
    setReply('wait'); typingOn();
    var tk = sim.token = ++flowSeq;
    var hint = a.tags.length ? a.tags.map(tagLabel).join(', ') : '';
    var prompt = aiPrompt(text, hint);
    sample.json(prompt, { modelTier: 'quick', cache: false }).then(function (r) {
      if (stale(tk)) { return; }
      typingOff(); sim.busy = false;
      r = r && typeof r === 'object' ? r : {};
      var g = GRADE[r.grade] ? r.grade : a.g;
      var tags = (Array.isArray(r.tags) ? r.tags : []).filter(function (x) { return TAGS[x]; }).slice(0, 3);
      var laws = (Array.isArray(r.lawIds) ? r.lawIds : []).filter(function (x) { return LAWS[x]; }).slice(0, 3);
      var reply = String(r.reply || '').slice(0, 400) || (t.opts.filter(function (o) { return o.g === g; })[0] || t.opts[0]).re;
      return commit({
        turn: sim.turn, kind: 'ai', them: lastThem(), text: text, g: g, tags: tags, pos: a.pos, sec: sec,
        fb: String(r.why || a.fb).slice(0, 400), laws: laws.length ? laws : a.laws, better: String(r.better || bestOpt(t).t).slice(0, 300), end: r.end === true
      }, reply);
    }).catch(function (e) {
      if (stale(tk)) { return; }
      typingOff(); sim.busy = false;
      var code = e && e.code;
      if (code === 'not_granted' || code === 'sampling_disabled' || code === 'not_declared' || code === 'capability_disabled' || code === 'capability_removed') {
        sim.mode = 'free'; toast('AI 대화를 쓸 수 없어 직접 입력 방식으로 이어 갑니다');
      } else if (code === 'rate_limited') { toast('AI 호출이 잠시 제한되었습니다. 이번 답은 키워드 분석으로 첨삭합니다'); }
      else { toast('AI 응답을 받지 못했습니다. 이번 답은 키워드 분석으로 첨삭합니다'); }
      return commit({
        turn: sim.turn, kind: 'free', them: lastThem(), text: text, g: a.g, tags: a.tags, pos: a.pos, sec: sec, fb: a.fb,
        laws: a.laws.length ? a.laws : (t.laws || []), better: bestOpt(t).t
      }, pickReaction(t, a));
    });
  }
  function lastThem() {
    for (var i = sim.ai.length - 1; i >= 0; i--) { if (sim.ai[i].role === 'them') { return sim.ai[i].text; } }
    return '';
  }

  /* ---------- 종료 · 점수 ---------- */
  function ptsOf(e) { return typeof e.pts === 'number' ? e.pts : GRADE[e.g].pts; }
  function scoreOf(log) {
    if (!log.length) { return 0; }
    return Math.round(log.reduce(function (a, e) { return a + ptsOf(e); }, 0) / (log.length * 10) * 100);
  }
  function axisScores(log) {
    var out = {};
    Object.keys(AXES).forEach(function (ax) {
      if (!log.length) { out[ax] = 0; return; }
      var sum = 0;
      log.forEach(function (e) {
        var hit = (e.tags || []).some(function (t) { return TAGS[t] && TAGS[t].ax === ax; });
        sum += (e.g !== 'safe' && hit) ? ptsOf(e) : 10;
      });
      out[ax] = Math.round(sum / (log.length * 10) * 100);
    });
    return out;
  }
  function endSim() {
    stopTimer(); sim.stage = 'end'; sim.awaiting = false;
    sim.score = scoreOf(sim.log);
    var tags = [];
    sim.log.forEach(function (e) { if (e.g !== 'safe') { (e.tags || []).forEach(function (t) { tags.push(t); }); } });
    history.push({ id: sim.sc.id, at: Date.now(), score: sim.score, mode: sim.mode, tags: tags });
    if (history.length > 200) { history = history.slice(-200); }
    store.set('history', history);
    pushItem({ k: 'sys', text: '상담이 끝났습니다' });
    setReply('end'); updateSide();
  }

  /* ---------- 리포트 ---------- */
  function verdict(score) {
    if (score >= 90) { return ['법정에 설 일 없는 상담', 'safe']; }
    if (score >= 70) { return ['대체로 안전, 한두 군데 아슬아슬', 'safe']; }
    if (score >= 50) { return ['민원으로 번질 수 있는 상담', 'warn']; }
    return ['이대로면 분쟁 가능성이 높습니다', 'risk'];
  }
  function renderReport() {
    if (!sim || sim.stage !== 'end') { go('sim'); return; }
    var sc = sim.sc, score = sim.score, v = verdict(score), ax = axisScores(sim.log);
    var ending = score >= 80 ? sc.ending.good : score >= 50 ? sc.ending.mid : sc.ending.bad;
    var C = 2 * Math.PI * 70, off = C * (1 - score / 100);
    var color = v[1] === 'safe' ? 'var(--safe)' : v[1] === 'warn' ? 'var(--warn)' : 'var(--pen)';
    var answered = sim.log.filter(function (e) { return e.kind !== 'timeout'; });
    var avgSec = answered.length ? (answered.reduce(function (a, e) { return a + (e.sec || 0); }, 0) / answered.length).toFixed(1) : '–';
    var cnt = { safe: 0, warn: 0, risk: 0 }; sim.log.forEach(function (e) { cnt[e.g]++; });
    view.innerHTML =
      '<div class="row no-print" style="justify-content:space-between"><button class="btn ghost small" data-go="home">← 목록으로</button>' +
      '<div class="row">' + (STANDALONE ? '<button class="btn ghost small" data-act="print">인쇄 · PDF 저장</button>' : '') +
      '<button class="btn small" data-act="retry">같은 상담 다시 하기</button></div></div>' +
      '<section class="card"><div class="report-top">' +
      '<div class="ring"><svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="70" fill="none" stroke="var(--surface-2)" stroke-width="12"/>' +
      '<circle cx="80" cy="80" r="70" fill="none" stroke="' + color + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/></svg>' +
      '<div class="num"><div><b>' + score + '</b><span>100점 만점</span></div></div></div>' +
      '<div style="display:grid;gap:12px;min-width:0">' +
      '<div><div class="eyebrow">' + esc(sc.title) + '</div><div class="verdict" style="color:' + color + '">' + esc(v[0]) + '</div></div>' +
      '<p>' + esc(ending) + '</p>' +
      '<div class="row"><span class="tag safe">안전 ' + cnt.safe + '</span><span class="tag warn">주의 ' + cnt.warn + '</span><span class="tag risk">위험 ' + cnt.risk + '</span>' +
      '<span class="tag">평균 응답 ' + avgSec + '초</span></div>' +
      '</div></div></section>' +

      '<section class="card" style="display:grid;gap:14px"><h2 style="font-size:17px">역량별 점수</h2><div class="axes">' +
      Object.keys(AXES).map(function (k) {
        return '<div class="axis"><span>' + AXES[k] + '</span><div class="gauge-bar"><i style="width:' + ax[k] + '%"></i></div><b>' + ax[k] + '</b></div>';
      }).join('') + '</div></section>' +

      '<section class="card" style="display:grid;gap:16px"><h2 style="font-size:17px">턴별 첨삭</h2><div class="review">' +
      sim.log.map(function (e, i) {
        return '<div class="review-item ' + e.g + '">' +
          '<div class="row"><b>' + (i + 1) + '번째 답</b><span class="tag ' + e.g + '">' + GRADE[e.g].label + '</span>' +
          (e.tags || []).map(function (t) { return '<span class="tag">' + esc(tagLabel(t)) + '</span>'; }).join('') + '</div>' +
          (e.them ? '<div class="quote them">' + esc(sc.persona.name) + ': ' + esc(e.them) + '</div>' : '') +
          '<div class="quote' + (e.g === 'risk' ? ' bad' : '') + '">나: ' + (e.text ? esc(e.text) : '(시간 초과로 답하지 못함)') + '</div>' +
          '<p class="small">' + esc(e.fb) + '</p>' +
          (e.better && e.g !== 'safe' ? '<div class="better small"><b>이렇게 말했다면</b>' + esc(e.better) + '</div>' : '') +
          (e.laws && e.laws.length ? '<div class="row">' + lawChips(e.laws) + '</div>' : '') +
          '</div>';
      }).join('') + '</div></section>' +

      (sample ? '<section class="card no-print" style="display:grid;gap:12px"><div class="sec-head"><h2 style="font-size:17px">AI 종합 코칭</h2>' +
        '<div class="row"><button class="btn small" data-act="coach" id="coachBtn">코칭 받기</button><button class="btn ghost small" data-act="coachStop" id="coachStop" hidden>멈추기</button></div></div>' +
        '<p class="hint">이번 상담 기록과 내장 법률 근거만 보고 정리합니다. 내 Claude 사용량이 쓰입니다.</p><div class="ai-out" id="coachOut"></div></section>' : '') +

      '<section class="card" style="display:grid;gap:12px"><h2 style="font-size:17px">실제 상황이었다면 상담 직후 할 일</h2><ul class="check-list">' +
      sc.after.map(function (a, i) { return '<li><label><input type="checkbox" id="chk' + i + '"><span>' + esc(a) + '</span></label></li>'; }).join('') + '</ul></section>' +

      '<section class="card" style="display:grid;gap:12px"><h2 style="font-size:17px">이 상담의 법적 근거</h2><div class="law-list">' +
      sc.laws.map(function (id) { return LAWS[id] ? lawCardHtml(id, true) : ''; }).join('') + '</div></section>' +
      '<p class="notice">교육·훈련용 첨삭이며 법률 자문이 아닙니다. 같은 말이라도 맥락, 반복성, 학생의 연령과 상태에 따라 법적 평가는 달라집니다.</p>';
  }
  var coachCtl = null;
  function coach() {
    if (!sample || !sim) { return; }
    var out = $('#coachOut'), btn = $('#coachBtn'), stop = $('#coachStop'); if (!out) { return; }
    var sc = sim.sc;
    var laws = sc.laws.map(function (id) { var l = LAWS[id]; return l ? '- ' + l.name + ' (' + l.title + '): ' + l.gist : ''; }).filter(Boolean).join('\n');
    var log = sim.log.map(function (e, i) {
      return (i + 1) + '. 상대: ' + e.them + '\n   교사: ' + (e.text || '(무응답)') + '\n   판정: ' + GRADE[e.g].label + ' / ' + (e.tags || []).map(tagLabel).join(', ');
    }).join('\n');
    var prompt = '당신은 한국 학교 현장의 교육활동 보호 전문 코치입니다. 아래는 예비 교사가 가상의 ' + whoLabel(sc.who) + ' 상담 훈련에서 한 대화 기록입니다.\n' +
      '[상황] ' + sc.scene + '\n[법률 기준]\n' + laws + '\n[대화와 판정]\n' + log + '\n\n' +
      '위 기록만 근거로 한국어 존댓말 코칭을 씁니다. [법률 기준]에 없는 조문·판례는 언급하지 않습니다. 형식: ' +
      '① 잘한 점 2가지 ② 꼭 고칠 점 2가지(왜 법적으로 위험한지 한 문장씩) ③ 다음에 그대로 쓸 수 있는 문장 2개. 전체 500자 이내, 마크다운 기호 없이 줄바꿈만 사용.';
    coachCtl = new AbortController();
    out.textContent = '생각하는 중…'; btn.disabled = true; stop.hidden = false;
    sample(prompt, { signal: coachCtl.signal, cache: false, onText: function (u) { out.textContent = u.text; } }).then(function (r) {
      out.textContent = r.text;
    }).catch(function (e) {
      var code = e && e.code;
      out.textContent = (e && e.text) || '';
      if (code === 'cancelled') { return; }
      toast(code === 'not_granted' ? 'AI 사용이 허용되지 않았습니다' : code === 'rate_limited' ? 'AI 호출이 잠시 제한되었습니다. 나중에 다시 눌러 주세요' : 'AI 코칭을 받지 못했습니다. 다시 눌러 주세요');
    }).then(function () { var b = $('#coachBtn'), s = $('#coachStop'); if (b) { b.disabled = false; } if (s) { s.hidden = true; } });
  }

  /* ---------- 말실수 퀴즈 ---------- */
  var QUIZ_SEC = 12;
  function startQuiz() {
    var picks = shuffle(PHRASES.slice()).slice(0, 10).map(function (p) {
      var bad = Math.random() < 0.55;
      return { p: p, say: bad ? p.bad : p.good, ans: bad ? 'risk' : 'safe' };
    });
    quiz = { items: picks, i: 0, res: [], stage: 'ask' };
    renderQuiz();
  }
  function stopQuizTimer() { if (quiz && quiz.tId) { clearInterval(quiz.tId); quiz.tId = null; } }
  function quizTimer() {
    stopQuizTimer();
    quiz.tEnd = Date.now() + QUIZ_SEC * 1000;
    function tick() {
      var left = Math.max(0, quiz.tEnd - Date.now());
      var num = $('#timerNum'), bar = $('#timerBar');
      if (!num || !bar) { stopQuizTimer(); return; }
      num.textContent = Math.ceil(left / 1000) + '초'; bar.style.transform = 'scaleX(' + (left / (QUIZ_SEC * 1000)) + ')';
      $('#timer').classList.toggle('hurry', left < 4000);
      if (left <= 0) { stopQuizTimer(); quizAnswer(null); }
    }
    tick(); quiz.tId = setInterval(tick, 200);
  }
  function quizAnswer(a) {
    if (!quiz || quiz.stage !== 'ask') { return; }
    stopQuizTimer();
    var q = quiz.items[quiz.i];
    quiz.res.push({ ok: a === q.ans, a: a }); quiz.stage = 'show';
    renderQuiz();
  }
  function renderQuiz() {
    var head = '<div class="page-head"><div class="eyebrow">즉각 대응 훈련</div><h1>말실수 퀴즈</h1>' +
      '<p>교사가 한 말이 화면에 뜹니다. 그대로 말해도 되는지 ' + QUIZ_SEC + '초 안에 판단하세요. 10문항이 무작위로 나옵니다.</p></div>';
    if (!quiz) {
      view.innerHTML = head + '<div class="card quiz-card">' +
        '<div class="quiz-say"><small>학교폭력 피해를 털어놓은 학생에게</small>“걱정 마, 선생님이 걔 반드시 전학 보내 줄게.”</div>' +
        '<p class="muted">이런 문장이 나옵니다. 위 문장은 위험합니다. 전학 조치는 심의위원회가 정하므로 교사가 결과를 약속할 수 없습니다.</p>' +
        '<div class="row" style="justify-content:space-between"><span class="muted small">' + (quizBest != null ? '내 최고 기록 ' + quizBest + ' / 10' : '아직 기록이 없습니다') + '</span>' +
        '<button class="btn" data-act="quizStart">퀴즈 시작</button></div></div>';
      return;
    }
    var prog = '<div class="progress" aria-hidden="true">' + quiz.items.map(function (_, i) {
      var r = quiz.res[i]; return '<i class="' + (r ? (r.ok ? 'ok' : 'no') : (i === quiz.i ? 'now' : '')) + '"></i>';
    }).join('') + '</div>';
    if (quiz.stage === 'done') {
      var ok = quiz.res.filter(function (r) { return r.ok; }).length;
      view.innerHTML = head + '<div class="card quiz-card">' + prog +
        '<div><div class="verdict" style="color:' + (ok >= 8 ? 'var(--safe)' : ok >= 5 ? 'var(--warn)' : 'var(--pen)') + '">' + ok + ' / 10 문항 정답</div>' +
        '<p class="muted">' + (ok >= 8 ? '위험한 말의 패턴을 잘 알아봅니다. 이제 시나리오에서 직접 말해 보세요.' : ok >= 5 ? '헷갈린 문장은 말실수 사전에서 이유를 다시 확인해 보세요.' : '위험 표현과 안전 표현의 차이를 말실수 사전에서 먼저 익히면 좋습니다.') + '</p></div>' +
        '<div style="display:grid;gap:8px">' + quiz.items.map(function (q, i) {
          return '<div class="row small"><span class="tag ' + (quiz.res[i].ok ? 'safe' : 'risk') + '">' + (quiz.res[i].ok ? '정답' : '오답') + '</span><span class="grow">“' + esc(q.say) + '” → ' + (q.ans === 'risk' ? '위험' : '안전') + '</span></div>';
        }).join('') + '</div>' +
        '<div class="row"><button class="btn" data-act="quizStart">다시 풀기</button><button class="btn ghost" data-go="phrases">말실수 사전 보기</button></div></div>';
      return;
    }
    var q = quiz.items[quiz.i];
    if (quiz.stage === 'ask') {
      view.innerHTML = head + '<div class="card quiz-card">' + prog +
        '<div class="timer" id="timer"><b id="timerNum"></b><div class="timer-bar"><i id="timerBar"></i></div></div>' +
        '<div class="quiz-say"><small>' + esc(q.p.ctx) + '</small>“' + esc(q.say) + '”</div>' +
        '<div class="quiz-btns"><button class="btn safe-btn" data-quiz="safe">말해도 된다</button><button class="btn risk-btn" data-quiz="risk">위험하다</button></div></div>';
      quizTimer();
      return;
    }
    var r = quiz.res[quiz.i];
    view.innerHTML = head + '<div class="card quiz-card">' + prog +
      '<div class="quiz-say"><small>' + esc(q.p.ctx) + '</small>“' + esc(q.say) + '”</div>' +
      '<div class="memo ' + (r.ok ? 'safe' : 'risk') + '" style="max-width:100%"><span class="stamp">' + (r.ok ? '정답' : r.a == null ? '시간 초과' : '오답') +
      ' <small>이 말은 ' + (q.ans === 'risk' ? '위험합니다' : '안전합니다') + ' · ' + esc(tagLabel(q.p.tag)) + '</small></span>' +
      '<span>' + esc(q.p.why) + '</span>' +
      (q.ans === 'risk' ? '<div class="better"><b>이렇게 바꾸면</b>' + esc(q.p.good) + '</div>' : '<span class="small muted">피해야 할 표현: “' + esc(q.p.bad) + '”</span>') +
      '<div class="row">' + lawChips(q.p.laws) + '</div></div>' +
      '<button class="btn" data-act="quizNext">' + (quiz.i >= quiz.items.length - 1 ? '결과 보기' : '다음 문항') + '</button></div>';
  }
  function quizNext() {
    if (!quiz) { return; }
    if (quiz.i >= quiz.items.length - 1) {
      quiz.stage = 'done';
      var ok = quiz.res.filter(function (r) { return r.ok; }).length;
      if (quizBest == null || ok > quizBest) { quizBest = ok; store.set('quizBest', ok); }
    } else { quiz.i++; quiz.stage = 'ask'; }
    renderQuiz();
  }

  /* ---------- 말실수 사전 ---------- */
  function renderPhrases() {
    var usedTags = [];
    PHRASES.forEach(function (p) { if (usedTags.indexOf(p.tag) < 0) { usedTags.push(p.tag); } });
    var list = PHRASES.filter(function (p) {
      return (ui.phWho === 'all' || p.who === ui.phWho) && (ui.phTag === 'all' || p.tag === ui.phTag);
    });
    function c(group, val, label) { return '<button class="chip" data-ui="' + group + '" data-val="' + esc(val) + '" aria-pressed="' + (ui[group] === val) + '">' + esc(label) + '</button>'; }
    view.innerHTML = '<div class="page-head"><div class="eyebrow">이 말 대신 이 말</div><h1>말실수 사전</h1>' +
      '<p>상담에서 무심코 나오는 말과, 같은 뜻을 법적으로 안전하게 전하는 말을 짝지었습니다. 총 ' + PHRASES.length + '쌍.</p></div>' +
      '<div class="card picker">' +
      '<div class="picker-row"><span>상대</span><div class="chips">' + c('phWho', 'all', '전체') + c('phWho', 'student', '학생') + c('phWho', 'parent', '학부모') + '</div></div>' +
      '<div class="picker-row"><span>유형</span><div class="chips">' + c('phTag', 'all', '전체') + usedTags.map(function (t) { return c('phTag', t, tagLabel(t)); }).join('') + '</div></div></div>' +
      (list.length ? '<div style="display:grid;gap:14px">' + list.map(function (p) {
        return '<article class="phrase">' +
          '<div class="bad"><span class="lbl">이렇게 말하면 위험</span><q>' + esc(p.bad) + '</q><span class="small muted">' + esc(p.ctx) + '</span></div>' +
          '<div class="good"><span class="lbl">이렇게 바꾸기</span><q>' + esc(p.good) + '</q></div>' +
          '<div class="why"><div class="row" style="margin-bottom:4px"><span class="tag risk">' + esc(tagLabel(p.tag)) + '</span>' + lawChips(p.laws) + '</div>' + esc(p.why) + '</div>' +
          '</article>';
      }).join('') + '</div>' : '<div class="empty">이 조건에 맞는 표현이 없습니다.</div>');
  }

  /* ---------- 법률 근거 ---------- */
  function lawCardHtml(id, compact) {
    var l = LAWS[id];
    return '<article class="card law-card">' +
      '<div class="row"><span class="tag">' + esc(l.type) + '</span>' + (l.date ? '<span class="small muted">' + esc(l.date) + '</span>' : '') + '</div>' +
      '<h3>' + esc(l.name) + '</h3><b class="small">' + esc(l.title) + '</b>' +
      '<p class="small">' + esc(l.gist) + '</p>' +
      '<p class="talk"><b>상담에서는</b> ' + esc(l.talk) + '</p>' +
      (l.url ? '<a class="small" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.src || '출처 열기') + ' ↗</a>' : (l.src ? '<span class="small muted">' + esc(l.src) + '</span>' : '')) +
      (compact ? '' : '') + '</article>';
  }
  function renderLaws() {
    var q = ui.lawQ.trim().toLowerCase();
    var ids = Object.keys(LAWS).filter(function (id) {
      var l = LAWS[id];
      if (ui.lawType !== 'all' && l.type !== ui.lawType) { return false; }
      if (!q) { return true; }
      return (l.name + ' ' + l.title + ' ' + l.gist + ' ' + l.talk).toLowerCase().indexOf(q) >= 0;
    });
    function c(val, label) { return '<button class="chip" data-ui="lawType" data-val="' + esc(val) + '" aria-pressed="' + (ui.lawType === val) + '">' + esc(label) + '</button>'; }
    var head = $('#lawList');
    var listHtml = ids.length ? ids.map(function (id) { return lawCardHtml(id); }).join('') : '';
    if (head && $('#lawSearch')) {            // 검색 중에는 입력창을 다시 그리지 않는다
      head.innerHTML = listHtml; $('#lawEmpty').hidden = ids.length > 0; $('#lawCount').textContent = ids.length + '건';
      return;
    }
    view.innerHTML = '<div class="page-head"><div class="eyebrow">' + esc(META.asOf || '') + ' 기준</div><h1>법률 근거</h1>' +
      '<p>시나리오와 첨삭에 쓰인 법령, 고시, 판례, 사건을 모았습니다. 카드마다 상담 언어에 주는 시사점과 출처를 붙였습니다.</p></div>' +
      '<div class="toolbar"><label class="sr" for="lawSearch">검색</label><input class="search" id="lawSearch" type="search" placeholder="예: 신고의무, 녹음, 생기부" value="' + esc(ui.lawQ) + '">' +
      '<span class="muted small" id="lawCount">' + ids.length + '건</span></div>' +
      '<div class="chips" id="lawTypes">' + c('all', '전체') + LAW_TYPES.map(function (t) { return c(t, t); }).join('') + '</div>' +
      '<div class="law-list" id="lawList">' + listHtml + '</div>' +
      '<div class="empty" id="lawEmpty"' + (ids.length ? ' hidden' : '') + '>검색 결과가 없습니다.</div>' +
      '<p class="notice">조문은 핵심만 요약했습니다. 정확한 문구와 최신 개정 여부는 각 카드의 출처(국가법령정보센터 등)에서 확인하세요.</p>';
  }
  function openLaw(id) {
    var l = LAWS[id]; if (!l) { return; }
    ui.lastFocus = document.activeElement;
    layer.innerHTML = '<div class="overlay" data-close="1"><div class="drawer" role="dialog" aria-modal="true" aria-label="' + esc(l.name) + '">' +
      '<div class="row" style="justify-content:space-between"><span class="tag">' + esc(l.type) + '</span><button class="btn ghost small" data-close="1" id="drawerClose">닫기</button></div>' +
      '<h2>' + esc(l.name) + '</h2><b>' + esc(l.title) + '</b>' + (l.date ? '<span class="small muted">' + esc(l.date) + '</span>' : '') +
      '<p>' + esc(l.gist) + '</p>' +
      '<p class="law-card"><span class="talk"><b>상담에서는</b> ' + esc(l.talk) + '</span></p>' +
      (l.url ? '<a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.src || '출처 열기') + ' ↗</a>' : (l.src ? '<span class="small muted">' + esc(l.src) + '</span>' : '')) +
      '</div></div>';
    var b = $('#drawerClose'); if (b) { b.focus(); }
  }
  function closeLayer() {
    if (!layer.innerHTML) { return; }
    layer.innerHTML = '';
    if (ui.lastFocus && document.contains(ui.lastFocus)) { try { ui.lastFocus.focus(); } catch (e) { /* 무시 */ } }
  }

  /* ---------- 내 기록 ---------- */
  function renderRecord() {
    var c = {}; history.forEach(function (h) { (h.tags || []).forEach(function (t) { c[t] = (c[t] || 0) + 1; }); });
    var tagRows = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).slice(0, 8);
    var max = tagRows.length ? c[tagRows[0]] : 1;
    var avg = history.length ? Math.round(history.reduce(function (a, h) { return a + h.score; }, 0) / history.length) : null;
    var doneIds = {}; history.forEach(function (h) { doneIds[h.id] = 1; });
    var byId = {}; SCENARIOS.forEach(function (s) { byId[s.id] = s; });
    view.innerHTML = '<div class="page-head"><div class="eyebrow">이 브라우저에만 저장됩니다</div><h1>내 기록</h1>' +
      '<p>훈련 기록은 지금 쓰는 기기의 브라우저에만 남습니다. 다른 사람이나 서버로 전송되지 않습니다.</p></div>' +
      '<section class="stats">' +
      '<div class="stat"><b>' + history.length + '<span style="font-size:14px;font-weight:500"> 회</span></b><span>완료한 상담 훈련</span></div>' +
      '<div class="stat"><b>' + Object.keys(doneIds).length + '<span style="font-size:14px;font-weight:500"> / ' + SCENARIOS.length + '</span></b><span>경험한 시나리오</span></div>' +
      '<div class="stat"><b>' + (avg == null ? '–' : avg) + '<span style="font-size:14px;font-weight:500"> 점</span></b><span>평균 점수' + (quizBest != null ? ' · 퀴즈 최고 ' + quizBest + '/10' : '') + '</span></div></section>' +
      '<section class="card" style="display:grid;gap:12px"><h2 style="font-size:17px">내가 자주 하는 말실수</h2>' +
      (tagRows.length ? '<div class="bars">' + tagRows.map(function (t) {
        return '<div class="bar-row"><span>' + esc(tagLabel(t)) + '</span><div class="gauge-bar gauge risk"><i style="width:' + Math.round(c[t] / max * 100) + '%;background:var(--pen)"></i></div><b>' + c[t] + '</b></div>';
      }).join('') + '</div>' : '<p class="muted">아직 기록된 말실수가 없습니다. 시나리오를 한 번 끝내면 여기에 유형별로 쌓입니다.</p>') + '</section>' +
      '<section class="card" style="display:grid;gap:12px"><h2 style="font-size:17px">최근 훈련</h2>' +
      (history.length ? '<div class="scroll-x"><table class="hist"><thead><tr><th>날짜</th><th>시나리오</th><th>방식</th><th>점수</th></tr></thead><tbody>' +
        history.slice(-15).reverse().map(function (h) {
          var d = new Date(h.at), s = byId[h.id];
          return '<tr><td>' + (d.getMonth() + 1) + '.' + d.getDate() + '</td><td>' + esc(s ? s.title : h.id) + '</td><td>' +
            (h.mode === 'choice' ? '선택지' : h.mode === 'free' ? '직접 입력' : 'AI 대화') + '</td><td class="num">' + h.score + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="muted">아직 끝낸 훈련이 없습니다.</p>') + '</section>' +
      (history.length ? '<div class="row">' + (ui.resetAsk
        ? '<span class="small">기록을 모두 지울까요? 되돌릴 수 없습니다.</span><button class="btn small" style="background:var(--pen)" data-act="resetYes">지우기</button><button class="btn ghost small" data-act="resetNo">취소</button>'
        : '<button class="btn ghost small" data-act="resetAsk">기록 모두 지우기</button>') + '</div>' : '');
  }

  /* ---------- 이벤트 ---------- */
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-go],[data-sc],[data-pick],[data-set],[data-act],[data-opt],[data-law],[data-ui],[data-quiz],[data-close]');
    if (!el) { return; }
    if (el.dataset.close) { if (ev.target === el) { closeLayer(); } return; }
    if (el.dataset.law) { openLaw(el.dataset.law); return; }
    if (el.dataset.go) { closeLayer(); go(el.dataset.go); return; }
    if (el.dataset.sc) { openScenario(el.dataset.sc); return; }
    if (el.dataset.pick) {
      profile[el.dataset.pick] = el.dataset.val; store.set('profile', profile); renderHome(); refocus('data-pick', el.dataset.pick, el.dataset.val); return;
    }
    if (el.dataset.set) {
      if (el.disabled) { return; }
      var v = el.dataset.val; settings[el.dataset.set] = el.dataset.set === 'timer' ? Number(v) : v;
      // 말하기는 직접 입력·AI 대화에서만 되므로 두 설정을 서로 맞춘다
      if (el.dataset.set === 'voice' && v === 'talk' && settings.mode === 'choice') { settings.mode = sample ? 'ai' : 'free'; }
      if (el.dataset.set === 'mode' && v === 'choice' && settings.voice === 'talk') { settings.voice = 'listen'; }
      store.set('settings', settings); renderBrief(); refocus('data-set', el.dataset.set, v); return;
    }
    if (el.dataset.ui) {
      ui[el.dataset.ui] = el.dataset.val;
      if (el.dataset.ui === 'lawType') { var s = $('#lawSearch'); if (s) { s.remove(); } renderLaws(); } else { renderPhrases(); }
      refocus('data-ui', el.dataset.ui, el.dataset.val);
      return;
    }
    if (el.dataset.opt) { choose(Number(el.dataset.opt)); return; }
    if (el.dataset.quiz) { quizAnswer(el.dataset.quiz); return; }
    switch (el.dataset.act) {
      case 'quick': {
        var list = matchScenarios(); if (!list.length) { toast('조건에 맞는 시나리오가 없습니다'); return; }
        var fresh = list.filter(function (s) { return bestOf(s.id) == null; });
        var pool = fresh.length ? fresh : list;
        openScenario(pool[Math.floor(Math.random() * pool.length)].id); break;
      }
      case 'start': startSim(); break;
      case 'send': sendFree(); break;
      case 'mic': toggleMic(); break;
      case 'voiceToggle': toggleVoice(); break;
      case 'quit': stopTimer(); voiceStop(); sim = null; go('home'); break;
      case 'retry': { var id = sim.sc.id; sim = null; openScenario(id); break; }
      case 'print': try { window.print(); } catch (e) { /* 무시 */ } break;
      case 'coach': coach(); break;
      case 'coachStop': if (coachCtl) { coachCtl.abort(); } break;
      case 'quizStart': startQuiz(); break;
      case 'quizNext': quizNext(); break;
      case 'resetAsk': ui.resetAsk = true; renderRecord(); break;
      case 'resetNo': ui.resetAsk = false; renderRecord(); break;
      case 'resetYes': history = []; quizBest = null; store.set('history', history); store.set('quizBest', null); ui.resetAsk = false; renderRecord(); toast('기록을 지웠습니다'); break;
    }
  });
  document.addEventListener('keydown', function (ev) {
    // 서랍을 닫는 Esc 만 가로챈다. 그 밖의 Esc 는 읽어 주기를 멈추는 데 쓰이도록 그대로 둔다.
    if (ev.key === 'Escape') { if (layer.innerHTML) { ev.preventDefault(); closeLayer(); } return; }
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && ev.target && ev.target.id === 'freeText') { ev.preventDefault(); sendFree(); }
  });
  document.addEventListener('input', function (ev) {
    if (ev.target && ev.target.id === 'lawSearch') { ui.lawQ = ev.target.value; renderLaws(); }
  });

  /* ---------- 시작 ---------- */
  function briefAgain() { if (current() === 'sim' && sim && sim.stage === 'brief') { renderBrief(); } }
  if (STANDALONE) { voice.tts = webTts(); voice.stt = webStt(); }
  render();
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('sample').then(function (s) {
      if (!s) { return; }
      sample = s; briefAgain();
    }).catch(function () { /* AI 없이 동작 */ });
    if (!STANDALONE) {
      window.claude.use('tts').then(function (t) { if (t) { voice.tts = capTts(t); briefAgain(); } }).catch(noop);
      window.claude.use('dictation').then(function (d) { if (d) { voice.stt = capStt(d); briefAgain(); } }).catch(noop);
    }
  }
  window.SIMTALK_TEST = { analyze: analyze, scoreOf: scoreOf, axisScores: axisScores };
})();
