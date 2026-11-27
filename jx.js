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
  // 결과 화면의 공통 모양
  J.score = (pct, label) => `<div class="jx-grade g${J.grade(pct)}"><b>${J.grade(pct)}</b><span>${pct}${label || '%'}</span></div>`;
  J.css('jx-core', `
.jx-root{--jx-bg:#0b1220;--jx-p1:#101a30;--jx-p2:#16223d;--jx-ln:rgba(255,255,255,.1);--jx-tx:#e2e8f0;--jx-mu:#94a3b8;--jx-ok:#34d399;--jx-wn:#fbbf24;--jx-bd:#f87171;--jx-ac:#60a5fa;--jx-pu:#a78bfa;color:var(--pt-ink,#0f172a);word-break:keep-all}
.jx-load{padding:3rem 1rem;text-align:center;color:var(--pt-mute,#64748b);font-weight:600}
.jx-hd{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin-bottom:.8rem}.jx-ttl{font-size:1.25rem;font-weight:800;color:var(--pt-ink,#0f172a);margin:0}.jx-sp{flex:1}
.jx-tag{font-size:.68rem;font-weight:800;letter-spacing:.06em;padding:.2rem .55rem;border-radius:999px;background:var(--pt-accbg,#eef2ff);color:var(--pt-acc,#4f46e5)}
.jx-btn{font-size:.82rem;font-weight:700;padding:.5rem .9rem;border-radius:.7rem;border:1px solid var(--pt-line,#e2e8f0);background:var(--pt-card,#fff);color:var(--pt-ink,#0f172a);cursor:pointer;line-height:1.25;transition:border-color .15s,background .15s,transform .05s}
.jx-btn:hover{border-color:var(--pt-acc,#4f46e5)}.jx-btn:active{transform:translateY(1px)}.jx-btn[disabled]{opacity:.4;cursor:default}
.jx-btn.pri{background:var(--pt-acc,#4f46e5);border-color:var(--pt-acc,#4f46e5);color:#fff}.jx-btn.sm{font-size:.74rem;padding:.35rem .65rem}
.jx-card{border:1px solid var(--pt-line,#e2e8f0);background:var(--pt-card,#fff);border-radius:1rem;padding:1rem}
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
.jx-toast.bad{background:#3b1217;color:#fecaca;border-color:#7f1d1d}.jx-toast.ok{background:#052e22;color:#a7f3d0;border-color:#065f46}.jx-toast.info{background:#12233f;color:#bfdbfe;border-color:#1e3a8a}
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
.al-top b{font-size:.9rem}.al-top .al-clk{margin-left:auto;font-size:1rem;font-weight:800;color:#cbd5e1}
.al-chip{font-size:.68rem;font-weight:900;letter-spacing:.06em;padding:.18rem .55rem;border-radius:.4rem;border:1px solid}
.al-chip.RUN{color:#34d399;border-color:#065f46;background:#052e22}.al-chip.DOWN{color:#fca5a5;border-color:#7f1d1d;background:#3b1217}.al-chip.HOLD{color:#fcd34d;border-color:#78350f;background:#3a2a08}.al-chip.IDLE{color:#cbd5e1;border-color:#334155;background:#1e293b}
.al-gs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.45rem;padding:.6rem .7rem}
@media(max-width:560px){.al-gs{grid-template-columns:repeat(4,minmax(0,1fr));gap:.3rem;padding:.45rem}.al-g{padding:.3rem .35rem}.al-g b{font-size:.98rem}.al-g em{display:none}.al-g svg{height:16px}.al-g span{font-size:.58rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.al-pn{min-height:4.6rem;max-height:7.4rem}.al-top{padding:.4rem .6rem}.al-mid{padding:0 .45rem .45rem}}
.al-g{background:var(--jx-p1);border:1px solid var(--jx-ln);border-radius:.7rem;padding:.4rem .55rem;transition:border-color .2s,background .2s}
.al-g.warn{border-color:#92400e;background:#2a1d08}.al-g.bad{border-color:#b91c1c;background:#341016;animation:jxBlink 1s infinite}
.al-g span{display:block;font-size:.64rem;font-weight:700;color:var(--jx-mu)}.al-g b{font-size:1.15rem;font-weight:800}.al-g em{font-style:normal;font-size:.62rem;color:var(--jx-mu);margin-left:.2rem}
.al-g svg{display:block;width:100%;height:24px;margin-top:.15rem}
.al-mid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:.5rem;padding:0 .7rem .6rem}
@media(max-width:560px){.al-mid{grid-template-columns:minmax(0,1fr)}}
.al-pn{background:var(--jx-p1);border:1px solid var(--jx-ln);border-radius:.7rem;min-height:9.2rem;max-height:13rem;overflow:auto}
.al-pn h4{position:sticky;top:0;margin:0;padding:.3rem .6rem;font-size:.66rem;font-weight:800;color:var(--jx-mu);background:var(--jx-p2);letter-spacing:.05em}
.al-r{display:flex;gap:.45rem;align-items:flex-start;padding:.38rem .6rem;border-top:1px solid var(--jx-ln);font-size:.78rem;line-height:1.4;cursor:pointer;animation:jxIn .2s}
.al-r:hover{background:rgba(255,255,255,.04)}.al-r.new i{animation:jxBlink .8s infinite}.al-r.sel{outline:2px solid var(--jx-ac);outline-offset:-2px;background:rgba(96,165,250,.1)}
.al-r time{color:var(--jx-mu);font-size:.7rem;white-space:nowrap}.al-r i{width:.55rem;height:.55rem;border-radius:50%;margin-top:.3rem;flex:none}
.al-r.warn i{background:#fbbf24}.al-r.alm i{background:#fb923c}.al-r.emo i{background:#ef4444}.al-r.sys i{background:#64748b}
.al-r.gone{opacity:.45;text-decoration:line-through}.al-r small{display:block;color:#fca5a5;font-weight:700}
.al-m{padding:.4rem .6rem;border-top:1px solid var(--jx-ln);font-size:.78rem;line-height:1.5;animation:jxIn .2s}.al-m b{display:block;font-size:.66rem;color:var(--jx-ac);font-weight:800}
.al-lot{display:flex;gap:.5rem;align-items:center;padding:.5rem .8rem;background:var(--jx-p1);border-top:1px solid var(--jx-ln);font-size:.78rem;color:#cbd5e1}.al-lot svg{flex:none}
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
.al-brief{padding:1.2rem 1.1rem;display:flex;flex-direction:column;gap:.7rem;min-height:18rem;justify-content:center}.al-brief h3{margin:0;font-size:1.15rem;font-weight:800}.al-brief p{margin:0;font-size:.9rem;line-height:1.7;color:#cbd5e1}
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
    let h = J.head('현장 직무', '알람 대응 콘솔') + `<p class="jx-note">${e('야간 근무 중 식각 장비 콘솔 앞에 앉아 있어요. 알람과 센서 값을 읽고, 아래 아홉 가지 행동 중 지금 해야 할 것을 골라요. 눌러서는 안 되는 버튼도 있어요. 시간이 정해진 상황도 있고, 마지막에 내가 한 행동을 순서대로 복기해요.')}</p><div class="jx-menu">`;
    SC.forEach((s, i) => {
      const sc = (J.load('alarm').sc || {})[s.id];
      h += `<button class="jx-card jx-pick" data-i="${i}"><em>${e(s.k)} · ${s.steps.length} ${e('단계')}</em><b>${e(s.t)}</b><span>${e(s.brief)}</span><span class="jx-st">${sc != null ? J.grade(sc) + ' · ' + sc + '%' : e('아직 안 해 봤어요')}</span></button>`;
    });
    h += `</div><p class="jx-note" style="margin-top:.8rem">${done ? e('진행') + ' ' + done + ' / ' + SC.length : ''}</p>`;
    root.innerHTML = h;
    root.querySelectorAll('.jx-pick').forEach((b) => b.addEventListener('click', () => brief(+b.dataset.i)));
  }
  function brief(i) {
    const s = SC[i];
    root.innerHTML = J.head('현장 직무', '알람 대응 콘솔', `<button class="jx-btn sm" id="alMenu">${e('상황 목록')}</button>`) +
      `<div class="jx-stage"><div class="al-brief"><span class="al-chip ${s.lv === 'emo' ? 'DOWN' : s.lv === 'alm' ? 'HOLD' : 'IDLE'}">${e(s.k)}</span><h3>${e(s.t)}</h3><p>${e(s.brief)}</p><p class="jx-mono" style="font-size:.78rem;color:#94a3b8">${esc(s.tool)} · ${esc(s.clk)}</p><button class="jx-btn pri" id="alGo">${e('콘솔 앞에 앉기')}</button></div></div>`;
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
      <div class="al-lot"><svg width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="12" fill="none" stroke="#64748b" stroke-width="2"/><circle cx="15" cy="15" r="4" fill="#94a3b8"/></svg><span id="alLot"></span></div></div>
      <div class="jx-card" id="alSide"></div></div>`;
    document.getElementById('alMenu').onclick = menu;
    document.getElementById('alGs').innerHTML = A.g.map((g, k) => `<div class="al-g" data-k="${k}"><span>${e(g.d.n)}</span><b class="jx-mono">-</b><em>${esc(g.d.u)}</em><svg viewBox="0 0 100 24" preserveAspectRatio="none"><polyline fill="none" stroke="#60a5fa" stroke-width="1.4" points=""/></svg></div>`).join('');
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
      pl.setAttribute('stroke', st === 'bad' ? '#f87171' : st === 'warn' ? '#fbbf24' : '#60a5fa');
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
    document.getElementById('alRows').innerHTML = A.alarms.map((a) => `<div class="al-r ${a.lv}${a.new ? ' new' : ''}${a.gone ? ' gone' : ''}${A.sel === a.k ? ' sel' : ''}" data-k="${a.k}"><i></i><time class="jx-mono">${esc(a.t)}</time><span>${e(a.x)}${a.gone ? '<small>' + e('해제됨 · 원인 기록 없음') + '</small>' : ''}</span></div>`).join('') || `<div class="al-m" style="color:#64748b">${e('알람 없음')}</div>`;
  }
  function drawMsgs() {
    document.getElementById('alMsg').innerHTML = A.msgs.map((m) => `<div class="al-m"><b>${e(m[0])}</b>${e(m[1])}</div>`).join('') || `<div class="al-m" style="color:#64748b">${e('메시지 없음')}</div>`;
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
/* ===== 설계 직무 체험 2: 타이밍 ECO 작업대 ===== */
JX.reg('eco', (root) => {
  const J = window.JX, e = J.e, T = J.T, esc = J.esc;
  J.css('jx-eco', `
.ec-top{display:flex;gap:.6rem;align-items:center;padding:.55rem .8rem;background:var(--jx-p1);border-bottom:1px solid var(--jx-ln);flex-wrap:wrap;font-size:.76rem;color:var(--jx-mu)}.ec-top b{color:var(--jx-tx)}
.ec-p{padding:.7rem .8rem;border-bottom:1px solid var(--jx-ln)}.ec-p:last-child{border-bottom:0}
.ec-ph{display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;flex-wrap:wrap}.ec-ph b{font-size:.84rem}.ec-ph small{color:var(--jx-mu);font-size:.7rem}
.ec-sl{margin-left:auto;font-weight:900;font-size:.95rem;padding:.2rem .6rem;border-radius:.5rem;border:1px solid;font-variant-numeric:tabular-nums}.ec-sl.ok{color:#34d399;border-color:#065f46;background:#052e22}.ec-sl.ng{color:#fca5a5;border-color:#7f1d1d;background:#3b1217}
.ec-row{display:flex;align-items:stretch;gap:.25rem;flex-wrap:wrap}
.ec-ff{flex:none;display:flex;align-items:center;justify-content:center;padding:0 .5rem;min-height:3.4rem;border-radius:.55rem;background:#1e293b;border:1px solid #334155;font-size:.66rem;font-weight:800;color:#94a3b8;text-align:center;line-height:1.3}
.ec-w{flex:none;display:flex;align-items:center;font-size:.6rem;color:#64748b;min-width:.6rem;justify-content:center}.ec-w.lg{color:#fbbf24;font-weight:800}.ec-w.bf{color:#34d399;font-weight:800}
.ec-g{flex:1;min-width:4.3rem;max-width:7rem;text-align:center;padding:.35rem .25rem;border-radius:.6rem;background:var(--jx-p2);border:1.5px solid var(--jx-ln);color:var(--jx-tx);cursor:pointer;font:inherit;line-height:1.3}
.ec-g:hover{border-color:#60a5fa}.ec-g.sel{border-color:#60a5fa;background:#1e3a6e;box-shadow:0 0 0 2px rgba(96,165,250,.3)}.ec-g.chg{border-color:#fbbf24}
.ec-g b{display:block;font-size:.76rem}.ec-g i{display:block;font-style:normal;font-size:.62rem;color:#94a3b8}.ec-g u{display:block;text-decoration:none;font-size:.82rem;font-weight:800;color:#7dd3fc;font-variant-numeric:tabular-nums}
.ec-bar{display:flex;height:1.35rem;margin-top:.55rem;border-radius:.35rem;overflow:hidden;position:relative;background:#0f172a;border:1px solid var(--jx-ln)}.ec-bar span{display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:800;color:#0b1220;overflow:hidden;white-space:nowrap;border-right:1px solid rgba(0,0,0,.25)}
.ec-bar .rq{position:absolute;top:-2px;bottom:-2px;width:2px;background:#f87171;box-shadow:0 0 6px #f87171}.ec-bt{display:flex;justify-content:space-between;font-size:.62rem;color:var(--jx-mu);margin-top:.2rem}
.ec-ins{margin-top:.2rem}.ec-ins h5{margin:0 0 .35rem;font-size:.88rem;font-weight:800}.ec-g2{display:flex;gap:.35rem;flex-wrap:wrap;margin:.25rem 0 .5rem}
.ec-o{font:inherit;font-size:.78rem;font-weight:800;padding:.4rem .75rem;border-radius:.65rem;border:1.5px solid var(--pt-line);background:var(--pt-card);color:inherit;cursor:pointer;line-height:1.2}.ec-o:hover{border-color:var(--pt-acc)}.ec-o.on{border-color:var(--pt-acc);background:var(--pt-accbg);color:var(--pt-acc)}.ec-o[disabled]{opacity:.4;cursor:default}
.ec-lb{font-size:.72rem;font-weight:800;color:var(--pt-mute);margin-top:.35rem}.ec-ex{font-size:.76rem;line-height:1.6;color:var(--pt-sub);margin:.3rem 0}
.ec-mt{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin:.6rem 0}.ec-m{border:1px solid var(--pt-line);background:var(--pt-card);border-radius:.8rem;padding:.45rem .65rem}.ec-m span{display:block;font-size:.66rem;font-weight:700;color:var(--pt-mute)}.ec-m b{font-size:.88rem;font-variant-numeric:tabular-nums}
.ec-m i{display:block;height:.4rem;border-radius:.25rem;background:var(--pt-soft);margin-top:.3rem;position:relative;overflow:hidden}.ec-m i s{position:absolute;left:0;top:0;bottom:0;background:var(--pt-acc);text-decoration:none}.ec-m.bad i s{background:#ef4444}
.ec-lg{font-size:.76rem;color:var(--pt-sub);margin:.4rem 0;display:flex;flex-direction:column;gap:.2rem}.ec-lg div{display:flex;gap:.4rem}.ec-lg em{font-style:normal;color:var(--pt-mute)}
.ec-fb{margin:.5rem 0;padding:.65rem .8rem;border-radius:.75rem;background:var(--pt-soft);font-size:.8rem;line-height:1.65}.ec-fb.ng{background:#fef2f2;color:#7f1d1d}html.dark .ec-fb.ng{background:#3b1217;color:#fecaca}.ec-fb.ok{background:#ecfdf5;color:#064e3b}html.dark .ec-fb.ok{background:#052e22;color:#a7f3d0}
`);
  const VT = [1.28, 1, 0.8], LK = [0.35, 1, 2.8], VN = ['HVT', 'SVT', 'LVT'], SZ = [1, 2, 4], DLY = 24, MINF = 0.88;
  const mk = (gs, w0, capCin, setup, hold) => ({ l: { p: 52, g: 3.2, s: 2 }, w0, capCin, setup: setup || 32, hold: hold || 16, g: gs.map(([n, p, g, cin, w]) => ({ n, p, g, cin, w })) });
  const gA = () => mk([['INV', 10, 2.2, 1.5, 4], ['NAND2', 16, 3, 2, 6], ['NOR2', 20, 3.8, 2, 6], ['NAND3', 24, 4.2, 2.4, 8], ['INV', 10, 2.2, 1.5, 10]], 5, 3);
  const gB = () => mk([['INV', 10, 2.2, 1.5, 3], ['NAND2', 16, 4, 2, 5], ['NOR2', 20, 3.8, 2, 40], ['NAND2', 16, 3, 2, 6], ['INV', 10, 2.2, 1.5, 8]], 4, 3);
  const gC = () => mk([['INV', 10, 2.2, 1.5, 5], ['NAND2', 18, 3.2, 2, 7], ['AOI21', 22, 4, 2.2, 9], ['INV', 10, 2.2, 1.5, 9]], 5, 3, 64);
  const gH = () => mk([['BUF', 10, 2.2, 1.5, 2], ['INV', 12, 2.6, 1.5, 2]], 2, 3, 32, 73);
  const arrOf = (p, S, minc) => {
    const f = minc ? MINF : 1, n = p.g.length, cin = (i) => (i < n ? p.g[i].cin * S.s[i] : p.capCin), parts = [];
    let t = 0; const d0 = f * (p.l.p + p.l.g * (0.3 * p.w0 + cin(0)) / p.l.s); t += d0; parts.push(d0);
    for (let i = 0; i < n; i++) {
      const g = p.g[i], nx = cin(i + 1); let C = 0.3 * g.w + nx, bd = 0;
      if (S.buf[i]) { C = 0.15 * g.w + 3; bd = f * (11 + 2.4 * (0.15 * g.w + nx) / 2); }
      const wd = f * (S.buf[i] ? 0.0225 : 0.045) * g.w * g.w, d = f * VT[S.vt[i]] * (g.p + g.g * C / S.s[i]) + wd;
      t += d + bd; parts.push(d + bd);
    }
    return { t, parts };
  };
  const MS = [
    { id: 'one', t: '한 경로 고치기', k: '입문', T: 232, brief: '슬랙이 음수인 경로 하나를 고쳐요. 셀을 눌러 크기와 문턱 전압을 바꿔 보고, 어느 셀이 가장 효과적인지 막대에서 찾아요.', paths: [{ k: 'setup', n: '경로 1', a: 'FF_A', b: 'FF_B', p: gA() }], bud: { pw: 9.5, ar: 8 }, opt: 2,
      tip: '시간이 가장 많이 쓰이는 셀을 먼저 보세요. 셀을 키우면 그 셀은 빨라지지만, 앞에서 구동하는 셀의 부하가 늘어요.', why: '지연이 큰 셀 몇 개의 문턱 전압을 낮추는 것이 전체를 키우는 것보다 면적과 전력에 유리해요. 몇 군데만 고치는 것이 ECO의 기본이에요.' },
    { id: 'wire', t: '긴 배선 때문에 느린 경로', k: '보통', T: 304, brief: '가운데 셀이 아주 긴 배선을 구동해요. 크기만 키우면 어디까지 되는지 직접 확인하고, 버퍼를 넣는 방법과 비교해요.', paths: [{ k: 'setup', n: '경로 1', a: 'FF_C', b: 'FF_D', p: gB() }], bud: { pw: 11, ar: 9 }, opt: 1,
      tip: '배선이 길면 저항과 용량 때문에 셀을 키워도 줄어들지 않는 지연이 남아요. 배선 가운데에 버퍼를 넣으면 배선이 반으로 나뉘어요.', why: '긴 배선의 지연은 배선 길이의 제곱에 가깝게 늘어요. 중간에 버퍼를 넣으면 절반씩 두 번 지나가므로 훨씬 줄어요. 크기만 키우면 여러 군데를 바꿔야 해요.' },
    { id: 'pwr', t: '전력 예산 안에서 두 경로 고치기', k: '보통', T: 232, brief: '경로 두 개가 모두 위반이에요. 문턱 전압을 낮추면 빨라지지만 누설 전력이 크게 늘어요. 예산 안에서 필요한 곳만 골라요.', paths: [{ k: 'setup', n: '경로 1', a: 'FF_A', b: 'FF_B', p: gA() }, { k: 'setup', n: '경로 2', a: 'FF_E', b: 'FF_F', p: gC() }], bud: { pw: 15.6, ar: 12 }, opt: 4,
      tip: '모든 셀을 LVT로 바꾸면 타이밍은 맞지만 전력 예산을 넘어요. 위반한 만큼만, 효과가 큰 셀에만 써요.', why: '전력과 면적은 한정된 예산이에요. 위반을 고치는 데 필요한 최소한의 셀만 바꾸는 것이 좋은 ECO예요.' },
    { id: 'hold', t: '클록 스큐와 홀드', k: '어려움', T: 230, skew: true, brief: '셋업 위반 경로를 클록 지연(유용한 스큐)으로 고쳐요. 같은 캡처 플립플롭에 닿는 짧은 경로는 홀드가 깨지고, 그 플립플롭에서 출발하는 다음 경로의 여유도 줄어요.', paths: [{ k: 'setup', n: '경로 1 (셋업)', a: 'FF_A', b: 'FF_B', p: gA() }, { k: 'hold', n: '경로 2 (홀드)', a: 'FF_G', b: 'FF_B', p: gH() }], bud: { pw: 10.2, ar: 9 }, next: 28, opt: 2,
      tip: '캡처 클록을 늦추면 셋업이 좋아지는 만큼 같은 FF의 홀드가 나빠져요. 홀드는 지연 셀을 넣어 고쳐요.', why: '스큐는 여유를 한쪽에서 다른 쪽으로 옮길 뿐이에요. 옮겨 간 곳(홀드 경로, 다음 단계 경로)이 괜찮은지 같이 확인해야 해요.' },
  ];
  let M = null;
  const slackOf = (pi) => {
    const p = M.m.paths[pi], S = M.st[pi]; if (p.k === 'setup') { const a = arrOf(p.p, S).t; return M.m.T + M.skew - p.p.setup - a; }
    const a = arrOf(p.p, S, true).t + M.dly * DLY * MINF; return a - p.p.hold - M.skew;
  };
  const costs = () => {
    let pw = 0, ar = 0; M.st.forEach((S) => S.s.forEach((s, i) => { pw += s * (0.8 + 0.5 * LK[S.vt[i]]); ar += s; if (S.buf[i]) { pw += 1.2; ar += 2; } }));
    pw += M.dly * .8; ar += M.dly * 1.5; return { pw, ar };
  };
  const changes = () => {
    let c = 0; M.st.forEach((S, k) => S.s.forEach((s, i) => { const o = M.st0[k]; c += (s !== o.s[i]) + (S.vt[i] !== o.vt[i]) + (S.buf[i] !== o.buf[i]); })); return c + (M.skew ? 1 : 0) + M.dly;
  };
  function menu() {
    M = null; J.timers.forEach((h) => { clearTimeout(h); clearInterval(h); }); J.timers = [];
    const sc = J.load('eco').sc || {};
    let h = J.head('설계 직무', '타이밍 ECO 작업대') + `<p class="jx-note">${e('합성과 배치를 마친 설계에서 타이밍 리포트를 열었어요. 슬랙이 음수인 경로가 있어요. 셀 크기, 문턱 전압, 버퍼, 클록 지연을 바꿔서 위반을 고치되, 전력과 면적 예산, 다른 경로의 홀드를 지켜요. 변경은 적을수록 좋아요. ECO가 많을수록 다시 검증할 것도 늘어나요.')}</p><div class="jx-menu">`;
    MS.forEach((m, i) => { h += `<button class="jx-card jx-pick" data-i="${i}"><em>${e(m.k)} · ${e(m.paths.length + '개 경로')}</em><b>${e(m.t)}</b><span>${e(m.brief)}</span><span class="jx-st">${sc[m.id] != null ? J.grade(sc[m.id]) + ' · ' + sc[m.id] + '점' : e('아직 안 해 봤어요')}</span></button>`; });
    root.innerHTML = h + '</div>';
    root.querySelectorAll('.jx-pick').forEach((b) => b.addEventListener('click', () => play(+b.dataset.i)));
  }
  function play(i) {
    const m = MS[i], st = m.paths.map((p) => ({ s: p.p.g.map(() => 1), vt: p.p.g.map(() => 1), buf: p.p.g.map(() => 0) }));
    M = { i, m, st, st0: JSON.parse(JSON.stringify(st)), skew: 0, dly: 0, sel: [0, 0], hist: [], tries: 0, fb: '', tip: false };
    M.sel = [0, 0];
    root.innerHTML = J.head('설계 직무', m.t, `<button class="jx-btn sm" id="ecMenu">${e('미션 목록')}</button>`) + `<div class="jx-two"><div class="jx-stage" id="ecStage"></div><div class="jx-card" id="ecSide"></div></div>`;
    document.getElementById('ecMenu').onclick = menu; draw();
  }
  const COL = ['#7dd3fc', '#a5b4fc', '#86efac', '#fcd34d', '#fda4af', '#c4b5fd', '#67e8f9'];
  function draw() {
    const m = M.m; let h = `<div class="ec-top"><span>${e('클록 주기')} <b class="jx-mono">${m.T} ps</b></span><span>${e('셋업')} <b class="jx-mono">${m.paths[0].p.setup} ps</b></span>${M.skew ? `<span>${e('캡처 클록 지연')} <b class="jx-mono">+${M.skew} ps</b></span>` : ''}<span style="margin-left:auto">${e('변경')} <b>${changes()}</b></span></div>`;
    m.paths.forEach((p, pi) => {
      const S = M.st[pi], sl = slackOf(pi), ok = sl >= 0, isH = p.k === 'hold', ar = arrOf(p.p, S, isH);
      h += `<div class="ec-p"><div class="ec-ph"><b>${e(p.n)}</b><small class="jx-mono">${esc(p.a)} → ${esc(p.b)}</small><span class="ec-sl ${ok ? 'ok' : 'ng'}">${isH ? e('홀드') : e('셋업')} ${sl >= 0 ? '+' : ''}${sl.toFixed(1)} ps</span></div><div class="ec-row"><div class="ec-ff">${esc(p.a)}<br>CK→Q<br><span class="jx-mono" style="color:#7dd3fc">${ar.parts[0].toFixed(0)}</span></div>`;
      p.p.g.forEach((g, i) => {
        const o = M.st0[pi], chg = S.s[i] !== o.s[i] || S.vt[i] !== o.vt[i] || S.buf[i] !== o.buf[i], sel = M.sel[0] === pi && M.sel[1] === i;
        const pw_ = i ? p.p.g[i - 1].w : p.p.w0, lg = pw_ >= 20, bf = i && S.buf[i - 1];
        h += `<div class="ec-w ${lg ? (bf ? 'bf' : 'lg') : ''}">${lg ? (bf ? 'BUF' : T('긴 배선')) : '›'}</div><button class="ec-g${sel ? ' sel' : ''}${chg ? ' chg' : ''}" data-p="${pi}" data-i="${i}"><b>${esc(g.n)}</b><i>X${S.s[i]} · ${VN[S.vt[i]]}</i><u>${ar.parts[i + 1].toFixed(0)} ps</u></button>`;
      });
      const lw = p.p.g[p.p.g.length - 1].w;
      h += `<div class="ec-w ${lw >= 20 ? 'lg' : ''}">${lw >= 20 ? T('긴 배선') : '›'}</div><div class="ec-ff">${esc(p.b)}<br>${isH ? e('홀드') : e('셋업')}<br><span class="jx-mono" style="color:#7dd3fc">${isH ? p.p.hold : p.p.setup}</span></div></div>`;
      // 시간 막대
      const reqT = isH ? p.p.hold + M.skew : m.T + M.skew - p.p.setup, scale = Math.max(reqT, ar.t + (isH ? M.dly * DLY * MINF : 0)) * 1.04;
      h += `<div class="ec-bar">${ar.parts.map((d, k) => `<span style="width:${(d / scale * 100).toFixed(2)}%;background:${COL[k % COL.length]}">${d / scale > .06 ? Math.round(d) : ''}</span>`).join('')}${isH && M.dly ? `<span style="width:${(M.dly * DLY * MINF / scale * 100).toFixed(2)}%;background:#fde68a">${M.dly}×</span>` : ''}<i class="rq" style="left:${(reqT / scale * 100).toFixed(2)}%"></i></div><div class="ec-bt"><span>0</span><span>${isH ? e('홀드 요구') : e('요구 도착 시각')} ${reqT.toFixed(0)} ps (${e('빨간 선')}) · ${e('실제 도착')} ${(ar.t + (isH ? M.dly * DLY * MINF : 0)).toFixed(0)} ps</span></div></div>`;
    });
    document.getElementById('ecStage').innerHTML = h;
    document.getElementById('ecStage').querySelectorAll('.ec-g').forEach((b) => b.addEventListener('click', () => { M.sel = [+b.dataset.p, +b.dataset.i]; draw(); }));
    side();
  }
  function snap() { M.hist.push(JSON.stringify({ st: M.st, skew: M.skew, dly: M.dly })); }
  function setS(k, v) { const [pi, i] = M.sel; snap(); M.st[pi][k][i] = v; M.fb = ''; draw(); }
  function side() {
    const m = M.m, [pi, i] = M.sel, p = m.paths[pi], g = p.p.g[i], S = M.st[pi], cs = costs();
    const row = (k, vals, cur, lab, dis) => `<div class="ec-g2">${vals.map((v, j) => `<button class="ec-o${cur === j ? ' on' : ''}" data-k="${k}" data-v="${j}" ${dis && dis(j) ? 'disabled' : ''}>${lab(j)}</button>`).join('')}</div>`;
    let h = `<p class="jx-note" style="margin:0">${e('미션')} ${M.i + 1} / ${MS.length} · ${e(m.k)}</p><p class="jx-note">${e(m.brief)}</p>`;
    h += `<div class="ec-ins"><h5>${e(p.n)} · ${esc(g.n)} · ${e('셀')} ${i + 1}</h5><div class="ec-lb">${e('크기')}</div>${row('s', SZ, SZ.indexOf(S.s[i]), (j) => 'X' + SZ[j])}<div class="ec-ex">${e('크기를 키우면 이 셀은 빨라져요. 대신 앞 셀의 부하가 늘고 면적과 전력이 커져요.')}</div>`;
    h += `<div class="ec-lb">${e('문턱 전압')}</div>${row('vt', VN, S.vt[i], (j) => VN[j])}<div class="ec-ex">${e('LVT는 빠르지만 누설 전력이 크고, HVT는 느리지만 아껴요.')}</div>`;
    if (g.w >= 12) h += `<div class="ec-lb">${e('긴 배선에 버퍼')}</div><div class="ec-g2"><button class="ec-o${S.buf[i] ? ' on' : ''}" data-k="buf" data-v="${S.buf[i] ? 0 : 1}">${S.buf[i] ? e('버퍼 넣음') : e('배선 중간에 버퍼 넣기')}</button></div>`;
    h += '</div>';
    if (m.skew) {
      h += `<div class="ec-lb">${e('캡처 클록 지연(스큐)')}</div><div class="ec-g2">${[0, 20, 40].map((v) => `<button class="ec-o${M.skew === v ? ' on' : ''}" data-k="skew" data-v="${v}">${v ? '+' + v + ' ps' : e('없음')}</button>`).join('')}</div>`;
      h += `<div class="ec-lb">${e('홀드 경로에 지연 셀')}</div><div class="ec-g2">${[0, 1, 2].map((v) => `<button class="ec-o${M.dly === v ? ' on' : ''}" data-k="dly" data-v="${v}">${e(v + '개')}</button>`).join('')}</div>`;
    }
    const pwc = cs.pw > m.bud.pw, arc = cs.ar > m.bud.ar;
    h += `<div class="ec-mt"><div class="ec-m ${pwc ? 'bad' : ''}"><span>${e('전력')}</span><b>${cs.pw.toFixed(1)} / ${m.bud.pw}</b><i><s style="width:${Math.min(100, cs.pw / m.bud.pw * 100)}%"></s></i></div><div class="ec-m ${arc ? 'bad' : ''}"><span>${e('면적')}</span><b>${cs.ar.toFixed(1)} / ${m.bud.ar}</b><i><s style="width:${Math.min(100, cs.ar / m.bud.ar * 100)}%"></s></i></div></div>`;
    if (m.next != null) { const ns = m.next - M.skew; h += `<div class="ec-m ${ns < 0 ? 'bad' : ''}" style="margin-bottom:.5rem"><span>${e('다음 단계 경로 여유 (FF_B에서 출발)')}</span><b>${ns >= 0 ? '+' : ''}${ns} ps</b></div>`; }
    h += `<div style="display:flex;gap:.4rem;flex-wrap:wrap"><button class="jx-btn pri" id="ecGo">${e('ECO 제출')}</button><button class="jx-btn" id="ecUndo" ${M.hist.length ? '' : 'disabled'}>${e('되돌리기')}</button><button class="jx-btn" id="ecRst">${e('처음으로')}</button><button class="jx-btn" id="ecTip">${e('힌트')}</button></div>`;
    if (M.tip) h += `<div class="ec-fb">💡 ${e(m.tip)}</div>`;
    if (M.fb) h += M.fb;
    const el = document.getElementById('ecSide'); el.innerHTML = h;
    el.querySelectorAll('.ec-o').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.k, v = +b.dataset.v;
      if (k === 's') setS('s', SZ[v]); else if (k === 'vt') setS('vt', v); else if (k === 'buf') setS('buf', v);
      else { snap(); if (k === 'skew') M.skew = v; else M.dly = v; M.fb = ''; draw(); }
    }));
    document.getElementById('ecGo').onclick = submit; document.getElementById('ecTip').onclick = () => { M.tip = !M.tip; side(); };
    document.getElementById('ecUndo').onclick = () => { const s = M.hist.pop(); if (!s) return; const o = JSON.parse(s); M.st = o.st; M.skew = o.skew; M.dly = o.dly; M.fb = ''; draw(); };
    document.getElementById('ecRst').onclick = () => { M.st = JSON.parse(JSON.stringify(M.st0)); M.skew = 0; M.dly = 0; M.hist = []; M.fb = ''; draw(); };
  }
  function submit() {
    const m = M.m, cs = costs(), prob = [];
    m.paths.forEach((p, pi) => { const sl = slackOf(pi); if (sl < 0) prob.push(`${e(p.n)}: ${p.k === 'hold' ? e('홀드') : e('셋업')} ${sl.toFixed(1)} ps ${e('위반')}`); });
    if (m.next != null && m.next - M.skew < 0) prob.push(`${e('다음 단계 경로')}: ${m.next - M.skew} ps ${e('위반')}`);
    if (cs.pw > m.bud.pw) prob.push(`${e('전력 예산 초과')} (${cs.pw.toFixed(1)} > ${m.bud.pw})`);
    if (cs.ar > m.bud.ar) prob.push(`${e('면적 예산 초과')} (${cs.ar.toFixed(1)} > ${m.bud.ar})`);
    M.tries++;
    if (prob.length) { M.fb = `<div class="ec-fb ng"><b>${e('아직 통과하지 못했어요')}</b><br>${prob.join('<br>')}</div>`; side(); return; }
    const c = changes(), pct = Math.max(40, 100 - 12 * Math.max(0, c - m.opt) - 5 * (M.tries - 1)), pr = J.load('eco'), sc = Object.assign({}, pr.sc); sc[m.id] = Math.max(sc[m.id] || 0, pct);
    J.save('eco', { sc, best: Math.round(Object.values(sc).reduce((a, b) => a + b, 0) / MS.length), unit: '점' });
    const next = MS[M.i + 1];
    document.getElementById('ecSide').innerHTML = `<p class="jx-note" style="margin:0">${e('미션')} ${M.i + 1} / ${MS.length}</p><div style="display:flex;align-items:center;gap:1rem;margin:.5rem 0">${J.score(pct, '점')}<span class="jx-note">${e('변경')} ${e(c + '개')} · ${e('가장 적게 고친 방법')} ${e(m.opt + '개')}${M.tries > 1 ? ' · ' + e('제출 ' + M.tries + '번') : ''}</span></div>
      <div class="ec-fb ok"><b>${e('타이밍과 예산을 모두 지켰어요.')}</b><br>${e(m.why)}</div>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap"><button class="jx-btn" id="ecAgain">${e('다시 하기')}</button>${next ? `<button class="jx-btn pri" id="ecNx">${e('다음 미션')}</button>` : ''}<button class="jx-btn" id="ecMn">${e('미션 목록')}</button></div>`;
    document.getElementById('ecAgain').onclick = () => play(M.i); document.getElementById('ecMn').onclick = menu; const nx = document.getElementById('ecNx'); if (nx) nx.onclick = () => play(M.i + 1);
  }
  menu();
});
/* ===== 현장 직무 체험 2: SPC 관리도 운영실 ===== */
JX.reg('spc', (root) => {
  const J = window.JX, e = J.e, T = J.T, esc = J.esc;
  J.css('jx-spc', `
.sp-bar{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-bottom:.6rem}
.sp-seg{display:inline-flex;border:1px solid var(--pt-line);border-radius:.7rem;overflow:hidden}.sp-seg button{font:inherit;font-size:.78rem;font-weight:700;padding:.4rem .75rem;border:0;background:var(--pt-card);color:var(--pt-sub);cursor:pointer;border-right:1px solid var(--pt-line)}.sp-seg button:last-child{border-right:0}.sp-seg button.on{background:var(--pt-acc);color:#fff}
.sp-hud{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.4rem;margin-bottom:.6rem}
@media(max-width:560px){.sp-hud{grid-template-columns:repeat(2,minmax(0,1fr))}}
.sp-hud div{border:1px solid var(--pt-line);background:var(--pt-card);border-radius:.8rem;padding:.4rem .6rem}.sp-hud span{display:block;font-size:.66rem;font-weight:700;color:var(--pt-mute)}.sp-hud b{font-size:1.1rem;font-weight:800;font-variant-numeric:tabular-nums}.sp-hud b.bad{color:#ef4444}
.sp-prog{height:.28rem;border-radius:.2rem;background:var(--pt-soft);overflow:hidden;margin-bottom:.6rem}.sp-prog i{display:block;height:100%;background:var(--pt-acc);transition:width .3s linear}
.sp-ch{margin-bottom:.6rem}.sp-chh{display:flex;align-items:center;gap:.5rem;padding:.45rem .7rem;background:var(--jx-p1);border-bottom:1px solid var(--jx-ln);flex-wrap:wrap}
.sp-chh b{font-size:.84rem}.sp-chh small{font-size:.7rem;color:var(--jx-mu)}.sp-chh .jx-btn{margin-left:auto;background:#3b1217;border-color:#7f1d1d;color:#fecaca}.sp-chh .jx-btn:hover{background:#4a1a21}
.sp-st{font-size:.64rem;font-weight:900;letter-spacing:.05em;padding:.14rem .45rem;border-radius:.35rem;border:1px solid}.sp-st.run{color:#34d399;border-color:#065f46;background:#052e22}.sp-st.hold{color:#fcd34d;border-color:#78350f;background:#3a2a08}
.sp-ch svg{display:block;width:100%;height:auto}.sp-ch svg text{font-family:inherit}
.sp-lg{display:flex;flex-wrap:wrap;gap:.3rem .9rem;font-size:.74rem;color:var(--pt-sub);margin:.4rem 0}
.sp-rl{margin:.5rem 0;padding:.7rem .9rem;border-radius:.8rem;background:var(--pt-soft);font-size:.8rem;line-height:1.7}.sp-rl b{color:var(--pt-acc)}
.sp-rs{display:flex;flex-direction:column;gap:.4rem;margin:.6rem 0}.sp-rr{padding:.65rem .8rem;border-radius:.8rem;border:1px solid var(--pt-line);background:var(--pt-card);font-size:.8rem;line-height:1.65}.sp-rr b{display:block;font-size:.86rem;margin-bottom:.15rem}
.sp-rr.g{border-color:#10b981}.sp-rr.x{border-color:#f87171}.sp-rr.l{border-color:#f59e0b}
`);
  const N = 60, RN = ['', '점 하나가 3σ 밖', '3점 중 2점이 같은 쪽 2σ 밖', '5점 중 4점이 같은 쪽 1σ 밖', '연속 8점이 중심선 한쪽', '연속 6점이 계속 오르거나 내림'];
  const EQ = [{ n: 'ETCH-01', p: '식각 깊이', u: 'nm', cl: 300, sg: 4, d: 0 }, { n: 'CVD-02', p: '산화막 두께', u: 'nm', cl: 100, sg: 1.2, d: 1 }, { n: 'PHOTO-03', p: '선폭(CD)', u: 'nm', cl: 45, sg: .6, d: 2 }];
  const TY = { shift: '평균이 한쪽으로 옮겨감', trend: '서서히 한쪽으로 흐름', out: '점 하나가 튐' };
  const DIFF = {
    easy: { n: '입문', ms: 1100, hint: true, nz: .9, pl: [{ ty: 'shift', mag: 2.1 }, { ty: 'out', mag: 4 }, null], dec: 0, note: '규칙 표시가 켜진 채로 시작해요. 이상이 뚜렷하고 헷갈리는 점이 없어요.' },
    norm: { n: '보통', ms: 900, hint: false, nz: 1, pl: [{ ty: 'shift', mag: 1.6 }, { ty: 'trend', mag: .26 }, { ty: 'out', mag: 4 }], dec: 2, note: '규칙 표시가 꺼져 있어요. 3σ 안쪽에서 튀는 점이 섞여 있고, 이상이 없는 차트도 있어요.' },
    hard: { n: '어려움', ms: 750, hint: false, nz: 1.05, pl: [{ ty: 'shift', mag: 1.25 }, { ty: 'trend', mag: .19 }, null], dec: 3, note: '이상이 작고 느려요. 튀는 점이 많아서 멈추지 말아야 할 때를 알아야 해요.' },
  };
  let S = null;
  const rule = (z, i, from) => {
    const h = [], v = z[i], g = (k) => i - k >= from;
    if (Math.abs(v) > 3) h.push(1);
    if (g(2)) { const w = [z[i - 2], z[i - 1], v]; if ((v > 2 && w.filter((x) => x > 2).length >= 2) || (v < -2 && w.filter((x) => x < -2).length >= 2)) h.push(2); }
    if (g(4)) { const w = z.slice(i - 4, i + 1); if ((v > 1 && w.filter((x) => x > 1).length >= 4) || (v < -1 && w.filter((x) => x < -1).length >= 4)) h.push(3); }
    if (g(7)) { const w = z.slice(i - 7, i + 1); if (w.every((x) => x > 0) || w.every((x) => x < 0)) h.push(4); }
    if (g(5)) { const w = z.slice(i - 5, i + 1); let up = true, dn = true; for (let k = 1; k < 6; k++) { if (w[k] <= w[k - 1]) up = false; if (w[k] >= w[k - 1]) dn = false; } if (up || dn) h.push(5); }
    return h;
  };
  function build(df, seed) {
    for (let tr = 0; tr < 600; tr++) {
      const r = J.rng(seed + tr * 7919), cs = [], order = [0, 1, 2].sort(() => r() - .5);
      let ok = true;
      for (let q = 0; q < 3 && ok; q++) {
        const eq = EQ[q], pl0 = df.pl[order[q]], c = { eq, base: [], add: Array(N).fill(0), z: [], plan: null, hits: [], i: -1, status: 'run', hold: 0, from: 0, pend: null };
        for (let i = 0; i < N; i++) c.base.push(J.gauss(r) * df.nz * .95);
        const sgn = r() < .5 ? -1 : 1;
        if (pl0) { const k = 20 + Math.floor(r() * 18); c.plan = { ty: pl0.ty, k, sgn, mag: pl0.mag, done: false }; for (let i = k; i < N; i++) c.add[i] = pl0.ty === 'shift' ? sgn * pl0.mag : pl0.ty === 'trend' ? sgn * Math.min(3.2, pl0.mag * (i - k + 1)) : (i === k ? sgn * pl0.mag : 0); }
        c.z = c.base.map((v, i) => v + c.add[i]);
        c.sgn = sgn; cs.push(c);
      }
      // 이상 없는 차트에 튀는 점(정상 범위) 넣기
      const decN = df.dec; let placed = 0;
      cs.forEach((c, q) => { const n = c.plan ? (decN > 2 ? 1 : 0) : decN; for (let t = 0; t < n; t++) { const i = 6 + Math.floor(r() * (N - 12)); if (c.plan && Math.abs(i - c.plan.k) < 8) continue; const s = r() < .5 ? -1 : 1; c.base[i] = s * (2.3 + r() * .3); c.z[i] = c.base[i] + c.add[i]; placed++; } });
      // 검증: 이상 전에는 규칙이 걸리면 안 되고, 이상 뒤 10점 안에는 걸려야 한다
      cs.forEach((c) => {
        const k = c.plan ? c.plan.k : N;
        for (let i = 0; i < N; i++) { const h = rule(c.z, i, 0); if (h.length && i < k) ok = false; if (h.length && i >= k && c.fire == null) { c.fire = i; c.fireR = h; } }
        if (c.plan) { if (c.fire == null || c.fire - k > (c.plan.ty === 'trend' ? 14 : 8)) ok = false; } else if (c.fire != null) ok = false;
      });
      if (ok) return cs;
    }
    return null;
  }
  // ---------- 화면 ----------
  function menu() {
    S = null; J.timers.forEach((h) => { clearTimeout(h); clearInterval(h); }); J.timers = [];
    const pr = J.load('spc'), sc = pr.sc || {};
    let h = J.head('현장 직무', 'SPC 관리도 운영실') + `<p class="jx-note">${e('관리도 세 장이 실시간으로 자라요. 새 점이 찍힐 때마다 규칙에 걸리는지 읽고, 이상이면 그 차트의 장비를 멈춰요. 이상이 아닌데 멈추면 생산이 끊기고, 이상인데 놓치면 불량 로트가 계속 쌓여요. 규칙 다섯 가지는 아래에서 볼 수 있어요.')}</p>`;
    h += `<div class="sp-rl"><b>${e('판정 규칙')}</b><br>${[1, 2, 3, 4, 5].map((k) => `${k}. ${e(RN[k])}`).join('<br>')}</div><div class="jx-menu">`;
    Object.keys(DIFF).forEach((k) => { const d = DIFF[k]; h += `<button class="jx-card jx-pick" data-k="${k}"><em>${e('난이도')}</em><b>${e(d.n)}</b><span>${e(d.note)}</span><span class="jx-st">${sc[k] != null ? J.grade(sc[k]) + ' · ' + sc[k] + '점' : e('아직 안 해 봤어요')}</span></button>`; });
    root.innerHTML = h + '</div>';
    root.querySelectorAll('.jx-pick').forEach((b) => b.addEventListener('click', () => play(b.dataset.k)));
  }
  function svg(c, last, full) {
    const W = 600, H = 150, L = 34, R = 10, Tp = 8, B = 18, n = full ? N : 40, st = full ? 0 : Math.max(0, last - n + 1);
    const x = (i) => L + (i - st) * (W - L - R) / (n - 1), y = (z) => Tp + (3.8 - Math.max(-3.8, Math.min(3.8, z))) / 7.6 * (H - Tp - B);
    let o = `<svg viewBox="0 0 ${W} ${H}">`;
    const band = (a, b, col, op) => `<rect x="${L}" y="${y(b)}" width="${W - L - R}" height="${y(a) - y(b)}" fill="${col}" fill-opacity="${op}"/>`;
    o += band(-1, 1, '#34d399', .09) + band(1, 2, '#fbbf24', .07) + band(-2, -1, '#fbbf24', .07) + band(2, 3, '#fb923c', .09) + band(-3, -2, '#fb923c', .09) + band(3, 3.8, '#ef4444', .1) + band(-3.8, -3, '#ef4444', .1);
    [-2, -1, 1, 2].forEach((v) => { o += `<path d="M${L} ${y(v)}H${W - R}" stroke="#94a3b8" stroke-opacity=".3" stroke-dasharray="3 4"/>`; });
    [-3, 3].forEach((v) => { o += `<path d="M${L} ${y(v)}H${W - R}" stroke="#f87171" stroke-width="1.4"/><text x="${L - 4}" y="${y(v) + 3}" text-anchor="end" font-size="9" fill="#f87171" font-weight="800">${v > 0 ? '+' : '−'}3σ</text>`; });
    o += `<path d="M${L} ${y(0)}H${W - R}" stroke="#34d399" stroke-width="1.4"/><text x="${L - 4}" y="${y(0) + 3}" text-anchor="end" font-size="9" fill="#34d399" font-weight="800">CL</text>`;
    if (full && c.plan) {
      const k = c.plan.k; o += `<path d="M${x(k)} ${Tp}V${H - B}" stroke="#fbbf24" stroke-dasharray="4 3"/><text x="${x(k) + 3}" y="${Tp + 9}" font-size="9" fill="#fbbf24" font-weight="800">${e('이상 시작')}</text>`;
      if (c.fire != null) o += `<path d="M${x(c.fire)} ${Tp}V${H - B}" stroke="#f87171" stroke-dasharray="2 3"/><text x="${x(c.fire) + 3}" y="${Tp + 20}" font-size="9" fill="#f87171" font-weight="800">${e('규칙이 걸림')}</text>`;
    }
    if (full && c.stops) c.stops.forEach((q) => { o += `<path d="M${x(q.i)} ${Tp}V${H - B}" stroke="#34d399" stroke-width="2"/><text x="${x(q.i) + 3}" y="${H - B - 4}" font-size="9" fill="#34d399" font-weight="800">${e('멈춤')}</text>`; });
    let pts = '';
    for (let i = st; i <= last; i++) pts += x(i).toFixed(1) + ',' + y(c.z[i]).toFixed(1) + ' ';
    o += `<polyline points="${pts}" fill="none" stroke="#60a5fa" stroke-width="1.6" stroke-opacity=".85"/>`;
    for (let i = st; i <= last; i++) {
      const v = c.z[i], hit = c.hits[i] && c.hits[i].length, hl = (S.hint || full) && hit;
      o += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${hl ? 4.2 : 3}" fill="${Math.abs(v) > 3 ? '#f87171' : hl ? '#fbbf24' : '#93c5fd'}" ${hl ? 'stroke="#fff" stroke-width="1.2"' : ''}/>`;
    }
    if (!full) for (let i = st; i <= last; i += 10) o += `<text x="${x(i)}" y="${H - 4}" font-size="8.5" fill="#64748b" text-anchor="middle">${i + 1}</text>`;
    return o + '</svg>';
  }
  function play(dk) {
    const df = DIFF[dk]; let cs = null, seed = Date.now() & 0xffffff;
    cs = build(df, seed); if (!cs) return menu();
    S = { dk, df, cs, t: -1, hint: df.hint, hintUsed: df.hint, run: true, spd: 1, falseStops: 0, early: 0, bad: 0, log: [] };
    root.innerHTML = J.head('현장 직무', 'SPC 관리도 운영실 · ' + T(df.n), `<button class="jx-btn sm" id="spMenu">${e('난이도 선택')}</button>`) +
      `<div class="sp-bar"><button class="jx-btn sm" id="spPlay">${e('일시정지')}</button><span class="sp-seg" id="spSp"><button data-s="1" class="on">×1</button><button data-s="2">×2</button></span><button class="jx-btn sm" id="spHint">${e('규칙 표시')} ${df.hint ? 'ON' : 'OFF'}</button><span class="jx-note" style="margin-left:auto" id="spMsg"></span></div>
      <div class="sp-hud"><div><span>${e('진행')}</span><b id="spT">0 / ${N}</b></div><div><span>${e('나쁜 상태로 도는 로트')}</span><b id="spB">0</b></div><div><span>${e('멈춘 횟수')}</span><b id="spS">0</b></div><div><span>${e('헛멈춤')}</span><b id="spF">0</b></div></div>
      <div class="sp-prog"><i id="spPg" style="width:0"></i></div><div id="spCh"></div><div class="sp-lg"><span>🟦 ${e('측정 점')}</span><span>🟨 ${e('규칙에 걸린 점(표시 ON)')}</span><span>🟥 ${e('3σ 밖')}</span></div>`;
    document.getElementById('spMenu').onclick = menu;
    document.getElementById('spCh').innerHTML = cs.map((c, q) => `<div class="jx-stage sp-ch" data-q="${q}"><div class="sp-chh"><b class="jx-mono">${esc(c.eq.n)}</b><small>${e(c.eq.p)} (${esc(c.eq.u)})</small><span class="sp-st run" data-st>RUN</span><small class="jx-mono" data-v></small><button class="jx-btn sm" data-stop="${q}">🛑 ${e('장비 멈추기')}</button></div><div data-svg></div></div>`).join('');
    document.getElementById('spCh').addEventListener('click', (ev) => { const b = ev.target.closest('[data-stop]'); if (b) stop(+b.dataset.stop); });
    document.getElementById('spPlay').onclick = () => { S.run = !S.run; document.getElementById('spPlay').textContent = T(S.run ? '일시정지' : '이어서'); };
    document.getElementById('spSp').onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; S.spd = +b.dataset.s; document.querySelectorAll('#spSp button').forEach((x) => x.classList.toggle('on', x === b)); clock(); };
    document.getElementById('spHint').onclick = () => { S.hint = !S.hint; if (S.hint) S.hintUsed = true; document.getElementById('spHint').textContent = T('규칙 표시') + ' ' + (S.hint ? 'ON' : 'OFF'); draw(); };
    clock(); step();
  }
  function clock() { if (S.h) J.clear(S.h); S.h = J.interval(() => { if (S && S.run) step(); }, S.df.ms / S.spd); }
  function step() {
    S.t++;
    S.cs.forEach((c) => {
      if (c.status === 'hold') { c.hold--; if (c.hold <= 0) { c.status = 'run'; c.from = c.i + 1; } if (c.i < N - 1) { c.i = Math.min(N - 1, c.i + 0); } }
      else if (c.i < N - 1) {
        c.i++; const h = rule(c.z, c.i, c.from); c.hits[c.i] = h;
        if (h.length && c.pend == null) { c.pend = c.i; c.pr = h; }
      }
    });
    // 멈춘 동안에도 시간은 흐른다: 멈춘 차트는 점을 찍지 않고 기다린다
    draw();
    if (S.cs.every((c) => c.i >= N - 1 && c.status === 'run') && S.t >= N - 1) finish();
  }
  function badNow() {
    let b = S.bad;
    S.cs.forEach((c) => { const p = c.plan; if (p && !p.done && c.i >= p.k && c.status === 'run') b += p.ty === 'out' ? 1 : c.i - p.k + 1; });
    return b;
  }
  function draw() {
    S.cs.forEach((c, q) => {
      const el = document.querySelector(`.sp-ch[data-q="${q}"]`); if (!el) return;
      el.querySelector('[data-svg]').innerHTML = svg(c, Math.max(0, c.i));
      const st = el.querySelector('[data-st]'); st.className = 'sp-st ' + c.status; st.textContent = c.status === 'hold' ? T('점검 중') : 'RUN';
      el.querySelector('[data-v]').textContent = c.i >= 0 ? (c.eq.cl + c.z[c.i] * c.eq.sg).toFixed(c.eq.d) + ' ' + c.eq.u : '';
      el.querySelector('[data-stop]').disabled = c.status === 'hold' || c.i < 2;
    });
    const pg = Math.min(N, Math.max(...S.cs.map((c) => c.i + 1)));
    document.getElementById('spT').textContent = pg + ' / ' + N; document.getElementById('spPg').style.width = (pg / N * 100) + '%';
    const bn = badNow(), b = document.getElementById('spB'); b.textContent = bn; b.className = bn > 3 ? 'bad' : '';
    document.getElementById('spS').textContent = S.log.length; document.getElementById('spF').textContent = S.falseStops;
  }
  function stop(q) {
    const c = S.cs[q]; if (!c || c.status === 'hold') return;
    const p = c.plan, i = c.i; let kind, loss = 0, msg;
    c.stops = c.stops || [];
    if (c.pend != null) {
      if (p && !p.done && i >= p.k) { kind = 'real'; loss = p.ty === 'out' ? 1 : i - p.k + 1; msg = '이상을 잡았어요. 점검해서 원인을 고쳤어요.'; }
      else { kind = 'chk'; msg = '규칙에 걸려서 멈췄어요. 점검해 보니 이상은 없었어요. 규칙을 따랐으니 괜찮아요.'; }
    } else if (p && !p.done && i >= p.k) { kind = 'early'; loss = p.ty === 'out' ? 1 : i - p.k + 1; S.early++; msg = '이번에는 이상이 있었지만 규칙이 걸리기 전이었어요. 근거 없이 멈추면 정상 공정도 자주 멈추게 돼요.'; }
    else { kind = 'false'; S.falseStops++; msg = '이상이 없었어요. 규칙에 걸리지 않은 점 하나가 튄 것만으로는 멈추지 않아요.'; }
    S.bad += loss; if (p && (kind === 'real' || kind === 'early')) { p.done = true; for (let j = i + 1; j < N; j++) c.add[j] = 0; c.z = c.base.map((v, j) => v + c.add[j]); }
    c.stops.push({ i, kind, loss }); S.log.push({ q, i, kind }); c.pend = null; c.status = 'hold'; c.hold = 3;
    document.getElementById('spMsg').textContent = T(c.eq.n) + ': ' + T(msg); draw();
  }
  function finish() {
    J.clear(S.h);
    let missed = 0, bad = S.bad;
    const rows = S.cs.map((c) => {
      const p = c.plan, stp = (c.stops || []).filter((x) => x.kind === 'real' || x.kind === 'early')[0];
      let cls = 'g', tx = '';
      if (!p) { const f = (c.stops || []).filter((x) => x.kind === 'false').length; cls = f ? 'x' : 'g'; tx = f ? `${e('이상이 없는 차트였는데 ' + f + '번 멈췄어요.')}` : e('이상이 없는 차트였고, 멈추지 않고 잘 지켜봤어요.'); }
      else {
        const k = p.k + 1, fr = c.fire + 1, rr = (c.fireR || []).map((x) => e(RN[x])).join(', ');
        tx = `${e(TY[p.ty])} · ${e('이상 시작')} ${e(k + '번째')} · ${e('규칙이 처음 걸림')} ${e(fr + '번째')} (${rr})`;
        if (stp) { tx += ` · ${e('멈춘 곳')} ${e((stp.i + 1) + '번째')} · ${e('나쁜 로트')} ${e(stp.loss + '개')}`; cls = stp.kind === 'real' ? (stp.loss <= 5 ? 'g' : 'l') : 'l'; if (stp.kind === 'early') tx += ' · ' + e('규칙이 걸리기 전에 멈춤'); }
        else { missed++; const l = p.ty === 'out' ? 1 : N - p.k; bad += l; tx += ` · ${e('멈추지 못했어요')} · ${e('나쁜 로트')} ${e(l + '개')}`; cls = 'x'; }
      }
      return `<div class="sp-rr ${cls}"><b>${esc(c.eq.n)} · ${e(c.eq.p)}</b>${tx}<div class="jx-stage" style="margin-top:.5rem">${svg(c, N - 1, true)}</div></div>`;
    }).join('');
    let pct = Math.max(0, 100 - bad * 2 - S.falseStops * 10 - S.early * 3 - missed * 15); if (S.hintUsed && S.dk !== 'easy') pct = Math.round(pct * .8);
    const pr = J.load('spc'), sc = Object.assign({}, pr.sc); sc[S.dk] = Math.max(sc[S.dk] || 0, pct);
    J.save('spc', { sc, best: Math.max(...Object.values(sc)), unit: '점' });
    root.innerHTML = J.head('현장 직무', 'SPC 관리도 운영실 · ' + T('복기'), `<button class="jx-btn sm" id="spMenu">${e('난이도 선택')}</button>`) +
      `<div class="jx-card"><div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">${J.score(pct, '점')}<p class="jx-note" style="margin:0;flex:1;min-width:12rem">${e('나쁜 상태로 돈 로트')} ${e(bad + '개')} · ${e('헛멈춤')} ${e(S.falseStops + '번')} · ${e('놓친 이상')} ${e(missed + '개')}${S.hintUsed && S.dk !== 'easy' ? '<br>' + e('규칙 표시를 켠 경우 점수가 줄어요.') : ''}</p></div>
      <div class="sp-rs">${rows}</div><div class="sp-rl"><b>${e('복기 포인트')}</b><br>${e('점 하나가 2σ를 넘어도 규칙에 걸리지 않으면 멈추지 않아요. 반대로 3σ 안쪽이어도 한쪽으로 계속 쏠리면 규칙 4나 5가 걸려요.')}</div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="jx-btn pri" id="spAgain">${e('같은 난이도로 다시')}</button><button class="jx-btn" id="spMenu2">${e('난이도 선택')}</button></div></div>`;
    document.getElementById('spMenu').onclick = menu; document.getElementById('spMenu2').onclick = menu; const dk = S.dk; document.getElementById('spAgain').onclick = () => play(dk);
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
.wv-n:hover{background:rgba(255,255,255,.05)}.wv-n.on{background:rgba(96,165,250,.16)}.wv-n.gh{color:#fbbf24;font-style:italic}.wv-n em{font-style:normal;color:#7dd3fc;font-size:.68rem;max-width:56px;overflow:hidden;text-overflow:ellipsis}
.wv-ax{height:24px;border-bottom:1px solid var(--jx-ln);font-size:.64rem;color:var(--jx-mu);padding:.4rem .5rem 0}
.wv-sc{flex:1;min-width:0;overflow-x:auto;touch-action:pan-x pan-y}.wv-sc svg{display:block;cursor:crosshair}
.wv-rd{display:flex;gap:.9rem;flex-wrap:wrap;padding:.45rem .7rem;font-size:.74rem;border-top:1px solid var(--jx-ln);background:var(--jx-p1);color:var(--jx-mu)}.wv-rd b{color:var(--jx-tx)}
.wv-cd{margin-top:.8rem;border-radius:.9rem;background:#0b1220;border:1px solid var(--jx-ln);overflow:hidden}.wv-cd h4{margin:0;padding:.35rem .7rem;font-size:.68rem;font-weight:800;color:#94a3b8;background:#16223d;letter-spacing:.05em}
.wv-ln{display:flex;font-size:.76rem;line-height:1.65;color:#cbd5e1;white-space:pre;overflow-x:auto}.wv-ln i{flex:none;width:2.1rem;text-align:right;padding-right:.6rem;color:#475569;font-style:normal;user-select:none}.wv-ln.hl{background:rgba(96,165,250,.16)}.wv-ln.bg{background:rgba(239,68,68,.22)}.wv-ln.fx{background:rgba(16,185,129,.2)}
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
    let h = J.head('설계 직무', '파형 디버거') + `<p class="jx-note">${e('시뮬레이션이 실패했다는 알림을 받았어요. 파형 뷰어에서 신호를 읽고, 커서와 마커로 시간을 재면서 원인이 시작된 사이클을 찾아요. 눈에 보이는 실패 지점보다 원인은 앞에 있어요. 찾은 뒤에는 왜 그랬는지, 어떻게 고칠지를 골라요.')}</p><div class="jx-menu">`;
    CASES.forEach((c, i) => { h += `<button class="jx-card jx-pick" data-i="${i}"><em>${e(c.k)}</em><b>${e(c.t)}</b><span>${e(c.brief)}</span><span class="jx-st">${sc[c.id] != null ? J.grade(sc[c.id]) + ' · ' + sc[c.id] + '%' : e('아직 안 해 봤어요')}</span></button>`; });
    root.innerHTML = h + '</div>';
    root.querySelectorAll('.jx-pick').forEach((b) => b.addEventListener('click', () => play(+b.dataset.i)));
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
    for (let k = 0; k < 16; k++) svg += `<rect x="${k * 2 * tw}" y="0" width="${2 * tw}" height="${H}" fill="${k % 2 ? 'rgba(255,255,255,.025)' : 'transparent'}"/>`;
    if (W.rev) svg += `<rect x="${c.bug * 2 * tw}" y="0" width="${2 * tw}" height="${H}" fill="#ef4444" fill-opacity=".2"/>`;
    ['A', 'B'].forEach((m) => { if (W[m] != null) svg += `<rect x="${W[m] * 2 * tw}" y="0" width="${2 * tw}" height="${H}" fill="${m === 'A' ? '#fbbf24' : '#a78bfa'}" fill-opacity=".22"/>`; });
    rows.forEach((r, ri) => {
      const y0 = ri * RH, s = r.s, v = r.g ? s.gh : s.v, col = r.g ? '#fbbf24' : s.k === 'clk' ? '#94a3b8' : s.k === 'bit' ? '#34d399' : '#38bdf8';
      svg += `<path d="M0 ${y0 + RH}H${Wd}" stroke="rgba(255,255,255,.07)"/>`;
      if (s.k === 'clk' || s.k === 'bit') {
        let d = '', prev = null;
        for (let t = 0; t < T32; t++) { const hi = v[t] === '1' ? y0 + 7 : y0 + 23; if (prev === null) d += `M${t * tw} ${hi}`; else if (prev !== hi) d += `L${t * tw} ${prev}L${t * tw} ${hi}`; prev = hi; d += `L${(t + 1) * tw} ${hi}`; }
        svg += `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.7" ${r.g ? 'stroke-dasharray="4 3"' : ''}/>`;
      } else {
        let t = 0;
        while (t < T32) {
          let u = t; while (u + 1 < T32 && v[u + 1] === v[t]) u++;
          const x1 = t * tw, x2 = (u + 1) * tw, bad = v[t] === 'x', s2 = 3;
          svg += `<path d="M${x1 + s2} ${y0 + 6}H${x2 - s2}L${x2} ${y0 + 15}L${x2 - s2} ${y0 + 24}H${x1 + s2}L${x1} ${y0 + 15}Z" fill="${bad ? '#ef4444' : col}" fill-opacity="${bad ? .4 : .13}" stroke="${bad ? '#f87171' : col}" stroke-width="1.4" ${r.g ? 'stroke-dasharray="4 3"' : ''}/>`;
          if ((x2 - x1) >= 18) svg += `<text x="${(x1 + x2) / 2}" y="${y0 + 19}" font-size="10.5" text-anchor="middle" fill="${bad ? '#fecaca' : '#e2e8f0'}" font-family="ui-monospace,monospace">${esc(hexv(v[t]))}</text>`;
          t = u + 1;
        }
      }
    });
    // 실패 깃발
    svg += `<path d="M${c.fail * 2 * tw + tw} 0V${H}" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="3 3"/>`;
    if (W.cur != null) svg += `<path d="M${W.cur * tw + tw / 2} 0V${H}" stroke="#fff" stroke-opacity=".55"/>`;
    svg += '</svg>';
    let nm = `<div class="wv-ax">${e('사이클')}</div>`;
    rows.forEach((r) => { nm += `<div class="wv-n${r.g ? ' gh' : ''}${W.link && W.link === r.s.n && !r.g ? ' on' : ''}" data-n="${esc(r.s.n)}"><span class="jx-mono">${esc(r.s.n)}${r.g ? ' ' + e('(기대)') : ''}</span><em class="jx-mono" data-v="${esc(r.s.n)}${r.g ? '~' : ''}"></em></div>`; });
    let ax = '<svg width="' + Wd + '" height="24" style="display:block;border-bottom:1px solid rgba(255,255,255,.1)">';
    for (let k = 0; k < 16; k++) ax += `<text x="${k * 2 * tw + tw}" y="16" font-size="10" fill="${k === c.fail ? '#f87171' : '#94a3b8'}" text-anchor="middle" font-weight="${k === c.fail ? 800 : 500}">${k}</text>`;
    ax += `<text x="${c.fail * 2 * tw + tw}" y="9" font-size="8" fill="#f87171" text-anchor="middle" font-weight="800">${e('실패')}</text></svg>`;
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
    const sv = document.getElementById('wvSvg'); if (sv && t != null) { const l = document.createElementNS('http://www.w3.org/2000/svg', 'path'); l.setAttribute('class', 'wv-cur'); l.setAttribute('d', `M${t * W.tw + W.tw / 2} 0V${sv.getAttribute('height')}`); l.setAttribute('stroke', 'rgba(255,255,255,.55)'); sv.appendChild(l); }
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
