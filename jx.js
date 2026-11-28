/* 직무 체험(현장·설계): 알람 대응 콘솔, SPC 관리도 운영실, 파형 디버거, 타이밍 ECO 작업대.
   site.js 가 #view-jx-run 을 처음 열 때만 이 파일을 불러온다. 체험마다 JX.reg(id, 만드는 함수)로 등록한다. */
(function () {
  'use strict';
  const J = window.JX = { exp: {}, cur: null, c: null, timers: [], dead: [] };
  J.reg = (id, fn) => { J.exp[id] = fn; };
  // ---------- 도우미 ----------
  const T = (s) => (J.c && J.c.T ? J.c.T(s) : s);
  const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const e = (s) => esc(T(s));
  J.T = T; J.esc = esc; J.e = e;
  J.timeout = (fn, ms) => { const h = setTimeout(() => { J.timers = J.timers.filter((x) => x !== h); fn(); }, ms); J.timers.push(h); return h; };
  J.interval = (fn, ms) => { const h = setInterval(fn, ms); J.timers.push(h); return h; };
  J.clear = (h) => { clearTimeout(h); clearInterval(h); J.timers = J.timers.filter((x) => x !== h); };
  J.stop = () => {
    J.timers.forEach((h) => { clearTimeout(h); clearInterval(h); }); J.timers = [];
    J.dead.forEach((f) => { try { f(); } catch (er) {} }); J.dead = [];
    J.cur = null;
  };
  J.onStop = (f) => { J.dead.push(f); };
  // 기록: 이 기기에만 저장
  J.load = (id) => { try { return JSON.parse(localStorage.getItem('semiJx_' + id) || 'null') || {}; } catch (er) { return {}; } };
  J.save = (id, o) => { try { localStorage.setItem('semiJx_' + id, JSON.stringify(Object.assign(J.load(id), o))); } catch (er) {} };
  // 난수(시드 고정): 같은 시드는 같은 장면
  J.rng = (seed) => { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
  J.gauss = (r) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  J.pad = (n) => (n < 10 ? '0' : '') + n;
  J.hms = (sec) => { sec = ((sec % 86400) + 86400) % 86400; return J.pad(Math.floor(sec / 3600)) + ':' + J.pad(Math.floor(sec / 60) % 60) + ':' + J.pad(Math.floor(sec) % 60); };
  J.grade = (pct) => (pct >= 90 ? 'S' : pct >= 75 ? 'A' : pct >= 55 ? 'B' : 'C');
  // 공통 CSS (한 번만 넣는다)
  J.css = (id, txt) => { if (document.getElementById(id)) return; const s = document.createElement('style'); s.id = id; s.textContent = txt; document.head.appendChild(s); };
  J.start = (id, root, ctx) => {
    J.stop(); J.c = ctx; J.root = root;
    if (!J.exp[id]) { root.innerHTML = '<div class="jx-load">' + e('체험을 찾지 못했어요.') + '</div>'; return; }
    J.cur = id; root.innerHTML = ''; root.className = 'jx-root';
    J.exp[id](root);
  };
  // 머리줄: 태그·제목·보조 버튼
  J.head = (tag, title, right) => `<div class="jx-hd"><span class="jx-tag">${e(tag)}</span><h2 class="jx-ttl">${e(title)}</h2><span class="jx-sp"></span>${right || ''}</div>`;
  // 선택 화면: 한 줄 안내 + 완료 수, 그리고 번호 타일
  J.sub = (txt, done, total) => `<p class="jx-sub"><span>${e(txt)}</span><span class="jx-cnt">${done} / ${total}</span></p>`;
  J.tiles = (items) => `<div class="jx-tiles">${items.map((x) => `<button class="jx-tile${x.sc != null ? ' done' : ''}" data-i="${x.i == null ? '' : x.i}" data-k="${x.k || ''}"><span class="jx-tn">${J.pad(x.n)}</span><span class="jx-tt"><b>${e(x.t)}</b><small>${x.tag}</small></span><span class="jx-ts">${x.sc != null ? `<i class="g${J.grade(x.sc)}">${J.grade(x.sc)}</i>` : '<u></u>'}</span></button>`).join('')}</div>`;
  // 결과 화면의 공통 모양
  J.score = (pct, label) => `<div class="jx-grade g${J.grade(pct)}"><b>${J.grade(pct)}</b><span>${pct}${label || '%'}</span></div>`;
  J.css('jx-core', `
.jx-root{--jx-bg:#f1f5f9;--jx-p1:#fff;--jx-p2:#e9eef5;--jx-ln:rgba(15,23,42,.12);--jx-tx:#0f172a;--jx-mu:#64748b;--jx-sub:#334155;--jx-ok:#059669;--jx-wn:#d97706;--jx-bd:#dc2626;--jx-ac:#2563eb;--jx-pu:#7c3aed;--jx-okbg:#ecfdf5;--jx-okln:#6ee7b7;--jx-okfg:#047857;--jx-bdbg:#fef2f2;--jx-bdln:#fca5a5;--jx-bdfg:#b91c1c;--jx-wnbg:#fffbeb;--jx-wnln:#fcd34d;--jx-wnfg:#b45309;--jx-infbg:#eff6ff;--jx-infln:#bfdbfe;--jx-inffg:#1d4ed8;--jx-ffbg:#e2e8f0;--jx-ffln:#cbd5e1;--jx-hi:#dbeafe;--jx-num:#0369a1;--jx-hov:rgba(15,23,42,.045);--jx-sel:rgba(37,99,235,.1)}
html.dark .jx-root{--jx-bg:#0b1220;--jx-p1:#101a30;--jx-p2:#16223d;--jx-ln:rgba(255,255,255,.1);--jx-tx:#e2e8f0;--jx-mu:#94a3b8;--jx-sub:#cbd5e1;--jx-ok:#34d399;--jx-wn:#fbbf24;--jx-bd:#f87171;--jx-ac:#60a5fa;--jx-pu:#a78bfa;--jx-okbg:#052e22;--jx-okln:#065f46;--jx-okfg:#34d399;--jx-bdbg:#3b1217;--jx-bdln:#7f1d1d;--jx-bdfg:#fca5a5;--jx-wnbg:#3a2a08;--jx-wnln:#78350f;--jx-wnfg:#fcd34d;--jx-infbg:#12233f;--jx-infln:#1e3a8a;--jx-inffg:#bfdbfe;--jx-ffbg:#1e293b;--jx-ffln:#334155;--jx-hi:#1e3a6e;--jx-num:#7dd3fc;--jx-hov:rgba(255,255,255,.04);--jx-sel:rgba(96,165,250,.1)}
.jx-root{color:var(--pt-ink,#0f172a);word-break:keep-all}
.jx-load{padding:3rem 1rem;text-align:center;color:var(--pt-mute,#64748b);font-weight:600}
.jx-hd{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin-bottom:.8rem}.jx-ttl{font-size:1.25rem;font-weight:800;color:var(--pt-ink,#0f172a);margin:0}.jx-sp{flex:1}
.jx-tag{font-size:.68rem;font-weight:800;letter-spacing:.06em;padding:.2rem .55rem;border-radius:999px;background:var(--pt-accbg,#eef2ff);color:var(--pt-acc,#4f46e5)}
.jx-btn{font-size:.82rem;font-weight:700;padding:.5rem .9rem;border-radius:.7rem;border:1px solid var(--pt-line,#e2e8f0);background:var(--pt-card,#fff);color:var(--pt-ink,#0f172a);cursor:pointer;line-height:1.25;transition:border-color .15s,background .15s,transform .05s}
.jx-btn:hover{border-color:var(--pt-acc,#4f46e5)}.jx-btn:active{transform:translateY(1px)}.jx-btn[disabled]{opacity:.4;cursor:default}
.jx-btn.pri{background:var(--pt-acc,#4f46e5);border-color:var(--pt-acc,#4f46e5);color:#fff}.jx-btn.sm{font-size:.74rem;padding:.35rem .65rem}
.jx-card{border:1px solid var(--pt-line,#e2e8f0);background:var(--pt-card,#fff);border-radius:1rem;padding:1rem}
.jx-sub{display:flex;align-items:center;gap:.6rem;margin:-.3rem 0 1rem;font-size:.88rem;font-weight:600;color:var(--pt-sub,#475569)}.jx-cnt{margin-left:auto;flex:none;font-size:.72rem;font-weight:800;padding:.22rem .65rem;border-radius:999px;background:var(--pt-soft,#f1f5f9);color:var(--pt-mute,#64748b);font-variant-numeric:tabular-nums}
.jx-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(18rem,1fr));gap:.65rem}
.jx-tile{display:flex;align-items:center;gap:.85rem;padding:.8rem .9rem;border-radius:1rem;border:1px solid var(--pt-line,#e2e8f0);background:var(--pt-card,#fff);cursor:pointer;text-align:left;font:inherit;color:inherit;transition:border-color .15s,transform .12s,box-shadow .15s}
.jx-tile:hover{border-color:var(--pt-acc,#4f46e5);transform:translateY(-2px);box-shadow:0 8px 20px -10px rgba(79,70,229,.45)}.jx-tile:active{transform:none}
.jx-tn{flex:none;width:2.6rem;height:2.6rem;border-radius:.85rem;display:grid;place-items:center;background:var(--pt-accbg,#eef2ff);color:var(--pt-acc,#4f46e5);font-weight:900;font-size:.95rem;font-variant-numeric:tabular-nums;letter-spacing:.02em}
.jx-tile.done .jx-tn{background:var(--pt-soft,#f1f5f9);color:var(--pt-mute,#64748b)}
.jx-tt{flex:1;min-width:0;display:flex;flex-direction:column;gap:.15rem}.jx-tt b{font-size:.95rem;font-weight:800;color:var(--pt-ink,#0f172a);line-height:1.3}.jx-tt small{font-size:.72rem;font-weight:700;color:var(--pt-mute,#64748b)}
.jx-ts{flex:none;display:grid;place-items:center;width:2rem;height:2rem}.jx-ts i{width:2rem;height:2rem;border-radius:50%;display:grid;place-items:center;font-style:normal;font-weight:900;font-size:.85rem;color:#fff}.jx-ts i.gS{background:#f59e0b}.jx-ts i.gA{background:#10b981}.jx-ts i.gB{background:#3b82f6}.jx-ts i.gC{background:#94a3b8}
.jx-ts u{width:.55rem;height:.55rem;border-right:2px solid var(--pt-mute,#94a3b8);border-top:2px solid var(--pt-mute,#94a3b8);transform:rotate(45deg);display:block;transition:transform .15s}.jx-tile:hover .jx-ts u{transform:rotate(45deg) translate(2px,-2px);border-color:var(--pt-acc,#4f46e5)}
.jx-menu{display:grid;grid-template-columns:repeat(auto-fill,minmax(17rem,1fr));gap:.7rem;margin-top:.6rem}
.jx-pick{text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:.3rem;font:inherit;color:inherit}.jx-pick:hover{border-color:var(--pt-acc,#4f46e5)}
.jx-pick b{font-size:.95rem;color:var(--pt-ink,#0f172a)}.jx-pick span{font-size:.78rem;color:var(--pt-sub,#475569);line-height:1.5}.jx-pick em{font-style:normal;font-size:.7rem;font-weight:800;color:var(--pt-mute,#64748b)}
.jx-pick .jx-st{font-size:.72rem;font-weight:800;color:var(--pt-acc,#4f46e5)}
.jx-meta,.jx-prog{display:block;font-size:.72rem;font-weight:700;color:var(--pt-mute,#64748b);margin-top:.3rem}.jx-prog{color:var(--pt-acc,#4f46e5)}
.jx-note{font-size:.8rem;line-height:1.65;color:var(--pt-sub,#475569)}
.jx-grade{display:inline-flex;align-items:baseline;gap:.5rem}.jx-grade b{font-size:2.4rem;font-weight:900;line-height:1}.jx-grade span{font-size:1rem;font-weight:800;color:var(--pt-sub,#475569)}
.jx-grade.gS b{color:#f59e0b}.jx-grade.gA b{color:#10b981}.jx-grade.gB b{color:#3b82f6}.jx-grade.gC b{color:#94a3b8}
.jx-stage{background:var(--jx-bg);color:var(--jx-tx);border-radius:1.1rem;border:1px solid var(--jx-ln);overflow:hidden;position:relative}
.jx-stage button{font-family:inherit}
.jx-two{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,.75fr);gap:.9rem;align-items:start}
@media(max-width:820px){.jx-two{grid-template-columns:minmax(0,1fr)}}
.jx-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.jx-toast{position:absolute;left:.7rem;right:.7rem;bottom:.7rem;padding:.6rem .8rem;border-radius:.8rem;font-size:.82rem;line-height:1.5;font-weight:600;z-index:6;animation:jxIn .18s ease-out;border:1px solid var(--jx-ln)}
.jx-toast.bad{background:var(--jx-bdbg);color:var(--jx-bdfg);border-color:var(--jx-bdln)}.jx-toast.ok{background:var(--jx-okbg);color:var(--jx-okfg);border-color:var(--jx-okln)}.jx-toast.info{background:var(--jx-infbg);color:var(--jx-inffg);border-color:var(--jx-infln)}
@keyframes jxIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes jxBlink{50%{opacity:.35}}
.lang-en .jx-btn{font-size:.76rem}
`);
})();
/* ===== 현장 직무 체험 1: 알람 대응 콘솔 ===== */
JX.reg('alarm', (root) => {
  const J = window.JX, e = J.e, T = J.T, esc = J.esc;
  J.css('jx-alarm', `
.al-top{display:flex;align-items:center;gap:.6rem;padding:.55rem .8rem;background:var(--jx-p1);border-bottom:1px solid var(--jx-ln);flex-wrap:wrap}
.al-top b{font-size:.9rem}.al-top .al-clk{margin-left:auto;font-size:1rem;font-weight:800;color:var(--jx-sub)}
.al-chip{font-size:.68rem;font-weight:900;letter-spacing:.06em;padding:.18rem .55rem;border-radius:.4rem;border:1px solid}
.al-chip.RUN{color:var(--jx-okfg);border-color:var(--jx-okln);background:var(--jx-okbg)}.al-chip.DOWN{color:var(--jx-bdfg);border-color:var(--jx-bdln);background:var(--jx-bdbg)}.al-chip.HOLD{color:var(--jx-wnfg);border-color:var(--jx-wnln);background:var(--jx-wnbg)}.al-chip.IDLE{color:var(--jx-sub);border-color:var(--jx-ffln);background:var(--jx-ffbg)}
.al-gs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.45rem;padding:.6rem .7rem}
@media(max-width:560px){.al-gs{grid-template-columns:repeat(4,minmax(0,1fr));gap:.3rem;padding:.45rem}.al-g{padding:.3rem .35rem}.al-g b{font-size:.98rem}.al-g em{display:none}.al-g svg{height:16px}.al-g span{font-size:.58rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.al-pn{min-height:4.6rem;max-height:7.4rem}.al-top{padding:.4rem .6rem}.al-mid{padding:0 .45rem .45rem}}
.al-g{background:var(--jx-p1);border:1px solid var(--jx-ln);border-radius:.7rem;padding:.4rem .55rem;transition:border-color .2s,background .2s}
.al-g.warn{border-color:var(--jx-wnln);background:var(--jx-wnbg)}.al-g.bad{border-color:var(--jx-bd);background:var(--jx-bdbg);animation:jxBlink 1s infinite}
.al-g span{display:block;font-size:.64rem;font-weight:700;color:var(--jx-mu)}.al-g b{font-size:1.15rem;font-weight:800}.al-g em{font-style:normal;font-size:.62rem;color:var(--jx-mu);margin-left:.2rem}
.al-g svg{display:block;width:100%;height:24px;margin-top:.15rem}
.al-mid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:.5rem;padding:0 .7rem .6rem}
@media(max-width:560px){.al-mid{grid-template-columns:minmax(0,1fr)}}
.al-pn{background:var(--jx-p1);border:1px solid var(--jx-ln);border-radius:.7rem;min-height:9.2rem;max-height:13rem;overflow:auto}
.al-pn h4{position:sticky;top:0;margin:0;padding:.3rem .6rem;font-size:.66rem;font-weight:800;color:var(--jx-mu);background:var(--jx-p2);letter-spacing:.05em}
.al-r{display:flex;gap:.45rem;align-items:flex-start;padding:.38rem .6rem;border-top:1px solid var(--jx-ln);font-size:.78rem;line-height:1.4;cursor:pointer;animation:jxIn .2s}
.al-r:hover{background:var(--jx-hov)}.al-r.new i{animation:jxBlink .8s infinite}.al-r.sel{outline:2px solid var(--jx-ac);outline-offset:-2px;background:var(--jx-sel)}
.al-r time{color:var(--jx-mu);font-size:.7rem;white-space:nowrap}.al-r i{width:.55rem;height:.55rem;border-radius:50%;margin-top:.3rem;flex:none}
.al-r.warn i{background:var(--jx-wn)}.al-r.alm i{background:#fb923c}.al-r.emo i{background:#ef4444}.al-r.sys i{background:#64748b}
.al-r.gone{opacity:.45;text-decoration:line-through}.al-r small{display:block;color:var(--jx-bdfg);font-weight:700}
.al-m{padding:.4rem .6rem;border-top:1px solid var(--jx-ln);font-size:.78rem;line-height:1.5;animation:jxIn .2s}.al-m b{display:block;font-size:.66rem;color:var(--jx-ac);font-weight:800}
.al-lot{display:flex;gap:.5rem;align-items:center;padding:.5rem .8rem;background:var(--jx-p1);border-top:1px solid var(--jx-ln);font-size:.78rem;color:var(--jx-sub)}.al-lot svg{flex:none}
.al-q{font-size:.95rem;font-weight:800;line-height:1.55;margin:.2rem 0 .5rem;color:var(--pt-ink)}
.al-cd{height:.3rem;border-radius:.2rem;background:var(--pt-soft,#f1f5f9);overflow:hidden;margin:.2rem 0 .6rem}.al-cd i{display:block;height:100%;background:#ef4444;transition:width .25s linear}
.al-acts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.4rem}
.al-a{display:flex;flex-direction:column;align-items:center;gap:.15rem;padding:.55rem .3rem;border-radius:.75rem;border:1px solid var(--pt-line);background:var(--pt-card);cursor:pointer;font:inherit;color:inherit;font-size:.76rem;font-weight:800;line-height:1.25;text-align:center}
.al-a span{font-size:1.15rem;line-height:1}.al-a small{font-size:.62rem;font-weight:600;color:var(--pt-mute);line-height:1.3}
.al-a:hover{border-color:var(--pt-acc);background:var(--pt-accbg)}.al-a.bad{border-color:#f87171;background:#fef2f2;animation:jxIn .2s}.al-a[disabled]{opacity:.45;cursor:default}
html.dark .al-a.bad{background:#3b1217}
.al-fm h5{margin:0 0 .3rem;font-size:.84rem;font-weight:800}.al-ch{display:flex;flex-direction:column;gap:.3rem;margin:.4rem 0}
.al-c{display:flex;gap:.5rem;align-items:flex-start;text-align:left;padding:.5rem .65rem;border-radius:.7rem;border:1px solid var(--pt-line);background:var(--pt-card);cursor:pointer;font:inherit;font-size:.8rem;line-height:1.45;color:inherit}
.al-c i{flex:none;width:1.05rem;height:1.05rem;border-radius:.3rem;border:2px solid var(--pt-mute);margin-top:.1rem;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-style:normal;color:#fff}
.al-c.on{border-color:var(--pt-acc);background:var(--pt-accbg)}.al-c.on i{background:var(--pt-acc);border-color:var(--pt-acc)}
.al-c.ok{border-color:#10b981;background:#ecfdf5}.al-c.ng{border-color:#f87171;background:#fef2f2}html.dark .al-c.ok{background:#052e22}html.dark .al-c.ng{background:#3b1217}
.al-fb{margin:.4rem 0;padding:.6rem .75rem;border-radius:.75rem;background:var(--pt-soft);font-size:.8rem;line-height:1.6}
.al-sum{display:flex;flex-direction:column;gap:.5rem;margin:.6rem 0}.al-sr{display:flex;gap:.6rem;padding:.65rem .8rem;border-radius:.8rem;border:1px solid var(--pt-line);background:var(--pt-card);font-size:.82rem;line-height:1.55}
.al-sr b{flex:none;width:1.4rem;height:1.4rem;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:.78rem;background:#10b981}.al-sr.l b{background:#f59e0b}.al-sr.x b{background:#ef4444}
.al-sr em{display:block;font-style:normal;font-size:.72rem;color:var(--pt-mute);margin-top:.15rem}
.al-brief{padding:1.2rem 1.1rem;display:flex;flex-direction:column;gap:.7rem;min-height:18rem;justify-content:center}.al-brief h3{margin:0;font-size:1.15rem;font-weight:800}.al-brief p{margin:0;font-size:.9rem;line-height:1.7;color:var(--jx-sub)}
.al-brief .jx-btn{align-self:flex-start}
`);
  const GD = {
    etch: [{ n: '압력', u: 'mTorr', b: 40, d: 1, w: 5, x: 10 }, { n: 'RF 반사', u: 'W', b: 3, d: 1, w: 6, x: 14 }, { n: '냉각수 유량', u: 'L/min', b: 8, d: 1, w: -1.5, x: -3 }, { n: '챔버 온도', u: '℃', b: 60, d: 0, w: 6, x: 12 }],
    gas: [{ n: '가스 농도', u: 'ppm', b: 0.2, d: 1, w: 2, x: 5 }, { n: '배기 압력', u: 'Pa', b: 120, d: 0, w: -25, x: -50 }, { n: '가스 유량', u: 'sccm', b: 100, d: 0, w: 15, x: 30 }, { n: '캐비닛 온도', u: '℃', b: 24, d: 0, w: 4, x: 8 }],
  };
  const ACT = [
    ['evac', '🚨', '비상 대피', '비상 정지, 사람부터'], ['log', '📝', '일지 기록', '있는 그대로 적기'], ['hold', '🔒', '로트 홀드', '로트를 멈춰 둠'],
    ['call', '📞', '엔지니어 호출', '담당자에게 연락'], ['esc', '⬆', '상급자 보고', '위로 올려 알림'], ['reset', '🧹', '알람 해제', '표시를 지움'],
    ['resume', '▶', '재가동', '다시 돌림'], ['bypass', '⛓', '인터락 우회', '안전 장치를 건너뜀'], ['wait', '👁', '지켜보기', '변화를 지켜봄'],
  ];
  const GEN = '지금은 이 행동을 할 때가 아니에요. 화면의 상태와 알람을 다시 읽어 보세요.';
  const SC = [
    { id: 'gas', t: '가스 경보', k: '비상', lv: 'emo', tool: 'CVD-02 · 가스 캐비닛', clk: '09:14:02', g: 'gas', st: 'RUN', lot: 'L-1180 · 가동 중',
      brief: '아침 9시 14분. 장비 옆을 지나가는데 가스 감지기의 경보음이 울려요. 냄새가 나는 것 같기도 해요.',
      steps: [
        { ev: [{ alarm: ['emo', '가스 누출 감지 (GAS-LEAK)'] }, { msg: ['경보', '가스 감지기 경보음이 울리고 있어요. 농도가 오르는 중이에요.'] }, { set: { 0: 6.5, 1: 70 } }], p: '농도가 계속 오르고 있어요. 지금 무엇을 할까요?', lim: 12, ok: ['evac'],
          bad: { log: '기록은 중요하지만, 사람이 위험할 수 있는 상황에서는 두 번째예요.', wait: '지켜보는 동안 노출이 늘어요. 사람부터 움직여요.', call: '연락은 대피한 뒤에도 할 수 있어요. 먼저 몸을 빼요.', reset: '경보를 꺼도 위험이 사라지지 않아요. 보이지 않을 뿐이에요.' },
          why: '가스와 화학물질 경보에서는 비상 절차를 따라 대피하는 것이 가장 먼저예요. 누출 지점 확인은 보호 장비를 갖춘 담당자의 몫이에요.',
          to: [{ alarm: ['emo', '노출 시간 초과 (대피 지연)'] }], after: [{ status: 'DOWN' }, { msg: ['시스템', '가스 공급 차단 밸브가 닫혔고 배기가 최대로 올라갔어요.'] }, { set: { 0: 2.6, 1: 120 } }] },
        { ev: [{ msg: ['나', '집결지에 도착했어요. 같이 있던 사람은 3명이에요.'] }], p: '집결지에 도착했어요. 이제 무엇을 할까요?', ok: ['esc'],
          bad: { resume: '지금은 다시 돌릴 때가 아니에요.', reset: '알람을 지워도 상황은 그대로예요.', log: '기록은 인원 확인과 보고를 마친 뒤에 해요.', wait: '자리에서 기다리기만 하면 안전 담당이 상황을 몰라요.', call: '안전 담당과 상급자에게 먼저 알려요.' },
          form: { h: '무엇을 전할까요? 사실만 골라요.', n: 3, it: [['장소, 시각, 경보 이름', 1], ['대피한 인원 수', 1], ['내가 한 조치(비상 대피)', 1], ['들어가서 직접 확인한 누출 지점', 0], ['원인은 배관 같다는 짐작', 0]] },
          why: '집결지에서 인원을 확인하고 안전 담당에게 사실을 보고해요. 허가 없이 다시 들어가지 않고, 원인은 짐작하지 않아요.', after: [{ msg: ['안전 담당', '보고 받았어요. 현장 접근은 제가 풀 때까지 금지예요.'] }] },
      ] },
    { id: 'etch', t: '식각 중 정지', k: '알람', lv: 'alm', tool: 'ETCH-03 · 챔버 B', clk: '14:32:10', g: 'etch', st: 'RUN', lot: 'L-2207 · 슬롯 12 챔버 안',
      brief: '오후 2시 32분. 식각이 한창일 때 장비가 멈추고 알람이 떴어요. 웨이퍼 한 장이 챔버 안에 있어요.',
      steps: [
        { ev: [{ alarm: ['alm', '압력 편차 · 공정 중단 (ALM-2031)'] }, { status: 'DOWN' }, { set: { 0: 57 } }], p: '장비가 멈췄어요. 첫 행동은 무엇일까요?', ok: ['log'],
          bad: { reset: '알람을 지우면 원인의 기록이 함께 사라져요.', resume: '원인을 모른 채 이어 돌리면 같은 일이 반복되고 웨이퍼도 더 상해요.', bypass: '멈춘 이유를 건너뛰는 행동이에요. 허가 없이는 안 돼요.', call: '연락할 때 전할 사실부터 정리해요. 먼저 기록해요.', wait: '화면은 그대로 두면 변하지 않아요. 지금 보이는 것을 남겨요.', hold: '로트를 멈추는 것은 기록을 남긴 다음이에요.' },
          form: { h: '무엇을 적을까요? 사실만 골라요.', n: 3, it: [['알람 번호와 시각', 1], ['챔버와 공정 단계', 1], ['로트와 슬롯 위치', 1], ['압력 센서가 고장 난 것 같다', 0], ['내가 설정을 바꿔 봤다', 0]] },
          why: '멈추면 먼저 알람 번호, 시각, 챔버, 단계를 있는 그대로 적어요. 원인 짐작은 사실을 가려요.', after: [{ msg: ['나', '일지에 알람 번호, 시각, 챔버, 단계, 로트와 슬롯을 적었어요.'] }] },
        { ev: [], p: '챔버 안의 웨이퍼와 같은 로트, 대기 중인 다음 로트는 어떻게 할까요?', ok: ['hold'],
          bad: { resume: '멈춘 장비에 새 로트를 올리면 영향 범위만 넓어져요.', reset: '알람은 지금 지울 대상이 아니에요.', wait: '가만히 두면 다음 로트가 자동으로 올라올 수 있어요.', bypass: '안전과 품질의 장치를 건너뛰면 안 돼요.', call: '연락 전에 영향이 번지지 않게 로트부터 잡아 둬요.', esc: '상급자에게는 상황이 정리된 뒤에 올려요. 먼저 로트를 잡아 둬요.' },
          why: '이동 금지(홀드)를 걸어 영향이 번지지 않게 하고, 챔버 안 웨이퍼는 손대지 않은 채 위치만 남겨요.', after: [{ lot: 'L-2207 · HOLD · 슬롯 12 챔버 안' }, { status: 'HOLD' }, { msg: ['시스템', 'L-2207 이동 금지가 걸렸어요.'] }] },
        { ev: [], p: '이제 엔지니어를 불러요. 무엇을 전할까요?', ok: ['call'],
          bad: { reset: '알람을 지우지 말고 담당자가 보게 남겨 두세요.', resume: '재가동은 엔지니어의 확인 뒤예요.', wait: '기다리기만 하면 복구가 늦어져요.', log: '기록은 이미 했어요. 이제 사람에게 전해요.', esc: '먼저 담당 엔지니어에게 연락해요.', bypass: '안 돼요.' },
          form: { h: '엔지니어에게 전할 말을 골라요.', n: 3, it: [['알람 번호, 시각, 챔버, 단계', 1], ['로트와 슬롯 위치, 챔버 안에 웨이퍼가 있다는 사실', 1], ['내가 한 조치: 기록과 로트 홀드', 1], ['원인은 아마 압력 센서 같아요', 0], ['일단 해제했는데 괜찮아 보여요', 0]] },
          why: '엔지니어에게는 사실이 먼저예요. 어디서 무슨 일이 있었고 무엇을 했는지만 전하면 진단이 빨라져요.', after: [{ msg: ['엔지니어', '확인할게요. 챔버는 열지 말고 그대로 대기해 주세요.'] }] },
      ] },
    { id: 'chain', t: '연쇄 알람', k: '알람', lv: 'alm', tool: 'ETCH-03 · 챔버 A', clk: '03:20:58', g: 'etch', st: 'RUN', lot: 'L-2231 · 가동 중',
      brief: '새벽 3시. 알람이 연달아 쌓이더니 장비가 멈췄어요. 화면에는 다섯 개가 한꺼번에 떠 있어요.',
      steps: [
        { ev: [{ alarm: ['warn', '냉각수 유량 낮음'], d: 0 }, { set: { 2: 6.2 }, d: 0 }, { alarm: ['warn', '챔버 온도 높음'], d: 3 }, { set: { 3: 68 }, d: 3 }, { alarm: ['alm', 'RF 반사 전력 높음'], d: 7 }, { set: { 1: 12 }, d: 7 }, { alarm: ['alm', '압력 편차'], d: 10 }, { set: { 0: 52 }, d: 10 }, { alarm: ['alm', '공정 중단'], d: 13 }, { status: 'DOWN', d: 13 }],
          pick: 0, p: '알람이 쌓이고 있어요. 원인을 가장 잘 말해 주는 알람을 눌러 표시하세요.',
          bad: { reset: '맨 위의 알람을 지워도 원인은 남아 있어요.', resume: '장비가 왜 멈췄는지 아직 몰라요.', wait: '기다리는 동안은 기록이 쌓이기만 해요. 알람의 순서를 읽어요.' }, pickBad: '마지막에 뜬 알람은 결과일 때가 많아요. 시각이 가장 이른 알람을 찾아보세요.',
          why: '연쇄 알람은 위에 뜬 것이 아니라 시각이 가장 이른 것이 단서예요. 뒤의 알람은 앞의 일이 만든 결과일 때가 많아요.', after: [] },
        { ev: [], p: '엔지니어에게 순서를 어떻게 넘길까요?', ok: ['call'],
          bad: { reset: '알람을 지우면 순서의 증거가 사라져요.', resume: '원인을 알기 전에 다시 돌리지 않아요.', log: '기록도 필요하지만 진단이 늦지 않게 먼저 연락해요.', wait: '기다리면 복구만 늦어져요.', esc: '담당 엔지니어에게 먼저 연락해요.' },
          form: { h: '어떻게 전할까요?', n: 2, it: [['알람 다섯 개를 시각 순서대로 전부 전달', 1], ['냉각수 유량 낮음이 가장 먼저였다는 사실', 1], ['공정 중단 알람만 전달', 0], ['첫 알람이 원인이라고 확정해서 전달', 0]] },
          why: '시각과 순서를 그대로 전하고 첫 알람을 원인 후보로 짚어요. 센서마다 감지 속도가 달라 첫 알람이 곧 원인이라고 단정하지는 않아요.', after: [{ msg: ['엔지니어', '냉각 라인부터 볼게요. 순서 잘 남겨 주셨네요.'] }] },
      ] },
    { id: 'ilk', t: '인터락과 납기', k: '안전', lv: 'alm', tool: 'PVD-01 · 로드락 도어', clk: '16:40:30', g: 'etch', st: 'RUN', lot: 'L-2250 · 납기 임박',
      brief: '오후 4시 40분. 도어 인터락 알람으로 장비가 멈췄어요. 오늘은 납기가 급한 날이에요.',
      steps: [
        { ev: [{ alarm: ['alm', '도어 인터락 · 장비 정지 (ILK-0412)'] }, { status: 'DOWN' }, { msg: ['선배', '납기 급해. 인터락 잠깐 우회하고 돌려. 내가 책임질게.'] }], p: '선배가 인터락을 우회하고 돌리라고 해요. 어떻게 할까요?', ok: ['esc'],
          bad: { bypass: '인터락 우회는 허가와 절차, 기록을 갖춘 담당자만 할 수 있어요. 큰 사고의 흔한 원인이에요.', resume: '인터락이 걸린 채로는 다시 돌릴 수 없어요.', reset: '알람이 거짓이라고 단정해서 지우면 안 돼요.', wait: '기다려도 인터락은 풀리지 않아요.', call: '엔지니어에게 가기 전에 우회를 요청받은 상황을 상급자에게 먼저 알려요.', log: '기록은 하되, 절차를 말씀드리고 보고하는 것이 먼저예요.' },
          bx: { bypass: [{ alarm: ['emo', '인터락 우회 기록 (미승인)'] }] },
          why: '절차를 설명하고 상급자에게 상황과 납기 영향을 보고해요. 책임을 대신 지겠다는 말로 안전 절차가 대체되지 않아요.', after: [{ msg: ['상급자', '인터락은 건드리지 마세요. 제가 담당과 납기를 조정할게요.'] }] },
        { ev: [{ msg: ['선배', '그냥 하라니까. 시간 없어.'] }], p: '선배가 계속 재촉해요. 이제 무엇을 할까요?', ok: ['call'],
          bad: { bypass: '재촉이 이어져도 우회는 안 돼요.', resume: '인터락 원인이 풀리기 전에는 돌릴 수 없어요.', reset: '알람을 지워도 인터락은 그대로예요.', wait: '장비가 멈춘 채 방치돼요. 담당자를 불러요.', log: '기록은 하되 원인을 점검할 사람을 부르는 게 먼저예요.', esc: '상급자에게는 이미 알렸어요. 이제 원인 점검을 맡길 사람을 불러요.' },
          form: { h: '엔지니어에게 전할 말을 골라요.', n: 3, it: [['도어 인터락 알람 번호와 시각', 1], ['납기 영향과 대기 중인 로트', 1], ['인터락은 해제하지 않았다는 사실', 1], ['인터락이 고장난 것 같다', 0]] },
          why: '원인을 점검할 사람을 부르고 사실만 전해요. 납기는 상급자와 엔지니어가 풀어야 할 문제예요.', after: [{ msg: ['엔지니어', '도어 센서를 점검할게요. 15분 안에 가요.'] }] },
      ] },
    { id: 'rst', t: '재가동 전 확인', k: '재가동', lv: 'warn', tool: 'ETCH-03 · 챔버 B', clk: '08:19:40', g: 'etch', st: 'IDLE', lot: 'L-2210 · 대기',
      brief: '아침 8시 20분. 밤새 부품을 교체했고 알람도 해제된 상태예요. 엔지니어가 "돌리세요"라고 말해요.',
      steps: [
        { ev: [{ msg: ['엔지니어', '밤에 부품 바꿨고 알람은 해제했어요. 이제 돌리세요.'] }], p: '재가동하기 전에 무엇을 확인할까요?', ok: ['resume'],
          bad: { bypass: '안 돼요.', reset: '이미 해제된 상태예요. 지금은 확인할 차례예요.', wait: '확인 없이 기다리기만 하면 아침 근무가 낭비돼요.', log: '확인을 마친 뒤에 적어요.', call: '이미 엔지니어와 이야기했어요. 확인할 항목을 골라 보세요.' },
          form: { h: '재가동 전에 확인할 것을 골라요.', n: 3, it: [['무엇을 어떻게 고쳤는지 기록', 1], ['부품 교체 후 시험 결과', 1], ['홀드 해제 승인', 1], ['알람 표시가 꺼졌다', 0], ['선배가 괜찮을 거라고 했다', 0]] },
          why: '알람 표시가 꺼진 것은 정상이라는 뜻이 아니에요. 고친 내용, 시험 결과, 홀드 해제 승인을 확인하고 돌려요.', after: [{ status: 'RUN' }, { msg: ['시스템', '첫 로트 투입: 슬롯 1~3 먼저 처리해요.'] }, { lot: 'L-2210 · 가동 중' }] },
        { ev: [], p: '재가동했어요. 이제 무엇을 할까요?', ok: ['wait'],
          bad: { log: '기록을 닫는 건 재발이 없다는 것을 본 뒤예요.', reset: '아직 지울 알람이 없어요.', call: '아직 이상이 없어요. 첫 로트를 지켜봐요.', esc: '아직 올릴 일이 없어요.', hold: '문제가 없는데 홀드를 걸 필요는 없어요.', resume: '이미 돌고 있어요.', bypass: '안 돼요.' },
          watch: 6, wev: [{ set: { 1: 9 }, d: 3 }, { alarm: ['warn', 'RF 반사 전력 높음 경고'], d: 4 }],
          why: '재가동 직후 첫 로트의 값과 같은 알람이 다시 오는지를 지켜봐요. 재발은 처음 몇 장에서 드러나요.', after: [] },
        { ev: [], p: '같은 방향의 경고가 다시 떴어요. 어떻게 할까요?', ok: ['call'],
          bad: { reset: '표시를 지우면 재발의 증거가 사라져요.', wait: '재발은 바로 알려요. 더 지켜보면 웨이퍼가 상해요.', log: '기록도 하지만 먼저 알려야 해요.', resume: '이미 가동 중이에요.', hold: '로트를 멈추는 것은 엔지니어와 상의해서 정해요.', esc: '담당 엔지니어에게 먼저 알려요.', bypass: '안 돼요.' },
          form: { h: '무엇을 전할까요?', n: 2, it: [['재가동 후 첫 로트에서 RF 반사 경고가 다시 떴다는 사실', 1], ['경고가 뜬 시각과 슬롯', 1], ['부품 교체가 잘못된 것 같다', 0]] },
          why: '재가동 뒤에 같은 경고가 오면 사실을 그대로 알려요. 교체가 잘못이라는 판단은 엔지니어가 해요.', after: [{ msg: ['엔지니어', '바로 갈게요. 다음 슬롯은 잠깐 멈춰 주세요.'] }] },
      ] },
  ];
  let pts = {}, A = null;
  const prog = J.load('alarm');
  const bestAll = () => { const v = Object.values(prog.sc || {}); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / SC.length) : null; };
  // ---------- 메뉴 ----------
  function menu() {
    A = null; J.timers.forEach((h) => { clearTimeout(h); clearInterval(h); }); J.timers = [];
    const done = Object.keys((J.load('alarm').sc) || {}).length;
    const sc0 = J.load('alarm').sc || {};
    let h = J.head('현장 직무', '알람 대응 콘솔') + J.sub('알람을 읽고 지금 할 행동을 골라요', done, SC.length) + J.tiles(SC.map((s, i) => ({ i, n: i + 1, t: s.t, tag: `${e(s.k)} · ${e(s.steps.length + '장면')}`, sc: sc0[s.id] })));
    root.innerHTML = h;
    root.querySelectorAll('.jx-tile').forEach((b) => b.addEventListener('click', () => brief(+b.dataset.i)));
  }
  function brief(i) {
    const s = SC[i];
    root.innerHTML = J.head('현장 직무', '알람 대응 콘솔', `<button class="jx-btn sm" id="alMenu">${e('상황 목록')}</button>`) +
      `<div class="jx-stage"><div class="al-brief"><span class="al-chip ${s.lv === 'emo' ? 'DOWN' : s.lv === 'alm' ? 'HOLD' : 'IDLE'}">${e(s.k)}</span><h3>${e(s.t)}</h3><p>${e(s.brief)}</p><p class="jx-mono" style="font-size:.78rem;color:var(--jx-mu)">${esc(s.tool)} · ${esc(s.clk)}</p><button class="jx-btn pri" id="alGo">${e('콘솔 앞에 앉기')}</button></div></div>`;
    document.getElementById('alMenu').onclick = menu; document.getElementById('alGo').onclick = () => play(i);
  }
  // ---------- 진행 ----------
  function play(si) {
    const sc = SC[si], gd = GD[sc.g];
    A = { si, sc, i: -1, sim: 0, g: gd.map((d) => ({ d, v: d.b, t: d.b, h: Array(40).fill(d.b) })), alarms: [], msgs: [], status: sc.st, lot: sc.lot, pts: 0, wrong: 0, bad: [], recs: [], lock: false, form: null, sel: null, lim: 0, limMax: 0, wait: false };
    const t0 = sc.clk.split(':').map(Number); A.t0 = t0[0] * 3600 + t0[1] * 60 + t0[2];
    root.innerHTML = J.head('현장 직무', sc.t, `<button class="jx-btn sm" id="alMenu">${e('상황 목록')}</button>`) +
      `<div class="jx-two"><div class="jx-stage" id="alStage"><div class="al-top"><b class="jx-mono">${esc(sc.tool)}</b><span class="al-chip" id="alSt"></span><span class="al-clk jx-mono" id="alClk"></span></div>
      <div class="al-gs" id="alGs"></div><div class="al-mid"><div class="al-pn" id="alAl"><h4>${e('알람 목록')}</h4><div id="alRows"></div></div><div class="al-pn" id="alMs"><h4>${e('무전 · 메시지')}</h4><div id="alMsg"></div></div></div>
      <div class="al-lot"><svg width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="12" fill="none" stroke="var(--jx-mu)" stroke-width="2"/><circle cx="15" cy="15" r="4" fill="var(--jx-mu)"/></svg><span id="alLot"></span></div></div>
      <div class="jx-card" id="alSide"></div></div>`;
    document.getElementById('alMenu').onclick = menu;
    document.getElementById('alGs').innerHTML = A.g.map((g, k) => `<div class="al-g" data-k="${k}"><span>${e(g.d.n)}</span><b class="jx-mono">-</b><em>${esc(g.d.u)}</em><svg viewBox="0 0 100 24" preserveAspectRatio="none"><polyline fill="none" style="stroke:var(--jx-ac)" stroke-width="1.4" points=""/></svg></div>`).join('');
    document.getElementById('alRows').addEventListener('click', (ev) => { const r = ev.target.closest('.al-r'); if (r) rowClick(+r.dataset.k); });
    drawStatus(); drawLot(); A.h = J.interval(tick, 250); nextStep();
  }
  const stage = () => document.getElementById('alStage');
  function tick() {
    if (!A) return;
    A.sim += .25; document.getElementById('alClk').textContent = J.hms(A.t0 + A.sim);
    A.g.forEach((g, k) => {
      const d = g.d, nz = Math.max(Math.abs(d.w), Math.abs(d.b) * .05) * .05;
      g.v += (g.t - g.v) * .22 + (Math.random() - .5) * nz * 2; if (g.v < 0) g.v = 0; g.h.push(g.v); g.h.shift();
      const dev = g.v - d.b, st = d.w > 0 ? (dev >= d.x ? 'bad' : dev >= d.w ? 'warn' : '') : (dev <= d.x ? 'bad' : dev <= d.w ? 'warn' : '');
      const el = document.querySelector(`#alGs .al-g[data-k="${k}"]`); if (!el) return;
      el.className = 'al-g ' + st; el.querySelector('b').textContent = g.v.toFixed(d.d);
      const sp = Math.max(Math.abs(d.x) * 1.4, Math.abs(d.b) * .12), pl = el.querySelector('polyline');
      pl.setAttribute('points', g.h.map((v, j) => (j * 100 / 39).toFixed(1) + ',' + (12 - Math.max(-11, Math.min(11, (v - d.b) / sp * 11 * (d.w < 0 ? -1 : 1)))).toFixed(1)).join(' '));
      pl.style.stroke = st === 'bad' ? 'var(--jx-bd)' : st === 'warn' ? 'var(--jx-wn)' : 'var(--jx-ac)';
    });
    if (A.lim > 0) {
      A.lim -= .25; const bar = document.getElementById('alCd'); if (bar) bar.style.width = Math.max(0, A.lim / A.limMax * 100) + '%';
      if (A.lim <= 0) timeUp();
    }
  }
  function fx(list) {
    (list || []).forEach((v) => { if (v.d) J.timeout(() => apply(v), v.d * 1000); else apply(v); });
  }
  function apply(v) {
    if (!A) return;
    if (v.alarm) { A.alarms.unshift({ lv: v.alarm[0], t: J.hms(A.t0 + A.sim), x: v.alarm[1], new: true, k: A.alarms.length ? A.alarms[0].k + 1 : 0 }); drawAlarms(); }
    if (v.msg) { A.msgs.unshift(v.msg); drawMsgs(); }
    if (v.set) Object.keys(v.set).forEach((k) => { A.g[k].t = v.set[k]; });
    if (v.status) { A.status = v.status; drawStatus(); }
    if (v.lot) { A.lot = v.lot; drawLot(); }
  }
  function drawAlarms() {
    document.getElementById('alRows').innerHTML = A.alarms.map((a) => `<div class="al-r ${a.lv}${a.new ? ' new' : ''}${a.gone ? ' gone' : ''}${A.sel === a.k ? ' sel' : ''}" data-k="${a.k}"><i></i><time class="jx-mono">${esc(a.t)}</time><span>${e(a.x)}${a.gone ? '<small>' + e('해제됨 · 원인 기록 없음') + '</small>' : ''}</span></div>`).join('') || `<div class="al-m" style="color:var(--jx-mu)">${e('알람 없음')}</div>`;
  }
  function drawMsgs() {
    document.getElementById('alMsg').innerHTML = A.msgs.map((m) => `<div class="al-m"><b>${e(m[0])}</b>${e(m[1])}</div>`).join('') || `<div class="al-m" style="color:var(--jx-mu)">${e('메시지 없음')}</div>`;
  }
  function drawStatus() { const el = document.getElementById('alSt'); el.className = 'al-chip ' + A.status; el.textContent = A.status; }
  function drawLot() { document.getElementById('alLot').textContent = T(A.lot); }
  function rowClick(k) {
    const s = A.sc.steps[A.i]; if (!s || A.lock) return;
    const a = A.alarms.find((x) => x.k === k); if (!a) return; a.new = false;
    if (s.pick == null) { drawAlarms(); return; }
    A.sel = k; drawAlarms();
    // 가장 이른 알람 = 목록에서 가장 아래(k가 가장 작은 것)
    const first = A.alarms.reduce((m, x) => (x.k < m.k ? x : m), A.alarms[0]);
    if (A.alarms.length < 5) return toast('아직 알람이 다 올라오지 않았어요. 순서를 더 지켜봐도 좋아요.', 'info');
    if (a === first) done(true, 'pick'); else { A.wrong++; A.bad.push('pick'); toast(s.pickBad, 'bad'); }
  }
  // ---------- 단계 ----------
  function nextStep() {
    A.i++; A.form = null; A.sel = null; A.lock = false; A.wrong = 0; A.bad = [];
    const s = A.sc.steps[A.i]; if (!s) return finish();
    fx(s.ev); A.lim = s.lim || 0; A.limMax = s.lim || 0; drawAlarms(); side();
  }
  function side(msg) {
    const s = A.sc.steps[A.i]; if (!s) return;
    let h = `<p class="jx-note" style="margin:0">${e('상황')} ${A.si + 1} / ${SC.length} · ${e('단계')} ${A.i + 1} / ${A.sc.steps.length}</p><p class="al-q">${e(s.p)}</p>`;
    if (s.lim) h += `<div class="al-cd"><i id="alCd" style="width:100%"></i></div>`;
    if (A.form) {
      const f = s.form;
      h += `<div class="al-fm"><h5>${e(f.h)}</h5><div class="al-ch">${f.it.map((it, k) => `<button class="al-c${A.form.sel.has(k) ? ' on' : ''}${A.form.res ? (it[1] ? ' ok' : A.form.sel.has(k) ? ' ng' : '') : ''}" data-k="${k}" ${A.form.res ? 'disabled' : ''}><i>${A.form.sel.has(k) ? '✓' : ''}</i><span>${e(it[0])}</span></button>`).join('')}</div>`;
      if (!A.form.res) h += `<button class="jx-btn pri" id="alSend">${e('이대로 전하기')}</button>`;
      h += '</div>';
    } else if (s.pick != null) {
      h += `<p class="jx-note">${e('알람 목록에서 알람을 눌러 고르세요.')}</p>`;
    } else {
      h += `<div class="al-acts">${ACT.map((a) => `<button class="al-a${A.bad.includes(a[0]) ? ' bad' : ''}" data-a="${a[0]}" ${A.lock ? 'disabled' : ''}><span>${a[1]}</span>${e(a[2])}<small>${e(a[3])}</small></button>`).join('')}</div>`;
    }
    if (msg) h += `<div class="al-fb">${msg}</div>`;
    const el = document.getElementById('alSide'); el.innerHTML = h;
    el.querySelectorAll('.al-a').forEach((b) => b.addEventListener('click', () => act(b.dataset.a)));
    el.querySelectorAll('.al-c').forEach((b) => b.addEventListener('click', () => { const k = +b.dataset.k; if (A.form.sel.has(k)) A.form.sel.delete(k); else A.form.sel.add(k); side(); }));
    const send = document.getElementById('alSend'); if (send) send.onclick = sendForm;
  }
  function toast(txt, cls) {
    const st = stage(); if (!st) return; st.querySelectorAll('.jx-toast').forEach((x) => x.remove());
    const t = document.createElement('div'); t.className = 'jx-toast ' + (cls || 'info'); t.textContent = T(txt); st.appendChild(t);
    J.timeout(() => t.remove(), 4200);
  }
  function act(a) {
    const s = A.sc.steps[A.i]; if (!s || A.lock) return;
    A.recs.push([A.i, a]);
    if (s.ok.includes(a)) {
      if (s.form) { A.form = { sel: new Set(), res: false }; side(); return; }
      if (s.watch) { A.lock = true; fx(s.wev); toast('값과 알람을 지켜보는 중이에요…', 'info'); side(); return J.timeout(() => done(true, a), s.watch * 1000); }
      return done(true, a);
    }
    A.wrong++; if (!A.bad.includes(a)) A.bad.push(a);
    if (s.bx && s.bx[a]) fx(s.bx[a]);
    if (a === 'reset') { const top = A.alarms.find((x) => !x.gone); if (top) { top.gone = true; drawAlarms(); } }
    toast(s.bad[a] || GEN, 'bad'); side();
  }
  function sendForm() {
    const s = A.sc.steps[A.i], f = s.form; let wrong = 0, miss = 0;
    f.it.forEach((it, k) => { const on = A.form.sel.has(k); if (on && !it[1]) wrong++; if (!on && it[1]) miss++; });
    A.formErr = wrong * 2 + miss * 2; A.form.res = true;
    const okc = f.it.filter((x) => x[1]).length, got = okc - miss;
    const note = wrong || miss ? `${e('맞게 고른 것')} ${okc - miss} / ${okc}${wrong ? ' · ' + e('빼야 할 것을 골랐어요') : ''}` : e('빠짐없이 사실만 골랐어요.');
    done(true, 'form', `<b>${note}</b>`);
  }
  function timeUp() {
    const s = A.sc.steps[A.i]; if (!s || A.lock) return;
    A.lim = 0; A.lock = true; A.timeout = true; fx(s.to); toast('시간이 지났어요. 늦은 행동은 그만큼 위험을 늘려요.', 'bad');
    J.timeout(() => done(false, 'timeout'), 1400);
  }
  function done(ok, how, extra) {
    const s = A.sc.steps[A.i]; if (!s) return;
    A.lock = true; A.lim = 0;
    let p = ok ? Math.max(3, 10 - A.wrong * 3 - (A.formErr || 0)) : 0; A.formErr = 0;
    if (A.timeout) { p = 0; A.timeout = false; }
    A.pts += p; A.recs.push([A.i, '=' + p]);
    s.res = { p, ok, wrong: A.wrong, bad: A.bad.slice() };
    A.sum = A.sum || []; A.sum.push({ p: s.p, why: s.why, p10: p, wrong: A.wrong, bad: A.bad.slice() });
    fx(s.after); toast(ok ? '좋아요. ' + (A.wrong ? '틀린 시도가 있어서 점수가 조금 깎여요.' : '한 번에 맞혔어요.') : '이 단계는 점수를 받지 못했어요.', ok ? 'ok' : 'bad');
    const msg = (extra ? extra + '<br>' : '') + '<b>' + e('왜 이렇게 하나요?') + '</b><br>' + e(s.why);
    side(msg);
    const el = document.getElementById('alSide'); el.querySelectorAll('.al-a').forEach((b) => { b.disabled = true; });
    const last = A.i + 1 >= A.sc.steps.length, btn = document.createElement('button'); btn.className = 'jx-btn pri'; btn.style.marginTop = '.5rem'; btn.textContent = T(last ? '결과 보기' : '다음 단계');
    btn.onclick = () => nextStep(); el.appendChild(btn);
    if (window.innerWidth < 820) J.timeout(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 150);
  }
  function finish() {
    const total = A.sc.steps.length * 10, pct = Math.round(A.pts / total * 100), pr = J.load('alarm'), sc = Object.assign({}, pr.sc); sc[A.sc.id] = Math.max(sc[A.sc.id] || 0, pct);
    const best = Math.round(Object.values(sc).reduce((a, b) => a + b, 0) / SC.length); J.save('alarm', { sc, best, unit: '%' });
    J.clear(A.h);
    const next = SC[A.si + 1];
    root.innerHTML = J.head('현장 직무', A.sc.t + ' · ' + T('복기'), `<button class="jx-btn sm" id="alMenu">${e('상황 목록')}</button>`) +
      `<div class="jx-card"><div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">${J.score(pct)}<p class="jx-note" style="margin:0;flex:1;min-width:12rem">${e(pct >= 90 ? '순서가 몸에 익었어요.' : pct >= 70 ? '큰 흐름은 좋아요. 놓친 단계의 이유를 다시 읽어 보세요.' : '사람, 읽기, 상태, 호출, 기록의 순서부터 다시 익혀 봐요.')}</p></div>
      <div class="al-sum">${A.sum.map((r, k) => `<div class="al-sr ${r.p10 >= 10 ? '' : r.p10 > 0 ? 'l' : 'x'}"><b>${k + 1}</b><div><strong>${e(r.p)}</strong><em>${r.p10} / 10${r.bad.length ? ' · ' + e('눌러 본 잘못된 행동') + ': ' + r.bad.map((x) => (x === 'pick' ? e('알람 고르기') : e((ACT.find((q) => q[0] === x) || [0, 0, x])[2]))).join(', ') : ''}</em><div>${e(r.why)}</div></div></div>`).join('')}</div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="jx-btn" id="alAgain">${e('다시 하기')}</button>${next ? `<button class="jx-btn pri" id="alNext">${e('다음 상황')}</button>` : ''}</div></div>`;
    document.getElementById('alMenu').onclick = menu; document.getElementById('alAgain').onclick = () => brief(A.si);
    const nb = document.getElementById('alNext'); if (nb) nb.onclick = () => brief(A.si + 1);
  }
  menu();
});
/* ===== 설계 직무 체험 1: 파형 디버거 ===== */
JX.reg('wave', (root) => {
  const J = window.JX, e = J.e, T = J.T, esc = J.esc;
  J.css('jx-wave', `
.wv-bar{display:flex;align-items:center;gap:.5rem;padding:.45rem .7rem;background:var(--jx-p1);border-bottom:1px solid var(--jx-ln);font-size:.74rem;color:var(--jx-mu);flex-wrap:wrap}.wv-bar b{color:var(--jx-tx)}
.wv-bar .jx-btn{background:transparent;border-color:var(--jx-ln);color:var(--jx-tx)}
.wv-body{display:flex;align-items:flex-start}.wv-nm{flex:none;width:122px;background:var(--jx-p1);border-right:1px solid var(--jx-ln)}
.wv-n{display:flex;justify-content:space-between;align-items:center;gap:.3rem;height:30px;padding:0 .5rem;font-size:.72rem;border-bottom:1px solid var(--jx-ln);cursor:pointer;white-space:nowrap}
.wv-n:hover{background:var(--jx-hov)}.wv-n.on{background:var(--jx-sel)}.wv-n.gh{color:var(--jx-wnfg);font-style:italic}.wv-n em{font-style:normal;color:var(--jx-num);font-size:.68rem;max-width:56px;overflow:hidden;text-overflow:ellipsis}
.wv-ax{height:24px;border-bottom:1px solid var(--jx-ln);font-size:.64rem;color:var(--jx-mu);padding:.4rem .5rem 0}
.wv-sc{flex:1;min-width:0;overflow-x:auto;touch-action:pan-x pan-y}.wv-sc svg{display:block;cursor:crosshair}
.wv-rd{display:flex;gap:.9rem;flex-wrap:wrap;padding:.45rem .7rem;font-size:.74rem;border-top:1px solid var(--jx-ln);background:var(--jx-p1);color:var(--jx-mu)}.wv-rd b{color:var(--jx-tx)}
.wv-cd{margin-top:.8rem;border-radius:.9rem;background:var(--jx-bg);border:1px solid var(--jx-ln);overflow:hidden}.wv-cd h4{margin:0;padding:.35rem .7rem;font-size:.68rem;font-weight:800;color:var(--jx-mu);background:var(--jx-p2);letter-spacing:.05em}
.wv-ln{display:flex;font-size:.76rem;line-height:1.65;color:var(--jx-sub);white-space:pre;overflow-x:auto}.wv-ln i{flex:none;width:2.1rem;text-align:right;padding-right:.6rem;color:var(--jx-mu);font-style:normal;user-select:none}.wv-ln.hl{background:var(--jx-sel)}.wv-ln.bg{background:var(--jx-bdbg)}.wv-ln.fx{background:var(--jx-okbg)}
.wv-q{font-size:.95rem;font-weight:800;line-height:1.55;margin:.2rem 0 .6rem}.wv-st{display:flex;gap:.3rem;margin-bottom:.5rem}.wv-st i{flex:1;height:.28rem;border-radius:.2rem;background:var(--pt-soft)}.wv-st i.on{background:var(--pt-acc)}.wv-st i.ok{background:#10b981}
.wv-o{display:block;width:100%;text-align:left;padding:.6rem .75rem;margin:.3rem 0;border-radius:.75rem;border:1px solid var(--pt-line);background:var(--pt-card);font:inherit;font-size:.82rem;line-height:1.5;color:inherit;cursor:pointer}.wv-o:hover{border-color:var(--pt-acc)}
.wv-o.ok{border-color:#10b981;background:#ecfdf5}.wv-o.ng{border-color:#f87171;background:#fef2f2}html.dark .wv-o.ok{background:#052e22}html.dark .wv-o.ng{background:#3b1217}
.wv-fb{margin:.5rem 0;padding:.65rem .8rem;border-radius:.75rem;background:var(--pt-soft);font-size:.8rem;line-height:1.65}
.wv-hint{font-size:.78rem;color:var(--pt-sub);margin:.4rem 0;padding:.5rem .7rem;border-left:3px solid #f59e0b;background:var(--pt-soft);border-radius:.3rem}
`);
  const T32 = 32;
  const P = (s) => s.split(',').map((x) => { const [v, d] = x.split(':'); return [v, +d]; });
  const expand = (arr) => { const o = []; arr.forEach(([v, d]) => { for (let i = 0; i < d; i++) o.push(v); }); return o.slice(0, T32); };
  const sig = (n, k, s, o) => Object.assign({ n, k, v: k === 'clk' ? null : expand(P(s)) }, o || {});
  const clkA = { n: 'clk', k: 'clk', v: Array.from({ length: T32 }, (_, t) => (t % 2 === 0 ? '1' : '0')) };
  const cntA = Array.from({ length: 16 }, (_, c) => [c.toString(16), 2]);
  // CDC: clk_b 상승 에지(t=1,4,7,...)에서 cnt_a 를 잡는다. t=16 은 값이 바뀌는 순간이라 중간값 f 가 잡힌다.
  const cdcB = (glitch) => { const o = []; let cur = '0'; for (let t = 0; t < T32; t++) { if ((t - 1) % 3 === 0 && t >= 1) { const c = Math.floor(t / 2); cur = (t === 16 ? (glitch ? 'f' : '8') : c.toString(16)); } o.push(cur); } return o; };
  const CASES = [
    { id: 'hs', t: '핸드셰이크에서 데이터 유실', k: 'valid / ready', brief: '생산자가 보낸 값이 소비자에게 다른 값으로 도착했어요. 테스트벤치가 사이클 6에서 불일치를 알렸어요.', fail: 6, bug: 4, hint1: '결과(data_q)가 틀린 곳에서 거슬러 올라가며 data가 언제 바뀌는지 보세요. valid와 ready를 같이 읽어요.',
      sg: [clkA, sig('valid', 'bit', '0:4,1:12,0:4,1:6,0:6'), sig('ready', 'bit', '0:10,1:2,0:8,1:4,0:8'), sig('data', 'bus', '00:4,a1:4,b2:8,00:4,c3:6,00:6'), sig('data_q', 'bus', '00:12,b2:12,c3:8', { gh: sig('data_q', 'bus', '00:12,a1:12,c3:8').v })],
      why1: '사이클 4에서 valid가 1이고 ready가 0인데 data가 a1에서 b2로 바뀌었어요. 받아 가기 전에 값이 바뀐 거예요.',
      code: ['always_ff @(posedge clk) begin', '  if (!rst_n) valid <= 0;', '  else if (have_new) begin', '    valid <= 1;', '    data  <= next_data;', '  end', '  if (valid && ready) valid <= 0;', 'end'], link: { valid: [2, 4, 7], data: [5], ready: [7], data_q: [5] }, bugL: [3, 4, 5], fixL: ["  else if (have_new && (!valid || ready)) begin"], fixAt: 3,
      cause: { a: 0, o: ['valid가 1이고 ready가 0인 동안 data가 바뀌었다', 'ready가 너무 늦게 올라왔다', '소비자가 클록의 잘못된 에지에서 값을 잡았다', 'valid가 너무 일찍 올라갔다'], why: 'ready는 얼마든지 늦어도 되고 valid도 먼저 올라가도 돼요. 규칙은 하나예요. valid가 1이면 ready가 1이 되어 받아 갈 때까지 data를 유지해야 해요.' },
      fix: { a: 2, o: ['ready를 항상 1로 묶는다', 'data를 한 사이클 늦춰서 내보낸다', '받아 갈 때까지(valid && ready) 새 값을 싣지 않고 data를 유지한다', 'valid를 한 사이클만 내보낸다'], why: '새 데이터는 비어 있거나(!valid) 방금 받아 갔을 때(ready)만 실어요. ready를 묶거나 한 사이클만 보내는 것은 프로토콜 자체를 깨요.' } },
    { id: 'rst', t: '시작했는데 아무 일도 안 일어남', k: '리셋과 시작 신호', brief: 'start를 줬는데 busy가 한 번도 올라오지 않아요. 테스트벤치가 사이클 15에서 시간 초과를 알렸어요.', fail: 15, bug: 4, hint1: 'busy는 한 번도 올라오지 않았어요. start가 들어온 순간 rst_n은 어땠는지 보세요.',
      sg: [clkA, sig('rst_n', 'bit', '0:10,1:22'), sig('start', 'bit', '0:8,1:2,0:22'), sig('state', 'bus', 'IDLE:32'), sig('busy', 'bit', '0:32', { gh: sig('busy', 'bit', '0:12,1:12,0:8').v })],
      why1: 'start가 사이클 4에 들어왔는데 그때 rst_n은 아직 0이에요. 리셋 중에 온 start는 FSM이 무시해요.',
      code: ['always_ff @(posedge clk or negedge rst_n)', '  if (!rst_n) state <= IDLE;', '  else case (state)', '    IDLE: if (start) state <= RUN;', '    RUN:  if (finish) state <= IDLE;', '  endcase', 'assign busy = (state == RUN);'], link: { rst_n: [1], start: [4], state: [1, 4, 5], busy: [7] }, bugL: [2, 4], fixL: ['    IDLE: if (start || start_q) state <= RUN;   // start_q: 리셋 중에 온 start를 붙잡아 둔 것'], fixAt: 4,
      cause: { a: 1, o: ['start 펄스의 폭이 너무 짧다', 'start가 리셋이 풀리기 전에 들어와서 FSM이 무시했다', 'busy를 만드는 조합 논리가 잘못되었다', '클록이 들어오지 않고 있다'], why: '클록은 계속 들어오고 busy 논리도 문제없어요. start가 리셋 중(rst_n=0)에 지나가 버려서 FSM이 보지 못한 거예요.' },
      fix: { a: 3, o: ['리셋을 더 길게 건다', 'start 폭을 두 사이클로 늘려 본다', 'busy를 항상 1로 만든다', '리셋이 풀린 뒤에 start를 내보내거나, 리셋 중에 온 start를 붙잡아 두었다가 처리한다'], why: '폭을 늘리면 우연히 걸릴 수 있지만 타이밍이 조금만 바뀌어도 다시 깨져요. 순서를 지키거나 붙잡아 두는 것이 근본 해결이에요.' } },
    { id: 'cdc', t: '다른 클록으로 넘긴 값이 깨짐', k: '클록 도메인 넘기기', brief: 'A 클록 쪽 카운터를 B 클록 쪽에서 읽는데 한 번 값이 튀었어요. 테스트벤치가 사이클 9에서 불일치를 알렸어요.', fail: 9, bug: 8, hint1: '마커로 cnt_a가 바뀌는 순간과 clk_b가 올라가는 순간을 맞춰 보세요. 7에서 8로 바뀔 때 몇 비트가 바뀌나요?',
      sg: [clkA, { n: 'clk_b', k: 'clk', v: Array.from({ length: T32 }, (_, t) => ((t - 1 + 3) % 3 < 2 ? '1' : '0')) }, { n: 'cnt_a', k: 'bus', v: expand(cntA) }, { n: 'data_b', k: 'bus', v: cdcB(true), gh: cdcB(false) }],
      why1: '사이클 8에서 cnt_a가 7(0111)에서 8(1000)로 바뀌는 순간 clk_b가 값을 잡았어요. 네 비트가 모두 바뀌는 순간이라 f(1111)가 잡혔어요.',
      code: ['// A 클록 도메인', 'always_ff @(posedge clk_a) cnt_a <= cnt_a + 1;', '', '// B 클록 도메인', 'always_ff @(posedge clk_b) data_b <= cnt_a;'], link: { cnt_a: [2, 5], data_b: [5], clk_b: [5] }, bugL: [5], fixL: ['always_ff @(posedge clk_a) cnt_g <= bin2gray(cnt_a + 1);', 'always_ff @(posedge clk_b) data_b <= gray_sync2;   // 2단 동기기를 거친 그레이 코드'], fixAt: 5,
      cause: { a: 2, o: ['clk_b가 너무 느려서 값을 놓쳤다', 'cnt_a 카운터가 잘못 증가했다', '값이 여러 비트 한꺼번에 바뀌는 순간 다른 클록으로 그대로 받아서 중간값이 잡혔다', '플립플롭의 셋업 시간이 모자란 한 비트의 문제다'], why: '비트마다 도착 시간이 조금씩 달라서, 바뀌는 순간에 잡으면 일부는 옛 값 일부는 새 값이 섞여요. 한 비트짜리 신호의 준안정과는 다른 문제예요.' },
      fix: { a: 1, o: ['비트마다 2단 플립플롭 동기기를 붙인다', '한 번에 한 비트만 바뀌는 그레이 코드로 넘기거나 핸드셰이크·비동기 FIFO를 쓴다', 'clk_b를 더 빠르게 한다', '카운터를 더 느리게 증가시킨다'], why: '비트마다 따로 동기화하면 비트들이 서로 다른 사이클에 도착해 문제가 그대로예요. 한 번에 한 비트만 바뀌게 하거나 값을 묶어서 넘겨야 해요.' } },
    { id: 'fsm', t: '상태 기계가 멈춰서 안 나옴', k: '펄스를 놓친 FSM', brief: 'req를 보냈는데 state가 WAIT에서 영원히 머물러요. 테스트벤치가 사이클 14에서 시간 초과를 알렸어요.', fail: 14, bug: 2, hint1: 'req, ack, state가 바뀌는 순서를 읽어 보세요. ack가 먼저 지나가 버리지는 않았나요?',
      sg: [clkA, sig('req', 'bit', '0:4,1:2,0:26'), sig('ack', 'bit', '0:4,1:2,0:26'), sig('state', 'bus', 'IDLE:6,WAIT:26', { gh: sig('state', 'bus', 'IDLE:6,WAIT:2,DONE:2,IDLE:22').v }), sig('done', 'bit', '0:32', { gh: sig('done', 'bit', '0:8,1:2,0:22').v })],
      why1: 'ack가 사이클 2에 지나갔는데 FSM은 사이클 3에야 WAIT로 들어가요. WAIT에서 ack를 기다리지만 그 펄스는 이미 지나갔어요.',
      code: ['case (state)', '  IDLE: if (req) state <= WAIT;', '  WAIT: if (ack) state <= DONE;', '  DONE: state <= IDLE;', 'endcase'], link: { req: [2], ack: [3], state: [2, 3, 4], done: [4] }, bugL: [3], fixL: ['  WAIT: if (ack || ack_seen) state <= DONE;   // ack_seen: ack 를 붙잡아 둔 비트'], fixAt: 3,
      cause: { a: 3, o: ['state 레지스터가 리셋되지 않았다', 'req 펄스가 너무 길다', '클록이 멈췄다', 'ack가 한 사이클짜리 펄스인데 FSM이 WAIT에 들어가기 전에 지나가 버렸다'], why: '클록도 리셋도 정상이에요. 빠른 슬레이브가 req와 같은 사이클에 ack를 냈고, FSM은 그 다음 사이클에야 ack를 보기 시작했어요.' },
      fix: { a: 0, o: ['ack를 붙잡아 두는 비트(스티키)를 두거나 ack를 레벨 신호로 유지하는 핸드셰이크로 바꾼다', 'WAIT에서 일정 시간이 지나면 강제로 DONE으로 간다', 'req를 더 길게 낸다', 'ack를 두 사이클로 늘리도록 슬레이브에게 요구한다'], why: '시간 초과로 넘기면 증상만 가려요. 펄스는 놓칠 수 있다고 보고 붙잡아 두거나, 받았다는 것을 레벨로 주고받아야 해요.' } },
    { id: 'fifo', t: '가득 찬 FIFO에 한 번 더 씀', k: 'full 플래그', brief: '쓴 순서대로 읽는데 맨 처음 값이 바뀌어 나와요. 테스트벤치가 사이클 12에서 불일치를 알렸어요. (깊이 4)', fail: 12, bug: 5, hint1: 'count가 4가 되는 순간 full은 어떤가요? 그 순간 wr_en은 어떻게 돼 있나요?',
      sg: [clkA, sig('wr_en', 'bit', '0:2,1:10,0:20'), sig('wdata', 'bus', '00:2,11:2,12:2,13:2,14:2,15:2,00:20'), sig('count', 'bus', '0:4,1:2,2:2,3:2,4:2,5:12,4:2,3:2,2:4'), sig('full', 'bit', '0:12,1:20', { gh: sig('full', 'bit', '0:10,1:14,0:8').v }), sig('rd_en', 'bit', '0:22,1:6,0:4'), sig('rdata', 'bus', '00:24,15:2,12:2,13:2,00:2', { gh: sig('rdata', 'bus', '00:24,11:2,12:2,13:2,00:2').v })],
      why1: '사이클 5에서 count가 4로 가득 찼는데 full은 아직 0이라 wr_en이 그대로 1이에요. 다섯 번째 값이 들어가 맨 처음 칸을 덮어썼어요.',
      code: ['always_ff @(posedge clk) full <= (count == DEPTH);', 'assign wr_ok = wr_req && !full;', 'always_ff @(posedge clk)', '  if (wr_ok) begin', '    mem[wr_ptr] <= wdata; wr_ptr <= wr_ptr + 1; count <= count + 1;', '  end'], link: { full: [1, 2], wr_en: [2, 4], count: [1, 5], wdata: [5], rdata: [5] }, bugL: [1], fixL: ['assign full = (count == DEPTH);   // 레지스터를 거치지 않고 바로 만든다'], fixAt: 1,
      cause: { a: 1, o: ['읽기 포인터가 너무 빨리 움직였다', 'full이 count가 4가 된 뒤 한 사이클 늦게 올라와서, 가득 찬 뒤 한 번 더 써졌다', 'wdata가 잘못 들어왔다', 'count의 증가가 한 사이클 느리다'], why: 'full을 레지스터로 만들면 count가 4가 된 그 사이클에는 아직 0이에요. 그 사이클의 쓰기 요청이 통과해서 가득 찬 칸을 덮어써요.' },
      fix: { a: 3, o: ['읽기를 더 빨리 시작한다', 'FIFO 깊이를 5로 늘린다', 'wr_en을 한 사이클 늦춰서 보낸다', 'full을 count에서 바로(조합으로) 만들거나 count가 DEPTH-1일 때 미리 올린다'], why: '깊이를 늘리면 같은 문제가 한 칸 뒤로 밀릴 뿐이에요. full은 쓰기를 막는 판단에 쓰이므로 한 사이클도 늦으면 안 돼요.' } },
    { id: 'ob1', t: '펄스 폭이 한 사이클 길다', k: '카운터 비교', brief: '스펙은 4사이클 폭의 펄스인데 더 길어 보여요. 테스트벤치가 사이클 8에서 폭 불일치를 알렸어요.', fail: 8, bug: 7, hint1: '마커 A, B로 pulse_o가 높은 폭을 재 보세요. 스펙은 4사이클이에요.',
      sg: [clkA, sig('start', 'bit', '0:4,1:2,0:26'), sig('cnt', 'bus', '0:6,0:2,1:2,2:2,3:2,4:2,0:16'), sig('pulse_o', 'bit', '0:6,1:10,0:16', { gh: sig('pulse_o', 'bit', '0:6,1:8,0:18').v })],
      why1: 'pulse_o는 사이클 3부터 7까지 5사이클 높았어요. 스펙대로면 사이클 6에서 끝나고 사이클 7에는 낮아야 해요.',
      code: ['if (start) begin cnt <= 0; pulse_o <= 1; end', 'else if (pulse_o) begin', '  cnt <= cnt + 1;', '  if (cnt == 4) pulse_o <= 0;', 'end'], link: { start: [1], cnt: [1, 3, 4], pulse_o: [1, 4] }, bugL: [4], fixL: ['  if (cnt == 3) pulse_o <= 0;   // 0부터 세므로 마지막 값은 N-1'], fixAt: 4,
      cause: { a: 0, o: ['cnt를 0부터 세는데 종료 조건을 4로 두어 한 사이클 더 높게 유지됐다', 'start가 한 사이클 늦게 들어왔다', 'cnt가 한 번 더 증가했다', 'pulse_o를 레지스터로 한 번 더 받아서 늦어졌다'], why: '0부터 세면 N사이클을 채운 마지막 값은 N-1이에요. 비교값이 N이면 그 값이 나올 때까지 한 번 더 높게 유지돼요.' },
      fix: { a: 1, o: ['cnt의 비트 폭을 한 비트 늘린다', '종료 조건을 cnt == 3 (N-1)으로 바꾼다', 'start를 한 사이클 짧게 준다', 'pulse_o를 한 번 더 레지스터에 받는다'], why: '비트 폭이나 출력 레지스터는 폭에 영향이 없어요. 종료 조건의 기준만 맞으면 돼요.' } },
  ];
  const ST = [{ n: '처음 어긋난 곳' }, { n: '원인' }, { n: '고치는 법' }];
  let W = null;
  const hexv = (s) => (s === 'x' ? 'X' : s.toUpperCase());
  function menu() {
    W = null; J.timers.forEach((h) => { clearTimeout(h); clearInterval(h); }); J.timers = [];
    const sc = J.load('wave').sc || {};
    let h = J.head('설계 직무', '파형 디버거') + J.sub('원인이 시작된 사이클을 찾아요', CASES.filter((c) => sc[c.id] != null).length, CASES.length) + J.tiles(CASES.map((c, i) => ({ i, n: i + 1, t: '사례 ' + (i + 1), tag: e(c.k), sc: sc[c.id] })));
    root.innerHTML = h;
    root.querySelectorAll('.jx-tile').forEach((b) => b.addEventListener('click', () => play(+b.dataset.i)));
  }
  function play(i) {
    const c = CASES[i];
    W = { i, c, st: 0, A: null, B: null, cur: null, pts: 0, hints: 0, hintOn: false, done: [], rev: false, sel: null, fb: null, link: null };
    root.innerHTML = J.head('설계 직무', c.t, `<button class="jx-btn sm" id="wvMenu">${e('사례 목록')}</button>`) + `<div class="jx-two"><div><div class="jx-stage" id="wvStage"></div><div class="wv-cd" id="wvCode"></div></div><div class="jx-card" id="wvSide"></div></div>`;
    document.getElementById('wvMenu').onclick = menu; viewer(); code(); side();
  }
  function rowsH() { return W.c.sg.length + (W.rev ? W.c.sg.filter((s) => s.gh).length : 0); }
  function valAt(s, t, ghost) { if (s.k === 'clk') return s.v[t]; return (ghost ? s.gh : s.v)[t]; }
  function viewer() {
    const c = W.c, host = document.getElementById('wvStage'), avail = Math.max(300, host.clientWidth || root.clientWidth || 600) - 122, tw = Math.max(14, Math.min(30, Math.floor(avail / T32)));
    W.tw = tw; const RH = 30, rows = [];
    c.sg.forEach((s) => { rows.push({ s, g: false }); if (W.rev && s.gh) rows.push({ s, g: true }); });
    const Wd = tw * T32, H = rows.length * RH;
    let svg = `<svg width="${Wd}" height="${H}" viewBox="0 0 ${Wd} ${H}" id="wvSvg">`;
    // 사이클 배경 줄
    for (let k = 0; k < 16; k++) svg += `<rect x="${k * 2 * tw}" y="0" width="${2 * tw}" height="${H}" fill="${k % 2 ? 'var(--jx-hov)' : 'transparent'}"/>`;
    if (W.rev) svg += `<rect x="${c.bug * 2 * tw}" y="0" width="${2 * tw}" height="${H}" fill="var(--jx-bd)" fill-opacity=".2"/>`;
    ['A', 'B'].forEach((m) => { if (W[m] != null) svg += `<rect x="${W[m] * 2 * tw}" y="0" width="${2 * tw}" height="${H}" fill="${m === 'A' ? 'var(--jx-wn)' : 'var(--jx-pu)'}" fill-opacity=".22"/>`; });
    rows.forEach((r, ri) => {
      const y0 = ri * RH, s = r.s, v = r.g ? s.gh : s.v, col = r.g ? 'var(--jx-wn)' : s.k === 'clk' ? 'var(--jx-mu)' : s.k === 'bit' ? 'var(--jx-ok)' : 'var(--jx-ac)';
      svg += `<path d="M0 ${y0 + RH}H${Wd}" stroke="var(--jx-ln)"/>`;
      if (s.k === 'clk' || s.k === 'bit') {
        let d = '', prev = null;
        for (let t = 0; t < T32; t++) { const hi = v[t] === '1' ? y0 + 7 : y0 + 23; if (prev === null) d += `M${t * tw} ${hi}`; else if (prev !== hi) d += `L${t * tw} ${prev}L${t * tw} ${hi}`; prev = hi; d += `L${(t + 1) * tw} ${hi}`; }
        svg += `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.7" ${r.g ? 'stroke-dasharray="4 3"' : ''}/>`;
      } else {
        let t = 0;
        while (t < T32) {
          let u = t; while (u + 1 < T32 && v[u + 1] === v[t]) u++;
          const x1 = t * tw, x2 = (u + 1) * tw, bad = v[t] === 'x', s2 = 3;
          svg += `<path d="M${x1 + s2} ${y0 + 6}H${x2 - s2}L${x2} ${y0 + 15}L${x2 - s2} ${y0 + 24}H${x1 + s2}L${x1} ${y0 + 15}Z" fill="${bad ? 'var(--jx-bd)' : col}" fill-opacity="${bad ? .4 : .13}" stroke="${bad ? 'var(--jx-bd)' : col}" stroke-width="1.4" ${r.g ? 'stroke-dasharray="4 3"' : ''}/>`;
          if ((x2 - x1) >= 18) svg += `<text x="${(x1 + x2) / 2}" y="${y0 + 19}" font-size="10.5" text-anchor="middle" fill="${bad ? 'var(--jx-bdfg)' : 'var(--jx-tx)'}" font-family="ui-monospace,monospace">${esc(hexv(v[t]))}</text>`;
          t = u + 1;
        }
      }
    });
    // 실패 깃발
    svg += `<path d="M${c.fail * 2 * tw + tw} 0V${H}" stroke="var(--jx-bd)" stroke-width="1.5" stroke-dasharray="3 3"/>`;
    if (W.cur != null) svg += `<path d="M${W.cur * tw + tw / 2} 0V${H}" stroke="var(--jx-tx)" stroke-opacity=".55"/>`;
    svg += '</svg>';
    let nm = `<div class="wv-ax">${e('사이클')}</div>`;
    rows.forEach((r) => { nm += `<div class="wv-n${r.g ? ' gh' : ''}${W.link && W.link === r.s.n && !r.g ? ' on' : ''}" data-n="${esc(r.s.n)}"><span class="jx-mono">${esc(r.s.n)}${r.g ? ' ' + e('(기대)') : ''}</span><em class="jx-mono" data-v="${esc(r.s.n)}${r.g ? '~' : ''}"></em></div>`; });
    let ax = '<svg width="' + Wd + '" height="24" style="display:block;border-bottom:1px solid var(--jx-ln)">';
    for (let k = 0; k < 16; k++) ax += `<text x="${k * 2 * tw + tw}" y="16" font-size="10" fill="${k === c.fail ? 'var(--jx-bd)' : 'var(--jx-mu)'}" text-anchor="middle" font-weight="${k === c.fail ? 800 : 500}">${k}</text>`;
    ax += `<text x="${c.fail * 2 * tw + tw}" y="9" font-size="8" fill="var(--jx-bd)" text-anchor="middle" font-weight="800">${e('실패')}</text></svg>`;
    host.innerHTML = `<div class="wv-bar"><b>${e('파형')}</b><span>${e('눌러서 마커 A, 다시 눌러서 마커 B. 신호 이름을 누르면 코드에서 그 신호를 찾아 줘요.')}</span><span style="flex:1"></span><button class="jx-btn sm" id="wvClr">${e('마커 지우기')}</button></div>
      <div class="wv-body"><div class="wv-nm">${nm}</div><div class="wv-sc">${ax}${svg}</div></div><div class="wv-rd" id="wvRd"></div>`;
    document.getElementById('wvClr').onclick = () => { W.A = W.B = null; viewer(); };
    host.querySelector('.wv-nm').addEventListener('click', (ev) => { const n = ev.target.closest('.wv-n'); if (!n || n.classList.contains('gh')) return; W.link = W.link === n.dataset.n ? null : n.dataset.n; viewer(); code(); });
    const sv = document.getElementById('wvSvg');
    const tk = (ev) => { const r = sv.getBoundingClientRect(); return Math.max(0, Math.min(T32 - 1, Math.floor((ev.clientX - r.left) / W.tw))); };
    sv.addEventListener('pointermove', (ev) => { W.cur = tk(ev); cursor(); });
    sv.addEventListener('click', (ev) => {
      const cy = Math.floor(tk(ev) / 2);
      if (W.A == null || (W.A != null && W.B != null)) { W.A = cy; W.B = null; } else W.B = cy;
      W.cur = tk(ev); viewer(); cursor(); side();
    });
    host.querySelector('.wv-sc').addEventListener('scroll', () => {});
    cursor();
  }
  function cursor() {
    if (!W) return; const c = W.c, t = W.cur;
    document.querySelectorAll('#wvStage [data-v]').forEach((el) => { const g = el.dataset.v.endsWith('~'), nm = el.dataset.v.replace('~', ''), s = c.sg.find((x) => x.n === nm); el.textContent = t == null ? '' : hexv(String(valAt(s, t, g))); });
    const old = document.querySelector('#wvSvg .wv-cur'); if (old) old.remove();
    const sv = document.getElementById('wvSvg'); if (sv && t != null) { const l = document.createElementNS('http://www.w3.org/2000/svg', 'path'); l.setAttribute('class', 'wv-cur'); l.setAttribute('d', `M${t * W.tw + W.tw / 2} 0V${sv.getAttribute('height')}`); l.setAttribute('stroke', 'var(--jx-tx)'); l.setAttribute('stroke-opacity', '.55'); sv.appendChild(l); }
    const rd = document.getElementById('wvRd'); if (!rd) return;
    let h = `<span>${e('커서')}: <b class="jx-mono">${t == null ? '-' : Math.floor(t / 2)}</b> ${e('사이클')}</span>`;
    h += `<span>A: <b class="jx-mono">${W.A == null ? '-' : W.A}</b></span><span>B: <b class="jx-mono">${W.B == null ? '-' : W.B}</b></span>`;
    if (W.A != null && W.B != null) h += `<span>${e('차이')}: <b class="jx-mono">${Math.abs(W.B - W.A)}</b> ${e('사이클')}${Math.abs(W.B - W.A) ? ` · ${e('폭')} <b class="jx-mono">${Math.abs(W.B - W.A) + 1}</b> ${e('사이클')}` : ''}</span>`;
    rd.innerHTML = h;
  }
  function code() {
    const c = W.c, el = document.getElementById('wvCode'); const lk = W.link && c.link[W.link] || [];
    el.innerHTML = `<h4>RTL</h4>` + c.code.map((l, k) => { const n = k + 1, bg = W.st >= 2 && c.bugL.includes(n), fx = W.st >= 3 && n === c.fixAt; return `<div class="wv-ln${lk.includes(n) ? ' hl' : ''}${bg ? ' bg' : ''}"><i>${n}</i><span>${esc(l)}</span></div>`; }).join('') +
      (W.st >= 3 ? `<h4>${e('고친 모습')}</h4>` + c.fixL.map((l) => `<div class="wv-ln fx"><i>+</i><span>${esc(l)}</span></div>`).join('') : '');
  }
  function side() {
    const c = W.c; let h = `<div class="wv-st">${ST.map((s, k) => `<i class="${k < W.st ? 'ok' : k === W.st ? 'on' : ''}"></i>`).join('')}</div><p class="jx-note" style="margin:0">${e('사례')} ${W.i + 1} / ${CASES.length} · ${e(c.k)}</p>`;
    if (W.st === 0) {
      h += `<p class="jx-note">${e(c.brief)}</p><p class="wv-q">${e('원인이 시작된 사이클은 어디일까요?')}</p><p class="jx-note">${e('파형에서 사이클을 눌러 마커 A로 표시한 뒤 제출해요. 빨간 점선은 테스트벤치가 실패를 알린 곳이에요.')}</p>`;
      if (W.hintOn) h += `<div class="wv-hint">💡 ${e(c.hint1)}</div>`;
      h += `<div style="display:flex;gap:.4rem;flex-wrap:wrap"><button class="jx-btn pri" id="wvGo" ${W.A == null ? 'disabled' : ''}>${W.A == null ? e('먼저 사이클을 눌러 주세요') : e('사이클') + ' ' + W.A + ' ' + e('제출')}</button>${W.hintOn ? '' : `<button class="jx-btn" id="wvHint">${e('힌트 (-1점)')}</button>`}</div>`;
      if (W.fb) h += `<div class="wv-fb">${W.fb}</div>`;
    } else if (W.st === 1 || W.st === 2) {
      const q = W.st === 1 ? c.cause : c.fix;
      h += `<div class="wv-fb">${W.fb0 || ''}</div><p class="wv-q">${e(W.st === 1 ? '왜 이런 일이 생겼을까요?' : '어떻게 고칠까요?')}</p>`;
      h += q.o.map((o, k) => `<button class="wv-o${W.sel != null ? (k === q.a ? ' ok' : k === W.sel ? ' ng' : '') : ''}" data-k="${k}" ${W.sel != null ? 'disabled' : ''}>${e(o)}</button>`).join('');
      if (W.sel != null) { h += `<div class="wv-fb"><b>${W.sel === q.a ? e('맞아요') : e('아쉬워요')}</b><br>${e(q.why)}</div><button class="jx-btn pri" id="wvNext">${e(W.st === 1 ? '고치는 법 고르기' : '결과 보기')}</button>`; }
    } else {
      const pct = Math.round(W.pts / 10 * 100), pr = J.load('wave'), sc = Object.assign({}, pr.sc); sc[c.id] = Math.max(sc[c.id] || 0, pct);
      const best = Math.round(Object.values(sc).reduce((a, b) => a + b, 0) / CASES.length); J.save('wave', { sc, best, unit: '%' });
      h += `<div style="display:flex;align-items:center;gap:1rem;margin:.5rem 0">${J.score(pct)}<span class="jx-note">${W.pts} / 10${W.hints ? ' · ' + e('힌트') + ' ' + W.hints : ''}</span></div><div class="wv-fb"><b>${e('정리')}</b><br>${e(c.why1)}<br>${e(c.cause.why)}</div>`;
      h += `<div style="display:flex;gap:.4rem;flex-wrap:wrap"><button class="jx-btn" id="wvAgain">${e('다시 하기')}</button>${CASES[W.i + 1] ? `<button class="jx-btn pri" id="wvNx">${e('다음 사례')}</button>` : ''}</div>`;
    }
    const el = document.getElementById('wvSide'); el.innerHTML = h;
    const q = (id) => document.getElementById(id);
    if (q('wvGo')) q('wvGo').onclick = submit1; if (q('wvHint')) q('wvHint').onclick = () => { W.hintOn = true; W.hints++; side(); };
    el.querySelectorAll('.wv-o').forEach((b) => b.addEventListener('click', () => { const k = +b.dataset.k, qq = W.st === 1 ? c.cause : c.fix; W.sel = k; if (k === qq.a) W.pts += W.st === 1 ? 4 : 2; side(); }));
    if (q('wvNext')) q('wvNext').onclick = () => { W.st++; W.sel = null; W.fb0 = ''; if (W.st === 2) W.fb0 = ''; code(); side(); };
    if (q('wvAgain')) q('wvAgain').onclick = () => play(W.i); if (q('wvNx')) q('wvNx').onclick = () => play(W.i + 1);
  }
  function submit1() {
    const c = W.c, d = Math.abs(W.A - c.bug); let p = d === 0 ? 4 : d === 1 ? 2 : 0; p = Math.max(0, p - (W.hintOn ? 1 : 0)); W.pts += p;
    W.rev = true; W.st = 1; W.sel = null;
    W.fb0 = (d === 0 ? '<b>' + e('정확해요.') + '</b> ' : d === 1 ? '<b>' + e('거의 맞아요.') + '</b> ' + e('원인이 시작된 곳은 사이클') + ' ' + c.bug + e('이에요.') + ' ' : '<b>' + e('아쉬워요.') + '</b> ' + e('원인이 시작된 곳은 사이클') + ' ' + c.bug + e('이에요.') + ' ') + e(c.why1);
    viewer(); code(); side();
  }
  menu();
});
