/* 반도체 새김 — 언어 전환(한국어/English)
   - 화면 글자는 한국어로 만들어 두고, 영어 모드일 때 i18n/en.js 사전으로 바꿔 보여 준다.
   - 정확히 같은 문장 → 사전 그대로, 숫자가 섞인 문장 → 숫자를 {0},{1}로 바꿔 찾고 다시 끼워 넣는다.
   - 새로 그려지는 화면(MutationObserver)과 캔버스 글자(fillText)까지 자동으로 바뀐다.
   - 번역에서 빼고 싶은 곳은 data-noi18n 속성을 단다. */
(function () {
  var q = null; try { q = new URLSearchParams(location.search).get('lang'); } catch (e) {}
  var saved = null; try { saved = localStorage.getItem('lang'); } catch (e) {}
  if (q === 'en' || q === 'ko') { saved = q; try { localStorage.setItem('lang', q); } catch (e) {} }
  var LANG = saved === 'en' ? 'en' : 'ko';
  // 고른 적이 없으면 기기 언어를 따른다(한국어가 아니면 영어). 검색 로봇은 한국어 그대로 보게 둔다.
  if (!saved) {
    var ua = (navigator.userAgent || '');
    var bot = /bot|crawl|spider|slurp|yeti|daum|naver|lighthouse|pagespeed|preview/i.test(ua);
    var langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']);
    var first = String(langs[0] || '').toLowerCase();
    if (!bot && first && first.indexOf('ko') !== 0) LANG = 'en';
  }
  window.LANG = LANG;
  window.setLang = function (l) { try { localStorage.setItem('lang', l); } catch (e) {} var u = new URL(location.href); u.searchParams.delete('lang'); location.replace(u.toString()); };
  window.T = function (s) { return s; };
  // 영어 데이터(data/en/*.json)를 한국어 원본 위에 덮어씌우기. 원본이 바뀌어(해시 불일치) 번역이 낡았으면 원본을 그대로 쓴다.
  var SRC = { theories: ['title', 'content'], questions: ['question', 'options', 'explanation', 'answer'], interviews: ['question', 'follow_up', 'follow_up_answer', 'interview_answer', 'key_points'], glossary: ['t', 'd', 'e', 'u'], careers: ['name', 'one', 'todo', 'flow', 'know', 'ask'], majors: ['name', 'alias', 'why'] };
  function hash(x, kind) {
    var s = JSON.stringify(SRC[kind].map(function (f) { return x[f] === undefined ? null : x[f]; })), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  window.i18nHash = hash;
  window.i18nOverlay = function (list, en, kind, keyOf) {
    if (LANG !== 'en' || !Array.isArray(list) || !Array.isArray(en)) return list;
    var m = {}, add = {}; en.forEach(function (e) { if (e && (e.id || e.k)) m[e.id || e.k] = e; });
    var out = list.map(function (x) {
      var e = m[keyOf ? keyOf(x) : x.id]; if (!e || e._h !== hash(x, kind)) return x;
      var y = {}; for (var f in x) y[f] = x[f];
      // 제목·용어 이름은 다른 데이터와 이어 주는 열쇠라 한국어로 두고, 화면 글자만 사전으로 바꾼다
      if (kind === 'theories') { if (e.title) add[x.title] = e.title; (x.tags || []).forEach(function (t, i) { if (e.tags && e.tags[i]) { add[t] = e.tags[i]; add['#' + t] = '#' + e.tags[i]; } }); if (e.content) y.content = e.content; y.title_en = e.title; }
      else if (kind === 'glossary') { if (e.t) add[x.t] = e.t; ['d', 'e', 'u'].forEach(function (f) { if (e[f] != null) y[f] = e[f]; }); y.t_en = e.t; if (e.t && x.en && String(x.en).toLowerCase() === String(e.t).toLowerCase()) y.en = ''; }
      else if (kind === 'careers') { ['name', 'one', 'todo', 'flow', 'ask'].forEach(function (f) { if (e[f] != null) y[f] = e[f]; }); if (Array.isArray(e.know) && Array.isArray(x.know)) y.know = x.know.map(function (k, i) { var o = {}; for (var f in k) o[f] = k[f]; if (e.know[i]) o.label = e.know[i]; return o; }); }
      else for (var g in e) if (g !== 'id' && g !== 'k' && g[0] !== '_') y[g] = e[g];
      return y;
    });
    if (window.i18nAdd) window.i18nAdd(add);
    return out;
  };
  if (LANG !== 'en') return;
  document.documentElement.lang = 'en';
  document.documentElement.classList.add('lang-en');
  // 사전은 영어일 때만 받는다(한국어 사용자는 추가 다운로드 없음). 그려지기 전에 있어야 깜빡임이 없어 동기로 불러온다.
  document.write('<script src="i18n/en.js?v=11"><\/script>');

  var HAN = /[가-힣ㄱ-ㆎ]/;
  var NUM = /[-−]?\d+(?:[.,]\d+)*(?:×10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)?/g;
  var miss = window.__i18nMiss = new Set();
  var cache = new Map();
  function D() { return window.I18N_EN || {}; }
  var PH = null;
  function phs() {
    if (PH) return PH; PH = []; var d = D();
    for (var key in d) {
      if (!/\{\d+\}/.test(key)) continue;
      var parts = key.split(/\{(\d+)\}/), lit = '', re = '^', idx = [];
      for (var i = 0; i < parts.length; i++) { if (i % 2 === 0) { lit += parts[i]; re += parts[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); } else { re += '(.+?)'; idx.push(+parts[i]); } }
      if (!HAN.test(lit)) continue;
      PH.push([new RegExp(re + '$'), key, idx, lit.length]);
    }
    PH.sort(function (a, b) { return b[3] - a[3]; });
    return PH;
  }
  function look(k) {
    var d = D(), v = d[k];
    if (v != null) return v;
    var nums = [], kt = k.replace(NUM, function (m) { nums.push(m); return '{' + (nums.length - 1) + '}'; });
    if (nums.length) { v = d[kt]; if (v != null) return v.replace(/\{(\d+)\}/g, function (_, i) { return nums[+i] != null ? nums[+i] : ''; }); }
    var R = window.I18N_EN_RULES || [];
    for (var i = 0; i < R.length; i++) { var m = k.match(R[i][0]); if (m) return typeof R[i][1] === 'function' ? R[i][1](m, tr) : k.replace(R[i][0], R[i][1]); }
    // 숫자가 아닌 값(이름·과목 등)이 끼어든 문장: 사전의 {0} 자리를 아무 글자나 받는 틀로 바꿔 맞춰 본다
    var P = phs();
    for (var j = 0; j < P.length; j++) {
      var mm = k.match(P[j][0]); if (!mm) continue;
      var idx = P[j][2];
      return d[P[j][1]].replace(/\{(\d+)\}/g, function (_, i) { var g = mm[idx.indexOf(+i) + 1]; return g == null ? '' : tr(g); });
    }
    // 'A · B', 'A — B' 처럼 이어 붙인 글은 조각마다 번역
    var SEP = [' · ', ' — ', ' / ', ' | ', ', '];
    for (var si = 0; si < SEP.length; si++) {
      if (k.indexOf(SEP[si]) < 0) continue;
      var ok = true, outp = k.split(SEP[si]).map(function (p) { if (!HAN.test(p)) return p; var x = look(p.trim()); if (x == null) ok = false; return x; });
      if (ok) return outp.join(SEP[si]);
    }
    // 끝의 괄호 '(…)'를 따로 번역: '반도체 8대 공정 (중급)'
    var mq = k.match(/^(.+?)\s*\(([^()]+)\)$/);
    if (mq) { var a1 = look(mq[1]), a2 = HAN.test(mq[2]) ? look(mq[2]) : mq[2]; if (a1 != null && a2 != null) return a1 + ' (' + a2 + ')'; }
    // 앞에 붙은 이모지·기호(📂 #, ★ 등)는 그대로 두고 뒤만 번역
    var mp = k.match(/^([^\uac00-\ud7a3A-Za-z0-9(]+?)(\s*)([\uac00-\ud7a3].*)$/);
    if (mp) { var x2 = look(mp[3]); if (x2 != null) return mp[1] + mp[2] + x2; }
    return null;
  }
  function tr(s) {
    if (s == null) return s; s = String(s);
    if (!HAN.test(s)) return s;
    var c = cache.get(s); if (c !== undefined) return c;
    var lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0], k = s.trim().replace(/\s+/g, ' ');
    var v = look(k);
    if (v == null) {
      // 줄바꿈/여러 문장으로 이어진 글은 문장 단위로 나눠 다시 시도
      var parts = k.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) || [k]; parts = parts.map(function (p) { return p.trim(); });
      if (parts.length > 1) { var out = parts.map(function (p) { var x = look(p); return x == null ? null : x; }); if (out.every(function (x) { return x != null; })) v = out.join(' '); }
    }
    if (v == null) { miss.add(k); c = s; } else c = (/^[.,;:)!?]/.test(v) ? '' : lead) + v + trail;
    if (cache.size > 20000) cache.clear();
    cache.set(s, c); return c;
  }
  window.T = tr;
  window.i18nAdd = function (o) { var d = window.I18N_EN || (window.I18N_EN = {}); var n = 0; for (var k in o) if (o[k] && d[k] == null) { d[k] = o[k]; n++; } if (n) { cache.clear(); PH = null; miss.clear(); if (document.body) walk(document.body); } };

  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, CODE: 1, PRE: 1 };
  var ATTR = ['placeholder', 'title', 'aria-label', 'alt', 'data-tip'];
  function skipEl(el) { for (var e = el; e && e.nodeType === 1; e = e.parentNode) { if (SKIP[e.nodeName] || e.isContentEditable || (e.hasAttribute && e.hasAttribute('data-noi18n'))) return true; } return false; }
  var INL = { B: 1, STRONG: 1, EM: 1, I: 1, SPAN: 1, A: 1, CODE: 1, SUB: 1, SUP: 1, MARK: 1 };
  // 한국어는 '<b>구리</b>는'처럼 붙여 쓰지만 영어는 띄어야 해서, 앞 글자와 맞닿으면 한 칸 띄운다
  function prevText(n) {
    for (var e = n; e; e = e.parentNode) {
      if (e.previousSibling) { var t = e.previousSibling.textContent; return t == null ? '' : t; }
      if (!e.parentNode || !INL[e.parentNode.nodeName]) return '';
    }
    return '';
  }
  function doText(n) {
    var v = n.nodeValue; if (!v || !HAN.test(v)) return; if (skipEl(n.parentNode)) return;
    var t = tr(v); if (t === v) return;
    if (/^[A-Za-z0-9(]/.test(t) && /[A-Za-z0-9).,:;%]$/.test(prevText(n))) t = ' ' + t;
    n.nodeValue = t;
  }
  function doAttrs(el) { for (var i = 0; i < ATTR.length; i++) { var a = el.getAttribute && el.getAttribute(ATTR[i]); if (a && HAN.test(a)) { var t = tr(a); if (t !== a) el.setAttribute(ATTR[i], t); } } }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (skipEl(root)) return; doAttrs(root); }
    var w = document.createTreeWalker(root, 5 /* ELEMENT|TEXT */, null), n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else if (SKIP[n.nodeName] || (n.hasAttribute('data-noi18n'))) { /* 하위는 doText에서 걸러짐 */ } else doAttrs(n); }
  }
  window.i18nWalk = walk;
  var mo = new MutationObserver(function (list) {
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.type === 'childList') for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
      else if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doAttrs(m.target);
    }
    if (document.title && HAN.test(document.title)) { var t = tr(document.title); if (t !== document.title) document.title = t; }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTR });
  document.addEventListener('DOMContentLoaded', function () { walk(document.body); var t = tr(document.title); if (t !== document.title) document.title = t; });

  // 캔버스 글자(단면도·3D 이름표·웨이퍼 그림)도 영어로
  var C2 = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
  if (C2) {
    var ft = C2.fillText, st = C2.strokeText, mt = C2.measureText;
    C2.fillText = function (s) { arguments[0] = tr(s); return ft.apply(this, arguments); };
    C2.strokeText = function (s) { arguments[0] = tr(s); return st.apply(this, arguments); };
    C2.measureText = function (s) { return mt.call(this, tr(s)); };
  }
  // alert/confirm/prompt 문구
  ['alert', 'confirm', 'prompt'].forEach(function (f) { var o = window[f]; if (o) window[f] = function (s) { arguments[0] = tr(s); return o.apply(window, arguments); }; });
})();
