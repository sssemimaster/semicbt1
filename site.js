    function toggleTheme() { document.documentElement.classList.toggle('dark'); localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light'); document.getElementById('themeToggleBtn').innerText = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';  if (currentViewId === 'view-lobby') renderHome(); }
    window.addEventListener('DOMContentLoaded', () => { document.getElementById('themeToggleBtn').innerText = document.documentElement.classList.contains('dark') ? '☀️' : '🌙'; });
    function toggleSidebar() { document.getElementById('sidebar').classList.toggle('-translate-x-full'); document.getElementById('sidebarOverlay').classList.toggle('hidden'); }

    // 수식 렌더링
    let mathTimer = 0;
    function applyMathRendering() {
      clearTimeout(mathTimer);
      mathTimer = setTimeout(() => {
        if (typeof renderMathInElement !== 'function') return;
        const opt = { delimiters: [ {left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false} ], throwOnError: false };
        // 숨겨진 화면은 건너뛰고, '$'가 없는 화면은 훑지도 않는다.
        document.querySelectorAll('[id^="view-"]:not(.hidden)').forEach(el => { if (el.textContent.indexOf('$') !== -1) renderMathInElement(el, opt); });
      }, 50);
    }

    const SUPABASE_URL = "https://hyqsrajudsymexxuekfb.supabase.co"; 
    const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cXNyYWp1ZHN5bWV4eHVla2ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxMzA0MDEsImV4cCI6MjEwOTcwNjQwMX0.6OPx9ClxjCnIfGcCFwYhgbWICcpgBI1cvx1QcAyVvIY"; 
    // 서버(Supabase) 연결은 오류 제보를 보낼 때만 필요해서, 그때 불러온다. (처음 화면을 여는 동안 스크립트를 기다리지 않도록)
    let supabaseClient = null, supabaseLoading = null;
    function ensureSupabase() {
      if (supabaseClient) return Promise.resolve(supabaseClient);
      if (!supabaseLoading) supabaseLoading = new Promise((resolve) => {
        const make = () => { try { supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch (e) {} resolve(supabaseClient); };
        if (window.supabase) return make();
        const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0'; sc.onload = make; sc.onerror = () => { supabaseLoading = null; resolve(null); };
        document.head.appendChild(sc);
      });
      return supabaseLoading;
    }

    let allQuizData = []; let allInterviewData = []; let allTheories = []; let filteredSession = [];   
    let currentIndex = 0; let correctCount = 0; let currentMode = 'quiz'; let currentKeyword = null;
    let starredIds = JSON.parse(localStorage.getItem('semiCbtStarred')) || [];
    // 📒 오답 노트: 틀린 문제는 자동 저장 { 문제ID: {wrong, right, last, memo} } — ★ 즐겨찾기(starredIds)와 별개
    let wrongNotes = {}; try { wrongNotes = JSON.parse(localStorage.getItem('semiCbtWrong')) || {}; } catch (e) { wrongNotes = {}; }
    let sessionLog = []; let noteTab = 'wrong';
    // 📊 통계: 문제를 풀 때마다 과목/주제별 맞힌 수·푼 수를 누적 { cats:{과목:{r,t}}, topics:{'과목||주제':{r,t}}, total:{r,t} }
    let stats = { cats: {}, topics: {}, total: { r: 0, t: 0 } };
    try { const sv = JSON.parse(localStorage.getItem('semiCbtStats')); if (sv && sv.cats) stats = sv; } catch (e) {}
    function recordStat(q, ok) {
      const bump = (o, k) => { const x = o[k] || (o[k] = { r: 0, t: 0 }); x.t++; if (ok) x.r++; };
      const tk = (q.category || '기타') + '||' + (q.topic || '기타');
      bump(stats.cats, q.category || '기타'); bump(stats.topics, tk); stats.total.t++; if (ok) stats.total.r++;
      stats.topics[tk].h = ((stats.topics[tk].h || '') + (ok ? '1' : '0')).slice(-6);   // 최근 6번의 결과 (1=정답, 0=오답)
      try { localStorage.setItem('semiCbtStats', JSON.stringify(stats)); } catch (e) {}
    }
    function saveWrong() { try { localStorage.setItem('semiCbtWrong', JSON.stringify(wrongNotes)); } catch (e) {} }
    // 이론 글(마크다운 변환 결과)은 화면에 넣기 전에 걸러서, 글에 섞인 스크립트·이벤트 속성이 실행되지 않게 한다.
    const safeHtml = (h) => (window.DOMPurify ? DOMPurify.sanitize(String(h), { ADD_ATTR: ['data-dg', 'data-cap'] }) : String(h).replace(/<[^>]*>/g, ''));
    const escH = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    
    let pmGateId = null, pmGateOpener = null;   // 해금 팝업: 이번 방문에서 이미 띄운 콘텐츠 / 닫을 때 돌아갈 곳
    const ADV_CAT = "심화 이론";   // 장비 사용 가이드 등 실무 심화 글. 다른 분류와 다른 테마(.adv-*)로 보인다
    const FIXED_CATEGORIES = ["반도체 기초 이론", "반도체 소자", "반도체 8대 공정", "차세대 첨단 기술", ADV_CAT, "기타"];
    // 📁 백과사전 폴더 구조 (문서가 없어도 항상 보임 / 새 이론은 category·subject 가 일치하는 폴더에 들어감)
    const CATEGORY_TREE = {
      "반도체 기초 이론": ["입문 · 한눈에 보기", "반도체 물리"],
      "반도체 소자": ["트랜지스터 소자", "메모리 반도체"],
      "반도체 8대 공정": ["1. 웨이퍼 제조 공정", "2. 산화 공정 (Oxidation)", "3. 포토 공정 (Photo)", "4. 식각 공정 (Etching)", "5. 박막 증착 공정 (Deposition)", "6. 금속 배선 공정 (Metallization)", "7. EDS 공정 (Testing)", "8. 패키징 공정 (Packaging)"],
      "차세대 첨단 기술": ["차세대 소자 기술", "어드밴스드 패키징"],
      [ADV_CAT]: ["장비 사용"]
    };
    const FIXED_SUBJECTS = Object.values(CATEGORY_TREE).flat().concat(["일반"]);
    
    let currentViewId = 'view-lobby'; let learnState = { level: 'home', category: '', subject: '', theoryId: '' };
    let navLog = [], navIdx = 0, returnCtx = null;

    // 이론 페이지(theory/<id>/)도 이 앱 그대로(index.html 에 글을 미리 넣은 것)라서, 데이터·링크는 ROOT 기준으로 찾는다.
    // 사이트 맨 위 주소(예: /저장소이름/)를 주소창에서 계산한다. theory/<id>/ 페이지는 DEPTH=2, theory/ 목록은 DEPTH=1.
    // 주소 끝의 슬래시나 index.html 유무, 하위 경로 배포와 상관없이 항상 같은 곳의 data/ 를 찾는다.
    const ROOT = (() => {
      try {
        const parts = location.pathname.replace(/index\.html$/, '').split('/').filter(Boolean), d = window.DEPTH || 0;
        const keep = d ? parts.slice(0, Math.max(0, parts.length - d)) : parts;
        return '/' + (keep.length ? keep.join('/') + '/' : '');
      } catch (e) { return './'; }
    })();
    const APP_BASE = ROOT;
    // 📲 앱처럼 설치(PWA): 서비스 워커로 한 번 열어 본 화면과 문제 데이터를 저장해 두어 오프라인에서도 열린다.
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      window.addEventListener('load', () => { navigator.serviceWorker.register(ROOT + 'sw.js').catch(() => {}); });
    }
    let installEvt = null;
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; const b = document.getElementById('pwaInstall'); if (b) b.classList.remove('hidden'); });
    window.addEventListener('appinstalled', () => { installEvt = null; const b = document.getElementById('pwaInstall'); if (b) b.classList.add('hidden'); });
    function installApp() { if (!installEvt) return; installEvt.prompt(); installEvt.userChoice.finally(() => { installEvt = null; const b = document.getElementById('pwaInstall'); if (b) b.classList.add('hidden'); }); }
    let theoryPages = {};   // 이론 id -> 정적 페이지 주소 조각 (data/theory_pages.json). 이론을 읽는 동안 주소창이 그 이론의 고유 주소가 된다.
    function urlForState() {
      try {
        const slug = currentViewId === 'view-learning' && learnState.level === 'detail' && learnState.theoryId ? theoryPages[learnState.theoryId] : '';
        return slug ? `${APP_BASE}theory/${slug}/` : APP_BASE;
      } catch (e) { return location.pathname; }
    }

    // ===== 💼 직무 지도 =====
    // 건물 모양과 회사 유형은 여기(코드)에 있고, 직무 내용은 data/careers.json (검수소에서 등재한 것만) 에서 읽는다.
    const CAREER_G = 440;
    const CAREER_BLD = [
      { id: 'design', name: '설계센터', x: 40, w: 160, h: 320, z: 1, tag: 'top', no: 1, win: 'glass', one: '칩의 설계도를 그리는 곳이에요. 무엇을 할지 정하고, 회로로 옮기고, 맞게 동작하는지 확인해요.',
        parts: [{ dx: 78, dy: -42, w: 4, h: 42 }, { dx: 60, dy: -14, w: 40, h: 14 }] },
      { id: 'rnd', name: 'R&D센터', x: 215, w: 170, h: 225, z: 1, tag: 'top', win: 'grid', one: '새로운 공정과 소자를 미리 만들어 보고, 설계도를 노광용 원판(포토마스크)으로 만드는 곳이에요. 여기서 완성된 공정과 마스크가 FAB로 넘어가요.',
        parts: [{ dx: 35, dy: -26, w: 100, h: 26 }] },
      { id: 'fab', name: 'FAB (웨이퍼 제조)', short: 'FAB · 웨이퍼 제조', x: 215, w: 360, h: 125, z: 2, tag: 'bottom', no: 2, win: 'plain', one: '웨이퍼 위에 회로를 실제로 만드는 클린룸이에요. 공정 구역이 순서대로 이어지고, 웨이퍼는 이 안을 수십 번 돌며 층을 쌓아요.',
        parts: [{ dx: 0, dy: -36, w: 360, h: 36, k: 'saw' }, { dx: 40, dy: -92, w: 16, h: 56 }, { dx: 100, dy: -92, w: 16, h: 56 }, { dx: 160, dy: -92, w: 16, h: 56 }],
        bays: ['포토', '식각', '박막(증착)', '확산·이온주입', 'CMP·세정', '계측·검사'] },
      { id: 'hq', name: '본사 사무동', x: 540, w: 200, h: 345, z: 0, tag: 'top', win: 'grid', one: '팔고, 기획하고, 지키고, 운영하는 조직이 모여 있어요.', parts: [] },
      { id: 'sub', name: '서브팹·유틸리티', short: '서브팹 · 유틸리티', x: 590, w: 130, h: 85, z: 2, tag: 'bottom', win: 'plain', one: '팹이 숨 쉬게 하는 곳이에요. 공기, 초순수, 전력, 가스와 화학물질을 만들고 나눠 줘요.',
        parts: [{ dx: 14, dy: -34, w: 38, h: 34, k: 'tower' }, { dx: 70, dy: -34, w: 38, h: 34, k: 'tower' }] },
      { id: 'pkg', name: '후공정동', short: '후공정 · 패키징·테스트', x: 735, w: 150, h: 125, z: 2, tag: 'bottom', no: 3, win: 'band', one: '웨이퍼를 잘라 칩으로 만들고, 포장하고, 제대로 동작하는지 걸러 내요.', parts: [] },
      { id: 'supply', name: '장비·소재 구역', short: '장비 · 소재 구역', x: 900, w: 165, h: 95, z: 2, tag: 'bottom', win: 'plain', one: 'FAB 안으로 들어가는 장비와 재료를 만드는 회사들의 영역이에요. 장비는 FAB에 들어가 설치되고 정비돼요.',
        parts: [{ dx: 125, dy: -130, w: 6, h: 130 }, { dx: 57, dy: -130, w: 80, h: 6 }, { dx: 63, dy: -124, w: 2, h: 40 }] },
      { id: 'it', name: 'IT·데이터센터', x: 895, w: 150, h: 240, z: 1, tag: 'top', win: 'led', one: '팹의 두뇌예요. 설비를 자동으로 돌리고, 쏟아지는 데이터를 분석하고, 시스템을 지켜요.', parts: [] },
      { id: 'lab', name: '분석·품질 랩', x: 1080, w: 160, h: 300, z: 1, tag: 'top', win: 'grid', one: '왜 불량이 났는지 밝히고, 오래 써도 괜찮은지 검증하고, 품질 기준을 지켜요.',
        parts: [{ dx: 25, dy: -34, w: 110, h: 34, k: 'dome' }] }
    ];
    // 회사 유형 + 국내 대표 회사 예시(ex). 예시는 일부일 뿐이고 순서는 순위와 무관하다. 2026년 11월 기준으로 정리.
    const CAREER_EX_ASOF = '2026년 11월';
    const CAREER_TYPES = [
      { id: 'all', label: '전체', blurb: '칩 하나가 태어나는 단지 전체예요. 회사 유형을 고르면 그 유형에 있는 건물에 파란 테두리가 생겨요. 어느 유형이든 직무 이름은 같아요.', has: null },
      { id: 'fabless', label: '팹리스', blurb: '설계만 하고 제조와 후공정은 맡겨요. 그래서 설계 중심의 건물에만 파란 테두리가 생겨요.', has: ['design', 'lab', 'it', 'hq'],
        ex: ['LX세미콘', '텔레칩스', '넥스트칩', '파두', '리벨리온', '퓨리오사AI'],
        ex_en: ['NVIDIA', 'Qualcomm', 'Broadcom', 'AMD', 'MediaTek', 'Marvell'] },
      { id: 'foundry', label: '파운드리', blurb: '남이 설계한 칩을 위탁 생산해요. 설계센터는 빠지고 공정 개발과 FAB가 중심이에요.', has: ['rnd', 'fab', 'sub', 'lab', 'it', 'hq'],
        ex: ['삼성전자 파운드리사업부', 'DB하이텍', 'SK키파운드리'], note: '삼성전자는 메모리와 파운드리를 함께 운영해요.',
        ex_en: ['TSMC', 'Samsung Foundry', 'GlobalFoundries', 'UMC', 'Intel Foundry', 'SMIC'], note_en: 'Samsung runs memory and foundry businesses side by side, and Intel designs its own chips while also offering foundry services.' },
      { id: 'idm', label: '메모리·IDM', blurb: '설계부터 제조, 후공정까지 한 회사가 해요. 이 유형에서만 ①→②→③ 줄무늬가 움직여요. 장비·소재 구역만 외부 회사의 영역이에요.', has: ['design', 'rnd', 'fab', 'sub', 'pkg', 'lab', 'it', 'hq'],
        ex: ['삼성전자 DS부문', 'SK하이닉스'],
        ex_en: ['Samsung Electronics', 'SK hynix', 'Micron', 'Intel', 'Texas Instruments', 'Infineon'] },
      { id: 'equip', label: '장비사', blurb: '제조 장비를 만들어 팔고, 고객의 FAB에 들어가 설치와 정비를 해요.', has: ['supply', 'fab'],
        ex: ['세메스', '원익IPS', '주성엔지니어링', '유진테크', '테스', '피에스케이', '한미반도체', '이오테크닉스'],
        ex_en: ['ASML', 'Applied Materials', 'Lam Research', 'Tokyo Electron', 'KLA', 'Advantest'] },
      { id: 'material', label: '소재사', blurb: '웨이퍼, 가스, 화학물질 같은 재료를 만들어 FAB와 서브팹에 공급해요.', has: ['supply', 'sub'],
        ex: ['SK실트론', '솔브레인', '동진쎄미켐', '한솔케미칼', '원익머트리얼즈', '디엔에프'],
        ex_en: ['Shin-Etsu', 'SUMCO', 'JSR', 'Entegris', 'Merck (EMD Electronics)', 'Linde'] },
      { id: 'osat', label: 'OSAT', blurb: '칩의 조립(패키징)과 테스트를 맡는 회사예요.', has: ['pkg', 'lab', 'it', 'hq'],
        ex: ['하나마이크론', 'SFA반도체', '두산테스나', '네패스', '앰코테크놀로지코리아'],
        ex_en: ['ASE', 'Amkor', 'JCET', 'Powertech Technology'] }
    ];
    const careerType = () => CAREER_TYPES.find(t => t.id === careerState.type) || CAREER_TYPES[0];
    const careerInType = (id) => { const ty = careerType(); return !!ty.has && ty.has.indexOf(id) >= 0; };
    let careerState = { sel: 'fab', hover: null, type: 'all', job: null };
    let careersData = null, careersLoad = null, careersFailed = false, careerBuilt = false;

    // 직무 데이터는 이 화면(또는 이론 아래 '쓰이는 직무')을 처음 열 때 한 번만 받는다.
    function loadCareers() {
      if (careersLoad) return careersLoad;
      careersFailed = false;
      const enC = window.LANG === 'en' ? fetch(`${ROOT}data/en/careers.json`, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null);
      careersLoad = Promise.all([fetch(`${ROOT}data/careers.json`, { cache: 'no-cache' })
        .then(r => { if (r.status === 404) return []; if (!r.ok) throw new Error('http ' + r.status); return r.json(); }), enC])
        .then(([a, en]) => {
          if (en && Array.isArray(a)) a = window.i18nOverlay(a, en, 'careers');
          careersData = (Array.isArray(a) ? a : []).filter(j => j && j.id && j.building && j.name)
            .map((j, i) => ({ ...j, _i: i })).sort((x, y) => ((x.order == null ? 1e9 : x.order) - (y.order == null ? 1e9 : y.order)) || (x._i - y._i));
          return careersData;
        })
        .catch(() => { careersFailed = true; careersLoad = null; careersData = careersData || []; return careersData; });
      return careersLoad;
    }
    const careerJobs = (bid) => (careersData || []).filter(j => j.building === bid);
    const careerBld = (id) => CAREER_BLD.find(b => b.id === id) || CAREER_BLD.find(b => b.id === 'fab');
    const jsq = (s) => escH(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));

    // '알아야 할 지식'의 theory_hint 를 실제 이론(또는 폴더)로 바꾼다. 못 찾으면 null (글자만 보여 준다).
    function careerTheoryRef(hint) {
      const h = String(hint || '').trim(); if (h.length < 2) return null;
      let t = allTheories.find(x => x.title === h) || allTheories.find(x => String(x.title).includes(h)) || allTheories.find(x => String(x.title).length >= 3 && h.includes(x.title));
      if (t) return { kind: 'theory', id: t.id };
      t = allTheories.find(x => x.subject === h || String(x.subject).includes(h));
      if (t) return { kind: 'subject', category: t.category, subject: t.subject };
      if (allTheories.some(x => x.category === h)) return { kind: 'category', category: h };
      return null;
    }
    function openCareerRef(kind, a, b) {
      if (kind === 'theory') return openTheory(a);
      returnCtx = { view: 'view-careers', label: RETURN_LABEL['view-careers'] };
      if (kind === 'subject') navTo('view-learning', { level: 'subject', category: a, subject: b });
      else navTo('view-learning', { level: 'category', category: a });
    }
    function openCareerJob(id) {
      loadCareers().then(() => {
        const j = (careersData || []).find(x => x.id === id); if (!j) return;
        careerState = { ...careerState, sel: j.building, job: j.id, type: 'all', hover: null };
        navTo('view-careers');
      });
    }

    function enterCareers() {
      if (!careerBuilt) buildCareerStage();
      fitCareerStage(); paintCareerStage(); renderCareerTypes(); renderCareerPanels(); cmEnter();
      loadCareers().then(() => { if (currentViewId === 'view-careers') { renderCareerPanels(); renderCareerChips(); } });
    }
    let careerEls = null, careerLastW = 0;
    function buildCareerStage() {
      const G = CAREER_G, st = document.getElementById('cStage'); if (!st) return;
      let h = '';
      CAREER_BLD.forEach(b => {
        // 같은 건물을 두 번 그린다: 꺼진 모습(base) + 그 위에 겹친 켜진 모습(on). 켜고 끌 때는 on 의 투명도만 바뀐다.
        const lay = (cls) => `<div class="cs-lay ${cls}"><div class="cs-p cs-body cs-w-${b.win}" style="top:${G - b.h}px;left:0;width:${b.w}px;height:${b.h}px"></div>`
          + (b.parts || []).map(p => `<div class="cs-p cs-part ${p.k ? 'cs-' + p.k : ''}" style="left:${p.dx}px;top:${G - b.h + p.dy}px;width:${p.w}px;height:${p.h}px"></div>`).join('') + '</div>';
        h += `<div class="cs-b" data-b="${b.id}" style="left:${b.x}px;width:${b.w}px;z-index:${b.z + 1}">${lay('base')}${lay('on')}<div class="cs-lay mem"><div class="cs-ring" style="top:${G - b.h}px;left:0;width:${b.w}px;height:${b.h}px"></div></div></div>`;
      });
      const cx = (id) => { const b = CAREER_BLD.find(x => x.id === id); return b.x + b.w / 2; };
      h += '<div class="cs-ground"></div>';
      h += `<div class="cs-seg" data-from="design" data-to="fab" style="left:${cx('design')}px;width:${cx('fab') - cx('design')}px"><i></i></div>`;
      h += `<div class="cs-seg" data-from="fab" data-to="pkg" style="left:${cx('fab')}px;width:${cx('pkg') - cx('fab')}px"><i></i></div>`;
      CAREER_BLD.filter(b => b.no).forEach(b => { h += `<div class="cs-node" data-b="${b.id}" style="left:${b.x + b.w / 2}px" title="${b.no}단계">${b.no}</div>`; });
      CAREER_BLD.forEach(b => {
        const up = b.tag === 'top', partH = (b.parts || []).reduce((m, p) => Math.max(m, -p.dy), 0);
        const top = up ? (CAREER_G - b.h - partH - 30) : 462, w = up ? Math.max(b.w, 100) : b.w + 20, left = up ? b.x + (b.w - w) / 2 : b.x - 10;
        h += `<button type="button" class="cs-lb ${up ? 'top' : ''}" data-b="${b.id}" style="left:${left}px;top:${top}px;width:${w}px">${escH(b.short || b.name)}</button>`;
      });
      st.innerHTML = h;
      // 자주 쓰는 요소는 한 번만 찾아 둔다 (마우스를 올릴 때마다 문서를 뒤지지 않음)
      careerEls = { all: Array.from(st.querySelectorAll('.cs-b,.cs-lb')), bs: Array.from(st.querySelectorAll('.cs-b')), segs: Array.from(st.querySelectorAll('.cs-seg')) };
      const setHover = (id) => { if (careerState.hover !== id) { careerState.hover = id; paintCareerStage(); } };
      const bid = (e) => { const n = e.target.closest && e.target.closest('[data-b]'); return n ? n.dataset.b : null; };
      st.addEventListener('mouseover', e => setHover(bid(e)));
      st.addEventListener('mouseleave', () => setHover(null));
      st.addEventListener('focusin', e => setHover(bid(e)));
      st.addEventListener('focusout', () => setHover(null));
      st.addEventListener('click', e => { const id = bid(e); if (id) selectCareerBuilding(id); });
      if (window.ResizeObserver) new ResizeObserver(() => fitCareerStage()).observe(document.getElementById('cFrame'));
      else window.addEventListener('resize', fitCareerStage);
      careerBuilt = true;
    }
    function fitCareerStage() {
      const f = document.getElementById('cFrame'), s = document.getElementById('cStage'); if (!f || !s || !f.clientWidth) return;
      if (f.clientWidth === careerLastW) return; careerLastW = f.clientWidth;   // 폭이 그대로면 다시 계산하지 않음
      const sc = Math.min(1, f.clientWidth / 1280);
      s.style.transform = `scale(${sc})`; f.style.height = Math.round(500 * sc) + 'px'; f.style.setProperty('--sc', sc.toFixed(3)); f.classList.toggle('cs-nolabel', sc < 0.62);
    }
    // 표시 규칙 (두 가지를 서로 다른 모양으로 보여 줘서 헷갈리지 않게 한다)
    //  · 노란 불(lit)  = '지금 보고 있는 건물'. 마우스를 올리면 그 건물, 아니면 고른 건물. 직무는 이 건물 것이 아래에 나온다.
    //  · 파란 테두리(mem) = '고른 회사 유형에 있는 건물'. 유형을 고르지 않으면 없음. 그 유형에 없는 건물은 흐려진다(dim).
    function careerLit(id) {
      const typed = careerType().has !== null, mem = typed && careerInType(id);
      const lit = careerState.hover ? id === careerState.hover : id === careerState.sel;
      return { lit, mem, dim: typed && !mem && !lit };
    }
    function paintCareerStage() {
      if (!careerEls) return;
      const L = {}; CAREER_BLD.forEach(b => { L[b.id] = careerLit(b.id); });
      careerEls.all.forEach(n => { const s = L[n.dataset.b]; n.classList.toggle('lit', s.lit); n.classList.toggle('mem', s.mem); n.classList.toggle('dim', s.dim); });
      careerEls.bs.forEach(n => n.classList.toggle('sel', n.dataset.b === careerState.sel));
      // ①→②→③ 줄무늬: 고른 회사 유형이 설계·FAB·후공정을 모두 갖고 있을 때만 움직인다 (건물을 누르는 것과는 무관)
      const journey = ['design', 'fab', 'pkg'].every(careerInType);
      careerEls.segs.forEach(g => g.classList.toggle('on', journey));
    }
    function renderCareerTypes() {
      const box = document.getElementById('cTypes'); if (!box) return;
      box.innerHTML = CAREER_TYPES.map(t => {
        const on = careerState.type === t.id;
        return `<button type="button" onclick="pickCareerType('${t.id}')" aria-pressed="${on}" class="px-4 py-2 rounded-full text-sm font-bold border-2 transition ${on ? 'bg-indigo-600 border-indigo-600 text-white shadow-md dark:bg-cyan-300 dark:border-cyan-300 dark:text-slate-900' : 'bg-slate-100 dark:bg-white/[0.07] border-slate-300 dark:border-white/25 text-slate-800 dark:text-slate-100 hover:border-indigo-500 dark:hover:border-cyan-300 hover:bg-white dark:hover:bg-white/10'}">${t.label}</button>`;
      }).join('');
      const ty = careerType();
      document.getElementById('cBlurb').textContent = ty.blurb;
      const ex = document.getElementById('cEx');
      if (ex) {
        const enX = window.LANG === 'en' && ty.ex_en, exList = enX ? ty.ex_en : ty.ex, exNote = enX ? ty.note_en : ty.note;
        ex.innerHTML = exList ? `<div class="flex flex-wrap items-center gap-1.5"><span class="text-[11px] font-bold text-slate-500 dark:text-slate-400 mr-1">${enX ? 'Examples' : '국내 예시'}</span>${exList.map(x => `<span class="text-xs font-semibold px-2.5 py-1 rounded-md border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-white/[0.06] text-slate-700 dark:text-slate-200">${escH(x)}</span>`).join('')}</div>
          <p class="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500 mt-2">${enX ? `These are just well-known examples, not a full list, and the order isn't a ranking. Each company's business scope differs.${exNote ? ' ' + escH(exNote) : ''} (as of November 2026)` : `대표적인 예시일 뿐 전체 목록이 아니고, 순서는 순위와 무관해요. 회사마다 사업 범위가 달라요.${exNote ? ' ' + escH(exNote) : ''} (${CAREER_EX_ASOF} 기준)`}</p>` : '';
        ex.classList.toggle('hidden', !ty.ex);
      }
      renderCareerChips();
    }
    function renderCareerChips() {
      const box = document.getElementById('cBldChips'); if (!box) return;
      const typed = careerType().has !== null;
      box.innerHTML = CAREER_BLD.map(b => {
        const on = careerState.sel === b.id, n = careersData ? careerJobs(b.id).length : null, mem = typed && careerInType(b.id);
        return `<button type="button" onclick="selectCareerBuilding('${b.id}', true)" aria-pressed="${on}" class="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition ${on ? 'bg-amber-400 border-amber-400 text-slate-900' : 'bg-slate-100 dark:bg-white/[0.07] border-slate-300 dark:border-white/25 text-slate-800 dark:text-slate-100 hover:border-amber-500'}">${escH(b.name)}${n ? ` <span class="opacity-70">${n}</span>` : ''}${mem ? ' <span class="inline-block w-2 h-2 rounded-full bg-indigo-600 dark:bg-cyan-300 align-middle" title="고른 회사 유형에 있는 건물"></span>' : ''}${cmBld(b.id) ? ' <span class="text-amber-500" title="내 전공에 잘 맞는 직무가 있는 건물">★</span>' : ''}</button>`;
      }).join('');
    }
    function pickCareerType(id) { careerState.type = id; careerState.hover = null; paintCareerStage(); renderCareerTypes(); renderCareerBuilding(); }
    function selectCareerBuilding(id, fromChip) {
      careerState.sel = id; careerState.job = null; careerState.hover = null;
      paintCareerStage(); renderCareerChips(); renderCareerPanels();
      if (window.innerWidth < 1024) { const n = document.getElementById('cBuilding'); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
    function selectCareerJob(id) {
      careerState.job = id; renderCareerPanels();
      if (window.innerWidth < 1024) { const n = document.getElementById('cDetail'); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }

    function renderCareerBuilding() {
      const b = careerBld(careerState.sel), ty = careerType(), typed = ty.has !== null;
      const owners = CAREER_TYPES.filter(t => t.has && t.has.indexOf(b.id) >= 0).map(t => `<span class="text-[11px] px-2.5 py-1 rounded-full border ${typed && t.id === ty.id ? 'bg-indigo-600 border-indigo-600 text-white font-bold dark:bg-cyan-300 dark:border-cyan-300 dark:text-slate-900' : 'border-slate-200 dark:border-white/15 text-slate-600 dark:text-slate-300'}">${t.label}</span>`).join('');
      const here = typed ? `<p class="text-xs font-semibold ${careerInType(b.id) ? 'text-indigo-700 dark:text-cyan-300' : 'text-slate-500 dark:text-slate-400'}">${careerInType(b.id) ? `✔ ${ty.label}에는 이 건물이 있어요` : `✕ ${ty.label}에는 이 건물이 없어요 (다른 회사의 일이에요)`}</p>` : '';
      document.getElementById('cBuilding').innerHTML = `
        <p class="eyebrow">${b.no ? `칩의 여정 ${b.no}단계` : '지원 조직'}</p>
        <h3 class="text-xl font-bold text-slate-900 dark:text-white">${escH(b.name)}</h3>
        <p class="text-sm leading-relaxed text-slate-600 dark:text-slate-300">${escH(b.one)}</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">이 건물이 있는 회사 유형</p>
        <div class="flex flex-wrap gap-1.5">${owners}</div>${here}
        ${b.bays ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">클린룸 안의 공정 구역</p><div class="flex flex-wrap gap-1.5">${b.bays.map(x => `<span class="text-[11px] px-2.5 py-1 rounded-md bg-amber-50 dark:bg-white/5 text-amber-800 dark:text-amber-200">${escH(x)}</span>`).join('')}</div>` : ''}`;
    }

    function renderCareerPanels() {
      const b = careerBld(careerState.sel), jobs = careerJobs(b.id), ready = careersData !== null;
      renderCareerBuilding();
      // 2) 직무 목록
      const jid = careerState.job && jobs.some(j => j.id === careerState.job) ? careerState.job : (jobs[0] && jobs[0].id);
      let jl;
      if (!ready) jl = '<p class="text-sm text-slate-400">불러오는 중…</p>';
      else if (careersFailed) jl = '<p class="text-sm text-rose-500">직무 정보를 불러오지 못했어요.</p><button type="button" onclick="retryCareers()" class="self-start text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-300 dark:border-white/20 text-slate-600 dark:text-slate-300">다시 시도</button>';
      else if (!jobs.length) jl = `<p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">${(careersData || []).length ? '이 건물의 직무는 아직 검수 중이에요.' : '직무 백과는 지금 준비 중이에요. 검수를 마친 직무부터 차례로 열려요.'}</p>`;
      else jl = jobs.map(j => `<button type="button" onclick="selectCareerJob('${jsq(j.id)}')" class="text-left flex flex-col gap-1 px-3.5 py-3 rounded-xl border transition ${j.id === jid ? 'border-indigo-500 bg-indigo-50 dark:bg-[#0f2233] dark:border-cyan-300/60' : 'border-slate-200 dark:border-white/10 hover:border-indigo-400'}"><span class="text-sm font-bold text-slate-900 dark:text-white">${escH(j.name)}${cmTag(j.id)}</span><span class="text-xs leading-snug text-slate-500 dark:text-slate-400">${escH(j.one)}</span></button>`).join('');
      document.getElementById('cJobs').innerHTML = `<p class="text-xs text-slate-500 dark:text-slate-400">여기서 일하는 직무${ready && jobs.length ? ` ${jobs.length}개` : ''}</p>${jl}`;
      // 3) 직무 상세
      const job = jobs.find(j => j.id === jid);
      document.getElementById('cDetail').innerHTML = job ? careerDetailHtml(job) : `<p class="p-6 text-sm text-slate-400 dark:text-slate-500">${ready && jobs.length ? '직무를 고르면 자세한 내용이 나와요.' : ''}</p>`;
    }
    // ===== 🎓 내 전공으로 직무 찾기 =====
    // 전공 → 직무 연결은 data/majors.json (core = 잘 맞는 직무, also = 넓게 보면 가능한 직무). 이 화면을 열 때 한 번만 받는다.
    let cmData = null, cmLoad = null, cmSel = null, cmGroup = null, cmWide = false, cmQ = '', cmBuilt = false;
    try { cmSel = localStorage.getItem('semiCbtMajor') || null; } catch (e) { }
    function cmFetch() {
      if (cmLoad) return cmLoad;
      const enM = window.LANG === 'en' ? fetch(`${ROOT}data/en/majors.json`, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null);
      cmLoad = Promise.all([fetch(`${ROOT}data/majors.json`, { cache: 'no-cache' })
        .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); }), enM])
        .then(([j, en]) => {
          if (en && j) { const gn = {}; (en.groups || []).forEach(g => { gn[g.id] = g.name; }); j.groups = (j.groups || []).map(g => gn[g.id] ? { ...g, name: gn[g.id] } : g); j.majors = window.i18nOverlay(j.majors || [], en.majors || [], 'majors'); }
          cmData = { groups: (j && j.groups) || [], majors: ((j && j.majors) || []).filter(m => m && m.id && m.name) }; if (!cmData.majors.some(m => m.id === cmSel)) cmSel = null; return cmData; })
        .catch(() => { cmLoad = null; return null; });
      return cmLoad;
    }
    const cmMajor = () => (cmData && cmSel && cmData.majors.find(m => m.id === cmSel)) || null;
    const cmTag = (jid) => { const m = cmMajor(); if (!m) return ''; return m.core.includes(jid) ? '<span class="cm-tag">★ 내 전공</span>' : m.also.includes(jid) ? '<span class="cm-tag lite">○ 가능</span>' : ''; };
    const cmBld = (bid) => { const m = cmMajor(); return !!(m && careersData && careersData.some(j => j.building === bid && m.core.includes(j.id))); };
    function cmEnter() { cmFetch().then(() => { if (currentViewId === 'view-careers') { cmRender(); renderCareerChips(); renderCareerPanels(); } }); cmRender(); }
    function cmToggle() {
      const box = document.getElementById('cmBox'), on = !box.classList.contains('open');
      box.classList.toggle('open', on); box.querySelector('.cm-bar').setAttribute('aria-expanded', on);
      if (on) { if (!cmBuilt) cmBuild(); cmRender(); }
    }
    function cmBuild() {
      document.getElementById('cmPanel').innerHTML = '<input id="cmSearch" class="cm-search" type="text" placeholder="전공 검색 (예: 전자, 신소재, 경영)" autocomplete="off" oninput="cmSearch(this.value)"><div id="cmTabs" class="cm-tabs"></div><div id="cmList" class="cm-majors"></div><div id="cmRes"></div>';
      cmBuilt = true;
    }
    function cmSearch(v) { cmQ = v.trim().toLowerCase(); cmRender(); }
    function cmPickGroup(g) { cmGroup = g; cmQ = ''; const i = document.getElementById('cmSearch'); if (i) i.value = ''; cmRender(); }
    function cmPick(id) {
      cmSel = cmSel === id ? null : id; cmWide = false;
      try { cmSel ? localStorage.setItem('semiCbtMajor', cmSel) : localStorage.removeItem('semiCbtMajor'); } catch (e) { }
      cmRender(); renderCareerChips(); renderCareerPanels();
    }
    function cmGo(jid) {
      const j = (careersData || []).find(x => x.id === jid); if (!j) return;
      careerState.sel = j.building; careerState.job = j.id; careerState.hover = null;
      paintCareerStage(); renderCareerChips(); renderCareerPanels();
      const n = document.getElementById('cDetail'); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function cmMore() { cmWide = !cmWide; cmRender(); }
    function cmRender() {
      const sub = document.getElementById('cmSub'); if (!sub) return;
      const m = cmMajor();
      sub.textContent = m ? `${m.name} · 잘 맞는 직무 ${m.core.length}개` : '전공을 고르면 잘 맞는 직무를 보여 줘요';
      if (!cmBuilt) return;
      const tabs = document.getElementById('cmTabs'), list = document.getElementById('cmList'), res = document.getElementById('cmRes');
      if (!cmData) { tabs.innerHTML = ''; list.innerHTML = '<p class="cm-empty">전공 목록을 불러오는 중이에요…</p>'; res.innerHTML = ''; return; }
      if (!cmGroup || !cmData.groups.some(g => g.id === cmGroup)) cmGroup = (m && m.g) || (cmData.groups[0] && cmData.groups[0].id);
      let shown;
      if (cmQ) { shown = cmData.majors.filter(x => (x.name + ' ' + (x.alias || []).join(' ')).toLowerCase().includes(cmQ)); tabs.innerHTML = ''; }
      else { shown = cmData.majors.filter(x => x.g === cmGroup); tabs.innerHTML = cmData.groups.map(g => `<button type="button" class="cm-tab${g.id === cmGroup ? ' on' : ''}" onclick="cmPickGroup('${g.id}')">${escH(g.icon || '')} ${escH(g.name)}</button>`).join(''); }
      list.innerHTML = shown.length ? shown.map(x => `<button type="button" class="cm-major${x.id === cmSel ? ' on' : ''}" onclick="cmPick('${x.id}')" aria-pressed="${x.id === cmSel}">${escH(x.name)}</button>`).join('') : '<p class="cm-empty">찾는 전공이 없어요. 가장 가까운 전공을 골라 보세요.</p>';
      if (!m) { res.innerHTML = ''; return; }
      const chip = (jid, core) => { const j = (careersData || []).find(x => x.id === jid); if (!j) return ''; return `<button type="button" class="cm-job${core ? ' core' : ''}" onclick="cmGo('${jsq(jid)}')"><b>${escH(j.name)}</b><span>${escH(careerBld(j.building).short || careerBld(j.building).name)}</span></button>`; };
      if (!careersData) { res.innerHTML = '<div class="cm-res"><p class="cm-empty">직무 정보를 불러오는 중이에요…</p></div>'; loadCareers().then(() => { if (currentViewId === 'view-careers') cmRender(); }); return; }
      res.innerHTML = `<div class="cm-res"><div class="cm-rh"><span>🎓 ${escH(m.name)}</span><button type="button" class="cm-x" onclick="cmPick('${m.id}')">선택 해제 ✕</button></div>
        <p class="cm-why">${escH(m.why)}</p>
        <div class="cm-lab">★ 잘 맞는 직무 ${m.core.length}개 · 눌러서 보기</div><div class="cm-jobs">${m.core.map(x => chip(x, true)).join('')}</div>
        ${m.also.length ? `<button type="button" class="cm-more" onclick="cmMore()">${cmWide ? '▲ 접기' : `▼ 넓게 보면 가능한 직무 ${m.also.length}개`}</button>${cmWide ? `<div class="cm-jobs">${m.also.map(x => chip(x, false)).join('')}</div>` : ''}` : ''}
        <p class="cm-foot">삼성전자 DS·SK하이닉스 신입 직무기술서와 장비·소재사 공고의 지원 전공을 참고해 정리했어요. 같은 직무도 회사와 해마다 달라질 수 있으니 실제 공고를 꼭 확인해 보세요.</p></div>`;
    }
    function retryCareers() { careersFailed = false; careersData = null; renderCareerPanels(); loadCareers().then(() => { if (currentViewId === 'view-careers') { renderCareerPanels(); renderCareerChips(); } }); }

    function careerDetailHtml(j) {
      const B = (emoji, badge, title) => `<div class="cj-h"><span class="custom-badge">${emoji} ${badge}</span>${title}</div>`;
      const body = 'text-[15px] leading-[1.8] text-slate-700 dark:text-slate-300';
      const bname = careerBld(j.building).name;
      const owners = CAREER_TYPES.filter(t => t.has && t.has.indexOf(j.building) >= 0).map(t => `<span class="bg-indigo-50 dark:bg-white/5 text-indigo-700 dark:text-cyan-300 text-[11px] px-2.5 py-1 rounded-full font-bold">#${t.label}</span>`).join('');
      const know = (j.know || []).map(k => {
        const lab = escH(k.label || k), ref = careerTheoryRef(k.theory_hint);
        if (!ref) return `<span class="text-[13px] px-3 py-1.5 rounded-full border border-slate-300 dark:border-white/20 text-slate-700 dark:text-slate-200">${lab}</span>`;
        const call = ref.kind === 'theory' ? `openCareerRef('theory','${jsq(ref.id)}')` : ref.kind === 'subject' ? `openCareerRef('subject','${jsq(ref.category)}','${jsq(ref.subject)}')` : `openCareerRef('category','${jsq(ref.category)}')`;
        return `<button type="button" onclick="${call}" class="text-[13px] px-3 py-1.5 rounded-full border border-indigo-300 dark:border-cyan-300/50 bg-indigo-50 dark:bg-white/5 text-indigo-700 dark:text-cyan-300 hover:border-indigo-500 dark:hover:border-cyan-300 font-semibold transition">📖 ${lab}</button>`;
      }).join('');
      let iv = '';
      for (const k of (j.know || [])) {
        const ref = careerTheoryRef(k.theory_hint); if (!ref || ref.kind !== 'theory') continue;
        const t = allTheories.find(x => x.id === ref.id), n = t ? Math.min(2, matchItems(allInterviewData, t.title).length) : 0;
        if (n) { iv = `<button type="button" onclick="startMiniInterview('${jsq(t.title)}')" class="w-full bg-white dark:bg-[#0a1020] border-2 border-indigo-600 dark:border-[#67e8f9] text-indigo-700 dark:text-[#67e8f9] hover:bg-indigo-50 dark:hover:bg-[#0f2233] font-bold text-sm py-4 rounded-xl transition flex items-center justify-center gap-2"><span class="text-lg">🗣️</span> 관련 면접 문항 풀어 보기 <span class="text-xs font-bold opacity-80">${escH(t.title)} · ${n}문항</span></button>`; break; }
      }
      const src = (j.sources || []).filter(s => s && /^https?:\/\//.test(s.url || '')).map(s => `<li><a href="${escH(s.url)}" target="_blank" rel="noopener noreferrer" class="underline hover:text-indigo-600 dark:hover:text-cyan-300">${escH(s.title || s.url)}</a></li>`).join('');
      return `
        <div class="p-5 md:p-8">
          <p class="eyebrow mb-2">${escH(bname)} <span class="opacity-50">/</span> 직무</p>
          <h3 class="page-title text-slate-900 dark:text-white mb-3">${escH(j.name)}</h3>
          <div class="flex flex-wrap gap-1.5 mb-6 pb-6 border-b border-slate-100 dark:border-white/10">${owners}</div>
          <div class="custom-highlight-box">${escH(j.one)}</div>
          ${B('🛠️', '업무', '하는 일')}
          <ol class="space-y-3 m-0 p-0 list-none">${(j.todo || []).map((x, i) => `<li class="flex gap-3 items-start"><span class="cj-n">${i + 1}</span><span class="${body}">${escH(x)}</span></li>`).join('')}</ol>
          ${B('🤝', '협업', '앞뒤 직무와 이어지는 방식')}
          <div class="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] px-4 py-3.5 ${body}">${escH(j.flow)}</div>
          ${B('📖', '지식', '알아야 할 지식')}
          <div class="flex flex-wrap gap-2">${know}</div>
          ${B('🗣️', '면접', '면접에서 묻는 것')}
          <div class="space-y-2.5">${(j.ask || []).map(x => `<div class="flex gap-3 rounded-r-xl border-l-4 border-indigo-400 dark:border-cyan-300 bg-indigo-50/70 dark:bg-white/[0.05] px-4 py-3"><span class="font-extrabold text-indigo-600 dark:text-cyan-300 text-sm leading-[1.8]">Q</span><span class="${body}">${escH(x)}</span></div>`).join('')}</div>
        </div>
        <div class="bg-slate-50 dark:bg-[#0f2233] p-5 md:p-6 border-t border-slate-200 dark:border-[#1e3a5f]">
          ${iv ? `<p class="text-xs font-bold text-slate-400 dark:text-slate-500 mb-3">📌 이어서 연습하기</p><div class="mb-4">${iv}</div>` : ''}
          ${src ? `<p class="text-[11px] font-bold text-slate-400 dark:text-slate-500 mb-1">참고한 자료</p><ul class="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5 mb-3">${src}</ul>` : ''}
          <p class="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">회사마다 직무 이름과 업무 범위는 다를 수 있어요. 여기 적힌 내용은 여러 곳에서 공통으로 쓰이는 일반적인 설명이에요.${j.asof ? ` (정리 기준일 ${escH(j.asof)})` : ''}</p>
        </div>`;
    }
    // 이론 화면 아래: 이 이론의 지식이 쓰이는 직무
    function appendTheoryCareers(t, card) {
      loadCareers().then(list => {
        if (!card.isConnected || learnState.theoryId !== t.id) return;
        const jobs = (list || []).filter(j => (j.know || []).some(k => { const r = careerTheoryRef(k.theory_hint); return r && r.kind === 'theory' && r.id === t.id; }));
        if (!jobs.length) return;
        const box = document.createElement('div');
        box.className = 'bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-white/10 p-5';
        box.innerHTML = `<p class="text-xs font-bold text-slate-400 dark:text-slate-500 mb-3">💼 이 지식이 쓰이는 직무</p><div class="flex flex-wrap gap-2">${jobs.map(j => `<button type="button" onclick="openCareerJob('${jsq(j.id)}')" class="text-xs font-semibold px-3 py-1.5 rounded-full border border-indigo-300 dark:border-cyan-300/50 text-indigo-700 dark:text-cyan-300 hover:bg-indigo-50 dark:hover:bg-white/5">${escH(j.name)} <span class="opacity-60">· ${escH(careerBld(j.building).name)}</span></button>`).join('')}</div>`;
        card.after(box);
      });
    }

    async function initApp() {
      try {
        const hubLink = document.getElementById('theoryHubLink'); if (hubLink) hubLink.href = ROOT + 'theory/';
        // 지연된 스크립트(marked 등)가 모두 준비된 뒤에 시작한다.
        if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
        // 파일이 바뀌었는지만 확인하고(바뀌지 않았으면 내려받지 않음), 바뀌었으면 새로 받는다.
        const getJson = (name) => fetch(`${ROOT}data/${name}`, { cache: 'no-cache' }).catch(() => null);
        const [qRes, iRes, tRes, pRes] = await Promise.all([getJson('questions.json'), getJson('interviews.json'), getJson('theories.json'), getJson('theory_pages.json')]);
        try { if (pRes && pRes.ok) theoryPages = await pRes.json() || {}; } catch (e) {}
        // 영어 모드: data/en/ 의 번역을 원본 위에 덮어쓴다(없거나 낡은 항목은 한국어 원본 그대로)
        const enJ = (name) => window.LANG === 'en' ? getJson('en/' + name).then(r => (r && r.ok) ? r.json() : null).catch(() => null) : Promise.resolve(null);
        const [qEn, iEn, tEn] = await Promise.all([enJ('questions.json'), enJ('interviews.json'), enJ('theories.json')]);
        if(qRes && qRes.ok) allQuizData = window.i18nOverlay(await qRes.json(), qEn, 'questions'); if(iRes && iRes.ok) allInterviewData = window.i18nOverlay(await iRes.json(), iEn, 'interviews');
        if(tRes && tRes.ok) {
          const raw = window.i18nOverlay(await tRes.json(), tEn, 'theories');
          allTheories = raw.filter(t => !String(t.content || '').includes('채워질 예정')).map((t, idx) => ({ ...t, id: t.id || "T-" + idx, category: t.category || "기타", subject: t.subject || "일반" }));
        }
        // 이론 페이지(theory/<id>/)로 들어왔으면 그 이론을, 이론 목록(theory/)이면 백과사전 첫 화면을 바로 연다. 그 외에는 홈.
        const boot = window.BOOT_THEORY && allTheories.find(x => x.id === window.BOOT_THEORY);
        if (boot || window.BOOT_HUB) {
          learnState = { ...learnState, ...(boot ? { level: 'detail', category: boot.category, subject: boot.subject, theoryId: boot.id } : { level: 'home' }) };
          applyState('view-learning', learnState);
        } else applyState('view-lobby', learnState);
        try { history.scrollRestoration = 'manual'; } catch (e) {}
        navLog = [{ v: currentViewId, l: { ...learnState } }]; navIdx = 0; history.replaceState({ i: 0 }, '');
        if (!boot && !window.BOOT_HUB) handleDeepLink();
      } catch (e) {}
    }

    // =====================================================
    // 💳 토큰 충전 · 결제 내역 · 환불 (토스페이먼츠 결제창 v2)
    //  - 금액·토큰 수·결제 확인은 전부 서버가 한다. 화면은 팩 이름만 보내고, 결제창을 띄우고,
    //    결제 후 돌아오면 서버에 "승인 확인"을 요청할 뿐이다. (성공 주소의 값은 서버가 PG에 다시 물어 검증한다)
    //  - 클라이언트 키(…_ck_…)는 toss-config.js 에만 둔다. 시크릿 키는 이 저장소에 절대 두지 않는다.
    // =====================================================
    // 아이콘: index.html 맨 위의 SVG 스프라이트(#i-…)를 가리킨다. 이모지 대신 쓰는 선 아이콘(ico)과 토큰 코인(TK)
    const ico = (n, c) => `<svg class="ic ln${c ? ' ' + c : ''}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
    const TK = (c) => `<svg class="ic tk${c ? ' ' + c : ''}" aria-hidden="true"><use href="#i-tok"/></svg>`;
    const PAY = { packs: [{ id: 'p15', tokens: 15, amount: 3000 }, { id: 'p40', tokens: 40, amount: 7500 }, { id: 'p100', tokens: 100, amount: 17000 }], orders: null, busy: false, busyPack: '', faqOpen: false, err: '', note: '', sdkP: null, cfgP: null, key: undefined, resuming: false };   // 금액은 화면 안내용일 뿐, 실제 금액은 서버가 정한다
    const PAY_PENDING = 'semiPayPending', PAY_BACK = 'semiPayBack';
    // 영어 화면에서는 달러 환산액을 같이 보여 준다(실제 결제는 원화, 카드사가 환산). 환율은 표시용 고정값
    const USD_KRW = 1500;
    const usd = (n) => '$' + (Number(n) / USD_KRW).toFixed(2);
    const won = (n) => window.LANG === 'en' ? '₩' + Number(n).toLocaleString('en-US') + ' (≈ ' + usd(n) + ')' : Number(n).toLocaleString('ko-KR') + '원';
    const payDate = (ms) => { const d = new Date(ms); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };
    function payClientKey() {
      if (!PAY.cfgP) PAY.cfgP = new Promise((res) => { if (typeof window.TOSS_CLIENT_KEY === 'string') return res(); const s = document.createElement('script'); s.src = ROOT + 'toss-config.js?v=' + Date.now(); s.onload = s.onerror = res; document.head.appendChild(s); });
      return PAY.cfgP.then(() => { const k = window.TOSS_CLIENT_KEY; PAY.key = typeof k === 'string' && /^(test|live)_ck_[A-Za-z0-9_=-]{10,}$/.test(k) ? k : ''; return PAY.key; });
    }
    function paySdk() {
      if (window.TossPayments) return Promise.resolve();
      if (!PAY.sdkP) PAY.sdkP = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://js.tosspayments.com/v2/standard'; s.onload = () => (window.TossPayments ? res() : rej(new Error('sdk'))); s.onerror = () => rej(new Error('sdk')); document.head.appendChild(s); }).catch((e) => { PAY.sdkP = null; throw e; });
      return PAY.sdkP;
    }
    function payOpen() {
      if (!acct.user) { openAcct(); return; }
      closeAcct(); try { earnClose(); } catch (e) {}
      let o = document.getElementById('payM');
      if (!o) { o = document.createElement('div'); o.id = 'payM'; o.className = 'pmg'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', '토큰 충전'); o.addEventListener('click', (e) => { if (e.target === o) payClose(); }); document.body.appendChild(o); }
      PAY.err = ''; PAY.note = ''; payRender(); requestAnimationFrame(() => o.classList.add('on'));
      payClientKey().then(() => payRender()); payLoadOrders();
    }
    function payClose() { const o = document.getElementById('payM'); if (!o) return; o.classList.remove('on'); setTimeout(() => o.remove(), 220); }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('payM')) payClose(); });
    // ===== 토큰 얻는 법 안내 창: 무료로 받는 방법·충전·상한·쓰임새를 한 곳에 정리 =====
    function earnClose() { const o = document.getElementById('earnM'); if (!o) return; o.classList.remove('on'); setTimeout(() => o.remove(), 220); }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('earnM')) earnClose(); });
    function earnOpen() {
      try { closeAcct(); } catch (e) {} try { payClose(); } catch (e) {} try { pmGateClose(); } catch (e) {}
      let o = document.getElementById('earnM');
      if (!o) { o = document.createElement('div'); o.id = 'earnM'; o.className = 'pmg'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', '토큰 얻는 법'); o.addEventListener('click', (e) => { if (e.target === o) earnClose(); }); document.body.appendChild(o); }
      earnRender(); requestAnimationFrame(() => o.classList.add('on'));
    }
    function earnRender() {
      const o = document.getElementById('earnM'); if (!o) return;
      const t = todayData(), pts = Math.min(t.pts || 0, DAILY_GOAL), in_ = !!acct.user, have = PRM.free + PRM.paid;
      const bal = in_ && PRM.loaded ? `<div class="pay-bal">${TK('pay-bal-tk')}<div><small>내 토큰</small><b>${have}</b></div><div class="pay-bal-s"><span>무료 ${PRM.free}</span><span>유료 ${PRM.paid}</span></div></div>` : '';
      const prog = `<div class="earn-prog"><div class="earn-bar"><i style="width:${Math.round(pts / DAILY_GOAL * 100)}%"></i></div><span>오늘 <b>${pts}</b> / ${DAILY_GOAL}점</span></div>`;
      o.innerHTML = `<div class="pmg-card pay-card earn-card"><button type="button" class="pmg-x" aria-label="닫기" onclick="earnClose()">✕</button>
        <span class="pmg-tick"><i></i>HOW TO EARN</span><h3>토큰 얻는 법</h3>${bal}
        <p class="earn-lead">토큰은 심화 이론·장비 체험을 <b>내 계정에 영구 해금</b>할 때 써요. 무료로 모으거나 충전할 수 있어요.</p>
        <div class="earn-way"><div class="earn-h"><span class="earn-n">1</span><b>오늘의 미션 · 출석</b><em class="earn-plus">+5</em></div>
          <p>학습 점수 <b>${DAILY_GOAL}점</b>을 채우고 출석하면 무료 토큰 <b>5개</b>를 받아요. 하루 한 번, 한국 시간 0시에 새로 시작해요.</p>
          <ul class="earn-pts"><li>문제 풀기 <b>1점</b></li><li>면접 연습 <b>1점</b></li><li>이론 읽기 <b>2점</b></li></ul>
          ${prog}<p class="earn-small">로그인한 상태로 쌓은 점수만 인정돼요. 3일 연속이면 토큰 15개로 심화 이론 1편을 열 수 있어요.</p></div>
        <div class="earn-way"><div class="earn-h"><span class="earn-n">2</span><b>가입 환영 선물</b><em class="earn-plus">+3</em></div>
          <p>로그인하고 <b>24시간이 지난 뒤</b>, 학습 기록이 하나 이상 있으면 무료 토큰 3개를 한 번 받아요.</p></div>
        <div class="earn-way"><div class="earn-h"><span class="earn-n">3</span><b>토큰 충전</b><em class="earn-plus pay">구매</em></div>
          <ul class="earn-packs">${PAY.packs.map((k) => `<li><span>${k.tokens}토큰</span><b>${won(k.amount)}</b></li>`).join('')}</ul>
          <p>결제 후 7일 이내, 쓰지 않은 유료 토큰은 환불받을 수 있어요.</p>${window.LANG === 'en' ? '<p class="earn-small">결제는 원화(KRW)로 청구돼요. 달러 금액은 참고용 환산이고, 실제 청구액은 카드사 환율에 따라 조금 달라질 수 있어요.</p>' : ''}
          <button type="button" class="pay-open" onclick="payOpen()">${TK()} 토큰 충전하기</button></div>
        <p class="earn-free">${ico('unlock')}<span><b>무료 맛보기</b> · 플라즈마 식각(RIE) 이론과 식각 장비 체험은 토큰 없이, 로그인만 하면 바로 볼 수 있어요</span></p>
        <div class="pay-sec"><span class="pmg-tick"><i></i>PRICE</span></div>
        <ul class="earn-price"><li><span>심화 이론 1편</span><b>${TK()}${PRICE_HINT.theory}</b></li><li><span>장비 체험 1개</span><b>${TK()}${PRICE_HINT.lab}</b></li><li><span>이론 + 장비 묶음</span><b>${TK()}${PRICE_HINT.bundle}</b></li></ul>
        <div class="pay-sec"><span class="pmg-tick"><i></i>GOOD TO KNOW</span></div>
        <ul class="pmg-pts pay-pts"><li>해금은 한 번이면 <b>계정에 영구</b> 적용돼요</li><li>무료 토큰은 <b>최대 30개</b>까지 모을 수 있어요. 가득 차면 출석 보상이 그만큼만 들어와요</li><li>토큰을 쓸 때는 <b>무료 토큰이 먼저</b> 쓰여요</li><li>무료 토큰은 환불 대상이 아니고, <b>해금에 쓴 토큰은 환불되지 않아요</b></li></ul>
        ${in_ ? '' : '<button type="button" class="pmg-cta" onclick="earnClose();openAcct()">구글 로그인하고 시작하기</button>'}</div>`;
    }
    async function payLoadOrders() {
      try { const r = await apiJson('/orders'); if (r.status === 200) PAY.orders = r.body.orders || []; else if (r.status !== 503) PAY.err = '결제 내역을 불러오지 못했어요.'; } catch (e) { PAY.err = '결제 내역을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.'; }
      payRender();
    }
    function payRender() {
      const o = document.getElementById('payM'); if (!o) return;
      const have = PRM.free + PRM.paid, ready = !!PAY.key, test = ready && PAY.key.indexOf('test_') === 0;
      const best = PAY.packs.reduce((m, p) => (p.amount / p.tokens < m.amount / m.tokens ? p : m));
      const packs = PAY.packs.map((p) => {
        const busy = PAY.busy && PAY.busyPack === p.id, th = Math.floor(p.tokens / PRICE_HINT.theory);
        return `<button type="button" class="pay-pack${busy ? ' busy' : ''}" ${ready && !PAY.busy ? '' : 'disabled'} onclick="payStart('${p.id}')">${p.id === best.id ? '<span class="pay-tag">개당 최저가</span>' : ''}`
          + `<span class="pp-l">${TK('pp-tk')}<span><b>${p.tokens}<em>토큰</em></b><small>개당 약 ${Math.round(p.amount / p.tokens)}원 · 이론 ${th}편 분량</small></span></span>`
          + `<span class="pp-r"><b>${won(p.amount)}</b><small>${busy ? '결제창 여는 중…' : '결제하기'}</small></span></button>`;
      }).join('');
      const pill = { paid: ['결제 완료', 'ok'], refunding: ['환불 처리 중', 'wait'], refunded: ['환불 완료', 'off'] };
      const rows = PAY.orders === null ? '<li class="pay-empty">불러오는 중…</li>' : !PAY.orders.length ? '<li class="pay-empty">아직 결제 내역이 없어요</li>' : PAY.orders.map((x) => {
        const pl = pill[x.status] || ['', 'off'];
        return `<li class="pay-row"><div class="pay-row-h"><div><b>${TK()}${x.tokens}토큰</b><small>${x.paidAt ? payDate(x.paidAt) + ' · ' : ''}${won(x.amount)}</small></div><span class="pay-pill ${pl[1]}">${pl[0]}</span></div></li>`;
      }).join('');
      // 환불은 눈에 띄는 버튼이 아니라 '환불 문의' 안쪽(접힌 상태)에서만 신청한다
      const refundable = (PAY.orders || []).filter((x) => x.status === 'paid' && x.refundableTokens > 0);
      const rfList = PAY.orders === null ? '' : refundable.length
        ? `<ul class="pay-rfl">${refundable.map((x) => `<li><span>${payDate(x.paidAt)} 결제 · ${x.tokens}토큰<small>미사용 ${x.refundableTokens}토큰 · ${won(x.refundAmount)} 환불 가능${x.refundUntil ? ` (${payDate(x.refundUntil)}까지)` : ''}</small></span><button type="button" class="pay-rf" ${PAY.busy ? 'disabled' : ''} onclick="payRefund('${x.orderId}')">환불 신청</button></li>`).join('')}</ul>`
        : `<p class="pay-rfn">지금 환불할 수 있는 결제가 없어요. (결제 후 7일 이내이고 미사용 유료 토큰이 남아 있어야 해요)</p>`;
      const pend = (() => { try { return !!sessionStorage.getItem(PAY_PENDING); } catch (e) { return false; } })();
      o.innerHTML = `<div class="pmg-card pay-card"><button type="button" class="pmg-x" aria-label="닫기" onclick="payClose()">✕</button>
        <span class="pmg-tick"><i></i>TOKEN STORE</span><h3>토큰 충전</h3>
        <div class="pay-bal">${TK('pay-bal-tk')}<div><small>내 토큰</small><b>${have}</b></div><div class="pay-bal-s"><span>무료 ${PRM.free}</span><span>유료 ${PRM.paid}</span></div></div>
        <button type="button" class="earn-link" onclick="earnOpen()">${ico('info')} 무료로 토큰 얻는 법</button>
        ${pend ? '<p class="pay-msg ok"><b>결제를 마무리하는 중이에요.</b> 오래 걸리면 <button type="button" class="underline" onclick="payResume()">다시 확인</button>을 눌러 주세요.</p>' : ''}
        ${ready ? (test ? `<p class="pay-test">${ico('flask')}<span>테스트 결제 모드 · 실제로 요금이 청구되지 않아요</span></p>` : '') : '<p class="pay-test">결제 기능을 준비 중이에요. 곧 열려요!</p>'}
        <div class="pay-sec"><span class="pmg-tick"><i></i>CHARGE</span></div>
        <div class="pay-packs">${packs}</div>
        <p class="pay-secure">${ico('shield')}<span>카드 결제 · 토스페이먼츠 결제창에서 안전하게 진행돼요</span></p>
        ${PAY.err ? `<p class="pay-msg err">${escH(PAY.err)}</p>` : ''}${PAY.note ? `<p class="pay-msg ok">${escH(PAY.note)}</p>` : ''}
        <div class="pay-sec"><span class="pmg-tick"><i></i>HISTORY</span></div>
        <ul class="pay-rows">${rows}</ul>
        <details class="pay-faq"${PAY.faqOpen ? ' open' : ''} ontoggle="PAY.faqOpen = this.open"><summary>환불 문의</summary><div class="pay-faq-b">
          <ul class="pmg-pts pay-pts"><li><b>결제 후 7일 이내</b>, 쓰지 않은 유료 토큰은 환불받을 수 있어요</li><li><b>해금에 쓴 토큰은 환불되지 않아요.</b> 해금할 때는 무료 토큰이 먼저 쓰여요</li><li>무료 토큰(출석·미션 보상)은 환불·현금 전환 대상이 아니에요</li><li>카드 취소가 반영되기까지는 카드사에 따라 며칠 걸릴 수 있어요</li></ul>
          ${rfList}</div></details></div>`;
    }
    async function payStart(packId) {
      if (PAY.busy) return; const P = PAY.packs.find((x) => x.id === packId); if (!P) return;
      const key = await payClientKey(); if (!key) { PAY.err = '결제 기능을 준비 중이에요.'; payRender(); return; }
      PAY.busy = true; PAY.busyPack = packId; PAY.err = ''; PAY.note = ''; payRender();
      try {
        const r = await apiJson('/orders', 'POST', { pack: packId });
        if (r.status === 503) throw new Error('unavailable');
        if (r.status !== 200 || !r.body.orderId) throw new Error('order');
        if (r.body.amount !== P.amount) { PAY.err = '가격이 바뀌었어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.'; PAY.busy = false; payRender(); return; }
        await paySdk();
        try { sessionStorage.setItem(PAY_BACK, JSON.stringify(payBackHere())); } catch (e) {}
        const base = location.origin + ROOT;
        const payment = window.TossPayments(key).payment({ customerKey: window.TossPayments.ANONYMOUS });   // 비회원 결제 키: 계정 식별자를 토스에 넘기지 않는다
        await payment.requestPayment({ method: 'CARD', amount: { currency: 'KRW', value: r.body.amount }, orderId: r.body.orderId, orderName: r.body.orderName, successUrl: base + '?pay=success', failUrl: base + '?pay=fail' });
      } catch (e) {
        const c = e && e.code;
        if (c === 'USER_CANCEL' || c === 'PAY_PROCESS_CANCELED') PAY.note = '결제를 취소했어요.';
        else if (e && e.message === 'unavailable') PAY.err = '결제 기능을 준비 중이에요.';
        else if (e && e.message === 'sdk') PAY.err = '결제창을 불러오지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.';
        else PAY.err = '결제를 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
      }
      PAY.busy = false; PAY.busyPack = ''; payRender();
    }
    function payBackHere() {   // 결제 후 돌아왔을 때 보던 글로 되돌리기 위한 위치
      if (currentViewId === 'view-learning' && learnState.level === 'detail' && learnState.theoryId) return { t: learnState.theoryId };
      if (currentViewId === 'view-lab' && labKind) return { lab: labKind };
      return {};
    }
    // 결제창에서 돌아온 주소(?pay=success&paymentKey=…&orderId=…&amount=…)를 읽어 보관하고 주소창을 정리한다
    function payHandleReturn() {
      let p; try { p = new URLSearchParams(location.search); } catch (e) { return; }
      const st = p.get('pay'); if (st !== 'success' && st !== 'fail') return;
      try { history.replaceState(history.state, '', location.pathname + location.hash); } catch (e) {}
      if (st === 'fail') {
        const c = p.get('code') || ''; pmToast(c === 'PAY_PROCESS_CANCELED' || c === 'USER_CANCEL' ? '결제를 취소했어요.' : '결제가 완료되지 않았어요. 요금은 청구되지 않았어요.' + (/^[A-Z_]{3,40}$/.test(c) ? ` (${c})` : '')); return;
      }
      const paymentKey = p.get('paymentKey') || '', orderId = p.get('orderId') || '', amount = Number(p.get('amount'));
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(paymentKey) || !/^ord_[a-f0-9]{32}$/.test(orderId) || !Number.isInteger(amount)) return;
      try { sessionStorage.setItem(PAY_PENDING, JSON.stringify({ paymentKey, orderId, amount, ts: Date.now() })); } catch (e) {}
      if (!acct.user) pmToast('로그인이 확인되면 결제를 마무리해요. 잠시만 기다려 주세요.');
    }
    // 보관해 둔 결제를 서버에 승인 확인한다. 로그인·잔액 조회가 끝난 뒤 불린다(여러 번 불려도 한 번에 하나만 처리)
    async function payResume() {
      if (PAY.resuming || !acct.user) return;
      let pend = null; try { pend = JSON.parse(sessionStorage.getItem(PAY_PENDING) || 'null'); } catch (e) {}
      if (!pend) return;
      PAY.resuming = true;
      try {
        const r = await apiJson('/pay/confirm', 'POST', { paymentKey: pend.paymentKey, orderId: pend.orderId, amount: pend.amount });
        if (r.status === 200 && r.body.ok) {
          try { sessionStorage.removeItem(PAY_PENDING); } catch (e) {}
          await walletLoad();
          pmToast(r.body.already ? '이미 충전이 반영된 결제예요.' : `토큰 ${r.body.tokens}개가 충전됐어요`);
          if (document.getElementById('payM')) payLoadOrders();
          payGoBack();
        } else if (r.status >= 500 || r.status === 429 || r.status === 0) {
          pmToast('결제 확인이 지연되고 있어요. 잠시 뒤 자동으로 다시 확인해요.'); setTimeout(payResume, 15000);
        } else {   // 승인 실패·불일치·남의 주문 등: 다시 시도해도 같으므로 보관을 지운다
          try { sessionStorage.removeItem(PAY_PENDING); } catch (e) {}
          const code = r.body && r.body.code ? ` (${String(r.body.code).replace(/[^A-Z_]/g, '').slice(0, 40)})` : '';
          pmToast(r.status === 402 ? '결제 승인에 실패했어요. 요금이 청구되지 않았다면 다시 시도해 주세요.' + code : '결제를 확인하지 못했어요. 요금이 청구됐다면 문의해 주세요. (주문번호 ' + pend.orderId + ')');
        }
      } catch (e) { pmToast('결제 확인 중 연결이 끊겼어요. 잠시 뒤 자동으로 다시 확인해요.'); setTimeout(payResume, 15000); }
      PAY.resuming = false; payRender();
    }
    function payGoBack() {
      let b = {}; try { b = JSON.parse(sessionStorage.getItem(PAY_BACK) || '{}'); sessionStorage.removeItem(PAY_BACK); } catch (e) {}
      try { if (b.t && allTheories.some((x) => x.id === b.t)) openTheory(b.t); else if (b.lab && LABS[b.lab]) labOpen(b.lab); } catch (e) {}
    }
    async function payRefund(orderId) {
      if (PAY.busy) return; const x = (PAY.orders || []).find((o) => o.orderId === orderId); if (!x || !(x.refundableTokens > 0)) return;
      if (!confirm(`미사용 유료 토큰 ${x.refundableTokens}개를 환불하고 ${won(x.refundAmount)}을 결제 수단으로 돌려받을까요?\n\n· 지금 바로 토큰 ${x.refundableTokens}개가 차감돼요\n· 이 주문은 환불을 한 번만 할 수 있어요\n· 카드 취소 반영까지는 카드사에 따라 며칠 걸릴 수 있어요`)) return;
      PAY.busy = true; PAY.err = ''; PAY.note = ''; payRender();
      try {
        const r = await apiJson('/refund', 'POST', { orderId });
        if (r.status === 200 && r.body.ok) { PAY.note = r.body.already ? '이미 환불된 주문이에요.' : `환불을 요청했어요. 토큰 ${r.body.refundedTokens}개가 차감되고 ${won(r.body.refundAmount)}이 취소돼요.`; await walletLoad(); }
        else if (r.status === 400 && r.body.error === 'not_refundable') PAY.err = r.body.reason === 'window_expired' ? '환불 가능 기간(7일)이 지났어요.' : r.body.reason === 'no_unused_tokens' ? '환불할 수 있는 미사용 유료 토큰이 없어요.' : '이 주문은 환불할 수 없어요.';
        else if (r.status === 409) PAY.err = '환불이 이미 진행 중이거나 잔액이 방금 바뀌었어요. 내역을 확인한 뒤 다시 시도해 주세요.';
        else if (r.status === 502) PAY.err = '카드 취소 요청이 실패해서 토큰은 그대로예요. 잠시 뒤 다시 시도해 주세요.';
        else PAY.err = '환불을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
      } catch (e) { PAY.err = '연결이 끊겨 결과를 확인하지 못했어요. 내역을 새로 불러와 확인해 주세요.'; }
      PAY.busy = false; await payLoadOrders();
    }
    // 스크립트 전체가 끝난 뒤에 실행한다 (여기서 바로 부르면 아래쪽에서 선언되는 acct 등을 아직 못 읽어 사이트 전체가 멈춘다)
    setTimeout(() => { try { payHandleReturn(); } catch (e) {} }, 0);

    // ===== 이론 정적 페이지(theory/…)에서 넘어오는 딥링크: ?theory=ID[&go=quiz|interview] =====
    function handleDeepLink() {
      const p = new URLSearchParams(location.search), id = p.get('theory'); if (!id) return;
      try { history.replaceState(history.state, '', location.pathname + location.hash); } catch (e) {}   // 주소창을 깔끔하게
      const t = allTheories.find(x => x.id === id); if (!t) return;
      const go = p.get('go');
      if (go === 'quiz' && matchItems(allQuizData, t.title).length) return startMiniQuiz(t.title);
      if (go === 'interview' && matchItems(allInterviewData, t.title).length) return startMiniInterview(t.title);
      openTheory(id);
    }

    // ===== 브라우저 히스토리 연동: 크롬 뒤로가기/앞으로가기가 화면 이동을 그대로 따라간다 =====
    function navTo(viewId, newLearnState = null) {
      if (navLog[navIdx]) navLog[navIdx].y = window.scrollY;   // 떠나는 화면의 스크롤 위치 기억
      if (newLearnState) learnState = { ...learnState, ...newLearnState };
      applyState(viewId, learnState); pushNav(viewId);
    }
    function pushNav(viewId) {
      const s = { v: viewId, l: { ...learnState } }, cur = navLog[navIdx];
      if (cur && cur.v === s.v && JSON.stringify(cur.l) === JSON.stringify(s.l)) return;
      navIdx++; navLog = navLog.slice(0, navIdx); navLog[navIdx] = s;
      const st = { i: navIdx }; try { history.pushState(st, '', urlForState()); } catch (e) { history.pushState(st, ''); }
    }
    window.addEventListener('popstate', (e) => {
      const i = e.state && Number.isInteger(e.state.i) ? e.state.i : 0, s = navLog[i];
      // 시험 중에 뒤로가기를 누르면 실수로 시험이 날아가지 않게 확인
      if (currentViewId === 'view-exam' && exam && !(s && s.v === 'view-exam')) {
        if (!confirm('시험을 중단할까요? 지금까지의 답안은 채점되지 않아요.')) { history.go(navIdx - i); return; }
        stopExamTimer(); exam = null;
      }
      navIdx = i;
      if (!s) { applyState('view-lobby', learnState); return; }
      learnState = { ...s.l };
      let v = s.v;
      if ((v === 'view-quiz' || v === 'view-interview') && !filteredSession.length) v = 'view-lobby';
      if (v === 'view-exam' && !exam) v = 'view-lobby';
      applyState(v, learnState);
      if (s.y) requestAnimationFrame(() => window.scrollTo({ top: s.y }));
    });
    const prevNav = () => navLog[navIdx - 1];
    function backOrLobby() { const p = prevNav(); if (p) history.back(); else navTo('view-lobby'); }
    // 앱 안의 ← 뒤로: 이론 화면에서는 폴더를 한 단계씩 거슬러 올라간다
    function goBack() {
      if (currentViewId === 'view-learning') {
        const si = document.getElementById('theorySearchInput');
        if (si.value.trim() !== '') { si.value = ''; applyState('view-learning', learnState); return; }
        const lv = learnState.level;
        if (lv === 'home') { const p = prevNav(); if (p && p.v === 'view-lobby') history.back(); else navTo('view-lobby'); return; }
        const up = lv === 'detail' ? { level: 'subject' } : lv === 'subject' ? { level: 'category' } : { level: 'home' };
        const want = { ...learnState, ...up }, p = prevNav();
        if (p && p.v === 'view-learning' && p.l.level === want.level && (want.level === 'home' || p.l.category === want.category) && (want.level !== 'subject' || p.l.subject === want.subject)) history.back();
        else navTo('view-learning', up);
        return;
      }
      if (['view-quiz', 'view-interview', 'view-exam', 'view-result'].includes(currentViewId)) return navTo('view-lobby');
      backOrLobby();
    }
    // 이론 화면에서 '풀던 화면'으로 되돌아가기
    function returnToOrigin() {
      const c = returnCtx; if (!c) return;
      const p = prevNav(); if (p && p.v === c.view) history.back(); else navTo(c.view);
    }
    const RETURN_LABEL = { 'view-quiz': '풀던 문제로 돌아가기', 'view-interview': '풀던 면접으로 돌아가기', 'view-result': '결과로 돌아가기', 'view-exam': '시험으로 돌아가기', 'view-note': '오답 노트로 돌아가기', 'view-search': '검색 결과로 돌아가기', 'view-careers': '직무 지도로 돌아가기', 'view-flow': '한눈에 보기로 돌아가기', 'view-fab': '3D 팹으로 돌아가기', 'view-lab': '체험으로 돌아가기', 'view-glossary': '단어장으로 돌아가기', 'view-path': '학습 코스로 돌아가기' };
    // 이론을 읽을 때 글을 가리지 않게: 아래로 스크롤하면 숨고, 위로 올리면 다시 나타난다. ✕를 누르면 ↩ 아이콘만 남는다(다음에도 기억).
    let retMini = false; try { retMini = localStorage.getItem('semiCbtRetMini') === '1'; } catch (e) {}
    function returnMini(on) { retMini = !!on; try { localStorage.setItem('semiCbtRetMini', on ? '1' : '0'); } catch (e) {} updateReturnBtn(); }
    function updateReturnBtn() {
      const btn = document.getElementById('returnBtn'), show = !!returnCtx && currentViewId === 'view-learning';
      btn.classList.toggle('hidden', !show); btn.classList.remove('ret-away'); btn.classList.toggle('mini', retMini);
      document.getElementById('view-learning').classList.toggle('pb-24', show && !retMini);
      if (show) { document.getElementById('returnBtnText').textContent = returnCtx.label; const m = btn.querySelector('.rb-main'); m.title = returnCtx.label; m.setAttribute('aria-label', returnCtx.label); }
    }
    (() => { let ly = 0; window.addEventListener('scroll', () => {
      const y = window.scrollY, btn = document.getElementById('returnBtn'); if (!btn || btn.classList.contains('hidden')) { ly = y; return; }
      if (y > ly + 8 && y > 120) btn.classList.add('ret-away'); else if (y < ly - 8 || y <= 120) btn.classList.remove('ret-away');
      ly = y;
    }, { passive: true }); })();
    function applyState(viewId, state) {
      ['view-lobby', 'view-setup', 'view-quiz', 'view-interview', 'view-learning', 'view-note', 'view-result', 'view-exam', 'view-search', 'view-careers', 'view-flow', 'view-fab', 'view-lab', 'view-experience', 'view-equip', 'view-glossary', 'view-path', 'view-subjects'].forEach(id => document.getElementById(id).classList.add('hidden'));
      const vEl = document.getElementById(viewId); vEl.classList.remove('hidden'); currentViewId = viewId; vEl.classList.remove('view-enter'); void vEl.offsetWidth; vEl.classList.add('view-enter');
      if (viewId !== 'view-exam') stopExamTimer();
      if (viewId !== 'view-learning') returnCtx = null;
      if (viewId === 'view-lobby') { renderResumeBanner(); renderHome(); }
      updateNav(); window.scrollTo({ top: 0 });
      if (viewId === 'view-careers') enterCareers();
      if (viewId !== 'view-flow') fjStop();
      if (viewId !== 'view-fab') fabStop();
      if (viewId === 'view-fab') enterFab();
      if (viewId !== 'view-lab') labStop();
      if (!(viewId === 'view-lab' || (viewId === 'view-learning' && state && state.level === 'detail'))) { pmGateId = null; pmGateClose(); }   // 유료 화면을 떠나면 해금 팝업도 닫는다
      if (viewId === 'view-lab') enterLab();
      if (viewId === 'view-flow') enterFlow();
      if (viewId === 'view-glossary') enterGlossary();
      if (viewId === 'view-path') enterPath();
      if (viewId === 'view-subjects') renderHomeSubjects();
      if (viewId === 'view-search') { const si = document.getElementById('globalSearchInput'); runGlobalSearch(); setTimeout(() => si.focus(), 50); }
      if (viewId === 'view-learning') {
        document.getElementById('theorySearchInput').value = '';
        if (state.level === 'home') renderHomeDOM(); else if (state.level === 'category') renderSubjectsDOM(state.category); else if (state.level === 'subject') renderTitlesDOM(state.category, state.subject); else if (state.level === 'detail') renderDetailDOM(state.theoryId);
      } else if (viewId === 'view-note') renderNoteDOM();
      updateReturnBtn(); applyMathRendering();
    }

    // 📖 백과사전 뷰 (max-w-2xl 사이즈에 맞춘 레이아웃)
    function renderHomeDOM() {
      renderBreadcrumb(); const container = document.getElementById('learningContainer'); container.className = "grid grid-cols-1 sm:grid-cols-2 gap-4"; container.innerHTML = '';
      const activeCats = FIXED_CATEGORIES.filter(cat => CATEGORY_TREE[cat] || allTheories.some(t => t.category === cat));
      activeCats.forEach(cat => {
        const btn = document.createElement('button');
        if (cat === ADV_CAT) {   // 심화 이론: 어두운 기술 문서 테마의 넓은 카드
          const n = allTheories.filter(t => t.category === cat).length;
          btn.className = 'adv-folder'; btn.onclick = () => navTo('view-learning', { level: 'category', category: cat });
          btn.innerHTML = `<span class="adv-folder-ic" aria-hidden="true">⚙</span><div class="min-w-0 flex-1"><span class="adv-tick"><i></i>ADVANCED<span class="pm-lk">${ico('lock')} 토큰 해금</span></span><h3>${escH(cat)}</h3><p>장비 사용 · 레시피 설정 · 트러블슈팅. 장비 체험에 들어가기 전에 읽는 현장 가이드예요.</p></div><span class="adv-folder-n">${n}편 →</span>`;
          container.appendChild(btn); return;
        }
        btn.className = "group bg-white dark:bg-[#0f1729] border border-slate-200 dark:border-white/10 hover:border-indigo-400 dark:hover:border-[#67e8f9] hover:shadow-md p-5 rounded-2xl text-left transition flex items-center gap-4 shadow-sm";
        btn.onclick = () => navTo('view-learning', { level: 'category', category: cat });
        btn.innerHTML = `<span class="w-14 h-14 shrink-0 rounded-2xl text-indigo-600 dark:text-cyan-300 bg-indigo-50 dark:bg-[#0f2233] border border-indigo-100 dark:border-[#1e3a5f] flex items-center justify-center text-2xl">📁</span><div class="min-w-0 flex-1"><h3 class="text-[17px] font-bold text-slate-900 dark:text-white leading-snug">${cat}</h3><span class="inline-block mt-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-300">문서 ${allTheories.filter(t => t.category === cat).length}개</span></div><span class="text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 dark:group-hover:text-[#67e8f9] text-2xl leading-none transition">›</span>`;
        container.appendChild(btn);
      });
      container.insertAdjacentHTML('beforeend', `<button onclick="fjOpen()" class="col-span-full group bg-white dark:bg-[#0f1729] border border-dashed border-slate-300 dark:border-white/15 hover:border-indigo-400 dark:hover:border-[#67e8f9] px-5 py-4 rounded-2xl text-left transition flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400"><span class="text-xl">🧭</span><span class="min-w-0"><b class="text-slate-800 dark:text-slate-100">처음이세요?</b> 모래에서 칩이 되기까지 8단계 여정을 따라가 봐요</span><span class="ml-auto font-bold text-indigo-600 dark:text-cyan-300 shrink-0">여정 보기 →</span></button>`);
      container.insertAdjacentHTML('beforeend', `<button onclick="glOpenView()" class="col-span-full group bg-white dark:bg-[#0f1729] border border-dashed border-slate-300 dark:border-white/15 hover:border-indigo-400 dark:hover:border-[#67e8f9] px-5 py-4 rounded-2xl text-left transition flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400"><span class="text-xl">📖</span><span class="min-w-0"><b class="text-slate-800 dark:text-slate-100">용어가 막히나요?</b> 반도체 용어 단어장에서 폴더별로 찾아보세요</span><span class="ml-auto font-bold text-indigo-600 dark:text-cyan-300 shrink-0">단어장 →</span></button>`);
    }

    function renderSubjectsDOM(category) {
      renderBreadcrumb(); const container = document.getElementById('learningContainer'); container.className = "grid grid-cols-1 sm:grid-cols-2 gap-4"; container.innerHTML = '';
      const extra = [...new Set(allTheories.filter(t => t.category === category).map(t => t.subject))].filter(sub => !(CATEGORY_TREE[category] || []).includes(sub));
      const activeSubs = (CATEGORY_TREE[category] || []).concat(extra);
      if (category === ADV_CAT) container.insertAdjacentHTML('beforeend', advHero('심화 이론', '장비를 실제로 다루는 사람의 눈으로 정리한 글이에요. 개요 · 구조 · 레시피 · 결과 읽기 · 트러블슈팅 순서로 되어 있고, 끝의 버튼으로 장비 체험에 바로 들어갈 수 있어요.'));
      activeSubs.forEach(sub => {
        const btn = document.createElement('button');
        if (category === ADV_CAT) {
          const n = allTheories.filter(t => t.category === category && t.subject === sub).length;
          btn.className = 'adv-sub'; btn.onclick = () => navTo('view-learning', { level: 'subject', category: category, subject: sub });
          btn.innerHTML = `<span class="adv-folder-ic" aria-hidden="true">▣</span><div class="min-w-0 flex-1"><span class="adv-tick"><i></i>FOLDER<span class="pm-lk">${ico('lock')} 토큰 해금</span></span><h3>${escH(sub)}</h3><p>장비마다 개요 · 구조 · 레시피 · 트러블슈팅을 한 편에 담았어요.</p></div><span class="adv-folder-n">${n}편 →</span>`;
          container.appendChild(btn); return;
        }
        btn.className = "group bg-white dark:bg-[#0f1729] border border-slate-200 dark:border-white/10 hover:border-indigo-400 dark:hover:border-[#67e8f9] hover:shadow-md p-5 rounded-2xl text-left transition flex items-center gap-4 shadow-sm";
        btn.onclick = () => navTo('view-learning', { level: 'subject', category: category, subject: sub });
        btn.innerHTML = `<span class="w-14 h-14 shrink-0 rounded-2xl text-indigo-600 dark:text-cyan-300 bg-indigo-50 dark:bg-[#0f2233] border border-indigo-100 dark:border-[#1e3a5f] flex items-center justify-center text-2xl">📂</span><div class="min-w-0 flex-1"><h3 class="text-[17px] font-bold text-slate-900 dark:text-white leading-snug">${sub}</h3><span class="inline-block mt-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-300">문서 ${allTheories.filter(t => t.category === category && t.subject === sub).length}개</span></div><span class="text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 dark:group-hover:text-[#67e8f9] text-2xl leading-none transition">›</span>`;
        container.appendChild(btn);
      });
      container.insertAdjacentHTML('beforeend', folderBar(category, null));
    }

    function renderTitlesDOM(category, subject) {
      renderBreadcrumb(); const container = document.getElementById('learningContainer'); container.className = "flex flex-col space-y-3"; container.innerHTML = '';
      const list = allTheories.filter(t => t.category === category && t.subject === subject);
      if (category === ADV_CAT) container.insertAdjacentHTML('beforeend', advHero(subject, '읽은 뒤 장비 체험에서 같은 조건으로 바로 따라 해 볼 수 있어요.'));
      if (list.length === 0) container.innerHTML = `<div class="bg-white dark:bg-[#0f1729] border border-dashed border-slate-300 dark:border-white/15 p-8 text-center text-slate-400 rounded-xl text-sm">아직 등록된 이론이 없습니다.<br>곧 업데이트될 예정이에요.</div>`;
      list.forEach(t => renderTitleCard(t, container));
      container.insertAdjacentHTML('beforeend', folderBar(category, subject));
    }

    const advHero = (title, sub) => `<div class="adv-hero"><span class="adv-tick"><i></i>ADVANCED · FIELD GUIDE</span><h3>${escH(title)}</h3><p>${escH(sub)}</p></div>`;
    function renderTitleCard(t, container) {
      const btn = document.createElement('button');
      if (t.category === ADV_CAT) {
        btn.className = 'adv-title-card'; btn.onclick = () => navTo('view-learning', { level: 'detail', theoryId: t.id });
        btn.innerHTML = `<span class="adv-folder-ic" aria-hidden="true">${t.lab ? '🔧' : '📘'}</span><div class="min-w-0 flex-1"><span class="adv-tick"><i></i>${escH(t.equip || 'GUIDE')}${t.premium ? pmLk(t.id) : ''}</span><h3>${escH(t.title)}</h3><p>약 ${t.mins || Math.max(1, Math.round(String(t.content).length / 650))}분 읽기${t.lab && LABS[t.lab] ? ' · 연계 체험: ' + escH(LABS[t.lab].title) : ''}</p></div><span class="adv-folder-n">읽기 →</span>`;
        container.appendChild(btn); return;
      }
      btn.className = "bg-white dark:bg-[#0f1729] border border-slate-200 dark:border-white/10 hover:border-indigo-400 dark:hover:border-[#67e8f9] hover:shadow-md p-5 rounded-xl text-left transition flex items-center w-full shadow-sm";
      btn.onclick = () => navTo('view-learning', { level: 'detail', theoryId: t.id });
      btn.innerHTML = `<span class="text-2xl mr-4">📄</span><div><h3 class="text-lg font-bold text-slate-900 dark:text-white leading-snug">${escH(t.title)}</h3><div class="mt-2 flex flex-wrap gap-1">${(t.tags || []).map(tag => `<span class="bg-indigo-50 dark:bg-[#0f2233] text-indigo-700 dark:text-[#67e8f9] text-[10px] px-2 py-0.5 rounded font-bold">#${tag}</span>`).join('')}</div></div>`;
      container.appendChild(btn);
    }

        // 수식($...$, $$...$$)을 marked가 건드리지 못하게 잠시 빼 두었다가 되돌림
    function stashMath(md) {
      const stash = [];
      const hold = (m) => { stash.push(m); return `@@MATH${stash.length - 1}@@`; };
      const text = String(md || '').replace(/\$\$[\s\S]+?\$\$/g, hold).replace(/\$[^$\n]+?\$/g, hold);
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return { text, restore: (html) => html.replace(/@@MATH(\d+)@@/g, (_, i) => esc(stash[Number(i)])) };
    }
    
    // 섹션 뱃지에 가벼운 이모지를 붙여 읽는 재미를 더함
    function badgeEmoji(t) {
      const m = [[/정의|개념|정체/, '📘'], [/배경|필요|왜/, '🌱'], [/원리|동작|작동/, '⚙️'], [/메커니즘|세부|상세|구조/, '🔬'], [/분류|종류|유형/, '🗂️'], [/변수|영향|요인/, '🎚️'], [/장단점|한계/, '⚖️'], [/실무|이슈|응용|활용/, '🛠️'], [/암기|체크|정리|요약/, '🧠'],
        [/defin|concept/i, '📘'], [/background|why|need/i, '🌱'], [/how it works|principle|operat/i, '⚙️'], [/mechanism|structure|detail/i, '🔬'], [/type|class|kind/i, '🗂️'], [/variable|effect|factor/i, '🎚️'], [/pros|cons|limit|trade/i, '⚖️'], [/practice|issue|field|appli/i, '🛠️'], [/remember|check|summary|recap/i, '🧠']];
      const f = m.find(([re]) => re.test(t)); return f ? f[1] : '📌'.replace('📌', '✏️');
    }
    // ===== 이론 속 인터랙티브 그림 =====
    // 이론 글에 한 줄로 {{diagram:그림id|캡션}} 을 쓰면 아래 부품이 그 자리에 들어간다. (모르는 id 는 조용히 사라진다)
    // 그림은 사람이 만든 SVG 라서 AI 가 쓰는 글과 달리 틀릴 일이 없다. 새 그림은 DIAGRAMS 에 항목을 추가하고, scripts/generate_all.py 의 DIAGRAMS 목록에도 같은 id 를 적는다.
    const DG_RE = /^[ \t]*\{\{\s*diagram:([a-z0-9-]+)(?:\|([^}\n]*))?\}\}[ \t]*$/gm;
    // 용어 풀이·접는 설명: 비전문가가 모를 말이나 본문에 넣기엔 애매한 곁가지 설명을 눌러서 보게 한다.
    //   문장 속 어디서나  {{term:용어|풀이}}   /   한 줄로  {{toggle:제목|내용}}
    const TERM_RE = /\{\{\s*term:([^|}\n]+)\|([^}\n]+)\}\}/g, TOGGLE_RE = /^[ \t]*\{\{\s*toggle:([^|}\n]+)\|([^}\n]+)\}\}[ \t]*$/gm;
    function thTip(btn) {
      let tip = document.getElementById('thTip');
      if (tip && tip._for === btn) return hideThTip();
      hideThTip();
      tip = document.createElement('div'); tip.id = 'thTip'; tip.className = 'th-tip'; tip.setAttribute('role', 'tooltip'); tip._for = btn;
      const h = document.createElement('b'); h.textContent = btn.textContent; const p = document.createElement('span'); p.textContent = btn.dataset.def || '';
      tip.append(h, p); document.body.appendChild(tip); btn.setAttribute('aria-expanded', 'true');
      const r = btn.getBoundingClientRect(), w = tip.offsetWidth, hgt = tip.offsetHeight;
      let top = r.bottom + 8; if (top + hgt > innerHeight - 8 && r.top - hgt - 8 > 8) top = r.top - hgt - 8;
      tip.style.top = Math.max(8, top) + 'px'; tip.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    }
    function hideThTip() { const t = document.getElementById('thTip'); if (t) { if (t._for) t._for.removeAttribute('aria-expanded'); t.remove(); } }
    document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('.th-term'); if (b) { e.preventDefault(); thTip(b); } else if (!(e.target.closest && e.target.closest('#thTip'))) hideThTip(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideThTip(); });
    window.addEventListener('scroll', hideThTip, { passive: true, capture: true }); window.addEventListener('resize', hideThTip);
    // 공통 도우미
    const dgT = (x, y, str, cls = '', anchor = 'middle') => `<text class="dg-t ${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${escH(str)}</text>`;
    const dgSvg = (label, body, vb = '0 0 400 300') => `<svg viewBox="${vb}" role="img" aria-label="${escH(label)}">${body}</svg>`;
    const dgFlow = (d, rev) => `<path class="dg-flow ${rev ? 'rev' : ''}" d="${d}"/>`;
    const dgArrow = (x1, y1, x2, y2, cls = 'dg-line') => {
      const a = Math.atan2(y2 - y1, x2 - x1), h = 7, p = (t) => `${(x2 - h * Math.cos(a + t)).toFixed(1)},${(y2 - h * Math.sin(a + t)).toFixed(1)}`;
      return `<path class="${cls}" d="M${x1} ${y1} L${x2} ${y2}"/><path d="M${x2} ${y2} L${p(.45)} L${p(-.45)} Z" fill="currentColor"/>`;
    };
    const dgDots = (xs, y, kind) => xs.map((x, i) => kind === 'e'
      ? `<circle cx="${x}" cy="${y + (i % 2 ? 7 : -7)}" r="4.5" fill="#60a5fa"/>`
      : `<circle cx="${x}" cy="${y + (i % 2 ? 7 : -7)}" r="4.5" fill="none" stroke="#f87171" stroke-width="2"/>`).join('');
    const DIAGRAMS = {
      'dram-cell': {
        title: 'DRAM 셀 (1T1C) 동작',
        states: [
          { id: 'standby', label: '대기', wl: '0V', on: false, bl: '1/2 Vcc', node: '0 또는 1', charged: null, flow: null,
            desc: '워드라인이 0V라서 트랜지스터가 꺼져 있다. 커패시터는 전하를 가둔 채 값(0 또는 1)을 기억하고, 비트라인은 읽기에 대비해 1/2 Vcc로 미리 충전(프리차지)되어 있다.' },
          { id: 'write1', label: '쓰기 1', wl: 'Vpp (Vcc보다 높음)', on: true, bl: 'Vcc', node: 'Vcc', charged: true, flow: 'in',
            desc: '워드라인을 Vcc보다 높은 전압(Vpp)으로 올려 트랜지스터를 켜고, 비트라인에 Vcc를 건다. 전하가 비트라인에서 커패시터로 흘러 들어가 Vcc까지 충전되면 1이 저장된다.' },
          { id: 'write0', label: '쓰기 0', wl: 'Vpp (Vcc보다 높음)', on: true, bl: '0V', node: '0V', charged: false, flow: 'out',
            desc: '트랜지스터를 켜고 비트라인을 0V로 둔다. 커패시터의 전하가 비트라인으로 빠져나가 0V가 되면 0이 저장된다.' },
          { id: 'read1', label: '읽기 (1 저장)', wl: 'Vpp (Vcc보다 높음)', on: true, bl: '1/2 Vcc + ΔV', node: 'Vcc → 전하 공유', charged: true, flow: 'out',
            desc: '트랜지스터를 켜면 커패시터(Vcc)와 비트라인(1/2 Vcc)이 전하를 나눠 갖는다. 비트라인 전압이 1/2 Vcc보다 ΔV만큼 아주 조금 올라가고, 센스 앰프가 이 차이를 증폭해 1로 판정한다. 읽는 동안 셀 전압이 흐트러지므로(파괴 읽기) 같은 값을 다시 써 넣어야 한다.' },
          { id: 'read0', label: '읽기 (0 저장)', wl: 'Vpp (Vcc보다 높음)', on: true, bl: '1/2 Vcc − ΔV', node: '0V → 전하 공유', charged: false, flow: 'in',
            desc: '커패시터(0V)가 비트라인의 전하 일부를 가져가서 비트라인 전압이 1/2 Vcc보다 ΔV만큼 조금 내려간다. 센스 앰프가 이 차이를 증폭해 0으로 판정하고, 마찬가지로 값을 다시 써 넣는다.' },
        ],
        svg(s) {
          const flow = s.flow ? `<path class="dg-flow ${s.flow === 'out' ? 'rev' : ''}" d="M62 140 H250 V168"/>` : '';
          const fill = s.charged === null ? '' : (s.charged ? '<rect class="dg-charge" x="232" y="172" width="36" height="10" rx="1"/>' : '');
          return `<svg viewBox="0 0 400 300" role="img" aria-label="DRAM 셀 회로도: ${escH(s.label)}">
            <path class="dg-line" d="M20 62 H380"/>
            <text class="dg-t" x="380" y="46" text-anchor="end">WL  <tspan class="dg-volt">V_WL = ${escH(s.wl)}</tspan></text>
            <path class="dg-line" d="M62 18 V258"/>
            <text class="dg-t" x="34" y="34">BL</text>
            <text class="dg-t" x="62" y="282" text-anchor="middle"><tspan class="dg-volt">V_BL = ${escH(s.bl)}</tspan></text>
            <circle cx="170" cy="62" r="4.5" fill="currentColor"/>
            <path class="dg-line" d="M170 62 V98"/>
            <path class="dg-line dg-thick" d="M146 98 H194"/>
            <path class="dg-line dg-thick" d="M150 110 H190"/>
            <path class="dg-line" d="M150 110 V140 H62 M190 110 V140 H250 V170"/>
            <circle cx="62" cy="140" r="4.5" fill="currentColor"/>
            <text class="${s.on ? 'dg-on' : 'dg-off'}" x="204" y="90" font-size="15">${s.on ? 'ON' : 'OFF'}</text>
            ${fill}
            <path class="dg-line dg-thick" d="M228 170 H272 M228 184 H272"/>
            <path class="dg-line" d="M250 184 V214 M234 214 H266 M240 220 H260 M246 226 H254"/>
            <text class="dg-t dg-volt" x="266" y="152">(${escH(s.node)})</text>
            <text class="dg-t dg-sub" x="284" y="181">C</text>
            ${flow}
          </svg>`;
        }
      },
      'mosfet': {
        title: 'MOSFET 동작 영역 (NMOS 단면)',
        states: [
          { id: 'off', label: '차단', vg: 'Vgs < Vth', vd: 'Vds > 0', ch: 'none', cond: '게이트 전압이 문턱 전압보다 낮음', cur: 'Id ≈ 0 (꺼짐)',
            desc: '게이트 전압이 문턱 전압(Vth)보다 낮아 기판 표면에 채널이 만들어지지 않는다. 소스와 드레인 사이에 n-p-n 장벽이 그대로 남아서 전류가 거의 흐르지 않는다.' },
          { id: 'lin', label: '선형', vg: 'Vgs > Vth', vd: 'Vds 작음', ch: 'full', cond: 'Vds < Vgs − Vth', cur: 'Id ∝ Vds (저항처럼)',
            desc: '게이트 전압이 Vth보다 높으면 기판 표면에 전자가 모여 반전층(채널)이 생긴다. 드레인 전압이 낮으면 채널이 소스에서 드레인까지 끊김 없이 이어지고, 전류는 Vds에 비례해 늘어난다. 소자가 전압으로 조절되는 저항처럼 동작한다.' },
          { id: 'sat', label: '포화', vg: 'Vgs > Vth', vd: 'Vds 큼', ch: 'pinch', cond: 'Vds ≥ Vgs − Vth', cur: 'Id ≈ 일정',
            desc: '드레인 전압이 Vgs − Vth 이상이 되면 드레인 쪽 채널이 끊긴 모양(핀치오프)이 된다. 전자는 핀치오프 지점에서 드레인 쪽 강한 전계에 끌려 넘어가고, Vds를 더 올려도 전류는 거의 늘지 않고 일정해진다.' },
          { id: 'clm', label: '채널 길이 변조', vg: 'Vgs > Vth', vd: 'Vds 더 큼', ch: 'pinch2', cond: '포화 영역에서 Vds 증가', cur: 'Id 조금 증가',
            desc: '포화 영역에서 Vds를 더 높이면 핀치오프 지점이 소스 쪽으로 이동해 실제로 전류를 만드는 채널 길이가 ΔL만큼 짧아진다. 그만큼 전류가 조금씩 늘어나는 현상이 채널 길이 변조이다. 채널이 짧을수록 두드러진다.' },
        ],
        svg(s) {
          const ch = { none: `<path class="dg-depl" d="M140 140 Q200 188 260 140"/>${dgT(200, 174, '공핍층', 'dg-sub')}`,
            full: '<rect class="dg-ch" x="140" y="140" width="120" height="12"/>',
            pinch: `<path class="dg-ch" d="M140 140 H236 L140 154 Z"/>${dgT(236, 166, '핀치오프', 'dg-sub')}`,
            pinch2: `<path class="dg-ch" d="M140 140 H222 L140 154 Z"/><path class="dg-line" d="M222 156 H236 M222 152 V160 M236 152 V160"/>${dgT(229, 174, 'ΔL', 'dg-sub')}` }[s.ch];
          const flow = s.ch === 'none' ? '' : dgFlow('M92 146 H308');
          return dgSvg('NMOS 단면: ' + s.label, `
            <path class="dg-line" d="M100 140 V70 M200 100 V70 M300 140 V70"/>
            ${dgT(100, 46, '소스 S')}${dgT(100, 62, '0V', 'dg-volt')}${dgT(200, 46, '게이트 G')}${dgT(200, 62, s.vg, 'dg-volt')}${dgT(300, 46, '드레인 D')}${dgT(300, 62, s.vd, 'dg-volt')}
            <rect class="dg-p" x="40" y="140" width="320" height="110" rx="3"/>
            <rect class="dg-n" x="60" y="140" width="80" height="44"/><rect class="dg-n" x="260" y="140" width="80" height="44"/>
            ${dgT(100, 170, 'n+')}${dgT(300, 170, 'n+')}
            <rect class="dg-ox" x="140" y="130" width="120" height="10"/><rect class="dg-met" x="140" y="100" width="120" height="30"/>
            ${dgT(200, 120, '게이트 전극', 'dg-sub')}${dgT(200, 235, 'p형 기판 (Body)', 'dg-sub')}
            ${ch}${flow}
            ${dgT(200, 272, s.cur, 'dg-volt')}${dgT(200, 290, s.cond, 'dg-sub')}`);
        }
      },
      'pn-junction': {
        title: 'PN 접합 (공핍층과 바이어스)',
        states: [
          { id: 'eq', label: '평형 (전압 없음)', w: 28, e: 44, bat: null, cur: '전류 없음',
            desc: '접합이 만들어지면 p쪽 정공과 n쪽 전자가 서로 확산해 접합 근처에서 만나 사라지고, 이온화된 도펀트(p쪽 −, n쪽 +)만 남은 공핍층이 생긴다. 이 이온들이 만드는 내부 전계가 확산을 막아 평형을 이루고, 전류는 흐르지 않는다.' },
          { id: 'fwd', label: '순방향 바이어스', w: 14, e: 22, bat: 'fwd', cur: '큰 전류가 흐름 (확산 전류)',
            desc: 'p쪽에 +, n쪽에 −를 걸면 외부 전압이 내부 전계(장벽)를 줄인다. 공핍층이 좁아지고, 정공과 전자가 장벽을 넘어 접합을 건너가면서 큰 전류가 흐른다. 전압이 조금만 올라도 전류가 급격히 커진다.' },
          { id: 'rev', label: '역방향 바이어스', w: 50, e: 74, bat: 'rev', cur: '전류 ≈ 0 (아주 작은 역방향 전류)',
            desc: 'p쪽에 −, n쪽에 +를 걸면 외부 전압이 내부 전계를 키워 공핍층이 넓어지고 장벽이 높아진다. 다수 캐리어는 접합을 넘지 못하고, 소수 캐리어가 만드는 아주 작은 역방향 전류만 흐른다.' },
        ],
        svg(s) {
          const L = 200 - s.w, R = 200 + s.w, cols = Math.max(1, Math.round(s.w / 16)), st = s.w / cols;
          const ions = [110, 140, 170].map(y => Array.from({ length: cols }, (_, c) =>
            `${dgT(L + st * (c + .5), y + 5, '−', 'dg-volt')}${dgT(200 + st * (c + .5), y + 5, '+', 'dg-volt')}`).join('')).join('');
          const xs = (a, b) => { const out = []; for (let x = a; x <= b; x += 26) out.push(x); return out; };
          const holes = [110, 140, 170].map((y, i) => dgDots(xs(60 + (i % 2) * 13, L - 10), y, 'h').replace(/cy="[\d.]+"/g, `cy="${y}"`)).join('');
          const elecs = [110, 140, 170].map((y, i) => dgDots(xs(R + 12 + (i % 2) * 13, 336), y, 'e').replace(/cy="[\d.]+"/g, `cy="${y}"`)).join('');
          let bat = '';
          if (s.bat) {
            const f = s.bat === 'fwd';
            bat = `<path class="dg-line" d="M50 190 V240 H188 M350 190 V240 H212"/>
              <path class="dg-line dg-thick" d="M188 ${f ? '226 V254' : '233 V247'}"/><path class="dg-line dg-thick" d="M212 ${f ? '233 V247' : '226 V254'}"/>
              ${dgT(176, 232, f ? '+' : '−', 'dg-volt')}${dgT(224, 232, f ? '−' : '+', 'dg-volt')}`;
          } else bat = '<path class="dg-line" d="M50 190 V240 H350 V190"/>';
          const flow = s.bat === 'fwd' ? dgFlow('M188 240 H50 V97 H350 V240 H212') : '';
          return dgSvg('PN 접합: ' + s.label, `
            <rect class="dg-p" x="40" y="90" width="160" height="100"/><rect class="dg-n" x="200" y="90" width="160" height="100"/>
            <rect class="dg-deplf" x="${L}" y="90" width="${2 * s.w}" height="100"/><path class="dg-depl" d="M${L} 90 V190 M${R} 90 V190"/>
            ${holes}${elecs}${ions}
            ${dgT(60, 80, 'p형', 'dg-sub')}${dgT(340, 80, 'n형', 'dg-sub')}
            ${dgArrow(200 + s.e / 2, 60, 200 - s.e / 2, 60)}${dgT(200, 50, '내부 전계 E', 'dg-sub')}
            <path class="dg-line" d="M${L} 200 V206 M${R} 200 V206 M${L} 203 H${R}"/>${dgT(200, 222, '공핍층', 'dg-sub')}
            ${bat}${flow}
            ${dgT(200, 290, s.cur, 'dg-volt')}`);
        }
      },
      'band-doping': {
        title: '에너지 밴드와 도핑',
        states: [
          { id: 'mat', label: '금속·반도체·절연체',
            desc: '전도는 밴드갭(Eg)이 좌우한다. 금속은 전도대와 가전자대가 겹쳐 전자가 자유롭게 움직이고, 절연체는 갭이 너무 커서 전자가 전도대로 올라가지 못한다. 반도체는 갭이 작아(Si 약 1.1 eV) 온도나 도핑으로 전도를 조절할 수 있다.' },
          { id: 'int', label: '진성 반도체',
            desc: '불순물이 없는 진성 반도체에서는 열에너지로 전자가 가전자대에서 전도대로 올라가며 전자와 정공이 같은 수로 생긴다. 페르미 준위(EF)는 갭의 가운데 근처에 있다.' },
          { id: 'n', label: 'n형 도핑',
            desc: '인(P)이나 비소(As) 같은 도너를 넣으면 전도대 바로 아래에 도너 준위(Ed)가 생겨 전자가 쉽게 전도대로 올라간다. 전자가 많아지고, 페르미 준위가 전도대 쪽으로 올라간다.' },
          { id: 'p', label: 'p형 도핑',
            desc: '붕소(B) 같은 억셉터를 넣으면 가전자대 바로 위에 억셉터 준위(Ea)가 생겨 가전자대의 전자를 받아 간다. 가전자대에 정공이 많아지고, 페르미 준위가 가전자대 쪽으로 내려간다.' },
        ],
        svg(s) {
          if (s.id === 'mat') {
            const col = (cx, name, sub, condY, condH, metal) => `
              <rect class="dg-n" x="${cx - 36}" y="${condY}" width="72" height="${condH}"/><rect class="dg-p" x="${cx - 36}" y="170" width="72" height="50"/>
              ${dgT(cx, 247, name)}${dgT(cx, 265, sub, 'dg-sub')}${metal ? dgDots([cx - 16, cx, cx + 16], 150, 'e') : ''}`;
            return dgSvg('금속·반도체·절연체의 밴드 비교', `
              ${col(80, '금속', '밴드가 겹침', 110, 70, true)}${col(200, '반도체', 'Eg ≈ 1.1 eV (Si)', 100, 42)}${col(320, '절연체', 'Eg ≈ 9 eV (SiO₂)', 38, 52)}
              ${dgT(80, 104, '전도대', 'dg-sub')}${dgT(200, 94, '전도대', 'dg-sub')}${dgT(320, 32, '전도대', 'dg-sub')}
              ${dgT(80, 214, '가전자대', 'dg-sub')}${dgT(200, 214, '가전자대', 'dg-sub')}${dgT(320, 214, '가전자대', 'dg-sub')}
              ${dgArrow(200, 144, 200, 168)}${dgArrow(200, 168, 200, 144)}${dgT(214, 160, 'Eg', 'dg-volt', 'start')}
              ${dgArrow(320, 92, 320, 168)}${dgArrow(320, 168, 320, 92)}${dgT(334, 135, 'Eg', 'dg-volt', 'start')}`);
          }
          const efY = { int: 145, n: 118, p: 172 }[s.id];
          const lvl = s.id === 'n' ? `<path class="dg-depl" d="M150 102 H250"/>${dgT(346, 106, 'Ed', 'dg-sub', 'start')}${dgArrow(180, 100, 180, 86)}${dgArrow(220, 100, 220, 86)}`
            : s.id === 'p' ? `<path class="dg-depl" d="M150 188 H250"/>${dgT(346, 192, 'Ea', 'dg-sub', 'start')}${dgArrow(180, 214, 180, 192)}${dgArrow(220, 214, 220, 192)}` : '';
          const ne = { int: 3, n: 8, p: 1 }[s.id], nh = { int: 3, n: 1, p: 8 }[s.id];
          const xs = (n) => Array.from({ length: n }, (_, i) => 92 + i * (230 / Math.max(1, n - 1)));
          return dgSvg('에너지 밴드: ' + s.label, `
            <rect class="dg-n" x="60" y="40" width="280" height="50"/><rect class="dg-p" x="60" y="200" width="280" height="50"/>
            <path class="dg-line dg-thick" d="M60 90 H340 M60 200 H340"/>
            ${dgT(346, 94, 'Ec', 'dg-sub', 'start')}${dgT(346, 204, 'Ev', 'dg-sub', 'start')}${dgT(120, 58, '전도대', 'dg-sub')}${dgT(120, 242, '가전자대', 'dg-sub')}
            ${dgArrow(72, 96, 72, 194)}${dgArrow(72, 194, 72, 96)}${dgT(84, 140, 'Eg', 'dg-volt', 'start')}
            <path class="dg-depl" d="M100 ${efY} H340" style="stroke:var(--hl-accent);opacity:1"/>${dgT(346, efY + 4, 'EF', 'dg-volt', 'start')}
            ${lvl}${dgDots(xs(ne), 66, 'e')}${dgDots(xs(nh), 224, 'h')}
            ${dgT(200, 280, { int: '전자 수 = 정공 수', n: '전자 ≫ 정공 (다수 캐리어: 전자)', p: '정공 ≫ 전자 (다수 캐리어: 정공)' }[s.id], 'dg-volt')}`);
        }
      },
      'photo-process': {
        title: '포토 공정: 패턴이 옮겨지는 과정',
        states: [
          { id: 'coat', label: '① 감광막 도포',
            desc: '웨이퍼 위의 막(산화막 등) 위에 빛에 반응하는 감광막(포토레지스트, PR)을 얇고 고르게 입힌다. 보통 웨이퍼를 돌려 퍼뜨리는 스핀 코팅을 쓴다.' },
          { id: 'expose', label: '② 노광',
            desc: '회로 패턴이 새겨진 포토마스크를 통해 빛(UV)을 쪼인다. 빛을 받은 감광막은 화학적 성질이 바뀐다. 그림은 빛 받은 부분이 현상액에 녹는 포지티브 PR의 경우이다.' },
          { id: 'develop', label: '③ 현상',
            desc: '현상액으로 씻어내면 빛을 받은 부분의 감광막이 녹아 없어지고, 마스크 패턴과 같은 모양의 감광막만 남는다.' },
          { id: 'etch', label: '④ 식각',
            desc: '감광막이 없는 곳의 막만 식각으로 깎아낸다. 남은 감광막은 식각으로부터 아래 막을 보호하는 마스크 역할을 한다.' },
          { id: 'strip', label: '⑤ 감광막 제거',
            desc: '남은 감광막을 제거하면 마스크의 패턴이 웨이퍼 위의 막에 그대로 옮겨진 상태가 된다. 이 과정을 층마다 되풀이해 회로를 쌓는다.' },
        ],
        svg(s) {
          const blocks = [[30, 100], [140, 200], [240, 310]], gaps = [[100, 140], [200, 240]];
          const R = (x1, x2, y, h, c, extra = '') => `<rect class="${c}" x="${x1}" y="${y}" width="${x2 - x1}" height="${h}" ${extra}/>`;
          const film = s.id === 'etch' || s.id === 'strip' ? blocks.map(b => R(b[0], b[1], 206, 26, 'dg-film')).join('') : R(30, 310, 206, 26, 'dg-film');
          let pr = '', extra = '';
          if (s.id === 'coat') pr = R(30, 310, 176, 30, 'dg-pr');
          if (s.id === 'expose') {
            pr = blocks.map(b => R(b[0], b[1], 176, 30, 'dg-pr')).join('') + gaps.map(g => R(g[0], g[1], 176, 30, 'dg-prx')).join('');
            extra = blocks.map(b => R(b[0], b[1], 120, 14, 'dg-mask')).join('') + dgT(316, 132, '포토마스크', 'dg-sub', 'start') +
              [120, 220].map(x => dgFlow(`M${x} 80 V172`)).join('') + dgT(170, 78, 'UV 빛', 'dg-volt');
          }
          if (s.id === 'develop' || s.id === 'etch') pr = blocks.map(b => R(b[0], b[1], 176, 30, 'dg-pr')).join('');
          if (s.id === 'etch') extra = [120, 220].map(x => dgFlow(`M${x} 130 V204`)).join('') + dgT(170, 126, '식각', 'dg-volt');
          if (s.id === 'coat') extra = '<path d="M170 112 q-7 12 0 17 q7 -5 0 -17 Z" fill="#f472b6"/>' + dgArrow(170, 132, 170, 172) + dgT(170, 98, '감광액을 떨어뜨리고 웨이퍼를 돌림', 'dg-volt');
          if (s.id === 'develop') extra = [120, 220].map(x => dgFlow(`M${x} 120 V172`)).join('') + dgT(170, 108, '현상액으로 빛 받은 부분을 녹여냄', 'dg-volt');
          if (s.id === 'strip') extra = blocks.map(b => `<rect class="dg-depl" x="${b[0]}" y="176" width="${b[1] - b[0]}" height="30"/>`).join('') + dgT(170, 150, '남은 감광막을 벗겨냄(스트립)', 'dg-volt');
          const prLabel = s.id === 'strip' ? '' : dgT(316, 196, '감광막(PR)', 'dg-sub', 'start');
          return dgSvg('포토 공정: ' + s.label, `
            ${R(30, 310, 232, 30, 'dg-fsub')}${film}${pr}${extra}
            ${prLabel}${dgT(316, 223, '막(산화막 등)', 'dg-sub', 'start')}${dgT(316, 252, '웨이퍼(Si)', 'dg-sub', 'start')}
            ${dgT(170, 284, s.label, 'dg-volt')}`, '0 55 400 245');
        }
      },
      'etch-profile': {
        title: '식각 프로파일',
        states: [
          { id: 'iso', label: '등방성 식각',
            desc: '습식 식각처럼 방향성이 없는 식각은 깊이 방향과 옆 방향으로 비슷한 속도로 진행된다. 마스크 아래까지 파고드는 언더컷이 생겨 미세한 패턴을 만들기 어렵다.' },
          { id: 'aniso', label: '이방성 식각',
            desc: '건식(플라즈마) 식각은 이온이 위에서 아래로 가속되어 부딪히기 때문에 주로 수직 방향으로 식각된다. 마스크 모양이 거의 그대로 전사되어 미세 패턴에 적합하다.' },
          { id: 'bowing', label: '보잉(Bowing)',
            desc: '깊은 홀이나 트렌치에서는 이온이 마스크 모서리나 측벽에서 산란·반사되어 측벽 중간을 때릴 수 있다. 그러면 측벽 중간이 바깥으로 불룩해지는 보잉이 생긴다.' },
          { id: 'lowsel', label: '낮은 선택비',
            desc: '식각 선택비는 식각할 막과 마스크·아래층의 식각 속도 비이다. 선택비가 낮으면 마스크가 빨리 닳고, 막이 뚫린 뒤에도 아래층이 함께 깎인다.' },
        ],
        svg(s) {
          const cav = { iso: '<path class="dg-void" d="M95 125 A75 75 0 0 0 245 125 Z"/>',
            aniso: '<rect class="dg-void" x="140" y="125" width="60" height="100"/>',
            bowing: '<path class="dg-void" d="M140 125 C140 142 126 152 126 170 C126 190 145 198 146 225 H194 C195 198 214 190 214 170 C214 152 200 142 200 125 Z"/>',
            lowsel: '<rect class="dg-void" x="140" y="125" width="60" height="125"/>' }[s.id];
          const mTop = s.id === 'lowsel' ? 119 : 105, mH = s.id === 'lowsel' ? 6 : 20;
          const ghost = s.id === 'lowsel' ? '<path class="dg-depl" d="M30 105 H140 V125 M200 125 V105 H310"/>' : '';
          const arrows = s.id === 'iso'
            ? `${dgArrow(150, 150, 108, 150)}${dgArrow(190, 150, 232, 150)}${dgArrow(170, 168, 170, 190)}${dgT(170, 88, '모든 방향으로 식각', 'dg-volt')}`
            : [150, 170, 190].map(x => dgArrow(x, 62, x, 100)).join('') + dgT(170, 54, '이온 (수직 입사)', 'dg-volt');
          return dgSvg('식각 프로파일: ' + s.label, `
            <rect class="dg-fsub" x="30" y="235" width="280" height="30"/><rect class="dg-film" x="30" y="125" width="280" height="110"/>
            ${cav}${ghost}
            <rect class="dg-mask" x="30" y="${mTop}" width="110" height="${mH}"/><rect class="dg-mask" x="200" y="${mTop}" width="110" height="${mH}"/>
            ${arrows}
            ${dgT(316, 118, '마스크', 'dg-sub', 'start')}${dgT(316, 185, '식각할 막', 'dg-sub', 'start')}${dgT(316, 254, '아래층', 'dg-sub', 'start')}
            ${dgT(200, 288, s.label, 'dg-volt')}`);
        }
      },
      'step-coverage': {
        title: '박막 증착과 단차 피복성',
        states: [
          { id: 'pvd', label: 'PVD (스퍼터링)', t: 26, sd: 6, b: 12, o: 16, q: '단차 피복성: 낮음', src: 'straight',
            desc: '스퍼터링으로 튀어나온 원자가 주로 위에서 직선으로 날아와 쌓인다. 상단과 홈 입구 모서리에는 막이 두껍고, 측벽과 바닥은 얇다. 입구가 좁아지는 오버행이 생겨 깊은 홈에는 불리하다.' },
          { id: 'cvd', label: 'CVD', t: 20, sd: 14, b: 16, o: 4, q: '단차 피복성: 중간', src: 'diffuse',
            desc: '기체가 표면에서 반응해 막이 생긴다. 기체가 홈 속으로 퍼져 들어가므로 PVD보다 측벽과 바닥에도 잘 쌓인다. 다만 입구 쪽이 조금 더 두꺼워질 수 있다.' },
          { id: 'ald', label: 'ALD', t: 14, sd: 14, b: 14, o: 0, q: '단차 피복성: 거의 100% (균일)', src: 'ald',
            desc: '전구체를 번갈아 넣어 표면에 한 층씩 흡착·반응시키는 방식이다. 표면 반응이 포화되면 멈추는 자기 제한 성장이라서 상단·측벽·바닥 두께가 거의 같은 균일한 막(conformal)이 된다. 대신 성장 속도는 느리다.' },
        ],
        svg(s) {
          const R = (x, y, w, h, c = 'dg-film') => `<rect class="${c}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
          const src = s.src === 'straight' ? [80, 125, 170, 215, 260].map(x => dgArrow(x, 40, x, 82)).join('') + dgT(170, 30, '원자 (직진 입사)', 'dg-volt')
            : s.src === 'diffuse' ? [[90, 40, 110, 84], [150, 40, 160, 84], [200, 40, 180, 84], [250, 40, 232, 84]].map(a => dgArrow(...a)).join('') + dgT(170, 30, '반응 기체 (확산)', 'dg-volt')
            : dgT(170, 30, '전구체 A → 퍼지 → 전구체 B → 퍼지 (반복)', 'dg-volt');
          const over = s.o ? `<rect class="dg-film" x="130" y="${110 - s.t}" width="${s.o}" height="${s.t * 1.5}" rx="4"/><rect class="dg-film" x="${210 - s.o}" y="${110 - s.t}" width="${s.o}" height="${s.t * 1.5}" rx="4"/>` : '';
          return dgSvg('박막 증착: ' + s.label, `
            <path class="dg-fsub" d="M30 110 H130 V230 H210 V110 H310 V270 H30 Z"/>
            ${R(30, 110 - s.t, 100, s.t)}${R(210, 110 - s.t, 100, s.t)}${R(130, 110, s.sd, 120)}${R(210 - s.sd, 110, s.sd, 120)}${R(130, 230 - s.b, 80, s.b)}${over}
            ${src}
            ${dgT(316, 104, '상단', 'dg-sub', 'start')}${s.o > 8 ? dgT(316, 124, '오버행', 'dg-sub', 'start') : ''}${dgT(316, 170, '측벽', 'dg-sub', 'start')}${dgT(316, 250, '바닥', 'dg-sub', 'start')}
            ${dgT(170, 288, s.q, 'dg-volt')}`);
        }
      },
      'channel-length-mod': {
        title: '채널 길이 변조',
        states: [
          { id: 'lin', label: '선형 영역', pin: null, q: 'V_DS가 작음 · 채널이 소스에서 드레인까지 이어짐',
            desc: 'V_DS가 작으면 게이트 아래 채널이 소스에서 드레인까지 거의 균일하게 이어지고, 전류는 V_DS에 거의 비례해 늘어난다.' },
          { id: 'sat', label: '핀치오프 (포화 시작)', pin: 246, q: 'V_DS = V_GS − V_th · 드레인 쪽 끝에서 채널이 끊김',
            desc: 'V_DS가 V_GS − V_th에 이르면 드레인 쪽 끝에서 게이트와 드레인 사이 전압차가 문턱 전압만큼으로 줄어 채널이 사라진다(핀치오프). 이때부터 전류가 포화된다.' },
          { id: 'clm', label: '채널 길이 변조', pin: 214, q: 'V_DS > V_GS − V_th · 핀치오프점이 소스 쪽으로 이동',
            desc: 'V_DS를 더 올리면 핀치오프점이 소스 쪽으로 밀려나 채널이 끊기는 구간(공핍 영역)이 길어지고, 전류가 흐르는 유효 채널 길이는 L에서 L − ΔL로 짧아진다. 전류는 유효 채널 길이에 반비례하므로 포화 영역에서도 V_DS가 오르면 전류가 조금씩 증가한다. 채널이 짧은 소자일수록 ΔL/L이 커서 영향이 크다.' },
        ],
        svg(s) {
          const S = 150, D = 250, p = s.pin, y = 110;
          const ch = p === null ? `<path class="dg-ch" d="M${S} ${y} H${D} V${y + 9} H${S} Z"/>` : `<path class="dg-ch" d="M${S} ${y} H${p} L${p - 2} ${y + 3} L${S} ${y + 10} Z"/>`;
          const clm = s.id === 'clm';
          const depl = p !== null ? `<rect class="dg-deplf" x="${p}" y="${y}" width="${D + 10 - p}" height="44"/><path class="dg-depl" d="M${p} ${y} V${y + 44} H${D + 10}"/>` : '';
          const flowEnd = p === null ? D : D + 30;
          const bot = clm
            ? `${dgArrow(S + 2, 226, p, 226)}${dgArrow(p, 226, S + 2, 226)}${dgT((S + p) / 2, 244, "유효 길이 L′", 'dg-volt')}${dgArrow(p + 2, 226, D + 10, 226)}${dgArrow(D + 10, 226, p + 2, 226)}${dgT((p + D + 10) / 2, 244, 'ΔL', 'dg-volt')}`
            : '';
          return dgSvg('채널 길이 변조: ' + s.label, `
            <rect class="dg-p" x="50" y="${y}" width="300" height="100"/>
            <rect class="dg-n" x="90" y="${y}" width="${S - 90}" height="44"/><rect class="dg-n" x="${D}" y="${y}" width="${340 - D}" height="44"/>
            ${depl}${ch}
            <rect class="dg-ox" x="${S}" y="${y - 8}" width="${D - S}" height="8"/><rect class="dg-met" x="${S}" y="70" width="${D - S}" height="${y - 8 - 70}"/>
            ${dgFlow(`M${S - 40} ${y + 5} H${flowEnd}`)}
            ${dgT(200, 62, '게이트', 'dg-sub')}${dgT(120, y + 28, 'n+ 소스', 'dg-sub')}${dgT(295, y + 28, 'n+ 드레인', 'dg-sub')}${dgT(120, y + 78, 'p형 기판', 'dg-sub')}
            ${p === null ? '' : `<path class="dg-line" d="M${p} ${y + 8} V${y + 60}" style="stroke-dasharray:3 3"/>` + dgT(p, y + 74, '핀치오프점', 'dg-volt')}
            ${bot || `${dgArrow(S + 2, 226, D - 2, 226)}${dgArrow(D - 2, 226, S + 2, 226)}${dgT(200, 244, '채널 길이 L', 'dg-sub')}`}
            ${dgT(200, 280, s.q, 'dg-volt')}`);
        }
      },
      'gate-oxide': {
        title: '게이트 산화막과 누설 전류',
        states: [
          { id: 'thick', label: '두꺼운 SiO₂', t: 30, leak: 0, e: 2, q: '게이트 제어 약함 · 누설 전류 거의 없음',
            desc: '산화막이 두꺼우면 게이트 전압이 채널에 약하게 전해져 같은 전압으로 모을 수 있는 채널 전하(반전층 전하)가 적다. 대신 전자가 산화막을 뚫고 새는 누설은 거의 없다.' },
          { id: 'thin', label: '얇은 SiO₂ (약 1 nm)', t: 8, leak: 3, e: 6, q: '게이트 제어 강함 · 터널링 누설 전류 큼',
            desc: '소자를 줄이며 산화막을 아주 얇게 하면 게이트가 채널을 강하게 제어한다. 하지만 두께가 1 nm 안팎이 되면 전자가 양자역학적 터널링으로 산화막을 직접 통과해 게이트 누설 전류가 크게 늘어난다.' },
          { id: 'highk', label: 'High-k + 금속 게이트', t: 22, leak: 1, e: 6, hk: true, q: '전기적 두께(EOT)는 얇게 · 물리 두께는 두껍게',
            desc: '하프늄 산화물(HfO₂) 같은 High-k 물질은 유전율이 SiO₂(약 3.9)보다 훨씬 높아서, 물리적으로 더 두껍게 만들어도 SiO₂ 얇은 막과 같은 게이트 제어력(같은 EOT)을 낸다. 두꺼운 만큼 터널링 누설이 크게 줄어든다. 2000년대 후반 양산 공정부터 금속 게이트와 함께 쓰이기 시작했다.' },
        ],
        svg(s) {
          const y0 = 98, t = s.t, yb = y0 + t;
          const leak = [0, 1, 2].slice(0, s.leak).map(i => dgFlow(`M${150 + i * 50} ${yb + 24} V${y0 - 6}`, true)).join('');
          const el = dgDots(Array.from({ length: s.e }, (_, i) => 100 + i * 40), yb + 30, 'e').replace(/cy="/g, 'cy="');
          return dgSvg('게이트 산화막: ' + s.label, `
            <rect class="dg-met" x="70" y="56" width="240" height="${y0 - 56}"/>
            <rect class="${s.hk ? 'dg-hk' : 'dg-ox'}" x="70" y="${y0}" width="240" height="${t}"/>
            <rect class="dg-si" x="70" y="${yb}" width="240" height="${250 - yb}"/>
            ${leak}${el}
            ${dgT(316, 82, '게이트', 'dg-sub', 'start')}${dgT(316, y0 + t / 2 + 4, s.hk ? 'High-k 막' : '산화막', 'dg-sub', 'start')}${dgT(316, yb + 40, '채널(Si)', 'dg-sub', 'start')}
            ${dgArrow(52, y0 + t / 2, 52, y0)}${dgArrow(52, y0 + t / 2, 52, yb)}${dgT(46, y0 + t / 2 + 4, '두께', 'dg-sub', 'end')}
            ${dgT(200, 280, s.q, 'dg-volt')}`);
        }
      },
      'cvd-reactor': {
        title: 'CVD 반응 과정',
        states: [
          { id: 'feed', label: '① 기체 공급', film: 0, ads: 0, by: 0, out: false, q: '반응 기체가 위에서 웨이퍼로 공급됨',
            desc: '반응 기체(전구체)를 샤워헤드로 챔버에 넣는다. 예를 들어 실리콘 산화막은 SiH₄나 TEOS 같은 실리콘 원료와 산소 계열 기체를 쓴다. 기체는 웨이퍼 위의 얇은 경계층을 지나 표면으로 확산한다.' },
          { id: 'ads', label: '② 표면 흡착', film: 0, ads: 1, by: 0, out: false, q: '기체 분자가 가열된 웨이퍼 표면에 달라붙음',
            desc: '가열된 웨이퍼 표면에 기체 분자가 달라붙는다(흡착). 표면의 온도가 반응에 필요한 에너지를 준다. 플라즈마를 쓰는 PECVD는 플라즈마로 기체를 활성화해서 더 낮은 온도에서도 반응시킨다.' },
          { id: 'rxn', label: '③ 표면 반응·막 성장', film: 10, ads: 0, by: 1, out: false, q: '표면에서 반응해 고체 막이 쌓이고 부산물이 생김',
            desc: '흡착한 분자들이 표면에서 화학 반응을 일으켜 고체 막이 되어 쌓인다. 이 반응에서 막이 되지 않는 부산물(기체)도 함께 생긴다. 반응이 표면에서 일어나기 때문에 PVD보다 홈 안쪽에도 막이 비교적 잘 입혀진다.' },
          { id: 'exh', label: '④ 부산물 배출', film: 16, ads: 0, by: 1, out: true, q: '부산물과 남은 기체는 펌프로 배기',
            desc: '반응 부산물과 쓰고 남은 기체는 진공 펌프로 챔버 밖으로 빼낸다. 부산물이 막 속에 남으면 불순물이 되므로 잘 배출해야 한다. 이 과정이 반복되며 막이 계속 두꺼워진다.' },
        ],
        svg(s) {
          const wy = 200, fh = s.film;
          const gas = s.id === 'feed' ? [150, 200, 250].map(x => dgArrow(x, 82, x, 150)).join('') + dgT(200, 56, '반응 기체', 'dg-volt') : '';
          const ads = s.ads ? [140, 170, 200, 230, 260].map(x => `<circle cx="${x}" cy="${wy - 6}" r="5" fill="#f59e0b"/>`).join('') : '';
          const by = s.by && !s.out ? [150, 210, 260].map(x => `<circle cx="${x}" cy="${wy - fh - 22}" r="4.5" fill="none" stroke="#f87171" stroke-width="2"/>${dgArrow(x, wy - fh - 30, x, wy - fh - 56)}`).join('') : '';
          const out = s.out ? [150, 190].map(y0 => dgArrow(150, wy - fh - 26 - (y0 - 150) / 2, 336, wy - fh - 26 - (y0 - 150) / 2)).join('') + dgT(342, wy - fh - 20, '배기', 'dg-sub', 'start') : '';
          return dgSvg('CVD: ' + s.label, `
            <rect class="dg-fsub" x="46" y="52" width="308" height="214" rx="6" style="fill-opacity:.04"/>
            <path class="dg-line" d="M110 78 H290"/>${[130, 160, 190, 220, 250, 270].map(x => `<circle cx="${x}" cy="78" r="2" fill="currentColor"/>`).join('')}
            ${dgT(66, 74, '샤워헤드', 'dg-sub', 'start')}
            <rect class="dg-heat" x="100" y="${wy + 10}" width="200" height="16"/>${dgT(66, wy + 22, '히터', 'dg-sub', 'start')}
            <rect class="dg-si" x="110" y="${wy}" width="180" height="10"/>
            ${fh ? `<rect class="dg-film" x="110" y="${wy - fh}" width="180" height="${fh}"/>` : ''}
            ${gas}${ads}${by}${out}
            ${dgT(200, 284, s.q, 'dg-volt')}`);
        }
      },
      'ald-cycle': {
        title: 'ALD 한 사이클',
        states: [
          { id: 'a', label: '① 전구체 A 주입', a: 'ads', film: false, purge: false, q: '표면의 자리가 모두 차면 흡착이 멈춤 (자기 제한)',
            desc: '첫 번째 전구체 A를 넣으면 표면의 빈 자리에 한 층만 달라붙는다. 표면이 가득 차면 더 이상 붙지 않으므로, 넣는 양이 많아도 한 층에서 멈춘다. 이것이 ALD의 자기 제한 성질이다.' },
          { id: 'p1', label: '② 퍼지', a: 'ads', film: false, purge: true, q: '남은 A는 불활성 기체로 씻어냄',
            desc: '불활성 기체로 챔버를 씻어 표면에 붙지 않은 A를 내보낸다. 표면에 달라붙은 한 층만 남는다. A와 B가 챔버 안에서 섞이지 않게 해서 기체 상태의 반응(CVD처럼 되는 것)을 막는다.' },
          { id: 'b', label: '③ 반응물 B 주입', a: 'rxn', film: true, purge: false, q: 'B가 A 층과 반응해 막 한 층이 생김',
            desc: '두 번째 반응물 B(예: 물, 오존, 플라즈마)를 넣으면 표면의 A 층과 반응해 원하는 박막 한 층이 만들어진다. 이 반응도 표면의 A가 다 쓰이면 멈춘다.' },
          { id: 'p2', label: '④ 퍼지', a: 'none', film: true, purge: true, q: '1사이클 끝 · 원자층 한 층 성장 (보통 0.1 nm 안팎)',
            desc: '남은 B와 부산물을 다시 씻어낸다. 한 사이클에 보통 0.1 nm(1 Å) 안팎의 막이 자란다. 이 사이클을 반복하는 횟수로 두께를 정확히 조절한다. 대신 성장 속도는 느리다.' },
        ],
        svg(s) {
          const sy = 214, X = [100, 140, 180, 220, 260, 300];
          const ads = s.a === 'ads' ? X.map(x => `<circle cx="${x}" cy="${sy - 7}" r="7" fill="#f59e0b"/>`).join('') : s.a === 'rxn' ? X.map(x => `<circle cx="${x}" cy="${sy - 7}" r="7" fill="#f59e0b" fill-opacity=".45"/>`).join('') : '';
          const feedA = s.id === 'a' ? [120, 200, 280].map(x => `<circle cx="${x}" cy="110" r="7" fill="#f59e0b"/>${dgArrow(x, 122, x, 162)}`).join('') + dgT(200, 78, '전구체 A', 'dg-volt') : '';
          const feedB = s.id === 'b' ? [120, 200, 280].map(x => `<circle cx="${x}" cy="110" r="7" fill="#60a5fa"/>${dgArrow(x, 122, x, 162)}`).join('') + dgT(200, 78, '반응물 B', 'dg-volt') : '';
          const purge = s.purge ? [110, 140, 170].map(y => dgArrow(70, y, 330, y)).join('') + dgT(200, 90, '불활성 기체로 퍼지', 'dg-volt') : '';
          const newf = s.film ? `<rect class="dg-film" x="80" y="${sy - 12}" width="240" height="12"/>` : '';
          return dgSvg('ALD: ' + s.label, `
            <rect class="dg-fsub" x="60" y="${sy + 24}" width="280" height="28"/>
            <rect class="dg-film" x="80" y="${sy + 0 + (s.film ? 0 : 0)}" width="240" height="24" style="fill-opacity:.25"/>
            ${newf ? '' : ''}${s.film ? `<rect class="dg-film" x="80" y="${sy - 12}" width="240" height="12"/>` : ''}
            ${ads}${feedA}${feedB}${purge}
            ${dgT(346, sy + 10, '이전 사이클의 막', 'dg-sub', 'start')}${dgT(346, sy + 42, '기판', 'dg-sub', 'start')}
            ${dgT(200, 284, s.q, 'dg-volt')}`);
        }
      },
      'plasma-etch': {
        title: '플라즈마 식각',
        states: [
          { id: 'gen', label: '① 플라즈마 생성', q: '기체 → 이온 · 전자 · 라디칼', depth: 0, acc: false,
            desc: '식각 기체에 RF 전력을 걸면 기체가 전자와 이온, 반응성이 큰 라디칼(중성 조각)이 섞인 플라즈마가 된다. 전체적으로는 중성이지만 이온과 라디칼이 식각의 재료가 된다.' },
          { id: 'acc', label: '② 이온 가속', q: '바이어스 전압이 이온을 수직으로 가속', depth: 0, acc: true,
            desc: '웨이퍼 쪽에 건 바이어스 전압이 플라즈마와 웨이퍼 사이(쉬스)에 전기장을 만든다. 양이온은 이 전기장에서 웨이퍼 표면에 수직으로 가속되어 부딪힌다. 이 방향성이 이방성 식각의 이유다.' },
          { id: 'etch', label: '③ 식각 진행', q: '바닥: 이온 충돌 + 화학 반응 · 측벽: 보호막', depth: 30, acc: true,
            desc: '홈 바닥에서는 이온 충돌이 결합을 끊고 라디칼이 반응해 휘발성 부산물이 만들어져 막이 깎인다. 측벽에는 이온이 거의 닿지 않고 보호막(폴리머)이 쌓여 옆으로는 식각되지 않는다. 그래서 마스크 모양대로 수직으로 파들어간다. 부산물은 펌프로 배기한다.' },
        ],
        svg(s) {
          const rnd = (n, a, b) => Array.from({ length: n }, (_, i) => a + ((i * 53 + 17) % 100) / 100 * (b - a));
          const xs = [96, 130, 164, 198, 232, 266, 300];
          const plasma = xs.map((x, i) => {
            const y = 84 + (i * 37) % 46, k = i % 3;
            return k === 0 ? `<circle cx="${x}" cy="${y}" r="4.5" fill="none" stroke="#f87171" stroke-width="2"/>` : k === 1 ? `<circle cx="${x}" cy="${y}" r="3" fill="#60a5fa"/>` : `<circle cx="${x}" cy="${y}" r="4.5" fill="#f59e0b"/>`;
          }).join('');
          const acc = s.acc ? [176, 200, 224].map(x => dgArrow(x, 146, x, 184 + (s.depth ? 18 : 0))).join('') : '';
          const side = s.depth ? `<path class="dg-hlp" d="M160 196 V${196 + s.depth} M240 196 V${196 + s.depth}"/>` : '';
          return dgSvg('플라즈마 식각: ' + s.label, `
            <rect class="dg-mask" x="80" y="44" width="240" height="6"/>${dgT(330, 52, 'RF', 'dg-volt', 'start')}
            <rect class="dg-deplf" x="80" y="58" width="240" height="84" rx="10"/><path class="dg-depl" d="M80 142 H320"/>
            ${plasma}${dgT(330, 100, '플라즈마', 'dg-sub', 'start')}${dgT(330, 164, '쉬스', 'dg-sub', 'start')}
            ${acc}
            <rect class="dg-fsub" x="110" y="236" width="180" height="26"/>
            <rect class="dg-film" x="110" y="196" width="180" height="40"/>
            ${s.depth ? `<rect class="dg-void" x="160" y="196" width="80" height="${s.depth}"/>` : ''}
            <rect class="dg-mask" x="110" y="188" width="50" height="8"/><rect class="dg-mask" x="240" y="188" width="50" height="8"/>
            ${side}${s.depth ? dgArrow(190, 150, 190, 196) : ''}
            ${dgT(298, 224, '식각할 막', 'dg-sub', 'start')}
            ${dgT(200, 284, s.q, 'dg-volt')}`);
        }
      },
      'resolution-dof': {
        title: '해상도와 초점 심도',
        states: [
          { id: 'base', label: '기준', hw: 56, d: 22, r: 30, per: 26, q1: '해상도 R = k₁ · λ / NA', q2: '초점 심도 DOF = k₂ · λ / NA²',
            desc: '노광 장비의 해상도(만들 수 있는 최소 선폭) R은 빛의 파장 λ에 비례하고 렌즈의 개구수 NA에 반비례한다. 초점 심도(DOF)는 웨이퍼가 초점에서 위아래로 벗어나도 패턴이 선명하게 찍히는 범위로, 클수록 공정이 안정적이다.' },
          { id: 'na', label: 'NA를 키우면', hw: 86, d: 10, r: 20, per: 26, q1: '해상도 좋아짐 (R 작아짐)', q2: '초점 심도는 NA²에 반비례해 크게 줄어듦',
            desc: 'NA는 렌즈가 빛을 모으는 각도에 해당한다. NA를 키우면 R이 작아져 더 가는 선폭을 만들 수 있다. 하지만 DOF는 NA의 제곱에 반비례하므로 크게 줄어, 웨이퍼 평탄도와 초점 제어가 훨씬 까다로워진다.' },
          { id: 'lam', label: '파장을 줄이면', hw: 56, d: 15, r: 21, per: 15, q1: '해상도 좋아짐 (R 작아짐)', q2: '초점 심도도 λ에 비례해 줄어듦',
            desc: '파장 λ를 줄이면 R이 작아진다. 이것이 노광 광원을 KrF, ArF, EUV로 바꿔 온 이유다. DOF도 λ에 비례하므로 같이 줄어든다. 다만 EUV는 NA가 작은 렌즈로도 충분한 해상도를 얻을 수 있어 NA 증가의 부담을 덜 수 있다.' },
        ],
        svg(s) {
          const fy = 190, hw = s.hw;
          const wave = (() => { let d = 'M110 40'; for (let x = 110; x <= 290; x += 3) d += ` L${x} ${(36 + 7 * Math.sin((x - 110) / s.per * Math.PI * 2)).toFixed(1)}`; return `<path class="dg-line" d="${d}" style="stroke-width:1.6"/>`; })();
          return dgSvg('해상도와 초점 심도: ' + s.label, `
            ${wave}${dgT(330, 40, '빛 (파장 λ)', 'dg-sub', 'start')}
            <path class="dg-line" d="M${200 - 70} 86 Q200 66 ${200 + 70} 86 Q200 106 ${200 - 70} 86 Z" style="fill:currentColor;fill-opacity:.12"/>${dgT(330, 90, '렌즈', 'dg-sub', 'start')}
            <path class="dg-line" d="M${200 - hw} 96 L200 ${fy} L${200 + hw} 96" style="stroke-width:1.6;stroke:var(--hl-accent)"/>
            <rect class="dg-fsub" x="70" y="${fy}" width="260" height="30"/><path class="dg-line" d="M70 ${fy} H330"/>
            <path class="dg-depl" d="M${200 - 76} ${fy - s.d} H${200 + 76} M${200 - 76} ${fy + s.d} H${200 + 76}"/>
            ${dgArrow(296, fy, 296, fy - s.d)}${dgArrow(296, fy, 296, fy + s.d)}${dgT(306, fy - 28, '초점 심도', 'dg-sub', 'start')}
            <rect class="dg-pr" x="${200 - s.r / 2}" y="${fy - 8}" width="${s.r}" height="8"/>${dgT(200, fy + 48, '↑ 찍히는 선폭', 'dg-sub')}
            ${dgT(200, 270, s.q1, 'dg-volt')}${dgT(200, 288, s.q2, 'dg-volt')}`);
        }
      },
      'tsv-process': {
        title: 'TSV 형성 과정',
        states: [
          { id: 'etch', label: '① TSV 홀 식각', q: '깊은 반응성 이온 식각(DRIE)으로 깊은 구멍을 팜',
            desc: '실리콘에 칩을 수직으로 관통할 구멍을 판다. 구멍이 가늘고 깊어서 식각과 측벽 보호를 번갈아 하는 보슈(Bosch) 방식의 깊은 반응성 이온 식각(DRIE)을 주로 쓴다.' },
          { id: 'liner', label: '② 절연막·배리어·시드', q: '절연막(SiO₂) → 배리어(Ta/TaN) → 구리 시드',
            desc: '구멍 안쪽에 먼저 절연막(SiO₂)을 입혀 구리가 실리콘과 전기적으로 닿지 않게 한다. 그 위에 구리가 퍼지는 것을 막는 배리어(Ta, TaN 등)와 도금용 구리 시드층을 얇게 입힌다.' },
          { id: 'fill', label: '③ 구리 충진 + CMP', q: '전기도금으로 구리를 채우고 CMP로 윗면 평탄화',
            desc: '시드층을 전극으로 삼아 구리를 전기도금해서 구멍을 채운다. 위로 넘친 구리는 CMP로 깎아 평탄하게 만든다. 이렇게 하면 실리콘 안에 구리 기둥이 세워진다.' },
          { id: 'thin', label: '④ 웨이퍼 박화·후면 노출', q: '뒷면을 갈아 내어 구리 기둥 끝을 드러냄',
            desc: '웨이퍼 뒷면을 연삭(백그라인딩)하고 연마해서 실리콘을 얇게 만들면 구리 기둥의 끝이 뒷면으로 드러난다. 이제 앞면과 뒷면이 구리 기둥으로 연결되어, 칩을 위아래로 쌓아 신호와 전력을 통과시킬 수 있다.' },
        ],
        svg(s) {
          const thin = s.id === 'thin', y1 = 92, y2 = thin ? 206 : 262;
          const hole = `x="180" y="${y1}" width="40" height="${150}"`;
          const lin = s.id === 'liner' ? `<path class="dg-line dg-hl" d="M180 ${y1} V242 H220 V${y1}"/><path class="dg-line" style="stroke:#a78bfa" d="M184 ${y1} V238 H216 V${y1}"/>` : '';
          const cu = s.id === 'fill' || thin ? `<rect class="dg-cu" x="180" y="${y1}" width="40" height="${thin ? 118 : 150}"/>` : '';
          const cut = thin ? `<rect class="dg-deplf" x="60" y="206" width="280" height="56"/><path class="dg-depl" d="M60 206 H340"/>${dgT(200, 236, '연삭으로 제거', 'dg-sub')}` : '';
          return dgSvg('TSV: ' + s.label, `
            <rect class="dg-ox" x="60" y="72" width="280" height="20"/>${dgT(346, 86, '배선층', 'dg-sub', 'start')}
            <rect class="dg-si" x="60" y="${y1}" width="280" height="${y2 - y1}"/>${dgT(346, 150, '실리콘', 'dg-sub', 'start')}
            ${s.id === 'etch' || s.id === 'liner' ? `<rect class="dg-void" ${hole}/>` : ''}
            ${lin}${cu}${cut}
            ${s.id === 'etch' ? dgArrow(200, 54, 200, 90) + dgT(200, 46, '식각 이온', 'dg-volt') : ''}
            ${dgT(200, 284, s.q, 'dg-volt')}`);
        }
      },
      'damascene': {
        title: '구리 다마신 공정',
        states: [
          { id: 'trench', label: '① 홈 만들기',
            desc: '구리는 건식 식각으로 깎기 어려워서, 먼저 절연막에 배선 모양의 홈(트렌치)을 파는 방식을 쓴다. 이것이 다마신 공정의 출발점이다.' },
          { id: 'barrier', label: '② 배리어·시드층',
            desc: '홈 안쪽과 표면 전체에 배리어 금속(Ta, TaN 등)과 얇은 구리 시드층을 입힌다. 배리어는 구리가 절연막과 실리콘 속으로 퍼져 소자를 망치는 것을 막는다.' },
          { id: 'plate', label: '③ 구리 전기도금',
            desc: '시드층을 전극으로 삼아 구리를 전기도금하면 홈이 구리로 채워지고, 표면에도 구리가 넘치게 쌓인다.' },
          { id: 'cmp', label: '④ CMP 평탄화',
            desc: '화학적 기계 연마(CMP)로 표면에 넘친 구리와 배리어를 깎아내면 홈 안의 구리만 남아 배선이 된다. 표면이 평탄해져 다음 층을 쌓기 좋다.' },
        ],
        svg(s) {
          const dielec = '<path class="dg-ox" d="M30 130 H130 V190 H210 V130 H310 V250 H30 Z"/>';
          let layers = '';
          if (s.id === 'barrier') layers = '<path class="dg-bar" d="M30 128 H130 V188 H210 V128 H310"/>';
          if (s.id === 'plate') layers = '<rect class="dg-cu" x="30" y="104" width="280" height="22"/><rect class="dg-cu" x="132" y="126" width="76" height="62"/><path class="dg-bar" d="M30 128 H130 V188 H210 V128 H310"/>';
          if (s.id === 'cmp') layers = '<rect class="dg-cu" x="132" y="130" width="76" height="58"/><path class="dg-bar" d="M130 130 V190 H210 V130"/>' + dgArrow(250, 100, 290, 100) + dgArrow(290, 100, 250, 100) + dgT(270, 90, 'CMP 연마', 'dg-volt');
          return dgSvg('구리 다마신: ' + s.label, `
            <rect class="dg-fsub" x="30" y="250" width="280" height="20"/>${dielec}${layers}
            ${dgT(316, 215, '절연막', 'dg-sub', 'start')}${dgT(316, 264, '하부층', 'dg-sub', 'start')}
            ${s.id !== 'trench' ? dgT(316, 192, '배리어', 'dg-sub', 'start') : ''}${s.id === 'plate' || s.id === 'cmp' ? dgT(316, s.id === 'plate' ? 118 : 160, '구리', 'dg-sub', 'start') : ''}
            ${dgT(170, 288, s.label, 'dg-volt')}`, '0 80 400 220');
        }
      },
      'finfet-gaa': {
        title: '게이트가 채널을 감싸는 방식',
        states: [
          { id: 'planar', label: '평면(Planar)', sides: '1면',
            desc: '평면 구조에서는 게이트가 채널의 위쪽 한 면만 덮는다. 채널이 짧아지면 드레인 쪽 전계가 게이트를 거치지 않고 채널에 영향을 주어, 꺼진 상태에서도 누설 전류가 커진다.' },
          { id: 'fin', label: 'FinFET', sides: '3면',
            desc: 'FinFET은 채널을 얇게 세운 핀(Fin) 모양으로 만들고, 게이트가 위와 양옆 세 면을 감싼다. 게이트의 채널 제어력이 좋아져 누설이 줄고 단채널 효과가 억제된다.' },
          { id: 'gaa', label: 'GAA 나노시트', sides: '4면(사방)',
            desc: 'GAA(Gate-All-Around)는 가로로 쌓은 나노시트 채널을 게이트가 네 면 모두 감싼다. 제어력이 가장 좋고, 시트의 폭과 개수로 구동 전류를 조절할 수 있다.' },
        ],
        svg(s) {
          let body = '';
          if (s.id === 'planar') body = `
            <rect class="dg-fsub" x="30" y="200" width="280" height="62"/>
            <rect class="dg-met" x="120" y="150" width="100" height="40"/><rect class="dg-ox" x="120" y="190" width="100" height="8"/>
            <path class="dg-line dg-hl" d="M120 200 H220"/>
            ${dgT(316, 175, '게이트', 'dg-sub', 'start')}${dgT(316, 196, '산화막', 'dg-sub', 'start')}${dgT(316, 235, '기판(채널은 표면)', 'dg-sub', 'start')}
            ${dgArrow(170, 132, 170, 146)}${dgT(170, 124, '게이트가 위에서만', 'dg-volt')}`;
          if (s.id === 'fin') body = `
            <rect class="dg-fsub" x="30" y="236" width="280" height="26"/>
            <rect class="dg-met" x="126" y="106" width="88" height="130"/><rect class="dg-ox" x="140" y="120" width="60" height="116"/>
            <rect class="dg-si" x="146" y="126" width="48" height="110"/>
            <path class="dg-line dg-hl" d="M146 236 V126 H194 V236"/>
            ${dgT(316, 150, '게이트', 'dg-sub', 'start')}${dgT(316, 175, '핀(채널)', 'dg-sub', 'start')}${dgT(316, 250, '기판', 'dg-sub', 'start')}
            ${dgArrow(170, 78, 170, 102)}${dgArrow(104, 170, 122, 170)}${dgArrow(236, 170, 218, 170)}${dgT(170, 70, '위·양옆 3면에서 제어', 'dg-volt')}`;
          if (s.id === 'gaa') body = `
            <rect class="dg-fsub" x="30" y="236" width="280" height="26"/>
            <rect class="dg-met" x="116" y="100" width="108" height="136"/>
            ${[112, 152, 192].map(y => `<rect class="dg-ox" x="126" y="${y - 4}" width="88" height="26"/><rect class="dg-si" x="130" y="${y}" width="80" height="18"/><rect class="dg-hl" x="130" y="${y}" width="80" height="18" style="fill:none"/>`).join('')}
            ${dgT(316, 150, '게이트', 'dg-sub', 'start')}${dgT(316, 175, '나노시트(채널)', 'dg-sub', 'start')}${dgT(316, 250, '기판', 'dg-sub', 'start')}
            ${dgT(170, 84, '시트마다 사방을 감싸서 제어', 'dg-volt')}`;
          return dgSvg('게이트 구조: ' + s.label, `${body}${dgT(170, 288, s.label + ' — 게이트가 감싸는 면: ' + s.sides, 'dg-volt')}`);
        }
      },
      'hbm-tsv': {
        title: 'HBM과 2.5D 패키징',
        states: [
          { id: 'struct', label: '구조',
            desc: 'HBM은 DRAM 칩을 여러 층 쌓고, 칩을 수직으로 관통하는 전극(TSV)과 마이크로 범프로 층 사이를 연결한다. 이렇게 쌓은 HBM 스택은 실리콘 인터포저 위에서 GPU 같은 프로세서 바로 옆에 놓인다(2.5D 패키징).' },
          { id: 'path', label: '데이터 경로',
            desc: '프로세서와 HBM의 베이스 다이는 인터포저 안의 짧고 촘촘한 배선으로 연결되고, 베이스 다이에서 TSV를 타고 위쪽 DRAM 층으로 신호가 오간다. 짧은 거리와 넓은 입출력(HBM3까지 스택당 1024비트) 덕분에 대역폭이 높다.' },
        ],
        svg(s) {
          const dies = [1, 2, 3, 4].map(k => `<rect class="dg-n" x="238" y="${208 - k * 16}" width="104" height="12"/>${[250, 290, 330].map(x => `<rect class="dg-fsub" x="${x - 4}" y="${204 - (k - 1) * 16}" width="8" height="4"/>`).join('')}`).join('');
          const tsv = [252, 290, 328].map(x => `<path class="dg-line dg-hl" d="M${x} 226 V148" style="stroke-width:2"/>`).join('');
          const ub = (x) => `<rect class="dg-fsub" x="${x - 4}" y="226" width="8" height="8"/>`;
          const flow = s.id === 'path' ? dgFlow('M105 226 V244 H290 V150') : '';
          return dgSvg('HBM 구조: ' + s.label, `
            <rect class="dg-fsub" x="20" y="262" width="360" height="16"/>${dgT(200, 274, '패키지 기판', 'dg-sub')}
            <rect class="dg-si" x="30" y="234" width="340" height="18"/><path class="dg-line" d="M105 244 H290" style="stroke-width:1.4"/>${dgT(40, 247, '인터포저', 'dg-sub', 'start')}
            <rect class="dg-p" x="50" y="190" width="110" height="36"/>${dgT(105, 212, '프로세서 (GPU 등)')}
            ${[75, 105, 135].map(ub).join('')}
            <rect class="dg-n" x="236" y="208" width="108" height="18"/>${dgT(290, 221, '베이스 다이', 'dg-sub')}
            ${[252, 290, 328].map(ub).join('')}
            ${dies}${tsv}${flow}
            ${dgT(290, 132, 'HBM 스택 (DRAM 4층 예)', 'dg-volt')}${dgT(356, 162, 'TSV', 'dg-sub', 'start')}
            ${dgT(200, 292, s.label, 'dg-volt')}`, '0 112 400 190');
        }
      },
      'czochralski': {
        title: '초크랄스키(CZ) 단결정 성장',
        states: [
          { id: 'seed', label: '① 시드 접촉', L: [24, 0, 0, 0], hl: 0,
            desc: '석영 도가니에서 실리콘을 녹여(녹는점 약 1,414℃) 둔 뒤, 원하는 결정 방향을 가진 종자 결정(시드)을 용융 실리콘 표면에 살짝 담근다.' },
          { id: 'neck', label: '② 넥 성장', L: [24, 40, 0, 0], hl: 1,
            desc: '시드를 회전시키며 천천히 끌어올리면서 먼저 가늘고 긴 목(넥)을 만든다. 시드와 접촉할 때 생긴 결함(전위)이 가는 넥을 따라 빠져나가 이후 결정이 결함 없이 자라게 한다.' },
          { id: 'crown', label: '③ 크라운', L: [24, 40, 34, 0], hl: 2,
            desc: '끌어올리는 속도와 온도를 조절해 결정의 지름을 목표 크기까지 서서히 넓힌다. 이 원뿔 모양 부분이 크라운이다.' },
          { id: 'body', label: '④ 바디 성장', L: [24, 40, 34, 60], hl: 3,
            desc: '목표 지름에서 일정한 속도로 끌어올려 원통형 단결정 잉곳(바디)을 키운다. 이 잉곳을 얇게 잘라 연마하면 웨이퍼가 된다.' },
        ],
        svg(s) {
          const [a, b, c, d] = s.L, total = a + b + c + d, top = 208 - total;
          let y = top; const parts = [];
          const add = (h, shape, i) => { parts.push(`<path class="dg-si ${s.hl === i ? 'dg-hlp' : ''}" d="${shape(y, h)}"/>`); y += h; };
          add(a, (y, h) => `M194 ${y} H206 V${y + h} H194 Z`, 0);
          if (b) add(b, (y, h) => `M195 ${y} H205 V${y + h} H195 Z`, 1);
          if (c) add(c, (y, h) => `M195 ${y} H205 L242 ${y + h} H158 Z`, 2);
          if (d) add(d, (y, h) => `M158 ${y} H242 V${y + h} H158 Z`, 3);
          return dgSvg('초크랄스키 공정: ' + s.label, `
            <path class="dg-line" d="M200 16 V${top}"/>${dgArrow(222, 40, 222, 24)}${dgT(232, 36, '끌어올림', 'dg-sub', 'start')}${dgT(232, 52, '결정 회전 ↻', 'dg-sub', 'start')}
            <rect class="dg-heat" x="104" y="205" width="12" height="70"/><rect class="dg-heat" x="284" y="205" width="12" height="70"/>${dgT(98, 228, '히터', 'dg-sub', 'end')}
            <path class="dg-melt" d="M131 208 H269 V250 Q269 274 240 274 H160 Q131 274 131 250 Z"/>
            <path class="dg-line" d="M130 200 V250 Q130 276 160 276 H240 Q270 276 270 250 V200"/>
            ${parts.join('')}
            ${dgT(200, 248, '용융 실리콘', 'dg-sub')}${dgT(200, 292, '석영 도가니 (결정과 반대 방향으로 회전)', 'dg-sub')}
            ${dgT(272, 120, ['시드', '넥', '크라운', '바디(잉곳)'][s.hl], 'dg-volt', 'start')}`);
        }
      }
      ,
      'oxidation': {
        title: '열산화: 실리콘 표면이 산화막으로 변하는 과정',
        states: [
          { id: 'start', label: '① 산화 시작', t: 8, flow: false, brk: false, q: '고온에서 산소가 실리콘 표면과 만남',
            desc: '고온(약 800~1,200℃)의 로에 웨이퍼를 넣고 산소(건식)나 수증기(습식)를 흘린다. 실리콘 표면이 산화제와 만나 얇은 SiO₂ 막이 생기기 시작한다.' },
          { id: 'grow', label: '② 산화제 확산·반응', t: 36, flow: true, brk: false, q: '산화제가 막을 통과해 실리콘 계면에서 반응',
            desc: '막이 생긴 뒤에는 산화제가 이미 만들어진 SiO₂ 막 속으로 퍼져 들어가 실리콘과의 경계(계면)에서 반응한다. 새 막은 바깥이 아니라 계면 쪽에서 자라며, 막이 두꺼워질수록 산화제가 지나야 할 거리가 늘어 성장 속도가 느려진다.' },
          { id: 'thick', label: '③ 막 성장·실리콘 소모', t: 72, flow: true, brk: true, q: 'SiO₂ 두께의 약 44%는 실리콘이 소모된 자리',
            desc: '산화막이 두꺼워지는 만큼 실리콘이 소모되어 표면이 내려간다. 두께의 약 44%는 원래 실리콘이 있던 자리이고, 나머지 약 56%는 처음 표면 위로 부풀어 오른다. 건식은 느리지만 치밀한 막을, 습식은 두꺼운 막을 빠르게 만든다.' },
        ],
        svg(s) {
          const y0 = 150, t = s.t, top = y0 - t * 0.56, bot = y0 + t * 0.44, X1 = 90, X2 = 270;
          const gas = [130, 180, 230].map(x => dgArrow(x, 66, x, top - 8)).join('');
          const inside = s.flow ? [150, 210].map(x => dgFlow(`M${x} ${top + 2} V${bot - 2}`)).join('') : '';
          const brk = s.brk ? `${dgArrow(284, top + 2, 284, y0)}${dgArrow(284, y0, 284, top + 2)}${dgT(294, (top + y0) / 2 + 4, '위 56%', 'dg-sub', 'start')}${dgArrow(284, y0 + 2, 284, bot)}${dgArrow(284, bot, 284, y0 + 2)}${dgT(294, (y0 + bot) / 2 + 4, '아래 44%', 'dg-sub', 'start')}` : '';
          return dgSvg('열산화: ' + s.label, `
            <rect class="dg-si" x="${X1}" y="${bot}" width="${X2 - X1}" height="${250 - bot}"/>
            <rect class="dg-ox" x="${X1}" y="${top}" width="${X2 - X1}" height="${bot - top}"/>
            <path class="dg-line" d="M${X1 - 6} ${y0} H${X2 + 6}" style="stroke-dasharray:4 4;opacity:.7;stroke-width:1.6"/>
            <rect class="dg-heat" x="${X1}" y="254" width="${X2 - X1}" height="10"/>
            ${dgT(X1 - 6, 262, '고온 가열', 'dg-sub', 'end')}
            ${dgT(X1 - 8, y0 + 4, '처음 표면', 'dg-sub', 'end')}
            ${dgT(180, 44, s.id === 'start' ? 'O₂ (건식) · H₂O (습식)' : '산화제 O₂ · H₂O', 'dg-volt')}
            ${gas}${inside}
            ${t >= 30 ? dgT(180, top + 15, 'SiO₂', 'dg-sub') : ''}${dgT(180, 232, '실리콘', 'dg-sub')}
            ${brk}
            ${dgT(200, 290, s.q, 'dg-volt')}`);
        }
      },
      'process-flow': {
        title: '반도체 제조 8대 공정 한눈에 보기',
        states: [
          { id: 'all', label: '전체 흐름', hl: 0, q: '점선 안의 4단계는 층마다 되풀이된다',
            desc: '웨이퍼를 만든 뒤 산화막을 입히고, 포토·식각·증착과 이온 주입·배선을 층마다 되풀이해 회로를 쌓는다. 완성된 웨이퍼는 EDS에서 칩별로 검사하고, 잘라서 패키징하면 부품이 된다. 1~6단계가 전공정, 8단계가 후공정이다. 단계를 누르면 아래 단면에 층이 쌓여 가는 모습이 나온다.' },
          { id: 's1', label: '1 웨이퍼', hl: 1, q: '단결정 실리콘 원판 하나에서 시작한다',
            desc: '정제한 실리콘으로 단결정 잉곳을 키우고, 잘라서 거울처럼 연마한 원판이 웨이퍼이다. 이후 모든 공정이 이 위에서 이뤄진다.' },
          { id: 's2', label: '2 산화', hl: 2, q: '표면에 절연막(SiO₂)이 생긴다',
            desc: '고온에서 실리콘 표면을 산화시켜 절연막을 만든다. 표면 보호막과 게이트 절연막으로 쓰이며, 중간에 다시 나오기도 한다.' },
          { id: 's3', label: '3 포토', hl: 3, q: '감광막이 회로 모양의 틀이 된다',
            desc: '감광막을 바르고 마스크를 거쳐 빛을 쬔 뒤 현상하면, 회로 모양의 틀이 웨이퍼 위에 남는다. 틀 사이로 아래 막이 드러난다.' },
          { id: 's4', label: '4 식각', hl: 4, q: '틀이 가리지 않은 부분의 막이 깎인다',
            desc: '감광막 틀이 덮고 있지 않은 막을 제거해서, 평면에 그린 그림을 입체 구조로 바꾼다. 다 깎은 뒤에는 감광막도 벗겨 낸다.' },
          { id: 's5', label: '5 증착·주입', hl: 5, q: '실리콘에 불순물이 들어가고 막이 쌓인다',
            desc: '이온 주입으로 드러난 실리콘에 불순물을 넣어 n형 영역을 만들고, CVD 같은 증착으로 위에 절연막을 쌓는다.' },
          { id: 's6', label: '6 배선', hl: 6, q: '금속이 소자를 서로 연결한다',
            desc: '절연막에 구멍을 뚫어 구리 같은 금속으로 채우고, 그 위에 금속선을 이어 소자들을 서로 연결한다. 이 단계까지가 전공정이다.' },
          { id: 's7', label: '7 EDS', hl: 7, q: '탐침이 전극에 닿아 칩을 검사한다',
            desc: '프로브 카드의 가는 탐침을 칩의 전극에 대고 전기 신호를 보내 양품과 불량을 가른다. 전공정과 후공정 사이의 검사 단계이다.' },
          { id: 's8', label: '8 패키징', hl: 8, q: '칩을 잘라 기판에 붙이고 수지로 감싼다',
            desc: '다이싱으로 칩을 자르고 기판에 붙인 뒤 금속선으로 연결하고 몰딩 수지로 감싸면, 보드에 실을 수 있는 부품이 된다. 이 단계가 후공정이다.' },
        ],
        svg(s) {
          const NM = ['웨이퍼', '산화', '포토', '식각', '증착·주입', '배선', 'EDS', '패키징'];
          const C = [62, 154, 246, 338], P = [[0, 40], [1, 40], [0, 130], [1, 130], [2, 130], [3, 130], [2, 226], [3, 226]];
          const box = (i) => {
            const [c, y] = P[i], x = C[c] - 38, on = s.hl === i + 1;
            return `<rect class="dg-fsub" x="${x}" y="${y}" width="76" height="40" rx="8"/>`
              + `<rect class="${on ? 'dg-hl' : 'dg-line'}" x="${x}" y="${y}" width="76" height="40" rx="8" style="${on ? '' : 'stroke-width:1.4;opacity:.55'}"/>`
              + dgT(C[c], y + 16, String(i + 1), 'dg-volt') + dgT(C[c], y + 33, NM[i], 'dg-sub');
          };
          const lp = s.hl === 0 ? 'stroke:var(--hl-accent);stroke-width:2.2' : 'stroke:currentColor;stroke-width:1.5;opacity:.5';
          const flow = `
            <rect x="6" y="108" width="388" height="92" rx="14" fill="none" style="${lp};stroke-dasharray:5 4"/>
            ${dgT(388, 123, '층마다 반복 ↻', 'dg-sub', 'end')}
            ${[0, 1, 2, 3, 4, 5, 6, 7].map(box).join('')}
            ${dgArrow(102, 60, 114, 60)}
            <path class="dg-line" d="M154 80 V98 H62 V126" style="stroke-width:1.6"/>${dgArrow(62, 118, 62, 129)}
            ${dgArrow(102, 150, 114, 150)}${dgArrow(194, 150, 206, 150)}${dgArrow(286, 150, 298, 150)}
            <path class="dg-line" d="M320 170 V186 H80" style="stroke-dasharray:4 3;stroke-width:1.4;opacity:.7"/>${dgArrow(80, 186, 80, 171)}
            <path class="dg-line" d="M338 170 V210 H246 V222" style="stroke-width:1.6"/>${dgArrow(246, 214, 246, 225)}
            ${dgArrow(286, 246, 298, 246)}
            ${dgT(12, 242, '전공정: 1~6단계', 'dg-sub', 'start')}${dgT(12, 260, '후공정: 8단계', 'dg-sub', 'start')}`;
          // 아래 단면: 단계를 누르면 그 단계까지 쌓인 층이 보이고, 이번 단계에서 새로 생긴 층은 테두리가 강조된다. (전체 흐름 탭은 완성된 모습)
          const n = s.hl, sec = n === 0 ? 6 : n, hi = (k) => (n === k ? 'dg-hlp' : '');
          const seg = (xs, y, h, cls) => xs.map(([a, b]) => `<rect class="${cls}" x="${a}" y="${y}" width="${b - a}" height="${h}"/>`).join('');
          let sect = '', lab = [];
          if (sec <= 7) {
            sect += `<rect class="dg-si ${hi(1)}" x="96" y="400" width="264" height="44"/>`; lab.push([432, '실리콘']);
            if (sec >= 2) lab.push([392, '산화막']);
            if (sec === 2 || sec === 3) sect += `<rect class="dg-ox ${hi(2)}" x="96" y="384" width="264" height="16"/>`;
            if (sec >= 4) sect += seg([[96, 150], [200, 250], [300, 360]], 384, 16, 'dg-ox ' + hi(4));
            if (sec === 3) { sect += seg([[96, 150], [200, 250], [300, 360]], 360, 24, 'dg-pr ' + hi(3)); lab.push([372, '감광막']); }
            if (sec >= 5) {
              sect += seg([[150, 200], [250, 300]], 400, 18, 'dg-n ' + hi(5));
              sect += `<rect class="dg-film ${hi(5)}" x="96" y="362" width="264" height="22"/>` + seg([[150, 200], [250, 300]], 384, 16, 'dg-film ' + hi(5));
              lab.push([410, 'n+ 영역'], [373, '절연막']);
            }
            if (sec >= 6) { sect += seg([[165, 185], [265, 285]], 362, 38, 'dg-met ' + hi(6)) + `<rect class="dg-met ${hi(6)}" x="165" y="352" width="120" height="10"/>`; lab.push([357, '금속']); }
            if (sec === 7) sect += `<rect class="dg-fsub" x="190" y="304" width="70" height="12" rx="3" style="fill-opacity:.25"/><path class="dg-line ${hi(7)}" d="M217 316 L225 350 L233 316 Z" style="fill:currentColor;fill-opacity:.4"/>${dgT(268, 322, '프로브', 'dg-sub', 'start')}`;
          } else {
            sect = `<rect class="dg-fsub" x="104" y="338" width="244" height="74" rx="10" style="fill-opacity:.12"/><rect class="dg-line" x="104" y="338" width="244" height="74" rx="10" style="stroke-width:1.4;opacity:.5"/>`
              + `<rect class="dg-si dg-hlp" x="190" y="394" width="72" height="16"/><rect class="dg-met" x="190" y="390" width="72" height="4"/>`
              + `<path class="dg-line dg-hlp" d="M196 391 Q150 340 124 410 M256 391 Q302 340 328 410" style="stroke-width:1.8"/>`
              + `<rect class="dg-fsub" x="96" y="410" width="264" height="14" style="fill-opacity:.28"/>`
              + [124, 174, 224, 274, 328].map(x => `<circle cx="${x}" cy="434" r="6" fill="#94a3b8"/>`).join('');
            lab.push([420, '기판'], [372, '몰딩'], [437, '솔더볼'], [396, '칩']);
          }
          const head = n === 0 ? '완성된 칩의 단면 (예시)' : n === 8 ? '패키지 단면' : '웨이퍼 단면 (층이 누적됨)';
          const labs = lab.map(([y, t]) => dgT(90, y + 4, t, 'dg-sub', 'end')).join('');
          return dgSvg('제조 8대 공정: ' + s.label, `${flow}
            <path class="dg-line" d="M12 290 H388" style="stroke-width:1;opacity:.25"/>
            ${dgT(12, 314, head, 'dg-sub', 'start')}
            ${sect}${labs}
            ${dgT(200, 472, s.q, 'dg-volt')}`, '0 0 400 484');
        }
      }
      ,
      'device-map': {
        title: '반도체 소자 지도',
        states: [
          { id: 'all', label: '전체 지도', q: '재료에서 출발해 소자, 회로, 칩으로 쌓인다',
            desc: '반도체 소자는 하는 일에 따라 나뉜다. 다이오드는 전류를 한 방향으로만 통과시키고, 트랜지스터는 전압으로 전류를 켜고 끄며, 이를 짝지어 논리 회로를 만들고, 전하를 가두어 메모리를 만든다. 모두 도핑한 실리콘의 PN 접합에서 출발한다.' },
          { id: 'diode', label: '다이오드', q: '전류를 한 방향으로만 통과시킨다',
            desc: 'p형과 n형을 맞댄 PN 접합이다. p쪽에 (+)를 걸면 전류가 흐르고, 반대로 걸면 막힌다. 교류를 직류로 바꾸는 정류 등에 쓰이며, 이 접합의 원리는 트랜지스터 안에도 그대로 들어 있다.' },
          { id: 'tr', label: '트랜지스터', q: '게이트 전압으로 전류의 길을 연다',
            desc: 'MOSFET이 대표적이다. 게이트에 전압을 걸면 소스와 드레인 사이에 전류가 흐르는 길(채널)이 생기고, 전압을 빼면 길이 사라진다. 전압으로 제어하는 스위치이자 신호를 키우는 증폭기이다.' },
          { id: 'cmos', label: 'CMOS 논리', q: '입력을 뒤집는 스위치 한 쌍',
            desc: 'NMOS와 PMOS를 한 쌍으로 묶으면 입력을 뒤집는 인버터가 되고, 이를 조합해 NAND, NOR 같은 게이트와 연산 회로를 만든다. 값이 바뀔 때만 전류가 흐르는 구조라서 오늘날 논리 칩의 표준이다.' },
          { id: 'mem', label: '메모리', q: '전하를 가두어 0과 1을 기억한다',
            desc: '트랜지스터에 저장 요소를 더하면 메모리가 된다. DRAM은 커패시터에, SRAM은 맞물린 인버터에, NAND 플래시는 게이트 속에 정보를 담는다.' },
        ],
        svg(s) {
          const N = [['diode', 52, '다이오드', '한 방향만'], ['tr', 150, '트랜지스터', '전압 스위치'], ['cmos', 248, 'CMOS 논리', '논리 연산'], ['mem', 346, '메모리', '정보 저장']];
          const node = ([id, cx, nm, sb]) => {
            const on = s.id === id;
            return `<rect class="dg-fsub" x="${cx - 43}" y="88" width="86" height="46" rx="8"/><rect class="${on ? 'dg-hl' : 'dg-line'}" x="${cx - 43}" y="88" width="86" height="46" rx="8" style="${on ? '' : 'stroke-width:1.4;opacity:.55'}"/>${dgT(cx, 108, nm)}${dgT(cx, 125, sb, 'dg-sub')}`;
          };
          const tree = `<rect class="dg-fsub" x="140" y="12" width="120" height="34" rx="8"/><rect class="dg-line" x="140" y="12" width="120" height="34" rx="8" style="stroke-width:1.4;opacity:.55"/>${dgT(200, 34, '반도체 소자', 'dg-title')}
            <path class="dg-line" d="M200 46 V66 M52 66 H346 M52 66 V88 M150 66 V88 M248 66 V88 M346 66 V88" style="stroke-width:1.4;opacity:.55"/>
            ${dgArrow(193, 111, 205, 111)}${N.map(node).join('')}`;
          let p = '';
          if (s.id === 'all') {
            const B = [['1', '도핑 실리콘'], ['2', 'PN 접합'], ['3', '트랜지스터'], ['4', '논리·메모리']];
            p = B.map(([n, t], i) => { const x = 8 + i * 100; return `<rect class="dg-fsub" x="${x}" y="186" width="84" height="44" rx="8"/><rect class="dg-line" x="${x}" y="186" width="84" height="44" rx="8" style="stroke-width:1.4;opacity:.55"/>${dgT(x + 42, 204, n, 'dg-volt')}${dgT(x + 42, 221, t, 'dg-sub')}${i < 3 ? dgArrow(x + 86, 208, x + 98, 208) : ''}`; }).join('');
          } else if (s.id === 'diode') {
            p = `<path class="dg-line" d="M90 225 H150 M196 225 H256"/><path class="dg-line" d="M150 195 V255 L196 225 Z" style="fill:currentColor;fill-opacity:.15"/><path class="dg-line dg-thick" d="M196 195 V255"/>
              ${dgT(120, 214, 'p형', 'dg-sub')}${dgT(226, 214, 'n형', 'dg-sub')}
              ${dgT(173, 172, '순방향: 흐른다', 'dg-on')}${dgFlow('M100 184 H246')}${dgT(173, 284, '역방향: 막힌다', 'dg-off')}`;
          } else if (s.id === 'tr') {
            p = `<path class="dg-line" d="M96 225 H150 M150 195 V255 M162 195 V207 M162 217 V233 M162 243 V255 M162 201 H220 V170 M162 249 H220 V280"/>
              ${dgT(96, 213, '게이트', 'dg-sub', 'start')}${dgT(230, 180, '드레인', 'dg-sub', 'start')}${dgT(230, 290, '소스', 'dg-sub', 'start')}${dgFlow('M220 176 V274')}`;
          } else if (s.id === 'cmos') {
            p = `<path class="dg-line" d="M100 225 H150 M218 225 H290"/><path class="dg-line" d="M150 198 V252 L206 225 Z" style="fill:currentColor;fill-opacity:.15"/><circle class="dg-line" cx="212" cy="225" r="6"/>
              ${dgT(104, 214, 'A', 'dg-volt', 'start')}${dgT(286, 214, 'Y', 'dg-volt', 'end')}
              ${dgT(200, 176, '= PMOS 1개 + NMOS 1개', 'dg-sub')}${dgT(200, 282, '입력 0 → 출력 1,  입력 1 → 출력 0', 'dg-sub')}`;
          } else {
            const cell = (x, nm, sub, ic) => `<rect class="dg-fsub" x="${x}" y="170" width="110" height="82" rx="8"/><rect class="dg-line" x="${x}" y="170" width="110" height="82" rx="8" style="stroke-width:1.4;opacity:.55"/>${ic}${dgT(x + 55, 273, nm)}${dgT(x + 55, 290, sub, 'dg-sub')}`;
            const dram = `<rect class="dg-line" x="26" y="198" width="26" height="26" rx="4"/>${dgT(39, 216, 'T', 'dg-sub')}<path class="dg-line" d="M52 211 H76 M76 200 V222 M84 200 V222 M84 211 H100"/><rect class="dg-ch" x="77" y="201" width="6" height="20"/>`;
            const sram = `<path class="dg-line" d="M170 186 V206 L190 196 Z M230 236 V216 L210 226 Z M190 196 H246 V226 H230 M210 226 H154 V196 H170" style="fill:none"/>`;
            const nand = `<rect class="dg-met" x="290" y="182" width="76" height="10"/><rect class="dg-ox" x="290" y="192" width="76" height="4"/><rect class="dg-ch" x="296" y="198" width="64" height="10" style="fill-opacity:.35"/><rect class="dg-ox" x="290" y="208" width="76" height="4"/><rect class="dg-si" x="284" y="212" width="88" height="30"/><rect class="dg-n" x="284" y="212" width="20" height="14"/><rect class="dg-n" x="352" y="212" width="20" height="14"/>`;
            p = cell(12, 'DRAM', '커패시터 전하', dram) + cell(145, 'SRAM', '맞물린 인버터', sram) + cell(278, 'NAND', '게이트 속 전하', nand);
          }
          const sep = s.id === 'mem' ? '' : '';
          return dgSvg('반도체 소자 지도: ' + s.label, `${tree}${p}${dgT(200, 316, s.q, 'dg-volt')}`, '0 0 400 326');
        }
      },
      'cmos-inverter': {
        title: 'CMOS 인버터의 동작',
        states: [
          { id: 'low', label: '입력 0 (Low)', a: 0, q: '입력 0 → PMOS 켜짐 → 출력 1',
            desc: '입력이 0이면 PMOS가 켜지고 NMOS는 꺼진다. 출력이 전원(VDD)에 연결되어 1이 된다. NMOS가 꺼져 있어서 전원에서 접지로 가는 길은 막혀 있다.' },
          { id: 'high', label: '입력 1 (High)', a: 1, q: '입력 1 → NMOS 켜짐 → 출력 0',
            desc: '입력이 1이면 NMOS가 켜지고 PMOS는 꺼진다. 출력이 접지에 연결되어 0이 된다. 이번에는 PMOS가 꺼져 있어서 역시 전원에서 접지로 가는 길이 막혀 있다. 값이 바뀌는 순간을 빼면 전류가 거의 흐르지 않아 소비 전력이 작다.' },
        ],
        svg(s) {
          const a = s.a, boxes = [['PMOS', 70, a === 0], ['NMOS', 180, a === 1]].map(([nm, y, on]) =>
            `<rect class="dg-void" x="160" y="${y}" width="80" height="50" rx="8"/><rect class="dg-fsub" x="160" y="${y}" width="80" height="50" rx="8"/><rect class="${on ? 'dg-hl' : 'dg-line'}" x="160" y="${y}" width="80" height="50" rx="8" style="${on ? '' : 'stroke-width:1.4;opacity:.55'}"/>${dgT(200, y + 22, nm)}${dgT(200, y + 40, on ? 'ON' : 'OFF', on ? 'dg-on' : 'dg-off')}`).join('');
          return dgSvg('CMOS 인버터: ' + s.label, `
            <path class="dg-line" d="M170 36 H230 M200 36 V70 M200 120 V180 M200 230 V262 M170 262 H230 M200 150 H300 M60 150 H120 M120 95 V205 M120 95 H160 M120 205 H160"/>
            <circle cx="200" cy="150" r="3.5" fill="currentColor"/><circle cx="120" cy="150" r="3.5" fill="currentColor"/>
            ${a === 0 ? dgFlow('M200 40 V150 H296') : dgFlow('M296 150 H200 V258')}${boxes}
            ${dgT(240, 30, '전원 (VDD)', 'dg-sub', 'start')}${dgT(240, 278, '접지 (0 V)', 'dg-sub', 'start')}
            ${dgT(20, 138, '입력 A', 'dg-sub', 'start')}${dgT(20, 172, '= ' + a, 'dg-volt', 'start')}${dgT(308, 138, '출력 Y', 'dg-sub', 'start')}${dgT(308, 172, '= ' + (1 - a), 'dg-volt', 'start')}
            ${dgT(200, 314, s.q, 'dg-volt')}`, '0 0 400 324');
        }
      },
      'memory-compare': {
        title: '메모리 셀 비교: DRAM · SRAM · NAND',
        states: [
          { id: 'dram', label: 'DRAM (1T1C)', q: '커패시터의 전하 유무로 0과 1을 기억',
            desc: '트랜지스터 한 개와 커패시터 한 개로 셀을 만든다. 워드라인이 트랜지스터를 켜면 비트라인과 커패시터가 이어져 전하를 쓰고 읽는다. 전하가 서서히 새기 때문에 주기적으로 다시 써 주는 리프레시가 필요하고, 전원이 꺼지면 값이 사라진다. 셀이 작아 대용량 주기억장치에 쓴다.' },
          { id: 'sram', label: 'SRAM (6T)', q: '맞물린 인버터가 값을 붙잡고 있다',
            desc: '인버터 두 개가 서로의 출력을 입력으로 받아 한 값을 계속 붙잡아 두고, 접근 트랜지스터 두 개로 읽고 쓴다. 모두 6개의 트랜지스터가 든다. 리프레시가 필요 없고 빠르지만 셀이 커서 용량을 키우기 어려워, CPU 캐시처럼 작고 빠른 메모리에 쓴다. 전원이 꺼지면 값이 사라진다.' },
          { id: 'nand', label: 'NAND 플래시', q: '게이트 속에 가둔 전자가 문턱 전압을 바꾼다',
            desc: '절연막으로 둘러싸인 플로팅 게이트에 전자를 넣거나 빼서 트랜지스터의 문턱 전압을 바꾸고, 이 차이로 0과 1을 구분한다. 전자가 절연막에 갇혀 있어서 전원이 꺼져도 값이 남는다. 쓰기와 지우기는 느리지만 집적도가 높아 SSD 같은 저장장치에 쓰이며, 셀을 수직으로 쌓은 3D NAND가 주류이다.' },
        ],
        svg(s) {
          let b = '';
          if (s.id === 'dram') {
            b = `<path class="dg-line" d="M50 70 H350 M180 70 V120 M90 100 V232 M90 145 H140 M220 145 H280 V170 M262 170 H298 M262 182 H298 M280 182 V212 M266 212 H294 M272 219 H288"/>
              <circle cx="180" cy="70" r="3.5" fill="currentColor"/><rect class="dg-fsub" x="140" y="120" width="80" height="50" rx="6"/><rect class="dg-line" x="140" y="120" width="80" height="50" rx="6"/>
              <rect class="dg-ch" x="263" y="171" width="34" height="10"/>
              ${dgT(180, 150, '트랜지스터', 'dg-sub')}${dgT(50, 58, '워드라인 (WL)', 'dg-sub', 'start')}${dgT(90, 252, '비트라인 (BL)', 'dg-sub')}${dgT(306, 180, '커패시터', 'dg-sub', 'start')}${dgT(306, 196, '(전하 저장)', 'dg-sub', 'start')}`;
          } else if (s.id === 'sram') {
            b = `<path class="dg-line" d="M110 100 V140 L160 120 Z M290 200 V160 L240 180 Z M160 120 H320 V180 H290 M240 180 H80 V120 H110" style="fill:none"/>
              ${dgT(135, 96, '인버터 1', 'dg-sub')}${dgT(265, 224, '인버터 2', 'dg-sub')}${dgT(200, 256, '+ 접근 트랜지스터 2개 = 6T', 'dg-sub')}${dgT(200, 60, '서로의 출력이 서로의 입력', 'dg-volt')}`;
          } else {
            b = `<rect class="dg-met" x="60" y="70" width="190" height="22"/><rect class="dg-ox" x="60" y="92" width="190" height="8"/><rect class="dg-ch" x="72" y="100" width="166" height="24" style="fill-opacity:.35"/><rect class="dg-ox" x="60" y="124" width="190" height="10"/><rect class="dg-si" x="60" y="134" width="190" height="46"/><rect class="dg-n" x="60" y="134" width="44" height="22"/><rect class="dg-n" x="206" y="134" width="44" height="22"/>
              ${[100, 130, 160, 190].map(x => `<circle cx="${x}" cy="112" r="4.5" fill="#60a5fa"/>`).join('')}${dgFlow('M155 170 V138')}
              ${dgT(262, 86, '컨트롤 게이트', 'dg-sub', 'start')}${dgT(262, 116, '플로팅 게이트', 'dg-sub', 'start')}${dgT(262, 133, '터널 산화막', 'dg-sub', 'start')}${dgT(262, 168, '채널 (Si)', 'dg-sub', 'start')}
              ${dgT(155, 210, '전자가 터널링으로 들어간다', 'dg-sub')}${dgT(155, 232, '→ 문턱 전압이 올라간다', 'dg-volt')}`;
          }
          return dgSvg('메모리 셀: ' + s.label, `${b}${dgT(200, 290, s.q, 'dg-volt')}`);
        }
      }
      ,
      'nextgen-map': {
        title: '차세대 반도체 기술 지도',
        states: [
          { id: 'all', label: '전체 지도', q: '반도체가 마주한 세 개의 벽',
            desc: '반도체는 더 작게 만들기 어렵고(미세화 한계), 전력과 열이 한계에 부딪히고(전력 벽), 연산 속도를 데이터 공급이 따라가지 못하는(메모리 벽) 세 가지 벽을 만났다. 한 가지 기술로는 풀리지 않아 트랜지스터, 노광·배선, 메모리, 패키징을 함께 바꾸고 있다.' },
          { id: 'tr', label: '트랜지스터', q: '게이트가 채널을 더 많이 감싸는 쪽으로',
            desc: '게이트가 채널을 감싸는 면을 늘려 누설을 줄여 왔다. 지금은 GAA 나노시트가 양산 중이고, 다음 후보는 n형과 p형을 위아래로 쌓는 CFET이다. 더 먼 미래에는 실리콘 대신 2차원 소재 채널도 연구된다.',
            rows: [['GAA 나노시트', '양산'], ['CFET', '연구'], ['2D 소재 채널', '연구']] },
          { id: 'litho', label: '노광·배선', q: '더 가는 선을 새기고, 전원은 뒤로 보낸다',
            desc: 'EUV로 가는 선을 새기고, NA를 키운 High-NA EUV가 도입되기 시작했다. 배선에서는 전원선을 웨이퍼 뒷면으로 옮기는 후면 전력이 앞면 배선의 혼잡과 전압 강하를 줄인다.',
            rows: [['EUV (NA 0.33)', '양산'], ['High-NA EUV', '도입 중'], ['후면 전력', '도입 중']] },
          { id: 'mem', label: '메모리', q: '쌓고, 가까이 붙이고, 새로 만든다',
            desc: 'DRAM을 여러 장 쌓은 HBM이 AI 가속기 옆에서 데이터를 공급하고, 3D NAND는 수백 단까지 셀을 쌓는다. 셀 자체를 쌓는 3D DRAM과, 저항으로 기억하는 새 메모리는 연구와 틈새 적용 단계이다.',
            rows: [['HBM', '양산'], ['3D NAND', '양산'], ['3D DRAM · MRAM 등', '연구']] },
          { id: 'pkg', label: '패키징', q: '큰 칩 하나 대신 작은 칩을 잇고 쌓는다',
            desc: '칩을 기능별로 나눠 만든 칩렛을 인터포저 위에 잇는 2.5D 패키징이 이미 양산 중이다. 칩을 위로 쌓고 구리 패드로 직접 접합하는 하이브리드 본딩은 도입이 시작되었다.',
            rows: [['칩렛 + 2.5D', '양산'], ['하이브리드 본딩 3D', '도입 중'], ['칩렛 표준 (UCIe)', '도입 중']] },
        ],
        svg(s) {
          const N = [['tr', 52, '트랜지스터', '구조 혁신'], ['litho', 150, '노광·배선', '패턴·전력'], ['mem', 248, '메모리', '데이터 공급'], ['pkg', 346, '패키징', '칩 쌓기']];
          const node = ([id, cx, nm, sb]) => {
            const on = s.id === id;
            return `<rect class="dg-fsub" x="${cx - 43}" y="88" width="86" height="46" rx="8"/><rect class="${on ? 'dg-hl' : 'dg-line'}" x="${cx - 43}" y="88" width="86" height="46" rx="8" style="${on ? '' : 'stroke-width:1.4;opacity:.55'}"/>${dgT(cx, 108, nm)}${dgT(cx, 125, sb, 'dg-sub')}`;
          };
          const tree = `<rect class="dg-fsub" x="110" y="12" width="180" height="34" rx="8"/><rect class="dg-line" x="110" y="12" width="180" height="34" rx="8" style="stroke-width:1.4;opacity:.55"/>${dgT(200, 34, '차세대 반도체 기술', 'dg-title')}
            <path class="dg-line" d="M200 46 V66 M52 66 H346 M52 66 V88 M150 66 V88 M248 66 V88 M346 66 V88" style="stroke-width:1.4;opacity:.55"/>${N.map(node).join('')}`;
          let p = '';
          if (s.id === 'all') {
            const W = [['미세화 한계', '줄일수록 어렵다'], ['전력·열 벽', '전력이 곧 한계'], ['메모리 벽', '데이터가 병목']];
            p = W.map(([t, u], i) => { const x = 8 + i * 133; return `<rect class="dg-fsub" x="${x}" y="170" width="118" height="58" rx="8"/><rect class="dg-line" x="${x}" y="170" width="118" height="58" rx="8" style="stroke-width:1.4;opacity:.55"/>${dgT(x + 59, 194, t)}${dgT(x + 59, 214, u, 'dg-sub')}`; }).join('')
              + `${dgArrow(200, 236, 200, 262)}${dgT(200, 286, '해결책은 네 갈래', 'dg-volt')}`;
          } else {
            const ST = { '양산': ['#10b981', '양산'], '도입 중': ['#f59e0b', '도입 중'], '연구': ['#94a3b8', '연구'] };
            p = s.rows.map(([nm, st], i) => { const y = 168 + i * 42, c = ST[st][0];
              return `<rect class="dg-fsub" x="12" y="${y}" width="376" height="34" rx="8"/><rect class="dg-line" x="12" y="${y}" width="376" height="34" rx="8" style="stroke-width:1.2;opacity:.4"/>${dgT(26, y + 22, nm, '', 'start')}<rect x="304" y="${y + 6}" width="72" height="22" rx="11" fill="${c}" fill-opacity=".22" stroke="${c}"/>${dgT(340, y + 21, ST[st][1], 'dg-sub')}`; }).join('');
          }
          return dgSvg('차세대 기술 지도: ' + s.label, `${tree}${p}${dgT(200, 318, s.q, 'dg-volt')}`, '0 0 400 330');
        }
      },
      'transistor-roadmap': {
        title: '트랜지스터 구조의 흐름: 게이트가 감싸는 면',
        states: [
          { id: 'planar', label: '평면', n: 1, era: '2010년 무렵까지', q: '게이트가 채널 위쪽 한 면만 감싼다',
            desc: '게이트가 채널 위쪽 한 면만 감싼다. 소자가 작아지자 게이트가 채널을 충분히 제어하지 못해, 꺼져 있어도 전류가 새는 단채널 효과가 커졌다.' },
          { id: 'finfet', label: 'FinFET', n: 3, era: '2011년 양산 시작 (인텔 22nm)', q: '채널을 핀으로 세워 세 면을 감싼다',
            desc: '채널을 얇은 핀 모양으로 세우고 게이트가 위와 양옆 세 면을 감싼다. 제어력이 좋아져 누설이 줄었고, 오랫동안 표준 구조였다.' },
          { id: 'gaa', label: 'GAA 나노시트', n: 4, era: '2022년~ 삼성 · 2025년~ TSMC·인텔', q: '시트를 게이트가 네 면 모두 감싼다',
            desc: '채널을 눕힌 얇은 시트 여러 장으로 만들고 게이트가 네 면을 모두 감싼다. 삼성이 3nm에서 먼저 양산했고, TSMC와 인텔도 2025년부터 2nm급 공정에 도입했다. 시트의 폭과 장수로 전류를 조절할 수 있다.' },
          { id: 'cfet', label: 'CFET', n: 4, era: '연구 단계 · 2030년대 도입 전망', q: 'n형과 p형을 위아래로 쌓는다',
            desc: 'n형과 p형 트랜지스터를 나란히 놓는 대신 위아래로 쌓아 같은 면적에 두 배의 소자를 넣는다. 연구 기관 imec은 2030년대 초(A7 노드 무렵) 도입을 전망하고, 주요 업체들이 시제품을 선보였다.' },
        ],
        svg(s) {
          let b = '';
          const sub = (y, h) => `<rect class="dg-si" x="90" y="${y}" width="220" height="${h}"/>`;
          if (s.id === 'planar') {
            b = `${sub(212, 52)}<rect class="dg-n" x="90" y="212" width="40" height="16"/><rect class="dg-n" x="270" y="212" width="40" height="16"/><rect class="dg-ch" x="130" y="212" width="140" height="7"/><rect class="dg-ox" x="130" y="205" width="140" height="7"/><rect class="dg-met" x="130" y="140" width="140" height="65"/>
              ${dgArrow(200, 112, 200, 136)}${dgT(200, 104, '게이트 1면', 'dg-volt')}`;
          } else if (s.id === 'finfet') {
            b = `${sub(240, 26)}<rect class="dg-si" x="184" y="140" width="32" height="100"/><path class="dg-met" fill-rule="evenodd" d="M148 120 H252 V240 H148 Z M180 140 H220 V240 H180 Z"/><path class="dg-line dg-hlp" d="M184 238 V144 H216 V238" style="stroke-width:3"/>
              ${dgT(200, 104, '게이트 3면', 'dg-volt')}`;
          } else if (s.id === 'gaa') {
            b = `${sub(262, 22)}<rect class="dg-met" x="140" y="112" width="120" height="150"/>${[136, 174, 212].map(y => `<rect class="dg-ox" x="164" y="${y - 3}" width="72" height="20"/><rect class="dg-si" x="168" y="${y}" width="64" height="14"/><rect class="dg-hl" x="166" y="${y - 2}" width="68" height="18" rx="2"/>`).join('')}
              ${dgT(200, 96, '게이트 4면', 'dg-volt')}`;
          } else {
            b = `${sub(262, 22)}<rect class="dg-met" x="140" y="76" width="120" height="186"/>${[104, 132].map(y => `<rect class="dg-n" x="168" y="${y}" width="64" height="14" style="fill-opacity:.7"/><rect class="dg-hl" x="166" y="${y - 2}" width="68" height="18" rx="2"/>`).join('')}
              <rect class="dg-ox" x="150" y="160" width="100" height="14"/>${[188, 216].map(y => `<rect class="dg-p" x="168" y="${y}" width="64" height="14" style="fill-opacity:.7"/><rect class="dg-hl" x="166" y="${y - 2}" width="68" height="18" rx="2"/>`).join('')}
              ${dgT(272, 124, 'n형 (위)', 'dg-sub', 'start')}${dgT(272, 232, 'p형 (아래)', 'dg-sub', 'start')}${dgT(272, 172, '분리막', 'dg-sub', 'start')}${dgT(200, 60, '게이트 공유 · 두 종류를 수직으로', 'dg-volt')}`;
          }
          return dgSvg('트랜지스터 구조: ' + s.label, `${dgT(200, 28, s.era, 'dg-sub')}${b}${dgT(200, 312, s.q, 'dg-volt')}`, '0 0 400 322');
        }
      },
      'litho-roadmap': {
        title: '노광의 진화: 파장은 짧게, NA는 크게',
        states: [
          { id: 'arfi', label: 'ArF 액침 (193nm)', lam: '파장 193 nm (ArF)', wl: 58, hw: 128, na: 'NA 1.35', size: 43, water: true, q: '물을 채운 렌즈로 193nm 빛을 모은다',
            desc: '파장 193nm의 심자외선을 렌즈와 웨이퍼 사이를 물로 채워 모은다(NA 약 1.35). 이 방식으로 한 번에 새길 수 있는 선폭에는 한계가 있어, 더 가는 패턴은 여러 번 나눠 새기는 멀티 패터닝으로 만들었다.' },
          { id: 'euv', label: 'EUV (13.5nm)', lam: '파장 13.5 nm (EUV)', wl: 16, hw: 28, na: 'NA 0.33', size: 12, water: false, q: '파장을 크게 줄여 한 번에 더 가는 선을',
            desc: '파장 13.5nm의 극자외선을 쓴다. 이 파장은 거의 모든 물질에 흡수되어 렌즈 대신 거울을 쓰고 진공 속에서 노광한다. 파장이 크게 줄어 한 번에 새기는 선이 훨씬 가늘어지고, 멀티 패터닝 횟수가 줄었다.' },
          { id: 'hna', label: 'High-NA EUV', lam: '파장 13.5 nm (EUV)', wl: 16, hw: 52, na: 'NA 0.55', size: 7, water: false, q: 'NA를 키워 더 가는 선을 한 번에',
            desc: '같은 EUV 파장에서 NA를 0.33에서 0.55로 키워 더 가는 선을 새긴다. 인텔이 14A 공정에 먼저 쓸 계획이고 SK hynix도 DRAM용으로 장비를 들였다. 장비가 매우 비싸서 TSMC처럼 기존 EUV를 더 쓰는 쪽을 택한 회사도 있어, 도입 시점은 회사마다 다르다.' },
        ],
        svg(s) {
          const w = s.wl, pts = []; let d = 'M60 62';
          for (let x = 60, up = true; x < 340; x += w / 2, up = !up) d += ` q${w / 4} ${up ? -9 : 9} ${w / 2} 0`;
          const cone = `<path class="dg-fsub" d="M200 214 L${200 - s.hw} 128 H${200 + s.hw} Z" style="fill-opacity:.14"/><path class="dg-line" d="M200 214 L${200 - s.hw} 128 M200 214 L${200 + s.hw} 128" style="stroke-width:1.6"/>`;
          const feat = [0, 1, 2, 3, 4].map(i => `<rect class="dg-met" x="${160 + i * 20}" y="206" width="${Math.max(3, Math.min(10, s.size / 4.5))}" height="8"/>`).join('');
          return dgSvg('노광: ' + s.label, `
            ${dgT(200, 30, s.lam, 'dg-volt')}<path class="dg-line" d="${d}" style="stroke:var(--hl-accent);stroke-width:2"/>${dgArrow(200, 84, 200, 124)}
            ${cone}${s.hw >= 100 ? dgT(200, 150, s.na, 'dg-sub') : dgT(200 + s.hw + 8, 146, s.na, 'dg-sub', 'start')}
            ${s.water ? '<rect class="dg-hk" x="176" y="204" width="48" height="10"/>' + dgT(236, 204, '(물)', 'dg-sub', 'start') : ''}
            <rect class="dg-si" x="110" y="214" width="180" height="12"/>${feat}
            ${dgT(60, 250, '최소 선폭 ≈ k₁·λ/NA  (k₁ = 0.3 가정)', 'dg-sub', 'start')}
            <rect class="dg-ch" x="60" y="260" width="${s.size * 4}" height="16" rx="3" style="fill-opacity:.7"/>${dgT(60 + s.size * 4 + 8, 273, '약 ' + s.size + ' nm', 'dg-volt', 'start')}
            ${dgT(200, 304, s.q, 'dg-volt')}`, '0 0 400 316');
        }
      },
      'power-delivery': {
        title: '전원을 어디로 보낼까: 전면 vs 후면',
        states: [
          { id: 'front', label: '전면 전력 (기존)', back: false, q: '신호선과 전원선이 위쪽 배선층을 함께 쓴다',
            desc: '기존에는 전원선과 신호선이 모두 트랜지스터 위쪽 배선층에 있다. 같은 공간을 나눠 쓰다 보니 배선이 복잡해지고, 전원이 여러 층을 내려오는 동안 전압이 떨어진다.' },
          { id: 'back', label: '후면 전력 (BSPDN)', back: true, q: '전원선은 뒷면에서, 신호선은 앞면에서',
            desc: '전원선을 웨이퍼 뒷면으로 옮기고 앞면은 신호선만 쓴다. 전원이 뒷면에서 짧게 트랜지스터로 연결되어 전압 강하가 줄고 앞면 배선에 여유가 생긴다. 대신 웨이퍼를 뒤집어 얇게 갈고 뒷면에 배선을 만드는 공정이 추가된다. 인텔은 18A에 PowerVia로 도입했고, TSMC는 A16(Super Power Rail)에서 2026년 하반기 양산을 목표로 한다.' },
        ],
        svg(s) {
          const pw = (x1, x2, y) => `<rect x="${x1}" y="${y}" width="${x2 - x1}" height="7" rx="2" fill="#f59e0b" fill-opacity=".8"/>`;
          const sg = (segs, y) => segs.map(([a, b]) => `<path class="dg-line" d="M${a} ${y} H${b}" style="stroke-width:2"/>`).join('');
          const tr = `<rect class="dg-si" x="40" y="204" width="320" height="22"/>${[70, 150, 230, 310].map(x => `<rect class="dg-n" x="${x - 18}" y="204" width="14" height="10"/><rect class="dg-n" x="${x + 6}" y="204" width="14" height="10"/><rect class="dg-met" x="${x - 4}" y="194" width="10" height="10"/>`).join('')}`;
          let stack = `<rect class="dg-fsub" x="40" y="62" width="320" height="124" rx="6" style="fill-opacity:.06"/>`, extra = '';
          if (!s.back) {
            stack += pw(50, 350, 70) + sg([[60, 150], [180, 260], [290, 340]], 100) + pw(50, 170, 124) + sg([[200, 340]], 128) + sg([[60, 120], [150, 230]], 160) + pw(260, 350, 156);
            extra = `<path d="M110 74 V204 M290 74 V204" stroke="#f59e0b" stroke-width="3" fill="none"/><path class="dg-line" d="M160 128 V194 M240 160 V194" style="stroke-width:1.6"/>
              ${dgArrow(110, 40, 110, 66)}${dgArrow(290, 40, 290, 66)}${dgT(200, 48, '전원 공급 (위에서)', 'dg-volt')}`;
          } else {
            stack += sg([[60, 150], [180, 260], [290, 340]], 90) + sg([[70, 130], [160, 230], [260, 340]], 124) + sg([[60, 120], [150, 250], [280, 340]], 158);
            extra = `<path class="dg-line" d="M160 124 V194 M240 158 V194 M110 90 V124" style="stroke-width:1.6"/>
              <rect class="dg-si" x="40" y="226" width="320" height="14" style="fill-opacity:.2"/>${pw(50, 350, 248)}<path d="M110 204 V252 M290 204 V252" stroke="#f59e0b" stroke-width="3" fill="none"/>
              ${dgArrow(110, 296, 110, 262)}${dgArrow(290, 296, 290, 262)}${dgT(200, 290, '전원 공급 (뒤에서)', 'dg-volt')}`;
          }
          return dgSvg('전원 공급: ' + s.label, `${stack}${tr}${extra}
            <rect x="110" y="317" width="16" height="7" rx="2" fill="#f59e0b" fill-opacity=".8"/>${dgT(132, 324, '전원선', 'dg-sub', 'start')}<path class="dg-line" d="M200 320 H222" style="stroke-width:2"/>${dgT(228, 324, '신호선', 'dg-sub', 'start')}
            ${dgT(200, 348, s.q, 'dg-volt')}`, '0 0 400 358');
        }
      },
      'memory-future': {
        title: '메모리의 다음 단계: 쌓거나, 새로 만들거나',
        states: [
          { id: 'nand', label: '3D NAND', q: '셀을 위로 쌓아 용량을 키운다',
            desc: '평면에서 셀을 더 줄이기 어려워지자 셀을 수직으로 쌓는다. 워드라인 층과 절연층을 번갈아 쌓고 구멍을 수직으로 뚫어 채널을 만든 뒤, 층마다 셀이 생긴다. 층수를 계속 늘려 지금은 수백 단까지 나온다.' },
          { id: 'dram', label: '3D DRAM (연구)', q: '같은 면적에 셀을 층층이 더 넣는다',
            desc: 'DRAM 셀은 지금 한 층에 나란히 놓인다. 셀 자체를 여러 층으로 쌓아 같은 면적에 더 많이 넣으려는 3D DRAM이 연구되고 있다. 3D NAND보다 구조가 까다로워 아직 양산에 이르지 못했다.' },
          { id: 'new', label: '새 메모리', q: '전하 대신 저항으로 기억한다',
            desc: '정보를 전하가 아니라 저항의 높고 낮음으로 저장한다. MRAM은 자석의 방향, ReRAM은 산화물 속 전도 통로, PCM은 물질의 결정·비정질 상태를 쓴다. 전원이 꺼져도 남고 빠르지만, DRAM이나 NAND를 대체할 만큼 집적도와 비용을 맞추지 못해 틈새 용도가 중심이다.' },
        ],
        svg(s) {
          let b = '';
          if (s.id === 'nand') {
            b = [0, 1, 2, 3, 4, 5, 6, 7].map(i => `<rect class="dg-met" x="80" y="${74 + i * 18}" width="220" height="9"/><rect class="dg-ch" x="170" y="${72 + i * 18}" width="40" height="13" style="fill-opacity:.4"/>`).join('')
              + `<rect class="dg-si" x="182" y="64" width="16" height="164"/><rect class="dg-si" x="60" y="228" width="260" height="14"/>`
              + `${dgT(190, 46, '층수를 계속 늘린다 ↑', 'dg-volt')}${dgT(312, 96, '워드라인', 'dg-sub', 'start')}${dgT(312, 114, '(층마다 셀)', 'dg-sub', 'start')}${dgT(312, 190, '수직 채널', 'dg-sub', 'start')}`;
          } else if (s.id === 'dram') {
            const cell = (x, y) => `<rect class="dg-fsub" x="${x}" y="${y}" width="22" height="26" rx="3"/><rect class="dg-line" x="${x}" y="${y}" width="22" height="26" rx="3" style="stroke-width:1.2"/><rect class="dg-ch" x="${x + 6}" y="${y + 3}" width="10" height="10"/>`;
            b = `${dgT(100, 62, '지금: 한 층', 'dg-sub')}${[0, 1, 2, 3].map(i => cell(44 + i * 28, 150)).join('')}<rect class="dg-si" x="36" y="180" width="124" height="8"/>`
              + `${dgArrow(172, 160, 212, 160)}${dgT(290, 62, '3D DRAM: 층층이', 'dg-sub')}${[0, 1, 2].map(r => [0, 1, 2, 3].map(i => cell(232 + i * 28, 90 + r * 36)).join('')).join('')}<rect class="dg-si" x="224" y="200" width="124" height="8"/>`;
          } else {
            const box = (x, nm, sb, ic) => `<rect class="dg-fsub" x="${x}" y="70" width="116" height="136" rx="8"/><rect class="dg-line" x="${x}" y="70" width="116" height="136" rx="8" style="stroke-width:1.4;opacity:.55"/>${ic}${dgT(x + 58, 232, nm)}${dgT(x + 58, 250, sb, 'dg-sub')}`;
            const mram = `<rect class="dg-met" x="30" y="100" width="80" height="14"/>${dgArrow(50, 107, 90, 107)}<rect class="dg-ox" x="30" y="114" width="80" height="8"/><rect class="dg-met" x="30" y="122" width="80" height="14"/>${dgArrow(50, 129, 90, 129)}${dgT(70, 166, '자화 방향', 'dg-sub')}`;
            const reram = `<rect class="dg-met" x="162" y="92" width="80" height="10"/><rect class="dg-ox" x="162" y="102" width="80" height="48"/><rect class="dg-met" x="162" y="150" width="80" height="10"/><path d="M202 102 V150" stroke="#f59e0b" stroke-width="4"/>${dgT(202, 184, '전도 통로', 'dg-sub')}`;
            const pcm = `<rect class="dg-met" x="294" y="92" width="80" height="10"/><rect class="dg-film" x="294" y="102" width="80" height="50"/>${[0, 1, 2, 3].map(i => [0, 1, 2].map(j => `<circle cx="${304 + i * 8}" cy="${112 + j * 12}" r="2.5" fill="currentColor"/>`).join('')).join('')}${[0, 1, 2, 3].map(i => [0, 1, 2].map(j => `<circle cx="${342 + i * 8 + ((j + i) % 2) * 3}" cy="${110 + j * 12 + (i % 2) * 4}" r="2.5" fill="currentColor"/>`).join('')).join('')}${dgT(334, 170, '결정 | 비정질', 'dg-sub')}`;
            b = box(12, 'MRAM', '자석의 방향', mram) + box(142, 'ReRAM', '산화물 속 길', reram) + box(272, 'PCM', '상 변화', pcm);
          }
          return dgSvg('메모리 미래: ' + s.label, `${b}${dgT(200, 284, s.q, 'dg-volt')}`, '0 0 400 296');
        }
      },
      'packaging-evolution': {
        title: '패키징의 진화: 큰 칩 하나에서 쌓는 칩으로',
        states: [
          { id: 'mono', label: '큰 칩 하나', q: '한 칩에 모든 기능을 담는다',
            desc: '프로세서, 캐시, 입출력을 한 칩에 모두 담는다. 칩이 커질수록 불량이 한 곳에만 생겨도 칩 전체를 버려야 해서 수율이 떨어지고 비용이 오른다.' },
          { id: 'chiplet', label: '칩렛 + 2.5D', q: '작은 칩을 인터포저 위에 나란히 잇는다',
            desc: '기능별로 작은 칩(칩렛)을 따로 만들어 인터포저 위에 나란히 붙인다. 필요한 칩만 최신 공정으로 만들 수 있고, HBM도 이 방식으로 프로세서 옆에 붙는다. UCIe 같은 표준으로 칩렛을 잇는 시도도 늘고 있다.' },
          { id: 'stack', label: '3D 적층', q: '칩을 위로 쌓아 거리를 줄인다',
            desc: '칩을 위로 쌓고 칩 사이를 구리 패드로 직접 접합하는 하이브리드 본딩과 TSV로 잇는다. 연결 거리가 짧아지고 연결 수가 크게 늘어난다. 대신 안쪽 칩의 열이 빠져나가기 어렵고 접합 공정이 까다롭다.' },
        ],
        svg(s) {
          const balls = [90, 130, 170, 210, 250, 290, 330].map(x => `<circle cx="${x}" cy="272" r="6" fill="#94a3b8"/>`).join('');
          const base = (y0) => `<rect class="dg-fsub" x="60" y="${y0}" width="280" height="16" style="fill-opacity:.3"/><rect class="dg-line" x="60" y="${y0}" width="280" height="16" style="stroke-width:1.2"/>${dgT(200, y0 + 12, '패키지 기판', 'dg-sub')}`;
          let b = '';
          if (s.id === 'mono') {
            b = `${base(240)}<rect class="dg-si dg-hlp" x="100" y="168" width="200" height="64"/>${dgT(200, 206, '큰 칩 하나', '')}${dgT(200, 150, '프로세서 · 캐시 · 입출력 전부', 'dg-sub')}`;
          } else if (s.id === 'chiplet') {
            const hbm = (x) => [0, 1, 2, 3].map(i => `<rect class="dg-si" x="${x}" y="${176 + i * 10}" width="34" height="8"/>`).join('') + `<rect class="dg-met" x="${x}" y="216" width="34" height="6"/>` + dgT(x + 17, 170, 'HBM', 'dg-sub');
            b = `${base(244)}<rect class="dg-ox" x="64" y="224" width="272" height="20"/>${dgT(200, 238, '인터포저', 'dg-sub')}${hbm(70)}${hbm(250)}<rect class="dg-si dg-hlp" x="116" y="168" width="82" height="54"/>${dgT(157, 200, 'GPU', '')}<rect class="dg-si dg-hlp" x="208" y="190" width="34" height="32"/>${dgT(225, 210, 'I/O', 'dg-sub')}<rect class="dg-si dg-hlp" x="296" y="196" width="34" height="26"/>`;
          } else {
            b = `${base(244)}<rect class="dg-si" x="110" y="196" width="180" height="40"/>${dgT(200, 222, '아래 칩 (로직)', 'dg-sub')}${Array.from({ length: 16 }, (_, i) => `<rect class="dg-met" x="${126 + i * 10}" y="191" width="5" height="5"/>`).join('')}<rect class="dg-si dg-hlp" x="126" y="150" width="148" height="41"/>${dgT(200, 176, '위 칩 (캐시 · 메모리)', 'dg-sub')}
              ${dgT(200, 134, '구리 패드로 직접 접합 (하이브리드 본딩)', 'dg-sub')}<path class="dg-line" d="M150 196 V238 M200 196 V238 M250 196 V238" style="stroke:#f59e0b;stroke-width:2.2"/>`;
          }
          return dgSvg('패키징: ' + s.label, `${b}${balls}${dgT(200, 304, s.q, 'dg-volt')}`, '0 104 400 212');
        }
      }

    };
    // ===== 주제별 전용 그림 (1차: 포토·식각·배선) =====
    // 같은 그림을 여러 주제에 돌려 쓰지 않도록, 주제마다 그 내용만 보여 주는 그림을 따로 둔다. 항목 모양은 위 DIAGRAMS 와 같다.
    const dgR = (x1, x2, y, h, c, ex = '') => `<rect class="${c}" x="${x1}" y="${y}" width="${x2 - x1}" height="${h}" ${ex}/>`;
    Object.assign(DIAGRAMS, {
      'resist-tone': {
        title: '포토레지스트: 포지티브와 네거티브',
        states: [
          { id: 'pos', label: '포지티브 PR',
            desc: '빛을 받은 부분이 현상액에 녹는 감광막이다. 마스크의 투명한 자리가 뚫리고, 어두운 부분 아래의 감광막이 남는다. 미세 패턴에 유리해서 요즘 가장 널리 쓰인다.' },
          { id: 'neg', label: '네거티브 PR',
            desc: '빛을 받은 부분이 굳어(가교) 현상액에 녹지 않는 감광막이다. 빛 받은 자리가 남고 나머지가 씻겨 나가서 마스크와 반대 모양이 된다. 현상액이 스며들어 부풀기 쉬워 미세 패턴에는 불리하다.' },
          { id: 'car', label: '화학증폭형(CAR)',
            desc: '빛을 받으면 광산발생제(PAG)가 산(H⁺)을 만든다. 노광 뒤 가열(PEB)하는 동안 이 산이 촉매처럼 수많은 반응을 연쇄로 일으켜, 적은 빛으로도 충분히 반응한다(감도가 높다). KrF·ArF·EUV용 감광막이 이 방식이다. 단, 산이 퍼지는 거리만큼 선 가장자리가 거칠어질(LER) 수 있다.' },
        ],
        svg(s) {
          const mask = dgR(30, 130, 104, 12, 'dg-mask') + dgR(210, 310, 104, 12, 'dg-mask') + dgT(316, 114, '포토마스크', 'dg-sub', 'start');
          const beam = (y2) => [150, 170, 190].map(x => dgFlow(`M${x} 70 V${y2}`)).join('') + dgT(170, 62, 'UV 빛', 'dg-volt');
          let pr = '', ex = '', lab = '';
          if (s.id === 'pos') {
            pr = dgR(30, 130, 176, 30, 'dg-pr') + dgR(210, 310, 176, 30, 'dg-pr') + dgR(130, 210, 176, 30, 'dg-prx');
            ex = beam(170) + dgT(170, 196, '녹아 없어짐', 'dg-sub');
          } else if (s.id === 'neg') {
            pr = dgR(130, 210, 176, 30, 'dg-pr') + dgR(30, 130, 176, 30, 'dg-prx') + dgR(210, 310, 176, 30, 'dg-prx');
            ex = beam(170) + dgT(80, 196, '씻겨 나감', 'dg-sub') + dgT(260, 196, '씻겨 나감', 'dg-sub');
          } else {
            pr = dgR(30, 310, 176, 30, 'dg-pr') + dgR(130, 210, 176, 30, 'dg-prx');
            ex = beam(146) + dgT(170, 164, 'PAG → 산(H⁺) 생성', 'dg-volt') +
              [[150, 192], [170, 186], [190, 192]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="currentColor"/>`).join('') +
              dgArrow(126, 191, 104, 191) + dgArrow(214, 191, 236, 191) + dgT(66, 196, '산이 퍼지며', 'dg-sub') + dgT(274, 196, '연쇄 반응', 'dg-sub');
          }
          return dgSvg('포토레지스트: ' + s.label, `
            ${dgR(30, 310, 232, 30, 'dg-fsub')}${dgR(30, 310, 206, 26, 'dg-film')}${pr}${mask}${ex}
            ${dgT(316, 192, '감광막(PR)', 'dg-sub', 'start')}${dgT(316, 223, '막', 'dg-sub', 'start')}${dgT(316, 252, '웨이퍼', 'dg-sub', 'start')}
            ${dgT(170, 284, s.label, 'dg-volt')}`, '0 40 400 260');
        }
      },
      'exposure-scanner': {
        title: '노광 장비(스캐너)의 구조',
        states: [
          { id: 'light', label: '광원·조명계',
            desc: '광원에서 나온 빛(KrF 248 nm, ArF 193 nm 등)을 조명계가 세기와 방향이 고르게 다듬어 레티클로 보낸다. 빛이 한쪽으로 치우치면 웨이퍼 위치에 따라 선폭이 달라진다.' },
          { id: 'reticle', label: '레티클',
            desc: '레티클(포토마스크)에는 회로 패턴이 웨이퍼 위 크기의 4배로 새겨져 있다. 빛은 투명한 부분만 통과해 패턴 모양의 빛이 된다. 먼지가 앉으면 모든 칩에 같은 불량이 찍히므로 펠리클이라는 보호막을 씌운다.' },
          { id: 'lens', label: '투영 렌즈',
            desc: '투영 렌즈가 레티클의 패턴을 1/4로 줄여 웨이퍼에 맺는다. 렌즈가 모을 수 있는 빛의 각도(NA)가 클수록 더 가는 선을 그린다. EUV는 빛이 렌즈에 흡수되어서 렌즈 대신 거울을 쓴다.' },
          { id: 'scan', label: '스텝 앤 스캔',
            desc: '스캐너는 레티클과 웨이퍼를 서로 반대 방향으로 움직이며, 가느다란 띠 모양의 빛으로 훑어서 한 칸(샷)을 노광한다. 한 칸이 끝나면 웨이퍼가 다음 칸으로 건너가 같은 일을 되풀이해 웨이퍼 전체를 채운다.' },
        ],
        svg(s) {
          const on = (ids, box) => ids.includes(s.id) ? `<rect class="dg-hl" x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" rx="5"/>` : '';
          const lab = (y, t) => dgT(254, y, t, 'dg-sub', 'start');
          return dgSvg('노광 장비 구조: ' + s.label, `
            <polygon points="125,92 215,92 188,198 152,198" fill="#fbbf24" fill-opacity=".22"/>
            ${dgR(130, 210, 12, 22, 'dg-hk')}${dgR(120, 220, 44, 22, 'dg-fsub')}
            ${dgR(100, 138, 84, 8, 'dg-mask')}${dgR(152, 188, 84, 8, 'dg-mask')}${dgR(202, 240, 84, 8, 'dg-mask')}
            <ellipse class="dg-hk" cx="170" cy="118" rx="62" ry="7"/><ellipse class="dg-hk" cx="170" cy="144" rx="50" ry="7"/><ellipse class="dg-hk" cx="170" cy="170" rx="34" ry="7"/>
            ${dgR(140, 200, 206, 8, 'dg-si')}${dgR(120, 220, 214, 20, 'dg-fsub')}
            ${on(['light'], [112, 6, 116, 64])}${on(['reticle'], [92, 78, 156, 20])}${on(['lens'], [102, 106, 136, 80])}
            ${on(['scan'], [112, 200, 116, 36])}
            ${lab(26, '광원')}${lab(58, '조명계')}${lab(94, '레티클 (4배 크기)')}${lab(146, '투영 렌즈 (1/4 축소)')}${lab(214, '웨이퍼')}${lab(232, '웨이퍼 스테이지')}
            ${s.id === 'scan' ? dgT(92, 106, '레티클 ←', 'dg-volt', 'end') + dgT(108, 228, '웨이퍼 →', 'dg-volt', 'end') : ''}
            ${dgT(170, 262, s.label, 'dg-volt')}`, '0 0 400 272');
        }
      },
      'multi-patterning': {
        title: '멀티 패터닝: 피치를 절반으로',
        states: [
          { id: 'mandrel', label: 'SADP ① 맨드릴',
            desc: '한 번의 노광으로 찍을 수 있는 넉넉한 간격으로 맨드릴(임시 기둥)을 만든다. 이 간격(피치)은 최종 패턴의 두 배다.' },
          { id: 'deposit', label: 'SADP ② 스페이서 증착',
            desc: '맨드릴의 위·옆·바닥 전체에 얇은 막을 고르게 입힌다. 이 막의 두께가 최종 선폭을 정한다. 그래서 ALD처럼 두께를 정밀하게 조절하는 방식을 쓴다.' },
          { id: 'etch', label: 'SADP ③ 스페이서 식각',
            desc: '수직으로만 깎는 식각(이방성)으로 위와 바닥의 막을 걷어내면, 맨드릴 옆면에 붙은 막(스페이서)만 남는다.' },
          { id: 'strip', label: 'SADP ④ 맨드릴 제거',
            desc: '맨드릴만 골라 없애면 스페이서가 선 모양으로 남는다. 맨드릴 하나가 선 두 개를 만들어서 선의 수는 두 배, 간격(피치)은 절반이 된다. 이 패턴으로 아래 막을 식각한다.' },
          { id: 'lele', label: 'LELE (두 번 노광·식각)',
            desc: '마스크 두 장으로 선을 절반씩 나눠 따로 노광·식각한다. 두 번째 패턴이 첫 번째 사이에 정확히 들어가야 해서 겹침 정밀도(오버레이)가 중요하고, 공정이 늘어 비용이 든다. SADP는 간격이 스스로 정해져 오버레이 부담이 적다.' },
        ],
        svg(s) {
          if (s.id === 'lele') {
            const row = (xs, y, c) => xs.map(x => dgR(x, x + 20, y, 22, c)).join('');
            return dgSvg('멀티 패터닝: ' + s.label, `
              ${dgT(30, 60, '마스크 1 → 노광·식각 (피치 80)', 'dg-sub', 'start')}${row([50, 130, 210, 290], 68, 'dg-pr')}
              ${dgT(30, 130, '마스크 2 → 노광·식각 (피치 80, 40 밀려 있음)', 'dg-sub', 'start')}${row([90, 170, 250], 138, 'dg-hk')}
              ${dgArrow(170, 168, 170, 196)}
              ${dgT(30, 214, '합치면 피치 40', 'dg-volt', 'start')}${row([50, 130, 210, 290], 224, 'dg-pr')}${row([90, 170, 250], 224, 'dg-hk')}
              ${dgT(170, 284, s.label, 'dg-volt')}`, '0 40 400 260');
          }
          const M = [60, 140, 220];
          let body = '';
          if (s.id === 'deposit') body += dgR(30, 310, 210, 20, 'dg-hk') + M.map(x => dgR(x - 20, x + 40, 160, 20, 'dg-hk') + dgR(x - 20, x, 180, 50, 'dg-hk') + dgR(x + 20, x + 40, 180, 50, 'dg-hk')).join('');
          if (s.id === 'etch') body += M.map(x => dgR(x - 20, x, 180, 50, 'dg-hk') + dgR(x + 20, x + 40, 180, 50, 'dg-hk')).join('');
          if (s.id === 'strip') body += M.map(x => dgR(x - 20, x, 180, 50, 'dg-hk') + dgR(x + 20, x + 40, 180, 50, 'dg-hk')).join('');
          if (s.id !== 'strip') body += M.map(x => dgR(x, x + 20, 180, 50, 'dg-mask')).join('');
          const dim = s.id === 'strip' ? `${dgT(70, 150, '피치 40', 'dg-volt')}<path class="dg-line" d="M50 158 H90 M50 154 V162 M90 154 V162"/>`
            : `${dgT(110, 150, '피치 80', 'dg-volt')}<path class="dg-line" d="M70 158 H150 M70 154 V162 M150 154 V162"/>`;
          const lbl = { mandrel: '맨드릴', deposit: '스페이서 막', etch: '스페이서', strip: '스페이서' }[s.id];
          return dgSvg('멀티 패터닝: ' + s.label, `
            ${dgR(30, 310, 250, 22, 'dg-fsub')}${dgR(30, 310, 230, 20, 'dg-film')}${body}${dim}
            ${dgT(316, 216, lbl, 'dg-sub', 'start')}${dgT(316, 244, '아래 막', 'dg-sub', 'start')}
            ${dgT(170, 284, s.label, 'dg-volt')}`, '0 100 400 200');
        }
      },
      'opc': {
        title: 'OPC: 빛 번짐을 미리 보정하기',
        states: [
          { id: 'ideal', label: '① 설계 패턴',
            desc: '칩 설계에서는 선을 이렇게 반듯한 직사각형으로 그린다. 웨이퍼 위에도 이 모양 그대로 만들어지길 바란다.' },
          { id: 'blur', label: '② 보정 없이 노광',
            desc: '패턴이 노광 파장에 가까울 만큼 작아지면 빛이 퍼지며(회절) 모양이 흐려진다. 모서리는 둥글어지고 선 끝은 짧아져서(라인 엔드 풀백) 설계와 다른 모양이 찍힌다.' },
          { id: 'opc', label: '③ OPC 마스크',
            desc: 'OPC(광학 근접 보정)는 이 번짐을 미리 계산해서 마스크 모양을 일부러 바꿔 둔다. 줄어들 선 끝을 넓게(해머헤드) 만들고, 모서리에는 세리프라는 작은 돌기를 더하기도 한다.' },
          { id: 'result', label: '④ 보정 후 결과',
            desc: '보정한 마스크로 노광하면 빛 번짐이 보정분과 맞물려 설계에 훨씬 가까운 모양이 찍힌다. 칩 전체의 패턴마다 이 계산을 해야 해서 컴퓨터 계산량이 매우 크다.' },
          { id: 'sraf', label: '⑤ 보조 패턴(SRAF)',
            desc: '외따로 있는 선 옆에는 아주 가는 보조 패턴(SRAF)을 둔다. 너무 가늘어서 웨이퍼에는 찍히지 않지만, 빛이 느끼는 주변을 촘촘한 패턴처럼 만들어서 초점이 조금 어긋나도 선폭이 덜 변한다(초점 심도 확대).' },
        ],
        svg(s) {
          const target = '<rect class="dg-depl" x="140" y="60" width="60" height="160"/>';
          let body = '', lbl = '', note = '';
          if (s.id === 'ideal') { body = dgR(140, 200, 60, 160, 'dg-mask'); lbl = '설계한 모양'; }
          if (s.id === 'blur') { body = target + '<rect class="dg-pr" x="143" y="84" width="54" height="112" rx="26"/>'; lbl = '웨이퍼에 찍힌 모양'; note = dgT(216, 76, '선 끝이 짧아짐', 'dg-volt', 'start') + dgT(216, 214, '모서리가 둥글어짐', 'dg-volt', 'start'); }
          if (s.id === 'opc') { body = '<path class="dg-mask" d="M126 60 H214 V82 H200 V198 H214 V220 H126 V198 H140 V82 H126 Z"/>'; lbl = '보정한 마스크'; note = dgT(224, 72, '끝을 넓힘(해머헤드)', 'dg-volt', 'start'); }
          if (s.id === 'result') { body = target + '<rect class="dg-pr" x="141" y="63" width="58" height="154" rx="9"/>'; lbl = '보정 후 웨이퍼'; note = dgT(216, 150, '설계와 거의 같음', 'dg-volt', 'start'); }
          if (s.id === 'sraf') { body = dgR(155, 185, 60, 160, 'dg-mask') + dgR(110, 118, 60, 160, 'dg-mask', 'style="fill-opacity:.45"') + dgR(222, 230, 60, 160, 'dg-mask', 'style="fill-opacity:.45"'); lbl = '주 패턴 + 보조 패턴'; note = dgT(170, 244, '보조 패턴은 웨이퍼에 안 찍힘', 'dg-volt'); }
          return dgSvg('OPC: ' + s.label, `${body}${dgT(170, 38, lbl, 'dg-sub')}${note}${dgT(170, 284, s.label, 'dg-volt')}`);
        }
      },
      'wet-etch': {
        title: '습식 식각: 약액이 녹여내는 모양',
        states: [
          { id: 'start', label: '① 약액에 닿음',
            desc: '습식 식각은 웨이퍼를 식각 약액(산·염기 용액)에 담가 막을 화학 반응으로 녹여내는 방식이다. 마스크가 덮지 않은 구멍으로 약액이 닿으면 반응이 시작된다.' },
          { id: 'mid', label: '② 사방으로 퍼짐',
            desc: '약액은 모든 방향으로 비슷한 속도로 막을 녹인다(등방성). 아래로 파고드는 만큼 옆으로도 파고들어서 마스크 아래까지 깎여 나간다.' },
          { id: 'end', label: '③ 언더컷',
            desc: '막 두께만큼 파고들어 아래층에 닿으면 식각이 끝난다. 이때 옆으로도 막 두께만큼 깎인 언더컷이 생긴다. 그래서 선폭이 막 두께보다 작은 미세 패턴에는 쓰기 어렵다.' },
          { id: 'sel', label: '④ 높은 선택비',
            desc: '대신 약액은 녹이는 물질이 정해져 있어 아래층은 거의 깎이지 않는다(선택비가 높다). 예를 들어 불산(HF)은 산화막은 녹이지만 실리콘은 거의 건드리지 않는다. 장비가 단순하고 빠르며 플라즈마 손상이 없어서, 막 전체를 벗기거나 세정할 때 많이 쓴다.' },
        ],
        svg(s) {
          const r = { start: 18, mid: 42, end: 60, sel: 60 }[s.id];
          const cav = `<path class="dg-void" d="M${120 - r} 140 A${r} ${r} 0 0 0 120 ${140 + r} H220 A${r} ${r} 0 0 0 ${220 + r} 140 Z"/>`;
          const ex = s.id === 'end' ? dgT(88, 168, '언더컷', 'dg-volt') + dgT(252, 168, '언더컷', 'dg-volt')
            : s.id === 'sel' ? dgT(170, 224, '아래층은 거의 안 깎임', 'dg-volt') : '';
          return dgSvg('습식 식각: ' + s.label, `
            ${dgR(30, 310, 200, 40, 'dg-si')}${dgR(30, 310, 140, 60, 'dg-film')}${cav}
            ${dgR(30, 120, 124, 16, 'dg-mask')}${dgR(220, 310, 124, 16, 'dg-mask')}
            ${[150, 170, 190].map(x => dgArrow(x, 78, x, 116)).join('')}${dgT(170, 68, '식각 약액', 'dg-volt')}${ex}
            ${dgT(316, 134, '마스크', 'dg-sub', 'start')}${dgT(316, 175, '식각할 막', 'dg-sub', 'start')}${dgT(316, 224, '아래층', 'dg-sub', 'start')}
            ${dgT(170, 284, s.label, 'dg-volt')}`, '0 40 400 260');
        }
      },
      'bowing': {
        title: '보잉: 측벽이 불룩해지는 이유',
        states: [
          { id: 'ion', label: '① 이상적인 식각',
            desc: '깊은 홀을 식각할 때 이온이 위에서 아래로 곧게 떨어져 바닥만 깎는 것이 이상적이다. 측벽은 거의 그대로 수직으로 남는다.' },
          { id: 'scatter', label: '② 이온이 튕김',
            desc: '그런데 일부 이온은 마스크 모서리나 측벽 위쪽에 부딪혀 튕겨 나가, 맞은편 측벽 중간을 때린다. 한 곳이 계속 얻어맞으면 옆으로 깎여 나간다.' },
          { id: 'bow', label: '③ 보잉 발생',
            desc: '그 결과 측벽 중간이 바깥으로 불룩한 활 모양(보잉)이 생긴다. 이웃한 홀과의 간격이 줄어 단락 위험이 커지고, 이어지는 증착에서 홀 속이 빈틈없이 채워지지 않을 수 있다.' },
          { id: 'fix', label: '④ 대책',
            desc: '식각 가스에서 생기는 폴리머로 측벽을 보호하고(패시베이션), 압력과 바이어스 전압을 조절해 이온의 산란을 줄이며, 마스크 모양을 다듬어서 보잉을 줄인다.' },
        ],
        svg(s) {
          const path = { ion: '<rect class="dg-void" x="140" y="125" width="60" height="70"/>',
            scatter: '<rect class="dg-void" x="140" y="125" width="60" height="90"/>',
            bow: '<path class="dg-void" d="M140 125 C140 142 126 152 126 170 C126 190 145 198 146 225 H194 C195 198 214 190 214 170 C214 152 200 142 200 125 Z"/>',
            fix: '<rect class="dg-void" x="140" y="125" width="60" height="100"/>' + dgR(140, 145, 125, 100, 'dg-pr') + dgR(195, 200, 125, 100, 'dg-pr') }[s.id];
          let ex = '';
          if (s.id === 'ion') ex = [150, 170, 190].map(x => dgArrow(x, 62, x, 100)).join('') + dgT(170, 54, '이온 (수직 입사)', 'dg-volt');
          if (s.id === 'scatter') ex = dgArrow(190, 62, 199, 148) + dgArrow(199, 150, 142, 180) + '<circle cx="142" cy="181" r="6" class="dg-hl" fill="none" stroke="var(--hl-accent)" stroke-width="2.4"/>' + dgT(170, 54, '튕긴 이온이 맞은편 중간을 때림', 'dg-volt');
          if (s.id === 'bow') ex = dgArrow(114, 170, 126, 170) + dgArrow(226, 170, 214, 170) + dgT(170, 100, '가장 불룩한 곳', 'dg-volt');
          if (s.id === 'fix') ex = dgT(170, 100, '측벽 보호막(폴리머)', 'dg-volt');
          return dgSvg('보잉: ' + s.label, `
            ${dgR(30, 310, 235, 30, 'dg-fsub')}${dgR(30, 310, 125, 110, 'dg-film')}${path}
            ${dgR(30, 140, 105, 20, 'dg-mask')}${dgR(200, 310, 105, 20, 'dg-mask')}${ex}
            ${dgT(316, 118, '마스크', 'dg-sub', 'start')}${dgT(316, 185, '식각할 막', 'dg-sub', 'start')}${dgT(316, 254, '아래층', 'dg-sub', 'start')}
            ${dgT(170, 288, s.label, 'dg-volt')}`);
        }
      },
      'selectivity': {
        title: '식각 선택비',
        states: [
          { id: 'high', label: '선택비 높음',
            desc: '선택비가 높으면 식각할 막만 빠르게 깎이고, 마스크와 아래층은 거의 그대로 남는다. 막이 다 뚫린 뒤 조금 더 식각해도(과도 식각) 아래층이 안전하다.' },
          { id: 'low', label: '선택비 낮음',
            desc: '선택비가 낮으면 막이 뚫리기 전에 마스크가 얇아져서 패턴이 무너지고, 막이 뚫린 뒤에는 아래층까지 파고든다. 아래층이 깎이면 소자 특성이 달라지거나 불량이 된다.' },
          { id: 'calc', label: '선택비 계산',
            desc: '선택비는 두 물질의 식각 속도의 비이다. 예를 들어 막이 분당 100 nm, 마스크가 분당 20 nm 깎이면 선택비는 5 : 1이다(예시 값). 막을 두껍게 팔수록 높은 선택비가 필요하고, 그렇지 않으면 마스크를 그만큼 두껍게 올려야 한다.' },
        ],
        svg(s) {
          if (s.id === 'calc') {
            return dgSvg('식각 선택비: ' + s.label, `
              ${dgT(170, 44, '선택비 = 막 식각 속도 ÷ 마스크 식각 속도', 'dg-volt')}
              ${dgT(30, 96, '막', 'dg-t', 'start')}${dgR(90, 270, 80, 24, 'dg-film')}${dgT(276, 97, '100 nm/분', 'dg-sub', 'start')}
              ${dgT(30, 146, '마스크', 'dg-t', 'start')}${dgR(90, 126, 130, 24, 'dg-mask')}${dgT(132, 147, '20 nm/분', 'dg-sub', 'start')}
              ${dgT(170, 208, '100 ÷ 20 = 5', 'dg-volt')}${dgT(170, 234, '→ 선택비 5 : 1 (예시)', 'dg-t')}
              ${dgT(170, 284, s.label, 'dg-volt')}`);
          }
          const hi = s.id === 'high';
          const hole = hi ? dgR(140, 200, 125, 82, 'dg-void') : dgR(140, 200, 125, 115, 'dg-void');
          const mTop = hi ? 101 : 119;
          return dgSvg('식각 선택비: ' + s.label, `
            ${dgR(30, 310, 205, 60, 'dg-si')}${dgR(30, 310, 125, 80, 'dg-film')}${hole}
            <path class="dg-depl" d="M30 95 H140 V125 M200 125 V95 H310"/>
            ${dgR(30, 140, mTop, 125 - mTop, 'dg-mask')}${dgR(200, 310, mTop, 125 - mTop, 'dg-mask')}
            ${[150, 170, 190].map(x => dgArrow(x, 58, x, 92)).join('')}${dgT(170, 50, '이온', 'dg-volt')}
            ${dgT(316, 112, '마스크', 'dg-sub', 'start')}${dgT(316, 168, '식각할 막', 'dg-sub', 'start')}${dgT(316, 240, '아래층', 'dg-sub', 'start')}
            ${hi ? dgT(170, 232, '아래층 안전', 'dg-volt') : dgT(170, 262, '아래층까지 파임', 'dg-off')}
            ${dgT(170, 288, s.label, 'dg-volt')}`);
        }
      },
      'low-k': {
        title: 'Low-k 절연막: 배선 사이의 정전용량',
        states: [
          { id: 'sio2', label: 'SiO₂ (k≈3.9)',
            desc: '이웃한 배선은 절연막을 사이에 둔 커패시터가 된다. 그 정전용량(C)은 절연막의 비유전율 k에 비례하고, 신호 지연(RC)과 전력 소모를 키운다. 전통적으로 쓴 실리콘 산화막(SiO₂)은 k가 약 3.9다.' },
          { id: 'lowk', label: 'Low-k (k≈2.5~3)',
            desc: '산화막에 탄소를 섞는(SiOC) 식으로 k를 3 안팎까지 낮춘다. k가 낮은 만큼 정전용량이 줄어 신호가 빨라지고 전력도 줄어든다.' },
          { id: 'ulk', label: '초저유전율 (k<2.5)',
            desc: '절연막에 작은 구멍(기공)을 많이 만들면 k를 2.5 아래로 더 낮출 수 있다. 공기의 k가 1에 가깝기 때문이다. 대신 막이 약해서 CMP 때 깨지기 쉽고, 식각·세정 중 손상되어 k가 다시 올라갈 수 있다.' },
          { id: 'air', label: '에어갭 (k≈1)',
            desc: '배선 사이를 아예 비워 공기로 두는 에어갭도 쓰인다. 정전용량은 가장 작지만 구조가 약해지고 공정이 어려워 일부 층에만 적용된다.' },
        ],
        svg(s) {
          const grid = []; for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) grid.push([36 + c * 31 + (r % 2) * 15, 110 + r * 21]);
          const sel = { sio2: [], lowk: grid.filter((_, i) => i % 4 === 1), ulk: grid, air: [] }[s.id];
          const dots = sel.filter(p => !((p[0] > 94 && p[0] < 166 || p[0] > 214 && p[0] < 286) && p[1] > 122 && p[1] < 218) && p[0] < 300 && p[1] < 222)
            .map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="${s.id === 'ulk' ? 3.8 : 3}" fill="var(--tbl-bg)" stroke="currentColor" stroke-opacity=".5"/>`).join('');
          const air = s.id === 'air' ? '<rect class="dg-void" x="164" y="126" width="52" height="88"/><path class="dg-depl" d="M164 126 H216 V214 H164 Z"/>' : '';
          const field = [146, 170, 194].map(y => `<path d="M164 ${y} H216" stroke="currentColor" stroke-width="1.6" stroke-opacity=".55" stroke-dasharray="4 3" fill="none"/>`).join('');
          return dgSvg('Low-k: ' + s.label, `
            ${dgR(30, 310, 100, 140, 'dg-ox')}${dots}${air}
            ${dgR(100, 164, 126, 88, 'dg-cu')}${dgR(216, 280, 126, 88, 'dg-cu')}${field}
            ${dgT(132, 176, '+', 'dg-t')}${dgT(248, 176, '−', 'dg-t')}${dgT(132, 118, '배선 A', 'dg-sub')}${dgT(248, 118, '배선 B', 'dg-sub')}
            ${dgT(190, 232, 'C ∝ k', 'dg-volt')}${dgT(316, 170, '절연막', 'dg-sub', 'start')}
            ${dgT(170, 272, s.label, 'dg-volt')}`, '0 80 400 210');
        }
      },
      'cmp': {
        title: 'CMP: 화학적·기계적으로 평탄하게',
        states: [
          { id: 'tool', label: '① 장비 구조',
            desc: 'CMP(화학적 기계 연마) 장비는 웨이퍼를 아래로 향하게 연마 헤드에 붙여, 회전하는 연마 패드에 눌러 대고 그 사이에 연마 입자와 약품이 섞인 슬러리를 흘려 넣는다. 헤드와 패드가 함께 돌면서 웨이퍼 전체가 고르게 닳는다.' },
          { id: 'remove', label: '② 깎아내는 중',
            desc: '슬러리의 약품이 표면을 화학적으로 무르게 만들고, 연마 입자와 패드가 그것을 기계적으로 긁어낸다. 튀어나온 곳이 먼저 닳기 때문에 표면이 점점 평평해진다.' },
          { id: 'flat', label: '③ 평탄화 완료',
            desc: '배선 홈 밖의 구리가 다 닳아 없어지고 절연막이 드러나면 연마를 멈춘다. 모터 전류나 빛 반사의 변화로 끝나는 때를 알아낸다(종점 검출). 홈 안의 구리만 남아 배선이 되고 표면은 평탄하다.' },
          { id: 'dish', label: '④ 과연마 문제',
            desc: '너무 오래 연마하면 넓은 구리 배선은 가운데가 움푹 패이고(디싱), 배선이 촘촘한 곳은 절연막까지 얇아진다(침식). 두께가 흔들리면 저항이 달라지고 위에 쌓는 층도 어긋난다.' },
        ],
        svg(s) {
          if (s.id === 'tool') {
            return dgSvg('CMP 장비: ' + s.label, `
              ${dgR(40, 300, 196, 22, 'dg-fsub')}${dgR(40, 300, 182, 14, 'dg-hk')}
              ${dgR(120, 240, 112, 40, 'dg-fsub')}${dgR(132, 228, 152, 8, 'dg-si')}${dgR(132, 228, 160, 22, 'dg-si', 'style="fill-opacity:.55"')}${dgR(132, 228, 178, 4, 'dg-cu')}
              <path d="M276 150 q-6 10 0 14 q6 -4 0 -14 Z" fill="#f472b6"/>${dgArrow(276, 126, 276, 146)}${dgT(276, 118, '슬러리', 'dg-volt')}
              ${dgArrow(134, 98, 226, 98)}${dgT(180, 90, '헤드 회전', 'dg-sub')}${dgArrow(84, 238, 256, 238)}${dgT(170, 256, '플래튼(패드) 회전', 'dg-sub')}
              ${dgT(316, 134, '연마 헤드', 'dg-sub', 'start')}${dgT(316, 172, '웨이퍼', 'dg-sub', 'start')}${dgT(316, 192, '연마 패드', 'dg-sub', 'start')}
              ${dgT(170, 288, s.label, 'dg-volt')}`, '0 70 400 230');
          }
          const ox = (extra) => `<path class="dg-ox" d="${extra}"/>`;
          if (s.id === 'dish') {
            return dgSvg('CMP: ' + s.label, `
              ${dgR(30, 310, 250, 20, 'dg-fsub')}
              ${ox('M30 150 H40 V210 H140 V150 H180 V158 H190 V210 H210 V158 H230 V210 H250 V158 H270 V210 H290 V158 H310 V250 H30 Z')}
              <path class="dg-cu" d="M40 210 V150 Q90 176 140 150 V210 Z"/>${[190, 230, 270].map(x => dgR(x, x + 20, 158, 52, 'dg-cu')).join('')}
              <path class="dg-depl" d="M30 150 H310"/>
              ${dgT(90, 232, '디싱', 'dg-volt')}${dgT(240, 232, '침식', 'dg-volt')}${dgT(90, 265, '구리가 움푹 패임', 'dg-sub')}${dgT(240, 265, '절연막이 얇아짐', 'dg-sub')}
              ${dgT(316, 150, '원래 높이', 'dg-sub', 'start')}
              ${dgT(170, 284, s.label, 'dg-volt')}`, '0 80 400 220');
          }
          const flat = s.id === 'flat';
          const trench = 'M30 150 H130 V210 H210 V150 H310 V250 H30 Z';
          const cu = flat ? dgR(132, 208, 150, 58, 'dg-cu')
            : dgR(30, 310, 126, 24, 'dg-cu') + dgR(132, 208, 150, 58, 'dg-cu') + '<path d="M30 126 Q80 112 130 126 Q170 138 210 126 Q260 112 310 126" class="dg-line" stroke-width="1.2" opacity=".5"/>';
          const padY = flat ? 118 : 94;
          const parts = [60, 100, 150, 190, 230, 270].map((x, i) => `<circle cx="${x}" cy="${padY + 22 + (i % 2) * 3}" r="2.6" fill="currentColor"/>`).join('');
          return dgSvg('CMP: ' + s.label, `
            ${dgR(30, 310, 250, 20, 'dg-fsub')}${ox(trench)}${cu}<path class="dg-bar" d="M130 150 V210 H210 V150"/>
            ${dgR(30, 310, padY, 14, 'dg-hk')}${parts}
            ${dgArrow(240, padY - 10, 290, padY - 10)}${dgT(200, padY - 8, '패드 이동', 'dg-sub')}
            ${dgT(316, padY + 10, '연마 패드', 'dg-sub', 'start')}${dgT(316, padY + 30, '연마 입자', 'dg-sub', 'start')}
            ${flat ? dgT(170, 232, '표면이 평탄해짐', 'dg-volt') : dgT(170, 232, '튀어나온 곳부터 닳음', 'dg-volt')}
            ${dgT(170, 284, s.label, 'dg-volt')}`, '0 70 400 230');
        }
      },
      'barrier-metal': {
        title: '배리어 메탈: 구리가 퍼지지 않게',
        states: [
          { id: 'none', label: '① 배리어가 없으면',
            desc: '구리는 절연막과 실리콘 속에서 아주 빨리 퍼져 나가는 금속이다. 배리어 없이 구리를 홈에 채우면 구리 원자가 절연막으로 번지고, 아래 트랜지스터에 닿으면 소자 특성을 망가뜨리는 오염원이 된다.' },
          { id: 'with', label: '② 배리어가 막는다',
            desc: '홈 안쪽을 배리어 금속(Ta, TaN 등)으로 먼저 감싸면 구리 원자가 빠져나가지 못한다. 배리어는 구리가 절연막에 잘 붙게 하는 역할도 한다.' },
          { id: 'liner', label: '③ 두 겹 구조',
            desc: '배리어는 보통 두 겹이다. 질화탄탈럼(TaN)이 확산을 막고, 그 위의 탄탈럼(Ta)이 구리가 잘 붙도록 돕는다. 그 위에 구리 시드층을 입힌 뒤 구리를 도금한다.' },
          { id: 'thin', label: '④ 미세화의 문제',
            desc: '배선 폭이 줄어도 배리어는 일정 두께 이상이 필요해서, 폭에서 배리어가 차지하는 비율이 커진다. 구리가 들어갈 단면이 줄어 저항이 급격히 오르므로, 더 얇은 배리어나 코발트·루테늄 같은 대체 금속이 쓰이거나 연구되고 있다.' },
        ],
        svg(s) {
          if (s.id === 'liner') {
            const L = (c, x1, x2) => `<rect x="${x1}" y="96" width="${x2 - x1}" height="124" fill="${c[0]}" fill-opacity="${c[1]}"/>`;
            const key = (x, y, c, t) => `<rect x="${x}" y="${y - 10}" width="12" height="12" fill="${c[0]}" fill-opacity="${Math.max(c[1], .5)}"/>${dgT(x + 18, y, t, 'dg-t', 'start')}`;
            const TaN = ['#64748b', .8], Ta = ['#38bdf8', .6], SD = ['#f59e0b', .4];
            return dgSvg('배리어 메탈: ' + s.label, `
              ${dgR(30, 110, 96, 124, 'dg-ox')}${L(TaN, 110, 134)}${L(Ta, 134, 158)}${L(SD, 158, 174)}${dgR(174, 310, 96, 124, 'dg-cu')}
              ${dgT(70, 162, '절연막', 'dg-sub')}${dgT(242, 162, '구리 배선', 'dg-t')}
              ${dgArrow(300, 78, 140, 78)}${dgT(220, 68, '구리가 퍼지려는 방향', 'dg-volt')}
              ${key(40, 248, TaN, 'TaN: 확산 차단')}${key(200, 248, Ta, 'Ta: 접착·젖음')}${key(40, 272, SD, '구리 시드층')}
              ${dgT(316, 292, '※ 두께는 과장해서 그림', 'dg-sub', 'end')}`, '0 40 400 270');
          }
          if (s.id === 'thin') {
            return dgSvg('배리어 메탈: ' + s.label, `
              ${dgR(30, 310, 230, 20, 'dg-fsub')}<path class="dg-ox" d="M30 120 H40 V200 H140 V120 H200 V200 H250 V120 H310 V230 H30 Z"/>
              ${dgR(40, 140, 120, 80, 'dg-bar', 'style="fill:#64748b;fill-opacity:.8;stroke:none"')}${dgR(52, 128, 120, 70, 'dg-cu')}
              ${dgR(200, 250, 120, 80, 'dg-bar', 'style="fill:#64748b;fill-opacity:.8;stroke:none"')}${dgR(212, 238, 120, 70, 'dg-cu')}
              ${dgT(90, 226, '구리 76%', 'dg-volt')}${dgT(225, 226, '구리 52%', 'dg-volt')}
              ${dgT(90, 104, '넓은 배선', 'dg-sub')}${dgT(225, 104, '좁은 배선', 'dg-sub')}
              ${dgT(316, 160, '배리어', 'dg-sub', 'start')}${dgT(170, 262, '※ 배리어 두께는 같게 그린 예시', 'dg-sub')}
              ${dgT(170, 290, s.label, 'dg-volt')}`, '0 70 400 235');
          }
          const none = s.id === 'none';
          const atoms = none ? [[110, 150], [96, 170], [226, 158], [242, 178], [172, 206], [150, 224], [196, 232]] : [];
          return dgSvg('배리어 메탈: ' + s.label, `
            ${dgR(30, 310, 250, 20, 'dg-fsub')}<path class="dg-ox" d="M30 130 H130 V190 H210 V130 H310 V250 H30 Z"/>
            ${dgR(132, 208, 130, 58, 'dg-cu')}${none ? '' : '<path class="dg-bar" d="M130 128 V190 H210 V128"/>'}
            ${atoms.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.4" fill="#f59e0b"/>`).join('')}
            ${none ? dgArrow(128, 160, 112, 160) + dgArrow(212, 160, 228, 160) + dgArrow(170, 194, 170, 210) + dgT(170, 112, '구리 원자가 절연막으로 번짐', 'dg-off') : dgT(170, 112, '배리어가 구리를 가둠', 'dg-on') + dgT(114, 166, '✕', 'dg-off') + dgT(226, 166, '✕', 'dg-off') + dgT(170, 214, '✕', 'dg-off')}
            ${dgT(316, 215, '절연막', 'dg-sub', 'start')}${dgT(316, 264, '하부층', 'dg-sub', 'start')}${dgT(316, 168, '구리', 'dg-sub', 'start')}${none ? '' : dgT(316, 192, '배리어', 'dg-sub', 'start')}
            ${dgT(170, 284, s.label, 'dg-volt')}`, '0 90 400 210');
        }
      },
    });
    // ===== 주제별 전용 그림 (2차: 소자·반도체 물리) =====
    // NMOS 단면 공통 부품: 기판·소스·드레인·게이트. o.sx2/o.dx1 은 소스 오른쪽 끝/드레인 왼쪽 끝 (채널 길이를 바꿀 때)
    const dgMos = (o = {}) => {
      const sx2 = o.sx2 ?? 120, dx1 = o.dx1 ?? 220, g1 = sx2 - 10, g2 = dx1 + 10;
      return `${dgR(30, 310, 160, 90, 'dg-p')}${dgR(50, sx2, 160, 38, 'dg-n')}${dgR(dx1, 290, 160, 38, 'dg-n')}
        ${dgR(g1, g2, 150, 10, 'dg-ox')}${dgR(g1, g2, 124, 26, 'dg-met')}
        ${dgT((50 + sx2) / 2, o.inLabel ? 184 : 183, o.inLabel ? '소스' : 'n⁺', 'dg-sub')}${dgT((dx1 + 290) / 2, o.inLabel ? 184 : 183, o.inLabel ? '드레인' : 'n⁺', 'dg-sub')}
        ${o.inLabel ? '' : dgT((50 + sx2) / 2, 214, '소스', 'dg-sub') + dgT((dx1 + 290) / 2, 214, '드레인', 'dg-sub')}${o.noSub ? '' : dgT(170, 240, 'p형 기판', 'dg-sub')}${dgT(g2 + 8, 140, '게이트', 'dg-sub', 'start')}`;
    };
    const dgAxes = (xl, yl, x0 = 50, y0 = 230, x1 = 340, y1 = 36) => `<path class="dg-line" d="M${x0} ${y1} V${y0} H${x1}"/>${dgT(x1, y0 + 18, xl, 'dg-sub', 'end')}${dgT(x0 + 6, y1 + 2, yl, 'dg-sub', 'start')}`;
    const dgCirc = (x, y, c = 'var(--hl-accent)') => `<circle cx="${x}" cy="${y}" r="4.5" fill="${c}"/>`;
    // 페르미-디랙 분포: 세로가 에너지, 가로가 점유 확률 f. ef 는 페르미 준위의 y 좌표, kt 는 열에너지(px)
    const dgFermi = (ef, kt) => { const pts = []; for (let y = 40; y <= 230; y += 3) pts.push([+(70 + 240 / (1 + Math.exp((ef - y) / kt))).toFixed(1), y]); return pts; };
    const dgPoly = (pts) => 'M' + pts.map(p => p.join(' ')).join(' L');
    Object.assign(DIAGRAMS, {
      'threshold-voltage': {
        title: '문턱 전압: 채널이 생기는 순간',
        states: [
          { id: 'off', label: '① V_G < V_th (꺼짐)',
            desc: '게이트 전압이 낮으면 게이트 아래 표면의 정공이 밀려나 공핍층만 생기고, 전류가 흐를 전자의 통로는 없다. 소스와 드레인 사이가 막혀 있다.' },
          { id: 'vth', label: '② V_G = V_th',
            desc: '게이트 전압을 올리면 표면의 전자 농도가 기판의 정공 농도와 같아지는 순간이 온다. 그때부터 표면이 n형처럼 바뀌며 반전층(채널)이 생기기 시작하고, 이때의 게이트 전압이 문턱 전압(V_th)이다.' },
          { id: 'on', label: '③ V_G > V_th (켜짐)',
            desc: '문턱 전압을 넘겨 전압을 더 올리면 채널의 전자가 늘어나 소스에서 드레인으로 전류가 흐른다. V_G가 클수록 채널이 두꺼워져 전류가 커진다.' },
          { id: 'curve', label: '④ V_th를 바꾸는 것',
            desc: 'I_D–V_G 곡선에서 곧게 오르는 구간을 연장해 전압 축과 만나는 점을 V_th로 읽는 방법이 흔하다. 기판 도핑이 짙거나 게이트 산화막이 두꺼우면 채널을 만들기 어려워 V_th가 올라가고(곡선이 오른쪽으로 이동), 반대면 내려간다.' },
        ],
        svg(s) {
          if (s.id === 'curve') {
            return dgSvg('문턱 전압: ' + s.label, `${dgAxes('V_G →', 'I_D ↑')}
              <path class="dg-line" d="M60 225 Q150 222 190 175 L300 46"/>
              <path class="dg-depl" d="M141 232 L190 175"/><path class="dg-depl" d="M141 232 V150"/>${dgCirc(141, 230)}${dgT(141, 250, 'V_th', 'dg-volt')}
              <path class="dg-line dg-hl" stroke-dasharray="5 4" d="M110 225 Q200 222 240 175 L350 46" style="stroke:#f472b6"/>
              ${dgArrow(150, 120, 200, 120)}${dgT(176, 108, 'V_th 증가', 'dg-volt')}
              ${dgT(338, 196, '도핑 짙음·산화막 두꺼움', 'dg-sub', 'end')}${dgT(338, 212, '→ 오른쪽으로 이동', 'dg-sub', 'end')}
              ${dgT(170, 284, s.label, 'dg-volt')}`);
          }
          const vg = { off: 'V_G = 0 V  (V_th보다 낮음)', vth: 'V_G = V_th', on: 'V_G > V_th' }[s.id];
          const dep = `<rect class="dg-deplf" x="120" y="160" width="100" height="${s.id === 'on' ? 28 : 36}"/><path class="dg-depl" d="M120 ${s.id === 'on' ? 188 : 196} H220"/>`;
          const ch = s.id === 'off' ? '' : dgR(120, 220, 160, s.id === 'on' ? 9 : 3, 'dg-ch');
          const flow = s.id === 'on' ? dgFlow('M80 170 H260') + dgT(170, 206, 'I_D', 'dg-volt') : '';
          return dgSvg('문턱 전압: ' + s.label, `${dgMos()}${dep}${ch}${flow}
            <path class="dg-line" d="M170 124 V102"/>${dgT(170, 92, vg, 'dg-volt')}
            ${s.id === 'off' ? dgT(170, 184, '공핍층', 'dg-sub') : ''}
            ${dgT(170, 284, s.label, 'dg-volt')}`, '0 70 400 230');
        }
      },
      'subthreshold': {
        title: '서브스레숄드 전류와 스윙',
        states: [
          { id: 'log', label: '① 로그 눈금으로 보기',
            desc: 'I_D를 로그 눈금으로 그리면, V_G가 V_th보다 낮아도 전류가 0이 아니라 V_G에 따라 지수적으로 변하는 직선 구간이 보인다. 이 구간의 전류가 서브스레숄드 전류이며, 꺼진 상태에서 새는 전류의 주된 원인이다.' },
          { id: 'ss', label: '② 스윙(SS)의 뜻',
            desc: '서브스레숄드 스윙(SS)은 전류를 10배(1 decade) 늘리는 데 필요한 게이트 전압이다. 단위는 mV/dec이고, 값이 작을수록 곡선이 가팔라서 적은 전압 변화로 켜고 끌 수 있다.' },
          { id: 'compare', label: '③ SS가 작으면',
            desc: '같은 V_th에서 SS가 작은 소자는 V_G = 0일 때의 전류가 훨씬 작다. 꺼져 있을 때 덜 새므로 대기 전력이 줄어든다. 게이트가 채널을 잘 제어할수록(산화막이 얇을수록, FinFET·GAA일수록) SS가 작아진다.' },
          { id: 'barrier', label: '④ 왜 60 mV/dec인가',
            desc: '소스에서 채널로 넘어가는 장벽을 열에너지가 큰 전자만 넘는다. 넘는 전자 수는 장벽 높이에 지수적으로 달라지므로, 게이트로 장벽을 낮추면 전류가 지수적으로 는다. 이 열적 한계 때문에 실온의 SS는 약 60 mV/dec 아래로 내려가지 않는다(kT/q·ln10).' },
        ],
        svg(s) {
          if (s.id === 'barrier') {
            return dgSvg('서브스레숄드: ' + s.label, `
              <path class="dg-line" d="M50 36 V230 H340"/>${dgT(56, 40, '전자 에너지 ↑', 'dg-sub', 'start')}${dgT(340, 248, '소스 → 채널 → 드레인', 'dg-sub', 'end')}
              <path class="dg-line dg-thick" d="M50 140 H110 C140 140 150 90 180 90 C215 90 225 170 255 170 H340"/>
              <path class="dg-depl" d="M110 140 C140 140 150 122 180 122 C215 122 225 170 255 170" style="stroke:#f472b6;opacity:1"/>
              ${[[62, 128], [78, 122], [92, 128], [70, 112], [86, 108], [78, 96]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.4" fill="#60a5fa"/>`).join('')}
              <path d="M96 104 C130 50 200 52 250 150" fill="none" stroke="var(--hl-accent)" stroke-width="2.6" stroke-dasharray="5 4"/>${dgArrow(244, 138, 250, 152, 'dg-line dg-hl')}
              ${dgT(236, 40, '장벽을 넘는 전자 (열에너지)', 'dg-volt')}
              ${dgT(180, 112, '장벽', 'dg-sub')}${dgT(240, 118, 'V_G ↑ → 장벽 ↓', 'dg-sub', 'start')}
              ${dgT(170, 284, s.label, 'dg-volt')}`);
          }
          const head = `${dgAxes('V_G →', 'log I_D ↑')}`;
          const base = 'M55 222 C72 222 82 220 96 210 L196 120 C216 102 262 80 330 72';
          if (s.id === 'log') {
            return dgSvg('서브스레숄드: ' + s.label, `${head}<path class="dg-line dg-thick" d="${base}"/>
              <path class="dg-depl" d="M196 236 V120"/>${dgT(196, 252, 'V_th', 'dg-volt')}
              ${dgT(216, 178, '서브스레숄드 영역', 'dg-volt', 'start')}${dgT(216, 195, '(V_G < V_th인데도 전류가 흐름)', 'dg-sub', 'start')}
              ${dgT(262, 58, '켜짐', 'dg-sub')}
              ${dgT(170, 284, s.label, 'dg-volt')}`);
          }
          if (s.id === 'ss') {
            return dgSvg('서브스레숄드: ' + s.label, `${head}<path class="dg-line dg-thick" d="${base}"/>
              <path class="dg-line dg-hl" d="M116 192 H176 V138" stroke-dasharray="5 4"/>
              ${dgT(146, 212, 'ΔV_G = SS', 'dg-volt')}${dgT(184, 168, '전류 10배', 'dg-volt', 'start')}${dgT(184, 184, '(1 decade)', 'dg-sub', 'start')}
              ${dgT(170, 284, s.label, 'dg-volt')}`);
          }
          return dgSvg('서브스레숄드: ' + s.label, `${head}
            <path class="dg-line dg-hl" d="M55 224 H118 L190 120 C215 95 270 78 330 70"/>
            <path class="dg-line" opacity=".65" d="M55 214 L190 120 C215 95 270 78 330 70"/>
            <path class="dg-depl" d="M70 236 V40"/>${dgT(70, 252, 'V_G = 0', 'dg-sub')}
            ${dgCirc(70, 224)}${dgCirc(70, 203, '#f87171')}
            <path class="dg-line" d="M82 204 H92 M82 224 H92 M87 204 V224"/>${dgT(98, 218, '꺼짐 전류 차이', 'dg-volt', 'start')}
            <path class="dg-line dg-hl" d="M200 58 H226"/>${dgT(232, 62, 'SS 작음 (가파름)', 'dg-sub', 'start')}
            <path class="dg-line" opacity=".65" d="M200 78 H226"/>${dgT(232, 82, 'SS 큼', 'dg-sub', 'start')}
            ${dgT(170, 284, s.label, 'dg-volt')}`);
        }
      },
      'hot-carrier': {
        title: '핫 캐리어: 드레인 끝의 뜨거운 전자',
        states: [
          { id: 'field', label: '① 드레인 끝의 강한 전계',
            desc: '드레인 전압이 걸리면 채널의 전자는 소스에서 드레인으로 가속된다. 채널이 짧아지면 같은 전압이 더 짧은 거리에 걸려, 드레인 끝에서 전계가 가장 세진다. 이곳에서 전자는 열평형보다 훨씬 큰 에너지를 얻는다(핫 캐리어).' },
          { id: 'impact', label: '② 충돌 이온화',
            desc: '에너지가 큰 전자가 격자와 부딪치면 전자-정공 쌍이 새로 생긴다(충돌 이온화). 생긴 정공은 기판으로 빠져 기판 전류(I_sub)가 되고, 이 전류는 핫 캐리어가 얼마나 많은지 재는 지표로 쓰인다.' },
          { id: 'inject', label: '③ 산화막 주입',
            desc: '일부 뜨거운 전자는 실리콘과 산화막 사이의 에너지 장벽을 넘어 게이트 산화막으로 들어가 갇히거나, 계면의 결합을 끊어 결함을 만든다.' },
          { id: 'degrade', label: '④ 소자 열화',
            desc: '갇힌 전하와 계면 결함이 쌓이면 시간이 지날수록 V_th가 이동하고 전류와 상호 컨덕턴스가 줄어든다. 드레인 끝의 도핑을 옅게 해 전계를 낮추는 LDD 구조를 쓰면 열화가 느려진다.' },
        ],
        svg(s) {
          if (s.id === 'degrade') {
            return dgSvg('핫 캐리어: ' + s.label, `${dgAxes('스트레스 시간 →', 'I_D (처음 대비) ↑')}
              <path class="dg-line dg-thick" d="M60 70 C120 85 170 120 330 160" style="stroke:#f87171"/>
              <path class="dg-line dg-thick" d="M60 70 C150 72 250 90 330 105" style="stroke:var(--hl-accent)"/>
              <path class="dg-depl" d="M60 120 H340"/>${dgT(62, 138, '허용 한계(예시)', 'dg-sub', 'start')}${dgT(332, 188, 'LDD 없음: 빨리 열화', 'dg-off', 'end')}${dgT(332, 90, 'LDD 적용: 느리게 열화', 'dg-on', 'end')}
              
              ${dgT(170, 284, s.label, 'dg-volt')}`);
          }
          const arrows = s.id === 'field' ? dgArrow(126, 174, 146, 174) + dgArrow(152, 174, 184, 174) + dgArrow(190, 174, 228, 174) + dgT(170, 268, '전자가 점점 가속됨', 'dg-sub') : '';
          const hot = `<ellipse cx="226" cy="166" rx="30" ry="16" fill="#f87171" fill-opacity="${s.id === 'field' ? .4 : .22}"/>`;
          let ex = '';
          if (s.id === 'field') ex = dgT(262, 112, '전계 최대', 'dg-off', 'start');
          if (s.id === 'impact') ex = dgT(238, 168, '✶', 'dg-volt') + dgCirc(250, 162, '#60a5fa') + '<circle cx="224" cy="176" r="4.5" fill="none" stroke="#f87171" stroke-width="2"/>'
            + dgArrow(236, 184, 236, 226) + dgT(248, 232, 'I_sub', 'dg-volt', 'start') + dgT(170, 268, '충돌 → 전자·정공 쌍 생성', 'dg-sub');
          if (s.id === 'inject') ex = dgArrow(232, 166, 232, 140) + dgT(238, 164, '−', 'dg-off') + dgT(216, 164, '−', 'dg-off') + dgT(204, 158, '×', 'dg-off') + dgT(194, 158, '×', 'dg-off')
            + dgT(170, 268, '산화막에 갇힘(−) · 계면 결함(×)', 'dg-sub');
          return dgSvg('핫 캐리어: ' + s.label, `${dgMos()}${dgR(120, 220, 160, 8, 'dg-ch')}${hot}${arrows}${ex}
            ${dgT(170, 292, s.label, 'dg-volt')}`, '0 80 400 220');
        }
      },
      'mos-cap': {
        title: 'MOS 커패시터: 축적·공핍·반전',
        states: [
          { id: 'accum', label: '① 축적 (V_G < 0)',
            desc: 'p형 기판에 게이트 음전압을 걸면 다수 캐리어인 정공이 산화막 쪽 표면으로 끌려와 쌓인다. 표면까지 전하가 꽉 차서 커패시터는 산화막 하나만 있는 것처럼 동작한다(정전용량이 크다).' },
          { id: 'deplete', label: '② 공핍 (0 < V_G < V_th)',
            desc: '게이트에 양전압을 걸면 정공이 표면에서 밀려나고, 움직이지 못하는 음이온(억셉터)만 남은 공핍층이 생긴다. 공핍층이 산화막과 직렬 커패시터가 되어 전체 정전용량이 줄어든다.' },
          { id: 'invert', label: '③ 반전 (V_G > V_th)',
            desc: '전압이 문턱 전압을 넘으면 표면에 전자가 모여 p형 표면이 n형처럼 바뀐다(반전층). 이 반전층이 MOSFET의 채널이다. 이때 공핍층은 최대 폭에서 더는 넓어지지 않는다.' },
          { id: 'cv', label: '④ C–V 곡선',
            desc: '게이트 전압에 따른 정전용량 그래프다. 축적에서는 산화막 정전용량 C_ox로 크고, 공핍에서 내려가며, 반전에서는 측정 주파수에 따라 달라진다. 느린 신호에서는 반전층 전자가 따라와 C_ox로 돌아오고, 빠른 신호에서는 따라오지 못해 낮게 머문다.' },
        ],
        svg(s) {
          if (s.id === 'cv') {
            return dgSvg('MOS 커패시터: ' + s.label, `${dgAxes('V_G →', 'C ↑')}
              <path class="dg-line dg-thick" d="M60 80 H120 C150 80 160 190 200 196 H330"/>
              <path class="dg-line" stroke-dasharray="5 4" d="M200 196 C235 190 250 100 275 82 H330"/>
              ${dgT(70, 70, 'C_ox', 'dg-volt', 'start')}${dgT(90, 250, '축적', 'dg-sub')}${dgT(160, 250, '공핍', 'dg-sub')}${dgT(260, 250, '반전', 'dg-sub')}
              <path class="dg-depl" d="M130 236 V60 M200 236 V60"/>
              ${dgT(262, 70, '느린 신호', 'dg-sub', 'start')}${dgT(300, 186, '빠른 신호', 'dg-sub', 'end')}
              ${dgT(170, 284, s.label, 'dg-volt')}`);
          }
          const dep = { accum: 0, deplete: 36, invert: 58 }[s.id];
          const tag = { accum: 'V_G < 0', deplete: '0 < V_G < V_th', invert: 'V_G > V_th' }[s.id];
          const sign = { accum: '−', deplete: '+', invert: '+' }[s.id];
          const dots = [120, 150, 180, 210];
          let ch = '';
          if (s.id === 'accum') ch = dots.map(x => `<circle cx="${x}" cy="${166}" r="4.5" fill="none" stroke="#f87171" stroke-width="2"/>`).join('') + dots.map(x => `<circle cx="${x + 15}" cy="${182}" r="4.5" fill="none" stroke="#f87171" stroke-width="2"/>`).join('') + dgT(250, 176, '정공이 모임', 'dg-sub', 'start');
          if (s.id === 'deplete') ch = `<rect class="dg-deplf" x="100" y="152" width="140" height="${dep}"/><path class="dg-depl" d="M100 ${152 + dep} H240"/>` + [120, 150, 180, 210].map(x => dgT(x, 176, '−', 'dg-sub')).join('') + dgT(250, 176, '공핍층', 'dg-sub', 'start');
          if (s.id === 'invert') ch = `<rect class="dg-deplf" x="100" y="152" width="140" height="${dep}"/><path class="dg-depl" d="M100 ${152 + dep} H240"/>` + dots.map(x => `<circle cx="${x + 5}" cy="157" r="4" fill="#60a5fa"/>`).join('') + dgT(250, 168, '전자(반전층)', 'dg-sub', 'start') + dgT(250, 200, '공핍층', 'dg-sub', 'start');
          return dgSvg('MOS 커패시터: ' + s.label, `
            ${dgR(100, 240, 152, 98, 'dg-p')}${dgR(100, 240, 142, 10, 'dg-ox')}${dgR(100, 240, 116, 26, 'dg-met')}
            ${ch}${dgT(170, 133, '게이트 ' + sign, 'dg-sub')}
            <path class="dg-line" d="M170 116 V96"/>${dgT(170, 88, tag, 'dg-volt')}
            ${dgT(250, 150, '산화막', 'dg-sub', 'start')}${dgT(250, 236, 'p형 기판', 'dg-sub', 'start')}
            ${dgT(170, 284, s.label, 'dg-volt')}`, '0 60 400 240');
        }
      },
      'short-channel': {
        title: '단채널 효과: 게이트 제어력이 약해진다',
        states: [
          { id: 'long', label: '① 긴 채널',
            desc: '채널이 충분히 길면 게이트 아래 공핍층을 대부분 게이트가 정한다. 소스·드레인 쪽 공핍층은 가장자리에만 걸쳐서, 문턱 전압이 채널 길이와 거의 상관없이 일정하다.' },
          { id: 'short', label: '② 짧은 채널',
            desc: '채널이 짧아지면 소스·드레인의 공핍층이 채널 가운데까지 파고든다. 게이트가 제어할 전하가 줄어 문턱 전압이 낮아지고(롤오프), 심하면 두 공핍층이 맞닿아 게이트와 무관한 전류가 흐른다(펀치스루).' },
          { id: 'dibl', label: '③ DIBL',
            desc: '드레인 전압이 높아지면 드레인 전계가 소스 쪽 에너지 장벽을 낮춘다(DIBL). 게이트가 닫으려 해도 장벽이 낮아져 있어 꺼짐 전류가 늘고 문턱 전압이 내려간다. 단위는 mV/V이고 작을수록 좋다.' },
          { id: 'fix', label: '④ 대책',
            desc: '게이트가 채널을 더 많은 면에서 감싸게 하고(FinFET·GAA), 산화막을 얇게 하며, 채널 아래는 얇은 실리콘이나 도핑 조절(할로)로 공핍층의 침범을 줄여 게이트 제어력을 되찾는다.' },
        ],
        svg(s) {
          if (s.id === 'dibl') {
            return dgSvg('단채널 효과: ' + s.label, `
              <path class="dg-line" d="M50 36 V230 H340"/>${dgT(56, 40, '전자 에너지 ↑', 'dg-sub', 'start')}${dgT(340, 248, '소스 → 채널 → 드레인', 'dg-sub', 'end')}
              <path class="dg-line dg-thick" d="M50 150 H110 C140 150 150 90 180 90 C210 90 220 130 250 130 H340"/>
              <path class="dg-line dg-thick" d="M50 150 H110 C140 150 150 120 180 120 C215 120 225 190 255 190 H340" style="stroke:#f87171"/>
              ${dgT(300, 118, '낮은 V_DS', 'dg-sub')}${dgT(300, 208, '높은 V_DS', 'dg-off')}
              ${dgArrow(180, 92, 180, 116, 'dg-line dg-hl')}${dgT(172, 80, '장벽이 낮아짐', 'dg-volt', 'end')}
              ${dgT(170, 284, s.label, 'dg-volt')}`);
          }
          const longc = s.id === 'long';
          const o = { noSub: true, ...(longc ? { sx2: 110, dx1: 230 } : { sx2: 150, dx1: 190 }) };
          const r = longc ? 22 : (s.id === 'fix' ? 16 : 34);
          const dep = `<rect class="dg-deplf" x="${40}" y="156" width="${o.sx2 + r - 40}" height="${38 + r}" rx="${r}"/><rect class="dg-deplf" x="${o.dx1 - r}" y="156" width="${300 - o.dx1 + r}" height="${38 + r}" rx="${r}"/>`;
          const hint = s.id === 'short' ? dgT(170, 236, '공핍층이 맞닿으려 함', 'dg-off') : (s.id === 'long' ? dgT(170, 236, '공핍층은 가장자리에만', 'dg-sub') : dgT(170, 236, '할로 도핑으로 공핍층 침범 억제', 'dg-on'));
          const fix = s.id === 'fix' ? `<ellipse cx="${o.sx2 + 6}" cy="190" rx="11" ry="15" fill="#f87171" fill-opacity=".4"/><ellipse cx="${o.dx1 - 6}" cy="190" rx="11" ry="15" fill="#f87171" fill-opacity=".4"/>${dgT(170, 206, '할로', 'dg-sub')}` : '';
          const lbl = dgT(170, 116, longc ? '채널 길이 L (김)' : '채널 길이 L (짧음)', 'dg-volt');
          return dgSvg('단채널 효과: ' + s.label, `${dgMos(o)}${dep}${fix}${hint}${lbl}
            <path class="dg-line" d="M${o.sx2} 258 H${o.dx1} M${o.sx2} 253 V263 M${o.dx1} 253 V263"/>
            ${dgT(170, 286, s.label, 'dg-volt')}`, '0 90 400 205');
        }
      },
      'gaa-nanosheet': {
        title: 'GAA 나노시트: 사방으로 감싸는 게이트',
        states: [
          { id: 'gaa', label: '① 구조 (채널 단면)',
            desc: '얇고 넓은 실리콘 시트(나노시트)를 여러 장 수직으로 쌓고, 게이트가 각 시트의 위·아래·양옆 네 면을 모두 감싼다. 채널 단면을 정면에서 본 그림이다.' },
          { id: 'vsfin', label: '② FinFET과 비교',
            desc: 'FinFET은 핀의 위와 양옆 세 면만 게이트가 감싸고 아래는 기판과 이어져 있다. GAA는 네 면을 모두 감싸 채널을 더 꽉 제어하므로, 같은 크기에서 꺼짐 누설이 적다.' },
          { id: 'width', label: '③ 시트 폭 조절',
            desc: '핀 구조는 핀 개수로만 전류를 조절하지만, 나노시트는 시트의 폭을 설계로 바꿀 수 있다. 폭을 넓히면 전류가 늘고, 좁히면 게이트 제어와 면적이 유리해져서 회로마다 알맞게 고를 수 있다.' },
          { id: 'process', label: '④ 만드는 방법',
            desc: '실리콘과 실리콘 게르마늄(SiGe)을 번갈아 쌓은 뒤 핀 모양으로 식각하고, SiGe만 골라 제거한다. 그러면 실리콘 시트가 공중에 떠 있는 빈틈이 생기고, 그 빈틈에 게이트 물질을 채워 시트를 감싼다.' },
        ],
        svg(s) {
          const sheets = (cx, w, ys) => ys.map(y => dgR(cx - w / 2, cx + w / 2, y, 11, 'dg-si', 'style="fill-opacity:.8"')).join('');
          const gaa = (cx, w, ys, top, bot) => dgR(cx - w / 2 - 14, cx + w / 2 + 14, top, bot - top, 'dg-met') + sheets(cx, w, ys);
          if (s.id === 'gaa') {
            return dgSvg('GAA 나노시트: ' + s.label, `
              ${dgR(40, 200, 214, 26, 'dg-fsub')}${gaa(120, 90, [118, 148, 178], 96, 212)}
              ${dgT(206, 106, '게이트', 'dg-sub', 'start')}${dgT(206, 128, '나노시트(채널)', 'dg-sub', 'start')}${dgT(206, 232, '기판', 'dg-sub', 'start')}
              ${dgT(170, 262, '게이트가 시트의 네 면을 모두 감쌈', 'dg-volt')}${dgT(170, 288, s.label, 'dg-volt')}`, '0 80 400 220');
          }
          if (s.id === 'vsfin') {
            return dgSvg('GAA 나노시트: ' + s.label, `
              ${dgR(30, 380, 214, 26, 'dg-fsub')}
              ${dgR(70, 140, 100, 76, 'dg-met')}${dgR(94, 116, 130, 84, 'dg-si', 'style="fill-opacity:.8"')}
              ${gaa(290, 70, [124, 152, 180], 100, 212)}
              ${dgT(105, 240, 'FinFET', 'dg-t')}${dgT(105, 258, '게이트가 세 면', 'dg-sub')}${dgT(290, 240, 'GAA 나노시트', 'dg-t')}${dgT(290, 258, '게이트가 네 면', 'dg-sub')}
              ${dgT(170, 288, s.label, 'dg-volt')}`, '0 80 400 220');
          }
          if (s.id === 'width') {
            return dgSvg('GAA 나노시트: ' + s.label, `
              ${dgR(30, 380, 214, 26, 'dg-fsub')}
              ${gaa(110, 110, [124, 152, 180], 100, 212)}${gaa(290, 50, [124, 152, 180], 100, 212)}
              ${dgT(110, 240, '넓은 시트', 'dg-t')}${dgT(110, 258, '전류 ↑', 'dg-sub')}${dgT(290, 240, '좁은 시트', 'dg-t')}${dgT(290, 258, '제어력·면적 ↑', 'dg-sub')}
              ${dgT(170, 288, s.label, 'dg-volt')}`, '0 80 400 220');
          }
          const layer = (x, i, c) => dgR(x, x + 80, 214 - (i + 1) * 20, 20, c);
          const seq = ['dg-melt', 'dg-si', 'dg-melt', 'dg-si', 'dg-melt', 'dg-si', 'dg-melt'];
          return dgSvg('GAA 나노시트: ' + s.label, `
            ${seq.map((c, i) => layer(60, i, c)).join('')}
            ${dgT(100, 236, 'Si / SiGe 교대 적층', 'dg-sub')}
            ${dgArrow(160, 140, 214, 140)}${dgT(187, 130, 'SiGe만 식각', 'dg-volt')}
            ${[1, 3, 5].map(i => dgR(230, 310, 214 - (i + 1) * 20 + 4, 12, 'dg-si', 'style="fill-opacity:.8"')).join('')}
            ${dgT(270, 236, 'Si 시트만 남은 빈틈', 'dg-sub')}
            ${dgR(60, 72, 44, 12, 'dg-melt')}${dgT(78, 55, 'SiGe', 'dg-sub', 'start')}${dgR(120, 132, 44, 12, 'dg-si')}${dgT(138, 55, 'Si', 'dg-sub', 'start')}
            ${dgT(170, 288, s.label, 'dg-volt')}`, '0 30 400 270');
        }
      },
      'ion-implant': {
        title: '이온 주입',
        states: [
          { id: 'beam', label: '① 장비 구성',
            desc: '도펀트 기체를 이온으로 만들고(이온 소스), 자기장으로 원하는 이온만 골라(질량 분석), 전압으로 가속해(가속관) 웨이퍼에 쏜다. 빔을 넓게 훑거나 웨이퍼를 움직여 전면에 고르게 주입한다.' },
          { id: 'profile', label: '② 깊이별 농도',
            desc: '주입된 이온은 종 모양으로 퍼져 특정 깊이(Rp)에서 가장 짙다. 에너지를 높이면 더 깊이, 도즈(이온 수)를 늘리면 더 짙게 들어간다. 기판 도핑과 만나는 깊이가 접합 깊이다.' },
          { id: 'damage', label: '③ 결정 손상',
            desc: '빠른 이온은 지나는 길의 실리콘 원자를 때려서 격자를 무너뜨린다. 주입된 도펀트도 격자 자리에 들어가지 못해 전기적으로 비활성이다. 그래서 주입 뒤에는 열처리(어닐링)로 격자를 복구하고 도펀트를 활성화해야 한다.' },
          { id: 'channel', label: '④ 채널링',
            desc: '결정 방향과 나란히 쏘면 이온이 원자 사이의 빈 통로를 따라 예상보다 훨씬 깊이 들어간다(채널링). 웨이퍼를 약 7° 기울여 주입하거나 표면에 얇은 산화막을 두어서 이를 막는다.' },
        ],
        svg(s) {
          if (s.id === 'beam') {
            const row = (y, t, sub) => dgR(30, 150, y, 44, 'dg-fsub') + dgT(90, y + 27, t, 'dg-t') + dgT(160, y + 27, sub, 'dg-sub', 'start');
            return dgSvg('이온 주입: ' + s.label, `
              ${row(24, '이온 소스', '도펀트 기체를 이온으로')}${dgArrow(90, 68, 90, 92)}
              ${row(94, '질량 분석', '원하는 이온만 거름')}${dgArrow(90, 138, 90, 162)}
              ${row(164, '가속관', '전압으로 에너지(깊이) 결정')}${dgArrow(90, 208, 90, 232)}
              ${row(234, '웨이퍼', '빔이 훑으며 고르게 주입')}
              ${dgT(170, 292, s.label, 'dg-volt')}`, '0 10 400 295');
          }
          if (s.id === 'profile') {
            const bell = (x0, c) => `<path class="dg-line dg-thick" style="stroke:${c}" d="M${x0 - 90} 230 C${x0 - 50} 230 ${x0 - 40} 70 ${x0} 70 S${x0 + 50} 230 ${x0 + 90} 230"/>`;
            return dgSvg('이온 주입: ' + s.label, `${dgAxes('깊이 →', '농도 ↑')}
              <path class="dg-depl" d="M50 190 H340"/>${dgT(338, 184, '기판 도핑', 'dg-sub', 'end')}
              ${bell(150, '#94a3b8')}${bell(210, 'var(--hl-accent)')}
              <path class="dg-depl" d="M210 232 V70"/>${dgT(210, 250, 'Rp', 'dg-volt')}
              ${dgCirc(269, 190)}${dgT(274, 208, '접합 깊이', 'dg-sub', 'start')}
              ${dgT(110, 62, '낮은 에너지', 'dg-sub')}${dgT(262, 62, '높은 에너지 → 깊이 ↑', 'dg-volt', 'start')}
              ${dgT(170, 284, s.label, 'dg-volt')}`);
          }
          const atoms = [];
          for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) {
            const y0 = 140 + r * 22, dmg = r < 3;
            const jx = dmg ? ((c * 7 + r * 5) % 9 - 4) : 0, jy = dmg ? ((c * 5 + r * 3) % 7 - 3) : 0;
            atoms.push(`<circle cx="${60 + c * 30 + jx}" cy="${y0 + jy}" r="4.2" fill="currentColor" opacity="${dmg ? .35 : .65}"/>`);
          }
          if (s.id === 'damage') {
            return dgSvg('이온 주입: ' + s.label, `${atoms.join('')}
              ${[100, 180, 250].map(x => dgArrow(x, 58, x + 8, 126)).join('')}${dgT(170, 50, '고속 이온', 'dg-volt')}
              <circle cx="120" cy="170" r="4.2" fill="#f59e0b"/><circle cx="215" cy="150" r="4.2" fill="#f59e0b"/><circle cx="170" cy="190" r="4.2" fill="#f59e0b"/>
              <path class="dg-depl" d="M40 196 H300"/>
              ${dgT(292, 160, '격자 파괴', 'dg-off', 'start')}${dgT(292, 232, '결정 유지', 'dg-sub', 'start')}${dgT(292, 118, '주황: 도펀트', 'dg-sub', 'start')}${dgT(292, 134, '(자리 못 잡음)', 'dg-sub', 'start')}
              ${dgT(170, 284, s.label, 'dg-volt')}`);
          }
          const lat = [];
          for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) lat.push(`<circle cx="${60 + c * 30}" cy="${130 + r * 22}" r="4.2" fill="currentColor" opacity=".65"/>`);
          return dgSvg('이온 주입: ' + s.label, `${lat.join('')}
            <path d="M105 56 L105 238" fill="none" stroke="var(--hl-accent)" stroke-width="2.6" stroke-dasharray="6 4"/>${dgArrow(105, 224, 105, 240, 'dg-line dg-hl')}
            <path d="M215 56 L245 150" fill="none" stroke="#f87171" stroke-width="2.6" stroke-dasharray="6 4"/>${dgCirc(246, 150, '#f87171')}
            ${dgT(100, 46, '축 방향: 깊이 들어감', 'dg-on')}${dgT(250, 46, '7° 기울임', 'dg-volt', 'start')}
            ${dgT(170, 284, s.label, 'dg-volt')}`, '0 30 400 270');
        }
      },
      'carrier-conc': {
        title: '캐리어 농도: 도핑이 정하는 전자와 정공',
        states: [
          { id: 'intrinsic', label: '① 진성 반도체',
            desc: '도핑하지 않은 실리콘은 열로 만들어진 전자와 정공이 같은 수(n = p = n_i)이다. 상온 실리콘의 n_i는 약 10¹⁰ cm⁻³로, 실리콘 원자 밀도(약 5×10²² cm⁻³)에 비하면 극히 적다.' },
          { id: 'ntype', label: '② n형 도핑',
            desc: '도너를 10¹⁶ cm⁻³ 넣으면 전자가 약 10¹⁶으로 크게 늘고, 정공은 np = n_i²에 따라 약 10⁴로 줄어든다. 다수 캐리어(전자)는 도핑이 정하고, 소수 캐리어(정공)는 이 관계로 정해진다.' },
          { id: 'ptype', label: '③ p형 도핑',
            desc: '억셉터를 10¹⁶ cm⁻³ 넣으면 정공이 약 10¹⁶으로 늘고 전자는 약 10⁴로 줄어든다. 도핑 농도가 n_i보다 훨씬 크면 다수 캐리어 수는 도핑 농도와 거의 같다.' },
          { id: 'temp', label: '④ 온도에 따른 변화',
            desc: '온도가 낮으면 도펀트가 다 이온화되지 못하고(동결), 상온 부근에서는 다수 캐리어 수가 도핑 농도로 일정하다(소진 영역). 온도가 아주 높아지면 열로 생기는 전자·정공(n_i)이 도핑을 압도해 진성처럼 변한다.' },
        ],
        svg(s) {
          if (s.id === 'temp') {
            return dgSvg('캐리어 농도: ' + s.label, `${dgAxes('온도 →', 'log n ↑')}
              <path class="dg-line dg-thick" d="M60 214 C75 214 85 120 125 108 H225 C265 108 285 70 330 46"/>
              <path class="dg-line" opacity=".6" stroke-dasharray="5 4" d="M60 236 C150 234 230 200 330 52"/>
              ${dgT(78, 160, '동결', 'dg-sub', 'start')}${dgT(175, 98, '소진 영역: n ≈ N_D', 'dg-volt')}${dgT(268, 164, '진성 n_i', 'dg-sub', 'start')}${dgT(296, 38, '진성 영역', 'dg-sub')}
              ${dgT(170, 284, s.label, 'dg-volt')}`);
          }
          const e = { intrinsic: [10, 10], ntype: [16, 4], ptype: [4, 16] }[s.id];
          const bar = (x, ex, c, l) => dgR(x, x + 56, 230 - ex * 11, ex * 11, c) + dgT(x + 28, 222 - ex * 11, '10' + String(ex).split('').map(d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]).join(''), 'dg-volt') + dgT(x + 28, 248, l, 'dg-t');
          return dgSvg('캐리어 농도: ' + s.label, `
            <path class="dg-line" d="M70 230 H340"/>
            ${bar(110, e[0], 'dg-n', '전자 n')}${bar(220, e[1], 'dg-p', '정공 p')}
            ${dgT(60, 40, '농도 (cm⁻³, 로그 눈금 느낌)', 'dg-sub', 'start')}${dgT(170, 266, 'n × p = n_i²  (n_i ≈ 10¹⁰)', 'dg-sub')}
            ${dgT(170, 290, s.label, 'dg-volt')}`, '0 0 400 296');
        }
      },
      'fermi-dirac': {
        title: '페르미-디랙 분포와 페르미 준위',
        states: [
          { id: 'zero', label: '① 절대영도 (0 K)',
            desc: '절대영도에서는 페르미 준위(E_F)보다 낮은 에너지 상태는 전자가 모두 차 있고(확률 1), 높은 상태는 모두 비어 있다(확률 0). E_F가 채워진 곳과 빈 곳의 경계다.' },
          { id: 'warm', label: '② 온도가 오르면',
            desc: '온도가 오르면 열에너지로 E_F 근처의 경계가 흐려진다. 일부 전자가 E_F 위의 상태로 올라가고, 그만큼 아래에는 빈자리가 생긴다. 흐려지는 폭은 약 kT이다.' },
          { id: 'half', label: '③ E_F에서는 1/2',
            desc: '온도와 상관없이 E_F에서의 점유 확률은 정확히 1/2이다. 반도체에서는 E_F가 밴드갭 안에 있어 그 자리에 전자가 실제로 있지 않아도, 전자가 얼마나 찼는지를 가늠하는 기준 에너지가 된다.' },
          { id: 'ntype', label: '④ n형: E_F가 위로',
            desc: '도너를 넣으면 E_F가 전도대 쪽으로 올라간다. 그러면 전도대 안쪽에서 전자가 있을 확률(파란 면적)이 진성일 때보다 훨씬 커서 전자가 많아진다. E_F가 전도대에 가까울수록 전자 수가 지수적으로 는다.' },
        ],
        svg(s) {
          const ax = `<path class="dg-line" d="M70 30 V232 H318"/>${dgT(190, 266, '점유 확률 f →', 'dg-sub')}${dgT(76, 36, '에너지 ↑', 'dg-sub', 'start')}${dgT(70, 250, '0', 'dg-sub')}${dgT(310, 250, '1', 'dg-sub')}`;
          const EFy = s.id === 'ntype' ? 100 : 135;
          const ef = `<path class="dg-depl" d="M70 ${EFy} H318"/>${dgT(324, EFy + 4, 'E_F', 'dg-volt', 'start')}`;
          if (s.id === 'zero') return dgSvg('페르미-디랙: ' + s.label, `${ax}${ef}<path class="dg-line dg-thick" d="M70 40 V135 H310 V230"/>${dgT(170, 284, s.label, 'dg-volt')}`);
          if (s.id === 'warm') return dgSvg('페르미-디랙: ' + s.label, `${ax}${ef}<path class="dg-line" opacity=".5" stroke-dasharray="5 4" d="M70 40 V135 H310 V230"/><path class="dg-line dg-thick" d="${dgPoly(dgFermi(135, 12))}"/>
            ${dgT(200, 70, '경계가 흐려짐(약 kT)', 'dg-volt', 'start')}${dgT(170, 284, s.label, 'dg-volt')}`);
          if (s.id === 'half') return dgSvg('페르미-디랙: ' + s.label, `${ax}${ef}<path class="dg-line dg-thick" d="${dgPoly(dgFermi(135, 12))}"/>
            <path class="dg-depl" d="M190 135 V232"/>${dgCirc(190, 135)}${dgT(190, 250, '1/2', 'dg-volt')}${dgT(206, 124, 'f(E_F) = 1/2', 'dg-volt', 'start')}${dgT(170, 284, s.label, 'dg-volt')}`);
          const pts = dgFermi(100, 12), pts0 = dgFermi(135, 12);
          const up = pts.filter(p => p[1] <= 80), dn = pts0.filter(p => p[1] >= 190);
          const area = `M70 ${up[0][1]} ` + up.map(p => `L${p.join(' ')}`).join(' ') + ` L70 ${up[up.length - 1][1]} Z`;
          return dgSvg('페르미-디랙: ' + s.label, `${ax}
            <path class="dg-line" d="M70 80 H318 M70 190 H318" opacity=".5"/>${dgT(324, 84, 'E_c', 'dg-sub', 'start')}${dgT(324, 194, 'E_v', 'dg-sub', 'start')}
            <path class="dg-depl" d="M70 135 H318"/>${dgT(324, 139, '진성 E_F', 'dg-sub', 'start')}
            <path class="dg-line" opacity=".5" stroke-dasharray="5 4" d="${dgPoly(pts0)}"/>
            <path class="dg-n" d="${area}" style="fill-opacity:.5"/>
            <path class="dg-depl" d="M70 100 H318" style="stroke:var(--hl-accent);opacity:1"/>${dgT(324, 104, 'E_F(n형)', 'dg-volt', 'start')}
            <path class="dg-line dg-thick" d="${dgPoly(pts)}"/>
            ${dgT(110, 62, '전도대의 전자', 'dg-sub', 'start')}
            ${dgT(170, 284, s.label, 'dg-volt')}`);
        }
      },
      'drift-diffusion': {
        title: '드리프트 전류와 확산 전류',
        states: [
          { id: 'drift', label: '① 드리프트: 전계로 이동',
            desc: '반도체에 전계(E)를 걸면 전자는 전계와 반대 방향으로, 정공은 같은 방향으로 끌려간다. 전하가 밀려 움직이는 평균 속도는 전계에 비례한다(이동도 μ). 전류의 방향은 전자·정공 모두 전계 방향이다.' },
          { id: 'diffusion', label: '② 확산: 농도 차로 이동',
            desc: '전계가 없어도 캐리어가 한쪽에 몰려 있으면, 무질서한 열운동 때문에 농도가 높은 곳에서 낮은 곳으로 퍼져 나간다. 농도 기울기가 가파를수록 확산 전류가 크다.' },
          { id: 'balance', label: '③ PN 접합의 평형',
            desc: 'PN 접합에서는 정공이 p에서 n으로, 전자가 n에서 p로 확산한다. 그 결과 접합부에 전계가 생겨 드리프트가 반대로 끌어당긴다. 평형에서는 둘이 정확히 상쇄되어 순수한 전류가 0이다.' },
        ],
        svg(s) {
          const e = (x, y) => `<circle cx="${x}" cy="${y}" r="4.5" fill="#60a5fa"/>`, h = (x, y) => `<circle cx="${x}" cy="${y}" r="4.5" fill="none" stroke="#f87171" stroke-width="2"/>`;
          const bar = dgR(40, 340, 110, 80, 'dg-fsub');
          if (s.id === 'drift') {
            return dgSvg('드리프트와 확산: ' + s.label, `${bar}
              ${[[90, 130], [170, 165], [250, 128], [300, 170], [140, 150]].map(p => e(p[0], p[1])).join('')}${[[110, 170], [200, 135], [270, 150], [320, 128]].map(p => h(p[0], p[1])).join('')}
              ${dgArrow(80, 70, 300, 70, 'dg-line')}${dgT(190, 58, '전계 E →', 'dg-volt')}
              ${dgArrow(190, 215, 100, 215)}${dgT(145, 238, '전자: 전계 반대로', 'dg-sub')}${dgArrow(210, 215, 300, 215)}${dgT(255, 238, '정공: 전계 방향', 'dg-sub')}
              ${dgT(170, 284, s.label, 'dg-volt')}`);
          }
          if (s.id === 'diffusion') {
            return dgSvg('드리프트와 확산: ' + s.label, `${bar}
              ${[[60, 125], [75, 150], [90, 130], [105, 165], [120, 140], [70, 172], [130, 120], [145, 160], [100, 185], [160, 132], [180, 160], [250, 140], [310, 165]].map(p => e(p[0], p[1])).join('')}
              ${dgArrow(100, 215, 300, 215)}${dgT(200, 236, '농도 높음 → 낮음으로 퍼짐', 'dg-volt')}
              ${dgT(90, 100, '많음', 'dg-sub')}${dgT(300, 100, '적음', 'dg-sub')}
              ${dgT(170, 284, s.label, 'dg-volt')}`);
          }
          return dgSvg('드리프트와 확산: ' + s.label, `${dgR(40, 180, 110, 80, 'dg-p')}${dgR(220, 340, 110, 80, 'dg-n')}${dgR(180, 220, 110, 80, 'dg-deplf')}
            ${[[70, 135], [100, 170], [130, 140], [150, 175], [90, 120]].map(p => h(p[0], p[1])).join('')}${[[250, 130], [290, 165], [320, 140], [270, 180], [240, 160]].map(p => e(p[0], p[1])).join('')}
            ${dgT(110, 100, 'p형', 'dg-sub')}${dgT(280, 100, 'n형', 'dg-sub')}${dgT(200, 100, '공핍층', 'dg-sub')}
            ${dgArrow(150, 62, 250, 62)}${dgT(200, 52, '정공 확산 →', 'dg-volt')}
            ${dgArrow(250, 210, 150, 210)}${dgT(200, 232, '← 전계에 의한 드리프트', 'dg-volt')}
            ${dgT(200, 254, '두 전류가 상쇄 → 순전류 0', 'dg-on')}
            ${dgT(170, 284, s.label, 'dg-volt')}`, '0 40 400 260');
        }
      },
      'anneal-rtp': {
        title: '어닐링과 RTP',
        states: [
          { id: 'why', label: '① 주입 직후',
            desc: '이온 주입 직후의 실리콘은 격자가 무너지고, 도펀트(주황)는 격자 자리를 못 잡고 틈새에 끼어 있어서 전기적으로 일하지 못한다. 열처리가 꼭 필요하다.' },
          { id: 'heal', label: '② 가열하면',
            desc: '높은 온도로 가열하면 원자가 움직일 에너지를 얻어 격자가 제자리로 복구되고, 도펀트가 격자 자리로 들어가 전기적으로 활성화된다. 이 과정이 어닐링이다.' },
          { id: 'diffuse', label: '③ 너무 오래 가열하면',
            desc: '열처리가 길면 도펀트가 가만히 있지 않고 깊이 퍼져 접합이 원하는 것보다 깊어진다(점선 → 실선). 트랜지스터가 작아질수록 얕은 접합이 필요해서 이 확산이 문제가 된다.' },
          { id: 'rtp', label: '④ RTP: 짧고 빠르게',
            desc: 'RTP(급속 열처리)는 램프로 웨이퍼를 초 단위로 빠르게 가열하고 곧바로 식힌다. 일반 확산로가 수십 분이 걸리는 것과 달리 활성화는 충분히 시키면서 도펀트의 확산은 최소로 억제한다.' },
        ],
        svg(s) {
          if (s.id === 'rtp') {
            return dgSvg('어닐링: ' + s.label, `${dgAxes('시간 →', '온도 ↑')}
              <path class="dg-line dg-thick" style="stroke:#fb923c" d="M60 220 C100 220 120 120 150 110 H300"/>
              <path class="dg-line dg-thick" style="stroke:var(--hl-accent)" d="M60 220 H90 L112 60 L124 220 H320"/>
              ${dgT(222, 98, '확산로: 수십 분 유지', 'dg-sub', 'start')}${dgT(140, 56, 'RTP: 초 단위 스파이크', 'dg-volt', 'start')}
              ${dgT(170, 284, s.label, 'dg-volt')}`);
          }
          const atoms = [];
          for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) {
            const dmg = s.id === 'why' && r < 3;
            const jx = dmg ? ((c * 7 + r * 5) % 9 - 4) : 0, jy = dmg ? ((c * 5 + r * 3) % 7 - 3) : 0;
            atoms.push(`<circle cx="${60 + c * 30 + jx}" cy="${120 + r * 24 + jy}" r="4.2" fill="currentColor" opacity="${dmg ? .35 : .65}"/>`);
          }
          let dop = '', note = '';
          if (s.id === 'why') { dop = [[105, 158], [180, 146], [220, 170]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="4.4" fill="#f59e0b"/>`).join(''); note = dgT(292, 150, '격자 파괴', 'dg-off', 'start') + dgT(292, 168, '비활성', 'dg-off', 'start'); }
          if (s.id === 'heal') { dop = [[90, 120], [150, 144], [210, 120]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="#f59e0b"/>`).join(''); note = dgT(292, 150, '격자 복구', 'dg-on', 'start') + dgT(292, 168, '활성화', 'dg-on', 'start'); }
          if (s.id === 'diffuse') { dop = [[90, 144], [150, 192], [210, 168], [120, 216], [240, 216]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="#f59e0b"/>`).join('') + '<path class="dg-depl" d="M40 150 H280"/><path class="dg-line dg-hl" d="M40 222 H280" stroke-dasharray="5 4"/>' + dgArrow(284, 152, 284, 220) + dgT(292, 180, '접합이', 'dg-off', 'start') + dgT(292, 198, '깊어짐', 'dg-off', 'start'); }
          return dgSvg('어닐링: ' + s.label, `${atoms.join('')}${dop}${note}${s.id === 'why' ? dgArrow(60, 60, 60, 100) + dgT(76, 66, '이온 주입', 'dg-volt', 'start') : ''}
            ${dgT(170, 284, s.label, 'dg-volt')}`, '0 40 400 260');
        }
      },
      'leakage': {
        title: '누설 전류의 종류',
        states: [
          { id: 'paths', label: '① 새는 길 네 가지',
            desc: '꺼져 있어도 트랜지스터에서는 전류가 새는 길이 여러 개 있다. ① 소스에서 드레인으로 새는 서브스레숄드 전류, ② 게이트에서 채널로 터널링하는 게이트 누설, ③ 드레인과 기판 사이 접합 누설, ④ 게이트와 드레인이 겹친 곳의 GIDL이다.' },
          { id: 'tunnel', label: '② 게이트 터널링',
            desc: '산화막이 아주 얇아지면 전자가 장벽을 넘지 않고 파동처럼 통과해 버린다(터널링). 산화막이 얇을수록 이 전류가 급격히 커진다. 그래서 물리적으로 더 두꺼운 High-k 산화막으로 같은 정전용량을 얻어 누설을 줄인다.' },
          { id: 'fix', label: '③ 대책 정리',
            desc: '누설 경로마다 대책이 다르다. 서브스레숄드는 V_th를 높이거나 FinFET·GAA로 게이트 제어력을 키우고, 게이트 누설은 High-k를 쓰며, 접합과 GIDL은 도핑 분포를 다듬는다. 칩 전체로는 쓰지 않는 블록의 전원을 끄는 파워 게이팅도 쓴다.' },
        ],
        svg(s) {
          if (s.id === 'tunnel') {
            return dgSvg('누설 전류: ' + s.label, `
              ${dgR(40, 130, 90, 100, 'dg-met')}${dgR(130, 170, 90, 100, 'dg-ox')}${dgR(170, 340, 90, 100, 'dg-si')}
              ${dgT(85, 70, '게이트', 'dg-sub')}${dgT(150, 70, '얇은 산화막', 'dg-sub')}${dgT(255, 70, '채널(실리콘)', 'dg-sub')}
              ${dgArrow(100, 130, 200, 130, 'dg-line dg-hl')}${dgT(150, 120, '터널링', 'dg-volt')}
              ${dgT(262, 128, '산화막이 두꺼우면', 'dg-sub', 'start')}${dgT(262, 146, '통과하기 어려움', 'dg-sub', 'start')}
              <path class="dg-line" d="M130 224 V240 M170 224 V240 M130 232 H170"/>${dgT(150, 256, '두께 t_ox', 'dg-sub')}
              ${dgT(170, 284, s.label, 'dg-volt')}`, '0 50 400 250');
          }
          if (s.id === 'fix') {
            const rows = [['서브스레숄드', 'V_th 높이기 · FinFET·GAA'], ['게이트 터널링', 'High-k 산화막'], ['접합 · GIDL', '도핑 분포 조절 (LDD 등)'], ['대기 전력', '파워 게이팅 (전원 차단)']];
            return dgSvg('누설 전류: ' + s.label, rows.map((r, i) => `${dgR(30, 140, 36 + i * 54, 40, 'dg-fsub')}${dgT(85, 61 + i * 54, r[0], 'dg-t')}${dgArrow(146, 56 + i * 54, 170, 56 + i * 54)}${dgT(178, 61 + i * 54, r[1], 'dg-volt', 'start')}`).join('') + dgT(170, 284, s.label, 'dg-volt'));
          }
          const n = (x, y, k) => `<circle cx="${x}" cy="${y}" r="9" fill="var(--badge-bg)" stroke="currentColor" stroke-width="1.4"/>` + dgT(x, y + 4.5, k, 'dg-volt');
          return dgSvg('누설 전류: ' + s.label, `${dgMos({ noSub: true, inLabel: true })}
            <path class="dg-line dg-hl" d="M90 200 C130 240 210 240 250 200" fill="none"/>${dgArrow(244, 206, 252, 198, 'dg-line dg-hl')}${n(170, 232, '①')}
            ${dgArrow(170, 150, 170, 168)}${n(184, 142, '②')}
            ${dgArrow(278, 198, 278, 234, 'dg-line')}${n(294, 232, '③')}
            <path class="dg-line" d="M214 156 C226 162 228 178 226 190" fill="none"/>${n(206, 196, '④')}
            ${dgT(40, 262, '①서브스레숄드  ②게이트 터널링  ③접합 누설  ④GIDL', 'dg-sub', 'start')}
            ${dgT(170, 284, s.label, 'dg-volt')}`, '0 90 400 205');
        }
      },
    });
    // ===== 주제별 전용 그림 (3차: 패키징·후공정·테스트) =====
    const dgS3 = (l, b, vb = '-10 40 440 245') => dgSvg(l, b, vb);
    const dgBall = (x, y, r = 8) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#f59e0b" fill-opacity=".85"/>`;
    Object.assign(DIAGRAMS, {
      'chiplet-ucie': {
        title: '칩렛과 UCIe',
        states: [
          { id: 'mono', label: '① 큰 칩 하나로 만들면',
            desc: '모든 기능을 칩 하나에 넣으면 칩이 커진다. 웨이퍼 위 결함은 곳곳에 흩어져 있어서 칩이 클수록 결함을 하나라도 만날 확률이 커지고, 한 곳만 불량이어도 칩 전체를 버려야 한다.' },
          { id: 'split', label: '② 작은 칩렛으로 쪼개면',
            desc: '기능별로 작은 칩(칩렛)으로 나누어 만들면 칩 하나의 면적이 작아 수율이 높다. 불량 칩렛만 버리고 검사를 통과한 칩렛끼리 조합해 하나의 시스템으로 묶는다.' },
          { id: 'mix', label: '③ 칩렛마다 알맞은 공정',
            desc: '연산 코어는 비싸고 앞선 공정으로, 입출력이나 아날로그 회로는 값싼 성숙 공정으로 만들 수 있다. 기능마다 알맞은 공정을 골라 비용과 성능을 함께 챙긴다.' },
          { id: 'ucie', label: '④ UCIe: 칩렛 사이의 표준',
            desc: 'UCIe는 칩렛끼리 데이터를 주고받는 방식을 표준으로 정한 규격이다. 프로토콜 계층, 다이 간 어댑터, 물리 계층으로 나뉘어서, 서로 다른 회사가 만든 칩렛도 같은 규칙으로 연결할 수 있다.' },
        ],
        svg(s) {
          const x = (cx, cy) => `<path class="dg-line" stroke="#ef4444" stroke-width="3" d="M${cx - 8} ${cy - 8} L${cx + 8} ${cy + 8} M${cx + 8} ${cy - 8} L${cx - 8} ${cy + 8}"/>`;
          if (s.id === 'mono') return dgS3('칩렛: ' + s.label, `${dgR(100, 280, 70, 150, 'dg-si')}${x(210, 120)}
            ${dgT(190, 148, '큰 칩 (모든 기능)', 'dg-t')}${dgT(190, 250, '결함 하나 → 칩 전체 폐기', 'dg-off')}${dgT(170, 286, s.label, 'dg-volt')}`);
          if (s.id === 'split') {
            const b = [[100, 80], [196, 80], [100, 166], [196, 166]];
            return dgS3('칩렛: ' + s.label, b.map((p, i) => dgR(p[0], p[0] + 84, p[1], 70, i === 1 ? 'dg-p' : 'dg-si')).join('') + x(238, 115)
              + dgT(142, 120, 'OK', 'dg-on') + dgT(142, 206, 'OK', 'dg-on') + dgT(238, 206, 'OK', 'dg-on') + dgT(190, 64, '불량 칩렛만 버림', 'dg-off') + dgT(210, 270, s.label, 'dg-volt'));
          }
          if (s.id === 'mix') {
            const bx = [[50, 'CPU 코어', '최신 공정', 'dg-hk'], [150, 'I/O', '성숙 공정', 'dg-n'], [250, '메모리 I/F', '다른 공정', 'dg-ox']];
            return dgS3('칩렛: ' + s.label, dgR(40, 350, 190, 16, 'dg-fsub') + bx.map(b => dgR(b[0], b[0] + 90, 100, 80, b[3]) + dgT(b[0] + 45, 138, b[1], 'dg-t') + dgT(b[0] + 45, 158, b[2], 'dg-volt')).join('')
              + bx.map(b => dgR(b[0] + 20, b[0] + 70, 180, 10, 'dg-melt')).join('') + dgT(195, 214, '인터포저 / 기판 위에 한데 묶음', 'dg-sub') + dgT(210, 270, s.label, 'dg-volt'));
          }
          const col = (cx) => ['프로토콜', '다이 간 어댑터', '물리 계층'].map((t, i) => dgR(cx, cx + 100, 80 + i * 44, 38, i === 2 ? 'dg-hk' : 'dg-fsub') + dgT(cx + 50, 104 + i * 44, t, 'dg-sub')).join('');
          return dgS3('칩렛: ' + s.label, `${col(50)}${col(250)}${dgArrow(150, 190, 250, 190)}${dgArrow(250, 190, 150, 190)}${dgT(200, 180, 'UCIe 링크', 'dg-volt')}
            ${dgT(100, 72, '칩렛 A', 'dg-t')}${dgT(300, 72, '칩렛 B', 'dg-t')}${dgT(210, 270, s.label, 'dg-volt')}`);
        }
      },
      'fowlp': {
        title: '팬아웃 웨이퍼 레벨 패키지 (FOWLP)',
        states: [
          { id: 'fanin', label: '① 팬인 (기존)',
            desc: '기존 웨이퍼 레벨 패키지(팬인)는 연결 단자(솔더 볼)를 칩 면적 안에만 둘 수 있다. 칩이 작아질수록 볼을 놓을 자리가 모자라 연결 수가 한계에 부딪힌다.' },
          { id: 'fanout', label: '② 팬아웃 구조',
            desc: '팬아웃은 칩 주위를 몰딩 수지로 넓혀 놓고, 재배선층(RDL)으로 배선을 칩 바깥까지 펼친다. 볼을 칩 면적 밖에도 놓을 수 있어 연결 수가 늘고, 기판 없이 얇고 짧은 배선으로 연결된다.' },
          { id: 'mold', label: '③ 공정 ① 재구성',
            desc: '웨이퍼를 잘라 얻은 좋은 칩만 캐리어 위에 간격을 두고 다시 늘어놓고, 몰딩 수지로 덮어 새로운 둥근 판(재구성 웨이퍼)을 만든다.' },
          { id: 'rdl', label: '④ 공정 ② RDL',
            desc: '캐리어를 떼어 낸 면에 절연막과 구리 배선(RDL)을 사진·도금 공정으로 쌓는다. 칩 패드에서 시작한 배선이 칩 바깥의 볼 자리까지 이어진다.' },
          { id: 'ball', label: '⑤ 공정 ③ 볼·절단',
            desc: '배선 끝 자리에 솔더 볼을 붙이고 칩 단위로 자르면 패키지가 완성된다.' },
        ],
        svg(s) {
          const die = (x, w = 80) => dgR(x, x + w, 112, 36, 'dg-si');
          if (s.id === 'fanin') return dgS3('FOWLP: ' + s.label, `${die(130, 100)}${dgR(130, 230, 148, 10, 'dg-fsub')}${[150, 180, 210].map(x => dgBall(x, 172)).join('')}
            <path class="dg-depl" d="M130 150 V190 M230 150 V190"/>${dgT(180, 214, '볼은 칩 면적 안에만', 'dg-off')}${dgT(180, 96, '칩', 'dg-sub')}${dgT(210, 270, s.label, 'dg-volt')}`);
          if (s.id === 'fanout') return dgS3('FOWLP: ' + s.label, `${dgR(50, 290, 100, 48, 'dg-ox')}${die(130, 80)}${dgR(50, 290, 148, 10, 'dg-fsub')}
            ${[70, 120, 170, 220, 270].map(x => dgBall(x, 172)).join('')}<path class="dg-line" d="M150 150 L70 164 M170 150 L120 164 M190 150 L220 164 M200 150 L270 164" stroke-width="1.6"/>
            <path class="dg-depl" d="M130 150 V190 M210 150 V190"/>${dgT(76, 214, '칩 밖에도 볼', 'dg-on', 'start')}${dgT(170, 92, '몰딩 수지 + 칩', 'dg-sub')}${dgT(316, 154, 'RDL', 'dg-sub', 'start')}${dgT(210, 270, s.label, 'dg-volt')}`);
          if (s.id === 'mold') return dgS3('FOWLP: ' + s.label, `${dgR(40, 300, 150, 16, 'dg-fsub')}${dgR(40, 300, 90, 60, 'dg-ox')}${[60, 150, 240].map(x => die(x, 60).replace('y="112"', 'y="114"')).join('')}
            ${dgT(170, 78, '몰딩 수지로 덮음', 'dg-sub')}${dgT(316, 160, '캐리어', 'dg-sub', 'start')}${dgT(210, 270, s.label, 'dg-volt')}`);
          if (s.id === 'rdl') return dgS3('FOWLP: ' + s.label, `${dgR(40, 300, 90, 60, 'dg-ox')}${[60, 150, 240].map(x => dgR(x, x + 60, 114, 36, 'dg-si')).join('')}${dgR(40, 300, 150, 12, 'dg-fsub')}
            ${[[90, 72], [180, 162], [270, 252]].map(p => `<path class="dg-cu" d="M${p[0] - 20} 152 L${p[1] - 14} 156 L${p[1] + 14} 156 L${p[0] + 20} 152 Z" style="fill:#f59e0b;fill-opacity:.7"/>`).join('')}
            ${dgT(170, 190, '구리 배선(RDL)을 칩 바깥까지 펼침', 'dg-volt')}${dgT(170, 78, '캐리어 제거', 'dg-sub')}${dgT(210, 270, s.label, 'dg-volt')}`);
          return dgS3('FOWLP: ' + s.label, `${dgR(40, 300, 90, 60, 'dg-ox')}${[60, 150, 240].map(x => dgR(x, x + 60, 114, 36, 'dg-si')).join('')}${dgR(40, 300, 150, 10, 'dg-fsub')}
            ${[60, 100, 150, 190, 240, 280].map(x => dgBall(x, 172, 7)).join('')}<path class="dg-line" stroke-dasharray="5 4" d="M105 80 V200 M195 80 V200"/>${dgT(105, 222, '절단', 'dg-volt')}${dgT(195, 222, '절단', 'dg-volt')}${dgT(210, 270, s.label, 'dg-volt')}`);
        }
      },
      'package-types': {
        title: '패키지 종류: QFP · BGA · CSP',
        states: [
          { id: 'qfp', label: '① QFP',
            desc: 'QFP는 칩을 수지로 덮고 사방 가장자리로 금속 리드를 뽑아낸 구조다. 만들기 쉽고 값이 싸지만 연결 단자가 가장자리에만 있어서 핀 수를 늘리기 어렵고 패키지가 칩보다 훨씬 크다.' },
          { id: 'bga', label: '② BGA',
            desc: 'BGA는 패키지 바닥 전체에 솔더 볼을 격자로 배치한다. 같은 면적에 훨씬 많은 단자를 둘 수 있고 연결 거리가 짧아 신호 특성이 좋아서 고성능 칩에 널리 쓴다.' },
          { id: 'csp', label: '③ CSP',
            desc: 'CSP는 패키지 크기가 칩 크기에 가까운(대략 칩 면적의 1.2배 이하) 패키지다. 작고 가벼워 스마트폰 같은 소형 기기에 알맞다.' },
          { id: 'pins', label: '④ 단자 배치 비교',
            desc: '위에서 본 단자 배치다. QFP는 가장자리 한 줄, BGA는 바닥 전체의 격자, CSP는 작은 면적의 격자다. 단자를 놓을 수 있는 면적이 넓을수록 핀 수를 늘리기 쉽다.' },
        ],
        svg(s) {
          if (s.id === 'pins') {
            const sq = (x, y, w, dots) => dgR(x, x + w, y, w, 'dg-fsub') + dots.map(d => `<circle cx="${x + d[0]}" cy="${y + d[1]}" r="3.4" fill="#f59e0b"/>`).join('');
            const edge = []; for (let i = 0; i < 7; i++) { edge.push([8 + i * 14, 8], [8 + i * 14, 92], [8, 8 + i * 14], [92, 8 + i * 14]); }
            const grid = (n, w, m) => { const o = []; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) o.push([m + i * ((w - 2 * m) / (n - 1)), m + j * ((w - 2 * m) / (n - 1))]); return o; };
            return dgS3('패키지: ' + s.label, `${sq(30, 90, 100, edge)}${sq(150, 90, 100, grid(6, 100, 12))}${sq(272, 112, 56, grid(3, 56, 10))}
              ${dgT(80, 212, 'QFP', 'dg-t')}${dgT(80, 230, '가장자리', 'dg-sub')}${dgT(200, 212, 'BGA', 'dg-t')}${dgT(200, 230, '바닥 전체 격자', 'dg-sub')}${dgT(300, 212, 'CSP', 'dg-t')}${dgT(300, 230, '작고 가벼움', 'dg-sub')}${dgT(210, 270, s.label, 'dg-volt')}`);
          }
          if (s.id === 'qfp') return dgS3('패키지: ' + s.label, `${dgR(100, 260, 100, 66, 'dg-ox')}${dgR(140, 220, 152, 8, 'dg-fsub')}${dgR(150, 210, 138, 14, 'dg-si')}
            <path class="dg-line" d="M154 138 Q135 118 112 148 M206 138 Q225 118 248 148" stroke-width="1.6"/>
            ${dgR(60, 112, 146, 6, 'dg-met')}${dgR(60, 68, 146, 30, 'dg-met')}${dgR(248, 300, 146, 6, 'dg-met')}${dgR(292, 300, 146, 30, 'dg-met')}
            ${dgT(180, 92, '수지(몰드)', 'dg-sub')}${dgT(64, 196, '리드', 'dg-sub')}${dgT(170, 214, '칩 + 와이어, 리드는 가장자리로', 'dg-volt')}${dgT(210, 270, s.label, 'dg-volt')}`);
          if (s.id === 'bga') return dgS3('패키지: ' + s.label, `${dgR(70, 290, 150, 12, 'dg-ox')}${dgR(90, 270, 90, 60, 'dg-ox', 'style="fill-opacity:.15"')}${dgR(140, 220, 132, 18, 'dg-si')}
            <path class="dg-line" d="M144 132 Q118 112 106 148 M216 132 Q242 112 254 148" stroke-width="1.6"/>
            ${[90, 126, 162, 198, 234, 270].map(x => dgBall(x, 176)).join('')}${dgT(180, 92, '칩 + 수지', 'dg-sub')}${dgT(316, 156, '기판', 'dg-sub', 'start')}${dgT(180, 214, '바닥 전체에 솔더 볼', 'dg-volt')}${dgT(210, 270, s.label, 'dg-volt')}`);
          return dgS3('패키지: ' + s.label, `<rect class="dg-depl" x="108" y="112" width="124" height="52"/>${dgR(120, 220, 126, 22, 'dg-si')}${dgR(120, 220, 148, 6, 'dg-fsub')}${[134, 170, 206].map(x => dgBall(x, 166, 7)).join('')}
            ${dgT(170, 96, '패키지 ≈ 칩 크기 (1.2배 이하)', 'dg-volt')}${dgT(316, 138, '칩', 'dg-sub', 'start')}${dgT(170, 214, '칩 바로 아래에 단자', 'dg-sub')}${dgT(210, 270, s.label, 'dg-volt')}`);
        }
      },
      'interposer-25d': {
        title: '2.5D 인터포저',
        states: [
          { id: 'why', label: '① 왜 인터포저인가',
            desc: '프로세서와 메모리 사이에는 수천 가닥의 신호선이 필요하다. 일반 패키지 기판의 배선은 굵고 간격이 넓어 이 많은 선을 짧게 연결하기 어렵다. 실리콘으로 만든 얇은 판 위에 칩 공정으로 가는 배선을 그리면 촘촘하게 이을 수 있다.' },
          { id: 'struct', label: '② 단면 구조',
            desc: '위에서부터 칩, 마이크로 범프, 실리콘 인터포저, 큰 범프(C4), 패키지 기판, 솔더 볼 순서다. 칩끼리는 인터포저 위 가는 배선으로 옆으로 연결되고, 인터포저를 관통하는 구멍(TSV)이 아래 기판과 전원·신호를 이어 준다.' },
          { id: 'signal', label: '③ 신호가 지나가는 길',
            desc: '옆 칩으로 가는 신호는 마이크로 범프를 내려가 인터포저의 가는 배선을 따라 수 mm만 가서 다시 올라간다. 짧고 촘촘한 배선 덕에 선 수를 크게 늘리면서 전력과 지연을 줄인다.' },
          { id: 'issue', label: '④ 과제',
            desc: '큰 칩 여러 개를 얹으려면 인터포저도 커져서 값이 비싸고 휘기 쉬우며 만들 수 있는 크기에도 한계가 있다. 그래서 실리콘 대신 유기 재료 배선층을 쓰거나, 칩 사이에만 작은 실리콘 조각(브리지)을 넣는 방식이 나왔다.' },
        ],
        svg(s) {
          if (s.id === 'why') {
            const thick = [0, 1, 2].map(i => `<path class="dg-line dg-thick" d="M110 ${92 + i * 10} H230" style="stroke:#f59e0b"/>`).join('');
            const thin = Array.from({ length: 12 }, (_, i) => `<path class="dg-line" d="M110 ${178 + i * 3.4} H230" stroke-width="1.2"/>`).join('');
            return dgS3('인터포저: ' + s.label, `${dgT(180, 70, '일반 기판: 굵은 배선, 적은 수', 'dg-sub')}${dgR(50, 110, 84, 34, 'dg-si')}${dgR(230, 290, 84, 34, 'dg-si')}${thick}
              ${dgT(180, 160, '실리콘 인터포저: 가는 배선, 많은 수', 'dg-volt')}${dgR(50, 110, 170, 44, 'dg-si')}${dgR(230, 290, 170, 44, 'dg-si')}${thin}
              ${dgT(210, 270, s.label, 'dg-volt')}`);
          }
          if (s.id === 'struct') {
            return dgS3('인터포저: ' + s.label, `${dgR(60, 160, 60, 26, 'dg-si')}${dgR(190, 290, 60, 26, 'dg-si')}
              ${[72, 100, 132, 200, 232, 264].map(x => `<circle cx="${x}" cy="90" r="3.4" fill="#f59e0b"/>`).join('')}
              ${dgR(50, 300, 94, 28, 'dg-hk')}<path class="dg-line" d="M68 104 H150 M190 104 H280" stroke-width="1.4"/>${[100, 250].map(x => dgR(x, x + 6, 98, 26, 'dg-cu')).join('')}
              ${[66, 120, 186, 240, 284].map(x => `<circle cx="${x}" cy="136" r="5" fill="#f59e0b"/>`).join('')}
              ${dgR(40, 310, 144, 18, 'dg-ox')}${[70, 130, 200, 260].map(x => dgBall(x, 164, 6)).join('')}
              ${dgT(316, 72, '칩', 'dg-sub', 'start')}${dgT(316, 90, '마이크로 범프', 'dg-sub', 'start')}${dgT(316, 112, '인터포저', 'dg-sub', 'start')}${dgT(316, 140, 'C4 범프', 'dg-sub', 'start')}${dgT(316, 158, '패키지 기판', 'dg-sub', 'start')}${dgT(316, 178, '솔더 볼', 'dg-sub', 'start')}${dgT(115, 128, 'TSV', 'dg-volt')}
              ${dgT(210, 270, s.label, 'dg-volt')}`, '-10 40 440 250');
          }
          if (s.id === 'signal') {
            return dgS3('인터포저: ' + s.label, `${dgR(60, 150, 70, 26, 'dg-si')}${dgR(210, 300, 70, 26, 'dg-si')}${dgR(40, 320, 108, 28, 'dg-hk')}
              <path d="M90 100 V122 H260 V100" fill="none" stroke="var(--hl-accent)" stroke-width="3" stroke-dasharray="6 5"/>${dgArrow(260, 108, 260, 100, 'dg-line dg-hl')}
              ${[90, 260].map(x => dgBall(x, 106, 4)).join('')}${dgR(40, 320, 138, 16, 'dg-ox')}
              ${dgT(175, 150, '짧고 촘촘한 배선 (수 mm)', 'dg-volt')}${dgT(105, 62, '칩 A', 'dg-sub')}${dgT(255, 62, '칩 B', 'dg-sub')}${dgT(170, 210, '선 수 ↑, 전력·지연 ↓', 'dg-on')}${dgT(210, 270, s.label, 'dg-volt')}`, '-10 40 440 250');
          }
          return dgS3('인터포저: ' + s.label, `${dgR(40, 190, 150, 28, 'dg-hk')}${dgR(50, 110, 112, 36, 'dg-si')}${dgR(120, 180, 112, 36, 'dg-si')}
            ${dgR(210, 360, 170, 16, 'dg-ox')}${dgR(215, 275, 132, 36, 'dg-si')}${dgR(295, 355, 132, 36, 'dg-si')}${dgR(262, 308, 164, 10, 'dg-hk')}
            ${dgT(115, 106, '큰 인터포저 전체', 'dg-sub')}${dgT(285, 106, '칩 사이만 작은 브리지', 'dg-sub')}${dgT(115, 208, '비싸고 휘기 쉬움', 'dg-off')}${dgT(285, 208, '필요한 곳만 연결', 'dg-on')}
            ${dgT(210, 270, s.label, 'dg-volt')}`, '-10 40 440 250');
        }
      },
      'hybrid-bonding': {
        title: '하이브리드 본딩',
        states: [
          { id: 'bump', label: '① 범프 방식의 한계',
            desc: '범프로 잇는 방식은 칩 사이에 간격이 있고 범프와 언더필이 들어간다. 범프를 일정 크기보다 작게 만들기 어려워 연결 간격(피치)이 수십 μm 수준에서 막히고, 간격이 있어 열과 전기 신호의 길도 길어진다.' },
          { id: 'prep', label: '② 표면 준비 (CMP)',
            desc: '붙일 두 면을 CMP로 거울처럼 평평하게 간다. 절연막(산화막) 속 구리 패드는 일부러 살짝 오목하게(수 nm) 만든다. 표면이 이렇게 평평하고 깨끗해야 접합이 된다.' },
          { id: 'contact', label: '③ 접촉 (상온)',
            desc: '두 칩을 정렬해 맞대면 산화막끼리 먼저 붙는다. 이때는 구리 패드 사이에 아주 얇은 틈이 남아 있다.' },
          { id: 'anneal', label: '④ 열처리 (어닐링)',
            desc: '가열하면 구리가 산화막보다 더 많이 팽창해 틈을 메우고 서로 맞닿아 확산하며 하나로 이어진다. 산화막은 기계적으로, 구리는 전기적으로 동시에 접합된다(그래서 하이브리드). 범프가 없어 간격이 수 μm 이하까지 줄어든다.' },
        ],
        svg(s) {
          const pads = [100, 180, 260];
          if (s.id === 'bump') return dgS3('하이브리드 본딩: ' + s.label, `${dgR(50, 310, 60, 36, 'dg-si')}${dgR(50, 310, 96, 56, 'dg-ox', 'style="fill-opacity:.18"')}${dgR(50, 310, 152, 36, 'dg-si')}
            ${pads.map(x => dgR(x - 14, x + 14, 96, 56, 'dg-met', 'style="fill:#f59e0b;fill-opacity:.8"')).join('')}${dgT(180, 50, '칩 A', 'dg-sub')}${dgT(180, 208, '칩 B', 'dg-sub')}
            ${dgT(316, 128, '범프 + 언더필', 'dg-sub', 'start')}${dgT(170, 236, '피치 수십 μm, 사이 간격이 큼', 'dg-off')}${dgT(210, 270, s.label, 'dg-volt')}`);
          const g = s.id === 'prep' ? 40 : 0;
          const topOx = dgR(50, 310, 100, 14, 'dg-ox'), topDie = dgR(50, 310, 60, 40, 'dg-si');
          const by = 114 + g;
          const botOx = dgR(50, 310, by, 14, 'dg-ox'), botDie = dgR(50, 310, by + 14, 40, 'dg-si');
          if (s.id === 'prep') return dgS3('하이브리드 본딩: ' + s.label, `${topDie}${topOx}${botOx}${botDie}
            ${pads.map(x => dgR(x - 15, x + 15, 100, 10, 'dg-cu') + dgR(x - 15, x + 15, by + 4, 10, 'dg-cu')).join('')}
            ${dgT(316, 96, '평탄한 산화막', 'dg-sub', 'start')}${dgT(316, 112, 'Cu는 살짝 오목', 'dg-sub', 'start')}${dgArrow(180, 124, 180, 150)}
            ${dgT(170, 244, 'CMP로 거울처럼 평평하게', 'dg-volt')}${dgT(210, 270, s.label, 'dg-volt')}`);
          if (s.id === 'contact') return dgS3('하이브리드 본딩: ' + s.label, `${topDie}${topOx}${botOx}${botDie}
            ${pads.map(x => dgR(x - 15, x + 15, 100, 10, 'dg-cu') + dgR(x - 15, x + 15, by + 4, 10, 'dg-cu') + dgR(x - 15, x + 15, 110, 8, 'dg-void')).join('')}
            ${dgT(316, 114, '산화막끼리 접합', 'dg-sub', 'start')}${dgT(316, 128, '(상온)', 'dg-sub', 'start')}${dgT(180, 188, '구리 사이엔 아주 얇은 틈', 'dg-off')}${dgT(210, 270, s.label, 'dg-volt')}`);
          return dgS3('하이브리드 본딩: ' + s.label, `${topDie}${topOx}${botOx}${botDie}
            ${pads.map(x => dgR(x - 17, x + 17, 100, 28, 'dg-cu')).join('')}
            ${[100, 180, 260].map(x => dgArrow(x - 30, 114, x - 18, 114)).join('')}${dgT(316, 114, '구리 팽창·확산', 'dg-sub', 'start')}${dgT(316, 130, '→ 한 덩어리', 'dg-sub', 'start')}
            ${dgT(170, 190, '산화막 = 기계적, 구리 = 전기적 접합', 'dg-on')}${dgT(210, 270, s.label, 'dg-volt')}`);
        }
      },
      'flip-chip': {
        title: '플립칩 접합 과정',
        states: [
          { id: 'bump', label: '① 범프 형성',
            desc: '칩의 패드 위에 금속층(UBM)을 입히고 그 위에 솔더(땜납) 범프를 만든다. 범프는 칩 가장자리뿐 아니라 면 전체에 격자로 배열할 수 있다.' },
          { id: 'align', label: '② 뒤집어 정렬',
            desc: '칩을 뒤집어(flip) 범프가 달린 면이 기판을 향하게 하고, 범프를 기판의 패드에 맞춰 올린다.' },
          { id: 'reflow', label: '③ 리플로우',
            desc: '열을 가해 솔더를 녹였다 식히면 범프가 기판 패드에 접합된다. 녹은 솔더는 표면 장력으로 패드 쪽으로 끌려가서 칩이 조금 어긋나도 제자리로 맞춰지는(자기 정렬) 효과가 있다.' },
          { id: 'underfill', label: '④ 언더필',
            desc: '칩과 기판 사이 틈에 에폭시(언더필)를 모세관 현상으로 흘려 넣고 굳힌다. 칩과 기판은 열팽창 정도가 달라서 범프에 응력이 몰리는데, 언더필이 이를 퍼뜨려 범프가 끊어지는 것을 막는다.' },
        ],
        svg(s) {
          const xs = [90, 140, 190, 240, 290].map(x => x - 10);
          const bumpUp = (y) => xs.map(x => dgR(x - 10, x + 10, y + 8, 6, 'dg-met') + `<circle cx="${x}" cy="${y}" r="10" fill="#f59e0b" fill-opacity=".85"/>`).join('');
          if (s.id === 'bump') return dgS3('플립칩: ' + s.label, `${dgR(50, 310, 130, 40, 'dg-si')}${bumpUp(124)}${dgT(316, 150, '칩', 'dg-sub', 'start')}${dgT(180, 92, '패드 위 UBM + 솔더 범프', 'dg-volt')}${dgT(170, 200, '면 전체에 격자로 배열 가능', 'dg-sub')}${dgT(210, 270, s.label, 'dg-volt')}`);
          const sub = (y) => dgR(40, 320, y, 24, 'dg-ox') + xs.map(x => dgR(x - 12, x + 12, y - 4, 4, 'dg-met')).join('');
          const dieDown = (y) => dgR(50, 310, y, 36, 'dg-si');
          if (s.id === 'align') return dgS3('플립칩: ' + s.label, `${dieDown(60)}${xs.map(x => `<circle cx="${x}" cy="106" r="10" fill="#f59e0b" fill-opacity=".85"/>`).join('')}${sub(160)}
            ${dgT(316, 78, '칩 (범프면 ↓)', 'dg-sub', 'start')}${dgT(316, 174, '기판', 'dg-sub', 'start')}${dgT(170, 214, '칩을 뒤집어 범프를 기판 패드에 맞춤', 'dg-volt')}${dgT(210, 270, s.label, 'dg-volt')}`);
          const joint = xs.map(x => `<path d="M${x - 10} 96 Q${x - 15} 126 ${x - 11} 152 H${x + 11} Q${x + 15} 126 ${x + 10} 96 Z" fill="#f59e0b" fill-opacity=".85"/>`).join('');
          if (s.id === 'reflow') return dgS3('플립칩: ' + s.label, `${dieDown(60)}${joint}${sub(156)}
            ${[110, 190, 270].map(x => `<path class="dg-heat" d="M${x} 214 q-5 -8 0 -16 t0 -16"/>`).join('')}${dgT(316, 128, '녹았다 굳은 솔더', 'dg-sub', 'start')}${dgT(170, 244, '가열 → 용융 → 냉각, 자기 정렬', 'dg-volt')}${dgT(210, 270, s.label, 'dg-volt')}`, '-10 20 440 280');
          return dgS3('플립칩: ' + s.label, `${dgR(40, 320, 96, 60, 'dg-ox', 'style="fill-opacity:.22"')}${dieDown(60)}${joint}${sub(156)}
            ${dgArrow(24, 128, 60, 128)}${dgT(316, 128, '언더필(에폭시)', 'dg-sub', 'start')}${dgT(170, 214, '틈을 채워 범프 응력 분산', 'dg-on')}${dgT(210, 270, s.label, 'dg-volt')}`, '-10 20 440 280');
        }
      },
      'wire-bonding': {
        title: '와이어 본딩 과정',
        states: [
          { id: 'ball', label: '① 볼 형성',
            desc: '캐필러리(가는 관)에서 나온 금속 와이어 끝에 불꽃(방전)을 일으키면 끝이 녹아 작은 공 모양이 된다.' },
          { id: 'first', label: '② 1차 본딩',
            desc: '캐필러리가 공을 칩의 패드에 눌러 붙인다. 열, 압력, 초음파를 함께 주어 금속끼리 결합시키는 볼 본딩이다.' },
          { id: 'second', label: '③ 루프와 2차 본딩',
            desc: '와이어를 풀며 호(루프)를 그리며 기판의 리드 위로 이동해 눌러 붙이고(스티치) 와이어를 끊는다. 이렇게 와이어 하나가 칩 패드와 리드를 이어 준다.' },
          { id: 'vars', label: '④ 본딩 변수',
            desc: '힘(압력), 초음파 세기와 시간, 온도가 접합 품질을 정한다. 너무 약하면 덜 붙어 떨어지고, 너무 세면 패드가 깨지거나 패드 아래 구조가 손상된다. 그래서 알맞은 범위를 찾아 관리한다.' },
        ],
        svg(s) {
          const base = dgR(60, 200, 190, 30, 'dg-si') + dgR(60, 200, 180, 10, 'dg-met') + dgR(240, 330, 196, 24, 'dg-ox') + dgR(244, 324, 188, 8, 'dg-met');
          const cap = (x, y) => `<path class="dg-hk" d="M${x - 12} ${y - 70} H${x + 12} L${x + 5} ${y} H${x - 5} Z"/>`;
          if (s.id === 'ball') return dgS3('와이어 본딩: ' + s.label, `${base}${cap(130, 120)}<path class="dg-line" d="M130 50 V128" stroke-width="1.4"/><circle cx="130" cy="134" r="9" fill="#f59e0b"/>
            <path class="dg-volt" d="M160 140 l8 -10 l-4 0 l8 -10" fill="none" stroke="#fbbf24" stroke-width="2"/>${dgT(184, 138, '방전(불꽃)', 'dg-sub', 'start')}${dgT(316, 52, '캐필러리', 'dg-sub', 'start')}${dgT(130, 246, '칩 패드', 'dg-sub')}${dgT(210, 270, s.label, 'dg-volt')}`);
          if (s.id === 'first') return dgS3('와이어 본딩: ' + s.label, `${base}${cap(130, 172)}<path class="dg-line" d="M130 102 V172" stroke-width="1.4"/><ellipse cx="130" cy="178" rx="16" ry="6" fill="#f59e0b"/>
            ${dgArrow(160, 120, 160, 160)}${dgT(172, 140, '압력', 'dg-sub', 'start')}${dgT(316, 140, '열·압력·초음파', 'dg-volt', 'start')}${dgT(130, 246, '칩 패드', 'dg-sub')}${dgT(210, 270, s.label, 'dg-volt')}`);
          if (s.id === 'second') return dgS3('와이어 본딩: ' + s.label, `${base}${cap(284, 184)}<path class="dg-line" d="M130 176 Q150 80 284 112 V184" stroke-width="1.6" fill="none"/><ellipse cx="130" cy="178" rx="14" ry="5" fill="#f59e0b"/>
            <ellipse cx="284" cy="190" rx="14" ry="4" fill="#f59e0b"/>${dgT(180, 82, '루프', 'dg-sub')}${dgT(130, 246, '칩 패드', 'dg-sub')}${dgT(284, 246, '리드', 'dg-sub')}${dgT(210, 270, s.label, 'dg-volt')}`);
          const row = (y, name, lo, hi) => dgT(50, y, name, 'dg-t', 'start') + dgR(130, 190, y - 12, 16, 'dg-off', 'style="fill-opacity:.25"') + dgR(190, 250, y - 12, 16, 'dg-on', 'style="fill-opacity:.3"') + dgR(250, 310, y - 12, 16, 'dg-off', 'style="fill-opacity:.25"');
          return dgS3('와이어 본딩: ' + s.label, `${row(90, '힘')}${row(130, '초음파')}${row(170, '온도')}${row(210, '시간')}
            ${dgT(160, 70, '덜 붙음', 'dg-off')}${dgT(220, 70, '적정', 'dg-on')}${dgT(280, 70, '패드 손상', 'dg-off')}${dgT(210, 270, s.label, 'dg-volt')}`);
        }
      },
      'molding': {
        title: '몰딩 공정 (EMC)',
        states: [
          { id: 'place', label: '① 칩 장착',
            desc: '와이어 본딩까지 끝난 칩을 몰드(금형) 안에 넣고 닫는다. 한쪽에는 가루를 뭉친 에폭시 몰딩 컴파운드(EMC) 알약이 들어 있다.' },
          { id: 'fill', label: '② 주입',
            desc: '알약을 가열해 녹이고 플런저로 눌러 러너와 게이트를 따라 캐비티로 밀어 넣는다. 고온으로 점도가 낮아져야 칩과 와이어 사이를 잘 파고들지만, 압력이 너무 세면 와이어가 휜다.' },
          { id: 'cure', label: '③ 경화',
            desc: '몰드 온도(180 °C 안팎)에서 에폭시가 가교 반응으로 굳는다. 필요하면 꺼낸 뒤 오븐에서 한 번 더 구워(포스트 큐어) 완전히 굳힌다.' },
          { id: 'defect', label: '④ 불량 유형',
            desc: '공기가 갇히면 공극(보이드), 수지 흐름에 밀리면 와이어가 휘어 닿는 와이어 스윕, 수지가 덜 차면 미충진이 생긴다. 모두 온도·압력·점도·주입 속도를 맞춰 줄인다.' },
        ],
        svg(s) {
          const pkg = `${dgR(60, 300, 200, 14, 'dg-ox')}${dgR(130, 230, 166, 34, 'dg-si')}`;
          const wires = (sw) => `<path class="dg-line" d="M140 166 Q${sw ? 125 : 105} ${sw ? 128 : 130} 80 200 M220 166 Q${sw ? 262 : 255} ${sw ? 128 : 130} 280 200" fill="none" stroke-width="1.5"/>`;
          const cav = `<path class="dg-line" d="M50 214 V120 H310 V214" fill="none" stroke-dasharray="6 4"/>`;
          if (s.id === 'place') return dgS3('몰딩: ' + s.label, `${cav}${pkg}${wires(false)}${dgR(8, 42, 150, 40, 'dg-ox', 'style="fill-opacity:.5"')}${dgT(25, 144, 'EMC', 'dg-sub')}${dgT(180, 104, '몰드 캐비티(빈 공간)', 'dg-sub')}${dgT(170, 244, '칩 + 와이어를 금형 안에 넣음', 'dg-volt')}${dgT(210, 270, s.label, 'dg-volt')}`);
          if (s.id === 'fill') return dgS3('몰딩: ' + s.label, `${cav}${pkg}${wires(false)}${dgR(52, 190, 122, 78, 'dg-ox', 'style="fill-opacity:.35"').replace('y="122"', 'y="122"')}${dgArrow(12, 168, 50, 168)}
            ${dgT(30, 150, '플런저', 'dg-sub')}${dgT(250, 150, '공기 배출', 'dg-sub')}${dgT(120, 104, '녹은 EMC가 밀고 들어감', 'dg-volt')}${dgT(170, 244, '점도 ↓(고온) · 압력으로 채움', 'dg-sub')}${dgT(210, 270, s.label, 'dg-volt')}`);
          if (s.id === 'cure') return dgS3('몰딩: ' + s.label, `${dgR(50, 310, 120, 94, 'dg-ox', 'style="fill-opacity:.4"')}${pkg}${wires(false)}
            ${[110, 180, 250].map(x => `<path class="dg-heat" d="M${x} 112 q-5 -8 0 -16 t0 -16"/>`).join('')}${dgT(170, 244, '가열로 가교 반응 → 단단히 굳음', 'dg-volt')}${dgT(210, 270, s.label, 'dg-volt')}`);
          return dgS3('몰딩: ' + s.label, `${dgR(50, 310, 120, 94, 'dg-ox', 'style="fill-opacity:.4"')}${dgR(50, 90, 120, 94, 'dg-void')}${pkg}${wires(true)}
            <circle cx="226" cy="140" r="7" fill="var(--bg,#fff)" stroke="#ef4444" stroke-width="2"/><circle cx="254" cy="158" r="5" fill="var(--bg,#fff)" stroke="#ef4444" stroke-width="2"/>
            ${dgT(60, 108, '미충진', 'dg-sub')}${dgT(165, 108, '와이어 스윕', 'dg-sub')}${dgT(268, 108, '보이드', 'dg-sub')}${dgT(170, 244, '온도·압력·점도·속도 관리가 핵심', 'dg-sub')}${dgT(210, 270, s.label, 'dg-volt')}`);
        }
      },
      'thermal-path': {
        title: '패키지 열 방출 경로',
        states: [
          { id: 'path', label: '① 열이 지나가는 길',
            desc: '열은 칩에서 열 계면 소재(TIM), 덮개(리드), 또 한 겹의 TIM, 방열판을 거쳐 공기로 빠져나간다. 칩 아래의 범프와 기판을 통해 아래로 빠지는 길도 있다.' },
          { id: 'series', label: '② 열 저항은 더해진다',
            desc: '각 구간은 열이 지나가기 어려운 정도(열 저항)를 가지고 있고, 직렬로 이어지면 모두 더해진다. 열 저항은 온도 차를 전력으로 나눈 값(Rth = ΔT / P)이라서, 저항이 클수록 같은 전력에서 칩이 더 뜨거워진다.' },
          { id: 'improve', label: '③ 개선: 틈 없애기',
            desc: '열이 가장 어려워하는 곳은 서로 맞닿은 면의 미세한 틈(공기)이다. 열전도율이 높은 TIM으로 틈을 메우고, 방열판 면적과 열 비아를 늘리면 저항이 줄어든다.' },
        ],
        svg(s) {
          if (s.id === 'path') return dgS3('열 방출: ' + s.label, `${[70, 100, 130, 160, 190, 220].map(x => dgR(x, x + 12, 40, 36, 'dg-met')).join('')}${dgR(60, 240, 76, 8, 'dg-met')}
            ${dgR(60, 240, 90, 10, 'dg-fsub')}${dgR(60, 240, 108, 6, 'dg-melt')}${dgR(90, 210, 118, 28, 'dg-si')}${dgR(60, 240, 150, 6, 'dg-fsub')}${dgR(40, 260, 156, 20, 'dg-ox')}${[80, 130, 180, 230].map(x => dgBall(x, 190, 6)).join('')}
            ${dgArrow(150, 116, 150, 84, 'dg-line dg-hl')}${dgArrow(150, 140, 150, 186, 'dg-line')}
            ${dgT(270, 62, '방열판', 'dg-sub', 'start')}${dgT(270, 94, '덮개(리드)', 'dg-sub', 'start')}${dgT(270, 116, 'TIM', 'dg-sub', 'start')}${dgT(270, 136, '칩', 'dg-sub', 'start')}${dgT(270, 170, '기판', 'dg-sub', 'start')}
            ${dgT(170, 232, '위쪽이 주된 길, 아래(범프·기판)는 보조', 'dg-sub')}${dgT(210, 270, s.label, 'dg-volt')}`);
          if (s.id === 'series') {
            const seg = [[40, 70, '칩→\n덮개', 'dg-si'], [110, 40, 'TIM', 'dg-melt'], [150, 90, '덮개·방열판', 'dg-met'], [240, 80, '공기 대류', 'dg-fsub']];
            return dgS3('열 방출: ' + s.label, `${seg.map(g => dgR(g[0], g[0] + g[1], 120, 40, g[3]) + dgT(g[0] + g[1] / 2, 144, g[2].split('\n')[0], 'dg-sub')).join('')}
              ${dgT(30, 112, 'Tj', 'dg-volt', 'end')}${dgT(330, 112, 'T공기', 'dg-volt', 'start')}${dgArrow(40, 100, 330, 100, 'dg-line dg-hl')}
              ${dgT(180, 200, 'Rth = ΔT / P', 'dg-t')}${dgT(180, 222, '직렬 구간의 저항이 모두 더해짐', 'dg-sub')}${dgT(210, 270, s.label, 'dg-volt')}`);
          }
          const stack = (x, good) => `${dgR(x, x + 120, 90, 24, 'dg-fsub')}${dgR(x, x + 120, 114, 12, 'dg-melt')}${dgR(x, x + 120, 126, 28, 'dg-si')}
            ${good ? '' : [x + 20, x + 52, x + 90].map(c => `<ellipse cx="${c}" cy="120" rx="7" ry="4" fill="var(--bg,#fff)" stroke="#ef4444" stroke-width="1.5"/>`).join('')}
            ${dgArrow(x + 60, 150, x + 60, 74, good ? 'dg-line dg-hl' : 'dg-line')}`;
          return dgS3('열 방출: ' + s.label, `${stack(50, false)}${stack(210, true)}${dgT(110, 180, '틈(공기)이 막음', 'dg-off')}${dgT(270, 180, '틈 없이 밀착', 'dg-on')}${dgT(110, 70, '열 흐름 ↓', 'dg-sub')}${dgT(270, 70, '열 흐름 ↑', 'dg-volt')}
            ${dgT(170, 214, '열전도율 높은 TIM · 큰 방열판 · 열 비아', 'dg-sub')}${dgT(210, 270, s.label, 'dg-volt')}`);
        }
      },
      'backgrind-dicing': {
        title: '백그라인딩과 다이싱',
        states: [
          { id: 'tape', label: '① 보호 테이프',
            desc: '회로가 있는 앞면에 보호 테이프를 붙이고 척에 올린다. 뒷면이 위로 오게 놓아 갈아 낼 준비를 한다. 테이프는 연마 중 회로를 보호하고 웨이퍼를 받쳐 준다.' },
          { id: 'grind', label: '② 백그라인딩',
            desc: '회전하는 연마 휠로 뒷면을 갈아 두께를 780 μm 안팎에서 수십~100 μm 대로 줄인다. 얇아야 패키지에 넣기 쉽고 열도 잘 빠지지만, 얇을수록 깨지거나 휘기 쉬워서 두께와 평탄도를 정밀하게 관리한다.' },
          { id: 'dice', label: '③ 블레이드 다이싱',
            desc: '얇아진 웨이퍼를 다이싱 테이프에 붙여 틀에 고정하고, 칩 사이 길(스크라이브 라인)을 회전하는 다이아몬드 블레이드로 자른다. 자른 틈(커프)만큼 재료가 사라지고, 가장자리가 깨지는 치핑이 생길 수 있다.' },
          { id: 'stealth', label: '④ 레이저 스텔스 다이싱',
            desc: '레이저를 웨이퍼 안쪽 한 층에 모아 변질층을 만들고, 테이프를 늘려 그 선을 따라 쪼갠다. 물과 가루가 거의 없고 폭이 좁아서 얇은 웨이퍼에 알맞다.' },
        ],
        svg(s) {
          if (s.id === 'tape') return dgS3('백그라인딩·다이싱: ' + s.label, `${dgR(60, 300, 110, 60, 'dg-si')}${dgR(60, 300, 170, 6, 'dg-hk')}${dgR(60, 300, 176, 12, 'dg-fsub')}${dgR(40, 320, 188, 14, 'dg-met')}
            ${dgT(316, 134, '웨이퍼 뒷면(위)', 'dg-sub', 'start')}${dgT(316, 168, '회로 면 ↓', 'dg-sub', 'start')}${dgT(316, 186, '보호 테이프', 'dg-sub', 'start')}${dgT(316, 204, '척(고정판)', 'dg-sub', 'start')}${dgT(170, 244, '회로 면을 테이프로 보호하고 뒤집어 올림', 'dg-volt')}${dgT(210, 270, s.label, 'dg-volt')}`);
          if (s.id === 'grind') return dgS3('백그라인딩·다이싱: ' + s.label, `<path class="dg-line" stroke-dasharray="5 4" d="M60 110 H300"/>${dgR(60, 300, 142, 28, 'dg-si')}${dgR(60, 300, 170, 6, 'dg-hk')}${dgR(60, 300, 176, 12, 'dg-fsub')}${dgR(40, 320, 188, 14, 'dg-met')}
            ${dgR(120, 240, 104, 36, 'dg-hk')}<path class="dg-line" d="M130 140 H230" stroke-width="3"/><path class="dg-flow" d="M250 88 q22 0 22 -22"/>${dgT(316, 108, '연마 휠 ⟳', 'dg-sub', 'start')}${dgT(316, 124, '원래 두께', 'dg-sub', 'start')}${dgT(316, 160, '얇아진 웨이퍼', 'dg-sub', 'start')}
            ${dgT(170, 232, '약 780 μm → 수십~100 μm 대', 'dg-volt')}${dgT(210, 270, s.label, 'dg-volt')}`);
          const dies = [[60, 125], [135, 170], [190, 235], [245, 300]];
          if (s.id === 'dice') return dgS3('백그라인딩·다이싱: ' + s.label, `${dies.map(d => dgR(d[0], d[1], 160, 24, 'dg-si')).join('')}${dgR(40, 320, 184, 8, 'dg-fsub')}${dgR(20, 40, 176, 30, 'dg-met')}${dgR(320, 340, 176, 30, 'dg-met')}
            ${dgR(174, 186, 90, 94, 'dg-hk')}<path class="dg-flow" d="M200 80 q22 0 22 22"/>${dgT(316, 110, '블레이드(회전)', 'dg-sub', 'start')}${dgT(316, 160, '커프(자른 폭)', 'dg-sub', 'start')}${dgT(180, 224, '다이싱 테이프 + 프레임', 'dg-sub')}${dgT(68, 156, '치핑', 'dg-off')}
            ${dgT(170, 248, '칩 사이 길을 따라 절단', 'dg-volt')}${dgT(210, 270, s.label, 'dg-volt')}`);
          return dgS3('백그라인딩·다이싱: ' + s.label, `${dgR(60, 300, 150, 26, 'dg-si')}${dgR(40, 320, 176, 8, 'dg-fsub')}
            <path class="dg-line" d="M150 50 L180 164 M210 50 L180 164" stroke="#f59e0b" stroke-width="2.4"/><circle cx="180" cy="164" r="5" fill="#f59e0b"/>
            <path class="dg-line" stroke-dasharray="3 3" d="M60 164 H300"/>${dgArrow(24, 190, 60, 190)}${dgArrow(336, 190, 300, 190)}${dgT(316, 130, '레이저', 'dg-sub', 'start')}${dgT(316, 168, '내부 변질층', 'dg-sub', 'start')}
            ${dgT(180, 220, '테이프를 늘리면 선을 따라 분리', 'dg-volt')}${dgT(210, 270, s.label, 'dg-volt')}`);
        }
      }
    });
    // ===== 주제별 전용 그림 (4차: 그림이 없던 주제) =====
    const dgBox = (x, y, w, h, t, c = 'dg-fsub') => dgR(x, x + w, y, h, c) + dgT(x + w / 2, y + h / 2 + 4, t, 'dg-sub');
    const dgChain = (items, y, w = 80, gap = 22, x0 = 20, c = 'dg-fsub') => items.map((t, i) => dgBox(x0 + i * (w + gap), y, w, 34, t, c)
      + (i < items.length - 1 ? dgArrow(x0 + i * (w + gap) + w + 2, y + 17, x0 + (i + 1) * (w + gap) - 2, y + 17) : '')).join('');
    const g4rnd = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    Object.assign(DIAGRAMS, {
      'sti-locos': {
        title: '소자 격리: LOCOS와 STI',
        states: [
          { id: 'locos', label: '① LOCOS',
            desc: '소자 영역(활성 영역)을 질화막으로 덮고, 노출된 자리를 열산화해 두꺼운 산화막(필드 산화막)을 키운다. 산화막이 실리콘을 먹으며 자라 표면 아래로 파고들어 반쯤 묻힌 모양이 된다.' },
          { id: 'beak', label: '② 새 부리 문제',
            desc: '산소가 질화막 가장자리 아래로 옆으로도 스며들어 산화막이 활성 영역 쪽으로 파고든다. 이 새 부리(bird’s beak) 때문에 활성 영역이 줄고 간격을 좁히기 어려워 미세화에 불리하다.' },
          { id: 'sti', label: '③ STI',
            desc: '실리콘에 좁은 홈(트렌치)을 파고 산화막을 채운 뒤 CMP로 평평하게 간다. 옆으로 퍼지지 않아 격리 폭이 좁고 표면이 평탄해서 미세 공정의 표준이다.' },
        ],
        svg(s) {
          if (s.id === 'locos') return dgS3('소자 격리: ' + s.label, `${dgR(40, 320, 170, 60, 'dg-si')}${dgR(60, 135, 154, 16, 'dg-hk')}${dgR(225, 300, 154, 16, 'dg-hk')}
            <path class="dg-ox" d="M130 170 Q150 146 180 146 Q210 146 230 170 Q210 204 180 204 Q150 204 130 170 Z"/>
            ${dgT(97, 140, '질화막(마스크)', 'dg-sub')}${dgT(262, 140, '활성 영역', 'dg-sub')}${dgT(180, 232, '필드 산화막(열산화로 성장)', 'dg-volt')}${dgT(316, 190, '실리콘', 'dg-sub', 'start')}`);
          if (s.id === 'beak') return dgS3('소자 격리: ' + s.label, `${dgR(40, 320, 150, 80, 'dg-si')}${dgR(40, 200, 118, 32, 'dg-hk')}
            <path class="dg-ox" d="M130 150 L205 146 Q250 104 330 108 L330 210 Q250 214 200 180 Q160 160 130 150 Z"/>
            ${dgArrow(110, 100, 150, 140)}${dgT(106, 92, '새 부리', 'dg-off')}${dgT(120, 106, '', 'dg-sub')}${dgT(316, 100, '필드 산화막', 'dg-sub', 'start')}${dgT(100, 214, '활성 영역이 줄어듦', 'dg-sub')}
            ${dgT(210, 248, '산화막이 마스크 아래로 파고듦', 'dg-volt')}`);
          return dgS3('소자 격리: ' + s.label, `${dgR(40, 320, 150, 90, 'dg-si')}${dgR(40, 150, 134, 16, 'dg-hk')}${dgR(210, 320, 134, 16, 'dg-hk')}${dgR(150, 210, 134, 78, 'dg-ox')}
            ${dgT(95, 124, '질화막', 'dg-sub')}${dgT(265, 124, '질화막', 'dg-sub')}${dgT(180, 124, '', 'dg-sub')}${dgT(180, 180, '트렌치', 'dg-sub')}${dgT(180, 196, '산화막', 'dg-sub')}${dgT(180, 252, '홈을 파고 산화막을 채워 CMP로 평탄화', 'dg-volt')}`);
        }
      },
      'silicide': {
        title: '금속 실리사이드와 콘택',
        states: [
          { id: 'dep', label: '① 금속 증착',
            desc: '트랜지스터를 다 만든 뒤 웨이퍼 전체에 니켈·코발트·티타늄 같은 금속을 얇게 입힌다.' },
          { id: 'react', label: '② 열처리로 반응',
            desc: '가열하면 금속이 실리콘과 닿은 곳(소스·드레인, 게이트 위)에서만 반응해 실리사이드가 된다. 산화막·스페이서 위의 금속은 반응하지 않는다.' },
          { id: 'strip', label: '③ 남은 금속 제거',
            desc: '반응하지 않은 금속만 약액으로 씻어 낸다. 마스크 없이 실리콘이 있는 자리에만 실리사이드가 남아 스스로 정렬된다(살리사이드).' },
          { id: 'contact', label: '④ 콘택 연결',
            desc: '절연막을 덮고 구멍을 뚫어 금속 플러그를 넣는다. 플러그가 실리콘 대신 실리사이드에 닿아 접촉 저항이 크게 낮아진다.' },
        ],
        svg(s) {
          const base = `${dgR(40, 320, 196, 40, 'dg-si')}${dgR(60, 158, 196, 14, 'dg-n')}${dgR(242, 320, 196, 14, 'dg-n')}${dgR(170, 230, 192, 4, 'dg-ox')}${dgR(170, 230, 160, 32, 'dg-fsub')}${dgR(158, 170, 164, 32, 'dg-ox')}${dgR(230, 242, 164, 32, 'dg-ox')}${dgT(316, 210, '소스·드레인', 'dg-sub', 'start')}${dgT(200, 150, '게이트', 'dg-sub')}`;
          const metal = dgR(60, 158, 190, 6, 'dg-met') + dgR(242, 320, 190, 6, 'dg-met') + dgR(170, 230, 154, 6, 'dg-met') + dgR(158, 170, 158, 6, 'dg-met') + dgR(230, 242, 158, 6, 'dg-met');
          const sil = dgR(60, 158, 196, 8, 'dg-cu') + dgR(242, 320, 196, 8, 'dg-cu') + dgR(170, 230, 160, 8, 'dg-cu');
          if (s.id === 'dep') return dgS3('실리사이드: ' + s.label, `${base}${metal}${dgT(105, 180, '금속 막', 'dg-sub')}${dgT(210, 258, '니켈·코발트 등을 전면에 증착', 'dg-volt')}`);
          if (s.id === 'react') return dgS3('실리사이드: ' + s.label, `${base}${dgR(158, 170, 158, 6, 'dg-met')}${dgR(230, 242, 158, 6, 'dg-met')}${sil}${[100, 280].map(x => `<path class="dg-heat" d="M${x} 262 q-5 -8 0 -16 t0 -16"/>`).join('')}${dgT(105, 190, '실리사이드', 'dg-sub')}${dgT(210, 258, '실리콘과 닿은 곳에서만 반응', 'dg-volt')}`);
          if (s.id === 'strip') return dgS3('실리사이드: ' + s.label, `${base}${sil}${dgT(105, 190, '실리사이드', 'dg-sub')}${dgT(210, 258, '남은 금속은 제거 → 자기 정렬', 'dg-volt')}`);
          return dgS3('실리사이드: ' + s.label, `${dgR(40, 320, 112, 84, 'dg-ox', 'style="fill-opacity:.25"')}${base}${sil}${dgR(88, 114, 112, 84, 'dg-met')}${dgR(262, 288, 112, 84, 'dg-met')}${dgT(101, 104, '콘택 플러그', 'dg-sub')}${dgT(210, 258, '플러그 ↔ 실리사이드: 접촉 저항 ↓', 'dg-on')}`);
        }
      },
      'rca-clean': {
        title: 'RCA 세정',
        states: [
          { id: 'sc1', label: '① SC-1',
            desc: '암모니아수·과산화수소·물을 섞은 용액이다. 표면을 살짝 산화시키고 녹이는 일을 되풀이하면서 유기물과 입자를 떼어 낸다.' },
          { id: 'sc2', label: '② SC-2',
            desc: '염산·과산화수소·물을 섞은 용액이다. 금속 이온(철·구리 등)을 녹여 씻어 낸다.' },
          { id: 'hf', label: '③ HF 처리',
            desc: '묽은 불산으로 표면의 자연 산화막을 벗겨 낸다. 산화막 속에 갇혀 있던 오염물도 함께 떨어져 나가 깨끗한 실리콘 면이 드러난다.' },
          { id: 'order', label: '④ 순서',
            desc: '대표적으로 SC-1 → HF → SC-2 순서로 진행하고, 각 단계 사이에는 순수(DI water)로 헹군다. 마지막에 건조한다.' },
        ],
        svg(s) {
          if (s.id === 'order') return dgS3('RCA 세정: ' + s.label, `${dgChain(['SC-1', 'HF', 'SC-2', '린스·건조'], 100)}${dgT(210, 170, '각 단계 사이에는 순수(DI water)로 헹굼', 'dg-sub')}${dgT(210, 192, '유기물·입자 → 자연 산화막 → 금속 이온', 'dg-volt')}`);
          const wafer = (x) => dgR(x, x + 130, 170, 40, 'dg-si');
          const part = (x) => [18, 52, 84, 112].map((d, i) => `<circle cx="${x + d}" cy="${i % 2 ? 163 : 161}" r="${i % 2 ? 5 : 7}" fill="#9ca3af"/>`).join('');
          const ion = (x) => [14, 40, 66, 92, 116].map(d => dgT(x + d, 164, '+', 'dg-volt')).join('');
          const ox = (x) => dgR(x, x + 130, 162, 8, 'dg-ox');
          const spec = { sc1: [part, (x) => '', 'NH₄OH + H₂O₂ + H₂O', '입자·유기물 제거'], sc2: [ion, (x) => '', 'HCl + H₂O₂ + H₂O', '금속 이온 제거'], hf: [ox, (x) => '', 'HF + H₂O', '자연 산화막 제거'] }[s.id];
          return dgS3('RCA 세정: ' + s.label, `${wafer(40)}${spec[0](40)}${wafer(250)}${spec[1](250)}${dgArrow(180, 150, 240, 150)}${dgT(105, 146, '세정 전', 'dg-sub')}${dgT(315, 146, '세정 후', 'dg-sub')}${dgT(210, 232, spec[2], 'dg-sub')}${dgT(210, 252, spec[3], 'dg-volt')}`);
        }
      },
      'deal-grove': {
        title: 'Deal-Grove 모델',
        states: [
          { id: 'steps', label: '① 세 단계',
            desc: '산화막이 자라려면 ① 산화제(O₂ 또는 H₂O)가 기체에서 산화막 표면으로 오고, ② 산화막 속을 확산해 실리콘 쪽으로 이동하고, ③ 실리콘 계면에서 반응해야 한다. 가장 느린 단계가 전체 속도를 정한다.' },
          { id: 'lin', label: '② 얇을 때: 선형',
            desc: '산화막이 얇으면 산화제가 금방 계면에 닿아서 계면 반응 속도가 전체를 정한다. 두께가 시간에 비례해 자란다.' },
          { id: 'par', label: '③ 두꺼울 때: 포물선',
            desc: '산화막이 두꺼워지면 산화제가 계면까지 가는 데 오래 걸려 확산이 전체 속도를 정한다. 두께가 시간의 제곱근에 비례해 점점 느리게 자란다.' },
        ],
        svg(s) {
          if (s.id === 'steps') return dgS3('Deal-Grove: ' + s.label, `${dgT(180, 76, '산화제 (O₂ / H₂O)', 'dg-sub')}${dgR(60, 300, 124, 40, 'dg-ox')}${dgR(60, 300, 164, 50, 'dg-si')}
            ${dgArrow(110, 84, 110, 120)}${dgArrow(180, 130, 180, 160)}<circle cx="250" cy="164" r="7" fill="#f59e0b"/>${dgT(120, 106, '', 'dg-sub')}
            ${dgT(316, 100, '① 표면으로 공급', 'dg-sub', 'start')}${dgT(316, 146, '② 산화막 속 확산', 'dg-sub', 'start')}${dgT(316, 178, '③ 계면에서 반응', 'dg-sub', 'start')}${dgT(210, 250, '가장 느린 단계가 속도를 결정', 'dg-volt')}`);
          const pts = [], seg = [];
          for (let i = 0; i <= 40; i++) { const t = i / 40, y = (Math.sqrt(1 + 30 * t) - 1) / (Math.sqrt(31) - 1); pts.push([70 + 280 * t, 220 - 130 * y, t]); }
          const path = (a, b) => 'M' + pts.filter(p => p[2] >= a && p[2] <= b).map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L');
          const lin = s.id === 'lin';
          return dgS3('Deal-Grove: ' + s.label, `<path class="dg-line" d="M70 80 V220 H350"/>${dgT(70, 72, '두께', 'dg-sub')}${dgT(350, 238, '시간', 'dg-sub')}
            <path class="dg-line" d="${path(0, 1)}" fill="none" stroke-width="2"/>
            <path d="${path(lin ? 0 : 0.5, lin ? 0.12 : 1)}" fill="none" stroke="#f59e0b" stroke-width="4.5"/>
            ${lin ? `<path class="dg-line" stroke-dasharray="5 4" d="M70 220 L170 100"/>${dgT(200, 120, '두께 ∝ 시간', 'dg-volt', 'start')}${dgT(210, 270, '반응 속도가 속도를 정함 (얇은 막)', 'dg-sub')}` : `${dgT(250, 130, '두께 ∝ √시간', 'dg-volt', 'start')}${dgT(210, 270, '확산 속도가 속도를 정함 (두꺼운 막)', 'dg-sub')}`}`);
        }
      },
      'oxide-dry': {
        title: '건식 산화',
        states: [
          { id: 'rxn', label: '① 산소와 반응',
            desc: '높은 온도에서 순수한 산소(O₂)를 흘려 실리콘을 산화시킨다(Si + O₂ → SiO₂). 산소가 이미 자란 산화막 속을 확산해 실리콘 계면에서 반응한다.' },
          { id: 'dense', label: '② 치밀한 막',
            desc: '느리게 자라는 대신 막이 치밀하고 절연 특성과 계면 품질이 좋다. 그래서 결함이 적어야 하는 얇은 막에 알맞다.' },
          { id: 'gate', label: '③ 쓰임',
            desc: '게이트 산화막처럼 얇고 품질이 중요한 막을 만들 때 쓴다. 두꺼운 막을 키우기에는 시간이 너무 오래 걸린다.' },
        ],
        svg(s) {
          if (s.id === 'rxn') return dgS3('건식 산화: ' + s.label, `${[100, 180, 260].map(x => dgT(x, 96, 'O₂', 'dg-volt') + dgArrow(x, 104, x, 134)).join('')}${dgR(60, 300, 140, 28, 'dg-ox')}${dgR(60, 300, 168, 50, 'dg-si')}${dgT(316, 158, 'SiO₂', 'dg-sub', 'start')}${dgT(316, 196, 'Si', 'dg-sub', 'start')}${dgT(210, 256, 'Si + O₂ → SiO₂', 'dg-volt')}`);
          if (s.id === 'dense') {
            const dots = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 14; c++) dots.push(`<circle cx="${84 + c * 15}" cy="${150 + r * 11}" r="3.2" fill="#6366f1" fill-opacity=".8"/>`);
            return dgS3('건식 산화: ' + s.label, `${dgR(60, 300, 140, 38, 'dg-ox')}${dgR(60, 300, 178, 40, 'dg-si')}${dots.join('')}${dgT(316, 160, '촘촘한 막', 'dg-sub', 'start')}${dgT(210, 110, '성장은 느림 · 막은 치밀', 'dg-volt')}${dgT(210, 256, '절연 특성·계면 품질 우수', 'dg-on')}`);
          }
          return dgS3('건식 산화: ' + s.label, `${dgR(60, 300, 190, 40, 'dg-si')}${dgR(120, 240, 186, 4, 'dg-ox')}${dgR(120, 240, 154, 32, 'dg-fsub')}${dgT(180, 144, '게이트', 'dg-sub')}${dgT(316, 188, '얇은 게이트 산화막', 'dg-sub', 'start')}${dgT(210, 256, '얇고 품질이 중요한 막에 사용', 'dg-volt')}`);
        }
      },
      'oxide-wet': {
        title: '습식 산화',
        states: [
          { id: 'rxn', label: '① 수증기와 반응',
            desc: '산소 대신 수증기(H₂O)를 써서 실리콘을 산화시킨다(Si + 2H₂O → SiO₂ + 2H₂). 수증기는 산화막 속에서 산소보다 훨씬 빨리 확산한다.' },
          { id: 'rate', label: '② 성장 속도',
            desc: '같은 온도와 시간에서 건식 산화보다 몇 배 빠르게 두꺼운 막이 자란다.' },
          { id: 'use', label: '③ 쓰임과 한계',
            desc: '두꺼운 필드 산화막이나 마스크용 산화막처럼 두께가 필요한 곳에 쓴다. 막 밀도는 건식보다 낮은 편이라 필요하면 열처리(어닐링)로 보완한다.' },
        ],
        svg(s) {
          if (s.id === 'rxn') return dgS3('습식 산화: ' + s.label, `${[100, 180, 260].map(x => dgT(x, 96, 'H₂O', 'dg-volt') + dgArrow(x, 104, x, 124)).join('')}${dgR(60, 300, 130, 44, 'dg-ox')}${dgR(60, 300, 174, 44, 'dg-si')}${dgT(316, 156, 'SiO₂', 'dg-sub', 'start')}${dgT(316, 198, 'Si', 'dg-sub', 'start')}${dgT(210, 256, 'Si + 2H₂O → SiO₂ + 2H₂', 'dg-volt')}`);
          if (s.id === 'rate') return dgS3('습식 산화: ' + s.label, `${dgT(70, 124, '건식', 'dg-t', 'end')}${dgR(80, 150, 106, 28, 'dg-ox')}${dgT(70, 184, '습식', 'dg-t', 'end')}${dgR(80, 280, 168, 28, 'dg-ox')}${dgT(210, 120, '', 'dg-sub')}${dgT(316, 122, '얇게 성장', 'dg-sub', 'start')}${dgT(290, 186, '두껍게 성장', 'dg-sub', 'start')}${dgT(210, 256, '같은 온도·시간에서 습식이 몇 배 빠름', 'dg-volt')}`);
          return dgS3('습식 산화: ' + s.label, `${dgR(60, 300, 170, 40, 'dg-si')}${dgR(60, 300, 120, 50, 'dg-ox')}${dgT(316, 148, '두꺼운 산화막', 'dg-sub', 'start')}${dgT(210, 100, '필드 산화막 · 마스크용', 'dg-volt')}${dgT(210, 256, '막 밀도는 낮은 편 → 필요하면 어닐링', 'dg-sub')}`);
        }
      },
      'electromigration': {
        title: '전자 이동 (Electromigration)',
        states: [
          { id: 'wind', label: '① 전자 바람',
            desc: '배선에 센 전류가 흐르면 움직이는 전자가 금속 원자와 부딪히며 원자를 전자 흐름 방향으로 조금씩 밀어낸다. 이것을 전자 바람이라고 부른다.' },
          { id: 'fail', label: '② 단선과 단락',
            desc: '원자가 빠져나간 쪽에는 빈틈(보이드)이 생겨 저항이 커지다가 끊어지고, 원자가 쌓이는 쪽에는 돌기(힐록)가 솟아 이웃 배선과 붙을 수 있다.' },
          { id: 'fix', label: '③ 대책',
            desc: '전류 밀도를 낮추고(배선을 굵게), 배선 윗면과 계면의 원자 이동을 막는 캡 층이나 합금을 쓴다. 온도가 높을수록 수명이 급격히 줄어드는 것도 고려해 설계한다.' },
        ],
        svg(s) {
          const atoms = (x1, x2) => { const o = []; for (let r = 0; r < 3; r++) for (let x = x1; x <= x2; x += 18) o.push(`<circle cx="${x + (r % 2) * 9}" cy="${142 + r * 14}" r="5" fill="#f59e0b" fill-opacity=".85"/>`); return o.join(''); };
          if (s.id === 'wind') return dgS3('전자 이동: ' + s.label, `${dgR(60, 330, 130, 52, 'dg-met', 'style="fill-opacity:.22"')}${atoms(72, 316)}${[90, 170, 250].map(x => `<circle cx="${x}" cy="108" r="5" fill="#60a5fa"/>` + dgArrow(x + 8, 108, x + 40, 108)).join('')}${dgT(316, 106, 'e⁻', 'dg-volt', 'start')}${dgArrow(150, 196, 250, 196)}${dgT(210, 218, '금속 원자도 밀려감', 'dg-sub')}${dgT(210, 256, '전자가 원자를 밀어 이동 (전자 바람)', 'dg-volt')}`);
          if (s.id === 'fail') return dgS3('전자 이동: ' + s.label, `${dgR(60, 330, 130, 52, 'dg-met', 'style="fill-opacity:.22"')}${atoms(140, 316)}${dgR(64, 134, 130, 52, 'dg-void')}<path class="dg-met" d="M300 130 Q312 92 326 130 Z"/>
            ${dgT(100, 120, '보이드', 'dg-off')}${dgT(100, 208, '→ 단선', 'dg-sub')}${dgT(312, 84, '힐록', 'dg-off')}${dgT(312, 208, '→ 단락', 'dg-sub')}${dgArrow(170, 108, 250, 108)}${dgT(210, 100, 'e⁻ 흐름', 'dg-sub')}${dgT(210, 256, '빠져나간 쪽 빈틈, 쌓이는 쪽 돌기', 'dg-volt')}`);
          return dgS3('전자 이동: ' + s.label, `${dgBox(60, 90, 300, 36, '전류 밀도 ↓ (배선을 굵게)', 'dg-hk')}${dgBox(60, 138, 300, 36, '캡 층·배리어로 계면 확산 억제', 'dg-hk')}${dgBox(60, 186, 300, 36, '구리 합금 · 코발트 캡', 'dg-hk')}${dgT(210, 258, '원자가 움직이는 길을 막는다', 'dg-volt')}`);
        }
      },
      'dram-refresh': {
        title: 'DRAM 리프레시',
        states: [
          { id: 'leak', label: '① 전하가 샌다',
            desc: '커패시터에 저장된 전하는 트랜지스터 누설 등으로 조금씩 빠져나간다. 시간이 지나 전압이 센스 앰프가 구별할 수 있는 한계 아래로 내려가면 값을 잃는다.' },
          { id: 'refresh', label: '② 주기적으로 다시 씀',
            desc: '전압이 한계에 닿기 전에 행(row) 단위로 읽어서 같은 값을 다시 써 준다. 이 일을 정해진 주기(tREFI)마다 모든 행에 대해 되풀이한다.' },
          { id: 'cost', label: '③ 비용',
            desc: '리프레시하는 동안은 그 뱅크를 읽고 쓸 수 없고 전력도 쓴다. 용량이 커져 행이 많아질수록 이 부담이 커져서 성능과 전력의 걸림돌이 된다.' },
        ],
        svg(s) {
          const axes = `<path class="dg-line" d="M70 80 V220 H350"/>${dgT(70, 72, '셀 전압', 'dg-sub')}${dgT(350, 238, '시간', 'dg-sub')}<path class="dg-line" stroke-dasharray="5 4" d="M70 170 H350"/>${dgT(350, 188, '센싱 한계', 'dg-off', 'end')}`;
          if (s.id === 'leak') return dgS3('리프레시: ' + s.label, `${axes}<path d="M70 100 Q170 104 250 170 T340 212" fill="none" stroke="#f59e0b" stroke-width="3"/>${dgT(90, 94, 'Vcc', 'dg-sub')}${dgT(210, 262, '시간이 지나면 전압이 한계 아래로', 'dg-volt')}`);
          if (s.id === 'refresh') { let d = 'M70 100'; for (let i = 0; i < 4; i++) { const x0 = 70 + i * 70; d += ` L${x0 + 62} 150 L${x0 + 62} 100`; } return dgS3('리프레시: ' + s.label, `${axes}<path d="${d}" fill="none" stroke="#f59e0b" stroke-width="3"/>${dgT(210, 78, 'tREFI마다 다시 씀', 'dg-volt')}${dgT(210, 262, '한계에 닿기 전에 되살린다', 'dg-on')}`);
          }
          return dgS3('리프레시: ' + s.label, `${dgT(40, 130, '읽기·쓰기', 'dg-sub', 'start')}${[0, 1, 2, 3, 4, 5].map(i => dgR(120 + i * 48, 164 + i * 48, 112, 28, i % 3 === 2 ? 'dg-off' : 'dg-on', 'style="fill-opacity:.35"')).join('')}${dgT(260, 100, '■ 리프레시(접근 불가)', 'dg-off')}${dgT(210, 232, '리프레시 중 지연 · 전력 소모', 'dg-sub')}${dgT(210, 258, '용량이 클수록 행이 늘어 부담 ↑', 'dg-volt')}`);
        }
      },
      'effective-mass': {
        title: '유효 질량',
        states: [
          { id: 'band', label: '① 밴드의 곡률',
            desc: '결정 안에서 전자의 에너지 E와 운동량 k 관계는 밴드 바닥 근처에서 포물선 모양이다. 이 곡선의 휜 정도(곡률)가 전자가 외부 힘에 얼마나 잘 반응하는지를 정하고, 이를 질량처럼 나타낸 값이 유효 질량이다.' },
          { id: 'cmp', label: '② 가벼움과 무거움',
            desc: '곡선이 가파르게 휘면(곡률 큼) 유효 질량이 작아 전자가 같은 힘에 쉽게 가속되고 이동도가 크다. 완만하면 유효 질량이 커서 이동도가 작다.' },
          { id: 'np', label: '③ 전자와 정공',
            desc: '실리콘에서 정공의 유효 질량은 전자보다 대체로 커서 정공 이동도가 낮다. 그래서 같은 전류를 내려면 PMOS를 NMOS보다 넓게 만들어야 한다.' },
        ],
        svg(s) {
          const par = (a, cx = 200, by = 210) => { const p = []; for (let i = -20; i <= 20; i++) { const k = i / 20; p.push(`${(cx + k * 110).toFixed(1)} ${(by - a * k * k).toFixed(1)}`); } return 'M' + p.join(' L'); };
          const ax = `<path class="dg-line" d="M200 60 V220 M80 220 H320"/>${dgT(200, 54, 'E', 'dg-sub')}${dgT(326, 224, 'k', 'dg-sub', 'start')}`;
          if (s.id === 'band') return dgS3('유효 질량: ' + s.label, `${ax}<path d="${par(130)}" fill="none" stroke="#f59e0b" stroke-width="3"/>${dgT(316, 110, '곡률 ↑', 'dg-sub', 'start')}${dgT(316, 126, '→ m* ↓', 'dg-sub', 'start')}${dgT(210, 258, 'E ∝ k² / m*', 'dg-volt')}`);
          if (s.id === 'cmp') return dgS3('유효 질량: ' + s.label, `${ax}<path d="${par(150)}" fill="none" stroke="#60a5fa" stroke-width="3"/><path d="${par(60)}" fill="none" stroke="#f87171" stroke-width="3"/>${dgT(100, 100, '가벼움 (m* 작음)', 'dg-sub')}${dgT(310, 175, '무거움 (m* 큼)', 'dg-sub')}${dgT(210, 258, '가벼울수록 가속이 쉽고 이동도 ↑', 'dg-volt')}`);
          return dgS3('유효 질량: ' + s.label, `${dgT(70, 120, '전자', 'dg-t', 'end')}${dgR(80, 160, 104, 24, 'dg-n')}${dgT(70, 164, '정공', 'dg-t', 'end')}${dgR(80, 230, 148, 24, 'dg-p')}${dgT(250, 120, '', 'dg-sub')}${dgT(316, 120, '더 가벼움', 'dg-sub', 'start')}${dgT(316, 164, '더 무거움', 'dg-sub', 'start')}${dgT(210, 220, '→ 정공 이동도 ↓ → PMOS는 더 넓게', 'dg-volt')}`);
        }
      },
      'repair-redundancy': {
        title: '리페어와 리던던시',
        states: [
          { id: 'spare', label: '① 여분을 미리 만든다',
            desc: '메모리는 셀이 수십억 개라 완벽하게 만들기 어렵다. 그래서 처음부터 여분의 행과 열(리던던시)을 함께 만들어 둔다.' },
          { id: 'test', label: '② 불량 주소를 찾는다',
            desc: '웨이퍼 테스트(EDS)에서 모든 셀을 읽고 써 보아 불량 셀의 주소를 알아낸다.' },
          { id: 'fix', label: '③ 여분으로 바꿔치기',
            desc: '퓨즈(레이저 또는 전기)를 끊어 불량 주소를 여분 행으로 연결한다. 이후 그 주소로 들어오는 접근은 여분 행이 대신 처리한다. 이 작업이 리페어다.' },
        ],
        svg(s) {
          const cell = (r, c, cls) => dgR(60 + c * 30, 60 + c * 30 + 24, 76 + r * 26, 20, cls);
          let g = '';
          for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) g += cell(r, c, 'dg-fsub');
          for (let c = 0; c < 8; c++) g += cell(5, c, 'dg-hk');
          g += dgT(316, 224, '여분 행', 'dg-sub', 'start');
          const bad = `<path class="dg-line" stroke="#ef4444" stroke-width="3" d="M${60 + 3 * 30 + 4} ${76 + 2 * 26 + 3} l16 14 m0 -14 l-16 14"/>`;
          if (s.id === 'spare') return dgS3('리페어: ' + s.label, `${g}${bad}${dgT(210, 60, '메모리 셀 배열', 'dg-sub')}${dgT(210, 258, '불량 셀 하나 + 여분 행', 'dg-volt')}`);
          if (s.id === 'test') return dgS3('리페어: ' + s.label, `${g}${dgR(60, 300, 76 + 2 * 26 - 3, 26, 'dg-heat', 'style="fill-opacity:.18"')}${bad}${dgT(316, 126, '불량 주소', 'dg-off', 'start')}${dgT(210, 60, '모든 셀을 읽고 써 보며 검사', 'dg-sub')}${dgT(210, 258, '불량 셀의 행 주소 확인', 'dg-volt')}`);
          return dgS3('리페어: ' + s.label, `${g.replace(`x="60" y="${76 + 2 * 26}"`, 'x="60" y="999"')}${dgR(60, 300, 76 + 2 * 26, 20, 'dg-off', 'style="fill-opacity:.2"')}${bad}${dgArrow(310, 76 + 2 * 26 + 10, 310, 76 + 5 * 26 + 8, 'dg-line dg-hl')}${dgT(316, 126, '막힌 행', 'dg-sub', 'start')}${dgT(210, 60, '불량 행 → 여분 행으로 연결', 'dg-sub')}${dgT(210, 258, '퓨즈로 주소를 바꿔 치기', 'dg-on')}`);
        }
      },
      'sram-6t': {
        title: 'SRAM 6T 셀',
        states: [
          { id: 'struct', label: '① 구조',
            desc: 'SRAM 셀은 인버터 두 개를 서로 맞물려 놓은 것(트랜지스터 4개)과, 이를 비트라인에 연결하는 접근 트랜지스터 2개로 이루어진 6T 구조다.' },
          { id: 'hold', label: '② 유지',
            desc: '워드라인(WL)이 0이면 접근 트랜지스터가 꺼져 셀이 비트라인과 끊긴다. 맞물린 두 인버터가 서로 값을 붙들어 주므로 전원이 있는 한 값이 유지되고 리프레시가 필요 없다.' },
          { id: 'read', label: '③ 읽기',
            desc: '비트라인을 미리 높게 충전한 뒤 WL을 켠다. 0을 저장한 쪽 비트라인이 살짝 내려가고, 그 차이를 센스 앰프가 읽는다.' },
          { id: 'write', label: '④ 쓰기',
            desc: 'WL을 켠 채 한쪽 비트라인을 0, 반대쪽을 1로 세게 구동해 두 인버터의 상태를 뒤집는다.' },
        ],
        svg(s) {
          const v = { struct: ['Q', 'Q̄', 'WL', '', ''], hold: ['1', '0', 'WL = 0', '', ''], read: ['1', '0', 'WL = 1', 'BL 높게', 'BL̄ 살짝 ↓'], write: ['0→1', '1→0', 'WL = 1', 'BL = 1', 'BL̄ = 0'] }[s.id];
          const on = s.id === 'read' || s.id === 'write';
          const inv = (x, dir) => `<path class="dg-line" fill="none" stroke-width="2" d="${dir > 0 ? `M${x} 112 V168 L${x + 50} 140 Z` : `M${x + 50} 112 V168 L${x} 140 Z`}"/>`;
          return dgS3('SRAM: ' + s.label, `<path class="dg-line" d="M70 70 V250 M350 70 V250"/>${dgT(70, 62, 'BL', 'dg-sub')}${dgT(350, 62, 'BL̄', 'dg-sub')}
            ${inv(150, -1)}${inv(220, 1)}<path class="dg-line" fill="none" d="M142 140 H130 M270 140 H290 M130 140 V84 H210 V128 H220 M290 140 V186 H210 V152 H200"/>
            ${dgR(112, 148, 198, 22, on ? 'dg-on' : 'dg-off', 'style="fill-opacity:.3"')}${dgR(272, 308, 198, 22, on ? 'dg-on' : 'dg-off', 'style="fill-opacity:.3"')}
            <path class="dg-line" d="M130 140 V198 M290 186 V198 M112 210 H70 M308 210 H350"/><path class="dg-line" stroke-dasharray="4 3" d="M60 246 H360 M130 220 V246 M290 220 V246"/>
            ${dgT(130, 128, v[0], 'dg-volt')}${dgT(290, 128, v[1], 'dg-volt')}${dgT(210, 258, v[2], 'dg-sub')}${dgT(130, 214, 'M5', 'dg-sub')}${dgT(290, 214, 'M6', 'dg-sub')}
            ${v[3] ? dgT(70, 100, v[3], 'dg-sub', 'start') : ''}${v[4] ? dgT(350, 100, v[4], 'dg-sub', 'end') : ''}${dgT(210, 74, '인버터 2개', 'dg-sub')}`);
        }
      },
      'burn-in': {
        title: '번인 테스트',
        states: [
          { id: 'tub', label: '① 욕조 곡선',
            desc: '제품의 고장률은 시간에 따라 욕조 모양이다. 처음에는 제조 결함 때문에 일찍 고장 나는 초기 불량이 많고, 그 뒤에는 낮고 일정하다가, 오래 쓰면 마모로 다시 늘어난다.' },
          { id: 'stress', label: '② 초기 구간을 앞당긴다',
            desc: '번인은 고온과 높은 전압 같은 스트레스를 걸어 초기 불량 구간을 짧은 시간에 미리 지나게 한다. 이때 고장 나는 칩을 걸러내면 출하된 제품은 안정 구간에서 시작한다.' },
          { id: 'trade', label: '③ 시간과 비용',
            desc: '번인을 길게 할수록 초기 불량을 더 걸러내지만 시간·장비·전력 비용이 늘고, 정상 칩의 수명도 조금 소모된다. 그래서 적당한 조건을 찾는다.' },
        ],
        svg(s) {
          if (s.id === 'trade') return dgS3('번인: ' + s.label, `${dgT(130, 100, '짧게', 'dg-t')}${dgR(80, 120, 150, 40, 'dg-on', 'style="fill-opacity:.35"')}${dgR(130, 170, 170, 20, 'dg-off', 'style="fill-opacity:.35"')}${dgT(290, 100, '길게', 'dg-t')}${dgR(240, 280, 110, 80, 'dg-on', 'style="fill-opacity:.35"')}${dgR(290, 330, 130, 60, 'dg-off', 'style="fill-opacity:.35"')}
            ${dgT(130, 212, '불량 일부 통과', 'dg-sub')}${dgT(130, 228, '비용 ↓', 'dg-sub')}${dgT(290, 212, '불량 더 걸러냄', 'dg-sub')}${dgT(290, 228, '비용·수명 소모 ↑', 'dg-sub')}${dgT(150, 258, '■ 걸러낸 불량', 'dg-on')}${dgT(270, 258, '■ 비용', 'dg-off')}`);
          return dgS3('번인: ' + s.label, `<path class="dg-line" d="M70 80 V220 H350"/>${dgT(70, 72, '고장률', 'dg-sub')}${dgT(350, 238, '시간', 'dg-sub')}
            ${s.id === 'stress' ? dgR(70, 150, 100, 120, 'dg-heat', 'style="fill-opacity:.2"') : ''}
            <path d="M70 100 Q108 205 150 205 L260 205 Q305 205 345 100" fill="none" stroke="#f59e0b" stroke-width="3"/><path class="dg-line" stroke-dasharray="4 3" d="M150 90 V220 M260 90 V220"/>
            ${dgT(110, 88, '초기 불량', 'dg-sub')}${dgT(205, 88, '정상 사용', 'dg-sub')}${dgT(305, 88, '마모', 'dg-sub')}
            ${s.id === 'stress' ? dgT(210, 262, '고온·고전압으로 초기 구간을 미리 통과', 'dg-volt') : dgT(210, 262, '시간에 따른 고장률', 'dg-volt')}`);
        }
      },
      'nand-string': {
        title: 'NAND 플래시',
        states: [
          { id: 'string', label: '① 스트링',
            desc: 'NAND는 셀 여러 개를 직렬로 이어 한 줄(스트링)로 만든다. 양 끝의 선택 트랜지스터(SSL, GSL)가 비트라인과 소스 라인에 연결하고, 셀 사이에는 접점이 없어서 작은 면적에 많이 담을 수 있다.' },
          { id: 'prog', label: '② 프로그램',
            desc: '제어 게이트에 높은 전압을 주면 채널의 전자가 터널 산화막을 뚫고 플로팅 게이트(또는 전하 트랩층)로 들어가 갇힌다. 전자가 쌓이면 문턱 전압이 올라간다.' },
          { id: 'erase', label: '③ 지우기',
            desc: '기판에 높은 전압을 걸어 갇힌 전자를 빼낸다. 지우기는 셀 하나가 아니라 블록 단위로 한꺼번에 한다.' },
          { id: 'read', label: '④ 읽기',
            desc: '전자가 있으면 문턱 전압이 높고 없으면 낮다. 선택한 셀에는 두 상태 사이의 기준 전압을 주고, 같은 스트링의 나머지 셀에는 높은 전압을 주어 켠 뒤 전류가 흐르는지로 0과 1을 구분한다.' },
        ],
        svg(s) {
          if (s.id === 'string') return dgS3('NAND: ' + s.label, `<path class="dg-line" d="M40 160 H380"/>${dgR(54, 82, 140, 40, 'dg-hk')}${[0, 1, 2, 3, 4, 5].map(i => dgR(96 + i * 38, 126 + i * 38, 140, 40, 'dg-fsub') + dgT(111 + i * 38, 134, '', 'dg-sub')).join('')}${dgR(326, 354, 140, 40, 'dg-hk')}
            ${dgT(68, 132, 'SSL', 'dg-sub')}${dgT(340, 132, 'GSL', 'dg-sub')}${dgT(205, 132, '셀 (직렬)', 'dg-sub')}${dgT(40, 200, '비트라인', 'dg-sub', 'start')}${dgT(380, 200, '소스 라인', 'dg-sub', 'end')}${dgT(210, 258, '셀을 직렬로 이어 면적 절약', 'dg-volt')}`);
          if (s.id === 'read') { const hump = (cx) => `M${cx - 55} 200 Q${cx} 90 ${cx + 55} 200`; return dgS3('NAND: ' + s.label, `<path class="dg-line" d="M60 200 H360"/><path d="${hump(140)}" fill="#60a5fa" fill-opacity=".3" stroke="#60a5fa" stroke-width="2"/><path d="${hump(280)}" fill="#f87171" fill-opacity=".3" stroke="#f87171" stroke-width="2"/><path class="dg-line" stroke-dasharray="5 4" d="M210 90 V204"/>
            ${dgT(140, 222, '지운 셀 (1)', 'dg-sub')}${dgT(280, 222, '프로그램 셀 (0)', 'dg-sub')}${dgT(210, 82, '읽기 전압', 'dg-volt')}${dgT(360, 216, 'Vth', 'dg-sub')}${dgT(210, 258, '문턱 전압 분포 사이에서 구분', 'dg-volt')}`); }
          const el = (pos) => [150, 180, 210].map(x => `<circle cx="${x}" cy="${pos ? 115 : 154}" r="4" fill="#60a5fa"/>`).join('');
          return dgS3('NAND: ' + s.label, `${dgR(110, 250, 76, 20, 'dg-met')}${dgR(110, 250, 96, 6, 'dg-ox')}${dgR(110, 250, 102, 22, 'dg-hk')}${dgR(110, 250, 124, 6, 'dg-ox')}${dgR(60, 300, 130, 56, 'dg-si')}
            ${dgT(316, 90, '제어 게이트', 'dg-sub', 'start')}${dgT(316, 118, '플로팅 게이트', 'dg-sub', 'start')}${dgT(316, 140, '터널 산화막', 'dg-sub', 'start')}${dgT(316, 168, '채널', 'dg-sub', 'start')}
            ${s.id === 'prog' ? `${el(true)}${dgArrow(180, 148, 180, 124, 'dg-line dg-hl')}${dgT(180, 66, '제어 게이트 + 고전압', 'dg-volt')}${dgT(210, 232, '전자가 갇힘 → 문턱 전압 ↑ (프로그램)', 'dg-sub')}` : `${el(false)}${dgArrow(180, 160, 180, 204, 'dg-line dg-hl')}${dgT(180, 66, '기판에 고전압', 'dg-volt')}${dgT(210, 232, '전자가 빠짐 → 문턱 전압 ↓ (지우기, 블록 단위)', 'dg-sub')}`}`);
        }
      },
      'rc-delay': {
        title: 'RC 지연',
        states: [
          { id: 'rc', label: '① R과 C',
            desc: '배선에는 저항(R)이 있고, 이웃한 배선 사이에는 전기를 모으는 정전용량(C)이 생긴다. 신호는 이 R이 C를 충전하는 시간만큼 늦어져서 지연이 대략 R × C에 비례한다.' },
          { id: 'scale', label: '② 미세화의 영향',
            desc: '미세화로 트랜지스터 자체는 점점 빨라지지만, 배선은 가늘어져 R이 커지고 서로 가까워져 C도 커진다. 그래서 첨단 공정에서는 배선 지연이 전체 속도를 좌우한다.' },
          { id: 'fix', label: '③ 줄이는 방법',
            desc: 'R을 줄이려고 구리나 코발트 같은 낮은 저항 금속과 얇은 배리어를 쓰고, C를 줄이려고 Low-k 절연막이나 에어갭을 쓴다. 긴 배선에는 중간에 리피터(증폭기)를 넣거나 굵은 상층 배선을 쓴다.' },
        ],
        svg(s) {
          if (s.id === 'rc') return dgS3('RC 지연: ' + s.label, `${dgR(40, 320, 200, 20, 'dg-ox')}${[110, 190, 270].map(x => dgR(x, x + 36, 130, 70, 'dg-cu')).join('')}${dgT(148, 230, '', 'dg-sub')}
            ${dgT(128, 118, 'R', 'dg-volt')}${dgT(165, 164, 'C', 'dg-volt')}${dgT(245, 164, 'C', 'dg-volt')}${dgArrow(128, 132, 128, 200, 'dg-line')}${dgT(316, 168, '배선(R)', 'dg-sub', 'start')}${dgT(210, 256, '지연 ≈ R × C', 'dg-volt')}`);
          if (s.id === 'scale') return dgS3('RC 지연: ' + s.label, `<path class="dg-line" d="M60 80 V220 H350"/>${[0, 1, 2].map(i => dgR(90 + i * 90, 120 + i * 90, 220 - [70, 50, 34][i], [70, 50, 34][i], 'dg-n') + dgR(124 + i * 90, 154 + i * 90, 220 - [20, 46, 82][i], [20, 46, 82][i], 'dg-hl', 'style="fill:#f59e0b;fill-opacity:.7"')).join('')}
            ${dgT(110, 236, '구세대', 'dg-sub')}${dgT(200, 236, '중간', 'dg-sub')}${dgT(290, 236, '최신', 'dg-sub')}${[['#60a5fa', '게이트 지연', 100], ['#f59e0b', '배선 지연', 118]].map(l => `<rect x="300" y="${l[2] - 10}" width="11" height="11" style="fill:${l[0]};fill-opacity:.7"/>` + dgT(316, l[2], l[1], 'dg-sub', 'start')).join('')}${dgT(210, 262, '배선 지연이 점점 커짐 (개념도)', 'dg-volt')}`);
          return dgS3('RC 지연: ' + s.label, `${dgBox(60, 92, 300, 32, 'R ↓  구리·코발트, 얇은 배리어', 'dg-hk')}${dgBox(60, 136, 300, 32, 'C ↓  Low-k 절연막, 에어갭', 'dg-hk')}${dgBox(60, 180, 300, 32, '구조  리피터 삽입, 굵은 상층 배선', 'dg-hk')}${dgT(210, 258, '저항과 정전용량을 함께 줄인다', 'dg-volt')}`);
        }
      },
      'epitaxy': {
        title: '에피택시 성장',
        states: [
          { id: 'grow', label: '① 결정을 이어서 키움',
            desc: '에피택시는 기판 결정 위에 같은 배열로 원자를 쌓아 새 결정층을 키우는 방법이다. 기판의 결정 방향을 그대로 따르므로 결함이 적은 단결정층이 된다.' },
          { id: 'dope', label: '② 농도를 따로 조절',
            desc: '기판과 별개로 에피층의 도핑 농도와 두께를 정할 수 있다. 예를 들어 농도가 짙은 기판 위에 옅은 에피층을 얹으면 소자 특성과 기판 저항을 따로 맞출 수 있다.' },
          { id: 'hetero', label: '③ 다른 재료로 키우기',
            desc: '실리콘 위에 격자 간격이 더 큰 SiGe를 키우면 같은 간격으로 억지로 맞춰지며 눌려 변형(스트레인)이 생긴다. 이 변형이 캐리어 이동도를 높이는 데 쓰인다.' },
        ],
        svg(s) {
          const lat = (y, n, r, fill, dx = 24) => Array.from({ length: n }, (_, i) => `<circle cx="${70 + i * dx}" cy="${y}" r="${r}" fill="${fill}"/>`).join('');
          const sub = [0, 1, 2, 3].map(i => lat(190 + i * 18, 11, 6, '#94a3b8')).join('');
          if (s.id === 'grow') return dgS3('에피택시: ' + s.label, `${sub}${[0, 1].map(i => lat(154 - i * 18, 11, 6, '#f59e0b')).join('')}${dgT(316, 160, '에피층', 'dg-sub', 'start')}${dgT(316, 210, '기판', 'dg-sub', 'start')}${[100, 180, 260].map(x => dgArrow(x, 82, x, 112)).join('')}${dgT(210, 74, '원료 가스', 'dg-sub')}${dgT(210, 274, '기판의 배열을 그대로 따라 쌓임', 'dg-volt')}`);
          if (s.id === 'dope') return dgS3('에피택시: ' + s.label, `${dgR(60, 300, 140, 36, 'dg-p', 'style="fill-opacity:.35"')}${dgR(60, 300, 176, 70, 'dg-p')}${dgT(316, 162, '에피층 (옅은 도핑)', 'dg-sub', 'start')}${dgT(316, 214, '기판 (짙은 도핑)', 'dg-sub', 'start')}${dgT(180, 124, '소자는 이 층에 만듦', 'dg-volt')}${dgT(210, 262, '농도·두께를 기판과 별개로 결정', 'dg-sub')}`);
          return dgS3('에피택시: ' + s.label, `${sub}${[0, 1].map(i => lat(154 - i * 16, 11, 8, '#f87171')).join('')}${dgT(316, 140, 'SiGe (격자 큼)', 'dg-sub', 'start')}${dgT(316, 210, 'Si 기판', 'dg-sub', 'start')}${dgArrow(100, 150, 100, 124, 'dg-line dg-hl')}${dgT(210, 274, '눌려서 변형 → 이동도 ↑', 'dg-volt')}`);
        }
      },
      'euv-optics': {
        title: 'EUV 광학계',
        states: [
          { id: 'mirror', label: '① 렌즈 대신 거울',
            desc: 'EUV(13.5 nm)는 유리를 포함한 거의 모든 물질이 흡수해서 렌즈를 쓸 수 없다. 대신 몰리브덴(Mo)과 실리콘(Si)을 수십 겹 번갈아 쌓은 다층막 거울로 빛을 반사한다. 공기도 EUV를 흡수하기 때문에 장비 안은 진공이다.' },
          { id: 'source', label: '② 광원',
            desc: '떨어지는 주석(Sn) 방울에 강한 CO₂ 레이저를 쏴서 뜨거운 플라즈마를 만들고, 여기서 나오는 13.5 nm 빛을 집광 거울로 모은다.' },
          { id: 'path', label: '③ 빛이 가는 길',
            desc: '광원에서 나온 빛은 조명 거울, 반사형 마스크, 투영 거울을 거쳐 웨이퍼에 닿는다. 거울 한 장은 빛의 약 70% 안팎만 반사해서 거울이 많을수록 빛이 크게 줄어들기 때문에 강한 광원이 필요하다.' },
        ],
        svg(s) {
          if (s.id === 'mirror') return dgS3('EUV: ' + s.label, `${Array.from({ length: 14 }, (_, i) => dgR(130, 290, 160 + i * 5, 5, i % 2 ? 'dg-si' : 'dg-met')).join('')}${dgArrow(100, 80, 190, 156)}${dgArrow(190, 156, 280, 80)}${dgT(316, 190, 'Mo/Si 다층막', 'dg-sub', 'start')}${dgT(70, 74, '13.5 nm', 'dg-volt')}${dgT(210, 258, '렌즈는 불가 → 반사 거울, 장비 안은 진공', 'dg-sub')}`);
          if (s.id === 'source') return dgS3('EUV: ' + s.label, `<path class="dg-line" fill="none" stroke-width="2" d="M100 240 Q210 90 320 240"/>${[80, 110, 140].map(y => `<circle cx="210" cy="${y}" r="5" fill="#9ca3af"/>`).join('')}<circle cx="210" cy="176" r="12" fill="#f59e0b"/><path class="dg-line" stroke="#fbbf24" stroke-width="2" d="M184 176 H198 M222 176 H236 M210 150 V162 M210 190 V202 M192 158 l8 8 M228 194 l-8 -8 M228 158 l-8 8 M192 194 l8 -8"/>
            ${dgArrow(50, 176, 190, 176)}${dgT(50, 166, 'CO₂ 레이저', 'dg-sub', 'start')}${dgT(250, 94, '주석 방울', 'dg-sub', 'start')}${dgT(250, 150, '플라즈마', 'dg-sub', 'start')}${dgT(210, 262, '집광 거울이 13.5 nm 빛을 모음', 'dg-volt')}`);
          return dgS3('EUV: ' + s.label, `${dgChain(['광원', '조명계', '마스크', '투영 거울', '웨이퍼'], 110, 70, 16, 4, 'dg-hk')}<path class="dg-line" stroke-dasharray="6 4" fill="none" d="M0 96 H416 V164 H0 Z"/>${dgT(210, 88, '장비 전체가 진공', 'dg-sub')}${dgT(210, 188, '(마스크는 반사형)', 'dg-sub')}${dgT(210, 258, '거울 1장당 약 70% 안팎만 반사', 'dg-volt')}`);
        }
      },
      'yield-map': {
        title: '수율',
        states: [
          { id: 'map', label: '① 칩 단위 합격·불량',
            desc: '웨이퍼에는 같은 칩이 격자로 수백~수천 개 만들어진다. 결함이 칩 안에 하나라도 있으면 그 칩은 불량이고, 수율은 전체 칩 중 합격한 칩의 비율이다.' },
          { id: 'size', label: '② 칩 크기',
            desc: '결함이 같은 수로 흩어져 있어도 칩이 작을수록 결함을 피한 칩이 많다. 같은 웨이퍼에서 큰 칩보다 작은 칩의 수율이 높은 이유다.' },
          { id: 'eq', label: '③ 수율 식',
            desc: '결함이 무작위로 퍼져 있다고 보면 수율은 Y = e^(−D·A)로 근사된다. D는 단위 면적당 결함 수, A는 칩 면적이다. 면적이나 결함 밀도가 커질수록 수율이 급격히 떨어진다.' },
        ],
        svg(s) {
          const wafer = (cx, cy, R, d, seed, nDef) => {
            const rnd = g4rnd(seed), def = [];
            for (let i = 0; i < nDef; i++) { const a = rnd() * 6.283, r = Math.sqrt(rnd()) * R; def.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
            let out = `<circle cx="${cx}" cy="${cy}" r="${R}" class="dg-fsub"/>`, tot = 0, ok = 0;
            for (let y = cy - R; y + d <= cy + R; y += d) for (let x = cx - R; x + d <= cx + R; x += d) {
              const cs = [[x, y], [x + d, y], [x, y + d], [x + d, y + d]];
              if (!cs.every(c => Math.hypot(c[0] - cx, c[1] - cy) <= R)) continue;
              const bad = def.some(p => p[0] >= x && p[0] < x + d && p[1] >= y && p[1] < y + d);
              tot++; if (!bad) ok++;
              out += `<rect x="${(x + 1).toFixed(1)}" y="${(y + 1).toFixed(1)}" width="${d - 2}" height="${d - 2}" style="fill:${bad ? '#ef4444' : '#34d399'};fill-opacity:.55"/>`;
            }
            out += def.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2" fill="#111827"/>`).join('');
            return { svg: out, tot, ok };
          };
          if (s.id === 'map') { const w = wafer(150, 150, 95, 19, 7, 14); return dgS3('수율: ' + s.label, `${w.svg}${dgT(316, 120, '■ 합격', 'dg-on', 'start')}${dgT(316, 140, '■ 불량', 'dg-off', 'start')}${dgT(316, 180, `${w.ok} / ${w.tot}`, 'dg-sub', 'start')}${dgT(316, 198, '수율 ' + Math.round(100 * w.ok / w.tot) + '%', 'dg-volt', 'start')}`); }
          if (s.id === 'size') { const a = wafer(100, 140, 70, 35, 11, 12), b = wafer(320, 140, 70, 14, 11, 12); return dgS3('수율: ' + s.label, `${a.svg}${b.svg}${dgT(100, 240, '큰 칩: 수율 ' + Math.round(100 * a.ok / a.tot) + '%', 'dg-sub')}${dgT(320, 240, '작은 칩: 수율 ' + Math.round(100 * b.ok / b.tot) + '%', 'dg-sub')}${dgT(210, 266, '결함 수는 같다', 'dg-volt')}`, '-10 40 440 245'); }
          const cv = (D) => { const p = []; for (let i = 0; i <= 40; i++) { const A = i / 40 * 3; p.push(`${(70 + 280 * i / 40).toFixed(1)} ${(220 - 130 * Math.exp(-D * A)).toFixed(1)}`); } return 'M' + p.join(' L'); };
          return dgS3('수율: ' + s.label, `<path class="dg-line" d="M70 80 V220 H350"/>${dgT(70, 72, '수율', 'dg-sub')}${dgT(350, 238, '칩 면적', 'dg-sub')}<path d="${cv(0.35)}" fill="none" stroke="#34d399" stroke-width="3"/><path d="${cv(1.1)}" fill="none" stroke="#ef4444" stroke-width="3"/>${dgT(300, 128, '결함 적음', 'dg-on')}${dgT(190, 166, '결함 많음', 'dg-off')}${dgT(210, 262, 'Y = e^(−D·A)', 'dg-volt')}`);
        }
      },
      'eds-flow': {
        title: 'EDS 테스트 흐름',
        states: [
          { id: 'flow', label: '① 전체 흐름',
            desc: 'EDS는 웨이퍼를 자르기 전에 칩 하나하나를 전기적으로 검사하는 공정이다. 프로브 카드로 칩에 신호를 주고 테스터가 결과를 판정해서 합격·불량으로 나눈다.' },
          { id: 'probe', label: '② 프로브 카드',
            desc: '프로브 카드의 가는 바늘이 칩 패드에 닿아 전원과 신호를 넣고 응답을 읽는다. 웨이퍼를 한 칩씩 옮겨 가며 검사한다.' },
          { id: 'bin', label: '③ 분류 지도',
            desc: '결과는 웨이퍼 위치별 지도(웨이퍼 맵)로 남는다. 합격, 리페어로 살릴 수 있는 칩, 불량으로 나누고 리페어 후 다시 검사한다. 이 지도로 불량 패턴을 보고 공정 문제를 찾는다.' },
        ],
        svg(s) {
          if (s.id === 'flow') return dgS3('EDS: ' + s.label, `${dgChain(['웨이퍼', '프로브 카드', '테스터', '합격 판정'], 90)}${dgChain(['불량 표시', '리페어', '재검사'], 160, 96, 28, 62, 'dg-hk')}${dgArrow(250, 124, 250, 156)}${dgT(210, 258, '다이싱 전에 칩마다 전기 검사', 'dg-volt')}`);
          if (s.id === 'probe') return dgS3('EDS: ' + s.label, `${dgR(100, 320, 84, 20, 'dg-hk')}${[130, 170, 210, 250, 290].map(x => `<path class="dg-line" d="M${x} 104 L${x} 140 L${x - 4 + (x > 210 ? 4 : 0)} 166" stroke-width="1.6"/>`).join('')}${dgR(70, 340, 170, 30, 'dg-si')}${[130, 170, 210, 250, 290].map(x => dgR(x - 7, x + 7, 164, 6, 'dg-met')).join('')}
            ${dgT(100, 76, '프로브 카드', 'dg-sub', 'start')}${dgT(316, 138, '바늘', 'dg-sub', 'start')}${dgT(316, 210, '웨이퍼(칩 패드)', 'dg-sub', 'start')}${dgT(210, 258, '바늘이 패드에 닿아 신호를 주고받음', 'dg-volt')}`);
          const R = 90, cx = 150, cy = 150, d = 20, rnd = g4rnd(23); let g = `<circle cx="${cx}" cy="${cy}" r="${R}" class="dg-fsub"/>`;
          for (let y = cy - R; y + d <= cy + R; y += d) for (let x = cx - R; x + d <= cx + R; x += d) {
            if (![[x, y], [x + d, y], [x, y + d], [x + d, y + d]].every(c => Math.hypot(c[0] - cx, c[1] - cy) <= R)) continue;
            const r = rnd(), edge = Math.hypot(x + d / 2 - cx, y + d / 2 - cy) > R * 0.72; const c = r < (edge ? 0.28 : 0.06) ? '#ef4444' : r < (edge ? 0.4 : 0.2) ? '#f59e0b' : '#34d399';
            g += `<rect x="${x + 1}" y="${y + 1}" width="${d - 2}" height="${d - 2}" style="fill:${c};fill-opacity:.6"/>`;
          }
          return dgS3('EDS: ' + s.label, `${g}${[['#34d399', '합격', 116], ['#f59e0b', '리페어 대상', 136], ['#ef4444', '불량', 156]].map(l => `<rect x="316" y="${l[2] - 10}" width="11" height="11" style="fill:${l[0]};fill-opacity:.7"/>` + dgT(333, l[2], l[1], 'dg-sub', 'start')).join('')}${dgT(316, 192, '가장자리 불량 ↑', 'dg-sub', 'start')}${dgT(210, 266, '웨이퍼 맵으로 불량 패턴 분석', 'dg-volt')}`);
        }
      }
    });
    // ===== 장비 구조도 2세대(PECVD·CMP·이온 주입): 카드형 블록 + 번호(작동 순서) + 계통 강조 =====
    // 부품을 카드로 놓고 화살표로 흐름을 잇는다. 계통을 누르면 그 계통만 밝아지고 흐름선이 움직인다. 숫자는 글 [작동 순서] 표의 단계와 같다.
    const EQC = { sky: '#38bdf8', vio: '#a78bfa', amb: '#f59e0b', grn: '#34d399', ros: '#fb7185', tea: '#2dd4bf' };
    function dgEq(cfg, s) {
      const f = s.focus || null, on = (g) => !f || [].concat(g).some(x => f.includes(x));
      const tx = (x, y, t, st, a = 'start', c = 'dg-lb') => `<text class="dg-t ${c}" x="${x}" y="${y}" text-anchor="${a}" style="${st || ''}">${escH(t)}</text>`;
      let o = '';
      (cfg.zones || []).forEach(z => {
        o += `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="16" fill="currentColor" fill-opacity=".035" stroke="currentColor" stroke-opacity=".16" stroke-dasharray="2 5"/>`
          + tx(z.a === 'end' ? z.x + z.w - 14 : z.a === 'start' ? z.x + 14 : z.x + z.w / 2, z.y + 14, z.t, 'letter-spacing:.08em;opacity:.55;font-size:9.5px;font-weight:700', z.a || 'middle', 'dg-lb dg-xs');
      });
      (cfg.links || []).forEach(l => {
        const act = on(l.g), hot = f && act, c = EQC[l.c || 'vio'], p = l.p, n = p.length, [x2, y2] = p[n - 1], [x1, y1] = p[n - 2];
        const an = Math.atan2(y2 - y1, x2 - x1), h = 7.5, q = (t) => `${(x2 - h * Math.cos(an + t)).toFixed(1)},${(y2 - h * Math.sin(an + t)).toFixed(1)}`;
        const d = 'M' + p.map(v => v.join(' ')).join(' L'), col = hot ? c : 'currentColor', op = hot ? 1 : f ? .12 : .5;
        o += `<path class="${hot ? 'dg-flow' : ''}" d="${d}" fill="none" style="stroke:${col};stroke-width:${hot ? 2.6 : 1.5}" stroke-linecap="round" stroke-linejoin="round" ${l.dash && !hot ? 'stroke-dasharray="4 4"' : ''} opacity="${op}"/><polygon points="${x2},${y2} ${q(.5)} ${q(-.5)}" fill="${col}" opacity="${op}"/>`;
        if (l.t) o += tx(l.t[0], l.t[1], l.t[2], `opacity:${f && !act ? .15 : .7};font-size:9.5px`, 'start', 'dg-lb dg-xs');
      });
      Object.values(cfg.nodes).forEach(n => {
        const a = on(n.g), hot = f && a, c = EQC[n.c], cy = n.y + n.h / 2, cp = n.w < 150;
        o += `<g opacity="${a ? 1 : .26}"><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="11" fill="${c}" fill-opacity="${hot ? .2 : n.hero ? .16 : .09}" stroke="${c}" stroke-opacity="${hot ? 1 : .5}" stroke-width="${hot ? 2.2 : 1.2}"/>${n.deco ? n.deco(n) : ''}`;
        const bx = cp ? n.x + n.w - 15 : n.x + 18, by = cp ? n.y + 15 : cy;
        if (n.n) o += `<circle cx="${bx}" cy="${by}" r="9" fill="${c}"/>` + tx(bx, by + 3.6, n.n, 'fill:#0b1220;font-size:10.5px;font-weight:800', 'middle', 'dg-lb');
        const x0 = cp ? n.x + 11 : n.x + 36;
        o += tx(x0, cp ? n.y + 20 : cy - 3, n.t, 'font-size:12.5px;font-weight:700') + tx(x0, cp ? n.y + 35 : cy + 12, n.s, '', 'start', 'dg-lb dg-xs');
        if (n.k) { const w = n.k.length * 10.2 + 16, px = n.x + n.w - w - 10; o += `<rect x="${px}" y="${n.y + 8}" width="${w}" height="17" rx="8.5" fill="none" stroke="${c}" stroke-opacity=".9"/>` + tx(px + w / 2, n.y + 20, n.k, `fill:${c};font-size:10px;font-weight:700`, 'middle', 'dg-lb dg-xs'); }
        o += '</g>';
      });
      return dgSvg(cfg.label + ': ' + s.label, o + tx(200, cfg.vb[1] - 10, cfg.note, 'opacity:.6;font-size:10px', 'middle', 'dg-lb dg-xs'), `0 0 400 ${cfg.vb[1]}`);
    }
    const eqDots = (pts, c) => (n) => pts.map(([dx, dy, k]) => `<circle cx="${n.x + dx}" cy="${n.y + dy}" r="${k ? 2.6 : 3.6}" ${k ? `fill="${EQC[c]}"` : `fill="none" stroke="${EQC[c]}" stroke-width="1.8"`} opacity=".85"/>`).join('');
    // ===== PVD(스퍼터링) 장비 사용 가이드 전용 그림: 챔버 단면·원리·칩 단면·클러스터·마그네트론·구멍 안 증착·공정 변수·균일도·불량 단면 =====
    // ===== PVD(스퍼터링) 가이드용 그림 모음 (harness 와 index.html 양쪽에서 같은 코드를 쓴다) =====
    const pvdOn = (f, g) => !f || [].concat(g).some(x => f.includes(x));
    const pvdG = (f, g, inner, extra = '') => `<g opacity="${pvdOn(f, g) ? 1 : .18}" ${extra}>${inner}</g>`;
    const pvdDefs = (p) => `<defs>
      <linearGradient id="${p}Mt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#94a3b8" stop-opacity=".55"/><stop offset=".45" stop-color="#e2e8f0" stop-opacity=".5"/><stop offset="1" stop-color="#94a3b8" stop-opacity=".55"/></linearGradient>
      <linearGradient id="${p}Cu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbbf24" stop-opacity=".85"/><stop offset="1" stop-color="#d97706" stop-opacity=".85"/></linearGradient>
      <linearGradient id="${p}Si" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#94a3b8" stop-opacity=".75"/><stop offset="1" stop-color="#64748b" stop-opacity=".75"/></linearGradient>
      <radialGradient id="${p}Pl" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#c4b5fd" stop-opacity=".75"/><stop offset=".55" stop-color="#a78bfa" stop-opacity=".3"/><stop offset="1" stop-color="#a78bfa" stop-opacity="0"/></radialGradient>
      <radialGradient id="${p}Pl2" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e9d5ff" stop-opacity=".95"/><stop offset="1" stop-color="#a78bfa" stop-opacity="0"/></radialGradient>
    </defs>`;
    const pvdR = (x, y, w, h, fill, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.rx || 0}" style="fill:${fill};stroke:currentColor;stroke-width:${o.sw || 1.2};stroke-opacity:${o.so || .7}${o.dash ? ';stroke-dasharray:' + o.dash : ''}"/>`;
    const pvdL = (d, o = {}) => `<path d="${d}" style="fill:${o.fill || 'none'};stroke:${o.c || 'currentColor'};stroke-width:${o.sw || 1.2};stroke-opacity:${o.so || .7};stroke-linecap:round;stroke-linejoin:round${o.dash ? ';stroke-dasharray:' + o.dash : ''}"/>`;
    const pvdTx = (x, y, t, o = {}) => `<text class="dg-t dg-lb ${o.xs === 0 ? '' : 'dg-xs'}" x="${x}" y="${y}" text-anchor="${o.a || 'start'}" style="${o.st || ''}">${escH(t)}</text>`;
    const pvdNum = (x, y, n, c) => `<circle cx="${x}" cy="${y}" r="8.5" fill="${c}"/>` + `<text class="dg-t dg-lb" x="${x}" y="${y + 3.7}" text-anchor="middle" style="fill:#0b1220;font-size:10.5px;font-weight:800">${n}</text>`;
    const pvdCall = (f, g, n, c, mx, my, tx, ty, lines, px, py, a = 'start') => pvdG(f, g,
      pvdL(`M${mx} ${my} L${px} ${py}`, { so: .45, sw: 1 }) + `<circle cx="${px}" cy="${py}" r="2" fill="currentColor" opacity=".7"/>` + pvdNum(mx, my, n, c)
      + lines.map((t, i) => pvdTx(tx, ty + i * 12, t, { a, st: 'font-size:10.5px;font-weight:600;opacity:.95' })).join(''));

    Object.assign(DIAGRAMS, {
      // ---------- 1. 챔버 단면 (핵심 구조도) ----------
      'pvd-chamber': {
        title: 'PVD(스퍼터링) 챔버 단면',
        wide: true,
        states: [
          { id: 'all', label: '전체 단면', desc: '위쪽에 타깃과 마그네트론, 아래쪽에 웨이퍼를 올리는 척이 마주 보는 구조다. 챔버 안은 깊은 진공이고, 타깃에 음전압을 걸면 아르곤 가스가 플라즈마가 되어 타깃을 때린다. 튕겨 나온 금속 원자가 아래로 날아가 웨이퍼 위에 쌓인다. 번호는 아래 본문의 부품 설명과 같다.' },
          { id: 'cat', label: '타깃·마그네트론', focus: ['mag', 'tg', 'dc', 'sh'], desc: '타깃(재료 원판)은 구리 같은 백킹 플레이트에 붙어 있고, 뒷면은 냉각수가 식힌다. 그 위에서 자석 묶음(마그네트론)이 돌며 타깃 앞에 자기장 터널을 만든다. 자기장이 전자를 타깃 가까이 가두어 플라즈마가 고리 모양으로 진해지고, 그 자리가 깎여 침식 홈이 생긴다. DC 전원은 타깃에 −수백 V를 걸고, 쉴드는 타깃 가장자리와 챔버 벽을 전기적으로 갈라 놓는다.' },
          { id: 'plasma', label: '플라즈마·가스', focus: ['pl', 'gas', 'tg'], desc: '질량 유량 조절기(MFC)가 아르곤을 정해진 양만큼 흘려 넣고, 펌프와의 균형으로 압력이 몇 mTorr로 잡힌다. 타깃의 음전압이 아르곤을 이온(Ar⁺)과 전자로 쪼개 플라즈마가 켜진다. 이온은 타깃으로 가속되어 부딪히고, 튕겨 나온 금속 원자(주황 점선)는 여러 각도로 퍼지며 웨이퍼에 닿는다. 질화막을 만들 때는 질소(N₂)를 함께 넣는다.' },
          { id: 'wafer', label: '웨이퍼 스테이지', focus: ['wf'], desc: '웨이퍼는 정전척(ESC) 위에 놓이고, 둘레는 커버 링과 증착 링이 막아 가장자리와 척에 막이 쌓이는 것을 줄인다. 척 아래에서는 히터나 냉각이 웨이퍼 온도를 맞추고, 웨이퍼 뒷면으로 불활성 가스를 흘려 열을 고르게 전달한다. RF 바이어스 전력을 걸면 이온이 웨이퍼 쪽으로 끌려와 바닥 면 증착과 막 성질을 조절할 수 있다.' },
          { id: 'vac', label: '진공·이송', focus: ['vac', 'mv', 'body'], desc: '이송 챔버의 로봇이 슬릿 밸브를 지나 웨이퍼를 넣고 뺀다. 이송 챔버와 공정 챔버는 모두 진공이라 웨이퍼가 대기를 만나지 않는다. 공정 챔버는 게이트 밸브 너머의 크라이오 펌프가 10⁻⁸~10⁻⁹ Torr대까지 비우고, 압력 게이지가 이를 감시한다. 물과 산소 같은 잔류 기체가 막에 섞이면 막 성질이 나빠지기 때문이다.' },
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          const acc = 'var(--hl-accent)';
          let o = pvdDefs('pc');
          // --- 플라즈마(뒤에 깔림)
          o += pvdG(f, ['pl'], `<ellipse cx="200" cy="152" rx="76" ry="62" fill="url(#pcPl)"/><ellipse cx="150" cy="99" rx="22" ry="10" fill="url(#pcPl2)"/><ellipse cx="250" cy="99" rx="22" ry="10" fill="url(#pcPl2)"/>`);
          // --- 몸통(벽·바닥·뚜껑 프레임)
          o += pvdG(f, ['body', 'vac'],
            pvdR(96, 20, 208, 7, 'url(#pcMt)') + pvdR(96, 27, 10, 50, 'url(#pcMt)') + pvdR(294, 27, 10, 50, 'url(#pcMt)')
            + pvdR(96, 86, 20, 236, 'url(#pcMt)') + pvdR(284, 86, 20, 128, 'url(#pcMt)') + pvdR(284, 246, 20, 76, 'url(#pcMt)')
            + pvdR(96, 322, 28, 12, 'url(#pcMt)') + pvdR(180, 322, 34, 12, 'url(#pcMt)') + pvdR(214, 322, 90, 12, 'url(#pcMt)'));
          // --- 절연 링
          o += pvdG(f, ['sh', 'tg'], pvdR(96, 77, 28, 9, '#f8fafc', { so: .6 }) + pvdR(276, 77, 28, 9, '#f8fafc', { so: .6 }), 'style="mix-blend-mode:normal"');
          // --- 냉각수 + 마그네트론
          o += pvdG(f, ['mag', 'tg'], pvdR(106, 27, 188, 40, 'rgba(56,189,248,.16)', { so: .25, dash: '3 3' }) + pvdTx(112, 40, '냉각수', { st: 'opacity:.6;font-size:9.5px' }));
          o += pvdG(f, ['mag'], pvdR(184, 4, 32, 16, 'url(#pcMt)', { rx: 2 }) + pvdL('M200 20 V46', { sw: 3, so: .75 }) + pvdR(146, 46, 108, 6, 'url(#pcMt)')
            + pvdR(148, 52, 10, 9, '#f87171', { so: .5 }) + pvdR(190, 52, 20, 9, '#60a5fa', { so: .5 }) + pvdR(242, 52, 10, 9, '#f87171', { so: .5 })
            + pvdL('M226 36 q8 -8 16 0 M232 33 l-4 -1 M240 36 l1 -4', { so: hot(['mag']) ? .9 : .4, c: hot(['mag']) ? acc : 'currentColor', sw: 1.4 }));
          // --- 백킹 플레이트 + 타깃(침식 홈 포함)
          o += pvdG(f, ['tg'], pvdR(106, 67, 188, 10, 'url(#pcMt)') + `<polygon points="132,77 268,77 268,91 256,91 250,85 244,91 156,91 150,85 144,91 132,91" style="fill:url(#pcCu);stroke:currentColor;stroke-opacity:.7;stroke-width:1.2"/>`);
          // --- 다크 스페이스 쉴드 + 프로세스 킷
          o += pvdG(f, ['sh'], pvdR(124, 77, 6, 22, 'url(#pcMt)') + pvdR(270, 77, 6, 22, 'url(#pcMt)')
            + pvdL('M116 99 H124 V206 H146 V214 H116 Z', { fill: 'url(#pcMt)' }) + pvdL('M284 99 H276 V206 H254 V214 H284 Z', { fill: 'url(#pcMt)' })
            + pvdR(132, 218, 22, 5, 'url(#pcMt)') + pvdR(246, 218, 22, 5, 'url(#pcMt)'));
          // --- 자기장 아치 + 이온·전자
          const mf = hot(['mag']);
          o += pvdG(f, ['mag', 'pl', 'tg'], pvdL('M154 91 C154 126 196 126 196 91', { c: '#38bdf8', dash: '3 3', so: mf ? 1 : .5, sw: mf ? 1.8 : 1.2 }) + pvdL('M246 91 C246 126 204 126 204 91', { c: '#38bdf8', dash: '3 3', so: mf ? 1 : .5, sw: mf ? 1.8 : 1.2 }));
          o += pvdG(f, ['pl', 'tg'], [[148, 112], [160, 122], [140, 104], [252, 112], [240, 122], [260, 104]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.2" fill="none" stroke="#f87171" stroke-width="1.6"/>`).join('')
            + [[170, 108], [184, 116], [216, 116], [230, 108]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2" fill="#60a5fa"/>`).join('')
            + [[150, 124, 150, 97], [250, 124, 250, 97]].map(([a, b, c, d]) => dgArrow(a, b, c, d)).join(''));
          // --- 날아가는 금속 원자 (플라즈마 강조 시 흐름)
          const pl = hot(['pl']);
          o += pvdG(f, ['pl'], ['M150 94 L170 220', 'M150 94 L214 220', 'M250 94 L230 220', 'M250 94 L186 220', 'M200 94 L200 220'].map(d => pl ? dgFlow(d) : pvdL(d, { c: '#f59e0b', dash: '2 5', so: .55 })).join(''));
          // --- 웨이퍼·링·척·스템
          o += pvdG(f, ['wf'], pvdR(132, 224, 13, 8, 'url(#pcMt)') + pvdR(255, 224, 13, 8, 'url(#pcMt)')
            + pvdR(145, 224, 110, 5, 'url(#pcSi)') + pvdR(145, 222, 110, 2, '#f59e0b', { sw: .6, so: .3 })
            + pvdR(138, 229, 124, 40, 'url(#pcMt)') + pvdL('M146 258 h14 l5 -7 l8 14 l8 -14 l8 14 l8 -14 l8 14 l8 -14 l8 14 l8 -14 l8 14 l5 -7 h14', { c: '#f87171', so: .75, sw: 1.3 })
            + pvdTx(200, 243, '정전척 · 히터', { a: 'middle', st: 'font-size:9.5px;opacity:.85' })
            + pvdR(192, 269, 16, 53, 'url(#pcMt)') + [0, 1, 2, 3, 4, 5].map(i => pvdL(`M186 ${284 + i * 6} H214`, { so: .6 })).join('')
            + pvdL('M200 229 V360', { c: '#a78bfa', sw: 1.6, so: .9 }) + pvdR(196, 360, 78, 24, 'rgba(167,139,250,.18)', { rx: 4, so: .8 }) + pvdTx(235, 376, 'RF 바이어스', { a: 'middle', st: 'font-size:10px;font-weight:600' })
            + pvdL('M190 262 V250', { so: .0 }));
          // --- 이송: 슬릿 밸브·이송 챔버·로봇
          o += pvdG(f, ['mv', 'vac'], pvdR(312, 200, 84, 84, 'rgba(45,212,191,.07)', { rx: 8, dash: '3 4', so: .5 }) + pvdTx(354, 214, '이송 챔버', { a: 'middle', st: 'opacity:.7;font-size:9.5px' })
            + pvdR(304, 246, 8, 26, 'url(#pcMt)') + pvdL('M360 262 L318 232', { sw: 2.2, so: .7 }) + `<circle cx="360" cy="262" r="6" style="fill:url(#pcMt);stroke:currentColor;stroke-opacity:.7"/>`
            + pvdR(286, 230, 40, 3, 'url(#pcSi)', { sw: .8 }) + pvdR(294, 226, 56, 4, 'url(#pcSi)', { sw: .8 })
            + (hot(['mv']) ? dgFlow('M336 224 H296') : ''));
          // --- 진공: 게이트 밸브·크라이오 펌프·게이지
          o += pvdG(f, ['vac'], pvdR(112, 334, 64, 14, 'url(#pcMt)') + pvdR(118, 340, 28, 4, '#94a3b8', { so: .5 }) + pvdR(104, 348, 80, 62, 'url(#pcMt)', { rx: 6 })
            + [0, 1, 2].map(i => pvdL(`M116 ${362 + i * 14} L144 ${370 + i * 14} L172 ${362 + i * 14}`, { so: .55 })).join('') + pvdR(124, 410, 40, 24, 'url(#pcMt)', { rx: 4 })
            + (hot(['vac']) ? dgFlow('M150 322 V352', true) : '')
            + `<circle cx="326" cy="140" r="9" style="fill:none;stroke:currentColor;stroke-opacity:.7;stroke-width:1.3"/>` + pvdL('M326 140 l5 -4', { sw: 1.4 }) + pvdL('M304 140 H317') + pvdTx(326, 163, '게이지', { a: 'middle', st: 'font-size:9.5px;opacity:.75' }));
          // --- 가스: MFC·배관
          o += pvdG(f, ['gas'], pvdR(30, 136, 44, 24, 'rgba(56,189,248,.18)', { rx: 4, so: .8 }) + pvdTx(52, 152, 'MFC', { a: 'middle', st: 'font-size:10px;font-weight:700' }) + pvdTx(52, 129, 'Ar · N₂', { a: 'middle', st: 'font-size:10px;opacity:.85' })
            + pvdL('M74 148 H124', { c: '#38bdf8', sw: 3.2, so: .6 }) + (hot(['gas']) ? dgFlow('M80 148 H128') : dgArrow(112, 148, 130, 148)));
          // --- DC 전원
          o += pvdG(f, ['dc'], pvdR(30, 34, 56, 22, 'rgba(245,158,11,.18)', { rx: 4, so: .8 }) + pvdTx(58, 49, 'DC 전원', { a: 'middle', st: 'font-size:10px;font-weight:700' })
            + pvdL('M86 45 H92 V72 H106', { c: '#f59e0b', sw: 1.8, so: .95 }) + `<circle cx="106" cy="72" r="2.6" fill="#f59e0b"/>` + pvdTx(98, 66, '−', { a: 'end', st: 'font-size:12px;fill:#f59e0b;opacity:1;font-weight:800' }));
          // --- 타깃–웨이퍼 거리
          o += pvdG(f, ['pl', 'tg', 'wf'], dgArrow(268, 160, 268, 104) + dgArrow(268, 160, 268, 218) + `<text class="dg-t dg-lb dg-xs" transform="translate(259 161) rotate(-90)" text-anchor="middle" style="opacity:.7;font-size:9.5px">거리</text>`);
          // --- 번호 호출선 (오른쪽 여백 → 부품)
          o += pvdCall(f, ['mag'], '1', '#34d399', 330, 40, 342, 44, ['마그네트론'], 254, 49);
          o += pvdCall(f, ['tg'], '2', '#f59e0b', 330, 80, 342, 84, ['타깃·백킹'], 268, 84);
          o += pvdCall(f, ['sh'], '4', '#fb7185', 330, 108, 342, 112, ['쉴드·킷'], 280, 108);
          o += pvdCall(f, ['pl'], '5', '#a78bfa', 330, 176, 342, 180, ['플라즈마'], 236, 176);
          o += pvdCall(f, ['mv'], '8', '#34d399', 330, 296, 342, 300, ['슬릿 밸브', '· 이송'], 308, 262);
          // --- 번호 (왼쪽)
          o += pvdG(f, ['dc'], pvdNum(18, 45, '3', '#f59e0b'));
          o += pvdG(f, ['gas'], pvdNum(18, 148, '6', '#38bdf8'));
          o += pvdCall(f, ['wf'], '7', '#f59e0b', 18, 250, 30, 242, ['웨이퍼·척'], 138, 250);
          o += pvdCall(f, ['vac'], '9', '#2dd4bf', 18, 384, 30, 364, ['크라이오', '펌프'], 108, 384);
          return dgSvg('PVD 챔버 단면: ' + s.label, o, '0 0 400 450');
        }
      },
      // ---------- 2. 스퍼터링 원리 ----------
      'pvd-principle': {
        title: '스퍼터링: 이온이 때려 원자를 떼어 낸다',
        wide: true,
        states: [
          { id: 'all', label: '전체 장면', desc: '진공 챔버에 아르곤을 조금 넣고 타깃에 음전압을 걸면 플라즈마가 켜진다. 양이온(Ar⁺)이 타깃으로 달려가 부딪히고, 튕겨 나온 금속 원자가 웨이퍼에 달라붙어 막이 된다. 화학 반응이 아니라 원자를 물리적으로 떼어 옮기는 방식이라 PVD(물리적 기상 증착)라고 부른다.' },
          { id: 'ion', label: '① 이온 가속', focus: ['ion'], desc: '타깃에 −수백 V를 걸면 타깃 앞의 아르곤이 전자를 잃고 Ar⁺ 이온이 된다. 양이온은 음전압의 타깃으로 끌려가며 에너지를 얻는다. 이 에너지가 타깃 원자를 떼어 낼 만큼 커야 스퍼터링이 일어난다.' },
          { id: 'hit', label: '② 충돌', focus: ['hit'], desc: '이온이 표면에 부딪히면 에너지가 타깃 속 원자들에게 연쇄적으로 전해진다. 그 에너지를 받아 표면 결합을 끊을 만큼 커진 원자가 바깥으로 튀어나간다. 이온 하나가 떼어 내는 원자 수를 스퍼터 수율이라 하고, 재료와 이온 에너지에 따라 다르다.' },
          { id: 'dep', label: '③ 막 쌓임', focus: ['dep'], desc: '튀어나온 원자는 진공을 가로질러 웨이퍼에 닿고, 닿는 즉시 식어 붙는다. 원자가 하나씩 쌓이므로 막 두께는 시간에 비례하고, 증착 속도는 초당 몇 nm 정도다. 금속 원자가 웨이퍼 표면의 어느 각도로 들어오느냐가 깊은 구멍 안의 증착을 좌우한다.' },
        ],
        svg(s) {
          const f = s.focus || null;
          let o = pvdDefs('pp');
          o += pvdG(f, ['ion', 'hit'], `<ellipse cx="200" cy="140" rx="128" ry="68" fill="url(#ppPl)"/>`);
          // 타깃 + 전원 표시
          o += pvdG(f, ['ion', 'dep'], pvdR(70, 26, 260, 26, 'url(#ppCu)') + pvdTx(338, 43, '타깃', { st: 'font-size:10.5px;font-weight:700;opacity:1' })
            + pvdL('M80 26 V14 H92', { c: '#f59e0b', sw: 1.8, so: .95 }) + pvdTx(98, 18, '− 수백 V (DC)', { st: 'font-size:10px;fill:#f59e0b;opacity:1;font-weight:700' }));
          // 아르곤 중성 원자(배경), 전자
          const bg = [[96, 110], [150, 130], [250, 118], [304, 134], [120, 170], [186, 150], [236, 176], [286, 168], [160, 200], [216, 210]];
          o += pvdG(f, ['ion'], bg.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="currentColor" opacity=".3"/>`).join('') + [[140, 100], [215, 124], [268, 108], [190, 96], [104, 132]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="#60a5fa"/>`).join(''));
          // 이온 + 가속 화살표
          const ions = [[116, 92], [170, 84], [230, 92], [288, 98], [200, 118]];
          o += pvdG(f, ['ion'], ions.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="rgba(248,113,113,.15)" stroke="#f87171" stroke-width="1.8"/><text class="dg-t dg-lb" x="${x}" y="${y + 3.4}" text-anchor="middle" style="font-size:9.5px;fill:#f87171;font-weight:800">+</text>`).join('')
            + ions.map(([x, y]) => (f && pvdOn(f, ['ion']) ? dgFlow(`M${x} ${y - 8} V${56 + (y > 100 ? 18 : 0)}`, true) : dgArrow(x, y - 8, x, 58))).join('')
            + pvdTx(200, 140, 'Ar⁺ (아르곤 양이온)', { a: 'middle', st: 'font-size:10px;font-weight:600' }));
          // 날아가는 금속 원자 + 막
          const at = [[120, 150, 112], [168, 188, 150], [212, 160, 206], [252, 204, 262], [292, 176, 300], [206, 218, 190]];
          const dep = f && pvdOn(f, ['dep']);
          o += pvdG(f, ['dep'], at.map(([x, y, x0]) => pvdL(`M${x0} 58 L${x} ${y}`, { c: '#f59e0b', dash: '2 4', so: .6 }) + `<circle cx="${x}" cy="${y}" r="4.2" fill="#f59e0b"/>`).join('')
            + (dep ? [[120, 224], [210, 224], [292, 224]].map(([x, y]) => dgArrow(x, y - 12, x, y + 4)).join('') : ''));
          o += pvdG(f, ['dep'], pvdR(70, 236, 260, 14, 'url(#ppSi)') + pvdR(70, 230, 260, 6, '#f59e0b', { sw: .6, so: .4 }) + pvdTx(338, 247, '웨이퍼', { st: 'font-size:10.5px;font-weight:700;opacity:1' }) + pvdTx(338, 234, '금속막', { st: 'font-size:10px;fill:#f59e0b;opacity:1;font-weight:700' }));
          // 충돌 확대 패널
          if (f && pvdOn(f, ['hit'])) {
            let z = pvdR(46, 64, 308, 178, 'var(--tbl-bg)', { rx: 12, so: .5 }) + pvdTx(200, 84, '확대: 타깃 표면에서 일어나는 일', { a: 'middle', st: 'font-size:10.5px;font-weight:700;opacity:1' });
            for (let r = 0; r < 4; r++) for (let c = 0; c < 13; c++) { const x = 78 + c * 20 + (r % 2 ? 10 : 0), y = 98 + r * 15; if (r === 3 && c === 7) { z += `<circle cx="${x}" cy="${y}" r="6.5" fill="none" stroke="#f59e0b" stroke-dasharray="2 2"/>`; continue; } z += `<circle cx="${x}" cy="${y}" r="6.5" fill="url(#ppCu)" stroke="currentColor" stroke-opacity=".4" stroke-width=".8"/>`; }
            z += pvdL('M70 160 H330', { so: .5, sw: 1 }) + pvdTx(332, 158, '표면', { st: 'font-size:9.5px;opacity:.7' });
            z += `<circle cx="132" cy="208" r="10" fill="rgba(248,113,113,.15)" stroke="#f87171" stroke-width="2"/><text class="dg-t dg-lb" x="132" y="212" text-anchor="middle" style="font-size:12px;fill:#f87171;font-weight:800">+</text>` + dgArrow(138, 199, 158, 166, 'dg-line')
              + pvdTx(88, 232, 'Ar⁺ 이온', { st: 'font-size:10px;font-weight:600' });
            z += pvdL('M168 150 L196 132 L222 118 M168 150 L200 154', { c: '#fb923c', sw: 1.6, dash: '3 3', so: .95 }) + pvdTx(214, 112, '충돌 연쇄', { st: 'font-size:10px;font-weight:600;fill:#fb923c;opacity:1' });
            z += dgArrow(226, 168, 262, 214, 'dg-line') + `<circle cx="230" cy="176" r="6.5" fill="url(#ppCu)" stroke="currentColor" stroke-opacity=".5"/>` + pvdTx(268, 216, '튀어나간 원자', { st: 'font-size:10px;font-weight:700;fill:#f59e0b;opacity:1' });
            o += z;
          }
          return dgSvg('스퍼터링 원리: ' + s.label, o, '0 0 400 270');
        }
      },
      // ---------- 3. 칩 단면: PVD가 쓰이는 자리 ----------
      'pvd-where': {
        title: '칩 단면에서 PVD가 만드는 층',
        wide: true,
        states: [
          { id: 'all', label: '전체 단면', desc: '트랜지스터 위에 접점(컨택), 구리 배선, 알루미늄 패드가 층층이 올라간다. 색을 입힌 얇은 층이 PVD로 만드는 부분이다. 회색 부분(텅스텐 플러그, 도금 구리)은 CVD나 전기도금 같은 다른 공정이 채운다.' },
          { id: 'ct', label: '접점 라이너', focus: ['ct'], desc: '접점은 트랜지스터의 소스·드레인과 첫 배선을 잇는 좁고 깊은 구멍이다. 텅스텐을 채우기 전에 티타늄(Ti)과 질화티타늄(TiN)을 먼저 입힌다. Ti는 바닥의 산화막을 걷어 내며 접촉 저항을 낮추고, TiN은 텅스텐과 실리콘이 반응하는 것을 막는다. 구멍 바닥까지 닿아야 해서 방향성이 중요한 자리다.' },
          { id: 'cu', label: '구리 배선', focus: ['cu'], desc: '구리는 절연막 속으로 빠르게 번지고 잘 안 붙는다. 그래서 홈을 판 뒤 탄탈(Ta/TaN) 배리어를 먼저 입혀 구리를 막고 접착을 돕는다. 그 위에 얇은 구리 씨앗(시드)층을 PVD로 입히면, 이 씨앗을 전극 삼아 전기도금이 홈을 구리로 채운다. 배리어와 씨앗이 끊기면 도금이 비어 버린다.' },
          { id: 'pd', label: '알루미늄 패드', focus: ['pd'], desc: '칩 맨 위에는 외부와 연결되는 알루미늄(Al-Cu 합금) 패드가 있다. 두꺼운 알루미늄을 스퍼터링으로 한 번에 입히고, 위아래에 Ti/TiN 층을 두어 접착과 반사 방지를 돕는다. 패드는 구멍 안쪽을 채우는 일이 아니라 넓고 평평한 막을 빠르게 두껍게 쌓는 일이어서 PVD의 장점이 그대로 살아 난다.' },
        ],
        svg(s) {
          const f = s.focus || null, ON = (g) => pvdOn(f, g);
          const ROSE = '#fb7185', TEAL = '#2dd4bf', AMB = '#f59e0b', SKY = '#38bdf8';
          let o = '';
          // 바탕: 실리콘, 산화막, 트랜지스터
          o += pvdG(f, ['base', 'ct', 'cu', 'pd'], `<rect class="dg-ox" x="16" y="62" width="368" height="230" opacity=".5"/>` + pvdR(16, 292, 368, 34, '#94a3b8', { so: .5 }) + pvdTx(24, 314, '실리콘 기판', { st: 'font-size:10px;opacity:.8' })
            + `<rect x="96" y="284" width="52" height="8" class="dg-n" style="fill-opacity:.55"/><rect x="180" y="284" width="52" height="8" class="dg-n" style="fill-opacity:.55"/>`
            + pvdR(154, 270, 22, 14, '#94a3b8', { so: .6 }) + pvdTx(186, 280, '게이트', { st: 'font-size:9.5px;opacity:.7' }));
          // 접점: 텅스텐 플러그(회색) + Ti/TiN 라이너(장밋빛)
          const plug = (x) => `<rect x="${x}" y="224" width="14" height="60" style="fill:#94a3b8;fill-opacity:.55"/>` + pvdL(`M${x} 224 V284 H${x + 14} V224`, { c: ROSE, sw: 2.6, so: ON(['ct']) ? 1 : .8 });
          o += pvdG(f, ['ct'], plug(118) + plug(204) + pvdTx(250, 262, 'W 플러그 (CVD)', { st: 'font-size:9.5px;opacity:.8' }));
          // M1·V1·M2: 구리 배선(회색) + Ta/TaN 배리어(청록)
          const cu = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" style="fill:#f59e0b;fill-opacity:.4"/>` + pvdL(`M${x} ${y} V${y + h} H${x + w} V${y}`, { c: TEAL, sw: 2.4, so: ON(['cu']) ? 1 : .8 }) + pvdL(`M${x + 3.5} ${y + 1} V${y + h - 3.5} H${x + w - 3.5} V${y + 1}`, { c: AMB, sw: 1.4, so: .95 });
          o += pvdG(f, ['cu'], cu(100, 192, 62, 32) + cu(180, 192, 64, 32) + cu(196, 156, 16, 36) + cu(166, 126, 84, 30) + pvdTx(290, 212, '구리 (전기도금)', { st: 'font-size:9.5px;opacity:.8' }));
          // 패드: Al-Cu + Ti/TiN
          o += pvdG(f, ['cu'], cu(204, 98, 16, 28));
          o += pvdG(f, ['pd'], `<rect class="dg-ox" x="16" y="62" width="130" height="36" opacity=".75"/><rect class="dg-ox" x="274" y="62" width="110" height="36" opacity=".75"/>`
            + `<rect x="146" y="70" width="128" height="28" style="fill:${SKY};fill-opacity:.35"/>` + pvdL('M146 98 H274', { c: ROSE, sw: 2.6, so: 1 }) + pvdL('M146 70 H274', { c: ROSE, sw: 2.6, so: 1 })
            + pvdTx(210, 88, 'Al-Cu 패드', { a: 'middle', st: 'font-size:10px;font-weight:700;opacity:1' }) + pvdTx(62, 84, '보호막', { a: 'middle', st: 'font-size:9.5px;opacity:.7' }));
          // 호출선
          o += pvdCall(f, ['ct'], '1', ROSE, 330, 262, 342, 266, ['접점', 'Ti/TiN'], 218, 262);
          o += pvdCall(f, ['cu'], '2', TEAL, 330, 168, 342, 172, ['구리 배선', 'Ta/TaN', '+ Cu 시드'], 250, 140);
          o += pvdCall(f, ['pd'], '3', SKY, 330, 52, 342, 36, ['알루미늄', '패드'], 274, 80);
          o += pvdTx(200, 346, '장밋빛 = Ti/TiN · 청록 = 배리어 · 주황 = 구리 씨앗 (모두 PVD)', { a: 'middle', st: 'font-size:10px;opacity:.7' });
          return dgSvg('칩 단면: ' + s.label, o, '0 26 400 330');
        }
      },
      // ---------- 4. 클러스터 장비 (위에서 본 모습) ----------
      'pvd-cluster': {
        title: 'PVD 클러스터 장비 (위에서 본 모습)',
        wide: true,
        states: [
          { id: 'all', label: '전체 배치', desc: '실제 PVD는 챔버 하나만 따로 서 있지 않다. 가운데 이송 챔버를 로봇이 돌며 주변의 여러 챔버로 웨이퍼를 옮기는 클러스터 장비 한 대에서 일한다. 왼쪽은 웨이퍼 상자(FOUP)가 놓이는 대기 쪽이고, 오른쪽은 모두 진공이다.' },
          { id: 'path', label: '웨이퍼 경로', focus: ['path'], desc: '웨이퍼는 로드락 → 탈기 → 사전 세정 → PVD(배리어) → PVD(구리 시드) → 냉각 순으로 지나간다. 모두 진공 안에서 이어지므로 중간에 대기를 만나 다시 산화되지 않는다. 구리 배선 공정의 예이며, 다른 공정에서는 챔버 구성과 순서가 다르다.' },
          { id: 'vac', label: '압력 구역', focus: ['vac'], desc: '왼쪽 대기 구역(EFEM)과 오른쪽 진공 구역 사이에 로드락이 있다. 로드락은 문을 닫고 압력을 대기와 진공 사이에서 오르내려 웨이퍼를 넘겨 주는 작은 방이다. 이송 챔버는 고진공이고, 공정 챔버는 그보다 더 깊은 진공(10⁻⁸~10⁻⁹ Torr대)을 기본 압력으로 쓴다.' },
          { id: 'pvd', label: 'PVD 챔버', focus: ['pvd'], desc: '스퍼터링은 이 두 칸에서 일어난다. 앞의 단면도가 이 한 칸을 가른 모습이다. 배리어용 챔버는 탄탈이나 티타늄 타깃을, 시드용 챔버는 구리 타깃을 쓰는 식으로 챔버마다 타깃 재료가 정해져 있다.' },
        ],
        svg(s) {
          const f = s.focus || null, ON = (g) => pvdOn(f, g);
          const H = [[232, 107], [282, 136], [282, 194], [232, 223], [182, 194], [182, 136]];
          const ch = (cx, cy, rot, w, h, c, g, fillop = .18) => pvdG(f, g, `<g transform="rotate(${rot} ${cx} ${cy})">${pvdR(cx - w / 2, cy - h / 2, w, h, `rgba(${c},${fillop})`, { rx: 5, so: .8 })}</g>`);
          let o = '';
          // 압력 구역 바탕
          o += pvdG(f, ['vac'], pvdR(54, 86, 52, 158, 'rgba(56,189,248,.12)', { rx: 8, dash: '3 3', so: .4 }) + pvdR(112, 66, 282, 214, 'rgba(167,139,250,.1)', { rx: 14, dash: '3 3', so: .4 }));
          o += pvdG(f, ['vac'], pvdTx(80, 258, '대기 구역', { a: 'middle', st: 'font-size:9.5px;opacity:.8' }) + pvdTx(262, 292, '진공 구역', { a: 'middle', st: 'font-size:9.5px;opacity:.8;fill:#a78bfa' }));
          // FOUP + EFEM + 로드락
          o += pvdG(f, ['path', 'vac', 'base'], [100, 146, 192].map(y => pvdR(12, y, 34, 38, 'rgba(56,189,248,.14)', { rx: 4 })).join('') + pvdTx(29, 92, 'FOUP', { a: 'middle', st: 'font-size:9.5px;opacity:.85' })
            + pvdR(60, 95, 36, 140, 'rgba(56,189,248,.1)', { rx: 4 }) + pvdTx(78, 86, 'EFEM', { a: 'middle', st: 'font-size:9.5px;opacity:.85' }) + pvdL('M96 165 H126', { sw: 6, so: .25 }));
          o += pvdG(f, ['vac', 'path'], `<rect x="126" y="135" width="54" height="60" rx="6" style="fill:rgba(56,189,248,.14);stroke:currentColor;stroke-opacity:.8;stroke-width:1.2"/>` + pvdTx(153, 128, '로드락', { a: 'middle', st: 'font-size:10px;font-weight:600;opacity:.95' }) + pvdL('M126 165 H180', { so: .35, sw: 1, dash: '2 3' }));
          // 이송 챔버
          o += pvdG(f, ['vac', 'path', 'base'], `<polygon points="${H.map(p => p.join(',')).join(' ')}" style="fill:rgba(167,139,250,.14);stroke:currentColor;stroke-opacity:.8;stroke-width:1.3"/>` + `<circle cx="232" cy="165" r="15" style="fill:url(#pkMt);stroke:currentColor;stroke-opacity:.7"/>` + pvdL('M232 165 L256 150 M232 165 L212 184', { sw: 3, so: .55 }) + pvdTx(232, 200, '이송 로봇', { a: 'middle', st: 'font-size:9.5px;opacity:.7' }));
          // 챔버들
          o += ch(182, 107, 30, 54, 42, '251,191,36', ['path'], .16) + ch(282, 107, 30, 54, 42, '167,139,250', ['path']);   // 탈기, 사전 세정(방향 보정은 아래)
          o += ch(182, 223, -30, 54, 42, '45,212,191', ['path'], .16) + ch(311, 165, 0, 54, 42, '245,158,11', ['pvd', 'path'], .3) + ch(282, 223, 30, 54, 42, '245,158,11', ['pvd', 'path'], .3);
          // 라벨
          o += pvdG(f, ['path'], pvdTx(182, 68, '탈기', { a: 'middle', st: 'font-size:10px;font-weight:600;opacity:.95' }) + pvdTx(282, 68, '사전 세정', { a: 'middle', st: 'font-size:10px;font-weight:600;opacity:.95' }) + pvdTx(182, 272, '냉각', { a: 'middle', st: 'font-size:10px;font-weight:600;opacity:.95' }));
          o += pvdG(f, ['pvd', 'path'], pvdTx(342, 156, 'PVD', { st: 'font-size:10.5px;font-weight:800;fill:#f59e0b;opacity:1' }) + pvdTx(342, 169, '배리어', { st: 'font-size:10px;font-weight:600;opacity:.95' }) + pvdTx(282, 272, 'PVD 시드', { a: 'middle', st: 'font-size:10.5px;font-weight:800;fill:#f59e0b;opacity:1' }));
          // 경로 + 번호
          if (f && ON(['path']) && s.id === 'path') {
            const st = [[153, 165], [182, 107], [282, 107], [311, 165], [282, 223], [182, 223]], hub = [232, 165];
            const seg = (a, b) => dgFlow(`M${a[0]} ${a[1]} L${b[0]} ${b[1]}`);
            o += seg([30, 165], [153, 165]) + st.slice(0, 5).map((p, i) => seg(i === 0 ? p : hub, st[i + 1])).join('') + seg(st[5], [153, 165]);
            o += st.map((p, i) => pvdNum(p[0], p[1], String(i + 1), ['#38bdf8', '#fbbf24', '#a78bfa', '#f59e0b', '#f59e0b', '#2dd4bf'][i])).join('');
          }
          if (s.id === 'pvd') o += pvdG(f, ['pvd'], pvdNum(311, 165, 'P', '#f59e0b') + pvdNum(282, 223, 'P', '#f59e0b'));
          return dgSvg('PVD 클러스터 장비: ' + s.label, pvdDefs('pk') + o, '0 54 400 252');
        }
      },
      // ---------- 5. 마그네트론과 타깃 침식 ----------
      'pvd-magnetron': {
        title: '마그네트론: 자기장으로 플라즈마를 가둔다',
        wide: true,
        states: [
          { id: 'field', label: '자기장 터널', focus: ['field'], desc: '타깃 뒤의 자석이 타깃 앞에 아치 모양 자기장을 만든다. 전자는 자기장선을 감아 도는 나선 운동을 하며 이 터널 안에 갇힌다. 전자가 오래 머물수록 아르곤과 더 많이 충돌해 이온이 많이 생기므로, 같은 전력으로도 낮은 압력에서 플라즈마를 켜고 빠르게 증착할 수 있다.' },
          { id: 'top', label: '위에서 본 타깃', focus: ['top'], desc: '자석 배치가 고리(레이스트랙) 모양이어서 플라즈마도 그 고리를 따라 진하게 생긴다. 자석 묶음은 모터로 타깃 위를 돌거나 쓸고 다닌다. 고정해 두면 한 고리만 깊게 파이고, 돌리면 더 넓은 면이 고르게 깎인다.' },
          { id: 'wear', label: '침식과 수명', focus: ['wear'], desc: '타깃은 플라즈마가 진한 곳부터 파인다. 새 타깃, 중간, 수명 끝을 겹쳐 보면 홈이 점점 깊어진다. 홈이 백킹 플레이트에 가까워지면 두께 균일도가 흔들리고 백킹 재료가 튀어 오염될 수 있어 그 전에 교체한다. 수명은 시간이 아니라 누적 사용 전력(kWh)으로 센다.' },
        ],
        svg(s) {
          const f = s.focus || null;
          let o = pvdDefs('pm');
          // ---- A: 단면 (field) ----
          if (s.id === 'field') {
            const bez = (p0, p1, p2, p3, t) => { const u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; };
            const wave = (p0, p1, p2, p3, n, amp) => { let d = ''; for (let i = 0; i <= n * 16; i++) { const t = i / (n * 16), [x, y] = bez(p0, p1, p2, p3, t), [xa, ya] = bez(p0, p1, p2, p3, Math.min(1, t + .01)), [xb, yb] = bez(p0, p1, p2, p3, Math.max(0, t - .01)); let nx = -(ya - yb), ny = xa - xb; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L; const w = Math.sin(t * n * 2 * Math.PI) * amp; d += (i ? 'L' : 'M') + (x + nx * w).toFixed(1) + ' ' + (y + ny * w).toFixed(1) + ' '; } return d; };
            o += pvdR(40, 42, 320, 16, 'url(#pmCu)') + pvdTx(366, 54, '타깃', { st: 'font-size:10.5px;font-weight:700;opacity:1' });
            o += pvdR(40, 26, 320, 14, 'url(#pmMt)') + pvdTx(366, 37, '백킹', { st: 'font-size:9.5px;opacity:.8' });
            o += pvdR(66, 6, 268, 6, 'url(#pmMt)');
            o += pvdR(76, 12, 22, 12, '#f87171', { so: .5 }) + pvdR(176, 12, 48, 12, '#60a5fa', { so: .5 }) + pvdR(302, 12, 22, 12, '#f87171', { so: .5 });
            const ink = 'font-size:8.5px;font-weight:800;fill:#0b1220;opacity:1';
            o += pvdTx(87, 22, 'N', { a: 'middle', st: ink }) + pvdTx(200, 22, 'S', { a: 'middle', st: ink }) + pvdTx(313, 22, 'N', { a: 'middle', st: ink });
            o += `<ellipse cx="142" cy="74" rx="52" ry="20" fill="url(#pmPl)"/><ellipse cx="258" cy="74" rx="52" ry="20" fill="url(#pmPl)"/>`;
            o += pvdL('M104 58 C104 120 180 120 180 58', { c: '#38bdf8', sw: 1.8, so: .95 }) + pvdL('M296 58 C296 120 220 120 220 58', { c: '#38bdf8', sw: 1.8, so: .95 })
              + pvdL('M90 58 C90 156 190 156 190 58', { c: '#38bdf8', sw: 1.2, so: .5, dash: '3 3' }) + pvdL('M310 58 C310 156 210 156 210 58', { c: '#38bdf8', sw: 1.2, so: .5, dash: '3 3' });
            o += pvdL(wave([104, 58], [104, 120], [180, 120], [180, 58], 4, 4), { c: '#60a5fa', sw: 1.6, so: 1 }) + pvdL(wave([296, 58], [296, 120], [220, 120], [220, 58], 4, 4), { c: '#60a5fa', sw: 1.6, so: 1 });
            o += [[132, 66], [152, 70], [248, 66], [268, 70]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="none" stroke="#f87171" stroke-width="1.6"/>`).join('');
            o += dgArrow(142, 72, 142, 60) + dgArrow(258, 72, 258, 60);
            o += pvdTx(200, 150, '자기장선', { a: 'middle', st: 'font-size:10px;fill:#38bdf8;opacity:1;font-weight:700' });
            o += pvdTx(200, 174, '전자는 자기장선을 감아 돌며 터널 안에 갇힌다 (파란 나선)', { a: 'middle', st: 'font-size:10px;fill:#60a5fa;opacity:1;font-weight:600' });
            o += pvdTx(200, 190, '이온이 가장 많이 생기는 이 자리가 타깃에서 가장 많이 깎인다', { a: 'middle', st: 'font-size:10px;opacity:.85' });
            return dgSvg('마그네트론: ' + s.label, o, '0 0 400 200');
          }
          // ---- B: 위에서 본 타깃 (top) ----
          if (s.id === 'top') {
            const cx = 160, cy = 130;
            o += `<circle cx="${cx}" cy="${cy}" r="112" style="fill:url(#pmCu);stroke:currentColor;stroke-opacity:.7;stroke-width:1.4"/><circle cx="${cx}" cy="${cy}" r="112" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="10"/>`;
            // 레이스트랙(하트/신장 모양 근사: 편심 고리)
            const track = 'M160 52 C214 40 252 82 236 128 C226 160 190 176 168 196 C150 212 112 200 98 170 C84 140 100 100 124 80 C136 70 148 56 160 52 Z';
            o += `<path d="${track}" fill="none" stroke="#c4b5fd" stroke-width="16" stroke-opacity=".5" stroke-linejoin="round"/><path d="${track}" fill="none" stroke="#a78bfa" stroke-width="4" stroke-opacity=".95" stroke-linejoin="round"/>`;
            o += `<circle cx="${cx}" cy="${cy}" r="4" fill="currentColor"/>` + pvdL(`M${cx} ${cy} L${cx + 70} ${cy - 76}`, { sw: 1.2, so: .5, dash: '3 3' }) + pvdL('M214 44 a124 124 0 0 1 56 54', { c: '#f59e0b', sw: 2, so: 1 }) + dgArrow(266, 92, 272, 104);
            o += pvdTx(300, 76, '자석이', { st: 'font-size:10px;fill:#f59e0b;opacity:1;font-weight:700' }) + pvdTx(300, 88, '회전', { st: 'font-size:10px;fill:#f59e0b;opacity:1;font-weight:700' });
            o += pvdTx(300, 150, '플라즈마', { st: 'font-size:10px;fill:#a78bfa;opacity:1;font-weight:700' }) + pvdTx(300, 162, '고리', { st: 'font-size:10px;fill:#a78bfa;opacity:1;font-weight:700' }) + pvdL('M296 154 L238 138', { sw: 1, so: .5 });
            o += pvdTx(160, 256, '타깃을 위에서 본 모습 (아래쪽 면이 플라즈마에 노출)', { a: 'middle', st: 'font-size:10px;opacity:.75' });
            return dgSvg('마그네트론: ' + s.label, o, '0 0 400 266');
          }
          // ---- C: 침식 단면 (wear) ----
          const SF = 112, cs = [112, 288];
          const cut = (c, d, w) => `M${c - w - 14} ${SF} L${c - w} ${SF - d * .4} L${c - 4} ${SF - d} L${c + 4} ${SF - d} L${c + w} ${SF - d * .4} L${c + w + 14} ${SF} Z`;
          o += pvdR(30, 46, 340, 18, 'url(#pmMt)') + pvdTx(376, 58, '백킹', { st: 'font-size:9.5px;opacity:.8' });
          o += pvdR(30, 64, 340, 48, 'url(#pmCu)');
          o += cs.map(c => `<path d="${cut(c, 38, 22)}" style="fill:var(--tbl-bg);stroke:#f87171;stroke-width:1.5;stroke-dasharray:4 3"/>`).join('');
          o += cs.map(c => `<path d="${cut(c, 38, 22)}" style="fill:rgba(245,158,11,.38);stroke:none"/><path d="${cut(c, 20, 17)}" style="fill:var(--tbl-bg);stroke:#fb923c;stroke-width:1.5;stroke-dasharray:4 3"/>`).join('');
          o += pvdL(`M30 ${SF} H370`, { so: .5, sw: 1 });
          o += dgArrow(200, 112, 200, 64) + dgArrow(200, 64, 200, 112) + pvdTx(208, 92, '처음 두께', { st: 'font-size:9.5px;font-weight:700;opacity:1;fill:#0b1220' });
          o += pvdTx(112, 140, '새 것 → 중간 → 수명 끝', { a: 'middle', st: 'font-size:9.5px;opacity:.8' }) + pvdTx(112, 154, '홈이 점점 깊어진다', { a: 'middle', st: 'font-size:9.5px;opacity:.8' });
          o += pvdL('M62 118 L92 100', { c: '#fb923c', sw: 1, so: .9 }) + pvdTx(58, 120, '중간', { a: 'end', st: 'font-size:9.5px;fill:#fb923c;opacity:1;font-weight:700' });
          o += pvdTx(342, 130, '수명 끝', { a: 'end', st: 'font-size:10px;fill:#f87171;opacity:1;font-weight:700' }) + pvdTx(342, 143, '→ 교체', { a: 'end', st: 'font-size:10px;fill:#f87171;opacity:1;font-weight:700' }) + pvdL('M300 126 L292 112', { c: '#f87171', sw: 1, so: .9 });
          o += pvdTx(200, 184, '플라즈마가 진한 고리 자리만 깊이 파이고 중앙은 거의 남는다', { a: 'middle', st: 'font-size:10px;opacity:.85' }) + pvdTx(200, 198, '(고정 자석을 쓰는 평판 타깃은 재료의 30% 안팎만 쓰고 교체)', { a: 'middle', st: 'font-size:9.5px;opacity:.7' });
          return dgSvg('마그네트론: ' + s.label, o, '0 0 400 208');
        }
      },
      // ---------- 6. 구멍 안 증착 (스텝 커버리지) ----------
      'pvd-stepcov': {
        title: '깊은 구멍 안쪽 증착: 입사 각도가 좌우한다',
        wide: true,
        states: [
          { id: 'a', label: '일반 스퍼터링', desc: '타깃에서 튀어나온 원자는 여러 각도로 날아온다. 비스듬히 오는 원자는 구멍 입구 모서리에 먼저 붙어 입구가 좁아지고(오버행), 바닥과 옆면에는 막이 얇게 쌓인다. 구멍이 깊고 좁을수록 심해서, 막이 입구를 닫아 버리면 안쪽이 빈 채(보이드)로 남는다.', ov: 20, tf: 26, ts: [8, 2], bt: 4, ang: 38, tag: '바닥 얇음 · 입구 좁아짐' },
          { id: 'b', label: '방향성 높이기', desc: '압력을 낮추면 원자가 가스와 덜 충돌해 곧게 날아오고, 타깃과 웨이퍼 사이를 멀게 하거나(롱 스로) 콜리메이터를 두면 비스듬한 원자가 걸러져 수직에 가까운 원자만 남는다. 바닥까지 닿는 양이 늘지만, 걸러 낸 만큼 증착 속도는 떨어진다.', ov: 9, tf: 20, ts: [5, 3], bt: 9, ang: 12, tag: '바닥 보강 · 속도는 감소' },
          { id: 'c', label: '이온화 + 바이어스', desc: '고밀도 플라즈마로 금속 원자 자체를 이온화(iPVD)하면 웨이퍼에 건 바이어스 전압이 이온을 수직으로 끌어당겨 바닥에 잘 닿는다. 에너지가 큰 이온이 바닥 막을 일부 다시 쳐 내(리스퍼터) 옆면으로 옮기므로 오버행도 줄어든다. 구리 배리어·시드처럼 아주 깊은 구멍에 쓴다.', ov: 3, tf: 13, ts: [7, 7], bt: 12, ang: 4, tag: '바닥·옆면 모두 확보' },
        ],
        svg(s) {
          const X0 = 150, X1 = 250, T = 100, B = 246;   // 구멍: x 150~250, 상단 y=100, 바닥 y=246
          const ov = s.ov, tf = s.tf, [t0, t1] = s.ts, bt = s.bt;
          let o = pvdDefs('ps');
          o += `<rect class="dg-ox" x="30" y="${T}" width="${X0 - 30}" height="${B - T}"/><rect class="dg-ox" x="${X1}" y="${T}" width="${370 - X1}" height="${B - T}"/><rect class="dg-si" x="30" y="${B}" width="340" height="26"/>`
            + pvdTx(34, B + 17, '하부 도체 / 실리콘', { st: 'font-size:9.5px;opacity:.85' }) + pvdTx(34, T + 16, '절연막', { st: 'font-size:9.5px;opacity:.7' });
          // 막 단면(좌우 대칭): 바깥(절연막 경계) → 안쪽 경계
          const outer = [[30, T], [X0, T], [X0, B], [X1, B], [X1, T], [370, T]];
          const inner = [[370, T - tf], [X1 - ov, T - tf], [X1 - ov + 2, T - 2], [X1 - t0, T + 14], [X1 - t1, B - bt - 6], [X1 - t1 - 6, B - bt], [X0 + t1 + 6, B - bt], [X0 + t1, B - bt - 6], [X0 + t0, T + 14], [X0 + ov - 2, T - 2], [X0 + ov, T - tf], [30, T - tf]];
          o += `<polygon points="${outer.concat(inner).map(p => p.join(',')).join(' ')}" style="fill:url(#psCu);stroke:currentColor;stroke-opacity:.6;stroke-width:1"/>`;
          // 날아오는 원자(입사각)
          const A = s.ang, atoms = [-A, -A * .5, 0, A * .5, A];
          const sx = [120, 160, 200, 240, 280];
          atoms.forEach((a, i) => { const x0 = 200 + (i - 2) * 38, y0 = 34, L = 54, r = a * Math.PI / 180, x1 = x0 + Math.sin(r) * L * -1, y1 = y0 + Math.cos(r) * L; o += `<path d="M${x0} ${y0} L${x1.toFixed(1)} ${y1.toFixed(1)}" style="stroke:#f59e0b;stroke-width:1.8;stroke-dasharray:2 4;fill:none"/><circle cx="${x0}" cy="${y0}" r="3.6" fill="#f59e0b"/>`; });
          o += pvdTx(34, 18, '날아오는 금속 원자', { st: 'font-size:10px;opacity:.85' });
          // 치수·표시
          o += dgArrow(318, T - tf, 318, T) + pvdTx(324, T - tf / 2 + 3, '필드', { st: 'font-size:9.5px;opacity:.85' });
          o += dgArrow(200, B - 40, 200, B - bt - 1) + pvdTx(200, B - 46, '바닥', { a: 'middle', st: 'font-size:9.5px;opacity:.9;font-weight:700' });
          o += pvdTx(X1 + 20, T - tf - 8, '오버행', { st: 'font-size:9.5px;fill:#f87171;opacity:1;font-weight:700' }) + pvdL(`M${X1 + 18} ${T - tf - 10} L${X1 - ov + 4} ${T - tf + 2}`, { c: '#f87171', sw: 1, so: .8 });
          o += pvdTx(200, B + 46, s.tag, { a: 'middle', st: 'font-size:11px;font-weight:800;fill:var(--badge-fg);opacity:1' });
          return dgSvg('구멍 안쪽 증착: ' + s.label, o, '0 0 400 304');
        }
      },
      // ---------- 7. 공정 변수가 바꾸는 것 ----------
      'pvd-knobs': {
        title: '공정 변수가 바꾸는 것 (개념도)',
        wide: true,
        states: [
          { id: 'p', label: '압력', desc: '압력이 낮으면 아르곤 분자가 적어 금속 원자가 충돌 없이 곧게 날아온다. 압력이 높으면 가는 길에 가스와 자주 부딪혀 방향이 흩어지고 에너지를 잃는다. 흩어진 원자는 비스듬히 들어와 깊은 구멍 바닥에는 덜 닿지만, 막이 더 부드럽고 압축 응력이 줄어드는 경향이 있다. 압력이 너무 낮으면 플라즈마가 꺼질 수 있다.' },
          { id: 'd', label: '타깃–웨이퍼 거리', desc: '거리가 가까우면 타깃의 넓은 면에서 온 원자가 여러 각도로 들어와 속도가 빠르고 가장자리까지 고르게 쌓이지만 구멍 바닥에는 불리하다. 거리를 늘리면 수직에 가까운 원자만 도달해 바닥 증착이 좋아지는 대신 증착 속도가 떨어진다(롱 스로).' },
          { id: 'w', label: '파워·바이어스', desc: 'DC 전력을 올리면 이온 수가 늘어 증착 속도가 전력에 거의 비례해 오르지만 타깃과 웨이퍼의 온도도 함께 오른다. 웨이퍼에 거는 RF 바이어스는 이온 에너지를 키워 바닥 증착을 돕는다. 다만 너무 세면 막을 깎고 웨이퍼를 가열하거나 손상시킨다. 두 곡선은 경향을 보이는 개념도다.' },
        ],
        svg(s) {
          let o = pvdDefs('pn');
          const rnd = (() => { let a = 7; return () => (a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
          const mini = (x0, title, cap1, cap2, body) => {
            const w = 170;
            let g = pvdR(x0, 40, w, 12, 'url(#pnCu)') + pvdR(x0, 196, w, 10, 'url(#pnSi)') + pvdL(`M${x0} 52 V196 M${x0 + w} 52 V196`, { so: .3, dash: '3 4' });
            g += pvdTx(x0 + w / 2, 28, title, { a: 'middle', st: 'font-size:10.5px;font-weight:800;fill:var(--badge-fg);opacity:1' });
            g += body + pvdTx(x0 + w / 2, 228, cap1, { a: 'middle', st: 'font-size:10px;font-weight:600;opacity:.95' }) + pvdTx(x0 + w / 2, 242, cap2, { a: 'middle', st: 'font-size:9.5px;opacity:.75' });
            return g;
          };
          const gas = (x0, n) => Array.from({ length: n }, () => `<circle cx="${(x0 + 12 + rnd() * 146).toFixed(1)}" cy="${(62 + rnd() * 124).toFixed(1)}" r="2.6" fill="currentColor" opacity=".32"/>`).join('');
          if (s.id === 'p') {
            const A = 20, B = 210;
            o += mini(A, '낮은 압력', '곧게 날아와 에너지를 유지', '방향성 ↑ · 바닥에 유리', gas(A, 6) + pvdL(`M${A + 70} 52 L${A + 80} 196`, { c: '#f59e0b', sw: 2, so: 1 }) + `<circle cx="${A + 80}" cy="190" r="3.6" fill="#f59e0b"/>` + dgArrow(A + 78, 150, A + 79.5, 176));
            const zz = [[B + 70, 52], [B + 86, 80], [B + 62, 104], [B + 96, 126], [B + 74, 150], [B + 112, 170], [B + 100, 196]];
            o += mini(B, '높은 압력', '충돌이 잦아 방향이 흩어지고 에너지 손실', '막이 부드러워짐 · 바닥엔 불리', gas(B, 28) + pvdL('M' + zz.map(p => p.join(' ')).join(' L'), { c: '#f59e0b', sw: 2, so: 1 }) + zz.slice(1, -1).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.6" fill="none" stroke="#fb923c" stroke-width="1.4"/>`).join('') + `<circle cx="${B + 100}" cy="190" r="3.6" fill="#f59e0b"/>`);
          } else if (s.id === 'd') {
            const A = 20, B = 210, cone = (x0, gapY, ang, n, hot) => { let g = ''; for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : i / (n - 1) * 2 - 1; const sx = x0 + 85 + t * 70; g += pvdL(`M${sx.toFixed(1)} 52 L${x0 + 85} ${gapY}`, { c: '#f59e0b', sw: 1.4, so: Math.abs(t) * 70 / Math.max(1, gapY - 52) > Math.tan(ang * Math.PI / 180) ? .0 : .9, dash: '2 3' }); } return g; };
            const wafer = (x0, y) => pvdR(x0, y, 170, 10, 'url(#pnSi)') + `<rect x="${x0 + 75}" y="${y - 12}" width="20" height="12" class="dg-ox"/><rect x="${x0 + 82}" y="${y - 14}" width="6" height="2" fill="none"/>`;
            // 짧은 거리
            let g1 = pvdR(A, 40, 170, 12, 'url(#pnCu)') + wafer(A, 150) + pvdTx(A + 85, 28, '짧은 거리', { a: 'middle', st: 'font-size:10.5px;font-weight:800;fill:var(--badge-fg);opacity:1' });
            [-70, -35, 0, 35, 70].forEach(dx => { g1 += pvdL(`M${A + 85 + dx} 52 L${A + 85} 140`, { c: '#f59e0b', sw: 1.5, so: .95, dash: '2 3' }); });
            g1 += pvdTx(A + 85, 190, '넓은 각도로 도달', { a: 'middle', st: 'font-size:10px;font-weight:600;opacity:.95' }) + pvdTx(A + 85, 204, '증착 속도 ↑ · 바닥엔 불리', { a: 'middle', st: 'font-size:9.5px;opacity:.75' });
            // 긴 거리
            let g2 = pvdR(B, 40, 170, 12, 'url(#pnCu)') + wafer(B, 232) + pvdTx(B + 85, 28, '긴 거리 (롱 스로)', { a: 'middle', st: 'font-size:10.5px;font-weight:800;fill:var(--badge-fg);opacity:1' });
            [-70, -35, 0, 35, 70].forEach(dx => { g2 += pvdL(`M${B + 85 + dx} 52 L${B + 85} 222`, { c: '#f59e0b', sw: 1.5, so: .95, dash: '2 3' }); });
            g2 += pvdTx(B + 85, 262, '수직에 가까운 원자만 도달', { a: 'middle', st: 'font-size:10px;font-weight:600;opacity:.95' }) + pvdTx(B + 85, 276, '바닥에 유리 · 증착 속도 ↓', { a: 'middle', st: 'font-size:9.5px;opacity:.75' });
            o += g1 + g2;
            return dgSvg('공정 변수: ' + s.label, o, '0 8 400 276');
          } else {
            const ax = (x0, ttl, xl, yl) => pvdTx(x0 + 80, 28, ttl, { a: 'middle', st: 'font-size:10.5px;font-weight:800;fill:var(--badge-fg);opacity:1' }) + pvdL(`M${x0} 52 V190 H${x0 + 160}`, { so: .7, sw: 1.4 }) + pvdTx(x0 + 160, 206, xl, { a: 'end', st: 'font-size:9.5px;opacity:.8' }) + pvdTx(x0 - 4, 48, yl, { a: 'start', st: 'font-size:9.5px;opacity:.8' });
            let g = ax(24, 'DC 파워 ↑', '파워 →', '↑ 속도 · 온도');
            g += pvdL('M24 190 L184 70', { c: '#f59e0b', sw: 2.4, so: 1 }) + pvdTx(150, 82, '증착 속도', { a: 'end', st: 'font-size:9.5px;fill:#f59e0b;opacity:1;font-weight:700' });
            g += pvdL('M24 178 C80 176 130 160 184 128', { c: '#f87171', sw: 2, so: 1, dash: '4 3' }) + pvdTx(180, 148, '웨이퍼 온도', { a: 'end', st: 'font-size:9.5px;fill:#f87171;opacity:1;font-weight:700' });
            g += ax(214, 'RF 바이어스 ↑', '바이어스 →', '↑ 바닥 증착');
            g += pvdL('M214 180 C250 160 290 88 330 76 C354 70 366 92 374 128', { c: '#60a5fa', sw: 2.4, so: 1 }) + pvdTx(262, 70, '바닥 증착 개선', { a: 'start', st: 'font-size:9.5px;fill:#60a5fa;opacity:1;font-weight:700' })
              + pvdL('M356 96 L356 190', { so: .35, sw: 1, dash: '3 3' }) + pvdTx(372, 160, '손상 · 가열', { a: 'end', st: 'font-size:9.5px;fill:#f87171;opacity:1;font-weight:700' });
            g += pvdTx(200, 232, '두 그래프는 경향을 보이는 개념도 (눈금 없음)', { a: 'middle', st: 'font-size:9.5px;opacity:.65' });
            o += g;
            return dgSvg('공정 변수: ' + s.label, o, '0 8 400 244');
          }
          return dgSvg('공정 변수: ' + s.label, o, '0 8 400 252');
        }
      },
      // ---------- 8. 두께 균일도 (웨이퍼 맵) ----------
      'pvd-uniformity': {
        title: '웨이퍼 두께 맵과 균일도',
        wide: true,
        states: [
          { id: 'ok', label: '균일', k: 'ok', desc: '웨이퍼의 49곳을 재서 두께를 색으로 나타낸 맵이다. 색이 거의 한 가지이고 곡선이 평평하면 균일한 막이다. 균일도는 측정값의 표준편차를 평균으로 나눈 비율(1σ %)로 적는다. 그림의 값은 예시 분포에서 계산한 값이다.' },
          { id: 'cen', label: '중앙이 두꺼움', k: 'cen', desc: '중앙이 두껍고 가장자리가 얇은 형태는 타깃–웨이퍼 거리가 가까울 때나 자석 위치가 중앙 쪽에 치우칠 때 흔하다. 거리나 자석 궤적을 조정해 맞춘다.' },
          { id: 'edge', label: '가장자리가 두꺼움', k: 'edge', desc: '가장자리가 두꺼우면 자석이 바깥쪽에 오래 머물거나 압력이 낮아 원자가 가장자리로 많이 도달하는 경우를 의심한다. 가장자리 두께는 칩 수율에 직접 영향을 준다.' },
          { id: 'tilt', label: '한쪽으로 쏠림', k: 'tilt', desc: '한쪽이 두껍고 반대쪽이 얇은 비대칭은 타깃이 기울었거나 챔버 부품(쉴드, 가스 입구)이 한쪽으로 치우친 경우가 많다. 원인이 장비 쪽에 있으므로 레시피로 고치기보다 점검이 먼저다.' },
        ],
        svg(s) {
          const R = 92, cx = 108, cy = 128, k = s.k;
          const f = (x, y) => { const r = Math.hypot(x, y) / R; if (k === 'ok') return 1 + .006 * Math.cos(x / 22) * Math.sin(y / 17); if (k === 'cen') return 1 + .06 * (1 - r * r) - .02; if (k === 'edge') return 1 + .07 * Math.pow(r, 3) - .02; return 1 + .055 * (x / R) + .004 * Math.sin(y / 20); };
          const pts = [[0, 0]]; [[.33, 8], [.66, 16], [.96, 24]].forEach(([rr, n]) => { for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI + (rr < .5 ? .2 : 0); pts.push([R * rr * Math.cos(a), R * rr * Math.sin(a)]); } });
          const vals = pts.map(([x, y]) => f(x, y)), mean = vals.reduce((a, b) => a + b, 0) / vals.length, sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) / mean * 100;
          const col = (v) => { const d = Math.max(-1, Math.min(1, (v / mean - 1) / .045)); return d >= 0 ? `rgb(${Math.round(226 + (245 - 226) * d)},${Math.round(232 + (158 - 232) * d)},${Math.round(240 + (11 - 240) * d)})` : `rgb(${Math.round(226 + (59 - 226) * -d)},${Math.round(232 + (130 - 232) * -d)},${Math.round(240 + (246 - 240) * -d)})`; };
          let o = pvdDefs('pu');
          o += `<circle cx="${cx}" cy="${cy}" r="${R + 6}" style="fill:url(#puSi);stroke:currentColor;stroke-opacity:.6;stroke-width:1.4"/><path d="M${cx - 14} ${cy + R + 6} h28" style="stroke:var(--tbl-bg);stroke-width:5"/>`;
          o += pts.map(([x, y], i) => `<circle cx="${(cx + x).toFixed(1)}" cy="${(cy + y).toFixed(1)}" r="6" style="fill:${col(vals[i])};stroke:currentColor;stroke-opacity:.35;stroke-width:.8"/>`).join('');
          o += pvdTx(cx, 244, '49점 두께 맵', { a: 'middle', st: 'font-size:10px;opacity:.8' });
          // 프로파일 그래프
          const gx = 236, gw = 150, gy = 70, gh = 110, ymin = .92, ymax = 1.08;
          const Y = (v) => gy + gh - (v - ymin) / (ymax - ymin) * gh;
          o += pvdL(`M${gx} ${gy} V${gy + gh} H${gx + gw}`, { so: .7, sw: 1.4 }) + pvdL(`M${gx} ${Y(1)} H${gx + gw}`, { so: .3, sw: 1, dash: '3 3' });
          let d = ''; for (let i = 0; i <= 60; i++) { const x = -R + (2 * R) * i / 60, v = f(x, 0); d += (i ? 'L' : 'M') + (gx + gw * i / 60).toFixed(1) + ' ' + Y(v).toFixed(1) + ' '; }
          o += pvdL(d, { c: '#f59e0b', sw: 2.4, so: 1 });
          o += pvdTx(gx + gw / 2, 56, '지름 방향 두께', { a: 'middle', st: 'font-size:10px;font-weight:700;opacity:.95' }) + pvdTx(gx - 4, Y(1) + 3, '평균', { a: 'end', st: 'font-size:9px;opacity:.7' }) + pvdTx(gx, gy + gh + 14, '왼쪽 끝', { a: 'start', st: 'font-size:9px;opacity:.7' }) + pvdTx(gx + gw, gy + gh + 14, '오른쪽 끝', { a: 'end', st: 'font-size:9px;opacity:.7' });
          o += pvdTx(gx + gw / 2, 214, '균일도 (1σ) ≈ ' + sd.toFixed(1) + ' %', { a: 'middle', st: 'font-size:12px;font-weight:800;fill:var(--badge-fg);opacity:1' }) + pvdTx(gx + gw / 2, 230, '값이 작을수록 균일', { a: 'middle', st: 'font-size:9.5px;opacity:.7' });
          // 범례
          o += [0, 1, 2, 3, 4].map(i => `<rect x="${250 + i * 14}" y="14" width="14" height="8" style="fill:${col(mean * (.955 + i * .0225))}"/>`).join('') + pvdTx(250, 34, '얇음', { st: 'font-size:9px;opacity:.7' }) + pvdTx(320, 34, '두꺼움', { a: 'end', st: 'font-size:9px;opacity:.7' });
          return dgSvg('두께 균일도: ' + s.label, o, '0 6 400 250');
        }
      },
      // ---------- 9. 불량 단면 모음 (트러블슈팅) ----------
      'pvd-defects': {
        title: '대표 불량의 단면',
        wide: true,
        states: [
          { id: 'void', label: '입구 막힘·보이드', desc: '입구 모서리의 오버행이 자라 서로 맞닿으면 입구가 막히고 안쪽에 빈 공간이 남는다. 이후 도금이나 CVD가 안쪽을 채우지 못해 저항이 커지고 신뢰성이 떨어진다. 원인은 방향성 부족이나 구멍 대비 지나치게 두꺼운 증착이다.' },
          { id: 'thin', label: '바닥 막 부족', desc: '옆면은 덮였는데 바닥에는 막이 거의 없는 경우다. 바닥의 산화막이 남은 채 다음 층이 올라가거나, 씨앗이 끊겨 도금이 안 붙는다. 접촉 저항이 커지는 것이 첫 증상이다.' },
          { id: 'part', label: '파티클', desc: '챔버 쉴드에 쌓인 막이 두꺼워져 갈라지면 조각이 떨어져 웨이퍼 위에 앉는다. 입자가 배선 사이에 끼면 단락이나 패턴 불량이 된다. 쉴드 교체 주기와 사전 가동(번인)으로 관리한다.' },
          { id: 'peel', label: '박리·휨', desc: '막 안의 응력이 너무 크면 가장자리부터 들뜨고 벗겨지거나 웨이퍼가 휜다. 압력, 파워, 바이어스에 따라 응력이 압축에서 인장까지 바뀌고, 하부 표면 청결과 접착층(Ti 등)도 영향을 준다.' },
        ],
        svg(s) {
          let o = pvdDefs('pd');
          const via = (X0, X1, T, B) => `<rect class="dg-ox" x="40" y="${T}" width="${X0 - 40}" height="${B - T}"/><rect class="dg-ox" x="${X1}" y="${T}" width="${360 - X1}" height="${B - T}"/><rect class="dg-si" x="40" y="${B}" width="320" height="24"/>`;
          if (s.id === 'void') {
            const X0 = 160, X1 = 240, T = 80, B = 200;
            o += via(X0, X1, T, B);
            o += `<path d="M40 ${T} L${X0} ${T} L${X0} ${B} L${X1} ${B} L${X1} ${T} L360 ${T} L360 ${T - 22} L${X1 - 8} ${T - 22} Q200 ${T - 10} ${X0 + 8} ${T - 22} L40 ${T - 22} Z" style="fill:url(#pdCu);stroke:currentColor;stroke-opacity:.6"/>`;
            o += `<path d="M${X0 + 12} ${B - 26} L${X0 + 12} ${T + 30} Q200 ${T - 4} ${X1 - 12} ${T + 30} L${X1 - 12} ${B - 26} Z" style="fill:var(--tbl-bg);stroke:#f87171;stroke-width:1.6;stroke-dasharray:4 3"/>` + pvdTx(200, 150, '보이드', { a: 'middle', st: 'font-size:11px;font-weight:800;fill:#f87171;opacity:1' });
            o += pvdTx(290, T - 34, '입구가 닫힘', { st: 'font-size:10px;font-weight:700;opacity:.95' }) + pvdL(`M288 ${T - 36} L206 ${T - 14}`, { so: .7, sw: 1 });
            return dgSvg('불량 단면: ' + s.label, o, '0 36 400 214');
          }
          if (s.id === 'thin') {
            const X0 = 160, X1 = 240, T = 80, B = 200;
            o += via(X0, X1, T, B);
            o += `<polygon points="40,${T} ${X0},${T} ${X0},${B} ${X0 + 4},${B} ${X0 + 5},${B - 4} ${X0 + 8},${T + 20} ${X0 + 14},${T - 8} ${X0 + 20},${T - 16} 40,${T - 16}" style="fill:url(#pdCu);stroke:currentColor;stroke-opacity:.6"/><polygon points="360,${T} ${X1},${T} ${X1},${B} ${X1 - 4},${B} ${X1 - 5},${B - 4} ${X1 - 8},${T + 20} ${X1 - 14},${T - 8} ${X1 - 20},${T - 16} 360,${T - 16}" style="fill:url(#pdCu);stroke:currentColor;stroke-opacity:.6"/>`;
            o += pvdR(X0 + 4, B - 3, 72, 3, 'url(#pdCu)', { sw: .5 });
            o += pvdTx(256, 140, '바닥에 막이 거의 없음', { st: 'font-size:10.5px;font-weight:800;fill:#f87171;opacity:1' }) + dgArrow(254, 148, 214, B - 8) + pvdTx(200, B + 40, '접촉 저항 ↑ · 씨앗 끊김', { a: 'middle', st: 'font-size:10px;opacity:.85' });
            return dgSvg('불량 단면: ' + s.label, o, '0 36 400 214');
          }
          if (s.id === 'part') {
            o += pvdR(40, 190, 320, 24, 'url(#pdSi)') + pvdR(40, 184, 320, 6, 'url(#pdCu)', { sw: .6 });
            o += [[60, 122], [112, 122], [190, 122], [236, 122], [300, 122]].map(([x, y]) => `<rect x="${x}" y="${y}" width="22" height="62" style="fill:#f59e0b;fill-opacity:.35;stroke:#f59e0b;stroke-opacity:.7"/>`).join('') + pvdTx(200, 232, '배선 (막으로 덮이기 전)', { a: 'middle', st: 'font-size:9.5px;opacity:.7' });
            o += pvdR(300, 20, 14, 70, 'url(#pdMt)') + [[304, 96, 12], [292, 112, 9]].map(([x, y, r]) => `<polygon points="${x},${y} ${x + r},${y - 3} ${x + r + 3},${y + 6} ${x + 3},${y + 9}" style="fill:#f59e0b;fill-opacity:.85;stroke:currentColor;stroke-opacity:.6"/>`).join('') + pvdTx(330, 40, '쉴드', { st: 'font-size:10px;opacity:.9;font-weight:600' }) + pvdTx(330, 52, '(막이 갈라짐)', { st: 'font-size:9px;opacity:.75' });
            o += dgFlow('M296 100 C270 120 246 140 240 148') + `<polygon points="214,150 232,146 238,162 220,168" style="fill:#f59e0b;stroke:#f87171;stroke-width:2"/>` + pvdTx(40, 78, '떨어진 조각(파티클)이 배선 사이에 끼면 단락', { st: 'font-size:10.5px;font-weight:800;fill:#f87171;opacity:1' }) + pvdL('M200 84 L226 146', { c: '#f87171', sw: 1, so: .8 });
            o += pvdL('M222 130 L222 142', { so: 0 });
            return dgSvg('불량 단면: ' + s.label, o, '0 10 400 236');
          }
          o += `<path d="M60 170 H320" style="stroke:none"/>`;
          o += pvdR(50, 170, 300, 26, 'url(#pdSi)') + `<path d="M50 170 H236 C262 170 282 150 312 130 L330 120 L330 112 C296 124 268 164 236 164 H50 Z" style="fill:url(#pdCu);stroke:currentColor;stroke-opacity:.6"/>`;
          o += pvdTx(308, 104, '들뜬 막', { a: 'middle', st: 'font-size:10.5px;font-weight:800;fill:#f87171;opacity:1' }) + dgArrow(250, 120, 264, 142);
          o += dgArrow(100, 150, 140, 150) + dgArrow(180, 150, 140, 150) + pvdTx(140, 142, '압축 응력', { a: 'middle', st: 'font-size:10px;opacity:.9;font-weight:700' });
          o += pvdTx(200, 226, '막 속 응력이 접착력보다 크면 가장자리부터 벗겨진다', { a: 'middle', st: 'font-size:10px;opacity:.85' });
          return dgSvg('불량 단면: ' + s.label, o, '0 80 400 168');
        }
      },
    });

    // ===== 플라즈마 식각 장비 사용 가이드 전용 그림: 챔버 단면(ICP·CCP)·원리·칩 단면·측벽 보호·불량 단면·클러스터 =====
    // ===== 플라즈마 식각 장비 가이드용 그림 (pvd_diagrams.js 의 pvd* 도우미를 같이 쓴다) =====
    const etDefs = (p) => pvdDefs(p) + `<defs>
      <linearGradient id="${p}Ox" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5eead4" stop-opacity=".55"/><stop offset="1" stop-color="#2dd4bf" stop-opacity=".4"/></linearGradient>
      <linearGradient id="${p}Pr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#64748b" stop-opacity=".9"/><stop offset="1" stop-color="#475569" stop-opacity=".9"/></linearGradient>
      <linearGradient id="${p}Ce" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fde68a" stop-opacity=".55"/><stop offset=".5" stop-color="#fef3c7" stop-opacity=".6"/><stop offset="1" stop-color="#fde68a" stop-opacity=".55"/></linearGradient>
    </defs>`;

    Object.assign(DIAGRAMS, {
      // ---------- 1. ICP 식각 챔버 단면 ----------
      'etch-chamber': {
        title: '플라즈마 식각 챔버 단면 (ICP)',
        wide: true,
        states: [
          { id: 'all', label: '전체 단면', desc: '위쪽 세라믹 창 바깥에 코일이 있고, 코일의 RF 전력이 창을 통해 챔버 안 가스를 플라즈마로 바꾼다. 아래쪽에는 웨이퍼를 잡는 정전척이 있고, 척에는 따로 바이어스 RF가 걸려 이온을 웨이퍼 쪽으로 끌어당긴다. 플라즈마를 만드는 전력(소스)과 이온을 끄는 전력(바이어스)이 나뉘어 있다는 점이 ICP 구조의 핵심이다.' },
          { id: 'src', label: '소스·플라즈마', focus: ['coil', 'win', 'pl'], desc: '코일에 RF 전류가 흐르면 변하는 자기장이 생기고, 이 자기장이 창 아래 가스 속에 원형 유도 전기장을 만든다. 전자가 이 전기장에서 에너지를 받아 가스 분자를 쪼개고 이온화해 플라즈마를 유지한다. 소스 전력을 올리면 이온과 라디칼이 같이 늘어난다.' },
          { id: 'gas', label: '가스·진공', focus: ['gas', 'vac'], desc: '질량 유량 조절기(MFC)가 정해진 가스를 인젝터로 넣고, 아래쪽 스로틀 밸브와 터보 분자 펌프가 압력을 맞추며 반응 부산물을 뽑아낸다. 압력은 가스를 넣는 양과 펌프로 빼는 양의 균형으로 정해진다. 부산물이 빨리 빠지지 못하면 다시 웨이퍼에 달라붙어 식각이 달라진다.' },
          { id: 'wafer', label: '웨이퍼 스테이지', focus: ['wf', 'bias'], desc: '웨이퍼는 정전척 위에 정전기력으로 붙고, 척 안의 온도 조절 유로와 후면 헬륨이 웨이퍼 온도를 맞춘다. 웨이퍼 둘레의 포커스 링은 가장자리의 플라즈마와 전기장을 중앙과 이어 주어 가장자리 식각을 고르게 한다. 포커스 링은 식각되며 닳는 소모품이다.' },
          { id: 'ctrl', label: '벽·감시', focus: ['wall', 'oes', 'mv'], desc: '챔버 벽 안쪽에는 라이너(보호판)가 있어 폴리머 막이 쌓이는 것을 대신 받는다. 창 하나로는 발광 분광(OES) 장치가 플라즈마의 빛을 읽어 종점을 찾고, 슬릿 밸브는 이송 챔버와 이어지는 웨이퍼 통로다.' },
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          const acc = 'var(--hl-accent)';
          let o = etDefs('ec');
          // 플라즈마 (뒤)
          o += pvdG(f, ['pl'], `<ellipse cx="190" cy="132" rx="78" ry="52" fill="url(#ecPl)"/><ellipse cx="190" cy="100" rx="60" ry="10" fill="url(#ecPl2)"/>`);
          // 벽 + 바닥 프레임
          o += pvdG(f, ['wall'], pvdR(96, 66, 12, 252, 'url(#ecMt)') + pvdR(272, 66, 12, 148, 'url(#ecMt)') + pvdR(272, 246, 12, 72, 'url(#ecMt)')
            + pvdR(108, 72, 5, 140, 'url(#ecCe)', { sw: .8, so: .45 }) + pvdR(267, 72, 5, 140, 'url(#ecCe)', { sw: .8, so: .45 })
            + pvdR(96, 318, 28, 10, 'url(#ecMt)') + pvdR(176, 318, 108, 10, 'url(#ecMt)'));
          // 세라믹 창 + 덮개
          o += pvdG(f, ['win'], pvdR(96, 56, 188, 10, 'url(#ecCe)', { so: .8 }) + pvdR(92, 44, 196, 12, 'url(#ecMt)', { so: .5 }) + pvdR(92, 44, 14, 22, 'url(#ecMt)', { so: .5 }) + pvdR(274, 44, 14, 22, 'url(#ecMt)', { so: .5 }));
          // 코일(단면 원)
          const coils = [118, 142, 166, 190, 214, 238, 262];
          o += pvdG(f, ['coil'], coils.map(x => `<circle cx="${x}" cy="32" r="6.5" fill="rgba(245,158,11,.2)" stroke="#f59e0b" stroke-width="1.6"/>`).join('') + pvdL('M105 22 H275', { c: '#f59e0b', sw: 1, so: .35, dash: '2 3' })
            + (hot(['coil']) ? pvdL('M168 28 q8 -9 16 0 M184 28 l-5 -2 M196 28 q8 -9 16 0', { c: acc, sw: 1.4, so: .9 }) : ''));
          // 가스: 인젝터(중앙) + 사이드
          o += pvdG(f, ['gas'], pvdR(184, 66, 12, 8, 'url(#ecMt)') + pvdL('M190 74 V86', { sw: 2.2, so: .7 }) + `<path d="M190 86 l-6 6 M190 86 l6 6" style="stroke:currentColor;stroke-opacity:.6;stroke-width:1.5;fill:none"/>`
            + pvdR(30, 124, 46, 24, 'rgba(56,189,248,.18)', { rx: 4, so: .8 }) + pvdTx(53, 140, 'MFC', { a: 'middle', st: 'font-size:10px;font-weight:700' }) + pvdTx(53, 117, '식각 가스', { a: 'middle', st: 'font-size:10px;opacity:.85' })
            + pvdL('M76 136 H96', { c: '#38bdf8', sw: 3.2, so: .6 }) + pvdL('M96 136 H113', { c: '#38bdf8', sw: 3.2, so: .6 }) + `<circle cx="116" cy="136" r="3" fill="#38bdf8"/>`
            + (hot(['gas']) ? dgFlow('M80 136 H112') + dgFlow('M190 76 V96') : dgArrow(88, 136, 108, 136)));
          // 이온·전자·라디칼 (플라즈마 안)
          const pl = hot(['pl']);
          o += pvdG(f, ['pl'], [[140, 120], [236, 118], [160, 150], [220, 152], [190, 128]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="rgba(248,113,113,.15)" stroke="#f87171" stroke-width="1.5"/>`).join('')
            + [[150, 104], [214, 106], [176, 142], [240, 140], [132, 140]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2" fill="#60a5fa"/>`).join('')
            + [[170, 118], [206, 138], [252, 124]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#f59e0b"/>`).join('')
            + [[150, 160, 150, 196], [190, 168, 190, 196], [230, 160, 230, 196]].map(([a, b, c, d]) => (pl ? dgFlow(`M${a} ${b} L${c} ${d}`) : dgArrow(a, b, c, d))).join(''));
          // 웨이퍼 · 포커스 링 · ESC · 스템
          o += pvdG(f, ['wf'], pvdR(116, 202, 14, 10, '#e2e8f0', { so: .6 }) + pvdR(250, 202, 14, 10, '#e2e8f0', { so: .6 })
            + pvdR(130, 206, 120, 5, 'url(#ecSi)') + pvdR(130, 211, 120, 8, 'url(#ecMt)', { so: .6 })
            + pvdR(124, 219, 132, 38, 'url(#ecMt)') + pvdL('M132 244 h10 q5 -8 10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0', { c: '#38bdf8', so: .85, sw: 1.4 })
            + pvdTx(190, 232, '정전척 (ESC)', { a: 'middle', st: 'font-size:9.5px;opacity:.9' })
            + `<circle cx="150" cy="215" r="1.3" fill="#fbbf24"/><circle cx="190" cy="215" r="1.3" fill="#fbbf24"/><circle cx="230" cy="215" r="1.3" fill="#fbbf24"/>`
            + pvdR(180, 257, 20, 61, 'url(#ecMt)') + [0, 1, 2, 3, 4].map(i => pvdL(`M174 ${270 + i * 8} H206`, { so: .55 })).join(''));
          o += pvdG(f, ['bias'], pvdL('M190 318 V362', { c: '#a78bfa', sw: 1.6, so: .9 }) + pvdR(198, 350, 84, 24, 'rgba(167,139,250,.18)', { rx: 4, so: .8 }) + pvdTx(240, 366, '바이어스 RF', { a: 'middle', st: 'font-size:10px;font-weight:600' }));
          // 진공: 스로틀 밸브 + 터보 펌프 (척 아래쪽 왼쪽 배기구)
          o += pvdG(f, ['vac'], pvdR(126, 318, 48, 5, 'url(#ecMt)') + pvdR(122, 323, 56, 7, '#94a3b8', { so: .5, rx: 2 }) + pvdR(106, 330, 88, 64, 'url(#ecMt)', { rx: 8 })
            + `<circle cx="150" cy="362" r="22" style="fill:none;stroke:currentColor;stroke-opacity:.6;stroke-width:1.1"/>` + [0, 1, 2, 3].map(i => { const a = i * Math.PI / 4; return pvdL(`M${150 - 20 * Math.cos(a)} ${362 - 20 * Math.sin(a)} L${150 + 20 * Math.cos(a)} ${362 + 20 * Math.sin(a)}`, { so: .55 }); }).join('')
            + pvdR(130, 394, 40, 18, 'url(#ecMt)', { rx: 4 }) + pvdTx(150, 424, '→ 드라이 펌프', { a: 'middle', st: 'font-size:9.5px;opacity:.75' })
            + (hot(['vac']) ? dgFlow('M118 214 V296 Q118 312 142 326') : ''));
          // OES 창 + 이송 챔버
          o += pvdG(f, ['oes'], pvdR(284, 118, 10, 20, 'url(#ecCe)', { so: .8 }) + pvdL('M294 128 H316', { c: '#2dd4bf', sw: 1.4, so: .9 }) + pvdR(316, 114, 50, 28, 'rgba(45,212,191,.18)', { rx: 4, so: .8 }) + pvdTx(341, 126, 'OES', { a: 'middle', st: 'font-size:10px;font-weight:700' }) + pvdTx(341, 137, '발광 분광', { a: 'middle', st: 'font-size:8.5px;opacity:.85' }));
          o += pvdG(f, ['mv'], pvdR(312, 200, 84, 84, 'rgba(45,212,191,.07)', { rx: 8, dash: '3 4', so: .5 }) + pvdTx(354, 214, '이송 챔버', { a: 'middle', st: 'opacity:.7;font-size:9.5px' })
            + pvdR(284, 246, 8, 26, 'url(#ecMt)') + pvdL('M360 262 L298 236', { sw: 2.2, so: .7 }) + `<circle cx="360" cy="262" r="6" style="fill:url(#ecMt);stroke:currentColor;stroke-opacity:.7"/>`
            + pvdR(282, 232, 50, 3, 'url(#ecSi)', { sw: .8 }));
          // 번호
          o += pvdCall(f, ['coil', 'win'], '1', '#f59e0b', 330, 36, 342, 40, ['코일·창'], 280, 36);
          o += pvdG(f, ['gas'], pvdNum(18, 136, '2', '#38bdf8'));
          o += pvdCall(f, ['pl'], '3', '#a78bfa', 18, 96, 30, 88, ['플라즈마'], 150, 108);
          o += pvdCall(f, ['wall'], '4', '#94a3b8', 330, 86, 342, 90, ['벽·라이너'], 284, 86);
          o += pvdCall(f, ['wf'], '5', '#f59e0b', 18, 232, 30, 224, ['정전척'], 124, 232);
          o += pvdCall(f, ['wf'], '6', '#fb7185', 330, 186, 342, 190, ['포커스 링'], 262, 206);
          o += pvdG(f, ['bias'], pvdNum(300, 362, '7', '#a78bfa'));
          o += pvdCall(f, ['vac'], '8', '#2dd4bf', 18, 366, 30, 352, ['터보 펌프', '· 스로틀'], 106, 366);
          o += pvdG(f, ['oes'], pvdNum(305, 128, '9', '#34d399')) + pvdG(f, ['mv'], pvdTx(300, 296, '슬릿 밸브', { a: 'start', st: 'font-size:9.5px;opacity:.85' }));
          return dgSvg('플라즈마 식각 챔버 단면: ' + s.label, o, '0 0 400 440');
        }
      },

      // ---------- 2. 식각 한 단계 (마스크·막·아래막) ----------
      'etch-principle': {
        title: '식각: 마스크 모양대로 막을 깎아 내기',
        wide: true,
        states: [
          { id: 'before', label: '① 준비', desc: '포토 공정이 감광막(PR)에 패턴을 만들어 두었다. 감광막이 덮인 곳은 보호되고 열린 곳만 아래 막이 드러난다. 식각은 이 열린 곳의 막만 깎아 내어 패턴을 막에 옮기는 공정이다.' },
          { id: 'etch', label: '② 식각 중', focus: ['ion'], desc: '플라즈마의 이온과 라디칼이 열린 부분의 막을 아래로 깎아 간다. 감광막도 조금씩 깎이지만 막보다 훨씬 느리게 깎여야 끝까지 버틴다. 이 속도 비율이 선택비다.' },
          { id: 'done', label: '③ 식각 끝', focus: ['done'], desc: '막이 끝까지 뚫려 아래 막이 드러난 상태다. 이때 멈추지 않고 계속 식각하면 아래 막이 깎인다. 그래서 종점을 찾아 멈추거나, 아래 막이 잘 안 깎이는 조건을 쓴다.' },
          { id: 'strip', label: '④ 마스크 제거', focus: ['strip'], desc: '남은 감광막은 산소 플라즈마(애싱)와 세정으로 벗겨 낸다. 이제 패턴이 막에 새겨졌고, 이 위에 다음 막을 입히거나 구멍을 채운다.' },
        ],
        svg(s) {
          const f = s.focus || null, id = s.id;
          const depth = id === 'before' ? 0 : id === 'etch' ? 34 : 60;
          const pr = id !== 'strip';
          let o = etDefs('ep');
          o += pvdR(40, 190, 320, 36, 'url(#epSi)') + pvdTx(48, 212, '아래 막 (실리콘 등)', { st: 'font-size:10px;font-weight:600;opacity:.9' });
          // 막: 열린 부분(170~230)만 깊이 depth 만큼 비움
          o += `<polygon points="40,130 170,130 170,${130 + depth} 230,${130 + depth} 230,130 360,130 360,190 40,190" style="fill:url(#epOx);stroke:currentColor;stroke-opacity:.6;stroke-width:1.2"/>`;
          o += pvdTx(48, 168, '식각할 막 (산화막 등)', { st: 'font-size:10px;font-weight:600;opacity:.9' });
          if (pr) {
            const th = id === 'etch' ? 16 : id === 'done' ? 12 : 20, top = 130 - th;
            o += `<polygon points="40,${top} 170,${top} 170,130 40,130" style="fill:url(#epPr);stroke:currentColor;stroke-opacity:.6;stroke-width:1.2"/><polygon points="230,${top} 360,${top} 360,130 230,130" style="fill:url(#epPr);stroke:currentColor;stroke-opacity:.6;stroke-width:1.2"/>`;
            o += pvdTx(366, 122, '마스크', { st: 'font-size:10px;font-weight:700' }) + pvdTx(366, 134, '(감광막)', { st: 'font-size:9.5px;opacity:.85' });
          } else {
            o += pvdL('M40 130 H360', { dash: '3 3', so: .3 }) + pvdTx(366, 134, '마스크 없음', { st: 'font-size:9.5px;opacity:.7' });
            o += dgFlow('M80 104 q40 -28 80 0', false) + pvdTx(120, 78, '애싱 · 세정으로 제거', { a: 'middle', st: 'font-size:10px;font-weight:600' });
          }
          if (id === 'etch') {
            const ions = [182, 200, 218];
            o += pvdG(f, ['ion'], `<ellipse cx="200" cy="82" rx="86" ry="26" fill="url(#epPl)"/>` + pvdTx(200, 62, '플라즈마', { a: 'middle', st: 'font-size:10px;font-weight:700;fill:#a78bfa;opacity:1' })
              + ions.map(x => `<circle cx="${x}" cy="88" r="4.4" fill="rgba(248,113,113,.15)" stroke="#f87171" stroke-width="1.6"/>` + dgFlow(`M${x} 94 V${120 + depth - 14}`)).join('')
              + [[150, 90], [250, 92], [162, 74], [238, 72]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.8" fill="#f59e0b"/>`).join(''));
            o += pvdTx(300, 90, '● 라디칼', { st: 'font-size:9.5px;fill:#f59e0b;opacity:1;font-weight:700' }) + pvdTx(300, 104, '○ 이온', { st: 'font-size:9.5px;fill:#f87171;opacity:1;font-weight:700' });
          }
          if (id === 'done') o += pvdG(f, ['done'], dgArrow(200, 100, 200, 186) + pvdTx(214, 98, '막이 끝까지 뚫림', { st: 'font-size:10px;font-weight:700' }));
          if (id === 'strip') o += pvdG(f, ['strip'], pvdTx(200, 112, '패턴이 막에 새겨짐', { a: 'middle', st: 'font-size:10px;font-weight:700' }) + dgArrow(200, 116, 200, 128));
          return dgSvg('식각 한 단계: ' + s.label, o, '0 40 420 200');
        }
      },
      // ---------- 3. 칩 속에서 식각이 하는 일 ----------
      'etch-where': {
        title: '칩 단면에서 식각이 만드는 모양',
        wide: true,
        states: [
          { id: 'all', label: '전체', desc: '칩은 한 번 식각하고 끝나지 않는다. 트랜지스터를 만드는 아래층부터 배선을 올리는 위층까지, 층마다 수십 번 식각이 반복된다. 그림은 칩 단면에서 식각으로 모양을 만드는 대표 자리다.' },
          { id: 'front', label: '트랜지스터층', focus: ['sti', 'gate'], desc: '① 소자 사이를 나누는 얕은 트렌치(STI)를 실리콘에 판다. ② 게이트는 폴리실리콘이나 금속 막을 게이트 모양으로 깎아 만든다. 폭이 곧 트랜지스터 성능이라 폭 균일도가 아주 중요하다.' },
          { id: 'back', label: '접점·배선층', focus: ['ct', 'via'], desc: '③ 층 사이를 잇는 콘택 홀은 두꺼운 산화막에 깊고 좁은 구멍을 뚫는다. ④ 구리 배선은 산화막에 홈(트렌치)과 비아 구멍을 파고 구리를 채우는 다마신 방식으로 만든다. 모두 산화막을 깎는 식각이다.' },
          { id: 'deep', label: '깊은 홀', focus: ['deep'], desc: '⑤ 3D 낸드의 채널 홀은 산화막과 질화막을 수십~백 층 넘게 쌓은 뒤 한 번에 뚫는 구멍이다. 폭 대비 깊이(종횡비)가 수십 대 1이라 식각 장비에서 가장 까다로운 공정으로 꼽힌다.' },
        ],
        svg(s) {
          const f = s.focus || null, ON = (g) => pvdOn(f, g), acc = 'var(--hl-accent)';
          const ring = (g, d) => pvdG(f, g, pvdL(d, { c: acc, sw: 1.8, so: 1, dash: '4 3' }));
          let o = etDefs('ew');
          // 칩 영역
          o += pvdG(f, ['base'], pvdR(10, 200, 262, 50, 'url(#ewSi)') + pvdR(10, 64, 262, 136, 'rgba(94,234,212,.14)', { so: .4 }) + pvdTx(20, 241, '실리콘 기판', { st: 'font-size:10px;font-weight:600' }));
          o += pvdG(f, ['sti', 'base'], `<polygon points="28,200 56,200 54,214 30,214" style="fill:url(#ewOx);stroke:currentColor;stroke-opacity:.7"/><polygon points="212,200 240,200 238,214 214,214" style="fill:url(#ewOx);stroke:currentColor;stroke-opacity:.7"/>`);
          o += pvdG(f, ['gate', 'base'], pvdR(84, 195, 34, 6, '#60a5fa', { so: .5 }) + pvdR(152, 195, 34, 6, '#60a5fa', { so: .5 }) + pvdR(122, 198, 26, 2, '#e2e8f0', { so: .6 }) + pvdR(122, 176, 26, 22, 'url(#ewPr)') + pvdR(118, 178, 4, 20, 'url(#ewOx)', { so: .5 }) + pvdR(148, 178, 4, 20, 'url(#ewOx)', { so: .5 }));
          o += pvdG(f, ['ct', 'base'], pvdR(96, 122, 10, 78, '#94a3b8', { so: .6 }) + pvdR(164, 122, 10, 78, '#94a3b8', { so: .6 }));
          o += pvdG(f, ['via', 'base'], pvdR(84, 106, 34, 16, 'url(#ewCu)', { so: .6 }) + pvdR(152, 106, 34, 16, 'url(#ewCu)', { so: .6 }) + pvdR(96, 84, 10, 22, '#94a3b8', { so: .6 }) + pvdR(80, 70, 108, 14, 'url(#ewCu)', { so: .6 }));
          // 강조(점선) 윤곽
          o += ring(['sti'], 'M26 198 H58 L56 216 H28 Z') + ring(['sti'], 'M210 198 H242 L240 216 H212 Z');
          o += ring(['gate'], 'M116 174 H154 V200 H116 Z');
          o += ring(['ct'], 'M94 120 H108 V200 H94 Z') + ring(['ct'], 'M162 120 H176 V200 H162 Z');
          o += ring(['via'], 'M82 104 H120 V124 H82 Z') + ring(['via'], 'M94 82 H108 V106 H94 Z');
          // 깊은 홀 패널(3D NAND)
          const L = [];
          for (let i = 0; i < 12; i++) L.push(pvdR(296, 70 + i * 15, 86, 15, i % 2 ? 'rgba(100,116,139,.55)' : 'url(#ewOx)', { so: .4, sw: .8 }));
          o += pvdG(f, ['deep', 'base'], L.join('') + pvdR(296, 250, 86, 8, 'url(#ewSi)') + pvdR(329, 70, 20, 180, 'rgba(15,23,42,.55)', { so: .9 }) + pvdL('M327 70 V250 M351 70 V250', { c: acc, sw: 1.8, so: .95, dash: '4 3' }));
          o += pvdG(f, ['deep', 'base'], pvdTx(339, 60, '3D 낸드', { a: 'middle', st: 'font-size:10px;font-weight:700' }) + pvdTx(339, 272, '채널 홀 (종횡비 수십:1)', { a: 'middle', st: 'font-size:9.5px;opacity:.85' }));
          // 번호
          o += pvdG(f, ['sti'], pvdNum(41, 228, '1', '#f59e0b') + pvdNum(225, 228, '1', '#f59e0b'));
          o += pvdG(f, ['gate'], pvdNum(135, 165, '2', '#fb7185'));
          o += pvdG(f, ['ct'], pvdNum(101, 140, '3', '#34d399') + pvdNum(169, 140, '3', '#34d399'));
          o += pvdG(f, ['via'], pvdNum(101, 98, '4', '#38bdf8') + pvdNum(140, 92, '4', '#38bdf8'));
          o += pvdG(f, ['deep'], pvdNum(339, 160, '5', '#a78bfa'));
          // 범례
          o += pvdG(f, ['base', 'sti', 'gate', 'ct', 'via', 'deep'], pvdTx(10, 270, '① STI 트렌치  ② 게이트  ③ 콘택 홀', { st: 'font-size:10px;font-weight:600;opacity:.9' }) + pvdTx(10, 284, '④ 배선 트렌치·비아  ⑤ 깊은 홀', { st: 'font-size:10px;font-weight:600;opacity:.9' }) + pvdTx(10, 56, '점선 = 식각으로 모양을 만드는 자리', { st: 'font-size:9.5px;opacity:.8;fill:' + acc }));
          return dgSvg('칩 단면에서 식각이 만드는 모양: ' + s.label, o, '0 44 400 248');
        }
      },
      // ---------- 4. 측벽 보호와 이방성 ----------
      'etch-sidewall': {
        title: '트렌치 속에서 일어나는 일 (이방성 식각)',
        wide: true,
        states: [
          { id: 'all', label: '전체', desc: '바이어스로 가속된 이온은 거의 수직으로 떨어져 바닥을 깎고, 중성 라디칼은 사방으로 날아다니며 화학 반응을 일으킨다. 옆벽에는 폴리머가 얇게 쌓여 옆으로 깎이는 것을 막는다. 바닥은 이온이 때려서 폴리머를 계속 벗겨 내므로 아래로만 깎여 간다.' },
          { id: 'ion', label: '이온', focus: ['ion', 'by'], desc: '이온은 전기장에 의해 웨이퍼 표면에 수직으로 입사한다. 바닥에서는 이온 충격이 결합을 끊어 라디칼과의 반응을 돕고(이온 보조 식각), 반응 부산물은 기체가 되어 위로 빠져나간다. 바이어스를 올리면 이온 에너지가 커져 수직성이 좋아진다.' },
          { id: 'rad', label: '라디칼', focus: ['rad', 'by'], desc: '라디칼은 전기장의 영향을 받지 않아 방향이 제각각이다. 옆벽에 닿으면 막과 반응해 옆으로 파먹는 원인이 된다. 압력이 높고 라디칼이 많을수록 옆 방향 식각이 늘어 단면이 경사지거나 불룩해진다.' },
          { id: 'poly', label: '측벽 보호', focus: ['poly'], desc: '가스에서 생긴 탄소 계열 폴리머가 옆벽에 얇게 쌓인다. 이온이 거의 닿지 않는 옆벽은 보호막이 유지되어 깎이지 않고, 이온이 때리는 바닥은 보호막이 벗겨져 식각이 진행된다. 폴리머가 너무 많으면 홀이 막히고, 너무 적으면 옆으로 파인다.' },
        ],
        svg(s) {
          const f = s.focus || null, ON = (g) => pvdOn(f, g);
          let o = etDefs('es');
          o += pvdR(40, 214, 320, 30, 'url(#esSi)') + pvdTx(48, 234, '아래 막', { st: 'font-size:10px;font-weight:600' });
          o += `<polygon points="40,110 160,110 160,214 40,214" style="fill:url(#esOx);stroke:currentColor;stroke-opacity:.6"/><polygon points="240,110 360,110 360,214 240,214" style="fill:url(#esOx);stroke:currentColor;stroke-opacity:.6"/>`;
          o += pvdR(40, 92, 120, 18, 'url(#esPr)') + pvdR(240, 92, 120, 18, 'url(#esPr)') + pvdTx(366, 104, '마스크', { st: 'font-size:10px;font-weight:700' });
          o += pvdTx(48, 160, '식각할 막', { st: 'font-size:10px;font-weight:600;opacity:.9' });
          // 측벽 폴리머
          o += pvdG(f, ['poly'], pvdR(156, 112, 4, 102, '#fbbf24', { so: .6, sw: .8 }) + pvdR(240, 112, 4, 102, '#fbbf24', { so: .6, sw: .8 }) + pvdTx(366, 160, '측벽 폴리머', { st: 'font-size:10px;font-weight:700;fill:#f59e0b;opacity:1' }) + pvdL('M360 156 L248 156', { c: '#f59e0b', so: .6, sw: 1 }));
          // 이온(수직)
          const ix = [176, 200, 224];
          o += pvdG(f, ['ion'], ix.map((x, i) => `<circle cx="${x}" cy="${44 + (i % 2) * 8}" r="5" fill="rgba(248,113,113,.15)" stroke="#f87171" stroke-width="1.6"/><text class="dg-t dg-lb" x="${x}" y="${47.4 + (i % 2) * 8}" text-anchor="middle" style="font-size:9px;fill:#f87171;font-weight:800">+</text>` + (f && ON(['ion']) && s.id === 'ion' ? dgFlow(`M${x} ${52 + (i % 2) * 8} V200`) : dgArrow(x, 52 + (i % 2) * 8, x, 196))).join('') + pvdTx(250, 50, '이온: 수직으로 입사', { st: 'font-size:10px;fill:#f87171;font-weight:700;opacity:1' }));
          // 라디칼(비스듬)
          o += pvdG(f, ['rad'], [[150, 40, 170, 130], [100, 64, 164, 160], [262, 42, 236, 140], [300, 70, 238, 176]].map(([x1, y1, x2, y2]) => `<circle cx="${x1}" cy="${y1}" r="3.2" fill="#f59e0b"/>` + pvdL(`M${x1} ${y1} L${x2} ${y2}`, { c: '#f59e0b', dash: '2 4', so: .8 })).join('') + pvdTx(44, 50, '라디칼: 사방으로 날아감', { st: 'font-size:10px;fill:#f59e0b;font-weight:700;opacity:1' }));
          // 바닥 충돌 + 부산물
          o += pvdG(f, ['ion', 'by'], [182, 200, 218].map(x => pvdL(`M${x - 5} 212 l5 -6 l5 6`, { c: '#f87171', sw: 1.6, so: .95 })).join(''));
          o += pvdG(f, ['by'], [[192, 190], [208, 176], [200, 156], [214, 138]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#60a5fa"/>`).join('') + dgArrow(200, 150, 200, 112) + pvdTx(366, 196, '부산물(기체)', { st: 'font-size:10px;font-weight:700;fill:#60a5fa;opacity:1' }) + pvdTx(366, 208, '→ 위로 배출', { st: 'font-size:9.5px;fill:#60a5fa;opacity:1' }) + pvdL('M364 192 L250 150', { c: '#60a5fa', so: .5, sw: 1 }));
          return dgSvg('트렌치 속에서 일어나는 일: ' + s.label, o, '0 20 460 232');
        }
      },
      // ---------- 5. 불량 단면 ----------
      'etch-defects': {
        title: '대표 식각 불량의 단면',
        wide: true,
        states: [
          { id: 'taper', label: '경사(테이퍼)', desc: '홀이 위는 넓고 아래는 좁은 경사 단면이다. 폴리머 보호막이 과하거나 이온 수직성이 부족할 때 생긴다. 바닥이 좁아져 접촉 면적이 줄고, 도금이나 증착 채움도 어려워진다.' },
          { id: 'bow', label: '보잉(불룩)', desc: '홀 중간 부분이 옆으로 불룩한 단면이다. 비스듬히 날아온 이온이나 라디칼이 옆벽 위쪽을 파먹을 때 생긴다. 이웃한 패턴과 간격이 줄어들어 단락 위험이 생긴다.' },
          { id: 'notch', label: '노칭', desc: '바닥에서 아래 막 위를 따라 옆으로 파고드는 모양이다. 아래 막이 절연체이면 이온의 전하가 쌓여 이온이 옆으로 휘어 들어가기 때문에 생긴다. 게이트 식각의 바닥 가장자리에서 문제가 된다.' },
          { id: 'micro', label: '마이크로 트렌치', desc: '바닥 모서리에 더 깊은 홈이 파이는 현상이다. 옆벽에 부딪힌 이온이 바닥 모서리로 튕겨 모이는 탓에 모서리가 더 깎인다. 아래 막이 얇을 때 관통 불량으로 이어질 수 있다.' },
        ],
        svg(s) {
          const id = s.id;
          let o = etDefs('ed');
          const poly = { taper: 'M156 110 L244 110 L226 200 L174 200 Z', bow: 'M160 110 L240 110 C266 130 266 170 238 200 L162 200 C134 170 134 130 160 110 Z', notch: 'M160 110 L240 110 L240 184 L262 184 L262 200 L138 200 L138 184 L160 184 Z', micro: 'M160 110 L240 110 L240 200 L236 200 L236 212 L222 212 L222 203 L178 203 L178 212 L164 212 L164 200 L160 200 Z' }[id];
          o += pvdR(40, 200, 320, 40, 'url(#edSi)') + pvdTx(48, 226, '아래 막', { st: 'font-size:10px;font-weight:600' });
          o += `<polygon points="40,110 360,110 360,200 40,200" style="fill:url(#edOx);stroke:currentColor;stroke-opacity:.6"/>`;
          o += pvdR(40, 92, 120, 18, 'url(#edPr)') + pvdR(240, 92, 120, 18, 'url(#edPr)');
          // 식각된 빈 공간(배경색으로 덮기)
          o += `<path d="${poly}" style="fill:var(--tbl-bg);stroke:currentColor;stroke-opacity:.8;stroke-width:1.4"/>`;
          // 이상적인 수직 윤곽
          o += pvdL('M160 110 V200 M240 110 V200', { c: '#34d399', dash: '4 3', sw: 1.4, so: .95 }) + pvdTx(46, 150, '점선: 이상적인 수직 단면', { st: 'font-size:10px;fill:#34d399;font-weight:700;opacity:1' });
          const tag = { taper: [['바닥이 좁아짐', 232, 190]], bow: [['중간이 불룩', 266, 152]], notch: [['바닥에서 옆으로 파임', 266, 192]], micro: [['모서리가 더 깊음', 242, 214]] }[id];
          tag.forEach(([t, x, y]) => { o += pvdTx(x + 4, y, t, { st: 'font-size:10px;fill:#f87171;font-weight:700;opacity:1' }); });
          if (id === 'notch') o += pvdG(null, [], [[148, 178], [252, 178]].map(([x, y]) => `<text class="dg-t dg-lb" x="${x}" y="${y}" text-anchor="middle" style="font-size:11px;fill:#f87171;font-weight:800">+</text>`).join(''));
          return dgSvg('식각 불량 단면: ' + s.label, o, '0 80 460 170');
        }
      },
      // ---------- 6. CCP 챔버 ----------
      'etch-ccp': {
        title: 'CCP(축전 결합) 챔버 단면',
        wide: true,
        states: [
          { id: 'all', label: '전체 단면', desc: '마주 보는 두 전극 사이에 RF를 걸어 플라즈마를 만든다. 위 전극은 구멍이 뚫린 샤워헤드라 가스를 고르게 뿌리고, 아래 전극은 웨이퍼를 잡는 정전척이다. 플라즈마가 넓고 고르게 퍼져 산화막·질화막 같은 단단한 유전체 식각에 널리 쓰인다.' },
          { id: 'rf', label: 'RF 전원', focus: ['hf', 'lf'], desc: '고주파(HF, 수십 MHz)는 플라즈마 밀도를, 저주파(LF, 수 MHz 이하)는 이온 에너지를 주로 맡는다. 두 전원이 서로 영향을 주어 따로 조절하기는 ICP보다 어렵다. 전원을 어느 전극에 거는지는 장비마다 다르다.' },
          { id: 'ring', label: '링·가둠', focus: ['ring', 'edge'], desc: '플라즈마가 퍼지지 않도록 가둠 링이 가장자리에 서 있고, 웨이퍼 둘레의 에지 링이 가장자리의 전기장을 중앙과 이어 준다. 에지 링과 샤워헤드는 닳는 소모품이라 교체 주기를 관리한다.' },
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          let o = etDefs('cc');
          o += pvdG(f, ['pl'], `<ellipse cx="190" cy="132" rx="84" ry="46" fill="url(#ccPl)"/>`);
          // 벽
          o += pvdG(f, ['wall'], pvdR(96, 40, 12, 278, 'url(#ccMt)') + pvdR(272, 40, 12, 168, 'url(#ccMt)') + pvdR(272, 246, 12, 72, 'url(#ccMt)') + pvdR(96, 28, 188, 12, 'url(#ccMt)') + pvdR(96, 318, 28, 10, 'url(#ccMt)') + pvdR(176, 318, 108, 10, 'url(#ccMt)'));
          // 샤워헤드(상부 전극)
          o += pvdG(f, ['hf', 'gas'], pvdR(108, 40, 164, 12, 'url(#ccMt)') + pvdR(112, 52, 156, 8, 'url(#ccSi)') + [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => `<circle cx="${124 + i * 17}" cy="56" r="1.6" fill="currentColor" opacity=".7"/>`).join('') + pvdTx(190, 48, '샤워헤드 (상부 전극)', { a: 'middle', st: 'font-size:9.5px;font-weight:600;opacity:.9' }));
          o += pvdG(f, ['gas'], pvdR(30, 62, 46, 24, 'rgba(56,189,248,.18)', { rx: 4, so: .8 }) + pvdTx(53, 78, 'MFC', { a: 'middle', st: 'font-size:10px;font-weight:700' }) + pvdL('M76 74 H108', { c: '#38bdf8', sw: 3.2, so: .6 }) + pvdL('M108 74 H190 V40', { c: '#38bdf8', sw: 3.2, so: .6 }));
          // 가둠 링
          o += pvdG(f, ['ring'], pvdR(108, 118, 16, 8, 'url(#ccCe)', { so: .7 }) + pvdR(108, 132, 16, 8, 'url(#ccCe)', { so: .7 }) + pvdR(256, 118, 16, 8, 'url(#ccCe)', { so: .7 }) + pvdR(256, 132, 16, 8, 'url(#ccCe)', { so: .7 }));
          // 이온/전자
          o += pvdG(f, ['pl'], [[140, 120], [230, 116], [170, 150], [212, 150]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="rgba(248,113,113,.15)" stroke="#f87171" stroke-width="1.5"/>`).join('') + [[150, 104], [250, 130], [190, 124], [124, 148]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2" fill="#60a5fa"/>`).join('')
            + [[150, 162, 150, 198], [190, 166, 190, 198], [230, 162, 230, 198]].map(([a, b, c, d]) => dgArrow(a, b, c, d)).join(''));
          // 하부 전극
          o += pvdG(f, ['wf', 'edge'], pvdR(116, 202, 14, 10, '#e2e8f0', { so: .6 }) + pvdR(250, 202, 14, 10, '#e2e8f0', { so: .6 }) + pvdR(130, 206, 120, 5, 'url(#ccSi)') + pvdR(130, 211, 120, 8, 'url(#ccMt)', { so: .6 }) + pvdR(124, 219, 132, 34, 'url(#ccMt)') + pvdTx(190, 240, '정전척 (하부 전극)', { a: 'middle', st: 'font-size:9.5px;opacity:.9' }) + pvdR(180, 253, 20, 65, 'url(#ccMt)'));
          // RF
          o += pvdG(f, ['hf', 'lf'], pvdL('M190 318 V348', { c: '#a78bfa', sw: 1.6, so: .9 }) + pvdR(198, 330, 86, 20, 'rgba(167,139,250,.18)', { rx: 4, so: .8 }) + pvdTx(241, 344, 'HF (밀도)', { a: 'middle', st: 'font-size:10px;font-weight:600' }) + pvdR(198, 354, 86, 20, 'rgba(251,113,133,.16)', { rx: 4, so: .8 }) + pvdTx(241, 368, 'LF (이온 에너지)', { a: 'middle', st: 'font-size:10px;font-weight:600' }) + pvdL('M190 348 V364 H198', { c: '#fb7185', sw: 1.6, so: .9 }) + pvdL('M190 340 H198', { c: '#a78bfa', sw: 1.6, so: .9 }));
          // 진공
          o += pvdG(f, ['vac'], pvdR(122, 318, 54, 5, 'url(#ccMt)') + pvdR(104, 323, 84, 60, 'url(#ccMt)', { rx: 8 }) + `<circle cx="146" cy="353" r="20" style="fill:none;stroke:currentColor;stroke-opacity:.6;stroke-width:1.1"/>` + pvdTx(146, 396, '→ 펌프', { a: 'middle', st: 'font-size:9.5px;opacity:.75' }));
          o += pvdCall(f, ['hf'], '1', '#34d399', 330, 44, 342, 48, ['샤워헤드'], 268, 46);
          o += pvdCall(f, ['pl'], '2', '#a78bfa', 330, 104, 342, 108, ['플라즈마'], 262, 104);
          o += pvdCall(f, ['ring'], '3', '#f59e0b', 330, 146, 342, 150, ['가둠 링'], 272, 130);
          o += pvdCall(f, ['edge'], '4', '#fb7185', 330, 206, 342, 210, ['에지 링'], 264, 207);
          o += pvdCall(f, ['wf'], '5', '#f59e0b', 18, 236, 30, 228, ['정전척'], 124, 236);
          o += pvdG(f, ['gas'], pvdNum(18, 74, '6', '#38bdf8'));
          return dgSvg('CCP 식각 챔버 단면: ' + s.label, o, '0 18 400 396');
        }
      },
      // ---------- 7. 식각 클러스터 ----------
      'etch-cluster': {
        title: '식각 클러스터 장비 (위에서 본 모습)',
        wide: true,
        states: [
          { id: 'all', label: '전체 배치', desc: '식각 장비도 가운데 이송 챔버를 로봇이 돌며 주변 챔버로 웨이퍼를 옮기는 클러스터형이다. 식각 챔버 여러 개가 같은 일을 나눠 맡아 처리량을 올리고, 식각이 끝난 웨이퍼는 애싱(감광막 제거) 챔버를 거쳐 나온다.' },
          { id: 'path', label: '웨이퍼 경로', focus: ['path'], desc: 'FOUP에서 나온 웨이퍼가 로드락으로 들어가 진공이 된 뒤, 이송 로봇이 식각 챔버로 옮겨 식각한다. 이어 애싱 챔버에서 남은 감광막을 벗기고 다시 로드락을 거쳐 FOUP으로 돌아간다. 식각 챔버는 병렬이라 웨이퍼가 번갈아 들어간다.' },
          { id: 'pm', label: '식각 챔버', focus: ['pm'], desc: '식각 챔버(PM)마다 소모품 사용량과 챔버 상태가 조금씩 다르다. 그래서 같은 레시피여도 챔버 간 차이가 나지 않도록 챔버 매칭을 점검한다. 한 챔버가 정비 중이어도 나머지 챔버로 장비가 계속 돈다.' },
          { id: 'vac', label: '압력 구역', focus: ['vac'], desc: '왼쪽은 대기 구역(EFEM), 오른쪽은 진공 구역이고 그 사이의 로드락이 압력을 바꿔 준다. 챔버를 열지 않고 웨이퍼를 넣고 뺄 수 있어 챔버 상태가 안정된다.' },
        ],
        svg(s) {
          const f = s.focus || null, ON = (g) => pvdOn(f, g);
          const H = [[232, 107], [282, 136], [282, 194], [232, 223], [182, 194], [182, 136]];
          const ch = (cx, cy, rot, c, g, fo = .2) => pvdG(f, g, `<g transform="rotate(${rot} ${cx} ${cy})">${pvdR(cx - 27, cy - 21, 54, 42, `rgba(${c},${fo})`, { rx: 5, so: .8 })}</g>`);
          let o = '';
          o += pvdG(f, ['vac'], pvdR(54, 86, 52, 158, 'rgba(56,189,248,.12)', { rx: 8, dash: '3 3', so: .4 }) + pvdR(112, 66, 282, 214, 'rgba(167,139,250,.1)', { rx: 14, dash: '3 3', so: .4 }));
          o += pvdG(f, ['vac'], pvdTx(80, 258, '대기 구역', { a: 'middle', st: 'font-size:9.5px;opacity:.8' }) + pvdTx(262, 292, '진공 구역', { a: 'middle', st: 'font-size:9.5px;opacity:.8;fill:#a78bfa' }));
          o += pvdG(f, ['path', 'vac', 'base'], [100, 146, 192].map(y => pvdR(12, y, 34, 38, 'rgba(56,189,248,.14)', { rx: 4 })).join('') + pvdTx(29, 92, 'FOUP', { a: 'middle', st: 'font-size:9.5px;opacity:.85' }) + pvdR(60, 95, 36, 140, 'rgba(56,189,248,.1)', { rx: 4 }) + pvdTx(78, 86, 'EFEM', { a: 'middle', st: 'font-size:9.5px;opacity:.85' }) + pvdL('M96 165 H126', { sw: 6, so: .25 }));
          o += pvdG(f, ['vac', 'path'], `<rect x="126" y="135" width="54" height="60" rx="6" style="fill:rgba(56,189,248,.14);stroke:currentColor;stroke-opacity:.8;stroke-width:1.2"/>` + pvdTx(153, 128, '로드락', { a: 'middle', st: 'font-size:9.5px;font-weight:600;opacity:.9' }));
          o += pvdG(f, ['vac', 'path', 'base'], `<polygon points="${H.map(p => p.join(',')).join(' ')}" style="fill:rgba(167,139,250,.14);stroke:currentColor;stroke-opacity:.8;stroke-width:1.3"/><circle cx="232" cy="165" r="12" style="fill:rgba(167,139,250,.3);stroke:currentColor;stroke-opacity:.7"/>` + pvdTx(232, 190, '이송 로봇', { a: 'middle', st: 'font-size:9px;opacity:.8' }));
          o += ch(282, 107, 30, '245,158,11', ['pm', 'path'], .3) + ch(311, 165, 0, '245,158,11', ['pm', 'path'], .3) + ch(282, 223, 30, '245,158,11', ['pm', 'path'], .3) + ch(182, 107, -30, '45,212,191', ['path'], .2) + ch(182, 223, 30, '148,163,184', ['path'], .12);
          o += pvdG(f, ['pm', 'path'], pvdTx(282, 68, '식각 PM1', { a: 'middle', st: 'font-size:10px;font-weight:700;fill:#f59e0b;opacity:1' }) + pvdTx(343, 160, '식각', { st: 'font-size:10px;font-weight:700;fill:#f59e0b;opacity:1' }) + pvdTx(343, 172, 'PM2', { st: 'font-size:10px;font-weight:700;fill:#f59e0b;opacity:1' }) + pvdTx(282, 274, '식각 PM3', { a: 'middle', st: 'font-size:10px;font-weight:700;fill:#f59e0b;opacity:1' }));
          o += pvdG(f, ['path'], pvdTx(182, 68, '애싱', { a: 'middle', st: 'font-size:10px;font-weight:700;opacity:1' }) + pvdTx(182, 274, '냉각', { a: 'middle', st: 'font-size:10px;font-weight:600;opacity:.8' }));
          if (s.id === 'path') {
            const st = [[153, 165], [311, 165], [182, 107], [153, 165]], hub = [232, 165];
            o += dgFlow('M30 165 L153 165') + dgFlow(`M153 165 L${hub[0]} ${hub[1]} L311 165`) + dgFlow(`M311 165 L${hub[0]} ${hub[1]} L182 107`) + dgFlow(`M182 107 L${hub[0]} ${hub[1]} L153 165`);
            o += pvdNum(153, 165, '1', '#38bdf8') + pvdNum(311, 165, '2', '#f59e0b') + pvdNum(182, 107, '3', '#2dd4bf');
          }
          return dgSvg('식각 클러스터 장비: ' + s.label, o, '0 54 400 252');
        }
      },
    });

    // ===== 노광(스캐너) 장비 가이드용 그림 (pvd_diagrams.js 의 pvd* 도우미를 같이 쓴다) =====
    const scDefs = (p) => pvdDefs(p) + `<defs>
      <linearGradient id="${p}Gl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7dd3fc" stop-opacity=".5"/><stop offset=".5" stop-color="#e0f2fe" stop-opacity=".55"/><stop offset="1" stop-color="#7dd3fc" stop-opacity=".5"/></linearGradient>
      <linearGradient id="${p}Qz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bae6fd" stop-opacity=".5"/><stop offset="1" stop-color="#7dd3fc" stop-opacity=".32"/></linearGradient>
      <linearGradient id="${p}Wt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38bdf8" stop-opacity=".45"/><stop offset="1" stop-color="#0ea5e9" stop-opacity=".6"/></linearGradient>
      <linearGradient id="${p}Bm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbbf24" stop-opacity=".62"/><stop offset="1" stop-color="#f59e0b" stop-opacity=".4"/></linearGradient>
      <linearGradient id="${p}Rs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f9a8d4" stop-opacity=".9"/><stop offset="1" stop-color="#ec4899" stop-opacity=".7"/></linearGradient>
      <linearGradient id="${p}Ba" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2dd4bf" stop-opacity=".55"/><stop offset="1" stop-color="#14b8a6" stop-opacity=".4"/></linearGradient>
      <linearGradient id="${p}Fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a78bfa" stop-opacity=".5"/><stop offset="1" stop-color="#8b5cf6" stop-opacity=".4"/></linearGradient>
    </defs>`;
    const scTri = (pts, fill, o = {}) => `<polygon points="${pts}" style="fill:${fill};stroke:${o.c || 'none'};stroke-width:${o.sw || 1};stroke-opacity:${o.so || .6}${o.dash ? ';stroke-dasharray:' + o.dash : ''}"/>`;
    const scEl = (cx, cy, rx, ry, fill, o = {}) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" style="fill:${fill};stroke:currentColor;stroke-width:${o.sw || 1};stroke-opacity:${o.so || .55}"/>`;
    const scAx = (x1, y1, x2, y2, c, w = 1.6, dash) => { const a = Math.atan2(y2 - y1, x2 - x1), h = 6, p = (t) => `${(x2 - h * Math.cos(a + t)).toFixed(1)},${(y2 - h * Math.sin(a + t)).toFixed(1)}`; return `<path d="M${x1} ${y1} L${x2} ${y2}" style="fill:none;stroke:${c};stroke-width:${w};stroke-linecap:round${dash ? ';stroke-dasharray:' + dash : ''}"/><path d="M${x2} ${y2} L${p(.45)} L${p(-.45)} Z" fill="${c}"/>`; };

    Object.assign(DIAGRAMS, {
      // ---------- 1. 스캐너 전체 구조 (광학 경로 단면) ----------
      'scan-optics': {
        title: '액침 ArF 스캐너 구조 (광학 경로 단면)',
        wide: true,
        states: [
          { id: 'all', label: '전체 단면', desc: '레이저에서 나온 193 nm 빛이 조명계에서 균일하게 다듬어져 레티클을 지나고, 투영 렌즈가 패턴을 4분의 1로 줄여 웨이퍼 위 감광막에 맺는다. 렌즈 끝과 웨이퍼 사이는 얇은 물막이 채운다. 웨이퍼는 스테이지 위에서 움직이고, 그림 왼쪽의 측정 위치에서는 다음 웨이퍼의 정렬 마크와 표면 높이를 미리 잰다. 번호는 아래 본문의 부품 설명과 같다.' },
          { id: 'src', label: '광원·조명', focus: ['laser', 'ill', 'beam'], desc: '엑시머 레이저가 초당 약 6,000번의 짧은 펄스로 193 nm 빛을 낸다. 레이저는 보통 장비 바깥(아래층)에 두고 빔 전달 광학계로 조명계에 보낸다. 조명계는 빛 세기를 고르게 만들고, 조명 모양(고리형·쌍극 등)을 바꾸고, 레티클 위에 가늘고 긴 슬릿 모양의 빛만 비추도록 다듬는다.' },
          { id: 'ret', label: '레티클·렌즈', focus: ['ret', 'lens', 'beam'], desc: '레티클은 석영판에 패턴을 새긴 원판이고, 패턴 면 앞에 펠리클 막을 씌워 먼지를 막는다. 레티클 스테이지가 레티클을 스캔 방향으로 움직이는 동안, 투영 렌즈는 패턴을 4분의 1로 줄여 웨이퍼에 맺는다. 렌즈는 수십 장의 렌즈 요소를 겹친 것이고 일부 요소는 열과 수차를 보정하려고 미세하게 움직이거나 변형된다.' },
          { id: 'imm', label: '액침·웨이퍼', focus: ['imm', 'wf'], desc: '렌즈 끝과 웨이퍼 사이를 초순수 물막이 채운다. 물이 공기보다 굴절률이 높아 같은 렌즈로 더 큰 NA를 얻는다. 물막은 액침 후드가 공급·회수하며 가두고, 웨이퍼가 렌즈 아래에서 빠르게 움직여도 물이 새거나 방울이 남지 않게 관리하는 것이 이 방식의 핵심 과제다.' },
          { id: 'met', label: '측정·스테이지', focus: ['met', 'stg'], desc: '웨이퍼 스테이지는 자기 부상식 평면 모터로 nm 수준의 정밀도로 움직이고, 스테이지 위치는 레이저 간섭계나 인코더가 잰다. 스테이지가 두 개라서 하나가 렌즈 아래에서 노광하는 동안 다른 하나는 왼쪽 측정 위치에서 다음 웨이퍼의 정렬 마크 위치와 표면 높이 지도를 만든다. 장비 전체는 온도와 청정도가 제어되는 챔버 안에 있고, 바닥 진동은 방진대가 끊어 준다.' },
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g), acc = 'var(--hl-accent)';
          let o = scDefs('so');
          // 환경 챔버
          o += pvdG(f, ['env'], pvdR(3, 90, 394, 252, 'none', { rx: 8, dash: '4 4', so: .35 }));
          // 레이저 + 빔 전달
          o += pvdG(f, ['laser'], pvdR(8, 24, 66, 40, 'rgba(167,139,250,.2)', { rx: 5, so: .8 }) + pvdTx(41, 40, 'ArF 레이저', { a: 'middle', st: 'font-size:10px;font-weight:700' }) + pvdTx(41, 53, '193 nm · 6 kHz', { a: 'middle', st: 'font-size:8.5px;opacity:.85' }));
          o += pvdG(f, ['laser', 'beam'], pvdL('M74 44 H170', { c: '#fbbf24', sw: 2.4, so: .8, dash: '5 3' }));
          // 조명계
          o += pvdG(f, ['ill'], pvdR(170, 12, 160, 66, 'url(#soMt)', { rx: 4 }) + pvdR(176, 18, 148, 54, 'var(--tbl-bg)', { rx: 2, so: .3, sw: .8 })
            + scEl(194, 40, 5, 12, 'url(#soGl)') + scEl(216, 40, 5, 12, 'url(#soGl)') + scEl(244, 40, 4, 10, 'url(#soGl)') + scEl(268, 40, 5, 14, 'url(#soGl)')
            + pvdR(228, 28, 3, 24, '#a78bfa', { sw: .6 }) + pvdR(282, 66, 14, 4, 'currentColor', { sw: .6, so: .9 }) + pvdR(204, 66, 14, 4, 'currentColor', { sw: .6, so: .9 })
            + pvdTx(250, 64, '조명계', { a: 'middle', st: 'font-size:10px;font-weight:700' }) + `<path d="M176 40 H322" style="stroke:#fbbf24;stroke-width:1.6;stroke-opacity:.6;stroke-dasharray:3 3"/>`);
          // 조명 빔 → 레티클
          o += pvdG(f, ['beam', 'ill'], scTri('226,78 274,78 274,102 226,102', 'url(#soBm)'));
          // 레티클 + 펠리클 + 스테이지
          o += pvdG(f, ['ret'], pvdR(184, 94, 28, 24, 'url(#soMt)', { so: .6 }) + pvdR(288, 94, 28, 24, 'url(#soMt)', { so: .6 }) + pvdR(180, 90, 140, 4, '#94a3b8', { sw: .8, so: .5 })
            + pvdR(212, 100, 76, 6, 'url(#soQz)', { so: .8 }) + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => `<rect x="${216 + i * 6}" y="106" width="3" height="2.5" fill="currentColor" opacity=".85"/>`).join('')
            + pvdR(212, 108.5, 3, 7, '#94a3b8', { sw: .6 }) + pvdR(285, 108.5, 3, 7, '#94a3b8', { sw: .6 }) + pvdL('M212 116 H288', { c: '#2dd4bf', sw: 1, so: .9 })
            + pvdL('M186 86 l-6 4 l6 4 M314 86 l6 4 l-6 4', { sw: 1.3, so: .8 }));
          // 빔 (레티클 → 웨이퍼)
          o += pvdG(f, ['beam', 'lens'], scTri('228,118 272,118 296,160 296,184 258,244 242,244 204,184 204,160', 'url(#soBm)'));
          // 투영 렌즈
          o += pvdG(f, ['lens'], pvdL('M198 124 H302 L302 160 L282 232 H218 L198 160 Z', { sw: 1.5, so: .75, fill: 'rgba(148,163,184,.12)' })
            + [[138, 44], [153, 48], [168, 48], [183, 43], [198, 37], [212, 31], [224, 24]].map(([y, rx]) => scEl(250, y, rx, 5.5, 'url(#soGl)')).join('')
            + pvdTx(250, 164, '투영 렌즈', { a: 'middle', st: 'font-size:10px;font-weight:700;fill:#0c4a6e' }));
          // 측정 프레임 + 센서
          o += pvdG(f, ['met'], pvdR(50, 118, 150, 7, 'url(#soMt)', { so: .6 }) + pvdR(52, 125, 76, 52, 'rgba(45,212,191,.16)', { rx: 4, so: .8 })
            + pvdTx(90, 144, '정렬·레벨링', { a: 'middle', st: 'font-size:10px;font-weight:700' }) + pvdTx(90, 157, '센서', { a: 'middle', st: 'font-size:10px;font-weight:700' })
            + pvdL('M78 177 V251', { c: '#2dd4bf', sw: 1.6, so: .85, dash: '3 3' }) + pvdL('M60 177 L92 250 L124 177', { c: '#14b8a6', sw: 1.2, so: .75, dash: '2 2' })
            + `<rect x="70" y="250" width="16" height="2" fill="#14b8a6"/>`);
          // 액침 후드 + 물
          o += pvdG(f, ['imm'], pvdR(200, 228, 26, 20, 'url(#soMt)', { so: .7 }) + pvdR(274, 228, 26, 20, 'url(#soMt)', { so: .7 })
            + `<path d="M226 238 H274 V252 H226 Z" style="fill:url(#soWt);stroke:#0ea5e9;stroke-width:.8;stroke-opacity:.6"/>` + `<path d="M200 248 H226 M274 248 H300" style="stroke:currentColor;stroke-width:1;stroke-opacity:.5"/>`
            + pvdL('M206 228 v-8 M294 228 v-8', { c: '#38bdf8', sw: 2, so: .8 }));
          // 웨이퍼 (노광) + 척 + 스테이지
          o += pvdG(f, ['wf'], pvdR(180, 252, 140, 5, 'url(#soSi)', { so: .6 }) + `<rect x="180" y="250.5" width="140" height="1.6" fill="url(#soRs)"/>`
            + pvdR(176, 257, 148, 13, 'url(#soMt)', { so: .6 }) + Array.from({ length: 18 }, (_, i) => `<rect x="${182 + i * 8}" y="257" width="2.4" height="2.4" fill="currentColor" opacity=".7"/>`).join(''));
          o += pvdG(f, ['wf', 'stg'], pvdR(166, 270, 176, 26, 'url(#soMt)', { so: .6 }) + pvdTx(254, 287, '웨이퍼 스테이지', { a: 'middle', st: 'font-size:10px;font-weight:700' }));
          // 측정 위치 웨이퍼/스테이지
          o += pvdG(f, ['met', 'stg'], pvdR(20, 252, 140, 5, 'url(#soSi)', { so: .6 }) + `<rect x="20" y="250.5" width="140" height="1.6" fill="url(#soRs)"/>` + pvdR(16, 257, 148, 13, 'url(#soMt)', { so: .6 })
            + pvdR(6, 270, 156, 26, 'url(#soMt)', { so: .6 }) + pvdTx(84, 287, '측정 스테이지', { a: 'middle', st: 'font-size:10px;font-weight:700' }));
          // 베이스 + 평면 모터 + 방진
          o += pvdG(f, ['stg'], pvdR(4, 296, 392, 20, 'url(#soMt)', { so: .6 }) + Array.from({ length: 33 }, (_, i) => `<rect x="${10 + i * 11.8}" y="303" width="6" height="8" fill="${i % 2 ? 'rgba(248,113,113,.5)' : 'rgba(96,165,250,.5)'}" stroke="currentColor" stroke-width=".5" stroke-opacity=".5"/>`).join('')
            + pvdR(26, 316, 36, 18, 'url(#soMt)', { so: .6 }) + pvdR(338, 316, 36, 18, 'url(#soMt)', { so: .6 }) + pvdL('M34 322 l4 -3 l6 6 l6 -6 l4 3 M346 322 l4 -3 l6 6 l6 -6 l4 3', { sw: 1, so: .7 })
            + pvdTx(100, 330, '방진대 (바닥 진동 차단)', { st: 'font-size:9.5px;opacity:.8' }));
          // 번호
          o += pvdG(f, ['laser'], pvdNum(41, 12, '1', '#a78bfa')) + pvdG(f, ['ill'], pvdNum(338, 16, '2', '#38bdf8'));
          o += pvdCall(f, ['ret'], '3', '#2dd4bf', 338, 106, 350, 102, ['레티클', '스테이지'], 316, 106);
          o += pvdCall(f, ['lens'], '4', '#f59e0b', 338, 170, 350, 166, ['투영 렌즈'], 302, 170);
          o += pvdCall(f, ['imm'], '5', '#38bdf8', 338, 236, 350, 232, ['액침 후드', '· 물막'], 300, 238);
          o += pvdG(f, ['wf', 'stg'], pvdNum(334, 282, '6', '#fb7185'));
          o += pvdG(f, ['met'], pvdNum(44, 124, '7', '#34d399'));
          o += pvdG(f, ['stg'], pvdNum(384, 306, '8', '#a78bfa'));
          o += pvdG(f, ['env'], pvdNum(14, 100, '9', '#94a3b8') + pvdTx(26, 103, '환경 챔버 (온도·청정도 제어)', { st: 'font-size:9.5px;opacity:.8' }));
          o += pvdG(f, ['wf'], pvdTx(250, 244 + 0, '', {}));
          return dgSvg('액침 ArF 스캐너 구조: ' + s.label, o, '0 0 400 346');
        }
      },
    });

    // 라벨 + 지시선 도우미
    const scLab = (x, y, t, px, py, a = 'start', c) => `<path d="M${px} ${py} L${a === 'end' ? x + 3 : x - 3} ${y - 3}" style="fill:none;stroke:currentColor;stroke-opacity:.4;stroke-width:1"/><circle cx="${px}" cy="${py}" r="1.8" fill="${c || 'currentColor'}" opacity=".8"/>` + pvdTx(x, y, t, { a, st: 'font-size:10.5px;font-weight:600;opacity:.95' });

    Object.assign(DIAGRAMS, {
      // ---------- 2. 레티클과 펠리클 ----------
      'scan-reticle': {
        title: '레티클과 펠리클 단면',
        wide: true,
        states: [
          { id: 'st', label: '구조', desc: '레티클은 두께 약 6 mm의 석영판 한 면에 크롬이나 몰리브덴 실리사이드(MoSi) 같은 흡수체로 회로 패턴을 새긴 것이다. 패턴 면 앞에는 알루미늄 프레임 위에 얇은 고분자 막(펠리클)을 팽팽하게 붙여, 먼지가 패턴 면에 닿지 못하게 한다. 크기는 가로세로 약 152 mm이고, 이 안의 패턴이 렌즈를 지나며 4분의 1로 줄어 웨이퍼에 찍힌다.' },
          { id: 'df', label: '펠리클의 효과', desc: '펠리클 막은 패턴 면에서 약 6 mm 떨어져 있어서, 막 위의 먼지는 투영 렌즈의 초점에서 멀리 벗어난다. 웨이퍼 쪽에서 보면 이 어긋남이 4의 제곱, 즉 16분의 1로 줄어도 0.4 mm 가량이라 초점 심도(약 0.1 µm 수준)보다 수천 배 크다. 그래서 먼지는 흐릿한 얼룩으로 퍼져 거의 찍히지 않는다. 반대로 펠리클 없이 패턴 면에 앉은 먼지는 초점이 맞아 모든 샷, 모든 칩에 똑같이 찍힌다.' },
        ],
        svg(s) {
          let o = scDefs('rt');
          const df = s.id === 'df';
          o += pvdR(50, 46, 300, 36, 'url(#rtQz)', { so: .85 }) + pvdTx(200, 68, '석영 기판 (두께 약 6 mm)', { a: 'middle', st: 'font-size:11px;font-weight:700;fill:#0c4a6e' });
          o += [[68, 30], [118, 14], [150, 22], [226, 34], [280, 18], [318, 14]].map(([x, w]) => `<rect x="${x}" y="82" width="${w}" height="4.5" fill="currentColor" opacity=".85"/>`).join('');
          o += pvdR(56, 86.5, 9, 64, 'url(#rtMt)', { so: .8 }) + pvdR(335, 86.5, 9, 64, 'url(#rtMt)', { so: .8 }) + pvdL('M56 150.5 H344', { c: '#2dd4bf', sw: 2, so: .95 });
          o += `<circle cx="60.5" cy="118" r="1.6" fill="currentColor" opacity=".6"/>`;
          o += pvdL('M354 87 V150', { sw: 1, so: .6 }) + pvdL('M350 87 h8 M350 150 h8', { sw: 1, so: .6 }) + pvdTx(361, 122, '≈6 mm', { st: 'font-size:10px;font-weight:700' });
          if (!df) {
            o += scLab(8, 186, '프레임 (알루미늄)', 60, 140);
            o += pvdTx(200, 108, '패턴 면 (흡수체: 크롬·MoSi)', { a: 'middle', st: 'font-size:10.5px;opacity:.9' }) + `<path d="M200 96 L200 88" style="stroke:currentColor;stroke-opacity:.5;stroke-width:1;fill:none"/>`;
            o += pvdTx(200, 168, '펠리클 막 (약 1 µm 고분자)', { a: 'middle', st: 'font-size:10.5px;font-weight:700;fill:#0d9488' });
            o += scAx(200, 4, 200, 40, '#fbbf24', 2.4) + pvdTx(212, 22, '조명 (193 nm)', { st: 'font-size:10px;opacity:.85' });
            o += scAx(200, 186, 200, 216, '#fbbf24', 2.4) + pvdTx(212, 204, '→ 투영 렌즈로', { st: 'font-size:10px;opacity:.85' });
            o += pvdTx(200, 240, '실제 레티클: 약 152 × 152 mm, 웨이퍼에는 4분의 1 크기로 찍힘', { a: 'middle', st: 'font-size:10px;opacity:.75' });
          } else {
            // 초점 원뿔
            o += scTri('138,86 228,86 246,150 120,150', 'rgba(251,191,36,.28)') + scTri('138,86 228,86 213,22 153,22', 'rgba(251,191,36,.2)');
            o += `<circle cx="132" cy="148" r="5.2" fill="#f97316" stroke="#9a3412" stroke-width="1"/><circle cx="288" cy="84" r="4" fill="#ef4444" stroke="#7f1d1d" stroke-width="1"/>`;
            o += scTri('284,86 292,86 292,150 284,150', 'none');
            o += scTri('288,86 288,86', 'none');
            o += pvdL('M288 86 L270 150 M288 86 L306 150', { c: '#fbbf24', sw: 1, so: .5 }) + pvdL('M138 86 L120 150 M228 86 L246 150', { c: '#fbbf24', sw: 1, so: .6 });
            o += pvdG(null, [], `<ellipse cx="183" cy="150" rx="63" ry="4" fill="none" stroke="#f97316" stroke-width="1" stroke-dasharray="3 3" opacity=".6"/>`);
            o += pvdTx(24, 192, '● 펠리클 위 먼지', { st: 'font-size:11px;font-weight:700;fill:#c2410c' }) + pvdTx(24, 206, '초점 밖이라 흐린 얼룩으로 퍼져 거의 안 찍힘', { st: 'font-size:10.5px;opacity:.9' });
            o += pvdTx(24, 226, '● 패턴 면 위 먼지', { st: 'font-size:11px;font-weight:700;fill:#b91c1c' }) + pvdTx(24, 240, '초점이 맞아 모든 칩에 같은 불량으로 찍힘', { st: 'font-size:10.5px;opacity:.9' });
          }
          return dgSvg('레티클과 펠리클: ' + s.label, o, '0 0 400 250');
        }
      },

      // ---------- 3. 액침 후드 ----------
      'scan-immersion': {
        title: '액침 후드와 물막 단면',
        wide: true,
        states: [
          { id: 'st', label: '구조', desc: '투영 렌즈의 마지막 요소 아래에 액침 후드가 렌즈를 둘러싸고 있다. 후드 안쪽 슬롯으로 초순수를 공급하고, 바깥쪽 슬롯으로 물과 공기를 섞어 빨아들여 회수하며, 가장 바깥의 에어 나이프는 가스를 불어 물이 후드 밖으로 번지지 않게 막는다. 웨이퍼와 렌즈 사이의 물막은 1 mm 안팎으로 얇고, 웨이퍼 표면은 탑코트나 물을 잘 밀어내는 레지스트로 덮여 있다.' },
          { id: 'sc', label: '스캔 중 물막', desc: '노광 중 웨이퍼가 렌즈 아래에서 빠르게 움직이면 물막도 같이 끌려간다. 앞쪽(웨이퍼가 들어오는 쪽)에서는 물이 마른 표면을 덮으며 전진하고, 뒤쪽(빠져나가는 쪽)에서는 물이 끌려 나가며 얇은 막이나 방울을 남기기 쉽다. 웨이퍼 표면이 물을 충분히 밀어내야 물막이 안정적으로 유지된다. 속도가 높을수록 이 조건이 까다로워 장비가 속도와 후드 설계를 맞춘다.' },
          { id: 'df', label: '결함의 원인', desc: '액침에서만 생기는 결함은 세 가지로 나뉜다. 물에 섞인 기포는 노광 중 빛을 굴절시켜 국부적으로 패턴을 망가뜨린다. 물막이 끊기며 남은 방울이 말라 얼룩(워터마크)을 남기면 그 아래 감광막이 부분적으로 변한다. 입자는 웨이퍼 가장자리나 물 공급 라인에서 떨어져 나와 물에 실려 다닌다. 이 때문에 노광 전후에 트랙에서 웨이퍼를 씻는 공정(프리·포스트 린스)이 따로 들어간다.' },
        ],
        svg(s) {
          const sc = s.id === 'sc', df = s.id === 'df';
          let o = scDefs('im');
          o += `<path d="M150 22 Q200 2 250 22 V68 H150 Z" style="fill:url(#imGl);stroke:currentColor;stroke-opacity:.6;stroke-width:1.2"/>` + pvdR(138, 38, 12, 32, 'url(#imMt)', { so: .6 }) + pvdR(250, 38, 12, 32, 'url(#imMt)', { so: .6 });
          o += pvdR(88, 58, 50, 46, 'url(#imMt)', { so: .7 }) + pvdR(262, 58, 50, 46, 'url(#imMt)', { so: .7 }) + pvdR(138, 68, 12, 36, 'url(#imMt)', { so: .5 }) + pvdR(250, 68, 12, 36, 'url(#imMt)', { so: .5 });
          o += pvdR(30, 124, 340, 16, 'url(#imSi)', { so: .6 }) + pvdR(30, 118, 340, 6, 'url(#imRs)', { sw: .8, so: .5 }) + pvdR(30, 115, 340, 3, 'url(#imBa)', { sw: .6, so: .5 }) + pvdR(24, 140, 352, 22, 'url(#imMt)', { so: .6 });
          let wl = 'M158 68 H242 V100 H274 Q282 107 274 115 H126 Q118 107 126 100 H158 Z';
          if (sc) wl = 'M158 68 H242 V100 H266 Q284 106 276 115 H70 Q112 112 124 102 H158 Z';
          o += `<path d="${wl}" style="fill:url(#imWt);stroke:#0ea5e9;stroke-width:1;stroke-opacity:.7"/>`;
          o += scAx(144, 72, 144, 94, '#0ea5e9', 2) + scAx(256, 72, 256, 94, '#0ea5e9', 2);
          o += scAx(118, 112, 118, 66, '#64748b', 2) + scAx(282, 112, 282, 66, '#64748b', 2);
          o += scAx(100, 66, 100, 104, '#a78bfa', 2, '3 2') + scAx(300, 66, 300, 104, '#a78bfa', 2, '3 2');
          o += pvdNum(100, 44, '3', '#a78bfa') + pvdNum(118, 44, '2', '#94a3b8') + pvdNum(144, 44, '1', '#38bdf8') + pvdNum(300, 44, '3', '#a78bfa') + pvdNum(282, 44, '2', '#94a3b8') + pvdNum(256, 44, '1', '#38bdf8');
          const lg = (y, n, c, t) => pvdNum(16, y - 3, n, c) + pvdTx(30, y, t, { st: 'font-size:10.5px;font-weight:600;opacity:.95' });
          if (!sc && !df) {
            o += scLab(8, 20, '렌즈 마지막 요소', 150, 32) + scLab(392, 20, '액침 후드', 310, 80, 'end');
            o += pvdTx(392, 186, '웨이퍼 위: 탑코트 · 레지스트 · 실리콘', { a: 'end', st: 'font-size:10.5px;font-weight:600;opacity:.9' });
            o += lg(186, '1', '#38bdf8', '초순수 공급 슬롯') + lg(202, '2', '#94a3b8', '물·공기 회수 슬롯') + lg(218, '3', '#a78bfa', '에어 나이프(가스 커튼)');
            o += pvdTx(392, 202, '물막 두께: 1 mm 안팎', { a: 'end', st: 'font-size:10.5px;font-weight:700;fill:#0284c7' });
          }
          if (sc) {
            o += `<ellipse cx="62" cy="113" rx="4" ry="2" fill="#38bdf8" opacity=".7"/><ellipse cx="44" cy="114" rx="3" ry="1.5" fill="#38bdf8" opacity=".7"/>`;
            o += scAx(300, 176, 220, 176, '#f59e0b', 2.4) + pvdTx(308, 180, '웨이퍼 이동', { st: 'font-size:10.5px;font-weight:700' });
            o += pvdTx(8, 196, '◀ 뒤쪽(왼쪽): 물이 끌려 나가 얇은 막과', { st: 'font-size:10.5px;font-weight:600' }) + pvdTx(24, 210, '방울이 남기 쉬운 쪽', { st: 'font-size:10.5px;font-weight:600;opacity:.9' });
            o += pvdTx(392, 196, '앞쪽(오른쪽) ▶', { a: 'end', st: 'font-size:10.5px;font-weight:600' }) + pvdTx(392, 210, '물이 마른 면을 덮으며 전진', { a: 'end', st: 'font-size:10.5px;font-weight:600;opacity:.9' });
            o += pvdTx(8, 224, '※ 웨이퍼가 왼쪽으로 가면 렌즈는 상대적으로 오른쪽으로 진행한다', { st: 'font-size:9.5px;opacity:.7' });
          }
          if (df) {
            o += `<circle cx="196" cy="92" r="5" fill="rgba(255,255,255,.7)" stroke="#0369a1" stroke-width="1.2"/><circle cx="214" cy="104" r="3" fill="rgba(255,255,255,.7)" stroke="#0369a1" stroke-width="1.2"/>`;
            o += `<path d="M62 114 q4 -6 8 0 Z M46 114 q3 -5 6 0 Z" fill="#38bdf8" opacity=".8"/><circle cx="330" cy="112" r="2.6" fill="#ef4444"/>`;
            o += scLab(392, 20, '기포: 빛을 굴절시킴', 214, 100, 'end', '#0369a1');
            o += pvdTx(8, 190, '● 남은 물방울이 마르면 워터마크 (왼쪽)', { st: 'font-size:10.5px;font-weight:600;fill:#b45309' });
            o += pvdTx(8, 206, '● 입자: 웨이퍼 가장자리·공급 라인에서 유입 (오른쪽)', { st: 'font-size:10.5px;font-weight:600;fill:#dc2626' });
            o += pvdTx(8, 222, '● 대책: 프리·포스트 린스, 탑코트, 물 순도 관리', { st: 'font-size:10.5px;font-weight:600;opacity:.9' });
          }
          return dgSvg('액침 후드: ' + s.label, o, '0 0 400 230');
        }
      },
    });

    Object.assign(DIAGRAMS, {
      // ---------- 4. 스텝 앤 스캔 ----------
      'scan-motion': {
        title: '스텝 앤 스캔: 웨이퍼 한 장을 찍는 방법',
        wide: true,
        states: [
          { id: 'sc', label: '스캔 (한 샷)', desc: '고정된 가는 슬릿 모양의 빛 아래로 레티클과 웨이퍼가 서로 반대 방향으로 지나간다. 렌즈가 패턴을 4분의 1로 줄이므로 레티클이 웨이퍼보다 4배 빠르게 움직여야 패턴의 같은 지점이 같은 웨이퍼 위치에 겹쳐 맺힌다. 두 스테이지의 속도와 위치를 nm 수준으로 맞추는 것이 동기 정밀도다. 렌즈는 슬릿 안의 좁은 영역만 쓰면 되므로 렌즈 설계와 수차 관리가 쉬워진다.' },
          { id: 'map', label: '샷 맵', desc: '웨이퍼 전체를 한 번에 찍지 못해서, 한 샷을 스캔한 뒤 스테이지가 다음 샷 위치로 이동(스텝)하는 일을 반복한다. 300 mm 웨이퍼에는 완전한 샷이 수십 개 들어가고, 가장자리에는 일부만 걸친 샷도 칩이 나오는 만큼 찍는다. 샷 수와 스캔 시간이 노광 시간을 정하고, 처리량(wph)은 샷마다 스캔하는 속도와 스텝 이동 시간으로 결정된다.' },
          { id: 'fd', label: '필드와 슬릿', desc: '웨이퍼 위에서 한 샷의 최대 크기(필드)는 26 × 33 mm다. 슬릿은 폭이 몇 mm이고 길이가 26 mm인 띠 모양 빛이며, 이 띠가 33 mm 길이만큼 쓸고 지나가며 한 샷을 완성한다. 칩이 이 필드보다 크면 둘로 나눠 이어 붙이는 방식(스티칭)이 필요하다.' },
        ],
        svg(s) {
          let o = scDefs('mo');
          if (s.id === 'sc') {
            o += scTri('176,0 204,0 204,62 176,62', 'url(#moBm)');
            o += pvdR(110, 40, 160, 8, 'url(#moQz)', { so: .8 }) + [0, 1, 2, 3, 4, 5, 6, 7].map(i => `<rect x="${118 + i * 19}" y="48" width="${i % 3 === 1 ? 4 : 9}" height="3" fill="currentColor" opacity=".85"/>`).join('');
            o += scAx(300, 58, 360, 58, '#a78bfa', 2.6) + pvdTx(300, 76, '레티클 → 속도 4v', { st: 'font-size:10.5px;font-weight:700;fill:#7c3aed' });
            o += `<path d="M100 76 H280 L226 166 H154 Z" style="fill:rgba(148,163,184,.12);stroke:currentColor;stroke-opacity:.6;stroke-width:1.3"/>` + scTri('176,62 204,62 195,176 185,176', 'url(#moBm)');
            o += [[96, 66], [112, 70], [128, 62], [143, 52], [155, 42]].map(([y, rx]) => scEl(190, y, rx * .8, 4.5, 'url(#moGl)')).join('') + pvdTx(190, 112, '투영 렌즈 (4분의 1 축소)', { a: 'middle', st: 'font-size:10px;font-weight:700;fill:#0c4a6e' });
            o += pvdR(100, 184, 180, 8, 'url(#moSi)', { so: .6 }) + `<rect x="100" y="182.5" width="180" height="1.6" fill="url(#moRs)"/>` + pvdR(94, 192, 192, 18, 'url(#moMt)', { so: .6 });
            o += scAx(120, 226, 60, 226, '#f59e0b', 2.6) + pvdTx(130, 230, '웨이퍼 ← 속도 v', { st: 'font-size:10.5px;font-weight:700;fill:#b45309' });
            o += pvdTx(8, 18, '슬릿 빛은 고정', { st: 'font-size:10.5px;font-weight:600;opacity:.9' }) + pvdTx(300, 130, '4v : v', { st: 'font-size:16px;font-weight:800;fill:var(--hl-accent)' }) + pvdTx(300, 146, '레티클 : 웨이퍼 속도비', { st: 'font-size:10px;opacity:.85' });
            o += pvdTx(8, 262, '레티클이 슬릿을 지나가는 동안 웨이퍼도 반대로 지나가며 패턴이 4분의 1로 찍힌다', { st: 'font-size:10px;opacity:.75' });
            return dgSvg('스텝 앤 스캔: ' + s.label, o, '0 0 400 272');
          }
          if (s.id === 'map') {
            const cx = 140, cy = 140, R = 112, k = R / 150, w = 26 * k, h = 33 * k, ox = cx - 3 * w - w / 2, oy = cy - 3 * h - h / 2;
            o += `<circle cx="${cx}" cy="${cy}" r="${R}" style="fill:url(#moSi);stroke:currentColor;stroke-opacity:.6;stroke-width:1.2"/><path d="M${cx - 8} ${cy + R} h16" stroke="currentColor" stroke-width="1.2" opacity=".5"/>`;
            const pts = []; let full = 0, part = 0;
            for (let r = -4; r <= 4; r++) { const row = []; for (let c = -5; c <= 5; c++) { const x = ox + (c + 3) * w, y = oy + (r + 3) * h, cs = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]], inn = cs.filter(p => Math.hypot(p[0] - cx, p[1] - cy) <= R).length;
              if (inn === 4) { full++; row.push([x + w / 2, y + h / 2]); o += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" style="fill:#fbbf24;fill-opacity:.5;stroke:currentColor;stroke-opacity:.5;stroke-width:.7"/>`; }
              else if (inn > 0) { part++; o += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" style="fill:#fbbf24;fill-opacity:.15;stroke:currentColor;stroke-opacity:.4;stroke-width:.7;stroke-dasharray:2 2"/>`; } }
              if (row.length) pts.push(r % 2 ? row.reverse() : row); }
            const path = pts.flat().map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
            o += pvdL(path, { c: '#7c3aed', sw: 1.2, so: .85, dash: '3 2' }) + (pts[0] ? `<circle cx="${pts[0][0][0].toFixed(1)}" cy="${pts[0][0][1].toFixed(1)}" r="3" fill="#7c3aed"/>` : '');
            o += pvdTx(268, 70, '300 mm 웨이퍼', { st: 'font-size:11px;font-weight:700' }) + pvdTx(268, 98, `완전한 샷 ${full}개`, { st: 'font-size:11px;font-weight:700;fill:#b45309' }) + pvdTx(268, 112, '(노란색 칸)', { st: 'font-size:10px;opacity:.8' }) + pvdTx(268, 134, `가장자리 일부 샷 ${part}개`, { st: 'font-size:11px;font-weight:600;opacity:.9' }) + pvdTx(268, 148, '(점선 칸)', { st: 'font-size:10px;opacity:.8' });
            o += pvdTx(268, 176, '보라 점선: 노광 순서(예)', { st: 'font-size:10.5px;font-weight:600;fill:#7c3aed' }) + pvdTx(268, 192, '샷 하나 = 스캔 1회', { st: 'font-size:10.5px;opacity:.85' }) + pvdTx(268, 206, '샷 사이 = 스텝 이동', { st: 'font-size:10.5px;opacity:.85' });
            return dgSvg('스텝 앤 스캔: ' + s.label, o, '0 0 400 268');
          }
          // 필드와 슬릿
          const x0 = 60, y0 = 28, W = 156, H = 198;
          o += pvdR(x0, y0, W, H, 'rgba(251,191,36,.12)', { so: .8 }) + pvdR(x0, y0 + 80, W, 34, 'url(#moBm)', { so: .8, sw: 1.4 });
          o += scAx(x0 + W + 18, y0 + 20, x0 + W + 18, y0 + H - 20, 'currentColor', 1.6) + scAx(x0 + W + 18, y0 + H - 20, x0 + W + 18, y0 + 20, 'currentColor', 1.6);
          o += pvdTx(x0 + W + 28, y0 + 100, '스캔 방향', { st: 'font-size:10.5px;font-weight:700' }) + pvdTx(x0 + W + 28, y0 + 114, '(위·아래)', { st: 'font-size:10px;opacity:.8' });
          o += pvdTx(x0 + W / 2, y0 - 8, '필드 폭 26 mm = 슬릿 길이', { a: 'middle', st: 'font-size:10.5px;font-weight:700' }) + pvdL(`M${x0} ${y0 - 3} H${x0 + W}`, { sw: 1, so: .6 });
          o += pvdTx(x0 + W / 2, y0 + H + 18, '필드 높이 33 mm = 스캔 길이', { a: 'middle', st: 'font-size:10.5px;font-weight:700' });
          o += pvdTx(x0 + W / 2, y0 + 101, '슬릿 (폭 수 mm)', { a: 'middle', st: 'font-size:10.5px;font-weight:700;fill:#92400e' });
          o += pvdTx(x0 + W / 2, y0 + 50, '아직 노광 안 됨', { a: 'middle', st: 'font-size:10px;opacity:.7' }) + pvdTx(x0 + W / 2, y0 + 170, '이미 노광됨', { a: 'middle', st: 'font-size:10px;opacity:.7' });
          o += pvdTx(300, 190, '한 샷 = 슬릿이', { st: 'font-size:10.5px;opacity:.9' }) + pvdTx(300, 204, '33 mm를 쓸고 간 면적', { st: 'font-size:10.5px;opacity:.9' });
          return dgSvg('스텝 앤 스캔: ' + s.label, o, '0 0 400 262');
        }
      },

      // ---------- 5. 듀얼 스테이지 ----------
      'scan-dual': {
        title: '듀얼 스테이지: 측정과 노광을 동시에',
        wide: true,
        states: [
          { id: 'p', label: '① 동시 진행', col: 0, A: [290, 'W1'], B: [110, 'W2'], mode: 'par', desc: '스테이지 A는 렌즈 아래에서 웨이퍼 W1을 노광하고, 그동안 스테이지 B는 왼쪽 측정 위치에서 다음 웨이퍼 W2의 정렬 마크 위치와 표면 높이 지도를 만든다. 측정에 걸리는 시간이 노광 시간 뒤에 숨는다.' },
          { id: 'x', label: '② 스테이지 교대', col: 0.5, A: [232, 'W1'], B: [168, 'W2'], mode: 'swap', desc: 'W1의 노광이 끝나면 두 스테이지가 서로 위치를 맞바꾼다. 측정이 끝난 W2는 정렬 정보와 높이 지도를 이미 갖고 있어서 렌즈 아래에 오자마자 노광을 시작할 수 있다. 장비가 쉬는 시간은 이 교대 시간뿐이다.' },
          { id: 'n', label: '③ 역할 교대', col: 1, A: [110, 'W3'], B: [290, 'W2'], mode: 'par', desc: '이제 B가 렌즈 아래에서 W2를 노광하고, A는 W1을 내려놓고 새 웨이퍼 W3를 받아 측정 위치에서 측정한다. 이 순환이 시간당 수백 장의 처리량을 만든다. 측정과 노광을 한 스테이지로 차례로 하던 장비보다 훨씬 빠르다.' },
        ],
        svg(s) {
          let o = scDefs('du');
          // 렌즈 + 후드, 센서
          o += `<path d="M236 18 H344 L318 100 H262 Z" style="fill:rgba(148,163,184,.12);stroke:currentColor;stroke-opacity:.65;stroke-width:1.3"/>` + [[34, 40], [48, 36], [62, 30], [76, 24], [88, 18]].map(([y, rx]) => scEl(290, y, rx, 4.5, 'url(#duGl)')).join('') + pvdTx(290, 56, '투영 렌즈', { a: 'middle', st: 'font-size:10px;font-weight:700;fill:#0c4a6e' });
          o += pvdR(258, 98, 12, 14, 'url(#duMt)', { so: .6 }) + pvdR(310, 98, 12, 14, 'url(#duMt)', { so: .6 }) + `<rect x="270" y="102" width="40" height="10" fill="url(#duWt)"/>`;
          o += pvdR(56, 40, 108, 40, 'rgba(45,212,191,.16)', { rx: 4, so: .8 }) + pvdTx(110, 58, '정렬·레벨링 센서', { a: 'middle', st: 'font-size:10px;font-weight:700' }) + pvdTx(110, 71, '(측정 위치)', { a: 'middle', st: 'font-size:9px;opacity:.8' });
          o += pvdR(56, 34, 108, 6, 'url(#duMt)', { so: .5 });
          const st = ([cx, nm], role) => {
            let g = pvdR(cx - 56, 138, 112, 22, 'url(#duMt)', { so: .6 }) + pvdR(cx - 50, 130, 100, 6, 'url(#duSi)', { so: .6 }) + `<rect x="${cx - 50}" y="128.6" width="100" height="1.6" fill="url(#duRs)"/>`
              + pvdR(cx - 54, 136, 108, 4, 'url(#duMt)', { so: .5, sw: .8 }) + pvdTx(cx, 154, nm, { a: 'middle', st: 'font-size:10.5px;font-weight:800' });
            return g;
          };
          o += pvdR(6, 160, 388, 16, 'url(#duMt)', { so: .6 }) + Array.from({ length: 32 }, (_, i) => `<rect x="${12 + i * 12}" y="164" width="5" height="8" fill="${i % 2 ? 'rgba(248,113,113,.5)' : 'rgba(96,165,250,.5)'}"/>`).join('');
          if (s.id === 'x') {
            o += `<g transform="translate(0 6)">${st(s.B)}</g>` + `<g transform="translate(0 -14)">${st(s.A)}</g>`;
            o += scAx(250, 112, 316, 112, '#0d9488', 2.2) + scAx(150, 120, 84, 120, '#7c3aed', 2.2) + pvdTx(200, 100, '위치 교환', { a: 'middle', st: 'font-size:10.5px;font-weight:700;fill:var(--hl-accent)' });
          } else o += st(s.A) + st(s.B);
          // 빔: 렌즈 아래 노광 / 측정 위치 측정
          const expX = s.id === 'p' ? s.A[0] : s.id === 'n' ? s.B[0] : null, meaX = s.id === 'p' ? s.B[0] : s.id === 'n' ? s.A[0] : null;
          if (expX) o += scTri('284,112 296,112 291,128 289,128', 'rgba(251,191,36,.7)');
          if (meaX) o += pvdL(`M${meaX - 20} 80 L${meaX - 6} 128 L${meaX + 8} 80`, { c: '#14b8a6', sw: 1.2, so: .85, dash: '2 2' }) + pvdL(`M${meaX - 6} 80 V128`, { c: '#14b8a6', sw: 1.6, so: .85, dash: '3 3' });
          o += pvdTx(110, 192, '측정 위치', { a: 'middle', st: 'font-size:10px;opacity:.8' }) + pvdTx(290, 192, '노광 위치 (렌즈 아래)', { a: 'middle', st: 'font-size:10px;opacity:.8' });
          // 타임라인
          const X0 = 92, bw = 84, gp = 10, y1 = 218, y2 = 246, bl = (i, y, t, on) => `<rect x="${X0 + i * (bw + gp)}" y="${y}" width="${bw}" height="22" rx="3" style="fill:${on ? 'var(--hl-accent)' : 'currentColor'};fill-opacity:${on ? .5 : .1};stroke:currentColor;stroke-opacity:.5;stroke-width:1"/>` + pvdTx(X0 + i * (bw + gp) + bw / 2, y + 15, t, { a: 'middle', st: 'font-size:10px;font-weight:700' });
          o += pvdTx(8, y1 + 15, '렌즈 아래', { st: 'font-size:10px;font-weight:700' }) + pvdTx(8, y2 + 15, '측정 위치', { st: 'font-size:10px;font-weight:700' });
          const cur = s.col;
          o += [0, 1, 2].map(i => bl(i, y1, `W${i + 1} 노광`, cur === i)).join('') + [0, 1, 2].map(i => bl(i, y2, `W${i + 2} 측정`, cur === i)).join('');
          o += pvdTx(200, 284, '노광이 끝나는 순간 두 스테이지가 교대하며, 측정 시간은 노광 뒤에 가려진다', { a: 'middle', st: 'font-size:9.5px;opacity:.75' });
          return dgSvg('듀얼 스테이지: ' + s.label, o, '0 0 400 292');
        }
      },
    });

    Object.assign(DIAGRAMS, {
      // ---------- 6. 트랙-스캐너 클러스터와 웨이퍼 단면 변화 ----------
      'scan-process': {
        title: '노광 공정: 트랙과 스캐너',
        wide: true,
        states: [
          { id: 'plan', label: '클러스터 배치', desc: '스캐너는 단독으로 쓰이지 않고, 감광막을 바르고 현상하는 트랙과 옆에 붙어 하나의 클러스터(리소 셀)를 이룬다. 웨이퍼는 FOUP에서 나와 트랙에서 코팅과 베이크를 거쳐 인터페이스를 지나 스캐너에 들어가고, 노광이 끝나면 같은 길로 트랙에 돌아와 노광 후 베이크(PEB)와 현상을 거쳐 FOUP로 나간다. 웨이퍼가 클러스터를 떠나지 않으므로 대기에 노출되지 않고 대기 시간도 일정하게 관리된다.' },
        ],
        svg(s) {
          let o = scDefs('pr');
          if (s.id === 'plan') {
            o += pvdR(6, 40, 34, 190, 'url(#prMt)', { so: .6 }) + [0, 1, 2, 3].map(i => pvdR(11, 50 + i * 44, 24, 34, 'rgba(167,139,250,.25)', { so: .7, rx: 3 })).join('') + pvdTx(23, 244, '로드포트', { a: 'middle', st: 'font-size:9.5px;font-weight:700' }) + pvdTx(23, 256, '(FOUP)', { a: 'middle', st: 'font-size:9px;opacity:.8' });
            o += pvdR(44, 24, 218, 214, 'rgba(148,163,184,.08)', { so: .5, rx: 4 }) + pvdTx(153, 20, '트랙 (코터·디벨로퍼)', { a: 'middle', st: 'font-size:10px;font-weight:700' });
            o += pvdR(128, 34, 30, 194, 'rgba(251,191,36,.1)', { so: .35, dash: '3 3' }) + `<circle cx="143" cy="130" r="9" fill="url(#prMt)" stroke="currentColor" stroke-opacity=".7"/><path d="M143 130 L156 118" stroke="currentColor" stroke-width="2" stroke-opacity=".7"/>` + pvdTx(143, 154, '로봇', { a: 'middle', st: 'font-size:8.5px;opacity:.8' });
            o += [0, 1, 2, 3, 4].map(i => pvdR(52, 36 + i * 38, 66, 30, 'rgba(248,113,113,.14)', { so: .6, rx: 2 }) + pvdR(58, 40 + i * 38, 24, 8, 'rgba(248,113,113,.5)', { so: .5 }) + pvdR(58, 52 + i * 38, 24, 8, 'rgba(96,165,250,.5)', { so: .5 }) + pvdR(88, 40 + i * 38, 24, 8, 'rgba(248,113,113,.5)', { so: .5 }) + pvdR(88, 52 + i * 38, 24, 8, 'rgba(96,165,250,.5)', { so: .5 })).join('');
            o += pvdTx(52, 234, '베이크 · 냉각 플레이트', { st: 'font-size:8.5px;opacity:.8' });
            o += [[205, 70], [205, 124]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="22" fill="url(#prRs)" stroke="currentColor" stroke-opacity=".6"/><circle cx="${x}" cy="${y}" r="7" fill="url(#prSi)" stroke="currentColor" stroke-opacity=".5"/>`).join('') + [[205, 178], [205, 226 - 4]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="22" fill="url(#prBa)" stroke="currentColor" stroke-opacity=".6"/><circle cx="${x}" cy="${y}" r="7" fill="url(#prSi)" stroke="currentColor" stroke-opacity=".5"/>`).join('');
            o += pvdTx(236, 46, '코팅', { a: 'start', st: 'font-size:9px;font-weight:700;fill:#be185d' }) + pvdTx(236, 168, '현상', { a: 'start', st: 'font-size:9px;font-weight:700;fill:#0f766e' });
            o += pvdR(262, 76, 30, 138, 'rgba(45,212,191,.12)', { so: .6, rx: 3 }) + pvdTx(277, 148, '인터페이스', { a: 'middle', st: 'font-size:9px;font-weight:700;writing-mode:vertical-rl' });
            o += pvdR(292, 14, 102, 248, 'rgba(56,189,248,.07)', { so: .65, rx: 6 }) + pvdTx(343, 30, '스캐너', { a: 'middle', st: 'font-size:11px;font-weight:800' });
            o += `<path d="M318 44 H368 L356 92 H330 Z" style="fill:rgba(148,163,184,.12);stroke:currentColor;stroke-opacity:.6"/>` + scEl(343, 60, 18, 4, 'url(#prGl)') + scEl(343, 74, 13, 4, 'url(#prGl)') + `<rect x="338" y="92" width="10" height="8" fill="url(#prWt)"/>`;
            o += pvdR(300, 108, 40, 16, 'url(#prMt)', { so: .6 }) + pvdR(346, 108, 40, 16, 'url(#prMt)', { so: .6 }) + pvdR(302, 104, 36, 4, 'url(#prSi)', { so: .6, sw: .8 }) + pvdR(348, 104, 36, 4, 'url(#prSi)', { so: .6, sw: .8 }) + pvdTx(320, 138, '측정', { a: 'middle', st: 'font-size:9px;opacity:.85' }) + pvdTx(366, 138, '노광', { a: 'middle', st: 'font-size:9px;opacity:.85' });
            o += pvdR(300, 166, 86, 36, 'rgba(167,139,250,.14)', { so: .6, rx: 3 }) + pvdTx(343, 182, '레이저 · 조명', { a: 'middle', st: 'font-size:9px;opacity:.85' }) + pvdTx(343, 194, '레티클 라이브러리', { a: 'middle', st: 'font-size:9px;opacity:.85' });
            o += scAx(40, 100, 54, 100, '#7c3aed', 2.2) + scAx(262, 112, 296, 112, '#f59e0b', 2.4) + scAx(296, 176, 264, 176, '#f59e0b', 2.4) + scAx(54, 190, 40, 190, '#7c3aed', 2.2);
            o += pvdNum(23, 34, '1', '#a78bfa') + pvdNum(85, 22, '2', '#fb7185') + pvdNum(236, 70, '3', '#ec4899') + pvdNum(118, 62, '4', '#f87171') + pvdNum(343, 150, '5', '#38bdf8') + pvdNum(118, 138, '6', '#f87171') + pvdNum(236, 190, '7', '#14b8a6') + pvdNum(118, 188, '8', '#f87171');
            const L = [['1', '#a78bfa', 'FOUP 반입'], ['2', '#fb7185', '프라임(HMDS) 처리·냉각'], ['3', '#ec4899', '코팅 (BARC · 레지스트)'], ['4', '#f87171', '소프트 베이크 → 냉각'], ['5', '#38bdf8', '정렬 · 레벨링 · 노광'], ['6', '#f87171', '노광 후 베이크 (PEB)'], ['7', '#14b8a6', '현상 → 린스'], ['8', '#f87171', '하드 베이크 → FOUP 반출']];
            o += L.map(([n, c, t], i) => { const x = i < 4 ? 8 : 210, y = 278 + (i % 4) * 16; return pvdNum(x + 8, y - 3, n, c) + pvdTx(x + 22, y, t, { st: 'font-size:10px;font-weight:600;opacity:.95' }); }).join('');
            return dgSvg('노광 공정: ' + s.label, o, '0 0 400 344');
          }
          // 웨이퍼 단면의 변화
          const cell = (i, ttl, draw) => { const cx = 6 + (i % 3) * 132, cy = 6 + Math.floor(i / 3) * 132; return `<g transform="translate(${cx} ${cy})">` + pvdR(0, 0, 124, 96, 'rgba(148,163,184,.06)', { so: .3, rx: 4 }) + draw + pvdNum(12, 12, i + 1, '#38bdf8') + pvdTx(62, 112, ttl, { a: 'middle', st: 'font-size:10.5px;font-weight:700' }) + '</g>'; };
          const base = (bar) => pvdR(0, 76, 124, 20, 'url(#prSi)', { so: .6 }) + pvdR(0, 68, 124, 8, 'url(#prFl)', { so: .6, sw: .8 }) + (bar ? pvdR(0, 64, 124, 4, 'url(#prBa)', { so: .6, sw: .6 }) : '');
          const lines = [[18, 20], [54, 20], [90, 20]], res = (y, h, fill, extra = '') => lines.map(([x, w]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="currentColor" stroke-opacity=".5" stroke-width=".8" ${extra}/>`).join('');
          let c = '';
          c += cell(0, '① 하부 막 (식각할 막)', base(false) + `<text class="dg-t dg-lb dg-xs" x="62" y="50" text-anchor="middle">실리콘 + 하부 막</text>`);
          c += cell(1, '② 코팅 (BARC·감광막)', base(true) + pvdR(0, 40, 124, 24, 'url(#prRs)', { so: .6, sw: .8 }));
          c += cell(2, '③ 노광 → 잠상', base(true) + pvdR(0, 40, 124, 24, 'url(#prRs)', { so: .6, sw: .8 }) + [[0, 18], [38, 16], [74, 16], [110, 14]].map(([x, w]) => `<rect x="${x}" y="40" width="${w}" height="24" fill="#fff" fill-opacity=".55" stroke="#f59e0b" stroke-width="1" stroke-dasharray="2 2"/>${scAx(x + w / 2, 18, x + w / 2, 38, '#fbbf24', 1.4)}`).join('') + lines.map(([x, w]) => `<rect x="${x}" y="8" width="${w}" height="5" fill="currentColor" opacity=".85"/>`).join('') + pvdR(0, 4, 124, 4, 'url(#prQz)', { so: .5, sw: .7 }));
          c += cell(3, '④ PEB (반응 증폭·확산)', base(true) + pvdR(0, 40, 124, 24, 'url(#prRs)', { so: .6, sw: .8 }) + [[0, 17], [39, 14], [75, 14], [111, 13]].map(([x, w]) => `<path d="M${x} 40 H${x + w} Q${x + w + 3} 52 ${x + w} 64 H${x} Z" fill="#fff" fill-opacity=".55" stroke="#f59e0b" stroke-width="1" stroke-dasharray="2 2"/>`).join('') + pvdL('M20 26 q5 -7 10 0 t10 0 M62 26 q5 -7 10 0 t10 0', { c: '#ef4444', sw: 1.2, so: .85 }) + pvdTx(62, 16, '열', { a: 'middle', st: 'font-size:9px;fill:#ef4444;font-weight:700' }));
          c += cell(4, '⑤ 현상 → 패턴', base(true) + res(40, 24, 'url(#prRs)'));
          c += cell(5, '⑥ 식각·주입 후 PR 제거', pvdR(0, 76, 124, 20, 'url(#prSi)', { so: .6 }) + lines.map(([x, w]) => `<rect x="${x}" y="68" width="${w}" height="8" fill="url(#prFl)" stroke="currentColor" stroke-opacity=".6" stroke-width=".8"/>`).join(''));
          o += c;
          return dgSvg('노광 공정: ' + s.label, o, '0 0 400 276');
        }
      },

      // ---------- 7. 회절광과 NA ----------
      'scan-imaging': {
        title: '결상의 원리: 회절광을 렌즈가 모아야 상이 생긴다',
        wide: true,
        states: [
          { id: 'a', label: '피치가 큰 패턴', off: 52, ap: 74, imm: false, desc: '레티클의 반복 패턴은 빛을 여러 방향으로 회절시킨다. 곧게 가는 0차광과 양옆으로 퍼지는 ±1차광이 있고, 렌즈가 0차광과 ±1차광을 함께 모아야 웨이퍼 위에서 겹쳐 줄무늬(상)가 생긴다. 피치가 크면 ±1차광이 조금만 퍼져서 렌즈 안에 들어온다.' },
          { id: 'b', label: '피치가 작은 패턴', off: 104, ap: 74, imm: false, desc: '피치가 작아지면 ±1차광이 더 크게 벌어져 렌즈 입구 밖으로 나가 버린다. 0차광만 모이면 웨이퍼 위에는 균일한 빛만 닿아서 줄무늬가 생기지 않는다. 그래서 같은 렌즈로 찍을 수 있는 가장 작은 피치에는 한계가 있고, 이 한계가 해상도다.' },
          { id: 'c', label: 'NA를 키운 렌즈 (액침)', off: 104, ap: 118, imm: true, desc: '렌즈가 더 넓은 각도의 빛을 모을 수 있으면 같은 피치의 ±1차광도 포착된다. 렌즈와 웨이퍼 사이를 물로 채우면 빛의 파장이 물 속에서 짧아져 회절각이 작아지고, 렌즈가 모을 수 있는 최대 각도의 NA도 커진다. 그래서 같은 193 nm 광원으로 더 작은 패턴을 찍을 수 있다.' },
        ],
        svg(s) {
          let o = scDefs('im');
          const cx = 200, y0 = 46, yl = 158, yi = 286, ok = s.off <= s.ap;
          if (s.imm) o += `<rect x="40" y="226" width="320" height="60" fill="url(#imWt)" opacity=".6"/>` + pvdTx(352, 242, '물', { a: 'end', st: 'font-size:10px;font-weight:700;fill:#0369a1' });
          o += scAx(cx, 2, cx, 34, '#fbbf24', 2.6) + pvdTx(cx + 10, 16, '조명 (193 nm 평행광)', { st: 'font-size:10px;opacity:.85' });
          o += pvdR(cx - 80, 36, 160, 6, 'url(#imQz)', { so: .7 }) + Array.from({ length: 9 }, (_, i) => `<rect x="${cx - 76 + i * 18}" y="42" width="9" height="4" fill="currentColor" opacity=".85"/>`).join('') + pvdTx(cx - 84, 48, '레티클', { a: 'end', st: 'font-size:10px;font-weight:700' });
          o += pvdL(`M${cx} ${y0} V${ok ? yi : yl}`, { c: '#f59e0b', sw: 2, so: .9 });
          for (const sg of [-1, 1]) {
            const x = cx + sg * s.off;
            if (ok) o += pvdL(`M${cx} ${y0} L${x} ${yl}`, { c: '#3b82f6', sw: 2, so: .9 }) + pvdL(`M${x} ${yl} L${cx} ${yi}`, { c: '#3b82f6', sw: 2, so: .9 });
            else o += pvdL(`M${cx} ${y0} L${cx + sg * s.ap} ${y0 + (yl - y0) * s.ap / s.off}`, { c: '#3b82f6', sw: 2, so: .9 }) + pvdL(`M${cx + sg * s.ap} ${y0 + (yl - y0) * s.ap / s.off} L${x} ${yl}`, { c: '#3b82f6', sw: 1.4, so: .35, dash: '3 3' }) + `<path d="M${x - 5} ${yl - 5} l10 10 M${x + 5} ${yl - 5} l-10 10" stroke="#ef4444" stroke-width="2.4"/>`;
          }
          // 렌즈(조리개 한계)
          o += scEl(cx, yl, s.ap, 7, 'url(#imGl)', { sw: 1.4, so: .8 }) + pvdR(cx - 150, yl - 6, 150 - s.ap, 12, 'url(#imMt)', { so: .7, sw: 1 }) + pvdR(cx + s.ap, yl - 6, 150 - s.ap, 12, 'url(#imMt)', { so: .7, sw: 1 });
          o += pvdTx(cx, yl + 26, '투영 렌즈 (모을 수 있는 각도 = NA)', { a: 'middle', st: 'font-size:10px;font-weight:700' });
          // 웨이퍼 + 상
          o += pvdR(60, yi, 280, 6, 'url(#imRs)', { so: .6, sw: .8 }) + pvdR(60, yi + 6, 280, 8, 'url(#imSi)', { so: .6 });
          if (ok) { let d = ''; for (let x = 100; x <= 300; x += 2) d += `${d ? 'L' : 'M'}${x} ${268 - 12 * Math.cos((x - cx) / 100 * Math.PI * 4)} `; o += pvdL(d, { c: 'var(--hl-accent)', sw: 2.2, so: 1 }) + pvdTx(318, 262, '줄무늬(상)', { st: 'font-size:10px;font-weight:700;fill:var(--hl-accent)' }); }
          else o += pvdL('M100 268 H300', { c: 'var(--hl-accent)', sw: 2.2, so: 1 }) + pvdTx(318, 262, '균일 → 상 없음', { st: 'font-size:10px;font-weight:700;fill:#ef4444' });
          o += pvdTx(14, 100, '0차광', { st: 'font-size:10px;font-weight:700;fill:#b45309' }) + pvdTx(14, 114, '±1차광', { st: 'font-size:10px;font-weight:700;fill:#2563eb' });
          o += pvdTx(200, 318, ok ? '±1차광이 렌즈 안: NA ≥ λ / 피치 (상 생성)' : '±1차광이 렌즈 밖: NA < λ / 피치 (해상 불가)', { a: 'middle', st: 'font-size:10.5px;font-weight:700;fill:' + (ok ? '#0d9488' : '#ef4444') });
          return dgSvg('결상의 원리: ' + s.label, o, '0 0 400 326');
        }
      },
    });

    Object.assign(DIAGRAMS, {
      // ---------- 8. 층별 노광 장비 선택 ----------
      'scan-where': {
        title: '칩 단면과 층별 노광 장비',
        wide: true,
        states: [
          { id: 'all', label: '층마다 다른 장비', desc: '칩 하나는 수십 개의 패턴 층을 쌓아 만들고, 층마다 노광을 한 번 이상 한다. 가장 아래의 트랜지스터와 첫 배선층은 가장 가늘어서 ArF 액침이나 EUV로 찍고, 위로 올라갈수록 선이 굵어져 ArF 건식, KrF, i-line 같은 더 싸고 빠른 장비로 찍는다. 이렇게 층마다 필요한 해상도에 맞는 장비를 섞어 쓰는 것이 일반적이다. 그림은 개념도이고 층 수와 구성은 제품마다 다르다.' },
        ],
        svg(s) {
          let o = scDefs('wh');
          const X0 = 14, W = 280, tx = 304;
          const band = (y, h, fill) => pvdR(X0, y, W, h, fill, { so: .35, sw: .8 });
          o += pvdR(X0, 268, W, 24, 'url(#whSi)', { so: .6 }) + pvdTx(X0 + 6, 284, '실리콘 기판', { st: 'font-size:9.5px;font-weight:700' });
          // 트랜지스터 + 컨택
          o += band(244, 24, 'url(#whFl)');
          for (let i = 0; i < 11; i++) { const x = X0 + 14 + i * 25; o += pvdR(x, 252, 6, 14, '#a78bfa', { sw: .7, so: .8 }) + `<rect x="${x - 7}" y="264" width="6" height="4" fill="#60a5fa" opacity=".8"/><rect x="${x + 7}" y="264" width="6" height="4" fill="#60a5fa" opacity=".8"/>`; if (i % 2) o += pvdR(x + 8, 244, 3, 20, 'url(#whCu)', { sw: .5, so: .7 }); }
          // M1 (가장 가늘다)
          o += band(222, 22, 'url(#whFl)'); for (let i = 0; i < 13; i++) o += pvdR(X0 + 8 + i * 21, 226, 8, 11, 'url(#whCu)', { sw: .6, so: .7 }) + (i % 3 === 0 ? pvdR(X0 + 11 + i * 21, 237, 2.5, 7, 'url(#whCu)', { sw: .4 }) : '');
          // M2~M3
          o += band(192, 30, 'url(#whFl)'); for (let i = 0; i < 9; i++) o += pvdR(X0 + 8 + i * 30, 197, 12, 13, 'url(#whCu)', { sw: .6, so: .7 }) + pvdR(X0 + 8 + i * 30, 211, 12, 8, 'url(#whCu)', { sw: .6, so: .5 }) + (i % 2 ? pvdR(X0 + 12 + i * 30, 219, 4, 4, 'url(#whCu)', { sw: .4 }) : '');
          // 중간층
          o += band(154, 38, 'url(#whFl)'); for (let i = 0; i < 5; i++) o += pvdR(X0 + 10 + i * 54, 160, 24, 18, 'url(#whCu)', { sw: .7, so: .7 }) + pvdR(X0 + 18 + i * 54, 178, 8, 14, 'url(#whCu)', { sw: .5, so: .6 });
          // 굵은 상부층
          o += band(114, 40, 'url(#whFl)'); for (let i = 0; i < 3; i++) o += pvdR(X0 + 12 + i * 90, 120, 56, 22, 'url(#whCu)', { sw: .8, so: .8 }) + pvdR(X0 + 30 + i * 90, 142, 20, 12, 'url(#whCu)', { sw: .6, so: .6 });
          o += band(82, 32, 'url(#whFl)') + pvdR(X0 + 20, 90, 100, 18, 'url(#whCu)', { sw: .9, so: .9 }) + pvdR(X0 + 160, 90, 100, 18, 'url(#whCu)', { sw: .9, so: .9 }) + pvdTx(X0 + 70, 102, '패드 · 재배선', { a: 'middle', st: 'font-size:9px;font-weight:700;fill:#78350f' });
          // 브래킷
          const br = (y1, y2, c, l1, l2, l3) => pvdL(`M${tx - 6} ${y1} H${tx} V${y2} H${tx - 6}`, { c, sw: 2.4, so: .9 }) + pvdTx(tx + 8, (y1 + y2) / 2 - 6, l1, { st: `font-size:10.5px;font-weight:800;fill:${c}` }) + pvdTx(tx + 8, (y1 + y2) / 2 + 7, l2, { st: 'font-size:10px;font-weight:600;opacity:.95' }) + (l3 ? pvdTx(tx + 8, (y1 + y2) / 2 + 20, l3, { st: 'font-size:9.5px;opacity:.8' }) : '');
          o += br(192, 266, '#8b5cf6', '최미세층', 'ArF 액침', 'EUV');
          o += br(154, 190, '#0ea5e9', '중간층', 'ArF 건식', 'KrF');
          o += br(82, 152, '#10b981', '굵은 상부층', 'KrF', 'i-line');
          o += pvdTx(X0, 74, '위로 갈수록 선이 굵고 장비는 싸고 빠르다', { st: 'font-size:10px;font-weight:700;opacity:.85' });
          o += pvdTx(X0, 308, '※ 트랜지스터~M1 쪽이 가장 가늘고 비싼 노광, 위쪽은 해상도 여유가 커서 싼 노광', { st: 'font-size:9.5px;opacity:.7' });
          return dgSvg('칩 단면과 층별 노광 장비', o, '0 62 400 252');
        }
      },

      // ---------- 9. 감광막 단면 모양 ----------
      'scan-profile': {
        title: '감광막 패턴의 단면 모양과 공정 변수',
        wide: true,
        states: [
          { id: 'ok', label: '정상 패턴', desc: '도즈와 초점이 맞으면 감광막 선이 수직 측벽과 평평한 윗면을 가진 직사각형 단면으로 나온다. 선폭(CD)이 목표와 같고 높이도 충분해서, 뒤의 식각이 이 모양을 그대로 아래 막에 옮긴다.' },
          { id: 'dose', label: '노광량의 영향', desc: '양성 감광막은 빛을 받은 곳이 녹는다. 노광량이 부족하면 간격 쪽이 덜 녹아 선이 굵어지고 바닥에 잔막(스컴)이 남는다. 노광량이 과하면 선 가장자리까지 녹아 선이 가늘고 낮아지며 심하면 끊어진다. 선폭은 노광량에 가장 민감하게 반응한다.' },
          { id: 'focus', label: '초점의 영향', desc: '초점이 최적에서 벗어나면 상의 대비가 떨어져 측벽이 기울고 윗면이 둥글어지며 선 높이가 줄어든다. 위로 벗어났는지 아래로 벗어났는지에 따라 선폭이 굵어지거나 가늘어질 수 있고, 한도를 넘으면 패턴이 급격히 무너진다. 초점 심도가 작은 미세 패턴일수록 허용 범위가 좁다.' },
          { id: 'sw', label: '반사와 정재파', desc: '웨이퍼 표면에서 반사된 빛이 들어오는 빛과 간섭하면 감광막 두께 방향으로 강한 곳과 약한 곳이 번갈아 생기는 정재파가 만들어진다. 그 결과 측벽이 물결 모양 주름을 가진다. 감광막 아래의 반사 방지막(BARC)이 이 반사를 줄여 측벽을 매끈하게 만들고, 하부 막 두께 차이에 따른 선폭 변동도 줄인다.' },
        ],
        svg(s) {
          let o = scDefs('pf');
          const yb = 186, H = 68, xs = [86, 200, 314], W = 46;
          o += pvdR(14, yb + 4, 372, 26, 'url(#pfSi)', { so: .6 }) + pvdR(14, yb, 372, 4, 'url(#pfBa)', { so: .6, sw: .7 }) + pvdTx(22, yb + 22, '하부 막 · BARC', { st: 'font-size:9px;opacity:.85' });
          const poly = (pts, fill = 'url(#pfRs)') => `<polygon points="${pts}" style="fill:${fill};stroke:currentColor;stroke-opacity:.6;stroke-width:1"/>`;
          const ref = (x) => `<rect x="${x - W / 2}" y="${yb - H}" width="${W}" height="${H}" fill="none" stroke="var(--hl-accent)" stroke-width="1.2" stroke-dasharray="3 3" opacity=".8"/>`;
          const ideal = (x) => poly(`${x - W / 2},${yb} ${x - W / 2},${yb - H} ${x + W / 2},${yb - H} ${x + W / 2},${yb}`);
          const lab = (x, t1, t2) => pvdTx(x, 222 + 8, t1, { a: 'middle', st: 'font-size:10.5px;font-weight:700' }) + (t2 ? pvdTx(x, 244, t2, { a: 'middle', st: 'font-size:9.5px;opacity:.85' }) : '');
          if (s.id === 'ok') {
            o += xs.map(ideal).join('') + scAx(xs[1] - W / 2, 110, xs[1] + W / 2, 110, 'currentColor', 1.2) + scAx(xs[1] + W / 2, 110, xs[1] - W / 2, 110, 'currentColor', 1.2) + pvdTx(xs[1], 102, '선폭 CD', { a: 'middle', st: 'font-size:10.5px;font-weight:700' });
            o += pvdTx(200, 240, '수직 측벽 · 평평한 윗면 · 충분한 높이', { a: 'middle', st: 'font-size:11px;font-weight:700;fill:#0d9488' });
          } else if (s.id === 'dose') {
            o += xs.map(ref).join('');
            // 부족: 굵고 바닥 잔막
            o += poly(`${xs[0] - 34},${yb} ${xs[0] - 34},${yb - H + 4} ${xs[0] + 34},${yb - H + 4} ${xs[0] + 34},${yb}`) + `<rect x="${xs[0] - 58}" y="${yb - 5}" width="116" height="5" fill="url(#pfRs)" opacity=".8"/>`;
            o += ideal(xs[1]);
            o += poly(`${xs[2] - 14},${yb} ${xs[2] - 14},${yb - H + 16} ${xs[2] + 14},${yb - H + 16} ${xs[2] + 14},${yb}`);
            o += lab(xs[0], '노광량 부족', '굵은 선 · 바닥 잔막') + lab(xs[1], '적정', '목표 선폭') + lab(xs[2], '노광량 과다', '가는 선 · 낮은 높이');
          } else if (s.id === 'focus') {
            o += xs.map(ref).join('');
            o += poly(`${xs[0] - 28},${yb} ${xs[0] - 14},${yb - H + 14} ${xs[0] - 6},${yb - H + 6} ${xs[0] + 6},${yb - H + 6} ${xs[0] + 14},${yb - H + 14} ${xs[0] + 28},${yb}`);
            o += ideal(xs[1]);
            o += poly(`${xs[2] - 30},${yb} ${xs[2] - 22},${yb - H + 30} ${xs[2] - 10},${yb - H + 18} ${xs[2] + 10},${yb - H + 18} ${xs[2] + 22},${yb - H + 30} ${xs[2] + 30},${yb}`);
            o += lab(xs[0], '초점 벗어남 (−)', '기운 측벽 · 둥근 윗면') + lab(xs[1], '최적 초점', '수직 측벽') + lab(xs[2], '초점 벗어남 (+)', '더 낮고 넓게 퍼짐');
          } else {
            o += xs.map(ref).join('');
            let wav = (x, sg) => { let d = ''; for (let k = 0; k <= 8; k++) { const y = yb - k * (H / 8); const dx = (k % 2 ? 3.5 : 0); d += `${sg * (W / 2 + dx)},${y} `; } return d; };
            const L = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => `${xs[0] - W / 2 - (k % 2 ? 3.5 : 0)},${yb - k * (H / 8)}`).join(' '), R = [8, 7, 6, 5, 4, 3, 2, 1, 0].map(k => `${xs[0] + W / 2 + (k % 2 ? 3.5 : 0)},${yb - k * (H / 8)}`).join(' ');
            o += poly(L + ' ' + R);
            o += ideal(xs[1]) + poly(`${xs[2] - W / 2},${yb} ${xs[2] - W / 2},${yb - H} ${xs[2] + W / 2},${yb - H} ${xs[2] + W / 2},${yb}`);
            o += pvdR(14, yb, 372, 4, 'url(#pfBa)', { so: .6, sw: .7 });
            o += lab(xs[0], 'BARC 없음', '정재파 주름') + lab(xs[1], 'BARC 있음', '매끈한 측벽') + lab(xs[2], '기준', '');
            o += pvdTx(xs[2], 244, '반사가 줄어 안정', { a: 'middle', st: 'font-size:9.5px;opacity:.85' });
          }
          o += pvdTx(14, 20, s.id === 'ok' ? '' : '주황 점선 = 이상적인 모양', { st: 'font-size:10px;fill:var(--hl-accent);font-weight:700' });
          return dgSvg('감광막 단면: ' + s.label, o, '0 0 400 262');
        }
      },

      // ---------- 10. EUV 광학 ----------
      'scan-euv': {
        title: 'EUV 스캐너: 반사 광학과 다층막 거울',
        wide: true,
        states: [
          { id: 'path', label: '진공 속 광로', desc: 'EUV는 13.5 nm의 빛이라 유리를 포함한 거의 모든 물질과 공기에 흡수된다. 그래서 렌즈 대신 거울만 쓰고, 빛이 지나는 장비 안을 진공으로 유지한다. 떨어지는 주석(Sn) 방울에 CO₂ 레이저를 쏴 플라즈마를 만들고, 그 빛을 집광 거울이 중간 초점으로 모은다. 이후 조명계 거울과 반사형 레티클, 6장의 투영 거울을 거쳐 웨이퍼에 닿는다. 그림은 개념도다.' },
          { id: 'ml', label: '다층막 거울', desc: 'EUV 거울은 몰리브덴(Mo)과 실리콘(Si)을 한 쌍에 약 7 nm 두께로 수십 쌍 번갈아 쌓은 다층막이다. 각 경계면에서 조금씩 반사된 빛이 같은 위상으로 겹치도록 두께를 맞추면(브래그 반사) 13.5 nm 빛만 효율적으로 반사된다. 그래도 거울 한 장의 반사율은 약 70% 안팎이라, 거울이 여러 장이면 빛이 크게 줄어든다. 그래서 EUV 장비는 강력한 광원이 필요하다.' },
        ],
        svg(s) {
          let o = scDefs('eu');
          if (s.id === 'path') {
            o += pvdR(3, 3, 394, 334, 'none', { rx: 8, dash: '4 4', so: .35 }) + pvdTx(14, 330, '장비 전체가 진공', { st: 'font-size:9.5px;opacity:.75;font-weight:700' });
            // 광원
            o += pvdR(92, 16, 16, 12, 'url(#euMt)', { so: .7 }) + [34, 48, 62].map(y => `<circle cx="100" cy="${y}" r="2.4" fill="#94a3b8" stroke="currentColor" stroke-opacity=".6" stroke-width=".6"/>`).join('') + pvdR(92, 126, 16, 12, 'url(#euMt)', { so: .7 });
            o += `<path d="M68 16 Q32 76 68 136" style="fill:none;stroke:currentColor;stroke-opacity:.75;stroke-width:5;stroke-linecap:round"/><path d="M68 16 Q32 76 68 136" style="fill:none;stroke:#e2e8f0;stroke-opacity:.8;stroke-width:2;stroke-linecap:round"/>`;
            o += `<circle cx="100" cy="82" r="9" fill="url(#euPl2)"/><circle cx="100" cy="82" r="4" fill="#c4b5fd"/>`;
            o += scAx(4, 82, 92, 82, '#ef4444', 2.2) + pvdTx(4, 72, 'CO₂', { st: 'font-size:9.5px;font-weight:700;fill:#dc2626' }) + pvdTx(4, 98, '레이저', { st: 'font-size:9.5px;font-weight:700;fill:#dc2626' });
            o += [[54, 46], [50, 76], [54, 106]].map(([x, y]) => pvdL(`M100 82 L${x} ${y} L132 150`, { c: '#fbbf24', sw: 1.2, so: .7 })).join('') + `<circle cx="132" cy="150" r="3.4" fill="#fbbf24" stroke="currentColor" stroke-opacity=".6"/>`;
            // 조명 거울
            const mir = (x, y, a, w = 22, c = '#94a3b8') => `<g transform="rotate(${a} ${x} ${y})"><rect x="${x - w / 2}" y="${y - 2.5}" width="${w}" height="5" rx="1.5" style="fill:url(#euMt);stroke:currentColor;stroke-opacity:.8;stroke-width:1"/></g>`;
            o += mir(172, 200, -30) + mir(214, 168, 28) + pvdL('M132 150 L172 200 L214 168 L238 44', { c: '#fbbf24', sw: 1.6, so: .85 });
            // 레티클
            o += `<rect x="216" y="32" width="46" height="6" style="fill:url(#euQz);stroke:currentColor;stroke-opacity:.8"/>` + Array.from({ length: 8 }, (_, i) => `<rect x="${219 + i * 5.4}" y="38" width="2.8" height="2.4" fill="currentColor" opacity=".85"/>`).join('') + pvdTx(240, 24, '반사형 레티클', { a: 'middle', st: 'font-size:9.5px;font-weight:700' });
            // 투영 거울 6장
            const P = [[296, 112], [352, 82], [358, 174], [300, 216], [352, 256], [300, 292]], ang = [-30, 40, -20, 30, -30, 20];
            o += pvdL(`M240 40 L${P.map(p => p.join(' ')).join(' L')} L326 318`, { c: '#fbbf24', sw: 1.6, so: .85 });
            o += P.map((p, i) => mir(p[0], p[1], ang[i], 26)).join('') + P.map((p, i) => pvdTx(p[0] + (p[0] > 330 ? 16 : -14), p[1] + 3, 'M' + (i + 1), { a: p[0] > 330 ? 'start' : 'end', st: 'font-size:9px;font-weight:700' })).join('');
            o += pvdR(296, 318, 60, 5, 'url(#euSi)', { so: .6 }) + `<rect x="296" y="316.6" width="60" height="1.6" fill="url(#euRs)"/>` + pvdTx(326, 334, '웨이퍼', { a: 'middle', st: 'font-size:9.5px;font-weight:700' });
            o += pvdTx(56, 150, '집광 거울', { st: 'font-size:9.5px;font-weight:700' }) + pvdTx(138, 156, '중간 초점', { st: 'font-size:9.5px;font-weight:700;opacity:.9' }) + pvdTx(114, 34, '주석 방울', { st: 'font-size:9px;opacity:.9' }) + pvdTx(114, 98, '플라즈마', { st: 'font-size:9px;opacity:.9;font-weight:700' }) + pvdTx(118, 218, '조명계 거울', { st: 'font-size:9.5px;font-weight:700' }) + pvdTx(176, 276, '투영 거울 6장 →', { st: 'font-size:9.5px;font-weight:700' });
            return dgSvg('EUV 스캐너: ' + s.label, o, '0 0 400 342');
          }
          const x0 = 100, w = 200, y0 = 124, n = 16, th = 6;
          o += pvdR(x0, y0 + n * th + 4, w, 30, 'url(#euSi)', { so: .6 }) + pvdTx(x0 + w / 2, y0 + n * th + 24, '기판 (열팽창이 극히 작은 유리)', { a: 'middle', st: 'font-size:9.5px;font-weight:700' });
          for (let i = 0; i < n; i++) o += `<rect x="${x0}" y="${y0 + 4 + i * th}" width="${w}" height="${th}" style="fill:${i % 2 ? '#e2e8f0' : '#f59e0b'};fill-opacity:${i % 2 ? .55 : .7};stroke:currentColor;stroke-opacity:.25;stroke-width:.5"/>`;
          o += pvdR(x0, y0, w, 4, '#2dd4bf', { sw: .6, so: .7 });
          // 반사 경로
          o += scAx(30, 40, 150, y0, '#a78bfa', 2.6) + pvdL('M150 124 L270 40', { c: '#a78bfa', sw: 3, so: .95 }) + `<path d="M265 46 l6 -8 l-9 1 z" fill="#a78bfa"/>`;
          [[0, 1], [1, 2], [2, 3]].forEach(([a, b], k) => { const y = y0 + 4 + (k + 1) * th * 2; o += pvdL(`M${150 + (y - y0) * .9} ${y} L${270 - (y - y0) * .6 + 12} ${y - 70 - (y - y0) * .4}`, { c: '#a78bfa', sw: 1.2, so: .5, dash: '3 2' }); });
          o += pvdTx(300, 74, '표면 + 각 경계면에서', { st: 'font-size:9.5px;font-weight:700' }) + pvdTx(300, 87, '조금씩 반사된 빛이', { st: 'font-size:9.5px;font-weight:700' }) + pvdTx(300, 100, '같은 위상으로 겹침', { st: 'font-size:9.5px;font-weight:700' });
          o += pvdL(`M${x0 + w + 8} ${y0 + 4} V${y0 + 4 + th * 2}`, { sw: 1.2, so: .7 }) + pvdTx(x0 + w + 14, y0 + 14, '한 쌍 ≈ 7 nm', { st: 'font-size:9.5px;font-weight:700' }) + pvdTx(x0 + w + 14, y0 + 28, '(Mo+Si) 40~50쌍', { st: 'font-size:9.5px;opacity:.9' });
          o += pvdTx(x0 - 6, y0 + 50, 'Si', { a: 'end', st: 'font-size:9.5px;font-weight:700;opacity:.85' }) + pvdTx(x0 - 6, y0 + 56 - 6 + 6, '', {}) + pvdTx(x0 - 6, y0 + 38, 'Mo', { a: 'end', st: 'font-size:9.5px;font-weight:700;fill:#b45309' }) + pvdTx(x0 - 6, y0 + 4, '보호막', { a: 'end', st: 'font-size:9px;opacity:.8' });
          o += pvdTx(200, 266, '한 장의 반사율 ≈ 70% 안팎 → 6장을 지나면 약 12%만 남는다 (0.7⁶)', { a: 'middle', st: 'font-size:10.5px;font-weight:700;fill:#7c3aed' });
          o += pvdTx(200, 282, '(레티클·조명 거울까지 합치면 광원 출력의 수 % 이하)', { a: 'middle', st: 'font-size:9.5px;opacity:.8' });
          return dgSvg('EUV 스캐너: ' + s.label, o, '0 0 400 294');
        }
      },
    });

        Object.assign(DIAGRAMS, {
          'scan-transfer': {
            title: '노광이 하는 일: 패턴이 옮겨지는 과정',
            wide: true,
            states: [{ id: 'xs', label: '웨이퍼 단면의 변화', desc: '같은 웨이퍼를 단면으로 보면 패턴이 만들어지는 과정이 보인다. 반사 방지막(BARC)과 감광막을 바르고(②), 스캐너가 패턴 모양으로 빛을 비추면 감광막 안에 눈에 안 보이는 잠상이 생긴다(③). PEB로 화학 반응이 증폭되며 퍼지고(④), 현상액이 노광된 부분을 녹여 내면 패턴이 드러난다(⑤). 이 감광막을 마스크 삼아 식각하거나 이온을 주입한 뒤 감광막을 벗겨 내면 하부 막에 패턴이 옮겨진다(⑥).' }],
            svg(s) { return DIAGRAMS['scan-process'].svg(s); }
          },
        });


    // ===== PECVD 장비 가이드용 그림 (pvd_diagrams.js 의 pvd* 도우미를 같이 쓴다) =====
    const pcDefs = (p) => pvdDefs(p) + `<defs>
      <linearGradient id="${p}Cr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fde68a" stop-opacity=".55"/><stop offset=".5" stop-color="#fef3c7" stop-opacity=".6"/><stop offset="1" stop-color="#fde68a" stop-opacity=".55"/></linearGradient>
      <linearGradient id="${p}Ox" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dd3fc" stop-opacity=".62"/><stop offset="1" stop-color="#38bdf8" stop-opacity=".5"/></linearGradient>
      <linearGradient id="${p}Nt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c4b5fd" stop-opacity=".7"/><stop offset="1" stop-color="#a78bfa" stop-opacity=".55"/></linearGradient>
      <linearGradient id="${p}Ht" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fca5a5" stop-opacity=".55"/><stop offset="1" stop-color="#f87171" stop-opacity=".4"/></linearGradient>
      <linearGradient id="${p}Lk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5eead4" stop-opacity=".5"/><stop offset="1" stop-color="#2dd4bf" stop-opacity=".32"/></linearGradient>
    </defs>`;
    // n개로 나눈 구멍 난 판(단면): 구멍 사이의 판 조각만 그린다
    const pcHoles = (x0, x1, y, h, n, fill, gap = 4) => { const pitch = (x1 - x0) / n; let o = ''; for (let i = 0; i < n; i++) o += pvdR(+(x0 + i * pitch + gap / 2).toFixed(1), y, +(pitch - gap).toFixed(1), h, fill, { sw: 1, so: .65 }); return o; };
    const pcAr = (x1, y1, x2, y2, c, w = 1.6, dash) => { const a = Math.atan2(y2 - y1, x2 - x1), h = 5.5, p = (t) => `${(x2 - h * Math.cos(a + t)).toFixed(1)},${(y2 - h * Math.sin(a + t)).toFixed(1)}`; return `<path d="M${x1} ${y1} L${x2} ${y2}" style="fill:none;stroke:${c};stroke-width:${w};stroke-linecap:round${dash ? ';stroke-dasharray:' + dash : ''}"/><path d="M${x2} ${y2} L${p(.45)} L${p(-.45)} Z" fill="${c}"/>`; };
    const pcDot = (x, y, r, fill, o = {}) => `<circle cx="${x}" cy="${y}" r="${r}" style="fill:${o.nofill ? 'none' : fill};stroke:${o.nofill ? fill : 'none'};stroke-width:1.5"/>`;
    const pcLab = (x, y, t, px, py, a = 'start', c) => `<path d="M${px} ${py} L${a === 'end' ? x + 3 : x - 3} ${y - 3}" style="fill:none;stroke:currentColor;stroke-width:.9;stroke-opacity:.45"/><circle cx="${px}" cy="${py}" r="1.8" fill="currentColor" opacity=".65"/>` + pvdTx(x, y, t, { a, st: `font-size:10.5px;font-weight:600;opacity:.95${c ? ';fill:' + c : ''}` });

    Object.assign(DIAGRAMS, {
      // ---------- 1. 장비 전체 구성 (평면) ----------
      'pecvd-overview': {
        title: 'PECVD 장비의 전체 구성 (위에서 본 모습)',
        wide: true,
        states: [
          { id: 'all', label: '전체 구성', desc: '웨이퍼 통(FOUP)이 놓이는 앞쪽부터 대기 로봇(EFEM) → 로드락 → 진공 이송 챔버 → 공정 챔버 순으로 이어지는 클러스터형 구조다. 공정 챔버에서 막이 쌓이고, 장비 뒤쪽·아래층의 유틸리티(가스, RF 전원, 칠러, 펌프)가 챔버를 받친다.' },
          { id: 'flow', label: '웨이퍼가 지나가는 길', focus: ['path', 'fp', 'll', 'tm'], desc: '대기 로봇이 FOUP에서 웨이퍼를 꺼내 로드락에 넣고, 로드락이 진공으로 바뀌면 이송 챔버의 로봇이 웨이퍼를 공정 챔버로 옮긴다. 공정이 끝난 웨이퍼는 같은 길로 되돌아간다. 웨이퍼가 대기를 만나는 구간은 앞쪽의 EFEM까지다.' },
          { id: 'pm', label: '공정 챔버', focus: ['pm'], desc: '막이 쌓이는 곳이다. 한 챔버에 웨이퍼 자리가 둘인 쌍둥이(트윈) 챔버가 많이 쓰이는데, 두 자리가 가스 공급과 배기를 나눠 쓰면서 웨이퍼를 동시에 처리해 처리량을 늘린다. 한 장비에 같은 막을 쌓는 챔버를 여러 개 붙이는 것이 보통이다.' },
          { id: 'util', label: '유틸리티', focus: ['util', 'pm'], desc: '가스 패널(MFC), RF 발생기, 챔버 벽·샤워헤드를 식히는 칠러, 진공 펌프와 배기가스 처리기(스크러버)가 챔버를 받친다. 실란(SiH₄)은 불이 붙는 가스라 가스 캐비닛, 누설 감지, 배기 처리가 장비 못지않게 중요하다.' }
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g), acc = 'var(--hl-accent)';
          let o = pcDefs('po');
          // 구역(클린룸 / 서브팹)
          o += pvdG(f, ['util'], pvdR(14, 404, 372, 66, 'rgba(45,212,191,.05)', { rx: 10, dash: '3 4', so: .35 }) + pvdTx(200, 418, '유틸리티 (장비 뒤쪽 · 아래층)', { a: 'middle', st: 'opacity:.55;font-size:9.5px;font-weight:700;letter-spacing:.06em' }));
          // 이송 챔버
          o += pvdG(f, ['tm'], `<polygon points="140,112 260,112 280,172 260,232 140,232 120,172" style="fill:url(#poMt);stroke:currentColor;stroke-opacity:.7;stroke-width:1.3"/>` + pvdTx(200, 142, '진공 이송 챔버', { a: 'middle', st: 'font-size:10px;opacity:.75' })
            + `<circle cx="200" cy="184" r="15" style="fill:url(#poCr);stroke:currentColor;stroke-opacity:.7"/>` + pvdL('M200 184 L172 160 M200 184 L172 208', { sw: 2.2 }) + pvdR(152, 156, 22, 5, 'url(#poSi)', { sw: .8 }) + pvdR(152, 204, 22, 5, 'url(#poSi)', { sw: .8 }));
          // 공정 챔버: 위 2, 왼쪽 트윈, 오른쪽 트윈
          const pm = (x, y, w, h, n) => pvdR(x, y, w, h, 'rgba(167,139,250,.14)', { rx: 8, so: .75 }) + (n === 2 ? `<circle cx="${x + w / 2}" cy="${y + h * .3}" r="14" style="fill:url(#poPl2);stroke:currentColor;stroke-opacity:.7;stroke-width:1.1"/><circle cx="${x + w / 2}" cy="${y + h * .72}" r="14" style="fill:url(#poPl2);stroke:currentColor;stroke-opacity:.7;stroke-width:1.1"/>` : `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="15" style="fill:url(#poPl2);stroke:currentColor;stroke-opacity:.7;stroke-width:1.1"/>`);
          o += pvdG(f, ['pm'], pm(140, 24, 52, 70, 1) + pm(208, 24, 52, 70, 1) + pm(20, 122, 80, 100, 2) + pm(300, 122, 80, 100, 2));
          o += pvdG(f, ['pm', 'tm'], pvdR(152, 94, 28, 18, 'url(#poMt)') + pvdR(220, 94, 28, 18, 'url(#poMt)') + pvdR(100, 160, 20, 24, 'url(#poMt)') + pvdR(280, 160, 20, 24, 'url(#poMt)'));
          o += pvdG(f, ['pm'], pvdTx(166, 104, 'PM', { a: 'middle', st: 'font-size:9px;opacity:.7' }) + pvdTx(60, 232, '트윈 챔버', { a: 'middle', st: 'font-size:10px;opacity:.8' }) + pvdTx(340, 232, '트윈 챔버', { a: 'middle', st: 'font-size:10px;opacity:.8' }));
          // 로드락
          o += pvdG(f, ['ll'], pvdR(140, 244, 52, 44, 'url(#poLk)', { rx: 6 }) + pvdR(208, 244, 52, 44, 'url(#poLk)', { rx: 6 }) + pvdTx(166, 270, '로드락', { a: 'middle', st: 'font-size:10px;opacity:.85' }) + pvdTx(234, 270, '로드락', { a: 'middle', st: 'font-size:10px;opacity:.85' })
            + pvdR(152, 232, 28, 12, 'url(#poMt)') + pvdR(220, 232, 28, 12, 'url(#poMt)') + pvdR(152, 288, 28, 8, 'url(#poMt)') + pvdR(220, 288, 28, 8, 'url(#poMt)'));
          // EFEM + FOUP
          o += pvdG(f, ['fp'], pvdR(40, 298, 320, 44, 'rgba(56,189,248,.09)', { rx: 6, so: .6 }) + pvdTx(60, 312, 'EFEM (대기)', { st: 'font-size:10px;opacity:.75' })
            + `<circle cx="200" cy="326" r="9" style="fill:url(#poCr);stroke:currentColor;stroke-opacity:.7"/>` + pvdL('M200 326 L172 318', { sw: 2 })
            + [88, 168, 248].map((x, i) => pvdR(x, 360, 56, 32, 'url(#poOx)', { rx: 5 }) + pvdTx(x + 28, 380, 'FOUP', { a: 'middle', st: 'font-size:10px;font-weight:700' }) + pvdR(x + 8, 342, 40, 10, 'url(#poMt)')).join(''));
          // 유틸리티
          o += pvdG(f, ['util'], [['가스 패널', 'MFC', 22, 'rgba(56,189,248,.18)'], ['RF 발생기', 'HF · LF', 114, 'rgba(167,139,250,.18)'], ['칠러', '냉각수', 206, 'rgba(45,212,191,.16)'], ['펌프 · 스크러버', '진공 · 배기', 298, 'rgba(251,113,133,.16)']].map(([a, b, x, c]) => pvdR(x, 426, 80, 36, c, { rx: 6, so: .8 }) + pvdTx(x + 40, 442, a, { a: 'middle', st: 'font-size:10px;font-weight:700' }) + pvdTx(x + 40, 455, b, { a: 'middle', st: 'font-size:9px;opacity:.75' })).join('')
            + pvdL('M62 426 V400 H30 V196 H20', { c: '#38bdf8', so: .55, dash: '3 3' }) + pvdL('M154 426 V404 H44 V212 H32', { c: '#a78bfa', so: .55, dash: '3 3' }) + pvdL('M338 426 V400 H370 V222 H378', { c: '#fb7185', so: .55, dash: '3 3' }));
          // 웨이퍼 경로
          if (hot(['path'])) o += dgFlow('M200 368 V336 L172 318 V300 V258 V232 L172 190 L130 172');
          // 번호
          o += pvdG(f, ['fp'], pvdNum(24, 322, '1', '#38bdf8'));
          o += pvdG(f, ['ll'], pvdNum(280, 266, '2', '#2dd4bf'));
          o += pvdG(f, ['tm'], pvdNum(244, 172, '3', '#34d399'));
          o += pvdG(f, ['pm'], pvdNum(212, 54, '4', '#a78bfa') + pvdNum(24, 128, '4', '#a78bfa'));
          o += pvdG(f, ['util'], pvdNum(18, 444, '5', '#f59e0b'));
          return dgSvg('PECVD 장비 전체 구성: ' + s.label, o, '0 0 400 478');
        }
      },

      // ---------- 2. 챔버 단면 (핵심 구조도) ----------
      'pecvd-chamber': {
        title: 'PECVD 챔버 단면',
        wide: true,
        states: [
          { id: 'all', label: '전체 단면', desc: '위쪽의 샤워헤드(RF 전극)와 아래쪽의 히터(접지 전극)가 마주 보는 평행 평판 구조다. 샤워헤드가 가스를 고르게 뿌리고, RF를 걸면 두 판 사이에 플라즈마가 켜진다. 웨이퍼는 가열된 히터 위에 놓여 있고, 반응 부산물은 둘레의 배기 통로로 빠진다.' },
          { id: 'gas', label: '가스·샤워헤드', focus: ['gas', 'sh', 'rps'], desc: '가스 박스의 MFC가 가스마다 유량을 정해 챔버 위로 보낸다. 가스는 샤워헤드 안에서 한 번 퍼진 뒤 구멍 수천 개를 지나 웨이퍼 위로 고르게 내려간다. 맨 위의 원격 플라즈마 소스(RPS)는 공정 때는 쉬고, 챔버 세정 때 NF₃를 쪼개 불소 라디칼을 챔버로 보낸다.' },
          { id: 'rf', label: 'RF·플라즈마', focus: ['rf', 'sh', 'pl', 'ht'], desc: 'RF 발생기의 전력이 매처를 거쳐 샤워헤드에 걸린다. 마주 보는 히터와 챔버 벽은 접지라서 두 판 사이에 전기장이 생기고, 그 안에서 가스가 쪼개져 플라즈마가 켜진다. 샤워헤드는 세라믹 절연체로 챔버 몸통과 전기적으로 떨어져 있다. 매처는 반사되는 전력을 줄이는 장치다.' },
          { id: 'wafer', label: '웨이퍼·히터', focus: ['wf', 'ht', 'mv'], desc: '웨이퍼는 슬릿 밸브를 통해 들어와 히터 위에 올려진다. 히터(서셉터)는 세라믹이나 금속 안에 발열체가 들어 있어 웨이퍼를 공정 온도(보통 300~400 °C대)로 데우고, 접지 전극 역할도 한다. 가장자리의 링은 웨이퍼 둘레의 열과 플라즈마 분포를 고르게 한다.' },
          { id: 'vac', label: '배기·압력', focus: ['vac', 'body', 'mv'], desc: '스로틀 밸브가 열린 정도를 바꿔 챔버 압력을 몇 Torr로 맞추고, 드라이 펌프가 반응 부산물과 남은 가스를 뽑아낸다. 배기 통로는 웨이퍼 둘레를 따라 둘러 있어 가스가 중심에서 가장자리로 흐른다. 이 흐름이 막 두께의 균일도와 직결된다.' }
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g), acc = 'var(--hl-accent)';
          let o = pcDefs('pk');
          // 플라즈마(뒤)
          o += pvdG(f, ['pl'], `<ellipse cx="200" cy="148" rx="84" ry="30" fill="url(#pkPl)"/>`);
          // 몸통 + 뚜껑
          o += pvdG(f, ['body', 'vac'], pvdR(96, 50, 208, 10, 'url(#pkMt)') + pvdR(96, 60, 20, 270, 'url(#pkMt)') + pvdR(284, 60, 20, 130, 'url(#pkMt)') + pvdR(284, 214, 20, 116, 'url(#pkMt)')
            + pvdR(96, 330, 28, 12, 'url(#pkMt)') + pvdR(170, 330, 134, 12, 'url(#pkMt)'));
          // 세라믹 절연체 (RF)
          o += pvdG(f, ['rf', 'sh'], pvdR(116, 60, 8, 56, 'url(#pkCr)', { so: .6 }) + pvdR(276, 60, 8, 56, 'url(#pkCr)', { so: .6 }));
          // 샤워헤드: 플레넘·블로커·페이스플레이트
          o += pvdG(f, ['sh', 'gas'], pvdR(124, 60, 152, 26, 'rgba(56,189,248,.13)', { so: .0 })
            + pcHoles(124, 276, 86, 4, 10, 'url(#pkMt)', 6) + pvdR(124, 90, 152, 14, 'rgba(56,189,248,.08)', { so: .0 }) + pcHoles(124, 276, 104, 8, 15, 'url(#pkMt)', 5)
            + pvdR(124, 60, 4, 52, 'url(#pkMt)') + pvdR(272, 60, 4, 52, 'url(#pkMt)'));
          // 가스 입구 + RPS
          o += pvdG(f, ['gas', 'rps'], pvdR(172, 6, 56, 28, 'rgba(244,114,182,.16)', { rx: 5, so: .8 }) + pvdTx(200, 18, 'RPS', { a: 'middle', st: 'font-size:10px;font-weight:700' }) + pvdTx(200, 29, '(세정용)', { a: 'middle', st: 'font-size:8.5px;opacity:.7' })
            + pvdL('M200 34 V60', { c: '#f472b6', sw: 2.6, so: .65 }) + pvdR(322, 10, 66, 28, 'rgba(56,189,248,.18)', { rx: 5, so: .8 }) + pvdTx(355, 22, '가스 박스', { a: 'middle', st: 'font-size:10px;font-weight:700' }) + pvdTx(355, 33, 'MFC · 밸브', { a: 'middle', st: 'font-size:8.5px;opacity:.75' })
            + pvdL('M322 24 H300 V47 H200', { c: '#38bdf8', sw: 3, so: .7 }) + (hot(['gas']) ? dgFlow('M318 24 H304 V47 H204 V58') : pcAr(190, 40, 190, 56, '#38bdf8', 1.4)));
          // 샤워헤드에서 내려오는 가스
          if (hot(['gas'])) o += pvdG(f, ['gas'], [146, 174, 200, 226, 254].map(x => dgFlow(`M${x} 114 V170`)).join(''));
          // RF 발생기·매처
          o += pvdG(f, ['rf'], pvdR(14, 14, 62, 26, 'rgba(167,139,250,.2)', { rx: 5, so: .8 }) + pvdTx(45, 25, 'RF 전원', { a: 'middle', st: 'font-size:10px;font-weight:700' }) + pvdTx(45, 35, 'HF · LF', { a: 'middle', st: 'font-size:8.5px;opacity:.75' })
            + pvdR(14, 64, 62, 26, 'rgba(167,139,250,.14)', { rx: 5, so: .8 }) + pvdTx(45, 81, '매처', { a: 'middle', st: 'font-size:10px;font-weight:700' })
            + pvdL('M45 40 V64', { c: '#a78bfa', sw: 1.8, so: .9 }) + pvdL('M76 77 H100 V108 H124', { c: '#a78bfa', sw: 2, so: .95 }) + `<circle cx="124" cy="108" r="2.6" fill="#a78bfa"/>`);
          // 플라즈마 시스(점선)
          o += pvdG(f, ['pl'], pvdL('M132 122 H268', { so: .35, dash: '2 3' }) + pvdL('M132 172 H268', { so: .35, dash: '2 3' }));
          // 배기 통로 (웨이퍼 둘레): 배기 링
          o += pvdG(f, ['vac', 'wf'], pvdR(116, 124, 12, 52, 'url(#pkCr)', { so: .55 }) + pvdR(272, 124, 12, 52, 'url(#pkCr)', { so: .55 }));
          // 웨이퍼, 엣지링, 히터
          o += pvdG(f, ['wf', 'ht'], pvdR(148, 178, 104, 5, 'url(#pkSi)') + pvdR(134, 176, 14, 8, 'url(#pkCr)', { so: .6 }) + pvdR(252, 176, 14, 8, 'url(#pkCr)', { so: .6 })
            + pvdR(134, 184, 132, 32, 'url(#pkHt)', { rx: 2 }) + pvdL('M142 204 h10 l4 -7 l8 14 l8 -14 l8 14 l8 -14 l8 14 l8 -14 l8 14 l8 -14 l8 14 l4 -7 h10', { c: '#f87171', so: .85, sw: 1.3 })
            + pvdTx(200, 196, '히터 (서셉터) · 접지', { a: 'middle', st: 'font-size:9.5px;opacity:.9' })
            + pvdR(192, 216, 16, 114, 'url(#pkMt)') + [0, 1, 2, 3, 4].map(i => pvdL(`M186 ${286 + i * 8} H214`, { so: .6 })).join(''));
          // 이송: 슬릿 밸브
          o += pvdG(f, ['mv', 'vac'], pvdR(304, 188, 12, 28, 'url(#pkMt)') + pvdR(316, 184, 62, 36, 'rgba(45,212,191,.07)', { rx: 6, dash: '3 4', so: .5 }) + pvdTx(347, 197, '이송 챔버', { a: 'middle', st: 'font-size:9px;opacity:.7' })
            + pvdL('M372 210 L320 202', { sw: 2.2, so: .7 }) + pvdR(284, 200, 40, 3, 'url(#pkSi)', { sw: .8 }) + (hot(['mv']) ? dgFlow('M336 206 H294') : ''));
          // 배기: 스로틀 밸브 + 펌프
          o += pvdG(f, ['vac'], pvdR(126, 342, 44, 16, 'url(#pkMt)') + pvdR(138, 346, 20, 8, '#94a3b8', { so: .5 }) + pvdR(120, 358, 56, 52, 'url(#pkMt)', { rx: 6 })
            + [0, 1, 2].map(i => pvdL(`M130 ${370 + i * 12} L148 ${376 + i * 12} L166 ${370 + i * 12}`, { so: .55 })).join('')
            + pvdTx(148, 424, '드라이 펌프', { a: 'middle', st: 'font-size:10px;font-weight:700' })
            + pvdL('M276 148 H282 V320 H124', { c: '#2dd4bf', sw: 1.6, so: .55, dash: '3 3' }) + (hot(['vac']) ? dgFlow('M270 168 V318 H146 V340') : ''));
          // 간격 치수
          o += pvdG(f, ['sh', 'pl', 'wf'], dgArrow(236, 146, 236, 117) + dgArrow(236, 146, 236, 176) + pvdTx(244, 150, '간격', { st: 'font-size:9.5px;opacity:.75' }));
          // 번호 호출선
          o += pvdCall(f, ['gas', 'rps'], '1', '#f472b6', 158, 20, 148, 18, ['가스 입구', '· RPS'], 172, 20, 'end');
          o += pvdCall(f, ['sh'], '2', '#fb7185', 330, 78, 342, 82, ['샤워헤드', '(RF 전극)'], 276, 82);
          o += pvdCall(f, ['pl'], '3', '#a78bfa', 330, 130, 342, 134, ['플라즈마'], 268, 142);
          o += pvdCall(f, ['wf'], '4', '#f59e0b', 330, 160, 342, 164, ['웨이퍼 · ', '엣지 링'], 252, 179);
          o += pvdG(f, ['rf'], pvdNum(18, 112, '6', '#a78bfa') + pvdTx(30, 116, 'RF·매처', { st: 'font-size:10.5px;font-weight:600;opacity:.95' }));
          o += pvdCall(f, ['ht'], '5', '#f87171', 330, 256, 342, 260, ['히터', '(서셉터)'], 266, 204);
          o += pvdCall(f, ['mv'], '8', '#34d399', 330, 238, 342, 242, ['슬릿 밸브'], 316, 214);
          o += pvdCall(f, ['vac'], '7', '#2dd4bf', 220, 346, 232, 350, ['스로틀 밸브', '· 배기'], 170, 350);
          return dgSvg('PECVD 챔버 단면: ' + s.label, o, '0 0 400 436');
        }
      },

      // ---------- 3. 샤워헤드 ----------
      'pecvd-showerhead': {
        title: '샤워헤드: 가스를 고르게 뿌리는 전극',
        wide: true,
        states: [
          { id: 'sec', label: '단면', desc: '가스는 위의 입구로 들어와 블로커 판의 구멍을 지나며 한 번 퍼지고, 얇은 페이스플레이트의 구멍 수천 개를 지나 웨이퍼 위로 내려간다. 블로커 판은 가스가 중앙으로만 쏠리지 않게 하는 칸막이다. 페이스플레이트는 RF를 받는 전극이라서 이 판의 상태가 플라즈마와 두께 분포를 정한다.' },
          { id: 'flow', label: '가스 흐름', focus: ['flow'], desc: '가스는 구멍에서 수직으로 내려와 웨이퍼 표면에서 바깥으로 퍼지고, 웨이퍼 둘레의 배기 통로로 빠진다. 그래서 같은 면적이라도 중심과 가장자리가 만나는 가스 양·체류 시간이 다르다. 샤워헤드 구멍의 배치와 배기 구조는 이 차이를 상쇄하도록 설계한다.' },
          { id: 'plan', label: '위에서 본 구멍', focus: ['plan'], desc: '구멍은 동심원 모양으로 배치된다. 가장자리 구멍의 수와 크기, 구역별 가스 비율이 가장자리 두께를 바꾼다. 구멍이 막히거나 막이 쌓여 크기가 줄면 그 자리의 가스가 모자라 얼룩 모양의 두께 차이와 입자가 생긴다.' }
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          let o = pcDefs('ps');
          const sec = !f || hot(['flow']);
          if (sec) {
            // 몸통 일부, 절연체
            o += pvdR(40, 20, 320, 14, 'url(#psMt)') + pvdR(40, 34, 20, 92, 'url(#psMt)') + pvdR(340, 34, 20, 92, 'url(#psMt)') + pvdR(60, 34, 10, 78, 'url(#psCr)', { so: .6 }) + pvdR(330, 34, 10, 78, 'url(#psCr)', { so: .6 });
            o += pvdL('M200 0 V34', { c: '#38bdf8', sw: 3, so: .7 }) + pvdR(70, 34, 260, 36, 'rgba(56,189,248,.12)', { so: 0 }) + pvdTx(86, 56, '플레넘 ①', { st: 'font-size:9.5px;opacity:.75' });
            o += pcHoles(70, 330, 70, 6, 9, 'url(#psMt)', 8) + pvdR(70, 76, 260, 22, 'rgba(56,189,248,.07)', { so: 0 }) + pvdTx(86, 92, '플레넘 ②', { st: 'font-size:9.5px;opacity:.75' });
            o += pcHoles(70, 330, 98, 12, 26, 'url(#psMt)', 5);
            // 웨이퍼·히터
            o += pvdR(92, 204, 216, 6, 'url(#psSi)') + pvdR(74, 202, 18, 8, 'url(#psCr)', { so: .6 }) + pvdR(308, 202, 18, 8, 'url(#psCr)', { so: .6 }) + pvdR(74, 210, 252, 36, 'url(#psHt)', { rx: 2 });
            o += `<ellipse cx="200" cy="156" rx="116" ry="26" fill="url(#psPl)" opacity="${hot(['flow']) ? .35 : .7}"/>`;
            // 흐름
            if (hot(['flow'])) {
              o += [100, 140, 180, 220, 260, 300].map(x => dgFlow(`M${x} 112 V196`)).join('');
              o += pcAr(200, 196, 120, 196, '#38bdf8', 1.8) + pcAr(200, 196, 280, 196, '#38bdf8', 1.8) + dgFlow('M64 196 V252') + dgFlow('M336 196 V252');
              o += pvdTx(60, 266, '배기', { a: 'middle', st: 'font-size:10px;font-weight:700' }) + pvdTx(340, 266, '배기', { a: 'middle', st: 'font-size:10px;font-weight:700' });
            } else {
              o += [100, 140, 180, 220, 260, 300].map(x => pcAr(x, 116, x, 150, '#38bdf8', 1.4)).join('');
            }
            o += pvdTx(200, 266, '웨이퍼', { a: 'middle', st: 'font-size:10px;opacity:.75' });
            // RF 입력
            o += pvdL('M360 70 H382', { c: '#a78bfa', sw: 2, so: .95 }) + pvdTx(386, 62, 'RF', { a: 'end', st: 'font-size:10px;fill:#a78bfa;font-weight:800;opacity:1' });
            // 라벨
            o += pcLab(30, 90, '블로커 판', 100, 73, 'end') + pcLab(30, 120, '페이스플레이트', 120, 104, 'end') + pcLab(30, 145, '플라즈마', 100, 150, 'end');
            o += pcLab(372, 150, '간격', 318, 152, 'end');
            // 간격 치수
            o += dgArrow(318, 140, 318, 113) + dgArrow(318, 140, 318, 200);
            // 확대 창 (구멍)
            o += pvdG(f, ['fl'], '');
            o += pvdR(224, 276, 164, 104, 'rgba(244,114,182,.05)', { rx: 8, dash: '3 3', so: .45 }) + pvdTx(306, 292, '구멍 하나를 확대하면', { a: 'middle', st: 'font-size:9.5px;opacity:.7' })
              + pvdR(236, 304, 54, 30, 'url(#psMt)') + pvdR(298, 304, 78, 30, 'url(#psMt)') + pvdL('M290 304 V334 M298 304 V334', { sw: 1.4 }) + pcAr(294, 296, 294, 346, '#38bdf8', 1.8)
              + pvdTx(306, 354, '구멍이 크거나 압력이 낮으면', { a: 'middle', st: 'font-size:9.5px;opacity:.85' }) + pvdTx(306, 367, '구멍 안에서 플라즈마가 켜진다', { a: 'middle', st: 'font-size:9.5px;opacity:.85' });
            o += pvdTx(44, 296, '• 구멍 지름 : 작게 (할로 캐소드 방지)', { st: 'font-size:9.5px;opacity:.85' }) + pvdTx(44, 311, '• 구멍 수·배치 : 면 전체에 고르게', { st: 'font-size:9.5px;opacity:.85' }) + pvdTx(44, 326, '• 소재 : 알루미늄 · 양극산화/세라믹 코팅', { st: 'font-size:9.5px;opacity:.85' }) + pvdTx(44, 341, '• 온도 : 히터 열을 받아 가열되므로', { st: 'font-size:9.5px;opacity:.85' }) + pvdTx(44, 354, '   열팽창과 온도 분포도 관리 대상', { st: 'font-size:9.5px;opacity:.85' });
            return dgSvg('샤워헤드: ' + s.label, o, '-60 0 460 386');
          }
          // 평면
          const cx = 200, cy = 140;
          o += `<circle cx="${cx}" cy="${cy}" r="124" style="fill:url(#psMt);stroke:currentColor;stroke-opacity:.7;stroke-width:1.4"/><circle cx="${cx}" cy="${cy}" r="102" style="fill:none;stroke:currentColor;stroke-opacity:.4;stroke-dasharray:3 4"/>`;
          const rings = [[0, 1], [22, 8], [44, 14], [66, 20], [88, 26], [108, 30]];
          rings.forEach(([r, n], i) => { for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + i * .3; const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a); const clog = (i === 4 && k === 5) || (i === 4 && k === 6) || (i === 3 && k === 17 % n); o += pcDot(x.toFixed(1), y.toFixed(1), clog ? 3.2 : 2.3, clog ? '#f87171' : '#38bdf8', { nofill: false }); } });
          o += pcLab(386, 40, '웨이퍼 영역', 330, 70, 'end') + pcLab(386, 262, '막힌 구멍 →', 262, 142, 'end', '#f87171');
          o += pvdTx(200, 282, '동심원 배치 · 구멍 수와 지름이 가장자리 두께를 바꾼다', { a: 'middle', st: 'font-size:10px;opacity:.8' });
          o += pvdTx(200, 298, '막힌 구멍(빨강)은 그 자리의 가스가 모자라 얼룩과 입자를 만든다', { a: 'middle', st: 'font-size:10px;opacity:.8' });
          return dgSvg('샤워헤드: ' + s.label, o, '0 0 400 310');
        }
      },
    });

    Object.assign(DIAGRAMS, {
      // ---------- 4. 플라즈마 (두 판 사이) ----------
      'pecvd-plasma': {
        title: '두 판 사이의 플라즈마: 시스와 전위',
        wide: true,
        states: [
          { id: 'all', label: '전체 구조', desc: 'RF를 건 위쪽 판(샤워헤드)과 접지된 아래쪽 판(히터·웨이퍼) 사이에 가스가 플라즈마가 된다. 가운데의 밝은 부분(벌크)은 전자와 이온 수가 같아 전기적으로 중성에 가깝고, 판 가까이의 어두운 층(시스)에는 강한 전기장이 걸린다. 이온화된 입자는 극히 일부이고 대부분은 중성 가스다.' },
          { id: 'sheath', label: '시스와 이온', focus: ['sh', 'ion'], desc: '전자는 가벼워서 빨리 움직이고, 이온은 무거워서 천천히 움직인다. 그래서 판 쪽으로 전자가 먼저 빠져나가고, 판 앞에는 전자가 모자란 층(시스)이 생겨 플라즈마가 판보다 높은 전위(Vp)를 갖는다. 이 전위차가 양이온을 웨이퍼 쪽으로 가속시켜 표면을 두드리는데, 수 Torr의 높은 압력에서는 도중에 가스와 자주 부딪혀 에너지가 낮다.' },
          { id: 'species', label: '반응 입자', focus: ['sp'], desc: '플라즈마 속의 뜨거운 전자(수 eV)가 가스 분자와 부딪히면 분자가 쪼개져 반응성이 큰 조각(라디칼)이 생긴다. 이 조각이 웨이퍼에 닿아 막이 된다. 가스 온도는 크게 오르지 않기 때문에 열만으로는 반응하지 않는 낮은 온도에서도 막을 쌓을 수 있다. 이것이 PECVD의 핵심이다.' },
          { id: 'pot', label: '전위 분포', focus: ['pot'], desc: '오른쪽 그래프는 위에서 아래로 가며 본 전위다. 벌크에서는 전위가 거의 평평하고, 두 시스에서 크게 떨어진다. 위쪽 판은 RF에 의해 평균적으로 음의 전압(자기 바이어스)을 띠고, 이 값이 클수록 위쪽 시스의 이온 충격이 세진다. 아래쪽은 접지라서 시스 전압이 상대적으로 낮다.' }
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          let o = pcDefs('pp');
          // 플라즈마 벌크
          o += pvdG(f, ['sp', 'sh', 'ion'], `<rect x="36" y="74" width="232" height="140" rx="14" fill="url(#ppPl)"/>`);
          // 전극
          o += pvdG(f, ['sh', 'pot'], pvdR(36, 20, 232, 12, 'url(#ppMt)') + pvdTx(152, 15, '위쪽 판 (샤워헤드) · RF', { a: 'middle', st: 'font-size:10px;font-weight:700;fill:#a78bfa;opacity:1' }) + pvdL('M268 26 H284', { c: '#a78bfa', sw: 1.8, so: .95 }));
          o += pvdG(f, ['sh', 'pot'], pvdR(36, 250, 232, 12, 'url(#ppMt)') + pvdR(88, 244, 128, 6, 'url(#ppSi)') + pvdTx(152, 278, '아래쪽 판 (히터 · 웨이퍼) · 접지', { a: 'middle', st: 'font-size:10px;font-weight:700' }));
          // 시스 경계
          o += pvdG(f, ['sh', 'ion', 'pot'], pvdR(36, 32, 232, 42, 'rgba(15,23,42,.1)', { so: .0 }) + pvdR(36, 214, 232, 30, 'rgba(15,23,42,.1)', { so: .0 }) + pvdL('M36 74 H268', { dash: '3 3', so: .5 }) + pvdL('M36 214 H268', { dash: '3 3', so: .5 })
            + pvdTx(42, 56, '시스', { st: 'font-size:10px;opacity:.85;font-weight:700' }) + pvdTx(42, 232, '시스', { st: 'font-size:10px;opacity:.85;font-weight:700' }) + pvdTx(42, 90, '벌크 플라즈마', { st: 'font-size:10px;opacity:.85;font-weight:700' }));
          // 입자
          const el = [[90, 100], [140, 120], [190, 96], [230, 130], [110, 170], [170, 160], [215, 186], [70, 140], [250, 100], [130, 198]];
          o += pvdG(f, ['sp', 'sh'], el.map(([x, y]) => pcDot(x, y, 2.4, '#38bdf8')).join('') + pvdTx(250, 90, 'e⁻', { st: 'font-size:10px;fill:#38bdf8;opacity:1;font-weight:700' }));
          const ion = [[100, 140], [160, 96], [200, 170], [236, 150], [124, 110], [180, 130]];
          o += pvdG(f, ['ion', 'sh', 'sp'], ion.map(([x, y]) => pcDot(x, y, 3.4, '#f87171', { nofill: true })).join('') + pvdTx(100, 156, 'Ar⁺ · 이온', { st: 'font-size:9.5px;fill:#f87171;opacity:1;font-weight:700' }));
          // 라디칼
          const rd = [[120, 128], [165, 148], [205, 118], [95, 186], [228, 196], [150, 188]];
          o += pvdG(f, ['sp'], rd.map(([x, y]) => `<rect x="${x - 3.2}" y="${y - 3.2}" width="6.4" height="6.4" fill="#f59e0b" opacity=".95"/>`).join('') + pvdTx(236, 212, '라디칼', { st: 'font-size:9.5px;fill:#f59e0b;opacity:1;font-weight:700' }));
          // 이온 가속 화살표
          if (hot(['ion'])) o += [[110, 222, 238], [150, 222, 238], [190, 222, 238]].map(([x, a, b]) => pcAr(x, a - 6, x, b, '#f87171', 2)).join('') + pcAr(100, 70, 100, 40, '#f87171', 1.6) + pcAr(200, 70, 200, 40, '#f87171', 1.6);
          // 반응식
          if (hot(['sp'])) o += pvdR(54, 80, 196, 20, 'rgba(15,23,42,.35)', { rx: 4, so: 0 }) + pvdTx(152, 94, 'e⁻ + SiH₄ → SiH₃· + H + e⁻', { a: 'middle', st: 'font-size:10.5px;fill:#fde68a;opacity:1;font-weight:700' })
            + pcAr(150, 150, 150, 238, '#f59e0b', 1.8, '3 3') + pvdTx(158, 214, '웨이퍼로', { st: 'font-size:9.5px;opacity:.9;fill:#f59e0b;font-weight:700' });
          // 전위 그래프
          o += pvdG(f, ['pot'], pvdL('M300 20 V262 M300 262 H392', { so: .55 }) + pvdTx(396, 276, 'V', { a: 'end', st: 'font-size:9.5px;opacity:.7' }) + pvdTx(296, 14, '위', { a: 'end', st: 'font-size:9.5px;opacity:.7' }) + pvdTx(296, 270, '아래', { a: 'end', st: 'font-size:9.5px;opacity:.7' })
            + pvdL('M318 262 V26', { dash: '2 4', so: .4 }) + pvdTx(318, 284, '0 V', { a: 'middle', st: 'font-size:9.5px;opacity:.8' }));
          o += pvdG(f, ['pot'], pvdL('M308 26 C308 56 352 44 352 78 V212 C352 238 318 230 318 250', { c: hot(['pot']) ? 'var(--hl-accent)' : '#a78bfa', sw: 2.6, so: .95 })
            + pvdTx(358, 140, 'Vp', { st: 'font-size:11px;font-weight:800;fill:#a78bfa;opacity:1' }) + pvdTx(358, 152, '플라즈마', { st: 'font-size:9px;opacity:.75' }) + pvdTx(358, 162, '전위', { st: 'font-size:9px;opacity:.75' })
            + pvdTx(308, 44, '자기', { a: 'end', st: 'font-size:9px;opacity:.75' }) + pvdTx(308, 54, '바이어스', { a: 'end', st: 'font-size:9px;opacity:.75' }));
          return dgSvg('플라즈마: ' + s.label, o, '0 0 400 292');
        }
      },

      // ---------- 5. RF 전력 경로 ----------
      'pecvd-rf': {
        title: 'RF 전력: 발생기 · 매처 · 이중 주파수',
        wide: true,
        states: [
          { id: 'path', label: '전력 경로', focus: ['path'], desc: 'RF 발생기가 만든 전력이 매처를 지나 챔버의 전극에 걸린다. 장비는 보통 13.56 MHz의 높은 주파수(HF)와 수백 kHz의 낮은 주파수(LF) 전원을 함께 갖는다. 전력이 모두 플라즈마로 들어가지 못하고 일부가 되돌아오는데, 이것이 반사 파워다. 반사 파워가 작을수록 설정한 전력이 그대로 플라즈마에 쓰인다.' },
          { id: 'match', label: '매처가 하는 일', focus: ['match'], desc: '플라즈마의 임피던스는 압력, 가스, 파워에 따라 계속 변한다. 발생기가 기대하는 50 Ω과 어긋나면 전력이 반사된다. 매처는 안의 가변 축전기를 모터로 돌려 어긋남을 맞춘다. 점화 직후나 가스가 바뀔 때는 맞추는 동안 반사 파워가 잠깐 커지는 것이 정상이다.' },
          { id: 'freq', label: 'HF와 LF의 차이', focus: ['freq'], desc: '이온은 무거워서 13.56 MHz처럼 빠르게 바뀌는 전기장은 따라가지 못하고 평균 전위만 느낀다. 그래서 HF는 주로 플라즈마의 양(밀도, 속도)을 정한다. 수백 kHz의 LF는 이온이 전기장을 따라 움직일 만큼 느려서 이온이 큰 에너지로 웨이퍼를 두드린다. LF를 키우면 막이 치밀해지고 응력이 압축 쪽으로 간다.' }
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          let o = pcDefs('pr');
          if (hot(['path']) || !f) {
            // 블록도
            o += pvdG(f, ['path'], pvdR(14, 36, 82, 48, 'rgba(167,139,250,.2)', { rx: 6, so: .8 }) + pvdTx(55, 56, 'HF 발생기', { a: 'middle', st: 'font-size:10.5px;font-weight:700' }) + pvdTx(55, 72, '13.56 MHz', { a: 'middle', st: 'font-size:9.5px;opacity:.8' })
              + pvdR(14, 120, 82, 48, 'rgba(244,114,182,.18)', { rx: 6, so: .8 }) + pvdTx(55, 140, 'LF 발생기', { a: 'middle', st: 'font-size:10.5px;font-weight:700' }) + pvdTx(55, 156, '수백 kHz', { a: 'middle', st: 'font-size:9.5px;opacity:.8' })
              + pvdR(138, 36, 66, 48, 'rgba(167,139,250,.12)', { rx: 6, so: .8 }) + pvdTx(171, 64, 'HF 매처', { a: 'middle', st: 'font-size:10.5px;font-weight:700' })
              + pvdR(138, 120, 66, 48, 'rgba(244,114,182,.1)', { rx: 6, so: .8 }) + pvdTx(171, 148, 'LF 매처', { a: 'middle', st: 'font-size:10.5px;font-weight:700' })
              + pvdL('M96 60 H138', { c: '#a78bfa', sw: 2.2, so: .95 }) + pvdL('M96 144 H138', { c: '#f472b6', sw: 2.2, so: .95 })
              + pvdL('M204 60 H228 V46 H248', { c: '#a78bfa', sw: 2.2, so: .95 }) + pvdL('M204 144 H234 V238 H248', { c: '#f472b6', sw: 2.2, so: .95 }));
            // 챔버 스케치
            o += pvdG(f, ['path'], pvdR(248, 40, 128, 12, 'url(#prMt)') + pvdTx(312, 34, '샤워헤드 (HF)', { a: 'middle', st: 'font-size:10px;font-weight:700;opacity:.95' }) + `<ellipse cx="312" cy="142" rx="52" ry="40" fill="url(#prPl)"/>`
              + pvdR(248, 232, 128, 12, 'url(#prMt)') + pvdR(276, 226, 72, 6, 'url(#prSi)') + pvdTx(312, 262, '히터 · 웨이퍼 (LF)', { a: 'middle', st: 'font-size:10px;font-weight:700;opacity:.95' })
             );
            o += pvdG(f, ['path'], pcAr(190, 18, 100, 18, '#fb7185', 1.8, '3 3') + pvdTx(196, 14, '반사 파워 (되돌아온 전력)', { st: 'font-size:9.5px;fill:#fb7185;opacity:1;font-weight:700' }) + pvdTx(150, 108, '진행 파워 →', { a: 'middle', st: 'font-size:9.5px;opacity:.8' }));
            o += pvdTx(14, 214, '※ LF는 장비에 따라 샤워헤드나 히터에 건다', { st: 'font-size:9.5px;opacity:.7' });
            o += pvdTx(14, 232, '※ 반사 파워가 크면 점화 실패 · 속도 변동', { st: 'font-size:9.5px;opacity:.7' });
            return dgSvg('RF 전력: ' + s.label, o, '0 0 400 280');
          }
          if (hot(['match'])) {
            // 회로: 발생기 - 직렬 C(TUNE) - 병렬 C(LOAD) - 플라즈마
            const W = '#a78bfa';
            o += pvdL('M40 60 H100 M134 60 H300', { c: W, sw: 2, so: .9 });
            o += `<circle cx="40" cy="106" r="22" style="fill:rgba(167,139,250,.14);stroke:currentColor;stroke-opacity:.7;stroke-width:1.3"/>` + pvdL('M26 106 q7 -10 14 0 t14 0', { c: W, sw: 1.8, so: .95 }) + pvdL('M40 60 V84 M40 128 V160 H300 V150', { c: W, sw: 2, so: .9 }) + pvdTx(40, 148, '발생기', { a: 'middle', st: 'font-size:9.5px;opacity:.85' }) + pvdTx(40, 36, '50 Ω', { a: 'middle', st: 'font-size:9.5px;opacity:.8' });
            // 직렬 가변 C
            o += pvdL('M110 60 V50 M110 60 V70', { so: 0 }) + pvdL('M112 48 V72 M122 48 V72', { sw: 2.2, so: .9 }) + pvdL('M100 60 H112 M122 60 H134', { c: W, sw: 2, so: .9 }) + pvdL('M104 76 L130 44', { c: 'var(--hl-accent)', sw: 1.6, so: 1 }) + pvdTx(118, 36, 'TUNE', { a: 'middle', st: 'font-size:10px;font-weight:700;fill:var(--hl-accent);opacity:1' });
            // 병렬 가변 C
            o += pvdL('M230 60 V94 M230 160 V120', { c: W, sw: 2, so: .9 }) + pvdL('M218 102 H242 M218 112 H242', { sw: 2.2, so: .9 }) + pvdL('M230 94 V102 M230 112 V120', { c: W, sw: 2, so: .9 }) + pvdL('M214 118 L246 92', { c: 'var(--hl-accent)', sw: 1.6, so: 1 }) + pvdTx(256, 112, 'LOAD', { st: 'font-size:10px;font-weight:700;fill:var(--hl-accent);opacity:1' });
            // 플라즈마 부하
            o += pvdR(288, 78, 24, 56, 'rgba(167,139,250,.2)', { rx: 4, so: .8 }) + pvdTx(300, 110, 'R+jX', { a: 'middle', st: 'font-size:9px;font-weight:700' }) + pvdTx(332, 100, '플라즈마', { st: 'font-size:9.5px;opacity:.85' }) + pvdTx(332, 112, '(부하)', { st: 'font-size:9.5px;opacity:.85' }) + pvdL('M300 60 V78 M300 134 V160', { c: W, sw: 2, so: .9 });
            // 매칭 전·후 막대
            o += pvdTx(40, 196, '매칭 전', { st: 'font-size:10px;font-weight:700' }) + pvdR(100, 184, 200, 14, 'rgba(15,23,42,.08)', { so: .3 }) + pvdR(100, 184, 140, 14, 'rgba(251,113,133,.55)', { so: .0 }) + pvdTx(306, 196, '반사 큼', { st: 'font-size:9.5px;fill:#fb7185;opacity:1;font-weight:700' });
            o += pvdTx(40, 224, '매칭 후', { st: 'font-size:10px;font-weight:700' }) + pvdR(100, 212, 200, 14, 'rgba(15,23,42,.08)', { so: .3 }) + pvdR(100, 212, 8, 14, 'rgba(251,113,133,.55)', { so: .0 }) + pvdR(108, 212, 192, 14, 'rgba(52,211,153,.5)', { so: .0 }) + pvdTx(306, 224, '대부분 플라즈마로', { st: 'font-size:9.5px;fill:#34d399;opacity:1;font-weight:700' });
            o += pvdTx(200, 252, '막대 = 보낸 전력 중 되돌아오는 몫 (빨강) 과 플라즈마에 들어가는 몫 (초록)', { a: 'middle', st: 'font-size:9.5px;opacity:.7' });
            return dgSvg('RF 전력: ' + s.label, o, '0 0 400 262');
          }
          // freq: HF vs LF
          const col = (x0, name, sub, c, amp, ionAmp, notes) => {
            let r = pvdR(x0, 18, 176, 232, 'rgba(15,23,42,.03)', { rx: 10, so: .25, dash: '3 4' }) + pvdTx(x0 + 88, 38, name, { a: 'middle', st: `font-size:12px;font-weight:800;fill:${c};opacity:1` }) + pvdTx(x0 + 88, 52, sub, { a: 'middle', st: 'font-size:9.5px;opacity:.75' });
            // 전기장 파형
            const wv = amp === 'fast' ? 'M{a} 84 q6 -16 12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0' : 'M{a} 84 q20 -22 40 0 t40 0 t40 0 t40 0';
            r += pvdTx(x0 + 8, 70, '전기장', { st: 'font-size:9.5px;opacity:.7' }) + pvdL(wv.replace('{a}', x0 + 8), { c, sw: 1.8, so: .95 }) + pvdL(`M${x0 + 8} 84 H${x0 + 168}`, { so: .25, dash: '2 3' });
            // 웨이퍼 + 이온
            r += pvdR(x0 + 24, 214, 128, 6, 'url(#prSi)') + pvdTx(x0 + 88, 236, '웨이퍼', { a: 'middle', st: 'font-size:9.5px;opacity:.75' });
            r += pvdTx(x0 + 8, 108, '이온 움직임', { st: 'font-size:9.5px;opacity:.7' });
            [x0 + 48, x0 + 88, x0 + 128].forEach((x, i) => { r += pcDot(x, 142, 3.2, '#f87171', { nofill: true }) + pcAr(x, 148, x, ionAmp === 'zig' ? 168 : 196, '#f87171', ionAmp === 'zig' ? 1.4 : 2.8); });
            r += pvdTx(x0 + 88, 124, ionAmp === 'zig' ? '평균 전위만 느끼고 천천히 낙하' : '전기장을 따라가며 크게 가속', { a: 'middle', st: 'font-size:9px;opacity:.8' });
            return r;
          };
          o += col(8, 'HF · 13.56 MHz', '빠른 진동', '#a78bfa', 'fast', 'zig');
          o += col(216, 'LF · 수백 kHz', '느린 진동', '#f472b6', 'slow', 'big');
          o += pvdTx(96, 206, '이온 에너지 낮음 · 플라즈마 밀도 ↑', { a: 'middle', st: 'font-size:9.5px;font-weight:700;opacity:.95' }) + pvdTx(304, 206, '이온 에너지 높음 · 막 치밀 · 압축 응력', { a: 'middle', st: 'font-size:9.5px;font-weight:700;opacity:.95' });
          return dgSvg('RF 전력: ' + s.label, o, '0 0 400 262');
        }
      },
    });

    Object.assign(DIAGRAMS, {
      // ---------- 6. 막이 만들어지는 반응 ----------
      'pecvd-reaction': {
        title: '막이 만들어지는 과정 (SiO₂ 예)',
        wide: true,
        states: [
          { id: 'all', label: '전체 과정', desc: '실란(SiH₄)과 아산화질소(N₂O)를 챔버에 넣고 플라즈마를 켜면, 가스가 쪼개져 반응성이 큰 조각이 되고, 그 조각이 웨이퍼 위에서 Si–O 그물(산화막)을 만든다. 개략적인 전체 반응은 SiH₄ + 2N₂O → SiO₂ + 2N₂ + 2H₂ 이다. 질화막은 SiH₄ + NH₃(또는 N₂)로 같은 방식으로 만든다.' },
          { id: 'gas', label: '① 가스 분해', focus: ['gas', 'pl'], desc: '샤워헤드에서 내려온 가스를 플라즈마의 전자가 때려서 쪼갠다. SiH₄는 SiH₃ 같은 조각(Si 라디칼)이 되고, N₂O는 N₂와 산소 원자(O)로 갈라진다. 열만으로 같은 일을 하려면 훨씬 높은 온도가 필요하다. 이 단계에서 압력이 너무 높으면 조각끼리 공중에서 만나 뭉쳐 먼지(입자)가 된다.' },
          { id: 'surf', label: '② 표면 반응', focus: ['surf'], desc: '조각이 웨이퍼 표면에 닿아 붙고(흡착), 가열된 표면에서 이웃 조각과 결합하며 Si–O 그물이 한 층씩 자란다. 표면 온도가 높으면 조각이 표면에서 잘 움직여 빈 곳을 메우고 수소도 잘 떨어져 나간다. 온도가 낮으면 수소가 막 속에 남는다.' },
          { id: 'byp', label: '③ 부산물·수소', focus: ['byp'], desc: '반응하고 남은 N₂, H₂, H₂O 같은 부산물은 가스로 떠나 펌프로 빠진다. 다만 수소 일부는 Si–H, Si–OH 결합으로 막 속에 남는다. 이 수소가 PECVD 막이 열산화막보다 성기고 습기를 먹기 쉬운 이유이며, 막 품질을 볼 때 수소 함량을 같이 보는 까닭이다.' }
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          let o = pcDefs('pq');
          const Si = (x, y, r = 9) => `<circle cx="${x}" cy="${y}" r="${r}" style="fill:#94a3b8;stroke:currentColor;stroke-opacity:.6;stroke-width:1"/>`;
          const O = (x, y, r = 6) => `<circle cx="${x}" cy="${y}" r="${r}" style="fill:#f87171;stroke:currentColor;stroke-opacity:.5;stroke-width:1"/>`;
          const H = (x, y) => `<circle cx="${x}" cy="${y}" r="3.4" style="fill:#f8fafc;stroke:currentColor;stroke-opacity:.6;stroke-width:1"/>`;
          const N = (x, y) => `<circle cx="${x}" cy="${y}" r="5.5" style="fill:#60a5fa;stroke:currentColor;stroke-opacity:.5;stroke-width:1"/>`;
          // 가스 공급 (위)
          o += pvdG(f, ['gas'], pvdR(40, 12, 300, 12, 'url(#pqMt)') + pvdTx(190, 8, '샤워헤드', { a: 'middle', st: 'font-size:9.5px;opacity:.7' }));
          o += pvdG(f, ['gas', 'pl'], pvdL('M70 24 V50 M110 24 V50 M150 24 V50', { c: '#38bdf8', dash: '2 3', so: .6 })
            + Si(90, 70) + H(80, 62) + H(100, 62) + H(80, 79) + H(100, 79) + pvdTx(90, 94, 'SiH₄', { a: 'middle', st: 'font-size:10px;font-weight:700' })
            + N(150, 70) + N(163, 70) + O(176, 70) + pvdL('M155 70 H158 M168 70 H170', { sw: 1.4 }) + pvdTx(163, 94, 'N₂O', { a: 'middle', st: 'font-size:10px;font-weight:700' }));
          // 플라즈마 (분해)
          o += pvdG(f, ['pl', 'gas'], `<ellipse cx="190" cy="150" rx="150" ry="42" fill="url(#pqPl)"/>`);
          o += pvdG(f, ['pl', 'gas'], [[70, 130], [120, 160], [250, 140], [300, 160], [210, 120]].map(([x, y]) => pcDot(x, y, 2.4, '#38bdf8')).join('') + pvdTx(62, 120, 'e⁻', { st: 'font-size:10px;fill:#38bdf8;opacity:1;font-weight:700' })
            + `<rect x="${176}" y="${150}" width="7" height="7" fill="#f59e0b"/>` + `<rect x="${230}" y="${166}" width="7" height="7" fill="#f59e0b"/>` + pcDot(120, 136, 4.5, '#f59e0b') + pvdTx(130, 140, 'SiH₃·', { st: 'font-size:10px;fill:#f59e0b;opacity:1;font-weight:800' }) + pvdTx(240, 160, 'O', { st: 'font-size:10px;fill:#f87171;opacity:1;font-weight:800' }) + pvdTx(190, 188, 'N₂ (부산물)', { a: 'middle', st: 'font-size:9.5px;opacity:.85' }));
          if (hot(['gas'])) o += pvdTx(190, 108, 'e⁻ + SiH₄ → SiH₃· + H + e⁻', { a: 'middle', st: 'font-size:10.5px;font-weight:700;fill:var(--hl-accent);opacity:1' });
          // 조각이 내려오는 화살표
          o += pvdG(f, ['gas', 'pl', 'surf'], [[110, 150, 228], [150, 160, 228], [230, 160, 228], [276, 150, 228]].map(([x, a, b]) => dgFlow(`M${x} ${a} V${b}`)).join(''));
          // 웨이퍼 표면: 그물
          o += pvdG(f, ['surf', 'byp'], pvdR(40, 292, 300, 30, 'url(#pqSi)') + pvdTx(190, 312, '웨이퍼', { a: 'middle', st: 'font-size:10px;opacity:.85' }) + pvdR(40, 248, 300, 44, 'url(#pqOx)', { so: .4 }));
          const row = (y, xs) => xs.map((x, i) => Si(x, y, 7) + (i < xs.length - 1 ? O((x + xs[i + 1]) / 2, y - 4, 4.4) + pvdL(`M${x + 7} ${y - 1} L${(x + xs[i + 1]) / 2 - 3} ${y - 4} M${(x + xs[i + 1]) / 2 + 3} ${y - 4} L${xs[i + 1] - 7} ${y - 1}`, { sw: 1.2 }) : '')).join('');
          o += pvdG(f, ['surf', 'byp'], row(284, [60, 98, 136, 174, 212, 250, 288, 326]) + row(264, [78, 116, 154, 192, 230, 268, 306]));
          if (hot(['surf'])) o += pvdG(f, ['surf'], pvdTx(190, 344, 'Si–O–Si 그물이 한 층씩 성장 (가열된 표면)', { a: 'middle', st: 'font-size:10px;font-weight:700;fill:var(--hl-accent);opacity:1' }));
          // 수소 + 부산물
          o += pvdG(f, ['byp'], [[116, 272], [230, 272], [288, 252]].map(([x, y]) => H(x, y) + pvdL(`M${x} ${y} l-3 ${y > 260 ? 8 : 6}`, { sw: 1 })).join('') + pvdTx(116, 244, 'Si–H', { a: 'middle', st: 'font-size:9.5px;font-weight:700;fill:#f87171;opacity:1' }) + pvdTx(290, 242, 'Si–OH', { a: 'middle', st: 'font-size:9.5px;font-weight:700;fill:#f87171;opacity:1' }));
          o += pvdG(f, ['byp'], pcAr(330, 232, 372, 232, '#2dd4bf', 2) + pvdTx(372, 222, 'H₂ · H₂O', { a: 'end', st: 'font-size:10px;font-weight:700;fill:#2dd4bf;opacity:1' }) + pvdTx(372, 248, '→ 펌프', { a: 'end', st: 'font-size:9.5px;opacity:.8' }));
          return dgSvg('막이 만들어지는 과정: ' + s.label, o, '0 0 400 352');
        }
      },

      // ---------- 7. 배선 사이 옆면 덮임 / 갭필 ----------
      'pecvd-stepcov': {
        title: '배선 사이 채움: 옆면 덮임과 빈틈',
        wide: true,
        states: [
          { id: 'ideal', label: '이상적인 덮임', focus: ['i'], desc: '배선의 위, 옆면, 바닥에 같은 두께로 막이 쌓이는 경우(콘포멀)다. 막이 두꺼워져도 홈의 입구가 막히지 않고, 홈 안쪽부터 균일하게 차오른다. CVD 중 열에 의존하는 방식(표면 반응이 느린 조건)이 이 모양에 가깝다.' },
          { id: 'pecvd', label: '실제 PECVD 막', focus: ['p'], desc: '플라즈마가 가스를 미리 쪼개 놓아서 조각이 처음 닿는 곳에 바로 붙는다. 그래서 배선 위쪽 모서리에 막이 많이 쌓여 튀어나오고(오버행), 옆면과 바닥은 얇아진다. 막이 더 두꺼워지면 두 모서리가 입구에서 먼저 맞붙어(핀치오프) 안에 빈틈(보이드)이 갇힌다. 옆면 덮임은 옆면 두께를 위쪽 두께로 나눈 값으로 본다.' },
          { id: 'fix', label: '채움 방식 개선', focus: ['x'], desc: '배선 간격이 좁고 높이가 높을수록(종횡비가 클수록) 위의 문제가 심해진다. 대책은 두 가지다. 증착과 스퍼터 식각을 동시에 하는 HDP-CVD는 튀어나오려는 모서리를 이온이 깎아 입구를 열어 두고 바닥부터 채운다. 또는 TEOS 계열 가스나 SACVD(준대기압 CVD)처럼 표면에서 더 잘 퍼지는 막을 쓴다.' }
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          let o = pcDefs('pg');
          const metal = [[70, 200, 80, 90], [230, 200, 80, 90]];
          const mrect = (x, y, w, h) => `M${x} ${y} h${w} v${h} h${-w} Z`;
          const holes = metal.map(m => mrect(...m)).join(' ');
          // 기판
          o += pvdR(20, 290, 360, 34, 'url(#pgSi)') + pvdTx(200, 312, '기판 (절연막 위)', { a: 'middle', st: 'font-size:10px;opacity:.85' });
          const film = (d, fill) => `<path d="${d}" fill-rule="evenodd" style="fill:${fill};stroke:currentColor;stroke-width:1.1;stroke-opacity:.6"/>`;
          if (hot(['i'])) {
            o += film('M20 290 V270 H50 V180 H170 V270 H210 V180 H330 V270 H380 V290 Z ' + holes, 'url(#pgOx)');
            o += pvdTx(200, 160, '위 · 옆면 · 바닥 두께가 같다', { a: 'middle', st: 'font-size:11px;font-weight:700;fill:var(--hl-accent);opacity:1' }) + pvdTx(200, 176, '옆면 덮임 ≈ 100 %', { a: 'middle', st: 'font-size:10px;opacity:.85' });
          } else if (hot(['p'])) {
            const outer = 'M20 290 V276 H57 L59 196 C58 164 72 150 110 150 H130 C168 150 190 168 191 196 C192 168 214 150 252 150 H272 C310 150 322 164 321 196 L323 276 H380 V290 Z';
            const gapL = 'M191 196 C178 200 162 208 162 224 V262 C162 272 170 276 178 276 H204 C212 276 220 272 220 262 V224 C220 208 204 200 191 196 Z';
            o += film(outer + ' ' + holes + ' ' + gapL, 'url(#pgOx)');
            o += pvdTx(200, 124, '위쪽이 가장 두껍다 → 오버행', { a: 'middle', st: 'font-size:11px;font-weight:700;fill:var(--hl-accent);opacity:1' });
            o += pcLab(396, 240, '빈틈(보이드)', 192, 240, 'start', '#f87171');
            o += pcLab(396, 190, '핀치오프', 196, 196, 'start', '#f87171');
            o += pvdTx(30, 244, '바닥 얇음', { st: 'font-size:9.5px;opacity:.85' }) + pvdTx(10, 220, '옆면', { st: 'font-size:9.5px;opacity:.85' });
          } else {
            const hdp = 'M20 290 V266 H60 V210 L74 182 H126 L158 212 L162 234 H218 L222 212 L254 182 H306 L320 210 V266 H380 V290 Z';
            o += film(hdp + ' ' + holes, 'url(#pgOx)');
            // 이온이 모서리를 깎는다
            o += [[104, 140, 128, 172], [280, 140, 256, 172]].map(([a, b, c, d]) => pcAr(a, b, c, d, '#f87171', 1.8)).join('') + pvdTx(104, 132, '스퍼터 식각', { a: 'middle', st: 'font-size:9.5px;fill:#f87171;opacity:1;font-weight:700' });
            o += dgFlow('M190 130 V225') + pvdTx(190, 120, '증착', { a: 'middle', st: 'font-size:9.5px;font-weight:700;opacity:.9' });
            o += pvdTx(200, 354, '모서리를 45°로 깎으며 바닥부터 채운다 → 빈틈 없이', { a: 'middle', st: 'font-size:10.5px;font-weight:700;fill:var(--hl-accent);opacity:1' });
          }
          // 금속 배선
          o += metal.map(([x, y, w, h]) => pvdR(x, y, w, h, 'url(#pgMt)', { so: .75 })).join('') + pvdTx(110, 250, '배선', { a: 'middle', st: 'font-size:10px;font-weight:700' }) + pvdTx(270, 250, '배선', { a: 'middle', st: 'font-size:10px;font-weight:700' });
          o += pvdTx(200, 338, hot(['p']) ? '예: 위 100 : 옆면 30 : 바닥 35 (상대값)' : '', { a: 'middle', st: 'font-size:9.5px;opacity:.7' });
          return dgSvg('옆면 덮임: ' + s.label, o, '0 96 476 268');
        }
      },
    });

    Object.assign(DIAGRAMS, {
      // ---------- 8. 두께 균일도 ----------
      'pecvd-uniformity': {
        title: '웨이퍼 안의 두께 분포 (균일도)',
        wide: true,
        states: [
          { id: 'center', label: '가운데가 두꺼움', focus: ['c'], desc: '웨이퍼 중심에서 막이 가장 두껍고 가장자리로 갈수록 얇아지는 모양이다. 가스가 중심에 쏠리거나, 샤워헤드 중앙의 구멍으로 가스가 더 많이 나오거나, 압력이 높아 중심에서 가스가 빨리 소모되는 경우에 자주 보인다. 가장 흔한 분포 중 하나다.' },
          { id: 'edge', label: '가장자리가 두꺼움', focus: ['e'], desc: '가장자리에서 막이 두꺼워지는 모양이다. 엣지 링 근처의 온도나 전기장이 달라서 가장자리에 막이 더 쌓이거나, 가장자리 구멍으로 가스가 더 나오는 경우에 생긴다. 웨이퍼가 놓인 위치에 따라 링의 마모가 영향을 주기도 한다.' },
          { id: 'asym', label: '한쪽으로 치우침', focus: ['a'], desc: '두께가 한쪽에서 두껍고 반대쪽에서 얇은 비대칭이다. 히터나 샤워헤드가 수평에서 기울었거나, 슬릿 밸브나 배기구가 한쪽에 있어 가스 흐름이 한쪽으로 치우칠 때 생긴다. 레시피로 고치기 어렵고 하드웨어를 점검해야 하는 경우가 많다.' }
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          let o = pcDefs('pu');
          const K = hot(['c']) ? 'c' : hot(['e']) ? 'e' : 'a';
          o += `<defs><radialGradient id="puC" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f59e0b"/><stop offset=".55" stop-color="#fde68a"/><stop offset="1" stop-color="#7dd3fc"/></radialGradient>
    <radialGradient id="puE" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#7dd3fc"/><stop offset=".5" stop-color="#bae6fd"/><stop offset=".85" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></radialGradient>
    <linearGradient id="puA" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7dd3fc"/><stop offset=".5" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs>`;
          const cx = 100, cy = 110, r = 80;
          o += `<circle cx="${cx}" cy="${cy}" r="${r}" style="fill:url(#pu${K.toUpperCase()});stroke:currentColor;stroke-opacity:.7;stroke-width:1.4"/>`;
          o += pvdL(`M${cx - r} ${cy} H${cx + r} M${cx} ${cy - r} V${cy + r}`, { so: .25, dash: '3 3' });
          o += pvdTx(cx, 212, '웨이퍼 (위에서 본 두께 지도)', { a: 'middle', st: 'font-size:9.5px;opacity:.75' });
          if (K === 'c') o += pvdTx(cx, cy + 4, '두꺼움', { a: 'middle', st: 'font-size:10px;font-weight:800;fill:#92400e;opacity:1' }) + pvdTx(cx - 62, cy - 62, '얇음', { a: 'middle', st: 'font-size:10px;font-weight:800;fill:#075985;opacity:1' });
          if (K === 'e') o += pvdTx(cx, cy + 4, '얇음', { a: 'middle', st: 'font-size:10px;font-weight:800;fill:#075985;opacity:1' }) + pvdTx(cx - 62, cy - 62, '두꺼움', { a: 'middle', st: 'font-size:10px;font-weight:800;fill:#92400e;opacity:1' });
          if (K === 'a') o += pvdTx(cx - 48, cy + 4, '얇음', { a: 'middle', st: 'font-size:10px;font-weight:800;fill:#075985;opacity:1' }) + pvdTx(cx + 48, cy + 4, '두꺼움', { a: 'middle', st: 'font-size:10px;font-weight:800;fill:#92400e;opacity:1' });
          // 프로파일 그래프
          o += pvdL('M222 40 V176 H388', { so: .6 }) + pvdTx(222, 30, '두께', { a: 'middle', st: 'font-size:9.5px;opacity:.75' }) + pvdTx(226, 192, '한쪽 끝', { st: 'font-size:9px;opacity:.7' }) + pvdTx(305, 192, '중심', { a: 'middle', st: 'font-size:9px;opacity:.7' }) + pvdTx(388, 192, '반대쪽 끝', { a: 'end', st: 'font-size:9px;opacity:.7' }) + pvdTx(305, 206, '(지름 방향으로 잰 두께)', { a: 'middle', st: 'font-size:9px;opacity:.6' });
          o += pvdL('M222 84 H388', { dash: '2 4', so: .45 }) + pvdTx(388, 78, '목표', { a: 'end', st: 'font-size:9px;opacity:.7' });
          const cur = K === 'c' ? 'M230 124 C260 124 270 60 305 60 C340 60 350 124 380 124' : K === 'e' ? 'M230 52 C250 62 262 112 305 112 C348 112 360 62 380 52' : 'M230 126 C270 112 340 56 380 44';
          o += pvdL(cur, { c: 'var(--hl-accent)', sw: 2.8, so: 1 });
          // 원인
          const cause = K === 'c' ? ['가스가 중심에 몰림 (샤워헤드 중앙 구멍)', '압력이 높아 중심에서 가스 소모', '간격이 좁아 중심 플라즈마가 강함'] : K === 'e' ? ['엣지 링 둘레의 온도·전기장 차이', '가장자리 구멍으로 가스가 더 나옴', '링 · 샤워헤드 가장자리의 마모'] : ['히터 또는 샤워헤드가 기울어짐', '슬릿 밸브 · 배기구가 한쪽에 있어 흐름 치우침', '샤워헤드 한쪽 구멍 막힘'];
          o += pvdTx(20, 238, '대표적인 원인', { st: 'font-size:10.5px;font-weight:800' }) + cause.map((t, i) => pvdTx(24, 256 + i * 17, '• ' + t, { st: 'font-size:10px;opacity:.9' })).join('');
          return dgSvg('두께 분포: ' + s.label, o, '0 0 400 312');
        }
      },

      // ---------- 9. 챔버 세정과 시즈닝 ----------
      'pecvd-clean': {
        title: '챔버 세정(클린)과 시즈닝',
        wide: true,
        states: [
          { id: 'dep', label: '증착: 막이 쌓인다', focus: ['dep'], desc: '막은 웨이퍼에만 쌓이지 않는다. 샤워헤드 아랫면, 챔버 벽, 히터 둘레에도 같은 막이 쌓인다. RF가 걸리는 샤워헤드에 가장 두껍게 쌓인다고 알려져 있다. 이 막이 두꺼워지면 플라즈마 조건이 바뀌고 떨어져 나와 먼지가 되기 때문에 정해진 주기마다 치워야 한다.' },
          { id: 'clean', label: '세정: 불소로 녹여낸다', focus: ['cl'], desc: '웨이퍼 없이 챔버만 돌린다. 원격 플라즈마 소스(RPS)에서 NF₃를 쪼개 불소 라디칼(F)을 만들고 챔버로 보낸다. F가 막과 반응해 SiF₄ 같은 기체가 되고 펌프로 빠진다(SiO₂ + 4F → SiF₄ + O₂). RPS는 챔버 안에 직접 플라즈마를 켜지 않아 부품 손상이 적다. 끝점은 광학 신호 등으로 확인한다.' },
          { id: 'season', label: '시즈닝: 얇게 덮는다', focus: ['se'], desc: '세정 직후의 챔버 벽에는 불소가 남아 첫 웨이퍼들의 두께와 막 성질이 흔들린다. 그래서 웨이퍼 없이 같은 막을 얇게 한 번 입혀서(시즈닝) 벽 상태를 일정하게 만들고 남은 입자를 눌러 고정한 뒤, 양산 웨이퍼를 받는다.' }
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          const st = hot(['dep']) ? 'dep' : hot(['cl']) ? 'cl' : 'se';
          let o = pcDefs('pl');
          const filmC = st === 'se' ? 'rgba(245,158,11,.55)' : 'rgba(56,189,248,.6)', th = st === 'dep' ? 7 : st === 'cl' ? 2.5 : 3;
          // RPS
          o += pvdR(166, 6, 68, 26, st === 'cl' ? 'rgba(244,114,182,.3)' : 'rgba(244,114,182,.12)', { rx: 5, so: .8 }) + pvdTx(200, 17, 'RPS', { a: 'middle', st: 'font-size:10px;font-weight:700' }) + pvdTx(200, 28, 'NF₃ → F·', { a: 'middle', st: 'font-size:8.5px;opacity:.8' }) + pvdL('M200 32 V54', { c: '#f472b6', sw: 2.4, so: .65 });
          // 몸통
          o += pvdR(56, 54, 288, 10, 'url(#plMt)') + pvdR(56, 64, 18, 190, 'url(#plMt)') + pvdR(326, 64, 18, 190, 'url(#plMt)') + pvdR(56, 254, 70, 10, 'url(#plMt)') + pvdR(168, 254, 176, 10, 'url(#plMt)');
          o += pvdR(74, 64, 252, 22, 'url(#plMt)') + pcHoles(74, 326, 86, 8, 18, 'url(#plMt)', 5);
          // 샤워헤드 · 벽 · 히터 위의 막
          o += pvdR(74, 94, 252, th, filmC, { sw: .6, so: .3 }) + pvdR(74 + 0, 94, th, 150, filmC, { sw: .6, so: .3 }) + pvdR(326 - th, 94, th, 150, filmC, { sw: .6, so: .3 });
          o += pvdR(110, 196, 180, 34, 'url(#plHt)', { rx: 2 }) + pvdR(110, 196 - th, 180, th, filmC, { sw: .6, so: .3 }) + pvdR(190, 230, 20, 24, 'url(#plMt)');
          if (st === 'dep') {
            o += pvdR(140, 190, 120, 5, 'url(#plSi)') + `<ellipse cx="200" cy="146" rx="96" ry="30" fill="url(#plPl)"/>` + [150, 180, 220, 250].map(x => dgFlow(`M${x} 104 V184`)).join('');
            o += pcLab(350, 100, '샤워헤드에 가장 두껍게', 262, 96, 'start') + pvdTx(200, 224, '웨이퍼 + 둘레 모두에 쌓인다', { a: 'middle', st: 'font-size:9.5px;opacity:.9' });
          } else if (st === 'cl') {
            o += `<ellipse cx="200" cy="146" rx="96" ry="30" fill="rgba(52,211,153,.18)"/>`;
            o += [[130, 120], [170, 150], [210, 128], [250, 160], [160, 176], [240, 118], [280, 140], [118, 168]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="#34d399"/>`).join('') + pvdTx(200, 146, 'F·', { a: 'middle', st: 'font-size:11px;font-weight:800;fill:#34d399;opacity:1' });
            o += dgFlow('M200 54 V104') + pcAr(86, 232, 132, 266, '#2dd4bf', 2) + pvdTx(24, 242, 'SiF₄ ↑', { st: 'font-size:10px;font-weight:700;fill:#2dd4bf;opacity:1' });
            o += pvdTx(200, 224, 'F· + 막 → SiF₄ 기체 → 배기', { a: 'middle', st: 'font-size:9.5px;opacity:.9' });
          } else {
            o += pvdTx(200, 146, '얇은 시즈닝 막', { a: 'middle', st: 'font-size:10.5px;font-weight:800;fill:var(--hl-accent);opacity:1' }) + `<ellipse cx="200" cy="146" rx="96" ry="30" fill="url(#plPl)" opacity=".5"/>`;
            o += pvdTx(200, 224, '웨이퍼 없이 같은 막을 얇게 입힌다', { a: 'middle', st: 'font-size:9.5px;opacity:.9' });
          }
          // 배기
          o += pvdR(126, 254, 42, 14, 'url(#plMt)') + pvdTx(147, 288, '펌프', { a: 'middle', st: 'font-size:10px;opacity:.85' });
          // 타임라인
          const chips = [['웨이퍼 N장', 'dep'], ['세정', 'cl'], ['시즈닝', 'se'], ['웨이퍼 N장 …', 'dep']];
          let x = 20; chips.forEach(([t, k], i) => { const w = i === 0 || i === 3 ? 92 : 70, on = k === st && (i === 0 || i === 1 || i === 2); o += pvdR(x, 308, w, 24, on ? 'rgba(245,158,11,.25)' : 'rgba(15,23,42,.05)', { rx: 12, so: on ? .95 : .35, sw: on ? 1.6 : 1 }) + pvdTx(x + w / 2, 324, t, { a: 'middle', st: `font-size:10px;font-weight:${on ? 800 : 600};opacity:${on ? 1 : .75}` }); x += w + (i < 3 ? 10 : 0); if (i < 3) o += pvdL(`M${x - 8} 320 H${x}`, { so: .5 }); });
          return dgSvg('챔버 세정: ' + s.label, o, '0 0 440 344');
        }
      },
    });

    Object.assign(DIAGRAMS, {
      // ---------- 10. 막 응력과 웨이퍼 휨 ----------
      'pecvd-stress': {
        title: '막 응력과 웨이퍼 휨(보우)',
        wide: true,
        states: [
          { id: 'dir', label: '압축 응력과 인장 응력', focus: ['dir'], desc: '쌓인 막은 스스로 늘어나려 하거나(압축) 줄어들려(인장) 한다. 웨이퍼는 이를 받아 휜다. 위에 쌓인 막이 압축이면 웨이퍼가 위로 볼록하게, 인장이면 아래로 볼록하게(그릇 모양) 휜다. 응력의 크기는 막 두께를 늘릴수록, 막의 응력값이 클수록 커진다.' },
          { id: 'stack', label: '두꺼운 적층 막', focus: ['stack'], desc: '3D NAND는 산화막과 질화막을 번갈아 수십~수백 층 쌓는데, 이 적층도 PECVD 장비에서 만든다. 층이 늘수록 응력이 더해져 웨이퍼가 크게 휘고, 이 휨은 척에 고정이 안 되거나 노광에서 겹침이 틀어지는 문제로 이어진다.' },
          { id: 'comp', label: '뒷면 막으로 상쇄', focus: ['comp'], desc: '휨을 줄이는 방법은 레시피로 응력을 조절하는 것(HF/LF 비율, 온도, 가스 비)과, 웨이퍼 뒷면에 반대 응력의 막을 입혀 균형을 맞추는 것이다. 앞면과 뒷면의 힘이 상쇄되면 웨이퍼가 다시 평평해진다. 이중 주파수는 응력을 조절하는 대표 도구다.' }
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          let o = pcDefs('pw');
          const wafer = (x0, x1, y, bow) => { const xm = (x0 + x1) / 2; return `M${x0} ${y} Q${xm} ${y - 2 * bow} ${x1} ${y}`; };
          const thick = (x0, x1, y, bow, w, c, so = .75) => `<path d="${wafer(x0, x1, y, bow)}" style="fill:none;stroke:${c};stroke-width:${w};stroke-opacity:${so};stroke-linecap:butt"/>`;
          if (hot(['dir'])) {
            // 두 패널
            const panel = (cx, title, bow, fc, ar) => {
              let r = pvdTx(cx, 28, title, { a: 'middle', st: 'font-size:11px;font-weight:800' });
              r += thick(cx - 70, cx + 70, 140, bow, 10, '#94a3b8', .8) + thick(cx - 70, cx + 70, 133, bow, 4, fc, .95);
              r += pvdTx(cx, 188, '웨이퍼', { a: 'middle', st: 'font-size:9.5px;opacity:.75' });
              r += ar;
              return r;
            };
            o += panel(100, '압축 응력 (−)', 14, '#38bdf8', pcAr(60, 90, 40, 90, '#38bdf8', 1.8) + pcAr(140, 90, 160, 90, '#38bdf8', 1.8) + pvdTx(100, 84, '막이 늘어나려 함', { a: 'middle', st: 'font-size:9.5px;fill:#38bdf8;opacity:1;font-weight:700' }) + pvdTx(100, 208, '위로 볼록', { a: 'middle', st: 'font-size:10px;font-weight:700' }));
            o += panel(300, '인장 응력 (+)', -14, '#f59e0b', pcAr(240, 90, 262, 90, '#f59e0b', 1.8) + pcAr(360, 90, 338, 90, '#f59e0b', 1.8) + pvdTx(300, 84, '막이 줄어들려 함', { a: 'middle', st: 'font-size:9.5px;fill:#f59e0b;opacity:1;font-weight:700' }) + pvdTx(300, 208, '아래로 볼록 (그릇)', { a: 'middle', st: 'font-size:10px;font-weight:700' }));
            o += pvdTx(200, 240, 'PECVD 막: 단일 13.56 MHz는 인장, LF를 더하면 압축 쪽으로', { a: 'middle', st: 'font-size:10px;opacity:.85' });
            return dgSvg('막 응력: ' + s.label, o, '0 0 400 252');
          }
          // 적층
          const cx = 200;
          const bowAmt = hot(['stack']) ? 26 : 0;
          o += thick(60, 340, 230, bowAmt, 12, '#94a3b8', .85);
          const layers = 10;
          for (let i = 0; i < layers; i++) { const y = 218 - i * 7; o += thick(60, 340, y, bowAmt, 4.4, i % 2 ? '#a78bfa' : '#38bdf8', .9); }
          if (hot(['comp'])) { o = pcDefs('pw'); o += thick(60, 340, 230, 0, 12, '#94a3b8', .85); for (let i = 0; i < layers; i++) o += thick(60, 340, 218 - i * 7, 0, 4.4, i % 2 ? '#a78bfa' : '#38bdf8', .9); o += pvdR(60, 238, 280, 7, 'rgba(245,158,11,.6)', { so: .6 }) + pvdTx(200, 258, '뒷면 막 (반대 응력)', { a: 'middle', st: 'font-size:10px;font-weight:700;fill:#f59e0b;opacity:1' }); }
          o += pvdTx(200, 104, hot(['comp']) ? '앞뒷면 힘이 상쇄 → 평평' : '응력이 더해지며 웨이퍼가 휜다', { a: 'middle', st: 'font-size:11px;font-weight:800;fill:var(--hl-accent);opacity:1' });
          o += pvdR(124, 276, 9, 9, '#38bdf8', { so: .3 }) + pvdTx(138, 285, '산화막', { st: 'font-size:10px;font-weight:700' }) + pvdR(196, 276, 9, 9, '#a78bfa', { so: .3 }) + pvdTx(210, 285, '질화막', { st: 'font-size:10px;font-weight:700' });
          if (hot(['stack'])) o += dgArrow(200, 170, 200, 150) + pvdTx(212, 163, '휨(보우)', { st: 'font-size:9.5px;opacity:.85' });
          o += pvdTx(200, 266, hot(['comp']) ? '또는 레시피로 응력을 0에 가깝게 조절' : '수십~수백 층의 산화막/질화막 교대 적층 (3D NAND)', { a: 'middle', st: 'font-size:9.5px;opacity:.8' });
          return dgSvg('막 응력: ' + s.label, o, '0 90 400 214');
        }
      },

      // ---------- 11. 웨이퍼 한 장의 레시피 시간표 ----------
      'pecvd-recipe': {
        title: '웨이퍼 한 장이 지나가는 시간표',
        wide: true,
        states: [
          { id: 'all', label: '전체 단계', desc: '레시피는 시간 순서대로 이어진 단계의 묶음이다. 웨이퍼를 넣고, 진공을 만들고 가열하고, 가스를 흘려 압력을 안정시킨 뒤, RF를 켜 막을 쌓고, 가스를 빼고 웨이퍼를 꺼낸다. 막이 쌓이는 시간은 이 중 일부이고 나머지는 처리량을 깎는 대기 시간이다.' },
          { id: 'dep', label: '증착 단계 확대', focus: ['dep'], desc: '증착 단계는 RF가 켜지는 구간이다. 점화가 제때 되는지, 반사 파워가 곧 줄어드는지, 압력과 파워 곡선이 평소와 같은지를 본다. 막 두께는 대체로 RF가 켜진 시간과 증착 속도의 곱이라서, 점화가 늦어지면 그만큼 두께가 얇아진다.' }
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          let o = pcDefs('px');
          const x0 = 70, steps = [['① 넣기', 0, 40], ['② 펌핑·가열', 40, 120], ['③ 안정화', 120, 170], ['④ 증착', 170, 250], ['⑤ 퍼지', 250, 290], ['⑥ 꺼내기', 290, 330]];
          const X = (t) => x0 + t * 0.9;
          steps.forEach(([n, a, b], i) => { const act = i === 3; o += `<g opacity="${f && !act ? .35 : 1}">` + pvdR(X(a), 40, X(b) - X(a), 190, act ? 'rgba(245,158,11,.14)' : (i % 2 ? 'rgba(15,23,42,.04)' : 'rgba(15,23,42,.08)'), { so: .2 }) + pvdTx((X(a) + X(b)) / 2, 34, n, { a: 'middle', st: `font-size:${b - a < 50 ? 8.5 : 10}px;font-weight:700` }) + '</g>'; });
          // 레인
          const lane = (y, name, c, d) => pvdTx(10, y + 3, name, { st: `font-size:10px;font-weight:800;fill:${c};opacity:1` }) + pvdL(`M${x0} ${y + 30} H${X(330)}`, { so: .2 }) + pvdL(d, { c, sw: 2.4, so: .95 });
          o += lane(56, '온도', '#f87171', `M${X(0)} 84 L${X(40)} 84 L${X(120)} 62 H${X(330)}`);
          o += lane(110, '압력', '#38bdf8', `M${X(0)} 138 L${X(40)} 138 L${X(45)} 140 H${X(120)} L${X(125)} 118 H${X(250)} L${X(256)} 140 H${X(330)}`);
          o += lane(164, 'RF', '#a78bfa', `M${X(0)} 192 H${X(170)} L${X(176)} 170 H${X(250)} L${X(252)} 192 H${X(330)}`);
          o += pvdTx(10, 74, '(웨이퍼)', { st: 'font-size:8.5px;opacity:.7' }) + pvdTx(10, 128, '(높음↑)', { st: 'font-size:8.5px;opacity:.7' }) + pvdTx(10, 182, '(켜짐)', { st: 'font-size:8.5px;opacity:.7' });
          // 처리량 막대
          o += pvdTx(10, 262, '시간 배분', { st: 'font-size:10px;font-weight:800' }) + pvdR(x0, 248, X(330) - x0, 18, 'rgba(15,23,42,.05)', { rx: 4, so: .3 }) + pvdR(X(170), 248, X(250) - X(170), 18, 'rgba(245,158,11,.5)', { rx: 0, so: 0 }) + pvdTx((X(170) + X(250)) / 2, 261, '막 쌓기', { a: 'middle', st: 'font-size:9.5px;font-weight:800' }) + pvdTx(X(80), 261, '대기 · 준비', { a: 'middle', st: 'font-size:9.5px;opacity:.8' }) + pvdTx(X(290), 261, '정리', { a: 'middle', st: 'font-size:9.5px;opacity:.8' });
          if (hot(['dep'])) o += pcLab(330, 226, '점화 · 반사 파워 · 곡선 확인', X(176), 170, 'end', 'var(--hl-accent)');
          return dgSvg('레시피 시간표: ' + s.label, o, '0 0 400 280');
        }
      },
    });

    Object.assign(DIAGRAMS, {
      // ---------- 12. 사용처: 소자 단면에서 PECVD 막의 위치 ----------
      'pecvd-where': {
        title: '소자 단면에서 PECVD 막이 쓰이는 곳',
        wide: true,
        states: [
          { id: 'all', label: '전체 단면', desc: '트랜지스터(아래)와 금속 배선(위)이 층층이 쌓인 칩 단면이다. 색칠한 막이 PECVD 장비에서 만들어지는 대표적인 막이다. 낮은 온도에서도 빨리 쌓이기 때문에 이미 구리·알루미늄 배선이 만들어진 뒤에 위에 덮는 절연막에 특히 많이 쓴다.' },
          { id: 'feol', label: '트랜지스터 쪽', focus: ['feol'], desc: '트랜지스터 위에는 질화막을 덮어 채널에 응력을 주는 스트레스 라이너(CESL)를 만들고, 그 위에 전극을 분리하는 층간 절연막(PMD)을 쌓는다. 이 구간은 배선 금속이 아직 없어 비교적 높은 온도를 쓸 수 있는 대신 막의 응력과 수소 함량을 엄격하게 본다.' },
          { id: 'beol', label: '배선 쪽', focus: ['beol'], desc: '금속 배선 사이를 채우는 층간 절연막(IMD)은 PECVD 산화막(TEOS 계열, 불소나 탄소를 넣은 저유전율 막)이다. 배선 층 사이에는 구리 확산을 막고 식각을 멈추는 SiCN·SiN 막을 얇게 깐다. 식각 때 임시로 쓰는 하드마스크와 반사방지막(SiON, 비정질 탄소)도 PECVD로 만든다.' },
          { id: 'top', label: '맨 위 보호막', focus: ['top'], desc: '칩 맨 위는 산화막과 질화막으로 덮어 습기와 이온, 긁힘으로부터 소자를 보호한다(패시베이션). 수소가 많거나 성긴 막은 습기를 먹기 쉬워 이 단계에서는 막 품질을 특히 엄격하게 본다. 디스플레이의 TFT 절연막과 태양전지의 반사방지막도 같은 장비 계열로 만든다.' }
        ],
        svg(s) {
          const f = s.focus || null;
          let o = pcDefs('pj');
          const g = (grp, inner) => pvdG(f, grp, inner);
          // 기판 + STI + 소스/드레인
          o += pvdR(20, 304, 250, 48, 'url(#pjSi)') + pvdTx(145, 336, 'Si 기판', { a: 'middle', st: 'font-size:10px;opacity:.9' });
          o += pvdR(30, 304, 30, 20, 'url(#pjOx)', { so: .5 }) + pvdR(230, 304, 30, 20, 'url(#pjOx)', { so: .5 }) + pvdR(88, 304, 30, 12, 'rgba(245,158,11,.5)', { so: .4 }) + pvdR(148, 304, 30, 12, 'rgba(245,158,11,.5)', { so: .4 });
          // PMD
          o += g(['feol'], pvdR(20, 236, 250, 68, 'url(#pjOx)', { so: .5 }) + pvdTx(220, 258, 'PMD', { a: 'middle', st: 'font-size:10px;font-weight:800' }));
          // CESL (질화막 라이너: 트랜지스터 표면을 따라)
          o += g(['feol'], pvdL('M20 302 H112 V270 H152 V302 H270', { c: '#a78bfa', sw: 5, so: .95 }));
          // 게이트 + 컨택
          o += pvdR(118, 272, 28, 30, 'url(#pjMt)') + pvdTx(132, 290, '게이트', { a: 'middle', st: 'font-size:8.5px;opacity:.85' });
          o += pvdR(96, 236, 10, 68, '#64748b', { so: .6 }) + pvdR(158, 236, 10, 68, '#64748b', { so: .6 });
          // ESL1 + IMD1 + M1
          o += g(['beol'], pvdR(20, 230, 250, 6, 'url(#pjLk)', { so: .6 }) + pvdR(20, 174, 250, 56, 'url(#pjOx)', { so: .5 }));
          o += pvdR(84, 198, 38, 32, 'url(#pjCu)') + pvdR(142, 198, 38, 32, 'url(#pjCu)') + pvdR(210, 198, 40, 32, 'url(#pjCu)');
          o += pvdTx(180, 192, 'M1', { st: 'font-size:9px;opacity:.8;font-weight:700' });
          // ESL2 + IMD2 + M2
          o += g(['beol'], pvdR(20, 168, 250, 6, 'url(#pjLk)', { so: .6 }) + pvdR(20, 112, 250, 56, 'url(#pjOx)', { so: .5 }));
          o += pvdR(98, 168, 10, 30, 'url(#pjCu)') + pvdR(70, 136, 66, 32, 'url(#pjCu)') + pvdR(160, 136, 60, 32, 'url(#pjCu)');
          o += pvdTx(240, 130, 'M2', { st: 'font-size:9px;opacity:.8;font-weight:700' });
          // 패시베이션
          o += g(['top'], pvdR(20, 90, 250, 14, 'url(#pjNt)', { so: .6 }) + pvdR(20, 104, 250, 8, 'url(#pjOx)', { so: .5 }));
          // 하드마스크 · ARC (임시)
          o += g(['beol'], pvdR(20, 80, 250, 6, 'rgba(244,114,182,.35)', { so: .5, dash: '3 3' }) + pvdTx(145, 76, '임시 하드마스크 · ARC (식각 후 제거)', { a: 'middle', st: 'font-size:8.5px;opacity:.85' }));
          // 번호 호출선
          o += pvdCall(f, ['top'], '1', '#a78bfa', 300, 100, 312, 104, ['패시베이션', '(SiN · SiO₂)'], 270, 100);
          o += pvdCall(f, ['beol'], '2', '#38bdf8', 300, 140, 312, 144, ['IMD', '(SiO₂ · low-k)'], 270, 140);
          o += pvdCall(f, ['beol'], '3', '#2dd4bf', 300, 184, 312, 188, ['식각 정지 ·', '배리어 (SiCN)'], 270, 171);
          o += pvdCall(f, ['feol'], '4', '#38bdf8', 300, 250, 312, 254, ['PMD', '(산화막)'], 270, 250);
          o += pvdCall(f, ['feol'], '5', '#a78bfa', 300, 296, 312, 300, ['스트레스', '라이너(SiN)'], 270, 302);
          o += pvdCall(f, ['beol'], '6', '#f472b6', 300, 62, 312, 66, ['하드마스크', '· ARC'], 270, 83);
          return dgSvg('PECVD 막의 위치: ' + s.label, o, '0 52 400 308');
        }
      },
    });

    // ===== CMP 장비 가이드용 그림 (pvd_diagrams.js 의 pvd* 도우미를 같이 쓴다) =====
    const cmDefs = (p) => pvdDefs(p) + `<defs>
      <linearGradient id="${p}Ox" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dd3fc" stop-opacity=".62"/><stop offset="1" stop-color="#38bdf8" stop-opacity=".5"/></linearGradient>
      <linearGradient id="${p}Pd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6d3d1" stop-opacity=".8"/><stop offset="1" stop-color="#a8a29e" stop-opacity=".7"/></linearGradient>
      <linearGradient id="${p}Gl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7dd3fc" stop-opacity=".5"/><stop offset=".5" stop-color="#e0f2fe" stop-opacity=".6"/><stop offset="1" stop-color="#7dd3fc" stop-opacity=".5"/></linearGradient>
      <linearGradient id="${p}Sl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde68a" stop-opacity=".55"/><stop offset="1" stop-color="#fbbf24" stop-opacity=".3"/></linearGradient>
      <linearGradient id="${p}Dm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c4b5fd" stop-opacity=".7"/><stop offset="1" stop-color="#8b5cf6" stop-opacity=".55"/></linearGradient>
    </defs>`;
    const cmAr = (x1, y1, x2, y2, c, w = 1.6, dash) => { const a = Math.atan2(y2 - y1, x2 - x1), h = 5.5, p = (t) => `${(x2 - h * Math.cos(a + t)).toFixed(1)},${(y2 - h * Math.sin(a + t)).toFixed(1)}`; return `<path d="M${x1} ${y1} L${x2} ${y2}" style="fill:none;stroke:${c};stroke-width:${w};stroke-linecap:round${dash ? ';stroke-dasharray:' + dash : ''}"/><path d="M${x2} ${y2} L${p(.45)} L${p(-.45)} Z" fill="${c}"/>`; };
    const cmDot = (x, y, r, fill, nofill) => `<circle cx="${x}" cy="${y}" r="${r}" style="fill:${nofill ? 'none' : fill};stroke:${nofill ? fill : 'none'};stroke-width:1.5"/>`;
    const cmLab = (x, y, t, px, py, a = 'start', c) => `<path d="M${px} ${py} L${a === 'end' ? x + 3 : x - 3} ${y - 3}" style="fill:none;stroke:currentColor;stroke-width:.9;stroke-opacity:.45"/><circle cx="${px}" cy="${py}" r="1.8" fill="currentColor" opacity=".65"/>` + pvdTx(x, y, t, { a, st: `font-size:10.5px;font-weight:600;opacity:.95${c ? ';fill:' + c : ''}` });
    const cmTxt = (x, y, t, st = '', a = 'start') => pvdTx(x, y, t, { a, st: 'font-size:10px;' + st });

    Object.assign(DIAGRAMS, {
      // ---------- 1. 장비 전체 구성 (평면) ----------
      'cmp-overview': {
        title: 'CMP 장비의 전체 구성 (위에서 본 모습)',
        wide: true,
        states: [
          { id: 'all', label: '전체 구성', desc: '웨이퍼 통(FOUP)과 대기 로봇(EFEM)이 있는 앞쪽, 웨이퍼를 갈아 내는 연마부, 갈고 난 웨이퍼를 씻고 말리는 세정부, 그리고 장비를 받치는 슬러리 공급·초순수·진공 설비로 나뉜다. 연마부와 세정부가 한 몸으로 붙어 있어 웨이퍼가 젖은 채로 대기를 만나지 않는다.' },
          { id: 'flow', label: '웨이퍼가 지나가는 길', focus: ['path', 'fp', 'pol', 'cl'], desc: '로봇이 FOUP에서 웨이퍼를 꺼내 연마부의 로딩 자리에 올리면, 연마 헤드가 웨이퍼를 집어 첫 번째 플래튼(P1)에서 구리를, 두 번째(P2)에서 배리어를, 세 번째(P3)에서 마무리 연마를 한다. 이어서 세정부의 메가소닉, 브러시 두 칸, 스핀 건조를 지나 마른 상태로 FOUP에 돌아간다.' },
          { id: 'pol', label: '연마부', focus: ['pol'], desc: '연마부에는 플래튼 여러 개가 있고, 각 플래튼은 패드를 붙인 채 돈다. 웨이퍼를 잡은 헤드가 플래튼 사이를 옮겨 다니며 단계별로 다른 슬러리로 연마한다. 플래튼마다 컨디셔너와 슬러리 팔이 달려 패드 상태와 공급을 맡는다.' },
          { id: 'clean', label: '세정부 · 측정', focus: ['cl', 'mt'], desc: '연마가 끝난 웨이퍼 표면에는 슬러리 입자와 구리 부스러기가 달라붙어 있다. 메가소닉(초음파), 양면 브러시, 스핀 건조로 차례로 떼어 낸다. 장비에 따라 세정부 끝에 두께·잔여 구리를 재는 측정 모듈이 붙어 있어, 갈린 양을 바로 확인한다.' },
          { id: 'util', label: '유틸리티', focus: ['ut'], desc: '슬러리는 캐비닛에서 배관으로 각 플래튼 팔까지 공급된다. 초순수(DIW), 압축 공기와 진공(헤드 가압·웨이퍼 흡착), 약액 공급과 폐수 처리(슬러리 입자가 섞인 폐액)가 장비를 받친다. 슬러리 공급이 흔들리면 제거 속도가 그대로 흔들린다.' }
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          let o = cmDefs('mo');
          const platen = (cx, cy, n) => `<g><circle cx="${cx}" cy="${cy}" r="40" style="fill:url(#moPd);stroke:currentColor;stroke-opacity:.7;stroke-width:1.3"/><circle cx="${cx}" cy="${cy}" r="30" style="fill:none;stroke:currentColor;stroke-opacity:.25;stroke-dasharray:2 4"/>`
            + `<circle cx="${cx - 6}" cy="${cy + 4}" r="14" style="fill:url(#moSi);stroke:currentColor;stroke-opacity:.7"/>` + pvdTx(cx - 6, cy + 8, 'H', { a: 'middle', st: 'font-size:10px;font-weight:800' })
            + pvdL(`M${cx + 18} ${cy - 18} L${cx + 40} ${cy - 40}`, { sw: 3, so: .65, c: '#f59e0b' }) + pvdTx(cx, cy + 56, n, { a: 'middle', st: 'font-size:10.5px;font-weight:800' }) + '</g>';
          // 구역 상자
          o += pvdG(f, ['pol'], pvdR(104, 20, 284, 156, 'rgba(167,139,250,.06)', { rx: 12, dash: '3 4', so: .35 }) + pvdTx(246, 34, '연마부', { a: 'middle', st: 'font-size:9.5px;opacity:.6;font-weight:700;letter-spacing:.06em' }));
          o += pvdG(f, ['pol'], platen(152, 100, 'P1 구리') + platen(246, 100, 'P2 배리어') + platen(340, 100, 'P3 마무리'));
          // 로딩 자리
          o += pvdG(f, ['pol', 'fp'], pvdR(106, 150, 24, 22, 'url(#moMt)', { rx: 3 }) + pvdTx(118, 188, '로딩', { a: 'middle', st: 'font-size:9px;opacity:.75' }));
          // 세정부
          o += pvdG(f, ['cl'], pvdR(104, 214, 284, 62, 'rgba(45,212,191,.07)', { rx: 12, dash: '3 4', so: .35 }) + pvdTx(246, 228, '세정부', { a: 'middle', st: 'font-size:9.5px;opacity:.6;font-weight:700;letter-spacing:.06em' })
            + [['메가소닉', 304], ['브러시 ①', 240], ['브러시 ②', 176], ['스핀 건조', 112]].map(([t, x]) => pvdR(x, 240, 60, 30, 'url(#moLk)', { rx: 5, so: .75 }) + pvdTx(x + 30, 259, t, { a: 'middle', st: 'font-size:9.5px;font-weight:700' })).join(''));
          o += `<defs><linearGradient id="moLk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5eead4" stop-opacity=".5"/><stop offset="1" stop-color="#2dd4bf" stop-opacity=".3"/></linearGradient></defs>`;
          // 측정
          o += pvdG(f, ['mt', 'cl'], pvdR(104, 290, 100, 24, 'rgba(244,114,182,.15)', { rx: 5, so: .7 }) + pvdTx(154, 306, '측정 모듈 (선택)', { a: 'middle', st: 'font-size:9.5px;font-weight:700' }));
          // EFEM + FOUP
          o += pvdG(f, ['fp'], pvdR(52, 20, 36, 280, 'rgba(56,189,248,.09)', { rx: 6, so: .6 }) + pvdTx(70, 36, 'EFEM', { a: 'middle', st: 'font-size:9.5px;opacity:.75' }) + `<circle cx="70" cy="160" r="9" style="fill:url(#moMt);stroke:currentColor;stroke-opacity:.7"/>`
            + [60, 130, 200].map(y => pvdR(8, y, 34, 52, 'url(#moOx)', { rx: 5 }) + pvdTx(25, y + 28, 'FOUP', { a: 'middle', st: 'font-size:8.5px;font-weight:700' })).join('') + pvdR(88, 150, 18, 24, 'url(#moMt)') + pvdR(88, 252, 18, 16, 'url(#moMt)'));
          // 유틸리티
          o += pvdG(f, ['ut'], pvdR(14, 340, 372, 64, 'rgba(45,212,191,.05)', { rx: 10, dash: '3 4', so: .35 }) + pvdTx(200, 354, '유틸리티 (장비 뒤쪽 · 아래층)', { a: 'middle', st: 'font-size:9.5px;opacity:.55;font-weight:700;letter-spacing:.06em' })
            + [['슬러리', '캐비닛·배관', 22, 'rgba(245,158,11,.18)'], ['초순수', 'DIW·약액', 112, 'rgba(56,189,248,.18)'], ['공기 · 진공', '가압·흡착', 202, 'rgba(167,139,250,.18)'], ['폐액 처리', '배수·스크러버', 292, 'rgba(251,113,133,.16)']].map(([a, b, x, c]) => pvdR(x, 362, 84, 34, c, { rx: 6, so: .8 }) + pvdTx(x + 42, 377, a, { a: 'middle', st: 'font-size:10px;font-weight:700' }) + pvdTx(x + 42, 389, b, { a: 'middle', st: 'font-size:8.5px;opacity:.75' })).join('')
          );
          // 웨이퍼 경로
          if (hot(['path'])) o += dgFlow('M42 86 H70 V160 H118 V100 H340 H386 V247 H92');
          // 번호
          o += pvdG(f, ['fp'], pvdNum(70, 300, '1', '#38bdf8'));
          o += pvdG(f, ['pol'], pvdNum(396, 100, '2', '#a78bfa'));
          o += pvdG(f, ['cl'], pvdNum(396, 255, '3', '#2dd4bf'));
          o += pvdG(f, ['mt'], pvdNum(216, 302, '4', '#f472b6'));
          o += pvdG(f, ['ut'], pvdNum(396, 372, '5', '#f59e0b'));
          return dgSvg('CMP 장비 전체 구성: ' + s.label, o, '0 0 410 412');
        }
      },

      // ---------- 2. 연마 스테이션 단면 (핵심 구조도) ----------
      'cmp-station': {
        title: 'CMP 연마 스테이션 단면',
        wide: true,
        states: [
          { id: 'all', label: '전체 단면', desc: '회전하는 플래튼에 패드가 붙어 있고, 그 위에 웨이퍼의 앞면(연마할 면)이 아래로 향한 채 눌린다. 웨이퍼를 잡은 헤드도 돌면서 패드를 가로질러 움직이고, 패드 위에는 슬러리가 계속 흘러든다. 한쪽에서는 컨디셔너가 패드 표면을 다듬고, 플래튼 속의 센서가 연마 진행을 지켜본다.' },
          { id: 'head', label: '헤드와 웨이퍼', focus: ['hd', 'wf'], desc: '헤드는 웨이퍼를 진공으로 집어 옮기고, 연마할 때는 얇은 멤브레인 뒤의 공기 압력으로 웨이퍼를 패드에 누른다. 둘레의 리테이너 링이 웨이퍼가 옆으로 빠지는 것을 막는 동시에 가장자리 패드를 눌러 가장자리의 제거 속도를 조절한다. 헤드는 웨이퍼를 천천히 돌리며 패드 위를 오간다.' },
          { id: 'pad', label: '패드 · 플래튼 · 컨디셔너', focus: ['pd', 'cd'], desc: '패드는 구멍이 많고 홈이 파인 폴리우레탄 계열 판이라 슬러리를 머금고 웨이퍼를 문지른다. 쓰다 보면 표면이 매끈해져 슬러리를 못 머금는데, 다이아몬드 입자가 박힌 컨디셔너가 표면을 긁어 거칠기를 되살린다. 패드와 컨디셔너 디스크는 정해진 사용 시간이 지나면 교체하는 소모품이다.' },
          { id: 'slurry', label: '슬러리', focus: ['sl'], desc: '슬러리는 화학 약품과 연마 입자가 섞인 액체로, 팔 끝의 노즐이 패드 중앙 쪽에 일정한 유량으로 흘려 준다. 패드가 돌며 슬러리를 웨이퍼 아래로 끌고 간다. 유량이 모자라면 제거 속도가 떨어지고, 슬러리가 마르면 굳은 입자가 스크래치의 원인이 된다.' },
          { id: 'ep', label: '종점 감지', focus: ['ep', 'wf'], desc: '플래튼과 패드에는 빛이 지나가는 작은 창이 있고, 아래의 센서가 웨이퍼가 창 위를 지날 때마다 표면의 반사광을 읽는다. 구리가 걷히면 반사광이 크게 바뀐다. 또는 플래튼과 헤드를 돌리는 모터의 전류가 마찰이 바뀌는 순간에 변하는 것을 읽어, 연마를 멈출 때를 찾는다.' }
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          let o = cmDefs('cs');
          // 헤드 팔 · 샤프트
          o += pvdG(f, ['hd'], pvdR(100, 168, 200, 10, 'url(#csMt)') + pvdR(190, 178, 20, 50, 'url(#csMt)') + pvdL('M176 200 C176 188 224 188 224 200', { c: '#34d399', sw: 1.6 }) + cmAr(220, 196, 226, 202, '#34d399', 1.4) + cmTxt(300, 192, '헤드 회전', 'opacity:.75'));
          // 헤드 몸통 + 압력실
          o += pvdG(f, ['hd'], pvdR(116, 228, 168, 80, 'url(#csMt)', { rx: 4 }) + pvdR(132, 262, 48, 38, 'rgba(56,189,248,.18)', { so: .5 }) + pvdR(184, 262, 32, 38, 'rgba(56,189,248,.28)', { so: .5 }) + pvdR(220, 262, 48, 38, 'rgba(56,189,248,.18)', { so: .5 })
            + cmTxt(200, 248, '공기 압력실 (존)', 'font-weight:700', 'middle') + pvdL('M156 262 V240 M200 262 V252 M244 262 V240', { so: .5 }) + [156, 200, 244].map(x => cmAr(x, 266, x, 290, '#38bdf8', 1.4)).join(''));
          // 리테이너 링 + 멤브레인
          o += pvdG(f, ['hd'], pvdR(116, 308, 14, 20, 'url(#csDm)', { so: .6 }) + pvdR(270, 308, 14, 20, 'url(#csDm)', { so: .6 }) + pvdR(130, 308, 140, 7, 'rgba(15,23,42,.35)', { so: .5 }));
          // 웨이퍼
          o += pvdG(f, ['wf', 'hd', 'ep'], pvdR(130, 315, 140, 7, 'url(#csSi)') + pvdL('M130 322 H270', { c: '#f59e0b', sw: 1.4, so: .9 }));
          // 슬러리 막 (웨이퍼-패드 사이)
          o += pvdG(f, ['sl', 'pd', 'wf'], pvdR(120, 322, 160, 6, 'url(#csSl)', { so: 0 }));
          // 패드
          o += pvdG(f, ['pd', 'ep'], pvdR(34, 328, 128, 12, 'url(#csPd)') + pvdR(178, 328, 188, 12, 'url(#csPd)') + [50, 78, 106, 134, 190, 218, 246, 274, 302, 330, 354].map(x => pvdL(`M${x} 328 V334`, { so: .45 })).join('') + pvdR(162, 328, 16, 12, 'url(#csGl)', { so: .6 })); // pad label via callout
          // 플래튼 + 축
          o += pvdG(f, ['pd', 'ep'], pvdR(30, 340, 132, 22, 'url(#csMt)') + pvdR(178, 340, 192, 22, 'url(#csMt)') + pvdR(188, 362, 24, 50, 'url(#csMt)') + pvdR(160, 412, 80, 18, 'url(#csMt)', { rx: 4 }) + cmTxt(296, 380, '플래튼 회전', 'opacity:.75') + cmAr(272, 386, 264, 372, '#34d399', 1.4));
          // 센서
          o += pvdG(f, ['ep'], pvdR(150, 362, 36, 20, 'rgba(244,114,182,.2)', { rx: 4, so: .8 }) + pvdTx(168, 375, '센서', { a: 'middle', st: 'font-size:9.5px;font-weight:700' }) + (hot(['ep']) ? dgFlow('M170 362 V318') : cmAr(170, 358, 170, 336, '#f472b6', 1.6, '3 3')));
          // 슬러리 팔
          o += pvdG(f, ['sl'], pvdR(30, 96, 92, 30, 'rgba(245,158,11,.2)', { rx: 5, so: .8 }) + pvdTx(76, 109, '슬러리 탱크', { a: 'middle', st: 'font-size:10px;font-weight:700' }) + pvdTx(76, 121, '펌프 · 유량계', { a: 'middle', st: 'font-size:8.5px;opacity:.8' })
            + pvdL('M76 126 V150 H70 V296', { c: '#f59e0b', sw: 3, so: .7 }) + pvdL('M64 296 H76 L70 308 Z', { fill: '#f59e0b', c: '#f59e0b', so: .7, sw: 1 }) + (hot(['sl']) ? dgFlow('M70 308 V324') : '') + [64, 76, 70].map((x, i) => cmDot(x, 316 + (i % 2) * 5, 1.8, '#f59e0b')).join(''));
          // 컨디셔너
          o += pvdG(f, ['cd', 'pd'], pvdL('M388 160 V218 H330 V296', { c: '#94a3b8', sw: 5, so: .55 }) + pvdR(298, 296, 64, 22, 'url(#csMt)', { rx: 3 }) + pvdR(298, 318, 64, 8, 'rgba(15,23,42,.45)', { so: .5 }) + [304, 318, 332, 346, 356].map(x => `<polygon points="${x},326 ${x + 3},331 ${x - 3},331" fill="#e5e7eb" stroke="currentColor" stroke-opacity=".5" stroke-width=".6"/>`).join('') );
          // 번호 호출선
          o += pvdCall(f, ['hd', 'wf'], '1', '#34d399', 392, 250, 404, 254, ['헤드 · 링 · 멤브레인'], 284, 262);
          o += pvdCall(f, ['cd'], '2', '#fb7185', 392, 300, 404, 304, ['컨디셔너'], 362, 308);
          o += pvdCall(f, ['pd'], '3', '#a8a29e', 392, 336, 404, 340, ['패드'], 366, 334);
          o += pvdCall(f, ['pd'], '4', '#94a3b8', 392, 372, 404, 376, ['플래튼'], 368, 352);
          o += pvdG(f, ['sl'], pvdNum(16, 111, '5', '#f59e0b'));
          o += pvdG(f, ['ep'], pvdNum(20, 392, '6', '#f472b6') + cmLab(32, 396, '종점 센서', 150, 376));
          return dgSvg('CMP 연마 스테이션: ' + s.label, o, '0 84 500 358');
        }
      },

      // ---------- 3. 캐리어 헤드 ----------
      'cmp-head': {
        title: '캐리어 헤드: 존 압력과 리테이너 링',
        wide: true,
        states: [
          { id: 'all', label: '헤드 구조', desc: '헤드 안쪽에는 중심에서 가장자리까지 몇 개의 고리 모양 압력실이 있고, 각 실의 공기 압력을 따로 조절한다. 압력은 얇은 멤브레인을 통해 웨이퍼 뒷면에 전해진다. 웨이퍼 둘레의 리테이너 링은 웨이퍼를 잡아 두면서 패드와 직접 맞닿아 있다.' },
          { id: 'zone', label: '존 압력', focus: ['zn'], desc: '웨이퍼 반지름 방향의 제거 속도 차이는 존별 압력으로 보정한다. 가운데가 덜 깎이면 안쪽 존의 압력을 올리고, 가장자리가 더 깎이면 바깥 존의 압력을 내린다. 압력과 제거 속도는 비례하므로(프레스턴 법칙) 그림처럼 압력 분포가 곧 제거 속도 분포가 된다.' },
          { id: 'ring', label: '리테이너 링', focus: ['rg'], desc: '링이 패드를 누르는 압력이 가장자리 속도를 바꾼다. 링 압력이 낮으면 패드가 웨이퍼 가장자리로 밀려 올라와 가장자리가 더 많이 깎이고, 링 압력이 높으면 가장자리 패드가 눌려 가장자리가 덜 깎인다. 링은 마모되면 이 효과가 변해서 가장자리 불량의 단골 원인이 된다.' }
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          let o = cmDefs('ch');
          // 몸통
          o += pvdR(40, 20, 320, 14, 'url(#chMt)') + pvdR(40, 34, 14, 110, 'url(#chMt)') + pvdR(346, 34, 14, 110, 'url(#chMt)');
          // 압력실 5개
          const zones = [[58, 60], [120, 56], [180, 40], [224, 56], [284, 60]];
          const zx = [[58, 118], [122, 178], [182, 218], [222, 278], [282, 342]];
          zx.forEach(([a, b], i) => { o += pvdG(f, ['zn', 'hd'], pvdR(a, 40, b - a - 2, 76, `rgba(56,189,248,${hot(['zn']) ? .18 + (i === 2 ? .25 : i === 0 ? .1 : .05) : .16})`, { so: .45 }) + pvdTx((a + b) / 2, 54, 'Z' + (i + 1), { a: 'middle', st: 'font-size:9.5px;font-weight:800;opacity:.85' }) + cmAr((a + b) / 2 - 1, 62, (a + b) / 2 - 1, 100 + (hot(['zn']) ? (i === 2 ? 4 : i === 0 ? -4 : 0) : 0), '#38bdf8', hot(['zn']) ? 2.4 : 1.4)); });
          // 멤브레인 + 웨이퍼 + 링
          o += pvdR(54, 116, 292, 8, 'rgba(15,23,42,.35)', { so: .5 }) + pvdR(70, 124, 260, 14, 'url(#chSi)') + pvdR(40, 116, 14, 28, 'url(#chDm)', { so: .6 }) + pvdR(346, 116, 14, 28, 'url(#chDm)', { so: .6 });
          o += pvdTx(200, 134, '웨이퍼', { a: 'middle', st: 'font-size:9px;opacity:.8;font-weight:700' }) + cmLab(368, 124, '멤브레인', 346, 120, 'start') + (hot(['rg']) || !f ? cmLab(26, 166, '리테이너 링', 47, 140, 'end', '#a78bfa') : '');
          // 패드
          o += pvdR(30, 144, 340, 12, 'url(#chPd)') + pvdTx(200, 168, '패드', { a: 'middle', st: 'font-size:9.5px;opacity:.7' });
          if (hot(['rg'])) o += cmAr(47, 98, 47, 130, '#a78bfa', 2.6) + cmAr(353, 98, 353, 130, '#a78bfa', 2.6) + pvdTx(47, 92, '링 압력', { a: 'middle', st: 'font-size:9.5px;fill:#a78bfa;font-weight:800;opacity:1' });
          // 속도 분포 그래프
          o += pvdL('M40 196 V300 H360', { so: .5 }) + cmTxt(40, 190, '제거 속도', 'opacity:.75') + cmTxt(360, 314, '반지름', 'opacity:.75', 'end') + cmTxt(40, 314, '가장자리', 'opacity:.7') + cmTxt(200, 314, '중심', 'opacity:.7', 'middle') + cmTxt(360, 300 + 0, '', '');
          o += pvdL('M44 232 H356', { dash: '2 4', so: .4 });
          const base = 'M44 242 C100 236 150 236 200 236 C250 236 300 236 356 242';
          const cen = 'M44 252 C100 240 150 224 200 218 C250 224 300 240 356 252';
          const edL = 'M44 218 C70 226 100 238 150 238 C250 238 290 238 330 226 L356 214';
          const edH = 'M44 258 C70 252 100 244 150 240 C250 240 290 244 330 252 L356 262';
          if (hot(['zn'])) o += pvdL(cen, { c: '#fb7185', sw: 2, so: .9, dash: '4 3' }) + pvdL(base, { c: 'var(--hl-accent)', sw: 2.6, so: 1 }) + cmTxt(206, 214, '중심 존 압력↑ → 가운데 속도↑', 'fill:#fb7185;font-weight:700;opacity:1', 'middle');
          else if (hot(['rg'])) o += pvdL(edL, { c: '#fb7185', sw: 2, so: .9 }) + pvdL(edH, { c: '#38bdf8', sw: 2, so: .9 }) + cmTxt(206, 276, '링 압력 낮음: 가장자리 더 깎임 (빨강)', 'fill:#fb7185;font-weight:700;opacity:1', 'middle') + cmTxt(206, 290, '링 압력 높음: 가장자리 덜 깎임 (파랑)', 'fill:#38bdf8;font-weight:700;opacity:1', 'middle');
          else o += pvdL(base, { c: 'var(--hl-accent)', sw: 2.6, so: 1 }) + cmTxt(206, 276, '존 압력 · 링 압력으로 반지름 방향 속도를 맞춘다', 'opacity:.85', 'middle');
          return dgSvg('캐리어 헤드: ' + s.label, o, '-34 0 464 322');
        }
      },

      // ---------- 4. 패드와 컨디셔닝 ----------
      'cmp-pad': {
        title: '패드 표면과 컨디셔닝',
        wide: true,
        states: [
          { id: 'fresh', label: '새 패드', focus: ['f'], desc: '새 패드(또는 컨디셔닝으로 되살린 패드)의 표면은 거칠고 구멍이 열려 있다. 튀어나온 거친 돌기(아스퍼리티)가 웨이퍼와 맞닿아 문지르고, 돌기 사이의 골에는 슬러리가 고여 연마 입자를 공급한다. 제거 속도가 높고 안정적이다.' },
          { id: 'glaze', label: '글레이징(매끈해진 패드)', focus: ['g'], desc: '쓰다 보면 돌기가 닳아 납작해지고 구멍이 슬러리 찌꺼기로 막힌다(글레이징). 슬러리가 고일 골이 없어져 웨이퍼 아래로 들어가는 슬러리가 줄고, 제거 속도가 서서히 떨어진다. 같은 레시피에서 매수가 늘수록 속도가 느려지는 가장 흔한 원인이다.' },
          { id: 'cond', label: '컨디셔닝', focus: ['c'], desc: '컨디셔너의 다이아몬드 입자가 닳은 패드 표면을 얇게 긁어 새 돌기와 구멍을 만든다. 너무 세게 긁으면 패드가 빨리 닳고, 너무 약하면 글레이징이 남는다. 컨디셔닝 압력과 시간은 패드 수명과 제거 속도 안정성의 균형으로 정한다.' }
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          const st = hot(['c']) ? 'c' : hot(['g']) ? 'g' : 'f';
          let o = cmDefs('cp');
          // 웨이퍼(위)
          o += pvdR(30, 30, 340, 10, 'url(#cpSi)') + cmTxt(36, 26, '웨이퍼 (아래를 향한 연마 면)', 'font-weight:700');
          o += [200, 250, 300].map(x => cmAr(x, 6, x, 28, '#34d399', 1.8)).join('') + cmTxt(366, 20, '누르는 힘', 'opacity:.75', 'end');
          // 패드 윗면 프로파일
          const y0 = 160;
          let top = '';
          const asp = st === 'f' || st === 'c' ? [[40, 26], [64, 20], [88, 28], [112, 18], [136, 24], [160, 30], [184, 20], [208, 26], [232, 18], [256, 28], [280, 22], [304, 26], [328, 20], [352, 24]] : [[40, 6], [64, 5], [88, 7], [112, 4], [136, 6], [160, 6], [184, 5], [208, 7], [232, 4], [256, 6], [280, 5], [304, 6], [328, 5], [352, 6]];
          let d = `M30 ${y0 + 40} V${y0}`;
          asp.forEach(([x, h], i) => { d += ` L${x - 8} ${y0} L${x - 3} ${y0 - h} L${x + 3} ${y0 - h} L${x + 8} ${y0}`; });
          d += ` L370 ${y0} V${y0 + 40} Z`;
          o += `<path d="${d}" style="fill:url(#cpPd);stroke:currentColor;stroke-opacity:.7;stroke-width:1.3"/>`;
          // 구멍(포어)
          const pores = st === 'g' ? [[70, 190, 3], [150, 196, 3], [230, 188, 3], [310, 194, 3]] : [[56, 182, 6], [100, 190, 5], [148, 184, 6], [196, 192, 5], [244, 182, 6], [292, 190, 5], [338, 184, 6]];
          o += pores.map(([x, y, r]) => st === 'g' ? `<circle cx="${x}" cy="${y}" r="${r}" fill="#78716c" opacity=".65"/>` : `<circle cx="${x}" cy="${y}" r="${r}" style="fill:rgba(15,23,42,.2);stroke:currentColor;stroke-opacity:.4"/>`).join('');
          // 슬러리 입자 (골)
          const sl = st === 'g' ? [[100, 156], [250, 157]] : [[76, 152], [98, 156], [124, 150], [148, 156], [172, 152], [196, 155], [220, 150], [244, 156], [268, 152], [292, 155], [316, 150], [340, 156]];
          o += sl.map(([x, y]) => cmDot(x, y, 2.4, '#f59e0b')).join('') + (st === 'g' ? '' : cmTxt(200, 112, '슬러리 입자가 골에 고인다', 'fill:#b45309;font-weight:700;opacity:1', 'middle'));
          // 접촉 표시
          o += pvdTx(200, 214, st === 'f' ? '거칠고 구멍이 열림 → 속도 높음' : st === 'g' ? '돌기 납작 · 구멍 막힘 → 속도 낮음' : '다이아몬드가 표면을 얇게 긁는다', { a: 'middle', st: 'font-size:11px;font-weight:800;fill:var(--hl-accent);opacity:1' });
          // 컨디셔너
          if (st === 'c') { o += pvdR(150, 70, 100, 12, 'url(#cpMt)', { rx: 3 }) + `<g>${[160, 178, 196, 214, 232].map(x => `<polygon points="${x},82 ${x + 5},92 ${x - 5},92" fill="#e5e7eb" stroke="currentColor" stroke-opacity=".6" stroke-width=".8"/>`).join('')}</g>` + cmTxt(200, 62, '컨디셔너 디스크', 'font-weight:700', 'middle') + cmAr(266, 130, 290, 140, '#fb7185', 1.6) + cmTxt(296, 138, '긁어낸 찌꺼기', 'opacity:.8'); }
          // 거시 단면: 홈
          o += pvdR(30, 258, 340, 34, 'url(#cpPd)') + [60, 112, 164, 216, 268, 320].map(x => pvdR(x, 258, 10, 14, 'rgba(15,23,42,.18)', { so: .5 })).join('') + pvdR(30, 292, 340, 18, 'rgba(120,113,108,.35)', { so: .5 }) + cmTxt(30, 250, '패드 단면: 표면의 홈이 슬러리를 나른다', 'font-weight:700') + cmTxt(38, 304, '서브패드 (쿠션)', 'opacity:.8');
          return dgSvg('패드 표면: ' + s.label, o, '0 0 400 320');
        }
      },
    });

    Object.assign(DIAGRAMS, {
      // ---------- 5. 슬러리 ----------
      'cmp-slurry': {
        title: '슬러리: 구성 성분과 연마 메커니즘',
        wide: true,
        states: [
          { id: 'comp', label: '슬러리 구성', focus: ['cp'], desc: '슬러리는 물에 연마 입자(실리카·세리아·알루미나 등)와 여러 약품을 녹이고 섞은 액체다. 산화제는 금속 표면에 무르고 얇은 막을 만들고, 착화제는 그 막을 녹기 쉽게 만들며, 부식 억제제는 파인 곳의 금속이 녹는 것을 막는다. pH 조절제와 계면활성제는 입자가 뭉치지 않고 퍼져 있게 한다.' },
          { id: 'mech', label: '화학 + 기계 작용', focus: ['mc'], desc: '연마는 두 단계가 반복되며 일어난다. 먼저 약품이 표면에 무른 막을 만들고, 이어서 패드에 눌린 입자가 튀어나온 부분의 막을 긁어낸다. 파인 곳은 패드가 닿지 않아 막이 그대로 남아 보호된다. 그래서 튀어나온 곳이 먼저 깎이며 표면이 평평해진다.' },
          { id: 'kind', label: '막 종류별 슬러리', focus: ['kd'], desc: '깎을 재료마다 슬러리 조성이 다르다. 산화막은 실리카 입자를 알칼리 수용액에 푼 슬러리를 쓰고, STI처럼 질화막 위에서 멈춰야 하면 세리아 입자 슬러리를 쓴다. 텅스텐과 구리는 산화제가 든 슬러리를 쓰며, 구리는 단계마다(벌크·배리어·마무리) 조성이 다르다.' }
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          let o = cmDefs('cx');
          if (hot(['cp'])) {
            // 방울 확대 + 성분 목록
            o += `<circle cx="116" cy="150" r="96" style="fill:rgba(125,211,252,.18);stroke:currentColor;stroke-opacity:.6;stroke-width:1.4"/>` + pvdTx(116, 36, '슬러리 한 방울 (확대)', { a: 'middle', st: 'font-size:10.5px;font-weight:700;opacity:.85' });
            const pts = [[70, 110, '#a78bfa', 9], [118, 92, '#a78bfa', 8], [150, 130, '#a78bfa', 9], [92, 160, '#a78bfa', 8], [130, 178, '#a78bfa', 9], [70, 190, '#a78bfa', 8], [172, 170, '#a78bfa', 7]];
            o += pts.map(([x, y, c, r]) => `<circle cx="${x}" cy="${y}" r="${r}" style="fill:${c};fill-opacity:.55;stroke:${c};stroke-width:1.2"/>`).join('');
            o += [[100, 126], [152, 104], [60, 148], [110, 206], [160, 198], [84, 224], [136, 140]].map(([x, y]) => `<g><circle cx="${x}" cy="${y}" r="2.6" fill="#f59e0b"/><circle cx="${x + 4}" cy="${y + 2}" r="2" fill="#f59e0b" opacity=".7"/></g>`).join('');
            o += [[80, 134], [142, 152], [122, 214], [168, 130]].map(([x, y]) => `<path d="M${x - 5} ${y} l5 -5 l5 5 l-5 5 Z" fill="#2dd4bf" opacity=".85"/>`).join('');
            o += [[104, 190], [60, 176], [176, 150]].map(([x, y]) => `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" fill="#fb7185" opacity=".85"/>`).join('');
            const rows = [['#a78bfa', 'circle', '연마 입자', '실리카 · 세리아 · 알루미나'], ['#f59e0b', 'dot', '산화제', 'H₂O₂ 등: 금속 표면에 무른 막'], ['#2dd4bf', 'dia', '착화제 · pH 조절제', '막을 녹이기 쉽게, 입자 안정화'], ['#fb7185', 'sq', '부식 억제제', 'BTA 등: 파인 곳의 금속 보호'], ['#38bdf8', 'blank', '용매 (초순수)', '나머지 대부분, 계면활성제 포함']];
            rows.forEach(([c, k, a, b], i) => { const y = 66 + i * 52; o += (k === 'circle' ? `<circle cx="246" cy="${y}" r="8" style="fill:${c};fill-opacity:.55;stroke:${c};stroke-width:1.2"/>` : k === 'dot' ? `<circle cx="246" cy="${y}" r="3.4" fill="${c}"/>` : k === 'dia' ? `<path d="M240 ${y} l6 -6 l6 6 l-6 6 Z" fill="${c}"/>` : k === 'sq' ? `<rect x="241" y="${y - 5}" width="10" height="10" fill="${c}"/>` : `<rect x="238" y="${y - 6}" width="16" height="12" rx="3" style="fill:rgba(125,211,252,.35);stroke:${c}"/>`) + pvdTx(266, y - 3, a, { st: 'font-size:11px;font-weight:800;opacity:1' }) + pvdTx(266, y + 12, b, { st: 'font-size:9.5px;opacity:.78' }); });
            o += pvdL('M236 292 H392', { so: .3 }) + pvdTx(314, 310, '입자 크기는 속도와 스크래치를 좌우한다', { a: 'middle', st: 'font-size:9.5px;opacity:.75' });
          } else if (hot(['mc'])) {
            // 3단 단면: 1 산화막 형성 / 2 입자가 긁어냄 / 3 새 표면
            const panel = (ox, n, t, mode) => {
              let g = pvdTx(ox + 62, 26, n + '  ' + t, { a: 'middle', st: 'font-size:10.5px;font-weight:800;opacity:1' });
              g += pvdR(ox, 78, 124, 24, 'url(#cxPd)', { so: .5 });                  // 패드
              g += pvdTx(ox + 62, 94, '패드 (아래로 누름)', { a: 'middle', st: 'font-size:8.5px;opacity:.75' });
              // 금속 표면(요철)
              const bumpy = `M${ox} 190 V150 L${ox + 20} 150 L${ox + 26} 132 L${ox + 54} 132 L${ox + 60} 150 L${ox + 70} 150 L${ox + 76} 150 L${ox + 82} 132 L${ox + 110} 132 L${ox + 116} 150 L${ox + 124} 150 V190 Z`;
              const flatter = `M${ox} 190 V150 L${ox + 20} 150 L${ox + 26} 142 L${ox + 54} 142 L${ox + 60} 150 L${ox + 70} 150 L${ox + 76} 150 L${ox + 82} 142 L${ox + 110} 142 L${ox + 116} 150 L${ox + 124} 150 V190 Z`;
              g += `<path d="${mode === 3 ? flatter : bumpy}" style="fill:#f59e0b;fill-opacity:.55;stroke:currentColor;stroke-opacity:.6;stroke-width:1.2"/>`;
              if (mode === 1) g += `<path d="M${ox} 150 L${ox + 20} 150 L${ox + 26} 132 L${ox + 54} 132 L${ox + 60} 150 L${ox + 70} 150 L${ox + 76} 150 L${ox + 82} 132 L${ox + 110} 132 L${ox + 116} 150 L${ox + 124} 150" style="fill:none;stroke:#2dd4bf;stroke-width:4;opacity:.8"/>` + pvdTx(ox + 62, 214, '표면에 무른 막이 생긴다', { a: 'middle', st: 'font-size:9.5px;font-weight:700;fill:#0d9488;opacity:1' });
              if (mode === 2) g += `<path d="M${ox + 26} 132 L${ox + 54} 132 M${ox + 82} 132 L${ox + 110} 132" style="fill:none;stroke:#2dd4bf;stroke-width:4;opacity:.35;stroke-dasharray:3 3"/>` + [[ox + 40, 120], [ox + 96, 122], [ox + 68, 124]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" style="fill:#a78bfa;fill-opacity:.6;stroke:#a78bfa"/>`).join('') + `<path d="M${ox + 60} 150 L${ox + 76} 150" style="fill:none;stroke:#fb7185;stroke-width:4;opacity:.85"/>` + pvdTx(ox + 62, 214, '튀어난 곳의 막만 긁힌다', { a: 'middle', st: 'font-size:9.5px;font-weight:700;fill:#7c3aed;opacity:1' });
              if (mode === 3) g += pvdTx(ox + 62, 214, '높이 차가 줄어든다', { a: 'middle', st: 'font-size:9.5px;font-weight:700;opacity:1' });
              g += cmAr(ox + 62, 44, ox + 62, 74, '#34d399', 1.8);
              if (mode === 1) g += [[ox + 14, 118], [ox + 100, 122], [ox + 62, 114]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#f59e0b"/>`).join('');
              return g;
            };
            o += panel(10, '①', '화학: 막 형성', 1) + panel(144, '②', '기계: 입자가 제거', 2) + panel(278, '③', '반복 → 평탄', 3);
            o += cmAr(138, 150, 142, 150, 'currentColor', 1.4) + cmAr(272, 150, 276, 150, 'currentColor', 1.4);
            o += pvdTx(210, 252, '막을 만들고(화학) → 긁어내고(기계) → 다시 만든다. 이 순환이 반복된다.', { a: 'middle', st: 'font-size:10.5px;font-weight:700;opacity:.9' });
            o += pvdTx(210, 270, '파인 곳은 패드가 닿지 않아 막이 남아 있으므로 깎이지 않는다.', { a: 'middle', st: 'font-size:10px;opacity:.75' });
          } else {
            const rows = [
              ['산화막 (ILD)', '실리카 입자 + 알칼리 수용액', '#38bdf8', 'pH 10~11 부근이 흔하다'],
              ['STI (질화막에서 정지)', '세리아 입자 + 첨가제', '#2dd4bf', '산화막만 빠르게, 질화막은 거의 안 깎는다'],
              ['텅스텐 (W 플러그)', '알루미나·실리카 + 산화제(Fe(NO₃)₃, H₂O₂)', '#94a3b8', '산성 영역에서 W 표면에 산화막을 만든다'],
              ['구리 (다마신)', '실리카 + H₂O₂ + 착화제 + BTA', '#f59e0b', '벌크 · 배리어 · 마무리 단계마다 조성이 다르다']
            ];
            rows.forEach(([a, b, c, d], i) => { const y = 30 + i * 74; o += pvdR(14, y, 372, 62, 'rgba(148,163,184,.1)', { rx: 8, so: .5 }) + pvdR(14, y, 8, 62, c, { rx: 3, so: .01 }) + pvdTx(34, y + 20, a, { st: 'font-size:11.5px;font-weight:800;opacity:1' }) + pvdTx(34, y + 38, b, { st: 'font-size:10px;opacity:.9' }) + pvdTx(34, y + 54, d, { st: 'font-size:9.5px;opacity:.7' }); });
          }
          return dgSvg('슬러리: ' + s.label, o, hot(['cp']) ? '0 20 410 310' : hot(['mc']) ? '0 10 410 276' : '0 14 400 316');
        }
      },

      // ---------- 6. 프레스턴 방정식 ----------
      'cmp-preston': {
        title: '제거 속도: 압력 × 상대 속도',
        wide: true,
        states: [
          { id: 'law', label: '프레스턴 법칙', focus: ['lw'], desc: '제거 속도(RR)는 압력(P)과 웨이퍼·패드 사이 상대 속도(V)에 비례한다. 비례 상수 Kp에는 슬러리, 패드, 막 재질이 모두 들어 있다. 그래서 압력이나 회전수를 올리면 빨리 깎이고, 같은 조건에서도 패드나 슬러리가 바뀌면 속도가 달라진다.' },
          { id: 'dev', label: '법칙에서 벗어나는 구간', focus: ['dv'], desc: '실제로는 직선에서 벗어난다. 압력이 너무 낮으면 기계 작용이 모자라 속도가 거의 오르지 않고, 너무 높거나 빠르면 슬러리가 웨이퍼 아래로 못 들어가거나 패드가 변형되어 속도가 포화된다. 공정 조건은 직선에 가까운 구간 안에서 잡는다.' },
          { id: 'vel', label: '상대 속도', focus: ['vl'], desc: '웨이퍼 위 각 점의 상대 속도는 플래튼의 선속도와 헤드의 회전이 합쳐서 결정된다. 플래튼과 헤드의 회전수를 비슷하게 맞추면 웨이퍼 전면에서 상대 속도가 거의 일정해져 균일하게 깎인다. 회전수를 일부러 다르게 두는 레시피도 있다.' }
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          let o = cmDefs('cv');
          if (hot(['vl'])) {
            // 평면도: 플래튼 + 헤드(웨이퍼) + 속도 벡터
            o += `<circle cx="140" cy="140" r="112" style="fill:url(#cvPd);stroke:currentColor;stroke-opacity:.7;stroke-width:1.4"/>` + pvdTx(140, 20, '패드 (플래튼과 함께 회전)', { a: 'middle', st: 'font-size:10px;opacity:.8;font-weight:700' });
            o += `<circle cx="140" cy="140" r="3" fill="currentColor"/>` + pvdTx(130, 156, '플래튼 중심', { a: 'end', st: 'font-size:8.5px;opacity:.75' });
            o += `<circle cx="196" cy="140" r="46" style="fill:url(#cvSi);stroke:currentColor;stroke-opacity:.8;stroke-width:1.3"/><circle cx="196" cy="140" r="3" fill="currentColor"/>` + pvdTx(196, 112, '웨이퍼', { a: 'middle', st: 'font-size:9.5px;font-weight:800' });
            o += `<path d="M118 70 A80 80 0 0 0 80 130" style="fill:none;stroke:#34d399;stroke-width:2"/>` + cmAr(82, 124, 80, 134, '#34d399', 2) + pvdTx(60, 96, '플래튼', { a: 'middle', st: 'font-size:10px;font-weight:700;fill:#059669;opacity:1' });
            o += `<path d="M218 98 A30 30 0 0 1 238 130" style="fill:none;stroke:#a78bfa;stroke-width:2"/>` + cmAr(236, 122, 238, 132, '#a78bfa', 2) + pvdTx(236, 92, '헤드', { a: 'middle', st: 'font-size:10px;font-weight:700;fill:#7c3aed;opacity:1' });
            // 상대 속도: 두 회전수가 같을 때 웨이퍼 어디서나 같은 벡터
            [[168, 160], [196, 160], [224, 160]].forEach(([x, y]) => { o += cmAr(x, y, x, y - 34, '#fb7185', 2.4); });
            o += pvdR(282, 34, 128, 208, 'rgba(148,163,184,.08)', { rx: 8, so: .4 }) + pvdTx(346, 54, '상대 속도 V', { a: 'middle', st: 'font-size:11px;font-weight:800;opacity:1' });
            ['회전수가 비슷하면', '웨이퍼 어느 점에서도', 'V가 거의 같다', '', '→ 반지름 방향 속도', '불균일이 줄어든다'].forEach((t, i) => { o += pvdTx(346, 78 + i * 20, t, { a: 'middle', st: 'font-size:10px;opacity:.9' + (i >= 4 ? ';font-weight:700' : '') }); });
            o += pvdTx(346, 218, '(붉은 화살표: 점별 상대 속도 · 크기·방향 동일)', { a: 'middle', st: 'font-size:8.5px;opacity:.7' });
            return dgSvg('제거 속도: ' + s.label, o, '0 6 420 256');
          }
          // 그래프: RR vs P
          o += pvdL('M50 30 V220 H370', { so: .6, sw: 1.4 }) + pvdTx(50, 22, '제거 속도 RR', { st: 'font-size:10px;font-weight:700;opacity:.85' }) + pvdTx(370, 238, '압력 P', { a: 'end', st: 'font-size:10px;font-weight:700;opacity:.85' }) + pvdTx(50, 238, '0', { a: 'middle', st: 'font-size:9px;opacity:.6' });
          const line = 'M50 220 L340 60';
          if (hot(['lw'])) {
            o += pvdL(line, { c: 'var(--hl-accent)', sw: 3, so: 1 }) + pvdL('M50 220 L340 130', { c: '#a78bfa', sw: 2.2, so: .85, dash: '5 3' }) + pvdTx(340, 56, 'V 높음', { a: 'end', st: 'font-size:10px;font-weight:700;fill:var(--hl-accent);opacity:1' }) + pvdTx(340, 126, 'V 낮음', { a: 'end', st: 'font-size:10px;font-weight:700;fill:#7c3aed;opacity:1' });
            o += pvdR(76, 38, 176, 30, 'rgba(148,163,184,.1)', { rx: 6, so: .4 }) + pvdTx(164, 58, 'RR = Kp · P · V', { a: 'middle', st: 'font-size:14px;font-weight:800;opacity:1' });
            o += pvdTx(200, 256, 'Kp: 슬러리 · 패드 · 막 재질 · 온도에 따른 상수', { a: 'middle', st: 'font-size:9.5px;opacity:.8' });
          } else {
            o += pvdL(line, { c: 'currentColor', sw: 1.4, so: .35, dash: '4 4' }) + pvdL('M50 220 C70 218 90 200 130 170 C200 118 260 84 340 76 C352 74 362 76 368 78', { c: 'var(--hl-accent)', sw: 3, so: 1 });
            o += pvdR(50, 30, 72, 190, 'rgba(251,113,133,.1)', { so: 0.01 }) + pvdR(300, 30, 70, 190, 'rgba(251,113,133,.1)', { so: 0.01 });
            o += pvdTx(84, 52, '문턱', { a: 'middle', st: 'font-size:10px;font-weight:800;fill:#e11d48;opacity:1' }) + pvdTx(86, 66, '(기계 작용 부족)', { a: 'middle', st: 'font-size:8.5px;opacity:.85' }) + pvdTx(335, 100, '포화', { a: 'middle', st: 'font-size:10px;font-weight:800;fill:#e11d48;opacity:1' }) + pvdTx(335, 114, '(슬러리 공급 한계)', { a: 'middle', st: 'font-size:8.5px;opacity:.85' });
            o += pvdTx(236, 196, '직선에 가까운', { a: 'middle', st: 'font-size:10px;font-weight:800;opacity:1' }) + pvdTx(236, 210, '공정 구간', { a: 'middle', st: 'font-size:10px;font-weight:800;opacity:1' });
            o += pvdTx(200, 256, '점선: 프레스턴 법칙의 이상적인 직선', { a: 'middle', st: 'font-size:9.5px;opacity:.8' });
          }
          return dgSvg('제거 속도: ' + s.label, o, '0 6 400 268');
        }
      },
    });

    // ---------- 다마신 단면 (공정 단계별) ----------
    // o: {field: 표면 y, wide: 넓은 선 구리 윗면 y, dense: 촘촘한 배선 구역 표면 y, over: 'full'|'thin'|'none', barField: bool, extra: fn}
    const cmDam = (pre, o) => {
      const TOP = 110, DEP = 50, BASE = 200, W = [60, 80], D = [[206, 14], [236, 14], [266, 14]];
      const fT = o.field == null ? TOP : o.field, dT = o.dense == null ? fT : o.dense;
      // 유전체 윤곽
      let d = `M30 ${BASE} V${fT} H${W[0]} V${TOP + DEP} H${W[0] + W[1]} V${fT} H196 V${dT}`;
      D.forEach(([x, w]) => { d += ` H${x} V${TOP + DEP} H${x + w} V${dT}`; });
      d += ` H294 V${fT} H370 V${BASE} Z`;
      let g = `<path d="${d}" style="fill:url(#${pre}Ox);stroke:currentColor;stroke-opacity:.55;stroke-width:1.2"/>`;
      // 구리(트렌치 안)
      const wT = o.wide == null ? fT : o.wide;
      g += `<rect x="${W[0]}" y="${wT}" width="${W[1]}" height="${TOP + DEP - wT}" fill="#f59e0b" fill-opacity=".85"/>`;
      D.forEach(([x, w]) => { g += `<rect x="${x}" y="${dT}" width="${w}" height="${TOP + DEP - dT}" fill="#f59e0b" fill-opacity=".85"/>`; });
      // 과잉 구리(overburden)
      if (o.over === 'full') g += `<path d="M30 ${TOP} V84 H56 L66 94 H134 L144 84 H198 L206 74 H284 L294 84 H370 V${TOP} Z" fill="#f59e0b" fill-opacity=".85"/>`;
      if (o.over === 'thin') g += `<path d="M30 ${TOP} V106 H56 L62 108 H138 L144 106 H370 V${TOP} Z" fill="#f59e0b" fill-opacity=".85"/>`;
      // 배리어
      let b = '';
      const tr = [W].concat(D);
      tr.forEach(([x, w]) => { const t = (x === W[0] ? Math.max(fT, wT > fT ? fT : fT) : dT); b += `M${x} ${t} V${TOP + DEP} H${x + w} V${t} `; });
      g += `<path d="${b}" style="fill:none;stroke:#475569;stroke-width:3;stroke-linejoin:round"/>`;
      if (o.barField !== false) g += `<path d="M30 ${fT} H${W[0]} M${W[0] + W[1]} ${fT} H196 M196 ${dT} H${D[0][0]} M${D[0][0] + D[0][1]} ${dT} H${D[1][0]} M${D[1][0] + D[1][1]} ${dT} H${D[2][0]} M${D[2][0] + D[2][1]} ${dT} H294 M294 ${fT} H370" style="fill:none;stroke:#475569;stroke-width:3"/>`;
      return g;
    };
    const cmDamLegend = (y) => [['#f59e0b', '구리(Cu)'], ['#475569', '배리어(Ta/TaN)'], ['#7dd3fc', '산화막(절연)']].map(([c, t], i) => `<rect x="${60 + i * 120}" y="${y - 8}" width="12" height="10" fill="${c}" fill-opacity=".85"/>` + pvdTx(76 + i * 120, y + 1, t, { st: 'font-size:9.5px;opacity:.85' })).join('');

    Object.assign(DIAGRAMS, {
      // ---------- 7. 구리 다마신 3단계 연마 ----------
      'cmp-steps': {
        title: '구리 다마신 CMP: 3단계 연마',
        wide: true,
        states: [
          { id: 's0', label: '연마 전', desc: '트렌치에 구리를 도금으로 채우면 웨이퍼 전체에 두꺼운 구리(과잉층)가 덮인다. 넓은 선 위는 움푹 들어가고 촘촘한 선 위는 솟아올라, 표면에 높낮이가 이미 있다. 이 구리를 선 안쪽만 남기고 모두 걷어내는 것이 CMP의 일이다.' },
          { id: 's1', label: '1단계: 구리 벌크 제거', desc: '첫 번째 플래튼에서는 구리를 빠르게 깎는 슬러리로 두꺼운 구리를 거의 다 걷어낸다. 구리 아래의 배리어를 깎지 않도록 배리어가 드러나기 직전의 얇은 구리가 남은 상태에서 멈추거나, 배리어 위에서 속도가 급격히 떨어지는 슬러리를 쓴다.' },
          { id: 's2', label: '2단계: 배리어 제거', desc: '두 번째 플래튼에서는 배리어(Ta/TaN)를 걷어내 산화막이 드러나게 한다. 구리와 배리어, 산화막을 거의 같은 속도로 깎는 슬러리를 쓰며, 이 단계에서 넓은 선의 디싱과 촘촘한 구역의 침식이 생기기 쉽다.' },
          { id: 's3', label: '3단계: 마무리 연마', desc: '세 번째 플래튼에서 낮은 압력으로 짧게 다듬어 높낮이와 잔여물을 줄인다. 이 뒤에 세정부에서 슬러리 입자와 구리 오염을 씻어내고 나면, 선 안에만 구리가 남은 평평한 표면이 완성된다.' }
        ],
        svg(s) {
          let o = cmDefs('cu');
          const id = s.id;
          let g, note, tag;
          if (id === 's0') { g = cmDam('cu', { over: 'full' }); note = '과잉 구리: 넓은 선 위는 오목, 촘촘한 선 위는 볼록'; tag = '도금 직후'; }
          else if (id === 's1') { g = cmDam('cu', { over: 'thin', wide: 110 }); note = '배리어 위 얇은 구리만 남기고 정지 (벌크 제거)'; tag = 'P1'; }
          else if (id === 's2') { g = cmDam('cu', { barField: false, wide: 114, dense: 111, field: 110 }); note = '배리어 제거: 산화막 노출, 디싱·침식이 생기기 쉬운 단계'; tag = 'P2'; }
          else { g = cmDam('cu', { barField: false, wide: 112, dense: 110.5 }); note = '다듬기와 세정 후: 선 안에만 구리가 남는다'; tag = 'P3 + 세정'; }
          o += pvdTx(30, 30, tag, { st: 'font-size:12px;font-weight:800;fill:var(--hl-accent);opacity:1' }) + pvdTx(30, 50, note, { st: 'font-size:10.5px;font-weight:700;opacity:.95' });
          o += g + pvdL('M24 110 H376', { c: 'currentColor', sw: 1, so: .5, dash: '4 3' }) + pvdTx(376, 104, '목표 높이', { a: 'end', st: 'font-size:9px;opacity:.65' });
          o += pvdTx(100, 190, '넓은 선', { a: 'middle', st: 'font-size:9.5px;font-weight:700;opacity:.8' }) + pvdTx(245, 190, '촘촘한 선', { a: 'middle', st: 'font-size:9.5px;font-weight:700;opacity:.8' });
          if (id === 's0') o += pvdTx(100, 76, '오목', { a: 'middle', st: 'font-size:9.5px;opacity:.75' }) + pvdTx(245, 64, '볼록', { a: 'middle', st: 'font-size:9.5px;opacity:.75' }) + cmAr(330, 62, 330, 80, '#fb7185', 1.4) + pvdTx(330, 58, '벗겨낼 구리', { a: 'middle', st: 'font-size:9px;opacity:.8' });
          if (id === 's1') o += cmAr(330, 84, 330, 104, '#34d399', 1.8) + pvdTx(330, 76, '여기서 정지', { a: 'middle', st: 'font-size:9.5px;font-weight:700;fill:#059669;opacity:1' });
          return dgSvg('구리 다마신 CMP: ' + s.label, o + cmDamLegend(222), '0 10 400 236');
        }
      },

      // ---------- 8. 불량: 디싱·침식·스크래치 ----------
      'cmp-defects': {
        title: 'CMP 평탄도 불량: 디싱, 침식, 표면 결함',
        wide: true,
        states: [
          { id: 'dish', label: '디싱 (dishing)', focus: ['d'], desc: '넓은 구리 선의 가운데가 접시처럼 움푹 파이는 현상이다. 구리가 산화막보다 무르고 패드가 넓은 선 속으로 눌려 들어가 구리가 더 많이 깎인다. 선 단면적이 줄어 저항이 올라간다. 선폭이 넓을수록, 과연마 시간이 길수록 심해진다.' },
          { id: 'eros', label: '침식 (erosion)', focus: ['e'], desc: '촘촘한 배선 구역 전체가 바깥 영역보다 낮아지는 현상이다. 이 구역에서는 구리 비율이 높아 실제 패드가 닿는 산화막 면적이 작고, 그만큼 압력이 몰려 구리와 산화막이 함께 더 깎인다. 위쪽에 쌓는 층의 평탄도가 무너지는 원인이 된다.' },
          { id: 'etc', label: '스크래치 · 잔류물 · 부식', focus: ['x'], desc: '굳은 슬러리 덩어리나 패드 부스러기가 웨이퍼를 긁으면 홈(스크래치)이 남는다. 세정이 부족하면 입자가 표면에 붙어 남고(잔류물), 슬러리의 산화제와 연마 후 방치된 구리가 만나면 작은 구멍 모양 부식이 생긴다. 모두 소자 단락이나 단선으로 이어질 수 있다.' }
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          let o = cmDefs('cd');
          if (hot(['d'])) {
            o += cmDam('cd', { barField: false, wide: 126 });
            o += pvdL('M60 110 H140', { c: '#fb7185', sw: 1.2, so: .9, dash: '3 3' }) + cmAr(100, 112, 100, 126, '#fb7185', 1.8) + pvdTx(150, 124, '디싱 깊이', { st: 'font-size:10px;font-weight:800;fill:#e11d48;opacity:1' }) + pvdTx(100, 76, '넓은 선일수록 깊어진다', { a: 'middle', st: 'font-size:10px;font-weight:700;opacity:.9' });
          } else if (hot(['e'])) {
            o += cmDam('cd', { barField: false, dense: 120, field: 110 });
            o += pvdL('M30 110 H196', { c: '#fb7185', sw: 1.2, so: .9, dash: '3 3' }) + cmAr(245, 112, 245, 128, '#fb7185', 1.8) + pvdTx(300, 128, '침식 깊이', { st: 'font-size:10px;font-weight:800;fill:#e11d48;opacity:1' }) + pvdTx(245, 76, '구리 비율이 높은 구역이 전체적으로 낮아진다', { a: 'middle', st: 'font-size:10px;font-weight:700;opacity:.9' });
          } else {
            o += cmDam('cd', { barField: false, wide: 112 });
            // 스크래치: 넓은 선 윗면과 필드
            o += `<path d="M70 112 L82 120 L96 112" style="fill:none;stroke:#e11d48;stroke-width:2"/>` + pvdTx(82, 96, '스크래치', { a: 'middle', st: 'font-size:10px;font-weight:800;fill:#e11d48;opacity:1' });
            o += [[168, 106], [180, 108], [330, 107], [344, 105]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" style="fill:#a78bfa;fill-opacity:.7;stroke:#7c3aed"/>`).join('') + pvdTx(256, 90, '잔류 입자', { a: 'middle', st: 'font-size:10px;font-weight:800;fill:#7c3aed;opacity:1' }) + pvdL('M200 94 L178 104', { so: .5 }) + pvdL('M310 94 L330 104', { so: .5 });
            o += [[100, 116], [118, 114]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3" ry="3.5" fill="#0f172a" fill-opacity=".6"/>`).join('') + pvdTx(124, 140, '부식 구멍', { a: 'middle', st: 'font-size:10px;font-weight:800;fill:#b45309;opacity:1' }) + pvdL('M118 128 L112 118', { so: .5 });
          }
          o += pvdTx(100, 190, '넓은 선', { a: 'middle', st: 'font-size:9.5px;font-weight:700;opacity:.8' }) + pvdTx(245, 190, '촘촘한 선', { a: 'middle', st: 'font-size:9.5px;font-weight:700;opacity:.8' });
          return dgSvg('CMP 불량: ' + s.label, o + cmDamLegend(222), '0 56 400 190');
        }
      },
    });

    Object.assign(DIAGRAMS, {
      // ---------- 9. 종점 감지 ----------
      'cmp-endpoint': {
        title: '종점 감지: 언제 연마를 멈추는가',
        wide: true,
        states: [
          { id: 'all', label: '두 가지 신호', desc: '시간으로만 멈추면 패드가 닳을수록 속도가 달라져 과연마나 미연마가 생긴다. 그래서 연마 중에 신호를 읽어 막이 바뀌는 순간을 찾는다. 대표적인 신호는 모터 전류(마찰의 변화)와 광학 반사율(표면 빛깔의 변화)이다.' },
          { id: 'cur', label: '모터 전류', focus: ['c'], desc: '플래튼과 헤드를 돌리는 모터는 마찰이 클수록 전류를 많이 쓴다. 구리가 걷히고 배리어나 산화막이 드러나면 마찰 계수가 달라져 전류가 계단처럼 바뀐다. 센서를 따로 달 필요가 없어 간단하지만, 표면 상태가 비슷한 막 사이에서는 변화가 작다.' },
          { id: 'opt', label: '광학 반사율', focus: ['o'], desc: '플래튼의 창으로 빛을 쏘아 웨이퍼 표면의 반사광을 읽는다. 구리는 반사율이 높고 산화막이나 배리어는 낮아서, 구리가 걷히는 순간 신호가 크게 떨어진다. 산화막처럼 투명한 막은 두께에 따라 신호가 출렁이는 간섭 무늬로 남은 두께를 읽을 수 있다.' }
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          let o = cmDefs('ce');
          const panel = (y0, title, color, curve, lab, on) => {
            let g = pvdTx(46, y0 - 6, title, { st: `font-size:11px;font-weight:800;fill:${color};opacity:1` });
            g += pvdL(`M46 ${y0} V${y0 + 100} H376`, { so: .55, sw: 1.3 }) + pvdTx(376, y0 + 114, '연마 시간', { a: 'end', st: 'font-size:9px;opacity:.7' });
            g += pvdL(curve, { c: color, sw: on ? 3 : 2, so: on ? 1 : .8 });
            g += pvdL(`M222 ${y0} V${y0 + 100}`, { c: '#fb7185', sw: 1.2, so: .9, dash: '4 3' }) + pvdTx(224, y0 + 10, '종점', { st: 'font-size:10px;font-weight:800;fill:#e11d48;opacity:1' });
            g += pvdL(`M222 ${y0 + 20} H290`, { c: '#fb7185', sw: 1.2, so: .8 }) + pvdR(222, y0 + 20, 68, 80, 'rgba(251,113,133,.08)', { so: 0.01 }) + pvdTx(256, y0 + 34, '과연마', { a: 'middle', st: 'font-size:9px;opacity:.85' }) + pvdTx(256, y0 + 46, '(여유 시간)', { a: 'middle', st: 'font-size:8.5px;opacity:.7' });
            lab.forEach(([x, y, t]) => { g += pvdTx(x, y, t, { a: 'middle', st: 'font-size:9.5px;font-weight:700;opacity:.9' }); });
            return g;
          };
          const showC = !f || hot(['c']), showO = !f || hot(['o']);
          let y0c = 36, y0o = f ? 36 : 176;
          if (showC) o += panel(y0c, '모터 전류', '#38bdf8', `M46 ${y0c + 30} L110 ${y0c + 28} L200 ${y0c + 30} C216 ${y0c + 32} 224 ${y0c + 62} 240 ${y0c + 64} L376 ${y0c + 64}`, [[130, y0c + 20, '구리 연마 (마찰 큼)'], [320, y0c + 84, '배리어 · 산화막 (마찰 변화)']], hot(['c']));
          if (showO) o += panel(y0o, '광학 반사율', '#a78bfa', `M46 ${y0o + 26} L110 ${y0o + 24} L190 ${y0o + 28} C206 ${y0o + 30} 222 ${y0o + 74} 244 ${y0o + 78} L376 ${y0o + 78}`, [[120, y0o + 14, '구리 (반사 높음)'], [320, y0o + 94, '구리 사라짐 (반사 낮음)']], hot(['o']));
          return dgSvg('종점 감지: ' + s.label, o, f ? '0 10 400 170' : '0 10 400 316');
        }
      },

      // ---------- 10. 연마 후 세정 ----------
      'cmp-clean': {
        title: '연마 후 세정: 입자를 떼어 내는 세 단계',
        wide: true,
        states: [
          { id: 'all', label: '세정 라인', desc: '연마가 끝난 웨이퍼는 슬러리 입자와 구리 부스러기로 덮여 있다. 이를 메가소닉으로 큰 힘 없이 흔들어 떼고, 브러시로 문질러 닦고, 스핀 건조로 물기 자국 없이 말린다. 세 단계를 연속으로 지나며, 웨이퍼는 끝까지 젖은 상태로 대기를 만나지 않는다.' },
          { id: 'mega', label: '메가소닉', focus: ['m'], desc: '초음파(약 1 MHz 안팎)로 약액을 진동시켜 표면에 붙은 미세 입자를 떼어 낸다. 접촉하지 않으므로 표면에 흠집을 내지 않는다. 떨어진 입자가 다시 달라붙지 않도록 약액으로 표면 전하를 조절한다.' },
          { id: 'brush', label: 'PVA 브러시', focus: ['b'], desc: '스펀지 같은 PVA 롤러 브러시가 웨이퍼 양면을 굴러 가며 약액과 함께 입자를 문질러 닦는다. 브러시는 쓸수록 오염되고 닳으므로 교체 주기를 지켜야 하며, 눌림이 지나치면 스크래치, 약하면 입자가 남는다.' },
          { id: 'srd', label: '스핀 건조', focus: ['s'], desc: '웨이퍼를 고속으로 돌리며 초순수로 헹군 뒤, IPA 증기로 물을 밀어 내며 말린다(마랑고니 건조). 물방울이 마르며 남기는 얼룩(워터마크)을 막아 표면 결함을 줄인다.' }
        ],
        svg(s) {
          const f = s.focus || null, hot = (g) => f && pvdOn(f, g);
          let o = cmDefs('cc');
          const ttl = (x, t, g) => pvdTx(x, 24, t, { a: 'middle', st: 'font-size:11px;font-weight:800;opacity:' + (!f || pvdOn(f, g) ? 1 : .3) });
          // 1: 메가소닉
          o += pvdG(f, ['m'], ttl(78, '① 메가소닉', ['m']) + pvdR(14, 150, 128, 14, 'url(#ccSi)') + pvdR(14, 164, 128, 40, 'rgba(56,189,248,.16)', { so: .4, rx: 4 }) + pvdR(54, 40, 48, 22, 'url(#ccMt)', { rx: 3 }) + pvdTx(78, 55, '트랜스듀서', { a: 'middle', st: 'font-size:8.5px;font-weight:700' }) + pvdR(72, 62, 12, 38, 'rgba(56,189,248,.4)', { so: .4 }) + [0, 1, 2].map(i => `<path d="M${52 + i * 12} 118 q12 14 24 0" style="fill:none;stroke:#38bdf8;stroke-width:1.4;opacity:.7"/>`).join('') + [[40, 146], [100, 146], [60, 140], [118, 144]].map(([x, y]) => cmDot(x, y, 2.4, '#a78bfa')).join('') + [[30, 130], [126, 126]].map(([x, y]) => cmAr(x, y + 16, x + (x < 78 ? -10 : 10), y - 2, '#a78bfa', 1.2)).join('') + pvdTx(78, 224, '진동 → 입자 이탈', { a: 'middle', st: 'font-size:9.5px;opacity:.85' }));
          // 2: 브러시
          o += pvdG(f, ['b'], ttl(230, '② PVA 브러시', ['b']) + pvdR(172, 130, 116, 8, 'url(#ccSi)') + `<ellipse cx="230" cy="104" rx="34" ry="22" style="fill:#fde68a;fill-opacity:.7;stroke:currentColor;stroke-opacity:.6"/><ellipse cx="230" cy="166" rx="34" ry="22" style="fill:#fde68a;fill-opacity:.7;stroke:currentColor;stroke-opacity:.6"/>` + [-26, -14, 0, 14, 26].map(x => `<circle cx="${230 + x}" cy="${x === 0 ? 124 : 122 + Math.abs(x) / 8}" r="3.2" fill="#fbbf24" stroke="currentColor" stroke-opacity=".5" stroke-width=".6"/>`).join('') + [-26, -14, 0, 14, 26].map(x => `<circle cx="${230 + x}" cy="${x === 0 ? 144 : 146 - Math.abs(x) / 8}" r="3.2" fill="#fbbf24" stroke="currentColor" stroke-opacity=".5" stroke-width=".6"/>`).join('') + cmAr(196, 82, 214, 86, '#34d399', 1.4) + cmAr(196, 188, 214, 184, '#34d399', 1.4) + pvdTx(230, 100, 'PVA', { a: 'middle', st: 'font-size:9px;font-weight:700' }) + pvdTx(230, 172, 'PVA', { a: 'middle', st: 'font-size:9px;font-weight:700' }) + pvdTx(230, 224, '양면을 문질러 닦기', { a: 'middle', st: 'font-size:9.5px;opacity:.85' }) + `<path d="M230 40 V76" style="fill:none;stroke:#38bdf8;stroke-width:2.4;opacity:.8"/><circle cx="230" cy="40" r="3" fill="#38bdf8"/>` + pvdTx(240, 48, '약액', { st: 'font-size:9px;fill:#0284c7;font-weight:700;opacity:1' }));
          // 3: 스핀 건조
          o += pvdG(f, ['s'], ttl(382, '③ 스핀 건조', ['s']) + pvdR(330, 138, 104, 8, 'url(#ccSi)') + pvdR(374, 146, 16, 40, 'url(#ccMt)') + pvdR(350, 186, 64, 8, 'url(#ccMt)', { rx: 3 }) + `<path d="M334 128 q8 -12 16 0 M410 128 q8 -12 16 0" style="fill:none;stroke:#34d399;stroke-width:1.8"/>` + pvdR(344, 62, 40, 10, 'rgba(56,189,248,.35)', { so: .6, rx: 3 }) + pvdTx(364, 59, 'DIW', { a: 'middle', st: 'font-size:9px;font-weight:700;fill:#0284c7;opacity:1' }) + cmAr(364, 74, 364, 134, '#38bdf8', 1.8) + pvdR(394, 62, 40, 10, 'rgba(45,212,191,.35)', { so: .6, rx: 3 }) + pvdTx(414, 59, 'IPA', { a: 'middle', st: 'font-size:9px;font-weight:700;fill:#0d9488;opacity:1' }) + cmAr(414, 74, 414, 134, '#2dd4bf', 1.8) + cmAr(396, 90, 426, 90, 'currentColor', 1.2, '3 2') + pvdTx(382, 224, '회전하며 물을 밀어 낸다', { a: 'middle', st: 'font-size:9.5px;opacity:.85' }));
          return dgSvg('세정: ' + s.label, o, '0 8 460 236');
        }
      },

      // ---------- 11. 사용처 ----------
      'cmp-where': {
        title: 'CMP가 쓰이는 공정 4곳',
        wide: true,
        states: [
          { id: 'all', label: '전체', desc: 'CMP는 막을 평평하게 만들거나, 홈 안에만 재료를 남기는 두 가지 역할로 쓰인다. 소자 격리(STI), 층간 절연막(ILD), 텅스텐 플러그, 구리 배선이 대표적인 네 곳이다.' },
          { id: 'sti', label: 'STI', focus: ['a'], desc: '실리콘에 판 홈을 산화막으로 채워 소자를 서로 분리하는 공정이다. 질화막이 연마 정지막 역할을 하고, 질화막이 드러나면 멈추도록 산화막을 질화막보다 훨씬 빨리 깎는 세리아 슬러리를 쓴다.' },
          { id: 'ild', label: 'ILD', focus: ['b'], desc: '트랜지스터 위에 두껍게 쌓은 층간 절연막은 아래 구조의 높낮이를 그대로 따라 울퉁불퉁하다. 이를 CMP로 평평하게 깎아야 다음 노광에서 초점이 맞는다. 정지막 없이 목표 두께를 시간이나 두께 측정으로 맞춘다.' },
          { id: 'w', label: 'W 플러그', focus: ['c'], desc: '절연막에 뚫은 작은 구멍(콘택, 비아)에 텅스텐을 채우고, 구멍 밖의 텅스텐을 CMP로 걷어 낸다. 산화막이 정지막 역할을 하며, 텅스텐과 산화막의 제거 속도 차이(선택비)가 클수록 잘 멈춘다.' },
          { id: 'cu', label: '구리 다마신', focus: ['d'], desc: '절연막에 판 홈을 구리로 채우고 홈 밖의 구리를 CMP로 걷어 배선을 만든다. 구리는 식각하기 어려워 이 방식(다마신)을 쓰며, 3단계 연마와 배리어 제거가 필요하다.' }
        ],
        svg(s) {
          const f = s.focus || null;
          let o = cmDefs('cw');
          const card = (ox, oy, key, title, body) => {
            const on = !f || pvdOn(f, [key]);
            return `<g opacity="${on ? 1 : .22}">` + pvdR(ox, oy, 196, 160, 'rgba(148,163,184,.08)', { rx: 8, so: .45 }) + pvdTx(ox + 12, oy + 20, title, { st: 'font-size:11.5px;font-weight:800;opacity:1' }) + body(ox, oy) + '</g>';
          };
          // STI
          o += card(10, 14, 'a', '① STI (소자 격리)', (x, y) => pvdR(x + 12, y + 110, 172, 30, '#94a3b8', { so: .5 }) + [0, 1, 2].map(i => pvdR(x + 12 + i * 62, y + 84, 36, 26, '#94a3b8', { so: .5 }) + pvdR(x + 12 + i * 62, y + 76, 36, 8, '#14b8a6', { so: .5 })).join('') + [[x + 48, 26], [x + 110, 26]].map(([a]) => pvdR(a, y + 60, 26, 50, 'url(#cwOx)', { so: .01 })).join('') + pvdR(x + 12, y + 52, 172, 8, 'url(#cwOx)', { so: .01 }) + pvdL(`M${x + 8} ${y + 76} H${x + 190}`, { c: '#fb7185', sw: 1.4, so: .9, dash: '4 3' }) + pvdTx(x + 100, y + 44, '여기까지 갈아낸다', { a: 'middle', st: 'font-size:9px;font-weight:700;fill:#e11d48;opacity:1' }) + pvdTx(x + 100, y + 152, '질화막(청록)이 정지막', { a: 'middle', st: 'font-size:9px;opacity:.8' }));
          // ILD
          o += card(214, 14, 'b', '② ILD (층간 절연막)', (x, y) => pvdR(x + 12, y + 108, 172, 28, '#94a3b8', { so: .5 }) + [[30, 22], [90, 22], [140, 22]].map(([a, w]) => pvdR(x + a, y + 92, w, 16, '#f97316', { so: .5 })).join('') + `<path d="M${x + 12} 0" style="fill:none"/>` + `<path d="M${x + 12} ${y + 108} V${y + 76} H${x + 26} L${x + 32} ${y + 66} H${x + 56} L${x + 62} ${y + 76} H${x + 86} L${x + 92} ${y + 66} H${x + 116} L${x + 122} ${y + 76} H${x + 136} L${x + 142} ${y + 66} H${x + 166} L${x + 172} ${y + 76} H${x + 184} V${y + 108} Z" style="fill:url(#cwOx);stroke:currentColor;stroke-opacity:.5"/>` + pvdL(`M${x + 8} ${y + 82} H${x + 190}`, { c: '#fb7185', sw: 1.4, so: .9, dash: '4 3' }) + pvdTx(x + 100, y + 56, '높낮이를 평평하게', { a: 'middle', st: 'font-size:9px;font-weight:700;fill:#e11d48;opacity:1' }) + pvdTx(x + 100, y + 152, '게이트(주황) 위 절연막', { a: 'middle', st: 'font-size:9px;opacity:.8' }));
          // W
          o += card(10, 184, 'c', '③ 텅스텐 플러그', (x, y) => pvdR(x + 12, y + 118, 172, 12, '#94a3b8', { so: .5 }) + pvdR(x + 12, y + 70, 172, 48, 'url(#cwOx)', { so: .5 }) + [[44, 18], [104, 18], [156, 18]].map(([a, w]) => pvdR(x + a, y + 70, w, 48, '#475569', { so: .01 })).join('') + pvdR(x + 12, y + 58, 172, 12, '#64748b', { so: .01 }) + pvdL(`M${x + 8} ${y + 70} H${x + 190}`, { c: '#fb7185', sw: 1.4, so: .9, dash: '4 3' }) + pvdTx(x + 100, y + 50, '구멍 밖 텅스텐을 걷어낸다', { a: 'middle', st: 'font-size:9px;font-weight:700;fill:#e11d48;opacity:1' }) + pvdTx(x + 100, y + 152, '산화막이 정지막', { a: 'middle', st: 'font-size:9px;opacity:.8' }));
          // Cu
          o += card(214, 184, 'd', '④ 구리 다마신', (x, y) => pvdR(x + 12, y + 118, 172, 12, '#94a3b8', { so: .5 }) + pvdR(x + 12, y + 70, 172, 48, 'url(#cwOx)', { so: .5 }) + [[28, 56], [118, 14], [146, 14], [174, 10]].map(([a, w]) => pvdR(x + a, y + 70, w, 40, '#f59e0b', { so: .01 }) + pvdL(`M${x + a} ${y + 70} V${y + 110} H${x + a + w} V${y + 70}`, { c: '#475569', sw: 2, so: 1 })).join('') + pvdR(x + 12, y + 58, 172, 12, '#f59e0b', { so: .01 }) + pvdL(`M${x + 8} ${y + 70} H${x + 190}`, { c: '#fb7185', sw: 1.4, so: .9, dash: '4 3' }) + pvdTx(x + 100, y + 50, '홈 밖 구리를 걷어낸다', { a: 'middle', st: 'font-size:9px;font-weight:700;fill:#e11d48;opacity:1' }) + pvdTx(x + 100, y + 152, '3단계 연마 + 배리어 제거', { a: 'middle', st: 'font-size:9px;opacity:.8' }));
          return dgSvg('CMP 사용처: ' + s.label, o, '0 6 420 350');
        }
      },
    });

    // ===== 이온 주입 장비 가이드용 그림 (pvd* 도우미를 같이 쓴다) =====
    const ioDefs = (p) => pvdDefs(p) + `<defs>
      <linearGradient id="${p}Ox" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dd3fc" stop-opacity=".62"/><stop offset="1" stop-color="#38bdf8" stop-opacity=".5"/></linearGradient>
      <linearGradient id="${p}Bm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbbf24" stop-opacity=".25"/><stop offset=".5" stop-color="#f59e0b" stop-opacity=".7"/><stop offset="1" stop-color="#fbbf24" stop-opacity=".25"/></linearGradient>
      <radialGradient id="${p}Pl" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f0abfc" stop-opacity=".85"/><stop offset=".6" stop-color="#c084fc" stop-opacity=".45"/><stop offset="1" stop-color="#a78bfa" stop-opacity="0"/></radialGradient>
    </defs>`;
    const ioAr = (x1, y1, x2, y2, c, w = 1.6, dash) => { const a = Math.atan2(y2 - y1, x2 - x1), h = 5.5, p = (t) => `${(x2 - h * Math.cos(a + t)).toFixed(1)},${(y2 - h * Math.sin(a + t)).toFixed(1)}`; return `<path d="M${x1} ${y1} L${x2} ${y2}" style="fill:none;stroke:${c};stroke-width:${w};stroke-linecap:round${dash ? ';stroke-dasharray:' + dash : ''}"/><path d="M${x2} ${y2} L${p(.45)} L${p(-.45)} Z" fill="${c}"/>`; };
    const ioDot = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
    const ioTxt = (x, y, t, st = '', a = 'start') => pvdTx(x, y, t, { a, st: 'font-size:10px;' + st });
    const ioBold = (x, y, t, a = 'middle', c) => pvdTx(x, y, t, { a, st: 'font-size:10.5px;font-weight:800;opacity:1' + (c ? ';fill:' + c : '') });

    Object.assign(DIAGRAMS, {
      // ---------- 1. 빔라인 전체 구성 ----------
      'ion-overview': {
        title: '이온 주입기의 전체 구성 (옆에서 본 빔라인)',
        wide: true,
        states: [
          { id: 'all', label: '전체 빔라인', desc: '이온 주입기는 이온이 한 줄로 지나가는 긴 진공 통로다. 왼쪽 이온 소스에서 이온을 만들고, 분석 자석이 원하는 이온만 가려내고, 가속관이 에너지를 주고, 스캐너가 빔을 넓게 펼쳐, 오른쪽 엔드 스테이션의 웨이퍼에 박는다. 전체가 고진공 상태이고, 이온이 지나가는 길의 모든 부품은 이 한 줄 위에 늘어서 있다.' },
          { id: 'src', label: '이온 소스 · 추출', focus: ['src', 'ext'], desc: '소스의 아크 챔버에서 원료 가스(BF₃, PH₃, AsH₃ 등)를 플라즈마로 만들고, 추출 전극이 그 속의 이온을 전기장으로 끌어내 빔으로 만든다. 이 단계에서 이온은 이미 수 keV~수십 keV의 에너지를 얻는다.' },
          { id: 'mass', label: '분석 자석 · 슬릿', focus: ['mag', 'slt'], desc: '소스에서 나온 빔에는 원하는 이온 말고도 가스의 다른 조각이 섞여 있다. 분석 자석은 이온을 질량에 따라 다른 반지름으로 휘게 하고, 그 뒤의 슬릿은 원하는 질량의 이온만 통과시킨다. 이 단계가 불순물 종류를 정한다.' },
          { id: 'acc', label: '가속(감속)관', focus: ['acc'], desc: '가속관의 전극 사이에 걸린 높은 전압이 이온을 더 가속하거나(고에너지) 오히려 감속시켜(저에너지) 목표 에너지를 맞춘다. 이온의 최종 에너지가 박히는 깊이를 정한다.' },
          { id: 'scan', label: '스캐너 · 평행화', focus: ['scn'], desc: '빔은 가는 줄기라서 웨이퍼 전체를 덮으려면 펼치거나 훑어야 한다. 전기장 스캐너와 평행화 렌즈가 빔을 넓은 띠 모양의 평행한 빔으로 만들어, 웨이퍼 어디에나 같은 각도로 닿게 한다.' },
          { id: 'end', label: '엔드 스테이션', focus: ['end'], desc: '웨이퍼를 잡고 기울이고 이동시키는 곳이다. 패러데이 컵으로 빔 전류를 재어 도즈를 세고, 목표 도즈에 닿으면 멈춘다. 웨이퍼에 쌓이는 전하를 없애는 전자 공급기도 여기에 있다.' },
          { id: 'vac', label: '진공 시스템', focus: ['vac'], desc: '빔이 지나가는 길은 대기압의 10억 분의 1 안팎의 고진공이다. 이온이 공기 분자와 부딪히면 에너지와 방향이 바뀌기 때문이다. 진공이 나빠지면 도즈 오차와 오염이 생긴다.' }
        ],
        svg(s) {
          const f = s.focus || null, on = (g) => !f || pvdOn(f, g);
          let o = ioDefs('io');
          const beamY = 104;
          // 진공 배관(빔라인 외피)
          o += pvdR(8, beamY - 22, 504, 44, 'rgba(148,163,184,.1)', { rx: 8, so: .4 });
          // 빔: 구간별로 굵기를 달리한다
          const beamSegs = [['M70 ' + beamY + ' H112', 5], ['M112 ' + beamY + ' H228', 8], ['M228 ' + beamY + ' H262', 3], ['M262 ' + beamY + ' H322', 4], ['M322 ' + beamY + ' H408', 6]];
          // 이온 소스
          o += pvdG(f, ['src'], pvdR(22, beamY - 28, 52, 56, 'url(#ioMt)', { rx: 6 }) + `<ellipse cx="48" cy="${beamY}" rx="14" ry="13" fill="url(#ioPl)"/>` + pvdR(40, beamY - 40, 8, 12, 'url(#ioMt)') + pvdL(`M44 ${beamY - 46} V${beamY - 28}`, { c: '#34d399', sw: 3, so: .9 }) + ioTxt(44, beamY - 50, '가스', 'font-weight:700;fill:#059669;opacity:1', 'middle'));
          // 추출 전극
          o += pvdG(f, ['ext'], [78, 90].map(x => pvdR(x, beamY - 24, 5, 18, 'url(#ioMt)') + pvdR(x, beamY + 6, 5, 18, 'url(#ioMt)')).join(''));
          // 분석 자석 (위·아래 극판)
          o += pvdG(f, ['mag'], `<path d="M118 ${beamY - 56} H206 L196 ${beamY - 20} H128 Z" fill="#fb7185" fill-opacity=".45" stroke="currentColor" stroke-opacity=".6"/><path d="M118 ${beamY + 56} H206 L196 ${beamY + 20} H128 Z" fill="#60a5fa" fill-opacity=".5" stroke="currentColor" stroke-opacity=".6"/>` + ioBold(162, beamY - 40, 'N', 'middle', '#be123c') + ioBold(162, beamY + 48, 'S', 'middle', '#1d4ed8'));
          // 분해 슬릿
          o += pvdG(f, ['slt'], pvdR(222, beamY - 26, 5, 20, 'url(#ioMt)') + pvdR(222, beamY + 6, 5, 20, 'url(#ioMt)'));
          // 가속관: 링 전극
          o += pvdG(f, ['acc'], [0, 1, 2, 3, 4].map(i => pvdR(246 + i * 11, beamY - 28, 4, 22, 'url(#ioMt)') + pvdR(246 + i * 11, beamY + 6, 4, 22, 'url(#ioMt)')).join('') + pvdL(`M246 ${beamY - 32} H294`, { so: .5 }) + ioTxt(270, beamY - 36, '고전압', 'font-weight:700;fill:#e11d48;opacity:1', 'middle'));
          // 스캐너 + 평행화 렌즈
          o += pvdG(f, ['scn'], pvdR(314, beamY - 30, 26, 5, '#a78bfa', { so: .5 }) + pvdR(314, beamY + 25, 26, 5, '#a78bfa', { so: .5 }) + `<path d="M350 ${beamY - 34} q10 34 0 68 M358 ${beamY - 34} q10 34 0 68" style="fill:none;stroke:currentColor;stroke-opacity:.55;stroke-width:2.4"/>`);
          // 엔드 스테이션
          o += pvdG(f, ['end'], pvdR(396, beamY - 54, 108, 108, 'rgba(56,189,248,.08)', { rx: 8, dash: '3 4', so: .45 }) + `<g transform="rotate(-8 446 ${beamY})">` + pvdR(440, beamY - 40, 8, 80, 'url(#ioSi)') + '</g>' + pvdR(452, beamY - 30, 16, 60, 'url(#ioMt)', { rx: 3 }) + pvdR(476, beamY - 14, 20, 28, 'rgba(244,114,182,.22)', { rx: 4, so: .8 }) + ioTxt(486, beamY + 4, '도즈', 'font-weight:700;font-size:8.5px', 'middle') + `<rect x="424" y="${beamY - 52}" width="12" height="10" rx="2" fill="#2dd4bf" fill-opacity=".6" stroke="currentColor" stroke-opacity=".6"/>` + ioTxt(430, beamY - 56, '전자', 'font-size:8.5px;opacity:.85', 'middle'));
          // 빔 그리기
          beamSegs.forEach(([d, w], i) => { const grp = i === 0 ? ['src'] : i === 1 ? ['ext', 'mag', 'slt'] : i === 2 ? ['slt', 'acc'] : i === 3 ? ['acc', 'scn'] : ['scn', 'end']; o += pvdG(f, grp, pvdL(d, { c: '#f59e0b', sw: w, so: .85 })); });
          // 진공 펌프(아래)
          o += pvdG(f, ['vac'], [[96, '소스'], [250, '가속관'], [430, '엔드 스테이션']].map(([x, t]) => pvdL(`M${x} ${beamY + 22} V${beamY + 56}`, { so: .5, sw: 2 }) + pvdR(x - 18, beamY + 56, 36, 28, 'url(#ioMt)', { rx: 5 }) + ioTxt(x, beamY + 74, '진공 펌프', 'font-size:8.5px;font-weight:700', 'middle') + ioTxt(x, beamY + 98, t, 'opacity:.7;font-size:9px', 'middle')).join(''));
          // 위쪽 구역 이름
          const names = [[48, '이온 소스', ['src']], [86, '추출', ['ext']], [162, '분석 자석', ['mag']], [225, '슬릿', ['slt']], [270, '가속관', ['acc']], [334, '스캐너', ['scn']], [354, '', ['scn']], [450, '엔드 스테이션', ['end']]];
          o += names.filter(n => n[1]).map(([x, t, g]) => pvdG(f, g, ioTxt(x, 22, t, 'font-weight:800;opacity:1;font-size:10.5px', 'middle') + pvdL(`M${x} 28 V${t === '이온 소스' ? beamY - 56 : beamY - 62}`, { so: .25, dash: '2 3' }))).join('');
          return dgSvg('이온 주입기 구성: ' + s.label, o, '0 8 520 210');
        }
      },

      // ---------- 2. 이온 소스 ----------
      'ion-source': {
        title: '이온 소스: 플라즈마에서 이온을 끌어낸다',
        wide: true,
        states: [
          { id: 'all', label: '소스 구조', desc: '아크 챔버 안에서 가열된 음극이 전자를 내보내고, 전자가 가스 분자와 부딪혀 이온과 전자의 혼합물인 플라즈마가 만들어진다. 챔버 둘레의 자석은 전자를 나선으로 가둬 이온화 효율을 높인다. 챔버 앞면의 좁은 슬릿으로 이온이 빠져나와 추출 전극으로 향한다.' },
          { id: 'plasma', label: '플라즈마 만들기', focus: ['pl'], desc: '음극에서 나온 전자가 자기장에 갇혀 챔버 안을 오가며 가스 분자와 충돌한다. 충돌 때마다 분자는 쪼개지거나 전자를 잃고 이온이 된다. 반대편 반사 전극(리펠러)이 전자를 되돌려 보내 같은 전자가 여러 번 충돌하게 한다. 가스 종류와 아크 전류가 이온 종류와 빔 세기를 좌우한다.' },
          { id: 'ext', label: '이온 추출', focus: ['ex'], desc: '챔버는 높은 양전압에 떠 있고, 앞쪽 억제 전극은 음전압, 그다음 접지 전극은 0 V다. 양이온은 이 전위차를 따라 가속되어 나간다. 억제 전극의 음전압은 빔 쪽의 전자가 챔버로 역류하는 것을 막는다. 이때 이온이 얻는 에너지는 이온 전하와 추출 전압의 곱이다.' }
        ],
        svg(s) {
          const f = s.focus || null, on = (g) => !f || pvdOn(f, g);
          let o = ioDefs('is');
          // 아크 챔버
          o += pvdG(f, ['pl'], pvdR(60, 70, 230, 120, 'rgba(148,163,184,.18)', { rx: 10, so: .7 }) + pvdTx(250, 62, '아크 챔버 (양전압)', { a: 'middle', st: 'font-size:10.5px;font-weight:800;opacity:1' }));
          // 음극 + 필라멘트
          o += pvdG(f, ['pl'], pvdR(70, 106, 22, 48, 'url(#isMt)', { rx: 3 }) + `<path d="M64 120 q8 -8 16 0 q8 8 16 0" style="fill:none;stroke:#fb923c;stroke-width:2.2"/>` + ioTxt(81, 168, '음극', 'font-weight:700', 'middle') + ioTxt(81, 180, '(필라멘트)', 'font-size:8.5px;opacity:.8', 'middle'));
          // 리펠러
          o += pvdG(f, ['pl'], pvdR(266, 106, 14, 48, 'url(#isMt)', { rx: 3 }) + ioTxt(273, 168, '반사', 'font-weight:700', 'middle') + ioTxt(273, 180, '전극', 'font-size:8.5px;opacity:.8', 'middle'));
          // 플라즈마
          o += pvdG(f, ['pl'], `<ellipse cx="176" cy="130" rx="76" ry="38" fill="url(#isPl)"/>` + [[120, 126], [150, 116], [176, 138], [204, 120], [232, 136], [160, 152], [214, 150]].map(([x, y], i) => ioDot(x, y, i % 2 ? 2.6 : 2, i % 2 ? '#f59e0b' : '#38bdf8')).join('') + `<path d="M96 126 C120 100 140 156 166 124 C190 96 210 154 262 128" style="fill:none;stroke:#38bdf8;stroke-width:1.6;stroke-dasharray:3 3"/>` + ioTxt(176, 108, '플라즈마', 'font-weight:800;fill:#7e22ce;opacity:1', 'middle'));
          // 자기장 화살표
          o += pvdG(f, ['pl'], ioAr(98, 86, 256, 86, '#94a3b8', 1.2, '4 3') + ioTxt(176, 80, '자기장 B (전자를 나선으로 가둔다)', 'opacity:.8', 'middle'));
          // 가스 입구
          o += pvdG(f, ['pl'], pvdR(113, 40, 14, 30, 'url(#isMt)') + pvdL('M120 28 V70', { c: '#34d399', sw: 2.6, so: .9 }) + ioTxt(120, 20, '가스 (BF₃, PH₃, AsH₃ …)', 'font-weight:700;fill:#059669;opacity:1', 'middle'));
          // 추출 슬릿 + 전극
          o += pvdG(f, ['ex'], pvdR(150, 188, 50, 5, 'url(#isMt)', { so: .7 }) + pvdR(172, 188, 6, 5, 'rgba(15,23,42,0)', { so: 0.01 }));
          o += pvdG(f, ['ex'], [[210, '억제', '#fb7185', '−'], [240, '접지', '#94a3b8', '0']].map(([y, t, c, v]) => pvdR(118, y, 44, 6, c, { so: .5 }) + pvdR(190, y, 44, 6, c, { so: .5 }) + ioTxt(246, y + 6, t + ' 전극 (' + v + ')', 'font-weight:700', 'start')).join('') + [168, 176, 184].map((x, i) => ioAr(x, 196, x, 268, '#f59e0b', 2.4)).join('') + ioTxt(176, 286, '양이온이 전위차를 따라 빠져나간다', 'opacity:.8', 'middle'));
          // 전압 표기
          o += pvdG(f, ['ex'], ioBold(330, 120, '+ 수십 kV', 'middle', '#e11d48') + ioTxt(330, 134, '(이온 에너지 = q · V)', 'opacity:.85', 'middle') + pvdL('M290 120 H262', { c: '#e11d48', sw: 1.4, so: .8 }));
          return dgSvg('이온 소스: ' + s.label, o, '0 6 440 292');
        }
      },
    });

    Object.assign(DIAGRAMS, {
      // ---------- 3. 분석 자석 ----------
      'ion-mass': {
        title: '분석 자석: 질량으로 이온을 가려낸다',
        wide: true,
        states: [
          { id: 'path', label: '이온이 휘는 길', focus: ['p'], desc: '자기장 속에서 이온은 원을 그리며 휘고, 같은 에너지라면 무거운 이온일수록 큰 원을 그린다. 자석이 정한 반지름에 맞는 질량의 이온만 출구 슬릿 구멍을 지나고, 더 가볍거나 무거운 이온은 벽에 부딪혀 걸러진다.' },
          { id: 'spec', label: '질량 스펙트럼', focus: ['s'], desc: '원료 가스를 플라즈마로 만들면 한 종류의 이온만 나오지 않는다. 예를 들어 BF₃에서는 B⁺(질량 10, 11), F⁺, BF⁺, BF₂⁺ 같은 여러 조각이 나온다. 자석 전류를 바꿔 훑으면 질량 스펙트럼이 얻어지고, 원하는 봉우리 위치에 자석을 맞추면 그 이온만 통과한다.' }
        ],
        svg(s) {
          const f = s.focus || null, on = (g) => !f || pvdOn(f, g);
          let o = ioDefs('im');
          if (f && pvdOn(f, ['s'])) {
            // 스펙트럼
            o += pvdL('M44 40 V230 H380', { so: .6, sw: 1.4 }) + ioTxt(44, 32, '이온 전류', 'font-weight:700;opacity:.85') + ioTxt(44, 262, '질량 (amu) = 자석 전류에 대응', 'opacity:.8', 'start');
            const pk = [[10, 0.18, '¹⁰B⁺'], [11, 0.55, '¹¹B⁺'], [19, 0.35, 'F⁺'], [30, 0.4, 'BF⁺'], [49, 1.0, 'BF₂⁺']];
            const X = (m) => 54 + (m - 6) * 7.2;
            pk.forEach(([m, h, t]) => { const x = X(m), y = 230 - 170 * h, sel = m === 11; o += `<path d="M${x - 6} 230 Q${x} ${y - 10} ${x + 6} 230" style="fill:${sel ? 'rgba(245,158,11,.5)' : 'rgba(148,163,184,.3)'};stroke:${sel ? '#f59e0b' : 'currentColor'};stroke-opacity:${sel ? 1 : .55};stroke-width:${sel ? 2.2 : 1.2}"/>` + ioTxt(x, 246, String(m), 'opacity:.75;font-size:9px', 'middle') + ioBold(m === 10 ? x - 14 : x, y - 12, t, 'middle', sel ? '#b45309' : undefined); });
            o += pvdR(X(11) - 10, 36, 20, 194, 'rgba(245,158,11,.1)', { dash: '3 3', so: .7 }) + ioTxt(X(11) + 16, 52, '이 봉우리에 맞추면', 'font-weight:700;fill:#b45309;opacity:1') + ioTxt(X(11) + 16, 65, '¹¹B⁺만 통과', 'font-weight:700;fill:#b45309;opacity:1');
            o += ioTxt(212, 118, '(BF₃ 소스의 예시, 비율은 조건에 따라 다르다)', 'opacity:.75;font-size:9px');
            return dgSvg('분석 자석: ' + s.label, o, '0 20 400 250');
          }
          // 자기장 영역
          o += pvdR(100, 50, 200, 200, 'rgba(96,165,250,.12)', { rx: 10, dash: '3 4', so: .5 });
          const fx = []; for (let x = 130; x <= 280; x += 30) for (let y = 80; y <= 230; y += 30) fx.push(`<g><circle cx="${x}" cy="${y}" r="4.5" style="fill:none;stroke:#3b82f6;stroke-width:1"/><path d="M${x - 3} ${y - 3} L${x + 3} ${y + 3} M${x + 3} ${y - 3} L${x - 3} ${y + 3}" style="stroke:#3b82f6;stroke-width:1"/></g>`);
          o += fx.join('') + ioTxt(200, 264, '자기장 B (× : 종이 안쪽으로 향함)', 'opacity:.8;font-size:9.5px', 'middle');
          // 입사 방향 + 궤적들
          const Y0 = 240, X0 = 160;
          const arc = (r, c, w, dash, top) => `<path d="M24 ${Y0} H${X0} A${r} ${r} 0 0 0 ${X0 + r} ${Y0 - r} V${top}" style="fill:none;stroke:${c};stroke-width:${w};${dash ? 'stroke-dasharray:' + dash : ''}"/>`;
          o += arc(60, '#a78bfa', 2.4, '5 3', 56) + arc(90, '#f59e0b', 3.4, '', 28) + arc(120, '#22d3ee', 2.4, '5 3', 56);
          // 슬릿(출구)
          o += pvdR(190, 44, 52, 8, 'url(#imMt)', { so: .6 }) + pvdR(258, 44, 52, 8, 'url(#imMt)', { so: .6 }) + ioTxt(250, 36, '슬릿', 'font-weight:700', 'middle');
          // 벽에 닿는 표시
          o += ioTxt(212, 74, '× 걸러짐', 'fill:#7c3aed;font-weight:700;opacity:1', 'middle') + ioTxt(290, 74, '× 걸러짐', 'fill:#0e7490;font-weight:700;opacity:1', 'middle');
          o += ioAr(250, 40, 250, 22, '#f59e0b', 3) + ioTxt(262, 24, '원하는 이온만', 'font-weight:800;fill:#b45309;opacity:1');
          o += ioTxt(24, 232, '여러 이온', 'font-weight:700');
          o += pvdR(330, 90, 100, 120, 'rgba(148,163,184,.08)', { rx: 8, so: .4 });
          [['#a78bfa', '가벼운 이온 (작은 원)'], ['#f59e0b', '원하는 이온'], ['#22d3ee', '무거운 이온 (큰 원)']].forEach(([c, t], i) => { o += pvdL(`M338 ${112 + i * 34} H358`, { c, sw: 3, so: 1 }) + ioTxt(362, 116 + i * 34, t.length > 6 ? t.split(' ')[0] + ' ' + (t.split(' ')[1] || '') : t, 'font-size:8.5px;font-weight:700'); });
          o += ioTxt(380, 230, 'r = (1/B)·√(2mV/q)', 'font-weight:800;font-size:10px', 'middle');
          return dgSvg('분석 자석: ' + s.label, o, '0 12 440 262');
        }
      },

      // ---------- 4. 가속 · 감속 ----------
      'ion-accel': {
        title: '가속관: 이온의 에너지를 정한다',
        wide: true,
        states: [
          { id: 'acc', label: '가속', focus: ['a'], desc: '양이온이 전위차를 지나가면 qV만큼 에너지를 얻는다. 추출 단계에서 얻은 에너지에 가속관의 전위차를 더해 목표 에너지(고에너지)를 만든다. 전하가 둘인 이온(B²⁺, P²⁺ 등)은 같은 전압에서 두 배의 에너지를 얻는다.' },
          { id: 'dec', label: '감속 (저에너지)', focus: ['d'], desc: '얕은 접합을 만들려면 수 keV 이하의 낮은 에너지가 필요한데, 낮은 에너지의 빔은 이온끼리 밀어내서(공간 전하) 퍼지고 전류가 약해진다. 그래서 빔을 높은 에너지로 보내다가 웨이퍼 직전에서 감속해 낮은 에너지로 닿게 하면, 빔 전류를 크게 유지할 수 있다.' }
        ],
        svg(s) {
          const f = s.focus || null, acc = !f || pvdOn(f, ['a']);
          let o = ioDefs('ia');
          // 위: 전극 + 빔
          o += pvdR(10, 40, 400, 76, 'rgba(148,163,184,.1)', { rx: 8, so: .4 });
          const xs = acc ? [90, 150, 210, 270] : [100, 220, 290];
          xs.forEach((x, i) => { o += pvdR(x, 40, 5, 26, 'url(#iaMt)') + pvdR(x, 90, 5, 26, 'url(#iaMt)'); });
          o += pvdL('M10 78 H410', { c: '#f59e0b', sw: 5, so: .8 });
          // 이온 점 (에너지 높을수록 간격 넓게 보이는 대신 화살표 길이)
          o += ioTxt(24, 32, '이온 소스 · 추출', 'font-weight:700') + ioTxt(380, 32, '웨이퍼', 'font-weight:700', 'end');
          o += pvdR(398, 46, 8, 64, 'url(#iaSi)');
          // 아래: 에너지 그래프
          o += pvdL('M30 150 V270 H400', { so: .6, sw: 1.4 }) + ioTxt(30, 144, '이온 에너지', 'font-weight:700;opacity:.85') + ioTxt(400, 286, '빔라인을 따라', 'opacity:.8', 'end');
          if (acc) {
            o += pvdL('M30 250 H70 L90 222 H150 L170 198 H230 L250 174 H290 L310 164 H398', { c: 'var(--hl-accent)', sw: 3, so: 1 });
            o += ioTxt(60, 242, '추출', 'font-weight:700;font-size:9.5px', 'middle') + ioTxt(112, 188, '가속관에서', 'font-weight:700;font-size:9.5px;fill:#e11d48;opacity:1', 'middle') + ioTxt(112, 200, '단계별로 상승', 'font-weight:700;font-size:9.5px;fill:#e11d48;opacity:1', 'middle') + ioTxt(360, 156, '목표 에너지 ↑', 'font-weight:800', 'middle');
            o += ioTxt(210, 134, '전극마다 걸린 전위차가 에너지를 더한다 (E = q · V)', 'opacity:.85', 'middle');
          } else {
            o += pvdL('M30 250 H70 L100 170 H210 L230 170 L290 240 H398', { c: 'var(--hl-accent)', sw: 3, so: 1 });
            o += ioTxt(160, 160, '높은 에너지로 수송 (빔이 덜 퍼진다)', 'font-weight:700;font-size:9.5px', 'middle') + ioTxt(344, 232, '웨이퍼 직전', 'font-weight:700;font-size:9.5px;fill:#e11d48;opacity:1', 'middle') + ioTxt(344, 262, '감속 → 낮은 에너지', 'font-weight:800;font-size:9.5px;fill:#e11d48;opacity:1', 'middle');
            o += ioTxt(210, 134, '감속 전극이 웨이퍼 직전에서 에너지를 낮춘다', 'opacity:.85', 'middle');
          }
          return dgSvg('가속 · 감속: ' + s.label, o, '0 20 420 276');
        }
      },
    });

    Object.assign(DIAGRAMS, {
      // ---------- 5. 빔 훑기 방식 ----------
      'ion-scan': {
        title: '웨이퍼 전체에 고르게 박는 방법',
        wide: true,
        states: [
          { id: 'batch', label: '배치 (회전 디스크)', desc: '디스크에 웨이퍼 여러 장을 붙이고 빠르게 돌리면서 위아래로 천천히 움직인다. 빔은 한 점에 고정돼 있고, 디스크가 돌고 움직이며 모든 웨이퍼의 모든 점이 빔을 지나간다. 한 번에 많이 처리하지만 장비가 크고, 웨이퍼마다 각도를 조절하기 어렵고, 한 장이 문제를 일으키면 같은 배치가 모두 영향을 받는다.' },
          { id: 'ribbon', label: '리본 빔 + 웨이퍼 이동', desc: '빔을 웨이퍼보다 긴 띠 모양으로 만들고, 웨이퍼를 그 띠를 가로질러 한 번 움직이면 전체가 덮인다. 빔이 고정돼 있어 도즈가 균일하고 웨이퍼 한 장씩 각도와 도즈를 맞출 수 있다. 낱장 처리 장비에서 흔히 쓰인다.' },
          { id: 'spot', label: '스팟 빔 스캔 + 웨이퍼 이동', desc: '가는 빔을 전기장(또는 자기장)으로 좌우로 빠르게 훑고, 웨이퍼를 위아래로 천천히 움직여 전체를 덮는다. 훑은 빔은 평행화 렌즈를 지나 웨이퍼 어디에나 같은 각도로 닿게 한다. 낱장 처리의 또 다른 대표 방식이다.' }
        ],
        svg(s) {
          let o = ioDefs('sn');
          const id = s.id;
          if (id === 'batch') {
            o += `<circle cx="170" cy="150" r="118" style="fill:rgba(148,163,184,.12);stroke:currentColor;stroke-opacity:.55;stroke-width:1.4"/>`;
            for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6, x = 170 + 80 * Math.cos(a), y = 150 + 80 * Math.sin(a); o += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="20" style="fill:url(#snSi);stroke:currentColor;stroke-opacity:.6"/>`; }
            o += `<path d="M110 62 A100 100 0 0 1 232 80" style="fill:none;stroke:#34d399;stroke-width:2"/>` + ioAr(228, 78, 236, 84, '#34d399', 2) + ioBold(120, 50, '회전', 'middle', '#059669');
            o += ioAr(340, 110, 340, 60, '#a78bfa', 2.2) + ioAr(340, 190, 340, 240, '#a78bfa', 2.2) + pvdL('M340 60 V240', { c: '#a78bfa', sw: 1.2, so: .7, dash: '3 3' }) + ioBold(380, 84, '위아래 이동', 'middle', '#7c3aed');
            o += pvdL('M420 150 H266', { c: '#f59e0b', sw: 5, so: .85 }) + `<circle cx="250" cy="150" r="8" fill="#f59e0b"/>` + ioBold(380, 138, '고정된 빔', 'middle', '#b45309');
            return dgSvg('빔 훑기: ' + s.label, o, '0 20 440 262');
          }
          // 웨이퍼 (낱장)
          o += `<circle cx="210" cy="150" r="82" style="fill:url(#snSi);stroke:currentColor;stroke-opacity:.7;stroke-width:1.4"/>`;
          if (id === 'ribbon') {
            o += pvdR(130, 40, 18, 220, 'rgba(245,158,11,.55)', { so: .9 }) + ioBold(139, 30, '리본 빔', 'middle', '#b45309') + ioTxt(122, 76, '웨이퍼보다 긴 띠', 'font-size:9px;opacity:.85', 'end');
            o += pvdL('M120 150 H20', { c: '#f59e0b', sw: 6, so: .85 }) + ioTxt(70, 138, '빔 →', 'font-weight:800;fill:#b45309;opacity:1', 'middle');
            o += ioAr(250, 262, 330, 262, '#a78bfa', 2.2) + ioAr(170, 262, 90, 262, '#a78bfa', 2.2) + ioBold(210, 278, '웨이퍼가 좌우로 이동 (기계 스캔)', 'middle', '#7c3aed');
            return dgSvg('빔 훑기: ' + s.label, o, '0 20 440 296');
          }
          // spot: 스캔선
          for (let k = -4; k <= 4; k++) { const y = 150 + k * 16, hw = Math.sqrt(Math.max(0, 82 * 82 - (k * 16) ** 2)); o += pvdL(`M${210 - hw} ${y} H${210 + hw}`, { c: '#f59e0b', sw: 1.4, so: .65 }); }
          o += `<circle cx="256" cy="118" r="7" fill="#f59e0b"/>` + ioAr(266, 118, 300, 118, '#f59e0b', 2.4) + ioAr(200, 118, 150, 118, '#f59e0b', 2.4, '3 2');
          o += ioBold(370, 112, '빔이 좌우로 훑는다', 'middle', '#b45309') + ioTxt(370, 126, '(전기장 스캔)', 'opacity:.85', 'middle');
          o += ioAr(340, 230, 340, 190, '#a78bfa', 2.2) + ioAr(340, 160, 340, 200, '#a78bfa', 2.2) + ioBold(370, 176, '웨이퍼가', 'middle', '#7c3aed') + ioBold(370, 190, '위아래 이동', 'middle', '#7c3aed') + ioTxt(370, 204, '(기계 스캔)', 'opacity:.85', 'middle');
          return dgSvg('빔 훑기: ' + s.label, o, '0 40 440 240');
        }
      },

      // ---------- 6. 엔드 스테이션 ----------
      'ion-end': {
        title: '엔드 스테이션: 기울기, 도즈, 전하 중성화',
        wide: true,
        states: [
          { id: 'all', label: '전체', desc: '웨이퍼는 냉각되는 척에 고정되어 빔을 맞고, 빔 전류는 패러데이 컵으로 측정된다. 이 값을 시간에 대해 쌓아 도즈를 세고, 전자 공급기는 웨이퍼에 쌓이는 전하를 없앤다. 웨이퍼는 결정 방향에 맞춰 기울이고 돌려서 장착한다.' },
          { id: 'tilt', label: '기울기 (틸트)', focus: ['t'], desc: '실리콘 결정은 방향에 따라 이온이 막힘없이 깊이 지나가는 빈 길(채널)이 있다. 웨이퍼를 빔에 대해 약 7° 기울이면 이온이 원자와 비스듬히 부딪혀 채널을 타지 못한다. 트렌치나 마스크 가장자리가 가리는 그림자 효과도 같이 고려한다.' },
          { id: 'dose', label: '도즈 측정', focus: ['d'], desc: '패러데이 컵이 모은 이온의 전하를 전류로 읽고, 시간에 대해 쌓아(적분) 도즈를 센다. 도즈 = (1/qA)·∫I dt다. 목표 값에 닿으면 빔을 막는다. 전류가 흔들리면 그만큼 도즈 오차가 생기므로 전류를 계속 보며 스캔 속도를 보정한다.' },
          { id: 'charge', label: '전하 중성화', focus: ['c'], desc: '양이온이 계속 박히면 웨이퍼 표면에 양전하가 쌓이고, 얇은 게이트 산화막이 이 전압에 파괴되거나 도즈 측정이 틀어진다. 전자 공급기(전자 샤워 또는 플라즈마 플러드 건)가 빔 주변에 낮은 에너지의 전자를 공급해 전하를 중성으로 되돌린다.' }
        ],
        svg(s) {
          const f = s.focus || null, on = (g) => !f || pvdOn(f, g);
          let o = ioDefs('ie');
          // 빔
          o += pvdL('M10 150 H236', { c: '#f59e0b', sw: 7, so: .85 }) + ioTxt(40, 138, '이온 빔 →', 'font-weight:800;fill:#b45309;opacity:1');
          // 웨이퍼 + 척 (7° 기울임)
          const tilt = on(['t']) || !f ? -7 : -7;
          o += `<g transform="rotate(${tilt} 252 150)">` + pvdG(f, ['t', 'd', 'c'], pvdR(244, 70, 8, 160, 'url(#ieSi)') + pvdR(252, 70, 26, 160, 'url(#ieMt)', { rx: 3 }) + pvdR(262, 100, 6, 100, 'rgba(56,189,248,.45)', { so: .4 })) + '</g>';
          o += ioTxt(348, 84, '냉각되는 척', 'font-weight:700;font-size:9.5px', 'start') + ioTxt(348, 96, '(빔 열을 식힌다)', 'opacity:.8;font-size:9px', 'start');
          // 패러데이 컵
          o += pvdG(f, ['d'], pvdR(222, 52, 40, 12, 'rgba(244,114,182,.3)', { so: .9, rx: 3 }) + pvdR(222, 236, 40, 12, 'rgba(244,114,182,.3)', { so: .9, rx: 3 }) + pvdL('M262 58 H340 V120', { so: .6 }) + pvdL('M262 242 H340 V176', { so: .6 }) + pvdR(300, 120, 100, 56, 'rgba(244,114,182,.15)', { rx: 6, so: .8 }) + ioBold(350, 142, '전류 적분', 'middle') + ioTxt(350, 160, '도즈 = (1/qA) ∫I dt', 'font-weight:700;font-size:9.5px', 'middle') + ioTxt(242, 46, '패러데이 컵', 'font-weight:700;font-size:9.5px', 'middle'));
          // 전자 공급기
          o += pvdG(f, ['c'], pvdR(150, 28, 54, 22, 'rgba(45,212,191,.28)', { rx: 5, so: .8 }) + ioTxt(177, 43, '전자 공급기', 'font-weight:700;font-size:9px', 'middle') + [[190, 62], [205, 78], [220, 96], [232, 116], [180, 74], [196, 98]].map(([x, y]) => ioDot(x, y, 2.4, '#14b8a6')).join('') + ioAr(206, 52, 238, 108, '#14b8a6', 1.4, '3 3') + [0, 1, 2, 3].map(i => ioTxt(238 + (i % 2) * 0, 90 + i * 24, '', '')).join('') + `<g>${[[240, 96], [240, 120], [240, 144], [240, 168], [240, 192]].map(([x, y]) => `<text x="${x - 10}" y="${y}" style="font-size:12px;font-weight:800;fill:#e11d48">+</text>`).join('')}</g>` + ioTxt(30, 216, '+ 전하가 쌓이면 산화막이 위험', 'font-weight:700;fill:#e11d48;opacity:1;font-size:9.5px', 'start'));
          // 기울기 표시
          if (f && pvdOn(f, ['t'])) {
            o += pvdL('M252 150 L192 157', { c: '#64748b', sw: 1.6, so: .9, dash: '4 3' }) + ioTxt(190, 176, '웨이퍼 면의 법선', 'opacity:.85;font-size:9px', 'middle') + ioBold(96, 124, '빔과 법선 사이 약 7°', 'middle', '#e11d48') + pvdL('M138 128 L226 150', { so: .35, c: '#e11d48' });
            o += ioTxt(30, 200, '결정 축을 피해 채널링을 막는다', 'font-weight:700;opacity:.9;font-size:9.5px');
          }
          return dgSvg('엔드 스테이션: ' + s.label, o, '0 20 420 244');
        }
      },
    });

    Object.assign(DIAGRAMS, {
      // ---------- 7. 이온이 멈추는 자리 ----------
      'ion-range': {
        title: '이온이 실리콘 속에서 멈추는 자리',
        wide: true,
        states: [
          { id: 'path', label: '이온의 궤적', focus: ['p'], desc: '이온은 실리콘 원자와 수없이 부딪히며 에너지를 잃고 멈춘다. 같은 에너지로 쏘아도 충돌 과정이 무작위라서 멈추는 깊이는 이온마다 조금씩 다르다. 평균 깊이가 Rp(투영 사거리), 흩어진 정도가 ΔRp다.' },
          { id: 'prof', label: '농도 분포', focus: ['d'], desc: '많은 이온이 만드는 분포는 Rp를 중심으로 한 종 모양(가우시안)이다. 최대 농도는 도즈에 비례하고 ΔRp에 반비례한다. 이 분포가 기판의 원래 불순물 농도와 만나는 깊이가 접합 깊이다.' },
          { id: 'energy', label: '에너지의 영향', focus: ['e'], desc: '같은 도즈에서 에너지를 올리면 이온이 더 깊이 박히고(Rp 증가), 분포가 넓어지며(ΔRp 증가), 최대 농도는 낮아진다. 즉 에너지는 접합 깊이를 정하는 가장 직접적인 노브다.' },
          { id: 'stop', label: '에너지를 잃는 방식', focus: ['s'], desc: '이온은 두 가지 방식으로 에너지를 잃는다. 원자핵과의 충돌(핵 저지)은 결정을 부수고, 전자와의 마찰(전자 저지)은 결정을 거의 부수지 않는다. 낮은 에너지에서는 핵 저지, 높은 에너지에서는 전자 저지가 우세하고, 무거운 이온일수록 핵 저지가 우세한 구간이 길다.' }
        ],
        svg(s) {
          const f = s.focus || null, on = (g) => f && pvdOn(f, g);
          let o = ioDefs('ir');
          if (on(['p'])) {
            o += pvdR(40, 100, 220, 160, 'url(#irSi)') + pvdTx(150, 94, '실리콘 표면', { a: 'middle', st: 'font-size:10px;font-weight:700;opacity:.85' });
            const paths = [
              [[70, 60, 82, 100, 76, 130, 90, 150, 84, 168]], [[110, 60, 118, 104, 130, 128, 122, 156, 134, 176, 130, 186]], [[150, 60, 146, 110, 160, 140, 152, 170, 164, 190]],
              [[190, 60, 196, 100, 184, 134, 196, 158, 188, 172]], [[230, 60, 226, 108, 240, 132, 230, 160, 236, 202, 228, 216]]
            ];
            paths.forEach(([p]) => { let d = `M${p[0]} ${p[1]}`; for (let k = 2; k < p.length; k += 2) d += ` L${p[k]} ${p[k + 1]}`; o += `<path d="${d}" style="fill:none;stroke:#f59e0b;stroke-width:1.6;stroke-linejoin:round"/>` + ioDot(p[p.length - 2], p[p.length - 1], 3.4, '#b45309') + ioAr(p[0], 40, p[0], 60, '#f59e0b', 1.6); });
            o += pvdL('M40 168 H262', { c: '#e11d48', sw: 1.4, so: .9, dash: '4 3' }) + ioBold(330, 172, 'Rp (평균 깊이)', 'middle', '#e11d48');
            o += pvdL('M280 100 V260', { so: .5 }) + ioAr(280, 140, 280, 164, 'currentColor', 1.2) + ioAr(280, 196, 280, 172, 'currentColor', 1.2) + ioBold(330, 200, 'ΔRp', 'middle') + ioTxt(330, 213, '(흩어진 정도)', 'opacity:.85', 'middle');
            o += ioTxt(150, 276, '충돌은 무작위라서 멈추는 깊이가 이온마다 다르다', 'opacity:.85', 'middle');
            return dgSvg('이온의 사거리: ' + s.label, o, '0 30 400 256');
          }
          if (on(['s'])) {
            o += pvdL('M50 30 V230 H380', { so: .6, sw: 1.4 }) + ioTxt(50, 24, '저지 능력', 'font-weight:700;opacity:.85') + ioTxt(380, 246, '이온 에너지 (로그 눈금) →', 'opacity:.8', 'end');
            o += pvdL('M54 214 C90 100 130 60 190 96 S290 188 376 214', { c: '#fb7185', sw: 3, so: 1 }) + pvdL('M54 222 C140 216 210 176 376 60', { c: '#38bdf8', sw: 3, so: 1 });
            o += ioBold(110, 74, '핵 저지', 'middle', '#e11d48') + ioTxt(110, 86, '(원자핵과 충돌, 결정 파괴)', 'opacity:.85;font-size:9px', 'middle') + ioBold(330, 66, '전자 저지', 'middle', '#0284c7') + ioTxt(330, 78, '(전자와 마찰)', 'opacity:.85;font-size:9px', 'middle');
            o += pvdL('M252 50 V230', { c: 'currentColor', sw: 1.2, so: .6, dash: '4 3' }) + ioBold(252, 44, '두 저지가 같아지는 에너지', 'middle') + ioTxt(252, 262, '대략 B 17 keV · P 140 keV · As 800 keV', 'opacity:.85;font-size:9px', 'middle');
            return dgSvg('이온의 사거리: ' + s.label, o, '0 8 400 262');
          }
          // 농도 분포
          o += pvdL('M50 30 V230 H380', { so: .6, sw: 1.4 }) + ioTxt(50, 24, '불순물 농도', 'font-weight:700;opacity:.85') + ioTxt(380, 246, '표면에서의 깊이 →', 'opacity:.8', 'end') + ioTxt(52, 244, '표면', 'font-size:9px;opacity:.75');
          const gauss = (rp, sg, h) => { let d = ''; for (let x = 50; x <= 380; x += 4) { const y = 230 - h * Math.exp(-((x - 50 - rp) ** 2) / (2 * sg * sg)); d += (d ? ' L' : 'M') + x + ' ' + y.toFixed(1); } return d; };
          if (on(['e'])) {
            const sets = [[60, 18, 170, '#38bdf8', '낮은 에너지'], [120, 30, 102, '#a78bfa', '중간'], [190, 45, 68, '#fb7185', '높은 에너지']];
            sets.forEach(([rp, sg, h, c, t]) => { o += pvdL(gauss(rp, sg, h), { c, sw: 2.6, so: 1 }) + ioBold(50 + rp + 4, 230 - h - 8, t, 'middle', c); });
            o += ioTxt(300, 60, '같은 도즈(곡선 아래 넓이)에서', 'opacity:.9;font-weight:700', 'middle') + ioTxt(300, 74, '더 깊이, 더 넓게, 더 낮은 최대 농도', 'opacity:.9;font-weight:700', 'middle');
            return dgSvg('이온의 사거리: ' + s.label, o, '0 8 400 262');
          }
          o += pvdL(gauss(120, 45, 170), { c: 'var(--hl-accent)', sw: 3, so: 1 });
          o += pvdL('M50 200 H380', { c: '#64748b', sw: 1.4, so: .8, dash: '5 3' }) + ioTxt(378, 194, '기판 농도', 'opacity:.85;font-weight:700', 'end');
          o += pvdL('M170 60 V230', { c: '#e11d48', sw: 1.2, so: .8, dash: '3 3' }) + ioBold(170, 52, 'Rp', 'middle', '#e11d48');
          o += pvdL('M170 100 H215', { so: .5 }) + ioTxt(222, 104, 'ΔRp', 'font-weight:800') + ioTxt(250, 74, '최대 농도 ≈ 0.4 × 도즈 / ΔRp', 'font-weight:700;font-size:9.5px', 'start');
          o += pvdL('M254 196 V230', { c: '#e11d48', sw: 2.2, so: 1 }) + ioBold(254, 246, '접합 깊이', 'middle', '#e11d48') + ioTxt(260, 164, '여기서 분포가 기판 농도와', 'opacity:.85;font-size:9px', 'start') + ioTxt(260, 176, '만난다 (n⁺/p 경계)', 'opacity:.85;font-size:9px', 'start');
          return dgSvg('이온의 사거리: ' + s.label, o, '0 8 400 262');
        }
      },

      // ---------- 8. 채널링 ----------
      'ion-channel': {
        title: '채널링: 결정 속의 빈 길',
        wide: true,
        states: [
          { id: 'ch', label: '채널링 (기울기 0°)', focus: ['c'], desc: '이온이 결정의 원자 줄 사이의 빈 길(채널)과 나란히 들어가면 원자와 거의 부딪히지 않고 깊이까지 미끄러진다. 그러면 분포에 의도보다 훨씬 깊은 꼬리가 생겨 접합이 깊어진다.' },
          { id: 'tilt', label: '기울기 약 7°', focus: ['t'], desc: '웨이퍼를 결정 축에서 약 7° 기울이면 이온이 원자와 비스듬히 부딪혀 채널에 들어가지 못한다. 이온이 곧 방향을 잃고 무작위 분포에 가깝게 멈춘다.' },
          { id: 'screen', label: '스크린 산화막', focus: ['x'], desc: '표면에 얇은 산화막(스크린 산화막)을 두면 이온이 그 안에서 먼저 흩어져 결정에 여러 각도로 들어간다. 기울기를 줄 수 없는 경우에도 채널링을 줄이는 방법이다. 산화막은 표면 오염과 스퍼터링도 막아 준다.' }
        ],
        svg(s) {
          const f = s.focus || null, on = (g) => f && pvdOn(f, g);
          let o = ioDefs('ic');
          const top = on(['x']) ? 92 : 70;
          if (on(['x'])) o += pvdR(40, 40, 230, 40, 'url(#icOx)', { so: .6 }) + [[70, 56], [98, 66], [126, 52], [160, 68], [190, 54], [224, 64], [248, 52]].map(([x, y]) => ioDot(x, y, 3, '#7dd3fc')).join('') + ioTxt(155, 34, '스크린 산화막 (비정질)', 'font-weight:700;font-size:9.5px', 'middle');
          // 격자
          for (let c = 0; c < 7; c++) for (let r = 0; r < 7; r++) { const x = 60 + c * 34, y = top + r * 28; o += `<circle cx="${x}" cy="${y}" r="7" style="fill:#94a3b8;fill-opacity:.7;stroke:currentColor;stroke-opacity:.6"/>`; }
          o += ioTxt(150, 284, '결정 격자 (위에서 본 원자 줄)', 'opacity:.7;font-size:9px', 'middle');
          // 이온 궤적
          if (on(['c'])) {
            o += pvdL(`M77 20 V262`, { c: '#f59e0b', sw: 3, so: .9 }) + ioAr(77, 12, 77, 34, '#f59e0b', 2.4) + ioDot(77, 262, 4, '#b45309') + ioBold(150, 300, '빈 길을 따라 원자와 부딪히지 않고 깊이 빠진다', 'middle', '#b45309');
          } else if (on(['t'])) {
            o += `<path d="M78 20 L88 70 L66 90 L76 128 L98 142 L88 170" style="fill:none;stroke:#f59e0b;stroke-width:2.4;stroke-linejoin:round"/>` + ioAr(76, 12, 78, 32, '#f59e0b', 2.4) + ioDot(88, 170, 4, '#b45309') + [[88, 70], [66, 90], [76, 128], [98, 142]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="#e11d48" stroke-width="1.4"/>`).join('') + ioBold(150, 300, '원자와 비스듬히 부딪혀 방향이 흩어지고 얕게 멈춘다', 'middle', '#b45309') + ioBold(200, 30, '웨이퍼를 약 7° 기울임', 'start', '#e11d48');
          } else {
            o += `<path d="M94 20 V68 L112 90 L126 112 L108 140 L90 168" style="fill:none;stroke:#f59e0b;stroke-width:2.4;stroke-linejoin:round"/>` + ioAr(94, 12, 94, 40, '#f59e0b', 2.4) + ioDot(90, 168, 4, '#b45309') + ioBold(150, 300, '산화막에서 먼저 흩어져 여러 각도로 결정에 들어간다', 'middle', '#b45309');
          }
          // 오른쪽: 미니 농도 분포
          const gx = 300;
          o += pvdR(gx - 24, 90, 146, 150, 'rgba(148,163,184,.08)', { rx: 8, so: .4 }) + ioTxt(gx + 48, 106, '농도 분포', 'font-weight:700;font-size:9.5px', 'middle') + pvdL(`M${gx} 120 V220 H${gx + 110}`, { so: .5, sw: 1.2 });
          let base = ''; for (let x = 0; x <= 110; x += 3) { const y = 220 - 70 * Math.exp(-((x - 34) ** 2) / (2 * 12 * 12)); base += (base ? ' L' : 'M') + (gx + x) + ' ' + y.toFixed(1); }
          o += pvdL(base, { c: '#38bdf8', sw: 2.4, so: 1 });
          if (on(['c'])) { let tail = ''; for (let x = 20; x <= 110; x += 3) { const y = 220 - (70 * Math.exp(-((x - 34) ** 2) / (2 * 12 * 12)) + 18 * Math.exp(-((x - 62) ** 2) / (2 * 34 * 34))); tail += (tail ? ' L' : 'M') + (gx + x) + ' ' + y.toFixed(1); } o += pvdL(tail, { c: '#e11d48', sw: 2.4, so: 1 }) + ioBold(gx + 80, 190, '깊은 꼬리', 'middle', '#e11d48'); }
          o += ioTxt(gx + 55, 234, '깊이 →', 'opacity:.75;font-size:9px', 'middle');
          return dgSvg('채널링: ' + s.label, o, '0 6 450 310');
        }
      },
    });

    Object.assign(DIAGRAMS, {
      // ---------- 9. 격자 손상과 어닐링 ----------
      'ion-damage': {
        title: '주입이 남기는 손상과 어닐링',
        wide: true,
        states: [
          { id: 'as', label: '주입 직후', focus: ['a'], desc: '박힌 이온은 지나간 길에 원자를 밀어내 결정을 부순다. 표면 쪽은 원자 위치가 뒤죽박죽인 비정질층이 되고, 그 아래에는 밀려난 원자(격자 사이 원자)와 빈자리가 남는다. 불순물 원자는 대부분 격자 자리가 아닌 곳에 있어 전기적으로 아직 일을 하지 못한다.' },
          { id: 'anneal', label: '어닐 후', focus: ['n'], desc: '높은 온도에서 비정질층은 아래 결정을 본보기로 다시 결정으로 자라고, 불순물 원자는 격자 자리에 들어가 전기적으로 활성화된다. 다만 원래 비정질층의 끝 부근에는 작은 결함 띠(끝단 결함)가 남기 쉽고, 누설 전류의 원인이 된다.' },
          { id: 'over', label: '지나친 어닐 (확산)', focus: ['o'], desc: '온도가 너무 높거나 오래 두면 불순물이 격자 속에서 퍼져 접합이 깊어진다. 주입 직후의 결함이 불순물 확산을 일시적으로 크게 키우는 현상(과도 증속 확산)도 있어서, 첨단 소자는 아주 짧게 고온을 거치는 스파이크·플래시·레이저 어닐을 쓴다.' }
        ],
        svg(s) {
          const f = s.focus || null, on = (g) => f && pvdOn(f, g);
          let o = ioDefs('id');
          const R = (i) => { const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
          const NC = 9, NR = 7, X0 = 46, Y0 = 62, DX = 32, DY = 30;
          const mode = on(['a']) ? 'a' : on(['n']) ? 'n' : 'o';
          o += pvdR(X0 - 22, Y0 - 24, NC * DX + 8, NR * DY + 6, 'rgba(148,163,184,.08)', { rx: 6, so: .35 });
          // 비정질 구역 윤곽
          if (mode === 'a') o += pvdR(X0 - 22, Y0 - 24, NC * DX + 8, 3 * DY, 'rgba(251,113,133,.12)', { so: .01 }) + pvdL(`M${X0 - 22} ${Y0 + 3 * DY - 24} H${X0 + NC * DX - 14}`, { c: '#e11d48', sw: 1.6, so: .9, dash: '4 3' });
          for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) {
            let x = X0 + c * DX, y = Y0 + r * DY; const k = r * NC + c;
            if (mode === 'a' && r < 3) { x += (R(k) - .5) * 20; y += (R(k + 100) - .5) * 18; }
            if (mode === 'a' && r >= 3 && R(k + 300) < .07) { o += `<circle cx="${x}" cy="${y}" r="6" fill="none" stroke="currentColor" stroke-opacity=".5" stroke-dasharray="2 2"/>`; continue; }   // 빈자리
            o += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6.5" style="fill:#94a3b8;fill-opacity:.7;stroke:currentColor;stroke-opacity:.55"/>`;
          }
          // 불순물
          const dop = [];
          if (mode === 'a') { [[0, 1], [2, 0], [3, 2], [5, 1], [6, 2], [8, 1], [1, 3], [4, 3], [7, 4], [3, 4]].forEach(([c, r], i) => dop.push([Math.min(X0 + c * DX + (R(i + 50) - .5) * 20 + 14, 304), Y0 + r * DY + (R(i + 70) - .5) * 14 + 12, false])); }
          else if (mode === 'n') { [[0, 1], [2, 0], [3, 2], [5, 1], [6, 2], [8, 1], [1, 2], [4, 1], [7, 2], [3, 1]].forEach(([c, r]) => dop.push([X0 + c * DX, Y0 + r * DY, true])); }
          else { [[0, 2], [2, 3], [3, 4], [5, 3], [6, 4], [8, 3], [1, 5], [4, 5], [7, 5], [3, 6], [5, 6], [8, 6]].forEach(([c, r]) => dop.push([X0 + c * DX, Y0 + r * DY, true])); }
          dop.forEach(([x, y, act]) => { o += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${act ? 6.5 : 4.5}" style="fill:#f59e0b;stroke:currentColor;stroke-opacity:.6;stroke-width:1"/>`; });
          // 격자 사이 원자(주입 직후)
          if (mode === 'a') [[1, 4], [5, 4], [7, 3], [2, 5], [6, 5]].forEach(([c, r]) => { o += `<circle cx="${X0 + c * DX + 16}" cy="${Y0 + r * DY + 15}" r="4" style="fill:#fb7185;stroke:currentColor;stroke-opacity:.5"/>`; });
          // 끝단 결함 띠
          if (mode === 'n') o += [0, 1, 2, 3, 4, 5, 6, 7].map(i => `<ellipse cx="${X0 + i * 34 + 6}" cy="${Y0 + 3 * DY + 14 + (R(i) - .5) * 8}" rx="9" ry="3.4" fill="none" stroke="#e11d48" stroke-width="1.6"/>`).join('') + pvdL(`M${X0 + 8 * 34 + 20} ${Y0 + 3 * DY + 14} H${X0 + 8 * 34 + 34}`, { so: 0.01 });
          // 오른쪽 범례/설명
          const lx = 346;
          o += pvdR(lx - 8, 44, 100, 190, 'rgba(148,163,184,.08)', { rx: 8, so: .4 });
          const leg = [['#f59e0b', mode === 'a' ? '불순물 (제자리 아님)' : '불순물 (격자 자리)'], ['#94a3b8', '실리콘 원자'], mode === 'a' ? ['#fb7185', '밀려난 원자'] : null].filter(Boolean);
          leg.forEach(([c, t], i) => { o += `<circle cx="${lx + 6}" cy="${64 + i * 26}" r="5" fill="${c}" stroke="currentColor" stroke-opacity=".5"/>` + ioTxt(lx + 16, 68 + i * 26, t, 'font-size:8.5px;font-weight:700'); });
          if (mode === 'a') o += ioTxt(lx + 6, 150, '위쪽: 비정질층', 'font-size:9px;font-weight:700;fill:#e11d48;opacity:1') + ioTxt(lx + 6, 164, '(원자가 뒤죽박죽)', 'font-size:8.5px;opacity:.85') + ioTxt(lx + 6, 188, '점선 원: 빈자리', 'font-size:8.5px;opacity:.85') + ioTxt(lx + 6, 208, '활성화 안 됨', 'font-size:9.5px;font-weight:800;fill:#b45309;opacity:1');
          if (mode === 'n') o += ioTxt(lx + 6, 116, '붉은 타원:', 'font-size:9px;font-weight:700;fill:#e11d48;opacity:1') + ioTxt(lx + 6, 129, '끝단 결함', 'font-size:9px;font-weight:700;fill:#e11d48;opacity:1') + ioTxt(lx + 6, 156, '결정이 다시 자람', 'font-size:9px;font-weight:700') + ioTxt(lx + 6, 172, '불순물이 자리에', 'font-size:9px;font-weight:700') + ioTxt(lx + 6, 186, '들어가 활성화', 'font-size:9px;font-weight:700') + ioTxt(lx + 6, 208, '활성화됨', 'font-size:9.5px;font-weight:800;fill:#059669;opacity:1');
          if (mode === 'o') o += ioAr(60, 244, 60, 266, '#e11d48', 2) + ioTxt(72, 262, '불순물이 더 깊이 퍼진다 → 접합이 깊어진다', 'font-weight:800;fill:#e11d48;opacity:1;font-size:10px') + ioTxt(lx + 6, 208, '활성화됨,', 'font-size:9.5px;font-weight:800;fill:#059669;opacity:1') + ioTxt(lx + 6, 222, '그러나 너무 깊다', 'font-size:9.5px;font-weight:800;fill:#e11d48;opacity:1');
          o += ioTxt(24, 40, '표면', 'font-weight:700;opacity:.85') + ioAr(60, 34, 60, 50, 'currentColor', 1.2);
          return dgSvg('손상과 어닐: ' + s.label, o, '0 20 460 262');
        }
      },

      // ---------- 10. 장비 종류 (에너지-도즈 지도) ----------
      'ion-types': {
        title: '이온 주입기의 세 종류: 에너지와 도즈 지도',
        wide: true,
        states: [
          { id: 'all', label: '세 영역', desc: '이온 주입기는 쓰는 에너지와 도즈에 따라 고전류, 중전류, 고에너지의 세 종류로 나뉜다. 이 지도는 대략적인 구분이며 영역이 겹친다. 도즈가 크면 시간이 오래 걸려서 빔 전류가 큰 장비가 필요하고, 에너지가 높으면 가속 구조가 커진다.' },
          { id: 'hc', label: '고전류', focus: ['h'], desc: '높은 도즈(약 10¹⁴~10¹⁶ /cm² 이상)를 빠르게 박는 장비다. 빔 전류가 수 mA~수십 mA로 크고 에너지는 상대적으로 낮다(대략 수백 eV~수백 keV). 소스·드레인, 확장(익스텐션), 도핑이 필요한 얕은 접합이 주 용도다.' },
          { id: 'mc', label: '중전류', focus: ['m'], desc: '낮은~중간 도즈(약 10¹¹~10¹⁴ /cm²)를 넓은 에너지 범위(수 keV~수백 keV)로 정밀하게 박는 장비다. 빔 전류는 수 십 µA~2 mA 정도다. 문턱 전압 조절, 할로(포켓), 채널 도핑 같은 정밀한 작업에 쓰인다.' },
          { id: 'he', label: '고에너지', focus: ['e'], desc: '수백 keV에서 수 MeV의 에너지로 깊이 박는 장비다. 깊은 웰, 이미지 센서의 깊은 포토다이오드, 전력 소자의 깊은 영역을 만든다. 전하가 둘 이상인 이온을 가속하거나 선형 가속기 방식을 써서 에너지를 높이기도 한다.' }
        ],
        svg(s) {
          const f = s.focus || null, on = (g) => !f || pvdOn(f, g);
          let o = ioDefs('it');
          const X = (e) => 70 + (e - 11) * 50, Y = (k) => 250 - (Math.log10(k) + 1) * 44;
          // 축
          o += pvdL('M70 30 V250 H370', { so: .6, sw: 1.4 });
          for (let e = 11; e <= 17; e++) o += pvdL(`M${X(e)} 250 V254`, { so: .6 }) + ioTxt(X(e), 266, '10' + String(e).split('').map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join(''), 'font-size:9px;opacity:.8', 'middle');
          [[0.1, '0.1 keV'], [1, '1 keV'], [10, '10 keV'], [100, '100 keV'], [1000, '1 MeV'], [10000, '10 MeV']].forEach(([k, t]) => { o += pvdL(`M66 ${Y(k)} H70`, { so: .6 }) + ioTxt(62, Y(k) + 3, t, 'font-size:8.5px;opacity:.8', 'end'); if (k < 10000) o += pvdL(`M70 ${Y(k)} H370`, { so: .1 }); });
          o += ioTxt(370, 282, '도즈 (/cm²) →', 'font-weight:700;opacity:.85', 'end') + ioTxt(70, 22, '에너지 ↑', 'font-weight:700;opacity:.85');
          // 영역
          const box = (e1, e2, k1, k2, c, g) => pvdG(f, [g], pvdR(X(e1), Y(k2), X(e2) - X(e1), Y(k1) - Y(k2), c, { rx: 8, so: .9 }));
          o += box(11, 14.2, 3, 500, 'rgba(56,189,248,.22)', 'm');
          o += box(14, 17, 0.2, 200, 'rgba(251,113,133,.22)', 'h');
          o += box(11, 15, 200, 5000, 'rgba(167,139,250,.24)', 'e');
          o += pvdG(f, ['m'], ioBold(X(12.1), Y(60), '중전류', 'middle', '#0369a1') + ioTxt(X(12.1), Y(60) + 14, '문턱 전압 · 할로 · 채널', 'font-size:8.5px;font-weight:700', 'middle') + ioTxt(X(12.1), Y(60) + 26, '수십 µA ~ 2 mA', 'font-size:8.5px;opacity:.85', 'middle'));
          o += pvdG(f, ['h'], ioBold(X(15.6), Y(5), '고전류', 'middle', '#be123c') + ioTxt(X(15.6), Y(5) + 14, '소스·드레인 · 익스텐션', 'font-size:8.5px;font-weight:700', 'middle') + ioTxt(X(15.6), Y(5) + 26, '수 mA ~ 수십 mA', 'font-size:8.5px;opacity:.85', 'middle'));
          o += pvdG(f, ['e'], ioBold(X(12.6), Y(1500), '고에너지', 'middle', '#6d28d9') + ioTxt(X(12.6), Y(1500) + 14, '깊은 웰 · 이미지 센서 · 전력', 'font-size:8.5px;font-weight:700', 'middle'));
          o += ioTxt(220, 36, '※ 대략적인 범위. 영역이 겹치며 장비마다 다르다', 'font-size:8.5px;opacity:.7', 'middle');
          return dgSvg('이온 주입기의 종류: ' + s.label, o, '0 10 400 290');
        }
      },

      // ---------- 11. 사용처 (트랜지스터 단면) ----------
      'ion-where': {
        title: '이온 주입이 트랜지스터에서 하는 일',
        wide: true,
        states: [
          { id: 'all', label: '전체', desc: 'NMOS 트랜지스터 하나에도 서로 다른 조건의 이온 주입이 여러 번 쓰인다. 깊고 넓게 박는 웰부터 얕고 진하게 박는 소스·드레인까지, 에너지와 도즈가 다른 주입이 겹겹이 들어 있다.' },
          { id: 'well', label: '웰', focus: ['w'], desc: '트랜지스터 아래에 넓고 깊게 도핑한 영역이다. 소자를 전기적으로 격리하고 기판 농도의 기준이 된다. 에너지가 높고 도즈는 낮다(중전류·고에너지).' },
          { id: 'vt', label: '문턱 전압 조절', focus: ['v'], desc: '채널 표면 근처에 얕게 불순물을 넣어 트랜지스터가 켜지는 전압(문턱 전압)을 정한다. 낮은 도즈를 정밀하게 맞추는 중전류 주입이다.' },
          { id: 'halo', label: '할로 (포켓)', focus: ['h'], desc: '소스·드레인 끝의 채널 쪽에 기판과 같은 형의 불순물을 기울여 박아, 짧은 채널에서 소스와 드레인의 공핍층이 서로 닿는 것을 막는다.' },
          { id: 'ext', label: '익스텐션 (LDD)', focus: ['e'], desc: '게이트 가장자리 아래에 소스·드레인보다 얕은 확장 영역을 만든다. 전기장을 줄이고 단채널 효과를 막는다. 낮은 에너지로 얕게 넣는 것이 핵심이다.' },
          { id: 'sd', label: '소스 · 드레인', focus: ['s'], desc: '소스와 드레인은 높은 도즈로 진하게 도핑해 저항을 낮춘 n⁺ 영역이다. 고전류 주입기로 박고 어닐로 활성화한다. 접합이 얕으면서도 면저항이 낮아야 한다.' }
        ],
        svg(s) {
          const f = s.focus || null;
          let o = ioDefs('iw');
          const SY = 130;
          // 기판 + 웰
          o += pvdG(f, ['w'], pvdR(30, SY, 360, 120, 'rgba(96,165,250,.2)', { so: .5 }) + ioBold(210, 236, 'p-웰 (깊고 넓게)', 'middle', '#1d4ed8'));
          // STI
          o += pvdR(30, SY, 28, 54, 'url(#iwOx)', { so: .5 }) + pvdR(362, SY, 28, 54, 'url(#iwOx)', { so: .5 }) + ioTxt(44, SY + 70, 'STI', 'font-size:9px;opacity:.8', 'middle') + ioTxt(376, SY + 70, 'STI', 'font-size:9px;opacity:.8', 'middle');
          // 문턱 전압 조절
          o += pvdG(f, ['v'], pvdR(164, SY, 92, 14, 'rgba(251,191,36,.45)', { so: .8, dash: '3 2' }) + ioBold(210, SY + 28, 'Vt 조절 (얕게)', 'middle', '#b45309'));
          // 할로
          o += pvdG(f, ['h'], [150, 270].map(cx => `<ellipse cx="${cx}" cy="${SY + 30}" rx="30" ry="22" fill="rgba(52,211,153,.35)" stroke="#059669" stroke-opacity=".8"/>`).join('') + ioTxt(96, SY + 48, '할로', 'font-weight:800;fill:#047857;opacity:1', 'middle') + ioTxt(326, SY + 48, '할로', 'font-weight:800;fill:#047857;opacity:1', 'middle'));
          // 익스텐션
          o += pvdG(f, ['e'], pvdR(138, SY, 30, 14, 'rgba(251,113,133,.7)', { so: .9 }) + pvdR(252, SY, 30, 14, 'rgba(251,113,133,.7)', { so: .9 }) + ioTxt(110, SY - 6, '익스텐션', 'font-weight:800;fill:#be123c;opacity:1', 'middle') + ioTxt(310, SY - 6, '익스텐션', 'font-weight:800;fill:#be123c;opacity:1', 'middle'));
          // 소스/드레인
          o += pvdG(f, ['s'], pvdR(58, SY, 90, 40, 'rgba(244,63,94,.5)', { so: .9 }) + pvdR(272, SY, 90, 40, 'rgba(244,63,94,.5)', { so: .9 }) + ioBold(103, SY + 28, '소스 n⁺', 'middle', '#9f1239') + ioBold(317, SY + 28, '드레인 n⁺', 'middle', '#9f1239'));
          // 게이트 + 스페이서
          o += pvdR(164, SY - 24, 92, 20, '#64748b', { so: .8 }) + pvdR(164, SY - 4, 92, 4, '#7dd3fc', { so: .01 }) + pvdR(154, SY - 24, 10, 24, 'rgba(148,163,184,.5)', { so: .6 }) + pvdR(256, SY - 24, 10, 24, 'rgba(148,163,184,.5)', { so: .6 }) + ioTxt(210, SY - 10, '게이트', 'font-size:9.5px;font-weight:800;fill:#fff;opacity:1', 'middle');
          // 표면
          o += pvdL(`M30 ${SY} H390`, { so: .6, sw: 1.4 });
          // 요약
          o += ioTxt(210, 280, '박는 순서는 공정에 따라 다르다. 깊은 것에서 얕은 것으로 가는 경우가 많다', 'font-size:9px;opacity:.75', 'middle');
          return dgSvg('트랜지스터 속 이온 주입: ' + s.label, o, '0 76 420 216');
        }
      },
    });

    // ===== 장비 심화 이론용 그림: 식각 장비(ccp-icp·etch-knobs·etch-endpoint·etch-lag) / 노광 스캐너(scan-* · immersion-na · illum-pupil · bossung · overlay-error) =====
    // 수치는 원리를 이해하기 위한 교육용 근사다. 그림 id 는 scripts/diagram_rules.py 의 DIAGRAMS 에도 적는다.
    Object.assign(DIAGRAMS, {
      // ===== 장비 사용 가이드 첫머리용: 장비 전체 구조도 (부품 이름을 그림에 직접 적고, 누르면 그 계통만 강조) =====
      'ccp-icp': {
        title: '식각 챔버: CCP와 ICP',
        states: [
          { id: 'ccp', label: 'CCP (축전 결합)',
            desc: 'CCP는 마주 보는 두 전극 사이에 RF 전압을 걸어 플라즈마를 만든다. 구조가 단순하고 플라즈마가 넓고 고르게 퍼지며, 이온이 쉬스(전극 앞의 전압 강하 구간)에서 큰 에너지를 얻는다. 그래서 단단한 산화막·질화막을 깎는 유전체 식각에 많이 쓴다. 최신 장비는 고주파(HF, 밀도 담당)와 저주파(LF, 이온 에너지 담당)를 함께 걸어 두 가지를 어느 정도 나눠 조절한다.' },
          { id: 'icp', label: 'ICP (유도 결합)',
            desc: 'ICP는 챔버 위 유전체 창 바깥에 코일을 놓고 RF 전류를 흘린다. 코일이 만드는 변하는 자기장이 챔버 안에 고리 모양 유도 전류를 일으켜 전자를 가속하고, 낮은 압력에서도 아주 높은 밀도의 플라즈마가 만들어진다. 웨이퍼 쪽 전극에는 따로 바이어스 RF를 걸어 이온 에너지를 조절한다. 실리콘·폴리실리콘·금속처럼 방향성과 속도가 모두 필요한 식각에 많이 쓴다.' },
          { id: 'split', label: '파워가 하는 일',
            desc: 'CCP는 파워 하나를 올리면 이온 수와 이온 에너지가 함께 변해서 둘을 따로 맞추기 어렵다. ICP는 소스 파워가 이온 수(플라즈마 밀도)를, 바이어스 파워가 이온 에너지를 주로 정한다. 이처럼 밀도와 에너지를 독립적으로 조절할 수 있다는 점이 ICP의 가장 큰 장점이고, 레시피에서 소스 파워와 바이어스 파워를 따로 적는 이유다.' },
        ],
        svg(s) {
          if (s.id === 'split') {
            const grp = (cx, label, d, e, note) => {
              const bar = (x, h, c) => `<rect x="${x}" y="${210 - 45}" width="34" height="45" style="fill:none;stroke:${c};stroke-dasharray:3 3"/><rect x="${x}" y="${210 - h}" width="34" height="${h}" style="fill:${c};fill-opacity:.55"/>`;
              return bar(cx - 40, d, '#60a5fa') + bar(cx + 6, e, '#f59e0b') + dgT(cx, 232, label, 'dg-t') + dgT(cx, 249, note, 'dg-sub');
            };
            return dgSvg('식각 챔버: ' + s.label, `
              <rect x="30" y="22" width="10" height="10" style="fill:#60a5fa;fill-opacity:.55"/>${dgT(46, 31, '이온 수 (플라즈마 밀도 → 식각 속도)', 'dg-sub', 'start')}
              <rect x="30" y="40" width="10" height="10" style="fill:#f59e0b;fill-opacity:.55"/>${dgT(46, 49, '이온 에너지 (방향성 · 충돌 세기)', 'dg-sub', 'start')}
              <rect x="30" y="58" width="10" height="10" style="fill:none;stroke:currentColor;stroke-dasharray:3 3;opacity:.6"/>${dgT(46, 67, '파워를 올리기 전', 'dg-sub', 'start')}
              <path class="dg-line" d="M20 210 H380" style="stroke-width:1.4"/>
              ${grp(72, 'CCP 파워 ↑', 98, 98, '둘 다 함께 변함')}${grp(200, 'ICP 소스 ↑', 112, 46, '이온 수만 ↑')}${grp(328, 'ICP 바이어스 ↑', 46, 112, '이온 에너지만 ↑')}`, '0 0 400 262');
          }
          const icp = s.id === 'icp';
          const rf = (y, t, x0) => `<path class="dg-line" d="M${x0} ${y} H262" style="stroke-width:1.6"/><circle class="dg-line" cx="274" cy="${y}" r="10" style="stroke-width:1.6"/><path class="dg-line" d="M268 ${y} q3 -7 6 0 t6 0" style="stroke-width:1.4"/>${dgT(290, y + 4, t, 'dg-sub', 'start')}`;
          const P = [[78, 106, 0], [104, 132, 1], [132, 102, 2], [160, 130, 0], [186, 108, 1], [92, 156, 2], [124, 152, 0], [152, 164, 1], [178, 152, 2], [196, 130, 0]];
          const dots = P.map(([x, y, k]) => k === 0 ? `<circle cx="${x}" cy="${y}" r="4.5" fill="none" stroke="#f87171" stroke-width="2"/>` : k === 1 ? `<circle cx="${x}" cy="${y}" r="3" fill="#60a5fa"/>` : `<circle cx="${x}" cy="${y}" r="4.5" fill="#f59e0b"/>`).join('');
          const legend = [['#f87171', '양이온', 1], ['#60a5fa', '전자', 0], ['#f59e0b', '라디칼', 0]].map(([c, t, ring], i) => `<circle cx="274" cy="${150 + i * 20}" r="4.5" ${ring ? `fill="none" stroke="${c}" stroke-width="2"` : `fill="${c}"`}/>${dgT(286, 154 + i * 20, t, 'dg-sub', 'start')}`).join('');
          return dgSvg('식각 챔버: ' + s.label, `
            <rect class="dg-line" x="40" y="52" width="182" height="200" rx="8" style="stroke-width:1.8"/>
            ${dgArrow(8, 90, 38, 90)}${dgT(8, 80, '가스', 'dg-sub', 'start')}
            <rect class="dg-deplf" x="56" y="72" width="150" height="122" rx="12"/><path class="dg-depl" d="M56 82 H206 M56 186 H206"/>
            ${dots}
            ${[96, 131, 166].map(x => dgArrow(x, 176, x, 196)).join('')}
            ${dgR(70, 192, 196, 6, 'dg-si')}${dgR(56, 206, 202, 20, 'dg-fsub')}${dgT(131, 242, '웨이퍼 · 정전척', 'dg-sub')}
            ${dgArrow(131, 252, 131, 274)}${dgT(131, 290, '진공 펌프로 배기', 'dg-sub')}
            ${icp
              ? `${dgR(40, 222, 52, 8, 'dg-ox')}<path class="dg-line" d="M70 36 q8 -16 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0" style="stroke:#f59e0b;stroke-width:2.4"/>
                 <ellipse class="dg-depl" cx="131" cy="86" rx="66" ry="7"/>${dgT(236, 90, '유도 전류', 'dg-sub', 'start')}
                 ${rf(36, '소스 13.56 MHz', 182)}${rf(212, '바이어스 RF', 206)}${dgT(131, 24, 'RF 코일 + 유전체 창', 'dg-sub')}`
              : `${dgR(56, 206, 62, 8, 'dg-mask')}${[70, 90, 110, 130, 150, 170, 190].map(x => `<circle cx="${x}" cy="66" r="1.4" fill="var(--tbl-bg)"/>`).join('')}${dgT(131, 46, '상부 전극 (샤워헤드)', 'dg-sub')}
                 ${rf(66, 'HF 27~60 MHz', 206)}${rf(212, 'LF 2 MHz', 206)}`}
            ${legend}`, '0 0 400 296');
        }
      },
      'etch-knobs': {
        title: '레시피 노브가 바꾸는 것',
        states: [
          { id: 'base', label: '기준', v: [0, 0, 0], d: 36, t: 3, b: 0, mh: 8, q: '기준 레시피: 수직에 가까운 단면',
            desc: '기준 레시피에서는 이온 수, 이온 에너지, 라디칼 양이 균형을 이루어 마스크 모양대로 거의 수직으로 깎인다. 아래 버튼으로 노브를 하나씩 바꿔 보며 세 가지 양이 어떻게 움직이고 단면이 어떻게 달라지는지 보자.' },
          { id: 'press', label: '압력 ↑', v: [-1, -1, 1], d: 26, t: 0, b: 7, mh: 8, q: '방향성이 떨어져 옆으로 퍼짐 (보잉·언더컷 경향)',
            desc: '압력을 올리면 가스 분자가 많아져 이온이 웨이퍼에 닿기 전에 더 자주 충돌한다. 이온은 에너지를 잃고 방향도 흩어지며, 라디칼은 늘어난다. 수직으로 때리는 힘이 약해지고 화학적 식각이 커져서 속도는 느려지고 옆으로 파먹는 경향이 생긴다.' },
          { id: 'src', label: '소스 파워 ↑', v: [1, 0, 1], d: 50, t: 3, b: 0, mh: 7, q: '식각 속도 ↑ · 단면 모양은 거의 유지',
            desc: 'ICP에서 소스 파워를 올리면 플라즈마가 더 많이 만들어져 이온 수와 라디칼이 함께 늘어난다. 이온 한 개의 에너지는 그대로라서 같은 시간에 더 깊이 파지지만 마스크와의 선택비 변화는 상대적으로 작다. 다만 라디칼이 늘면 화학적 식각 성분도 커진다.' },
          { id: 'bias', label: '바이어스 ↑', v: [0, 1, 0], d: 46, t: 0, b: 0, mh: 2, q: '수직성 ↑ · 마스크도 빨리 닳음 (선택비 ↓)',
            desc: '바이어스 파워는 쉬스 전압을 키워 이온 에너지를 높인다. 이온이 세게 수직으로 때려 물리적 식각과 방향성은 좋아지지만, 마스크와 아래 막까지 같이 깎여 선택비가 떨어지고 격자 손상·충전 손상 위험도 커진다.' },
          { id: 'poly', label: '폴리머 가스 ↑', v: [0, 0, -1], d: 28, t: 12, b: 0, mh: 9, q: '선택비 ↑ · 대신 경사진 단면, 식각 멈춤 위험',
            desc: 'CHF₃나 C₄F₈처럼 탄소가 많은 가스 비율을 올리면 표면에 보호 폴리머가 두껍게 쌓인다. 마스크와 아래 막은 잘 보호되어 선택비가 좋아지지만, 바닥에도 폴리머가 쌓여 식각이 느려지고 심하면 멈춘다(식각 정지). 옆벽 폴리머가 많으면 홈이 아래로 갈수록 좁아지는 경사 단면이 된다.' },
        ],
        svg(s) {
          const rows = [['이온 수(플럭스)', s.v[0]], ['이온 에너지', s.v[1]], ['라디칼(화학)', s.v[2]]];
          const track = rows.map(([n, v], i) => { const y = 40 + i * 32; return `${dgT(14, y + 4, n, 'dg-t', 'start')}<path class="dg-line" d="M160 ${y} H312" style="stroke-width:1.4;opacity:.5"/><path class="dg-line" d="M236 ${y - 6} V${y + 6}" style="stroke-width:1.4;opacity:.5"/><circle cx="${236 + v * 56}" cy="${y}" r="8" style="fill:var(--hl-accent)"/>${dgT(326, y + 4, v > 0 ? '▲ 증가' : v < 0 ? '▼ 감소' : '≈ 유지', 'dg-volt', 'start')}`; }).join('');
          const top = 178, x0 = 170, x1 = 230, d = s.d;
          const hole = `${x0},${top} ${x0 - s.b},${top + d / 2} ${x0 + s.t},${top + d} ${x1 - s.t},${top + d} ${x1 + s.b},${top + d / 2} ${x1},${top}`;
          return dgSvg('레시피 노브: ' + s.label, `${track}
            ${dgT(200, 152, '── 식각 결과 단면 ──', 'dg-sub')}
            ${dgR(70, 330, top, 62, 'dg-film')}${dgR(70, 330, top + 62, 22, 'dg-fsub')}<polygon class="dg-void" points="${hole}"/>
            ${dgR(70, x0, top - s.mh, s.mh, 'dg-mask')}${dgR(x1, 330, top - s.mh, s.mh, 'dg-mask')}
            ${dgT(74, top - 12, '마스크', 'dg-sub', 'start')}${dgT(326, top + 44, '식각할 막', 'dg-sub', 'end')}
            ${dgT(200, 286, s.q, 'dg-volt')}`, '0 0 400 296');
        }
      },
      'etch-endpoint': {
        title: '종점 검출 (OES)',
        states: [
          { id: 'run', label: '① 식각 중', x: 120, depth: 22, over: 0, q: '부산물 발광이 일정하게 높다',
            desc: '식각할 막이 깎이는 동안 휘발성 부산물이 계속 생기고, 플라즈마 속에서 이 부산물(예: 산화막 식각의 CO)이 특정 파장의 빛을 낸다. 분광기로 이 파장의 세기를 지켜보면 식각이 진행 중임을 알 수 있다.' },
          { id: 'end', label: '② 종점', x: 210, depth: 40, over: 0, q: '막이 다 깎이는 순간 발광이 꺾인다',
            desc: '식각할 막이 다 없어지면 부산물 생성이 줄어 그 파장의 발광이 뚝 떨어진다. 장비는 신호의 기울기나 문턱값을 감시하다가 이 꺾임을 종점으로 판단한다. 반대로 아래 막의 성분이 새로 나타나는 발광이 늘어나는 신호를 쓰기도 한다.' },
          { id: 'over', label: '③ 과식각', x: 290, depth: 40, over: 8, q: '남은 찌꺼기를 지우려 정해 둔 만큼 더 깎는다',
            desc: '막 두께와 식각 속도가 웨이퍼 위치마다 조금씩 달라서, 종점이 보인 순간에도 일부 자리에는 막이 남아 있다. 그래서 종점 뒤에 10~30% 정도 시간을 더 두고 깎는데 이를 과식각(over etch)이라 한다. 이때는 아래 막이 조금 깎이므로 선택비가 중요하다.' },
        ],
        svg(s) {
          let p = '';
          for (let x = 40; x <= 360; x += 4) { const k = 1 / (1 + Math.exp((x - 210) / 5)); const y = 118 - 56 * k + (x < 210 ? 2.2 * Math.sin(x / 4.3) : 1.2 * Math.sin(x / 3.1)); p += `${p ? 'L' : 'M'}${x} ${y.toFixed(1)} `; }
          const cy = 118 - 56 / (1 + Math.exp((s.x - 210) / 5));
          const A = { y: 214, h: 40 };
          return dgSvg('종점 검출: ' + s.label, `
            <path class="dg-line" d="M40 30 V138 H360" style="stroke-width:1.4"/>${dgT(44, 24, '발광 세기 (예: CO 484 nm)', 'dg-sub', 'start')}${dgT(360, 154, '시간 →', 'dg-sub', 'end')}
            <path d="${p}" fill="none" stroke="#34d399" stroke-width="2.4" stroke-linejoin="round"/>
            <path class="dg-depl" d="M210 34 V138"/>${dgT(214, 46, '종점', 'dg-sub', 'start')}
            ${dgT(110, 100, '식각 중', 'dg-sub')}${dgT(322, 98, '막이 사라짐', 'dg-sub')}
            <path class="dg-hlp" d="M${s.x} 34 V138" style="stroke-dasharray:4 3"/><circle cx="${s.x}" cy="${cy.toFixed(1)}" r="5.5" style="fill:var(--hl-accent)"/>
            ${dgR(100, 300, 254, 16, 'dg-si')}${dgR(100, 300, A.y, A.h, 'dg-film')}
            <rect class="dg-void" x="160" y="${A.y}" width="80" height="${s.depth}"/>${s.over ? `<rect class="dg-void" x="160" y="254" width="80" height="${s.over}"/>` : ''}
            ${dgR(100, 160, A.y - 8, 8, 'dg-mask')}${dgR(240, 300, A.y - 8, 8, 'dg-mask')}
            ${dgT(306, 238, '식각할 막', 'dg-sub', 'start')}${dgT(306, 266, '아래 막', 'dg-sub', 'start')}${s.over ? dgT(200, 284, '↑ 아래 막이 조금 깎임', 'dg-sub') : ''}
            ${dgT(200, 304, s.q, 'dg-volt')}`, '0 0 400 312');
        }
      },
      'etch-lag': {
        title: '종횡비 의존 식각 (ARDE)',
        states: [
          { id: 't1', label: '식각 초기', t: 1,
            desc: '식각을 시작한 지 얼마 안 되었을 때는 홈이 얕아서 폭이 다른 홈들도 깊이가 비슷하다. 그러나 이미 좁은 홈이 약간 덜 깎이기 시작한다.' },
          { id: 't2', label: '중간', t: 2,
            desc: '홈이 깊어질수록 종횡비(깊이÷폭)가 커진다. 좁은 홈은 종횡비가 빨리 커져서 바닥까지 이온과 라디칼이 도달하기 어려워지고 식각 속도가 느려진다.' },
          { id: 't3', label: '깊어진 뒤', t: 3,
            desc: '같은 시간 식각해도 넓은 홈은 깊고 좁은 홈은 얕다. 이것이 종횡비 의존 식각(ARDE, RIE lag)이다. 원인은 좁은 입구가 이온 각도 분포를 막는 효과, 바닥으로 들어가는 중성 라디칼과 나오는 부산물의 확산 한계, 홈 안 전하 축적에 의한 이온 휨 등이다. 3D NAND의 깊은 채널 홀에서는 이 문제가 극단적으로 커진다.' },
        ],
        svg(s) {
          const W = [72, 40, 20], C = [92, 200, 310], top = 120, F = 150;
          const dep = W.map(w => w * (Math.sqrt(1 + 80 * s.t / w) - 1));
          const open = W.map((w, i) => [C[i] - w / 2, C[i] + w / 2]);
          return dgSvg('종횡비 의존 식각: ' + s.label, `
            ${dgR(30, 370, top, F, 'dg-film')}
            ${W.map((w, i) => `<rect class="dg-void" x="${open[i][0]}" y="${top}" width="${w}" height="${dep[i].toFixed(1)}"/>${dgT(C[i], top - 20, 'AR ' + (dep[i] / w).toFixed(1), 'dg-volt')}${dgT(C[i], top + F + 18, ['넓은 홈', '중간 홈', '좁은 홈'][i], 'dg-sub')}`).join('')}
            ${dgR(30, open[0][0], top - 8, 8, 'dg-mask')}${dgR(open[0][1], open[1][0], top - 8, 8, 'dg-mask')}${dgR(open[1][1], open[2][0], top - 8, 8, 'dg-mask')}${dgR(open[2][1], 370, top - 8, 8, 'dg-mask')}
            <path class="dg-depl" d="M30 ${(top + dep[0]).toFixed(1)} H370"/>${dgT(366, (top + dep[0] - 6).toFixed(1), '넓은 홈 깊이', 'dg-sub', 'end')}
            ${dgT(200, 30, '같은 시간 식각 후 홈 폭별 깊이', 'dg-sub')}${dgT(200, 52, '→ 폭이 좁을수록 덜 깊다', 'dg-volt')}`, '0 0 400 300');
        }
      },
      'immersion-na': {
        title: '액침: 매질을 바꿔 NA를 키운다',
        states: [
          { id: 'dry', label: '건식 (공기)', n: 1, th: 68, med: '렌즈와 웨이퍼 사이: 공기 (n = 1.0)', q1: 'NA = n · sinθ = 1.0 × sin 68° ≈ 0.93', q2: '→ 하프피치 ≈ 62 nm  (k₁ = 0.3)',
            desc: '렌즈에서 나온 빛이 웨이퍼 한 점에 모일 때의 반각 θ가 클수록 NA가 크다. 그런데 NA는 n·sinθ이고 sinθ는 1을 넘을 수 없다. 사이가 공기(n=1)이면 NA는 1을 넘지 못하며, 실제 건식 ArF 장비는 0.93 정도가 한계다.' },
          { id: 'imm', label: '액침 (물)', n: 1.44, th: 69, med: '렌즈와 웨이퍼 사이: 초순수 (n = 1.44)', q1: 'NA = 1.44 × sin 69° ≈ 1.35', q2: '→ 하프피치 ≈ 43 nm  (k₁ = 0.3)',
            desc: '렌즈 끝과 웨이퍼 사이를 굴절률 1.44(193 nm에서)인 초순수로 채우면 같은 각도에서도 NA가 1.35까지 올라간다. 물 속에서는 파장도 193/1.44 ≈ 134 nm로 짧아진 것과 같다. 노광 중 물은 렌즈와 웨이퍼 사이에 얇은 물막으로 유지되고, 스캔 방향으로 함께 움직이며 계속 공급·회수된다.' },
          { id: 'cmp', label: 'NA와 해상도', q1: 'k₁ = 0.3일 때 단일 노광 최소 하프피치',
            desc: '파장을 줄이고 NA를 키울수록 하프피치가 작아진다. ArF 액침이 단일 노광으로 낼 수 있는 선폭은 대략 40 nm 안팎이 한계라서 더 작은 패턴은 멀티 패터닝으로 만들었다. EUV(13.5 nm)는 단일 노광으로 10 nm대 초반을, High-NA(0.55)는 한 자릿수 nm에 가까운 선폭을 노린다. 단, 파장이 짧아져도 k₁을 줄이는 기술(OPC, 변형 조명 등)은 계속 쓴다.' },
        ],
        svg(s) {
          if (s.id === 'cmp') {
            const rows = [['ArF 건식 (0.93)', 0.3 * 193 / 0.93, '#94a3b8'], ['ArF 액침 (1.35)', 0.3 * 193 / 1.35, '#60a5fa'], ['EUV (0.33)', 0.3 * 13.5 / 0.33, '#f59e0b'], ['High-NA EUV (0.55)', 0.3 * 13.5 / 0.55, '#f472b6']];
            return dgSvg('NA와 해상도', `${dgT(200, 30, s.q1, 'dg-volt')}${rows.map(([n, v, c], i) => { const y = 60 + i * 42; return `${dgT(14, y + 15, n, 'dg-sub', 'start')}<rect x="130" y="${y}" width="${(v * 3.4).toFixed(1)}" height="22" rx="3" style="fill:${c};fill-opacity:.65"/>${dgT(136 + v * 3.4, y + 16, v.toFixed(v < 10 ? 1 : 0) + ' nm', 'dg-t', 'start')}`; }).join('')}
              ${dgT(200, 244, '※ λ·NA만 바꾼 단순 계산 (R = k₁ · λ / NA)', 'dg-sub')}`, '0 0 400 256');
          }
          const th = s.th * Math.PI / 180, ly = 102, fy = 150, fx = 200, dx = (fy - ly) * Math.tan(th);
          const rays = [-1, -.62, .62, 1].map(k => `<path d="M${(fx + k * dx).toFixed(1)} ${ly} L${fx} ${fy}" fill="none" stroke="#fbbf24" stroke-width="1.8"/>`).join('');
          return dgSvg('액침: ' + s.label, `
            <rect x="50" y="${ly}" width="300" height="${fy - ly}" style="fill:#38bdf8;fill-opacity:${s.n > 1 ? .28 : 0}"/>
            <path class="dg-hk dg-line" d="M${(fx - dx).toFixed(1)} ${ly} Q${fx} ${ly - 86} ${(fx + dx).toFixed(1)} ${ly} Z" style="stroke-width:1.6"/>${dgT(fx, 84, '투영 렌즈', 'dg-sub')}
            ${rays}<path class="dg-depl" d="M${fx} ${ly} V${fy}"/>
            <path d="M${fx} ${fy - 28} A28 28 0 0 1 ${(fx + 28 * Math.sin(th)).toFixed(1)} ${(fy - 28 * Math.cos(th)).toFixed(1)}" fill="none" stroke="var(--hl-accent)" stroke-width="2"/>${dgT(fx + 12, fy - 34, 'θ', 'dg-volt', 'start')}
            ${dgR(50, 350, fy, 6, 'dg-pr')}${dgR(50, 350, fy + 6, 22, 'dg-fsub')}${dgT(340, fy + 22, '웨이퍼', 'dg-sub', 'end')}
            ${dgT(200, 212, s.med, 'dg-sub')}${dgT(200, 236, s.q1, 'dg-volt')}${dgT(200, 256, s.q2, 'dg-volt')}`, '0 0 400 268');
        }
      },
      'illum-pupil': {
        title: '조명 모양과 회절광 포착',
        states: [
          { id: 'conv', label: '기본 조명', pts: [[0, 0], [.25, 0], [-.25, 0], [0, .25], [0, -.25]],
            desc: '렌즈가 이미지를 만들려면 0차광과 함께 최소 한쪽 1차 회절광을 모아야 한다. 조명이 렌즈 축 위에서 오면 1차광이 피치가 작을수록 멀리 벌어져 렌즈 입구(NA 원) 밖으로 나간다. 이 피치에서는 빛을 거의 못 모아서 패턴이 흐려진다.' },
          { id: 'ann', label: '고리형', pts: 'ring',
            desc: '고리형 조명은 빛이 비스듬히 입사하므로 0차광의 위치가 바깥으로 이동하고 한쪽 1차광이 입구 안으로 들어온다. 고리 중 격자 방향에 알맞은 부분만 기여하지만 방향에 상관없이 고르게 개선되어 여러 방향이 섞인 패턴에 쓴다.' },
          { id: 'dip', label: '쌍극(Dipole)', pts: 'dip',
            desc: '쌍극 조명은 격자 방향에 맞춰 두 점에서만 비스듬히 비춘다. 0차광과 한쪽 1차광이 입구 안에 대칭으로 들어와 같은 NA로 거의 절반 피치까지 해상할 수 있다(이론상 k₁ = 0.25). 한 방향 선에는 최고지만 직각 방향 선은 해상이 안 되므로 마스크를 두 번 나누어 쓰는 등 방향별 대응이 필요하다.' },
          { id: 'quad', label: '4극 (Quasar)', pts: 'quad',
            desc: '4극 조명은 대각선 네 점에서 빛을 비춰 가로·세로 선을 모두 어느 정도 개선한다. 쌍극보다 한 방향의 이득은 작지만 격자 모양 메모리 셀 패턴처럼 가로와 세로가 함께 있는 패턴에 쓴다.' },
        ],
        svg(s) {
          const k = 1.3, R = 78, cx = 190, cy = 138;
          const ring = Array.from({ length: 12 }, (_, i) => [.75 * Math.cos(i * Math.PI / 6), .75 * Math.sin(i * Math.PI / 6)]);
          const pole = (a, b) => [[a, b], [a + .07, b], [a - .07, b], [a, b + .07], [a, b - .07]];
          const pts = s.pts === 'ring' ? ring : s.pts === 'dip' ? [...pole(.72, 0), ...pole(-.72, 0)] : s.pts === 'quad' ? [...pole(.55, .55), ...pole(-.55, .55), ...pole(.55, -.55), ...pole(-.55, -.55)] : s.pts;
          const inn = (x, y) => x * x + y * y <= 1, P = (x, y) => [cx + x * R, cy + y * R];
          const ok = pts.filter(([x, y]) => inn(x + k, y) || inn(x - k, y)).length, pct = Math.round(ok / pts.length * 100);
          const dots = pts.map(([x, y]) => {
            const z = P(x, y), a = P(x + k, y), b = P(x - k, y);
            const f = (q, i) => i ? `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="3.4" fill="#60a5fa" fill-opacity=".9"/>` : `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="3" fill="none" stroke="#60a5fa" stroke-opacity=".35" stroke-dasharray="2 2"/>`;
            return f(a, inn(x + k, y)) + f(b, inn(x - k, y)) + `<circle cx="${z[0].toFixed(1)}" cy="${z[1].toFixed(1)}" r="3.4" fill="#f59e0b"/>`;
          }).join('');
          return dgSvg('조명 모양: ' + s.label, `
            <circle cx="${cx - 150}" cy="20" r="4" fill="#f59e0b"/>${dgT(cx - 142, 24, '0차광', 'dg-sub', 'start')}<circle cx="${cx - 90}" cy="20" r="4" fill="#60a5fa"/>${dgT(cx - 82, 24, '1차광 (포착)', 'dg-sub', 'start')}<circle cx="${cx + 20}" cy="20" r="3.4" fill="none" stroke="#60a5fa" stroke-opacity=".5" stroke-dasharray="2 2"/>${dgT(cx + 28, 24, '1차광 (놓침)', 'dg-sub', 'start')}
            <circle class="dg-line" cx="${cx}" cy="${cy}" r="${R}" style="stroke-width:1.8;fill:currentColor;fill-opacity:.06"/><path class="dg-depl" d="M${cx - R - 8} ${cy} H${cx + R + 8} M${cx} ${cy - R - 8} V${cy + R + 8}"/>
            ${dots}
            ${dgT(cx, cy + R + 20, 'NA 원: 렌즈가 모을 수 있는 범위', 'dg-sub')}
            ${dgT(cx, cy + R + 44, `이미지 형성에 기여하는 조명: ${pct}%`, 'dg-volt')}`, '0 0 400 262');
        }
      },
      'bossung': {
        title: '초점·노광량 공정 창',
        states: [
          { id: 'curve', label: '① Bossung 곡선', m: 0,
            desc: '초점을 바꿔 가며 선폭(CD)을 재면 위로 휘는 포물선 모양 곡선이 나온다. 노광량이 다르면 곡선 전체가 위아래로 이동한다. 이 곡선 묶음을 Bossung 곡선이라 하고, 장비에서 초점·노광량을 칸마다 바꿔 찍는 FEM(Focus-Exposure Matrix) 웨이퍼를 측정해 얻는다.' },
          { id: 'win', label: '② 공정 창', m: 1,
            desc: '목표 선폭 ±10% 안에 세 곡선이 모두 들어오는 초점 범위가 공정 창이다. 노광량이 ±6% 흔들려도 괜찮으려면 초점은 ±45 nm 안에 있어야 한다. 노광량을 한 가지로 고정하면 ±70 nm까지 허용되지만, 현장에서는 노광량도 흔들리므로 보수적인 창을 쓴다.' },
          { id: 'trade', label: '③ 여유의 맞바꿈', m: 2,
            desc: '노광량 여유(EL)를 많이 확보하려 할수록 허용되는 초점 범위(DOF)는 줄어든다. 두 값의 관계 곡선 안쪽이 쓸 수 있는 공정 창이다. 해상도를 높이려 NA를 키우면 이 곡선 전체가 안쪽으로 줄어들기 때문에, 미세 공정일수록 초점과 노광량 관리가 어려워진다.' },
        ],
        svg(s) {
          if (s.m === 2) {
            let c = 'M50 200';
            for (let e = 0; e <= 10; e += .25) { const dof = 200 * Math.sqrt(Math.max(0, .5 - .05 * e)), x = 50 + dof * 2, y = 200 - e * 15; c += ` L${x.toFixed(1)} ${y}`; }
            return dgSvg('공정 창: ' + s.label, `
              <path class="dg-line" d="M50 40 V200 H350" style="stroke-width:1.4"/>${dgT(46, 36, '노광량 여유 EL (±%)', 'dg-sub', 'start')}${dgT(350, 234, '초점 심도 DOF (nm) →', 'dg-sub', 'end')}
              <path d="${c} L50 50 Z" style="fill:var(--hl-accent);fill-opacity:.15"/><path d="${c}" fill="none" stroke="var(--hl-accent)" stroke-width="2.6"/>
              ${[0, 5, 10].map(e => dgT(42, 204 - e * 15, e, 'dg-sub', 'end')).join('')}${[0, 50, 100, 140].map(d => dgT(50 + d * 2, 216, d, 'dg-sub')).join('')}
              <path class="dg-depl" d="M50 110 H${50 + 89 * 2} V200"/><circle cx="${50 + 89 * 2}" cy="110" r="5.5" style="fill:var(--hl-accent)"/>
              ${dgT(240, 92, 'EL ±6%이면 DOF ≈ 90 nm', 'dg-volt', 'start')}${dgT(60, 254, '곡선 안쪽 = 쓸 수 있는 공정 창', 'dg-sub', 'start')}`, '0 0 400 262');
          }
          const X = f => 200 + f * 1.4, Y = cd => 130 - (cd - 45) * 8;
          const cv = (base, col) => { let d = ''; for (let f = -100; f <= 100; f += 5) d += `${d ? 'L' : 'M'}${X(f).toFixed(1)} ${Y(base + 9 * (f / 100) ** 2).toFixed(1)} `; return `<path d="${d}" fill="none" stroke="${col}" stroke-width="2.4"/>`; };
          const w = 44.7 * 1.4;
          return dgSvg('공정 창: ' + s.label, `
            <rect x="50" y="${Y(49.5)}" width="300" height="${Y(40.5) - Y(49.5)}" style="fill:#34d399;fill-opacity:.14"/>${dgT(346, Y(40.5) - 6, '목표 선폭 ±10%', 'dg-sub', 'end')}
            ${s.m ? `<rect x="${200 - w}" y="${Y(49.5)}" width="${2 * w}" height="${Y(40.5) - Y(49.5)}" style="fill:var(--hl-accent);fill-opacity:.28"/><path class="dg-hlp" d="M${200 - w} 172 V180 M${200 - w} 176 H${200 + w} M${200 + w} 172 V180"/>${dgT(200, 196, '공정 창: 초점 ±45 nm', 'dg-volt')}` : ''}
            <path class="dg-line" d="M50 ${Y(36)} H350 M50 30 V${Y(36)}" style="stroke-width:1.4"/>${dgT(46, 26, '선폭 CD', 'dg-sub', 'start')}${dgT(350, Y(36) + 34, '초점 (nm) →', 'dg-sub', 'end')}
            ${[-100, 0, 100].map(f => dgT(X(f), Y(36) + 16, f > 0 ? '+' + f : f, 'dg-sub')).join('')}
            ${cv(47.7, '#f87171')}${cv(45, '#34d399')}${cv(42.3, '#60a5fa')}
            ${dgT(200, 14, '곡선 3개 = 노광량 −6% / 기준 / +6%', 'dg-sub')}${dgT(346, Y(56.7) + 4, '−6%', 'dg-sub', 'start')}${dgT(346, Y(54) + 4, '기준', 'dg-sub', 'start')}${dgT(346, Y(51.3) + 4, '+6%', 'dg-sub', 'start')}`, '0 0 400 262');
        }
      },
      'overlay-error': {
        title: '오버레이 오차의 종류',
        states: [
          { id: 'shift', label: '이동', f: () => [12, -6], q1: '이동 (Shift): 모든 점이 같은 방향으로 밀림', q2: '정렬 마크를 읽어 스캐너가 층마다 보정',
            desc: '아래 층 패턴 전체가 한쪽으로 같이 밀린 오차다. 웨이퍼를 스테이지에 올릴 때의 위치 오차에서 주로 생기며 정렬 마크를 읽어 가장 쉽게 보정된다. 화살표는 이해를 돕기 위해 크게 그린 것이고 실제 오차는 수 nm 수준이다.' },
          { id: 'rot', label: '회전', f: (u, v) => [-14 * v, 14 * u], q1: '회전 (Rotation): 중심을 기준으로 돌아간 오차', q2: '정렬 마크 두 곳 이상으로 각도를 계산해 보정',
            desc: '웨이퍼나 샷이 약간 돌아가 있으면 중심에서 멀수록 어긋남이 커진다. 정렬 마크를 여러 곳에서 읽어 각도를 계산하고 스테이지로 보정한다.' },
          { id: 'mag', label: '배율', f: (u, v) => [13 * u, 13 * v], q1: '배율 (Magnification): 중심에서 거리에 비례해 어긋남', q2: '열팽창·박막 응력 때문 → 렌즈 배율 조정으로 보정',
            desc: '공정 중 열이나 막 응력으로 웨이퍼가 아주 조금 늘거나 줄면, 중심에서 멀수록 어긋남이 커진다. 스캐너가 정렬 마크로 이를 알아내고 투영 배율을 미세 조정해 맞춘다.' },
          { id: 'high', label: '고차 (비선형)', f: (u, v) => { const r2 = u * u + v * v; return [22 * u * r2, 22 * v * r2]; }, q1: '고차 (비선형): 가장자리에서 급격히 커짐', q2: '웨이퍼 휨·막 응력·렌즈 열 수차 → 보정이 어렵다',
            desc: '웨이퍼 가장자리가 휘거나 막 응력이 불균일하면 어긋남이 중심부는 작고 가장자리에서 급격히 커지는 비선형 오차가 생긴다. 단순한 선형 보정으로는 잡히지 않아 고차 보정 모델, 렌즈 조절 장치, 웨이퍼별 보정 등을 쓰며, 미세 공정에서 오버레이 오차의 큰 부분을 차지한다.' },
        ],
        svg(s) {
          let g = '';
          for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
            const x = 200 + i * 38, y = 112 + j * 38, [dx, dy] = s.f(i / 2, j / 2);
            g += `<path class="dg-line" d="M${x - 3} ${y} h6 M${x} ${y - 3} v6" style="stroke-width:1;opacity:.45"/>`;
            if (Math.hypot(dx, dy) > 4) g += dgArrow(x, y, x + dx, y + dy, 'dg-line dg-hl');
          }
          return dgSvg('오버레이 오차: ' + s.label, `
            <rect class="dg-line" x="94" y="6" width="212" height="212" rx="4" style="stroke-width:1.2;stroke-dasharray:4 4;opacity:.45"/>
            ${g}${dgT(200, 244, s.q1, 'dg-volt')}${dgT(200, 264, s.q2, 'dg-sub')}`, '0 0 400 274');
        }
      }
    });
    function dgRender(fig, sid) {
      const D = DIAGRAMS[fig.dataset.dg]; if (!D) return;
      const s = D.states.find(x => x.id === sid) || D.states[0];
      fig.querySelector('.dg-svg').innerHTML = D.svg(s);
      fig.querySelector('.dg-desc').textContent = s.desc;
      const di = D.states.indexOf(s); fig.querySelectorAll('.dg-dots i').forEach((d, k) => d.classList.toggle('on', k === di));
      fig.querySelectorAll('[data-dg-state]').forEach(b => { const on = b.dataset.dgState === s.id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    }
    function swAnim(el, d) { if (!el) return; el.classList.remove('sw-l', 'sw-r'); void el.offsetWidth; el.classList.add(d > 0 ? 'sw-l' : 'sw-r'); }
    function dgStep(fig, d) {
      const D = DIAGRAMS[fig.dataset.dg], on = fig.querySelector('.dg-btn.on'); if (!D || D.states.length < 2) return;
      const i = Math.max(0, D.states.findIndex(x => on && x.id === on.dataset.dgState));
      dgRender(fig, D.states[(i + d + D.states.length) % D.states.length].id); swAnim(fig.querySelector('.dg-svg'), d);
    }
    function fjSwipe(d) { const before = fjIdx; fjStep(d); if (fjIdx !== before) swAnim(fjEl('fjSvg'), d); }
    // 폰에서 그림·여정을 좌우로 밀어서 넘긴다 (세로 스크롤은 그대로)
    (function () {
      let sx = 0, sy = 0, tgt = null;
      document.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) { tgt = null; return; }
        tgt = (e.target.closest && e.target.closest('figure.dg .dg-svg, figure.dg .dg-desc, .fj-canvas')) || null; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      }, { passive: true });
      document.addEventListener('touchend', (e) => {
        if (!tgt) return; const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy, el = tgt; tgt = null;
        if (Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
        const d = dx < 0 ? 1 : -1;
        if (el.closest('.fj-canvas')) fjSwipe(d); else { const fig = el.closest('figure.dg'); if (fig) dgStep(fig, d); }
      }, { passive: true });
    })();
    function hydrateDiagrams(root) {
      (root || document).querySelectorAll('figure.dg[data-dg]').forEach(fig => {
        const D = DIAGRAMS[fig.dataset.dg]; if (!D) { fig.remove(); return; }
        if (fig.dataset.ready) return; fig.dataset.ready = '1';
        if (D.wide) fig.classList.add('dg-wide');
        const cap = fig.dataset.cap || '';
        fig.innerHTML = `<div class="dg-head"><span class="dg-tag">눌러 보는 그림</span><span class="dg-title">${escH(D.title)}</span></div>
          <div class="dg-tabs" role="group" aria-label="상태 선택">${D.states.map(s => `<button type="button" class="dg-btn" data-dg-state="${s.id}">${escH(s.label)}</button>`).join('')}</div>
          <div class="dg-svg"></div>${D.states.length > 1 ? `<div class="dg-dots" aria-hidden="true">${D.states.map(() => '<i></i>').join('')}</div><p class="dg-hint">← 밀어서 넘겨 보세요 →</p>` : ''}<p class="dg-desc" aria-live="polite"></p>${cap ? `<figcaption>${escH(cap)}</figcaption>` : ''}`;
        dgRender(fig, D.states[0].id);
      });
    }
    document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-dg-state]'); if (!b) return; const fig = b.closest('figure.dg'); if (fig) dgRender(fig, b.dataset.dgState); });

    const ADV_CASE_RE = /^[ \t]*\{\{\s*case:([^|}\n]+)\|([^|}\n]+)\|([^|}\n]+)\|([^|}\n]+)\|([^}\n]+)\}\}[ \t]*$/gm;
    // 심화 글: 절을 접고 펴는 묶음으로 만들고(폰에서는 첫 절만 펴 둠), 맨 위에 번호 칩 목차를 둔다 (누르면 그 절을 펴서 이동)
    function advIndex(card) {
      try {
        const body = card.querySelector('.adv-body'); if (!body) return;
        const hs = [...body.querySelectorAll(':scope > .custom-badge-heading')]; if (hs.length < 3) return;
        const wide = window.matchMedia('(min-width: 768px)').matches, secs = [];
        body.querySelectorAll('li').forEach(li => { if (li.textContent.trim().startsWith('☐')) li.classList.add('adv-chk'); });   // 체크리스트 항목은 불릿 대신 ☐ 만 보이게
        const titles = hs.map(h => h.querySelector('.custom-badge')?.textContent || '');
        // 폰: 기초 이론 글처럼 접지 않고 쭉 펼쳐 둔다(목차 칩은 해당 절로 이동만)
        if (!wide) hs.forEach(h => secs.push(h)); else
        hs.forEach((h, i) => {
          const d = document.createElement('details'), sm = document.createElement('summary'), bd = document.createElement('div');
          d.className = 'adv-sec'; d.open = wide || i === 0; sm.className = h.className; sm.innerHTML = h.innerHTML; bd.className = 'adv-sec-body';
          body.insertBefore(d, h);
          for (let n = h.nextSibling; n && n !== hs[i + 1];) { const nx = n.nextSibling; bd.appendChild(n); n = nx; }
          h.remove(); d.append(sm, bd); secs.push(d);
        });
        body.querySelectorAll('details.adv-case').forEach(d => { d.open = true; if (!wide) d.classList.add('adv-flat'); });
        const nav = document.createElement('nav'); nav.className = 'adv-index'; nav.setAttribute('aria-label', '이 글의 목차');
        secs.forEach((d, i) => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<i>${String(i + 1).padStart(2, '0')}</i>${escH(titles[i])}`; b.onclick = () => { if (wide) d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; nav.appendChild(b); });
        card.insertBefore(nav, card.querySelector('.adv-bodywrap'));
      } catch (e) {}
    }
    function renderDetailDOM(theoryId) {
      const t0 = allTheories.find(x => x.id === theoryId); let t = t0, locked = false;
      if (t0.premium) {   // 유료 글: 공개 데이터에는 개요만 있다. 해금한 계정만 서버에서 본문을 받는다
        if (PRM.cache[t0.id]) t = Object.assign({}, t0, { content: PRM.cache[t0.id] }); else { locked = true; if (PRM.unlocked.has(t0.id)) premiumFetch(t0.id); }
      }
      if (locked && !PRM.unlocked.has(t0.id)) { try { pmGateMaybe(t0.id, 'theory'); } catch (e) {} }   // 들어올 때 해금 팝업
      if (locked) t = Object.assign({}, t0, { content: '' });   // 해금 전에는 본문을 한 줄도 그리지 않는다(제목·분량·잠금 카드만)
      if (!locked) { addPoints(2, theoryId, { k: 'th', cat: t.category, label: t.title, id: theoryId }); pathMarkRead(theoryId); }
      renderBreadcrumb();
      const container = document.getElementById('learningContainer'); container.className = "flex flex-col space-y-4"; container.innerHTML = '';
      const adv = t.category === ADV_CAT;
      const card = document.createElement('div'); card.className = adv ? 'adv-doc' : "bg-white dark:bg-[#0f1729] rounded-2xl shadow-sm border border-slate-200 dark:border-white/10 overflow-hidden";
      const kwAttr = String(t.title).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
      const qN = Math.min(3, matchItems(allQuizData, t.title).length); const iN = Math.min(2, matchItems(allInterviewData, t.title).length);
      const math = stashMath(t.content); let rawMarkdown = math.text;
      // '**용어(영문)**는' 처럼 괄호 뒤에 한글이 바로 붙으면 marked가 굵게 처리를 못 해서 ** 가 그대로 보임 -> 직접 변환
      rawMarkdown = rawMarkdown.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
      rawMarkdown = rawMarkdown.replace(TERM_RE, (m, w, d) => `<button type="button" class="th-term" data-def="${escH(d.trim())}">${escH(w.trim())}</button>`);
      rawMarkdown = rawMarkdown.replace(TOGGLE_RE, (m, ti, body) => `\n\n<details class="th-toggle"><summary>${escH(ti.trim())}</summary><div class="th-tg-body">${safeHtml(marked.parseInline(body.trim()))}</div></details>\n\n`);
      rawMarkdown = rawMarkdown.replace(DG_RE, (m, id, cap) => `\n\n<figure class="dg" data-dg="${id}" data-cap="${escH((cap || '').trim())}"></figure>\n\n`);
      if (adv) {   // 장비 사용 가이드 전용 블록: 상황별 대처(case)
        const adl = (rows) => `<dl>${rows.map(([k, v, a]) => `<dt${a ? ' class="act"' : ''}>${k}</dt><dd${a ? ' class="act"' : ''}>${safeHtml(marked.parseInline(String(v).trim()))}</dd>`).join('')}</dl>`;
        rawMarkdown = rawMarkdown.replace(ADV_CASE_RE, (m, ti, a, b, c, d) => `\n\n<details class="adv-case"><summary class="adv-case-h">${safeHtml(marked.parseInline(ti.trim()))}</summary>${adl([['증상', a], ['원인 후보', b], ['확인 순서', c], ['조치', d, 1]])}</details>\n\n`);
      }
      rawMarkdown = rawMarkdown.replace(/>\s*💡\s*(.*?)(?=\n\n|\n###|$)/gs, (match, p1) => {
        const lb = adv && /^\[([^\]]+)\]\s*([\s\S]*)$/.exec(p1.trim());
        if (!lb) return `<div class="custom-highlight-box">${safeHtml(marked.parseInline(p1.trim()))}</div>\n\n`;
        const kind = /주의|실수/.test(lb[1]) ? 'warn' : /팁/.test(lb[1]) ? 'tip' : 'info';
        return `<div class="custom-highlight-box adv-note adv-note-${kind}"><b class="adv-nl">${escH(lb[1])}</b>${safeHtml(marked.parseInline(lb[2].trim()))}</div>\n\n`;
      });
      rawMarkdown = rawMarkdown.replace(/###\s*\[(.*?)\]\s*(.*)/g, (match, badgeText, titleText) => `<div class="custom-badge-heading"><span class="custom-badge">${adv ? escH(badgeText) : badgeEmoji(badgeText) + ' ' + badgeText}</span>${titleText}</div>`);
      const labK = t.lab && LABS[t.lab] ? t.lab : '';
      if (adv) {
        card.innerHTML = `
          <header class="adv-head">
            <p class="adv-tick"><i></i>ADVANCED · FIELD GUIDE<span class="adv-tick-sub">${escH(t.subject)}</span></p>
            <h2 class="adv-title">${escH(t.title)}</h2>
            <dl class="adv-meta">
              <div><dt>분류</dt><dd>${escH(t.category)} / ${escH(t.subject)}</dd></div>
              <div><dt>대상 장비</dt><dd>${escH(t.equip || '-')}</dd></div>
              <div><dt>읽는 시간</dt><dd>약 ${t0.premium && t0.mins ? t0.mins : Math.max(1, Math.round(String(t.content).length / 650))}분</dd></div>
              <div><dt>연계 체험</dt><dd>${labK ? escH(LABS[labK].title) : '준비 중'}</dd></div>
            </dl>
          </header>
          ${locked ? '' : `<div class="adv-bodywrap"><div class="custom-table-container theory-body adv-body prose prose-slate dark:prose-invert max-w-none">${math.restore(safeHtml(marked.parse(rawMarkdown)))}</div></div>`}
          ${labK ? `<div class="adv-cta"><div><b>직접 다뤄 보고 싶다면</b><p>${escH(LABS[labK].title)}에서 이 글의 내용을 직접 조작해 볼 수 있어요.</p></div><button type="button" onclick="labOpen('${labK}')">${escH(LABS[labK].title)} 열기 →</button></div>` : ''}`;
        container.appendChild(card); hydrateDiagrams(card); advIndex(card); applyMathRendering(); if (locked) container.appendChild(premiumLock(t0.id, 'theory')); return;
      }
      
      card.innerHTML = `
        <div class="p-6 md:p-8">
          <p class="eyebrow mb-2">${escH(t.category)} <span class="opacity-50">/</span> ${escH(t.subject)} <span class="opacity-50">·</span> 약 ${Math.max(1, Math.round(String(t.content).length / 650))}분 읽기</p>
          <h2 class="page-title text-slate-900 dark:text-white mb-3">${escH(t.title)}</h2>
          <div class="flex flex-wrap gap-1.5 mb-6 pb-6 border-b border-slate-100 dark:border-white/10">${(t.tags || []).map(tag => `<span class="bg-indigo-50 dark:bg-white/5 text-indigo-700 dark:text-cyan-300 text-[11px] px-2.5 py-1 rounded-full font-bold">#${escH(tag)}</span>`).join('')}</div>
          <div class="custom-table-container theory-body prose prose-slate dark:prose-invert max-w-none">
            ${math.restore(safeHtml(marked.parse(rawMarkdown)))}
          </div>
        </div>
        <div class="bg-slate-50 dark:bg-[#0f2233] p-6 border-t border-slate-200 dark:border-[#1e3a5f]">
          <p class="text-xs font-bold text-slate-400 dark:text-slate-500 mb-3">📌 배운 내용 점검하기</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button onclick="startMiniQuiz('${kwAttr}')" ${qN ? '' : 'disabled'} class="w-full pbtn font-bold text-sm py-4 rounded-xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              <span class="text-lg">🧩</span> 실전 문제 풀기 <span class="text-xs font-bold opacity-80">${qN ? qN + '문항' : '준비 중'}</span>
            </button>
            <button onclick="startMiniInterview('${kwAttr}')" ${iN ? '' : 'disabled'} class="w-full bg-white dark:bg-[#0a1020] border-2 border-indigo-600 dark:border-[#67e8f9] text-indigo-700 dark:text-[#67e8f9] hover:bg-indigo-50 dark:hover:bg-[#0f2233] font-bold text-sm py-4 rounded-xl ibtn flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              <span class="text-lg">🗣️</span> 실전 면접 대비 <span class="text-xs font-bold opacity-80">${iN ? iN + '문항' : '준비 중'}</span>
            </button>
          </div>
        </div>
      `;
      container.appendChild(card);
      appendTheoryCareers(t, card);
      hydrateDiagrams(card);
      buildMobileToc(card);
      applyMathRendering();
    }
    // 📱 긴 이론을 폰에서 한 번에 훑고 건너뛰도록, 소제목 칩을 맨 위에 둔다 (좁은 화면에서만 보임)
    function buildMobileToc(card) {
      try {
        const body = card.querySelector('.theory-body'); if (!body || card.querySelector('.m-toc')) return;
        const hs = [...body.querySelectorAll('.custom-badge-heading')]; if (hs.length < 3) return;
        const bar = document.createElement('div'); bar.className = 'm-toc'; bar.setAttribute('aria-label', '이 글의 목차');
        hs.forEach((h) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = h.textContent.replace(h.querySelector('.custom-badge')?.textContent || '', '').trim() || '목차'; b.onclick = () => h.scrollIntoView({ behavior: 'smooth', block: 'start' }); bar.appendChild(b); });
        body.parentNode.insertBefore(bar, body);
      } catch (e) {}
    }

    // 이론과 관련된 문제/면접 문항 찾기
    //  1순위: theory_id 로 직접 연결된 문항 (새로 생성되는 문항은 모두 이쪽)
    //  2순위: 예전 문항 — 제목이 포함되거나, 제목이 영문 약어로 시작하면(DRAM, EDS …) 같은 대분류 안에서 약어가 단어로 등장하는 문항
    function matchItems(data, keyword) {
      const k = String(keyword || '').trim();
      if (!k) return [];
      const th = allTheories.find(t => t.title === k);
      const linked = th ? (data || []).filter(x => x.theory_id && x.theory_id === th.id) : [];
      if (linked.length) return linked;
      const low = k.toLowerCase();
      const head = k.split(/\s+/)[0];
      const acro = /^[A-Za-z][A-Za-z0-9\-\/.]*$/.test(head) && head.length >= 2 ? new RegExp('(^|[^a-z0-9])' + head.toLowerCase().replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&') + '([^a-z0-9]|$)') : null;
      return (data || []).filter(x => {
        if (x.theory_id) return false; // 다른 이론에 연결된 문항은 제외
        if ([x.category, x.topic, x.question].some(v => String(v || '').toLowerCase().includes(low))) return true;
        const sameCat = !th || !x.category || x.category === th.category;
        return !!acro && sameCat && [x.topic, x.question].some(v => acro.test(String(v || '').toLowerCase()));
      });
    }
    function startMiniQuiz(keyword) {
      const list = matchItems(allQuizData, keyword);
      if (list.length === 0) return alert("현재 등록된 관련 문제가 없습니다.");
      currentKeyword = keyword;
      filteredSession = list.sort(() => Math.random() - 0.5).slice(0, 3);
      currentIndex = 0; correctCount = 0; sessionLog = []; currentMode = 'quiz'; navTo('view-quiz'); renderQuiz();
    }
    function startMiniInterview(keyword) {
      const list = matchItems(allInterviewData, keyword);
      if (list.length === 0) return alert("현재 등록된 관련 면접 문항이 없습니다.");
      currentKeyword = keyword;
      filteredSession = list.sort(() => Math.random() - 0.5).slice(0, 2);
      currentIndex = 0; correctCount = 0; currentMode = 'interview'; navTo('view-interview'); renderInterview();
    }
    // 결과 화면에서 '다른 유형으로 이어가기' (이론에서 시작했으면 같은 주제로, 아니면 설정 화면으로)
    function continueTo(mode) {
      if (currentKeyword) return mode === 'quiz' ? startMiniQuiz(currentKeyword) : startMiniInterview(currentKeyword);
      openSetup(mode);
    }
    function showResult(mode) {
      clearResume(); navTo('view-result');
      const fromReview = mode === 'quiz' && reviewCtx && reviewCtx.ref === filteredSession; reviewCtx = null;
      const fromPath = mode === 'quiz' && pathQuizCtx && pathQuizCtx.ref === filteredSession; if (fromPath) pathMarkQuiz(pathQuizCtx.ids); pathQuizCtx = null;
      const total = filteredSession.length;
      const gauge = document.getElementById('resultGauge'), actions = document.getElementById('resultActions');
      const other = mode === 'quiz' ? 'interview' : 'quiz';
      const otherData = other === 'interview' ? allInterviewData : allQuizData;
      const otherReady = !currentKeyword || matchItems(otherData, currentKeyword).length > 0;
      const topicLine = currentKeyword ? `주제: ${currentKeyword}` : '';
      const set = (id, text) => { document.getElementById(id).textContent = text; };

      if (mode === 'quiz') {
        const pct = total ? Math.round(correctCount / total * 100) : 0;
        const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#f43f5e';
        const R = 54, C = 2 * Math.PI * R;
        const em = examMeta; examMeta = null;
        set('resultTitle', em ? '모의고사 결과' : fromReview ? '오늘의 복습 완료!' : '문제 풀이 완료!');
        set('resultSub', (topicLine ? topicLine + ' · ' : '') + (pct >= 80 ? '훌륭해요! 🎉' : pct >= 50 ? '좋아요, 조금만 더! 💪' : '복습하고 다시 도전해 봐요 📖'));
        gauge.innerHTML = `<div class="relative w-44 h-44">
          <svg viewBox="0 0 128 128" class="w-full h-full -rotate-90">
            <circle cx="64" cy="64" r="${R}" fill="none" stroke="currentColor" stroke-width="10" class="text-slate-200 dark:text-slate-700"></circle>
            <circle id="gaugeArc" cx="64" cy="64" r="${R}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" style="transition: stroke-dashoffset 0.9s ease-out"></circle>
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <span class="text-xs font-bold text-slate-400 dark:text-slate-500">정답률</span>
            <span class="font-bold text-slate-900 dark:text-white leading-none mt-1"><span class="font-display text-4xl">${pct}</span><span class="text-base text-slate-400 dark:text-slate-500">/100%</span></span>
          </div>
        </div>`;
        if (pct >= 80) setTimeout(confetti, 500);
        requestAnimationFrame(() => requestAnimationFrame(() => { const a = document.getElementById('gaugeArc'); if (a && pct > 0) a.style.strokeDashoffset = C * (1 - pct / 100); }));
        set('scoreDetail', `${total}문제 중 ${correctCount}문제를 맞혔어요.` + (em ? ` (소요 ${fmtTime(em.used)} / 제한 ${fmtTime(em.limit)}${em.blank ? ' · 미응답 ' + em.blank + '개' : ''}${em.auto ? ' · 시간 종료' : ''})` : ''));
      } else {
        set('resultTitle', '면접 연습 완료!');
        set('resultSub', topicLine);
        gauge.innerHTML = `<div class="w-36 h-36 rounded-full bg-rose-50 dark:bg-rose-900/20 border-8 border-rose-200 dark:border-rose-800/40 flex items-center justify-center text-5xl">🗣️</div>`;
        set('scoreDetail', `${total}문항을 연습했어요. 소리 내어 답해 보면 더 좋아요.`);
      }

      if (fromReview) set('resultSub', '맞힌 문제는 간격을 늘려 다시, 틀린 문제는 내일 다시 나와요.');
      if (mode === 'quiz') renderReview(); else document.getElementById('resultReview').classList.add('hidden');
      const wrongN = mode === 'quiz' ? sessionLog.filter(r => r && !r.ok).length : 0;
      const retryBtn = wrongN ? `<button onclick="retryWrong()" class="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-3.5 rounded-xl shadow-md transition">🔁 틀린 ${wrongN}문제만 다시 풀기</button>` : '';
      const nextLabel = other === 'interview' ? '🗣️ 실무 면접 대비로 이어가기' : '📝 실전 문제로 이어가기';
      const pathBtn = fromPath ? `<button onclick="ptOpen()" class="w-full pbtn font-bold py-3.5 rounded-xl shadow-md transition">📚 학습 코스로 돌아가기</button>` : '';
      actions.innerHTML = pathBtn + retryBtn + `
        <button onclick="continueTo('${other}')" ${otherReady ? '' : 'disabled'} class="w-full pbtn font-bold py-3.5 rounded-xl shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed">${nextLabel}${otherReady ? '' : ' (준비 중)'}</button>
        <button onclick="navTo('view-lobby')" class="w-full bg-white dark:bg-[#0a1020] border border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold py-3.5 rounded-xl transition">🏠 홈으로</button>`;
    }

    function renderBreadcrumb() {
      const bc = document.getElementById('breadcrumbContainer'); if (learnState.level === 'home') { bc.classList.add('hidden'); bc.innerHTML = ''; return; } bc.classList.remove('hidden');
      bc.innerHTML = `<button onclick="navTo('view-learning', {level:'home'})" class="text-indigo-700 dark:text-[#67e8f9] font-bold px-2 hover:underline">📚 백과사전</button>`;
      if (learnState.level !== 'home') bc.innerHTML += `<span class="text-indigo-200 dark:text-[#1e3a5f]">❯</span><button onclick="navTo('view-learning', {level:'category', category: '${learnState.category}'})" class="text-slate-600 dark:text-white font-bold px-2 hover:underline">${learnState.category}</button>`;
      if (learnState.level === 'subject' || learnState.level === 'detail') bc.innerHTML += `<span class="text-indigo-200 dark:text-[#1e3a5f]">❯</span><button onclick="navTo('view-learning', {level:'subject', category: '${learnState.category}', subject: '${learnState.subject}'})" class="text-slate-600 dark:text-white font-bold px-2 hover:underline">${learnState.subject}</button>`;
      bc.scrollLeft = bc.scrollWidth;   // 좁은 화면에서 경로가 길면 현재 위치(오른쪽 끝)가 보이게
    }

    function handleTheorySearch() {
      const query = document.getElementById('theorySearchInput').value.trim().toLowerCase();
      if (!query) return applyState('view-learning', learnState);
      document.getElementById('breadcrumbContainer').classList.add('hidden');
      const container = document.getElementById('learningContainer'); container.className = "flex flex-col space-y-3"; container.innerHTML = '';
      const res = allTheories.filter(t => t.title.toLowerCase().includes(query) || pmBody(t).toLowerCase().includes(query));
      if (res.length === 0) container.innerHTML = `<div class="bg-white dark:bg-[#0f1729] p-6 text-center text-slate-400 rounded-xl">검색 결과가 없습니다.</div>`;
      else res.forEach(t => renderTitleCard(t, container));
    }

    // 문항 수 선택지: 문제 5/10/20, 면접 3/5/10 (보유 문항이 적으면 있는 만큼만 출제)
    const COUNT_OPTIONS = { quiz: [5, 10, 20], interview: [3, 5, 10] };
    const COUNT_DEFAULT = { quiz: 10, interview: 5 };
    function openSetup(mode, preExam) {
      currentMode = mode;
      document.getElementById('setupTitle').innerText = mode === 'quiz' ? "문제 풀이 설정" : "면접 연습 설정"; document.getElementById('setupEyebrow').innerText = mode === 'quiz' ? 'PRACTICE' : 'INTERVIEW';
      const sel = document.getElementById('select-count');
      sel.innerHTML = COUNT_OPTIONS[mode].map(n => `<option value="${n}" ${n === COUNT_DEFAULT[mode] ? 'selected' : ''}>${n}개</option>`).join('');
      const ex = document.getElementById('examRow'); document.getElementById('examToggle').checked = !!preExam && mode === 'quiz';
      ex.classList.toggle('hidden', mode !== 'quiz'); ex.classList.toggle('flex', mode === 'quiz');
      document.getElementById('select-subject').value = 'ALL'; setupSubs.clear();
      updateSetupHint();
      navTo('view-setup');
    }
    // 과목은 여러 개 고를 수 있다. 하나도 고르지 않으면 '전체 과목'.
    const setupSubs = new Set();
    function setupPool() {
      const subs = [...setupSubs];
      const data = currentMode === 'quiz' ? allQuizData : allInterviewData;
      return data.filter(q => !subs.length || (q.category && subs.some(s => q.category.includes(s))));
    }
    const SUBJECT_CHIPS = [['ALL', '전체 과목', '모든 분야를 섞어서'], ['반도체 기초 이론', '기초 이론', '밴드 · 캐리어 · 접합'], ['반도체 소자', '소자', '트랜지스터 · 메모리'], ['반도체 8대 공정', '8대 공정', '웨이퍼부터 패키징까지'], ['차세대 첨단 기술', '첨단 기술', '차세대 소자 · 패키징']];
    function updateSetupHint() {
      const n = setupPool().length, want = parseInt(document.getElementById('select-count').value || '0'), real = Math.min(n, want);
      const unit = currentMode === 'quiz' ? '문제' : '면접 문항', exam = currentMode === 'quiz' && document.getElementById('examToggle').checked;
      const sel = setupSubs.size > 1 ? `선택한 ${setupSubs.size}개 과목의 ` : '', sp = document.getElementById('subjPick'); if (sp) sp.textContent = setupSubs.size ? `· ${setupSubs.size}개 선택됨` : '· 여러 개 고를 수 있어요';
      document.getElementById('setupHint').textContent = n === 0 ? `선택한 과목에 등록된 ${unit}가 아직 없어요.` : (n < want ? `${sel}${unit} ${n}개뿐이라 모두 출제해요.` : `${sel}${unit} ${n}개 중 ${want}개를 무작위로 출제해요.`);
      const min = exam ? Math.ceil(real * 1.5) : Math.max(1, Math.round(real * (currentMode === 'quiz' ? 1 : 2)));
      document.getElementById('setupTime').textContent = real ? `${exam ? '제한' : '약'} ${min}분` : '–';
      document.getElementById('setupMeter').style.width = (want ? Math.min(100, real / want * 100) : 0) + '%';
      const data = currentMode === 'quiz' ? allQuizData : allInterviewData, cnt = document.getElementById('select-count').value;
      document.getElementById('subjectChips').innerHTML = SUBJECT_CHIPS.map(([v, name, sub]) => { const c = v === 'ALL' ? data.length : data.filter(q => q.category && q.category.includes(v)).length;
        return `<button data-sub="${v}" aria-pressed="${v === 'ALL' ? setupSubs.size === 0 : setupSubs.has(v)}" class="chip text-left p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0a1020] ${(v === 'ALL' ? setupSubs.size === 0 : setupSubs.has(v)) ? 'chip-on' : ''}"><span class="flex items-center justify-between"><b class="text-sm text-slate-900 dark:text-white">${name}</b><span class="font-mono text-xs font-bold ${c ? 'text-indigo-600 dark:text-cyan-300' : 'text-slate-400'}">${c}</span></span><span class="block text-xs text-slate-400 dark:text-slate-500 mt-1">${sub}</span></button>`; }).join('');
      document.getElementById('countChips').innerHTML = COUNT_OPTIONS[currentMode].map(c => `<button data-cnt="${c}" class="chip py-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0a1020] text-center ${String(c) === cnt ? 'chip-on' : ''}"><span class="font-display text-2xl font-bold text-slate-900 dark:text-white">${c}</span><span class="block text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">${unit}\u200b</span></button>`).join('');
    }
    document.getElementById('subjectChips').addEventListener('click', (e) => { const b = e.target.closest('[data-sub]'); if (!b) return; const v = b.dataset.sub; if (v === 'ALL') setupSubs.clear(); else if (setupSubs.has(v)) setupSubs.delete(v); else setupSubs.add(v); updateSetupHint(); });
    document.getElementById('countChips').addEventListener('click', (e) => { const b = e.target.closest('[data-cnt]'); if (b) { document.getElementById('select-count').value = b.dataset.cnt; updateSetupHint(); } });
    function startSession() {
      const cnt = parseInt(document.getElementById('select-count').value) || COUNT_DEFAULT[currentMode];
      filteredSession = setupPool();
      if (filteredSession.length === 0) return alert("선택한 과목에 등록된 문항이 없습니다.");
      filteredSession = filteredSession.sort(() => Math.random() - 0.5).slice(0, cnt);
      currentKeyword = null; currentIndex = 0; correctCount = 0; sessionLog = [];
      if (currentMode === 'quiz' && document.getElementById('examToggle').checked) return startExam();
      navTo(currentMode === 'quiz' ? 'view-quiz' : 'view-interview');
      if (currentMode === 'quiz') renderQuiz(); else renderInterview();
    }
    
    function renderQuiz() {
      const q = filteredSession[currentIndex];
      document.getElementById('qBadge').innerText = `${q.category} (${q.difficulty})`; document.getElementById('qProgress').innerText = `${currentIndex + 1} / ${filteredSession.length}`; document.getElementById('qTitle').innerText = q.question;
      document.getElementById('qBar').style.width = (currentIndex / filteredSession.length * 100) + '%'; document.getElementById('qEyebrow').textContent = `QUESTION ${pad2(currentIndex + 1)}`;
      const star = document.getElementById('starBtn'); star.innerText = starredIds.includes(q.id) ? "★" : "☆"; star.className = starredIds.includes(q.id) ? "text-3xl text-amber-400" : "text-3xl text-slate-300 dark:text-slate-600";
      const opts = document.getElementById('qOptions'); opts.innerHTML = ''; document.getElementById('qExpBox').classList.add('hidden');
      q.options.forEach((opt, idx) => {
        const btn = document.createElement('button'); 
        btn.className = "opt w-full text-left p-4 rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#0f1729] text-slate-700 dark:text-slate-200 text-[15px] flex items-center";
        btn.innerHTML = `<span class="opt-num w-7 h-7 shrink-0 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-300 flex items-center justify-center text-xs mr-3 font-bold">${idx + 1}</span><span class="leading-snug">${opt}</span>`;
        btn.onclick = () => checkAnswer(idx, q); opts.appendChild(btn);
      });
      applyMathRendering();
    }
    function checkAnswer(idx, q) {
      Array.from(document.getElementById('qOptions').children).forEach(b => b.disabled = true); document.getElementById('qExpBox').classList.remove('hidden');
      const st = document.getElementById('qStatus');
      const ok = idx === q.answer; sessionLog[currentIndex] = { q, picked: idx, ok };
      const kids = document.getElementById('qOptions').children; kids[q.answer].classList.add('opt-correct'); if (!ok) kids[idx].classList.add('opt-wrong');
      document.getElementById('qBar').style.width = ((currentIndex + 1) / filteredSession.length * 100) + '%';
      gradeRecord(q, ok); saveResume();
      const tb = document.getElementById('qTheoryBtn'), th = theoryFor(q); tb.classList.toggle('hidden', !th); if (th) tb.onclick = () => openTheory(th.id);
      if (ok) { correctCount++; st.className = "font-bold text-emerald-600 dark:text-indigo-400 mb-1"; st.innerText = "⭕ 정답!"; } else { st.className = "font-bold text-rose-500 dark:text-rose-400 mb-1"; st.innerText = `❌ 오답 (정답: ${q.answer + 1}번)`; }
      document.getElementById('qExpText').innerHTML = explainHtml(q, idx);
      const nxt = document.getElementById('qNextBtn');
      if (currentIndex === filteredSession.length - 1) { nxt.innerText = "종료"; nxt.onclick = () => showResult('quiz'); } else { nxt.innerText = "다음"; nxt.onclick = () => { currentIndex++; renderQuiz(); }; }
      applyMathRendering();
    }
    // ----- 면접 연출 (입장 애니메이션 + 면접관 말풍선). 설정/저사양/모션 감소 환경에서는 자동으로 꺼짐 -----
    let ivIntroFor = null, ivTimers = [], ivTyping = null, ivSkip = null;
    const ivPref = () => { try { return localStorage.getItem('ivAnim') !== 'off'; } catch (e) { return true; } };
    const ivAnimOn = () => ivPref() && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    function updateIvToggle() { const b = document.getElementById('ivAnimToggle'); if (b) b.textContent = ivPref() ? '🎬 면접 연출 끄기' : '🎬 면접 연출 켜기'; }
    function toggleIvAnim() { try { localStorage.setItem('ivAnim', ivPref() ? 'off' : 'on'); } catch (e) {} updateIvToggle(); }
    const ivClear = () => { ivTimers.forEach(clearTimeout); ivTimers = []; ivTyping = null; };
    const ivLater = (fn, ms) => ivTimers.push(setTimeout(fn, ms));
    function ivFinishTyping() { if (!ivTyping) return false; const t = ivTyping; ivClear(); t.done(); return true; }
    function ivAsk(i) {
      const title = document.getElementById('iTitle'), dots = document.getElementById('iDots'), reveal = document.getElementById('iRevealBtn'), full = String(i.question || '');
      const done = () => { ivTyping = null; title.classList.remove('iv-typing'); title.textContent = full; dots.classList.add('hidden'); reveal.classList.remove('hidden'); reveal.classList.add('iv-pop'); applyMathRendering(); };
      if (!ivAnimOn() || /\$/.test(full)) return done();   // 수식이 있는 질문은 타이핑 없이 바로 표시
      title.textContent = ''; dots.classList.remove('hidden');
      ivTyping = { done };
      ivLater(() => {
        dots.classList.add('hidden'); title.classList.add('iv-typing');
        const delay = Math.max(14, Math.min(34, 1500 / Math.max(1, full.length))); let n = 0;
        const step = () => { n++; title.textContent = full.slice(0, n); if (n >= full.length) done(); else ivLater(step, delay); };
        step();
      }, 650);
    }
    function ivIntro(cb) {
      const o = document.getElementById('iIntro'); if (!o) return cb();
      o.classList.remove('hidden', 'out', 'play'); void o.offsetWidth; o.classList.add('play');
      const end = () => { if (o.classList.contains('out')) return; ivClear(); ivSkip = null; o.classList.add('out'); ivLater(() => { o.classList.add('hidden'); o.classList.remove('out', 'play'); cb(); }, 320); };
      o.onclick = end; ivSkip = end; ivLater(end, 3700);
    }
    function renderInterview() {
      const i = filteredSession[currentIndex];
      document.getElementById('iBadge').innerText = i.category; document.getElementById('iProgress').innerText = `${currentIndex+1}/${filteredSession.length}`; document.getElementById('iBar').style.width = (currentIndex / filteredSession.length * 100) + '%'; document.getElementById('iEyebrow').textContent = `INTERVIEW ${pad2(currentIndex + 1)}`;
      document.getElementById('iGhost').textContent = i.question; document.getElementById('iTitle').textContent = i.question;
      document.getElementById('iRevealBtn').classList.add('hidden'); document.getElementById('iRevealBtn').classList.remove('iv-pop'); document.getElementById('iExpBox').classList.add('hidden');
      ivClear(); ivSkip = null; updateIvToggle();
      const first = ivIntroFor !== filteredSession && currentIndex === 0; ivIntroFor = filteredSession;
      const iv = document.getElementById('iIntro'); if (iv) iv.classList.add('hidden');
      if (first && ivAnimOn()) { document.getElementById('iTitle').textContent = ''; ivIntro(() => ivAsk(i)); } else ivAsk(i);
      applyMathRendering();
    }
    function revealInterview() {
      const i = filteredSession[currentIndex];
      document.getElementById('iRevealBtn').classList.add('hidden'); document.getElementById('iExpBox').classList.remove('hidden'); saveResume(); addPoints(1, null, { k: 'iv', cat: i.category, id: i.id }); document.getElementById('iBar').style.width = ((currentIndex + 1) / filteredSession.length * 100) + '%';
      document.getElementById('iKeywords').innerHTML = (i.key_points||[]).map(k=>`<span class="bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 px-2 py-1 rounded text-xs font-bold">#${k}</span>`).join('');
      document.getElementById('iAnsText').innerText = i.interview_answer;
      const fw = document.getElementById('iFollow'); fw.classList.toggle('hidden', !i.follow_up); fw.classList.remove('iv-pop'); void fw.offsetWidth; if (i.follow_up) fw.classList.add('iv-pop');
      if (i.follow_up) { document.getElementById('iFollowQ').innerText = i.follow_up; document.getElementById('iFollowA').innerText = i.follow_up_answer || ''; }
      const nxt = document.getElementById('iNextBtn');
      if(currentIndex === filteredSession.length-1) { nxt.innerText = "종료"; nxt.onclick = () => showResult('interview'); } else { nxt.innerText = "다음"; nxt.onclick = ()=>{currentIndex++; renderInterview();} }
      applyMathRendering();
    }
    // 약점 = 과목별(4가지) 최근 풀이 정답률이 70% 미만인 과목. 최근 풀이는 주제별로 남긴 최근 6번 기록을 과목 단위로 합친 것이고, 기록이 짧으면 전체 기록으로 본다.
    function subjectAcc(cat) {
      const h = Object.entries(stats.topics).filter(([k]) => k.split('||')[0] === cat).map(([, v]) => v.h || '').join('');
      if (h.length >= 3) return [...h].filter(c => c === '1').length / h.length;
      const v = stats.cats[cat]; return v && v.t >= 3 ? v.r / v.t : null;
    }
    function resetStats() { if (!confirm('통계를 초기화할까요? (오답 노트는 유지돼요)')) return; stats = { cats: {}, topics: {}, total: { r: 0, t: 0 } }; try { localStorage.removeItem('semiCbtStats'); } catch (e) {} renderHomeSubjects(); }
    // 채점 결과를 오답 노트 + 통계에 기록
    // =====================================================
    // 🔁 오답 간격 반복: 틀린 문제는 1일 → 3일 → 7일 → 14일 → 30일 간격으로 다시 나오고, 마지막까지 맞히면 '익힘'이 된다.
    //  - 틀리면 언제든 처음(내일)으로 돌아간다. 복습 때가 되기 전에 우연히 맞힌 것은 단계를 올리지 않는다.
    //  - 예전에 쌓인 오답(복습 정보가 없는 것)은 오늘 복습 대상으로 본다. 하루 목표는 5문제.
    //  - 상태는 오답 노트 항목(wrongNotes)에 함께 저장되어 로그인 동기화에도 따라간다: box(단계) · due(다음 복습일) · done(익힘)
    // =====================================================
    const SRS_DAYS = [1, 3, 7, 14, 30], SRS_DAILY = 5;
    let reviewCtx = null;
    const addDays = (ds, k) => { const [y, m, d] = ds.split('-').map(Number); return dateStr(new Date(y, m - 1, d + k)); };
    function srsUpdate(n, ok) {
      const today = dateStr();
      if (!ok) { n.box = 0; n.due = addDays(today, SRS_DAYS[0]); n.done = false; return; }
      if (n.done) return;
      if (n.due && n.due > today) return;
      const nb = (n.box || 0) + 1;
      if (nb >= SRS_DAYS.length) { n.done = true; n.box = SRS_DAYS.length; n.due = null; } else { n.box = nb; n.due = addDays(today, SRS_DAYS[nb]); }
    }
    function srsDue() {
      const today = dateStr();
      return allQuizData.filter(q => { const n = wrongNotes[q.id]; return n && !n.done && (n.due || today) <= today; })
        .sort((a, b) => (wrongNotes[a.id].due || '').localeCompare(wrongNotes[b.id].due || '') || (wrongNotes[b.id].wrong || 0) - (wrongNotes[a.id].wrong || 0));
    }
    function srsCount() { const t = todayData(); t.rv = (t.rv || 0) + 1; try { localStorage.setItem(TODAY_KEY, JSON.stringify(t)); } catch (e) {} }
    // 오늘 복습: 이미 한 개수 + 지금 대기 중인 개수 중 최대 5개가 목표. 대기가 없거나 5개를 했으면 완료. (저장하지 않고 매번 계산)
    function srsToday() {
      const rv = todayData().rv || 0, due = srsDue().length, tm = addDays(dateStr(), 1);
      return { due, rv, target: Math.min(SRS_DAILY, rv + due), done: due === 0 || rv >= SRS_DAILY, tomorrow: allQuizData.filter(q => { const n = wrongNotes[q.id]; return n && !n.done && n.due === tm; }).length };
    }
    function srsStart() {
      const due = srsDue(); if (!due.length) return;
      const st = srsToday(), left = st.target - st.rv, size = Math.min(due.length, left > 0 ? left : SRS_DAILY);
      filteredSession = due.slice(0, size).sort(() => Math.random() - 0.5);
      currentKeyword = null; currentIndex = 0; correctCount = 0; sessionLog = []; currentMode = 'quiz';
      reviewCtx = { ref: filteredSession }; navTo('view-quiz'); renderQuiz();
    }
    function srsLabel(n) {
      if (n.done) return '✅ 익힘';
      const today = dateStr(), due = n.due || today; if (due <= today) return '🔁 오늘 복습';
      const d = Math.round((Date.parse(due) - Date.parse(today)) / 864e5); return d === 1 ? '⏰ 내일 복습' : `⏰ ${d}일 뒤 복습`;
    }
    function gradeRecord(q, ok) {
      const n = wrongNotes[q.id] || (ok ? null : { wrong: 0, right: 0, memo: '' });
      if (n) { if (ok) n.right = (n.right || 0) + 1; else n.wrong = (n.wrong || 0) + 1; srsUpdate(n, ok); n.last = Date.now(); wrongNotes[q.id] = n; saveWrong(); }
      if (reviewCtx && reviewCtx.ref === filteredSession) srsCount();
      recordStat(q, ok); addPoints(1, null, { k: 'q', cat: q.category, label: q.topic, id: q.id });
    }
    // 🔗 문제 → 관련 이론 (theory_id 우선, 옛 문제는 주제명이 제목에 들어간 이론)
    function theoryFor(q) {
      const real = (t) => t && t.content && !t.content.includes('채워질 예정');
      let t = q.theory_id && allTheories.find(x => x.id === q.theory_id);
      if (!real(t) && q.topic) t = allTheories.find(x => real(x) && (x.title === q.topic || x.title.includes(q.topic) || q.topic.includes(x.title)));
      return real(t) ? t : null;
    }
    function openTheory(id) {
      const t = allTheories.find(x => x.id === id); if (!t) return;
      if (currentViewId !== 'view-learning' && RETURN_LABEL[currentViewId]) returnCtx = { view: currentViewId, label: RETURN_LABEL[currentViewId] };
      navTo('view-learning', { level: 'detail', category: t.category, subject: t.subject, theoryId: t.id });
    }
    // 해설 문자열("정답 해설 / 오답 체크 / 💡 기억 포인트")을 카드로 나눠 보여준다. 형식이 다르면 원문 그대로 보여준다.
    function parseExp(t) {
      t = String(t || ''); const o = { a: '', w: [], k: '' };
      const km = t.match(/💡\s*(?:기억 포인트|Key point)\s*[:：]?\s*([\s\S]*)$/i); if (km) { o.k = km[1].trim(); t = t.slice(0, km.index); }
      const wm = t.match(/오답 체크|Why the others are wrong/i); let wt = ''; if (wm) { wt = t.slice(wm.index + wm[0].length); t = t.slice(0, wm.index); }
      o.a = t.replace(/^\s*(?:정답 해설|Answer explanation)\s*/i, '').trim();
      wt.split('\n').forEach(l => { const m = l.match(/^\s*[·•\-]?\s*(?:(\d)번|Option\s*(\d))\s*[:：]\s*(.*)$/i); if (m) o.w.push([+(m[1] || m[2]), m[3].trim()]); else if (l.trim() && o.w.length) o.w[o.w.length - 1][1] += ' ' + l.trim(); });
      return o;
    }
    // picked: 내가 고른 보기 번호(0부터, 없으면 -1) / banner: 맨 위에 정답 표시를 붙일지
    function explainHtml(q, picked = -1, banner = false) {
      const e = parseExp(q.explanation);
      if (!e.a && !e.w.length && !e.k) return `<div class="ex"><div class="ex-a" style="white-space:pre-line">${escH(q.explanation)}</div></div>`;
      let h = '<div class="ex">';
      if (banner) h += `<div class="ex-ans"><i>정답 ${q.answer + 1}번</i><span>${escH(q.options[q.answer])}</span></div>`;
      if (e.a) h += `<div class="ex-a"><div class="ex-h">✅ 정답 해설</div>${escH(e.a)}</div>`;
      if (e.w.length) h += `<div class="ex-w"><div class="ex-h">❌ 오답 체크</div>${e.w.map(([n, t]) => `<div class="ex-wi${n - 1 === picked ? ' me' : ''}"><span class="ex-n">${n}</span><div>${q.options[n - 1] != null ? `<span class="ex-ot">${escH(q.options[n - 1])}</span>` : ''}${escH(t)}</div></div>`).join('')}</div>`;
      if (e.k) h += `<div class="ex-k"><span>💡</span><div>${escH(e.k)}</div></div>`;
      return h + '</div>';
    }
    const theoryLinkHtml = (q) => { const t = theoryFor(q); return t ? `<button onclick="openTheory('${escH(t.id)}')" class="mt-3 w-full bg-indigo-50 dark:bg-[#0f2233] border border-indigo-200 dark:border-emerald-900/60 text-indigo-700 dark:text-[#67e8f9] py-2 rounded-lg text-xs font-bold">📖 관련 이론 보기: ${escH(t.title)}</button>` : ''; };

    // ⏱️ 모의고사 모드
    let exam = null, examMeta = null;
    function stopExamTimer() { if (exam && exam.timer) { clearInterval(exam.timer); exam.timer = null; } }
    function fmtTime(sec) { sec = Math.max(0, Math.round(sec)); return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); }
    function startExam() {
      const n = filteredSession.length, now = Date.now();
      exam = { answers: Array(n).fill(-1), idx: 0, start: now, end: now + n * 90000, limit: n * 90, timer: null };
      currentMode = 'quiz'; navTo('view-exam'); renderExam();
      exam.timer = setInterval(examTick, 1000); examTick();
    }
    function examTick() {
      if (!exam) return;
      const left = (exam.end - Date.now()) / 1000, el = document.getElementById('exTimer');
      el.textContent = fmtTime(left); el.className = 'font-mono font-bold text-lg ' + (left <= 60 ? 'text-rose-500' : 'text-slate-700 dark:text-slate-200');
      if (left <= 0) submitExam(true);
    }
    function renderExam() {
      const q = filteredSession[exam.idx], n = filteredSession.length;
      document.getElementById('exBadge').textContent = q.category;
      document.getElementById('exProgress').textContent = `${exam.idx + 1} / ${n}`; document.getElementById('exBar').style.width = (exam.answers.filter(a => a >= 0).length / n * 100) + '%';
      document.getElementById('exTitle').textContent = q.question;
      const opts = document.getElementById('exOptions'); opts.innerHTML = '';
      q.options.forEach((opt, i) => {
        const sel = exam.answers[exam.idx] === i, b = document.createElement('button');
        b.className = 'w-full text-left p-4 rounded-xl border text-sm flex items-center transition ' + (sel ? 'border-indigo-500 dark:border-[#67e8f9] bg-indigo-50 dark:bg-[#0f2233] text-slate-900 dark:text-white' : 'border-slate-200 dark:border-white/15 bg-white dark:bg-[#0f1729] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200');
        b.innerHTML = `<span class="w-6 h-6 rounded-full flex items-center justify-center text-xs mr-3 font-bold ${sel ? 'pbtn' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'}">${i + 1}</span><span>${opt}</span>`;
        b.onclick = () => { exam.answers[exam.idx] = (exam.answers[exam.idx] === i ? -1 : i); renderExam(); };
        opts.appendChild(b);
      });
      document.getElementById('exPrev').disabled = exam.idx === 0; document.getElementById('exNext').disabled = exam.idx === n - 1;
      document.getElementById('exPalette').innerHTML = exam.answers.map((a, i) => `<button onclick="examJump(${i})" class="w-9 h-9 rounded-lg text-xs font-bold border ${i === exam.idx ? 'ring-2 ring-indigo-500 dark:ring-[#67e8f9] ' : ''}${a >= 0 ? 'pbtn border-transparent' : 'bg-white dark:bg-[#0a1020] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/15'}">${i + 1}</button>`).join('');
      applyMathRendering();
    }
    function examGo(d) { exam.idx = Math.min(filteredSession.length - 1, Math.max(0, exam.idx + d)); renderExam(); }
    function examJump(i) { exam.idx = i; renderExam(); }
    function leaveExam() { if (confirm('시험을 중단할까요? 지금까지의 답안은 채점되지 않아요.')) { stopExamTimer(); exam = null; navTo('view-lobby'); } }
    function submitExam(auto) {
      if (!exam) return;
      const blank = exam.answers.filter(a => a < 0).length;
      if (!auto && !confirm(blank ? `아직 답하지 않은 문항이 ${blank}개 있어요. 그래도 제출할까요?` : '제출하고 채점할까요?')) return;
      stopExamTimer();
      sessionLog = filteredSession.map((q, i) => ({ q, picked: exam.answers[i], ok: exam.answers[i] === q.answer }));
      sessionLog.forEach(r => gradeRecord(r.q, r.ok));
      correctCount = sessionLog.filter(r => r.ok).length; currentIndex = 0; currentKeyword = null;
      examMeta = { used: Math.min(exam.limit, (Date.now() - exam.start) / 1000), limit: exam.limit, blank, auto };
      exam = null; showResult('quiz');
    }
    function setNoteTab(t) { noteTab = t; renderNoteDOM(); }
    function noteItems() {
      if (noteTab === 'star') return allQuizData.filter(q => starredIds.includes(q.id));
      return allQuizData.filter(q => wrongNotes[q.id]).sort((a, b) => (wrongNotes[b.id].last || 0) - (wrongNotes[a.id].last || 0));
    }
    function renderNoteDOM() {
      const on = 'pbtn border-transparent', off = 'bg-white dark:bg-[#0f1729] text-slate-500 dark:text-slate-300 border-slate-200 dark:border-white/15';
      const wc = allQuizData.filter(q => wrongNotes[q.id]).length, sc = allQuizData.filter(q => starredIds.includes(q.id)).length;
      const tw = document.getElementById('noteTabWrong'), ts = document.getElementById('noteTabStar');
      tw.textContent = `❌ 틀린 문제 ${wc}`; ts.textContent = `★ 즐겨찾기 ${sc}`;
      tw.className = 'py-2.5 rounded-xl text-sm font-bold border transition ' + (noteTab === 'wrong' ? on : off);
      ts.className = 'py-2.5 rounded-xl text-sm font-bold border transition ' + (noteTab === 'star' ? on : off);
      const items = noteItems();
      const pb = document.getElementById('notePracticeBtn');
      pb.classList.toggle('hidden', items.length === 0);
      pb.textContent = (noteTab === 'wrong' ? '🔁 틀린 문제 다시 풀기' : '🔁 즐겨찾기 문제 풀기') + ` (${Math.min(items.length, 20)}문항)`;
      const c = document.getElementById('noteContainer'); c.innerHTML = '';
      if (items.length === 0) {
        c.innerHTML = `<div class="bg-white dark:bg-[#0f1729] p-6 rounded-2xl text-center text-slate-400 border border-slate-200 dark:border-white/10">${noteTab === 'wrong' ? '틀린 문제가 아직 없어요. 문제를 풀면 오답이 자동으로 쌓여요.' : '즐겨찾기한 문제가 없어요. 문제 풀이 중 ☆를 눌러 보세요.'}</div>`;
        return;
      }
      items.forEach(q => {
        const n = wrongNotes[q.id] || {};
        const stat = noteTab === 'wrong' ? `<span class="text-xs text-slate-400 dark:text-slate-500">틀림 ${n.wrong || 0} · 맞힘 ${n.right || 0} · ${srsLabel(n)}</span>` : '';
        const d = document.createElement('div'); d.className = 'bg-white dark:bg-[#0f1729] rounded-2xl p-5 border border-slate-200 dark:border-white/10';
        d.innerHTML = `<div class="flex justify-between items-center mb-3 gap-2"><div class="flex items-center gap-2 min-w-0"><span class="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs px-2 py-1 rounded font-bold shrink-0">${escH(q.category)}</span>${stat}</div><button data-del="${escH(q.id)}" class="text-xs text-rose-500 dark:text-rose-400 font-bold shrink-0">${noteTab === 'wrong' ? '노트에서 삭제' : '즐겨찾기 해제'}</button></div>
          <h3 class="mb-4 font-bold dark:text-white">${q.question}</h3>
          <button data-toggle="ans-${escH(q.id)}" class="w-full bg-slate-100 dark:bg-[#0a1020] hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 py-2 rounded-lg text-sm font-bold">해설 보기 ↕</button>
          <div id="ans-${escH(q.id)}" class="hidden mt-3">${explainHtml(q, -1, true)}${theoryLinkHtml(q)}</div>
          ${noteTab === 'wrong' ? `<textarea data-memo="${escH(q.id)}" rows="2" maxlength="300" placeholder="✏️ 나만의 메모 (헷갈린 이유, 외울 포인트…)" class="w-full mt-3 bg-slate-50 dark:bg-[#0a1020] border border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200 rounded-lg p-3 text-sm outline-none focus:border-amber-400">${escH(n.memo || '')}</textarea>` : ''}`;
        c.appendChild(d);
      });
      applyMathRendering();
    }
    // 노트 화면 이벤트(삭제 / 해설 토글 / 메모 저장)는 한 곳에서 처리
    document.getElementById('noteContainer').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]'), tg = e.target.closest('[data-toggle]');
      if (del) { removeNote(del.dataset.del); } else if (tg) { document.getElementById(tg.dataset.toggle).classList.toggle('hidden'); }
    });
    document.getElementById('noteContainer').addEventListener('input', (e) => {
      const id = e.target.dataset && e.target.dataset.memo; if (!id || !wrongNotes[id]) return;
      wrongNotes[id].memo = e.target.value; saveWrong();
    });
    function removeNote(id) {
      if (noteTab === 'wrong') { delete wrongNotes[id]; saveWrong(); }
      else { starredIds = starredIds.filter(x => x !== id); localStorage.setItem('semiCbtStarred', JSON.stringify(starredIds)); }
      renderNoteDOM();
    }
    function practiceNotes() {
      const items = noteItems(); if (!items.length) return;
      filteredSession = items.slice().sort(() => Math.random() - 0.5).slice(0, 20);
      currentKeyword = null; currentIndex = 0; correctCount = 0; sessionLog = []; currentMode = 'quiz'; navTo('view-quiz'); renderQuiz();
    }
    // 방금 푼 세션에서 틀린 문제만 다시 풀기
    function retryWrong() {
      const wrong = sessionLog.filter(r => r && !r.ok).map(r => r.q); if (!wrong.length) return;
      filteredSession = wrong.sort(() => Math.random() - 0.5);
      currentIndex = 0; correctCount = 0; sessionLog = []; currentMode = 'quiz'; navTo('view-quiz'); renderQuiz();
    }
    function renderReview() {
      const box = document.getElementById('resultReview'), list = document.getElementById('reviewList');
      const rows = sessionLog.filter(Boolean);
      if (!rows.length) { box.classList.add('hidden'); return; }
      box.classList.remove('hidden'); list.innerHTML = '';
      rows.forEach((r, i) => {
        const q = r.q, d = document.createElement('div');
        d.className = 'rounded-xl border ' + (r.ok ? 'border-indigo-200 dark:border-emerald-900/60' : 'border-rose-200 dark:border-rose-900/50');
        d.innerHTML = `<button data-rv="${i}" class="w-full flex items-center gap-3 p-3 text-left">
            <span class="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${r.ok ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-indigo-400' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'}">${r.ok ? 'O' : 'X'}</span>
            <span class="flex-1 min-w-0 text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">${i + 1}. ${escH(q.question)}</span>
            <span class="text-slate-300 dark:text-slate-600">⌄</span></button>
          <div id="rv-${i}" class="hidden px-4 pb-4 text-sm">
            <p class="font-bold text-slate-900 dark:text-white mb-3">${q.question}</p>
            <p class="mb-1 ${r.ok ? 'text-emerald-600 dark:text-indigo-400' : 'text-rose-500 dark:text-rose-400'}">내 답: ${r.picked < 0 ? '미응답' : (r.picked + 1) + '번 · ' + q.options[r.picked]}</p>
            ${r.ok ? '' : `<p class="mb-2 text-emerald-600 dark:text-indigo-400 font-bold">정답: ${q.answer + 1}번 · ${escH(q.options[q.answer])}</p>`}
            ${explainHtml(q, r.picked)}${theoryLinkHtml(q)}</div>`;
        list.appendChild(d);
      });
      applyMathRendering();
    }
    document.getElementById('reviewList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rv]'); if (b) document.getElementById('rv-' + b.dataset.rv).classList.toggle('hidden');
    });
    function toggleStar() {
      const id = filteredSession[currentIndex].id; const s = document.getElementById('starBtn');
      if(starredIds.includes(id)) { starredIds = starredIds.filter(x=>x!==id); s.innerText="☆"; s.className="text-3xl text-slate-300 dark:text-slate-600"; } else { starredIds.push(id); s.innerText="★"; s.className="text-3xl text-amber-400"; }
      localStorage.setItem('semiCbtStarred', JSON.stringify(starredIds));
    }

    // =====================================================
    // ◉ 새김 웨이퍼: 출석(학습 완료 후)할 때마다 회로가 하나씩 새겨져요
    // =====================================================
    const DAILY_GOAL = 5, WAFER_KEY = 'semiCbtWafer', TODAY_KEY = 'semiCbtToday';
    let attendDays = []; try { attendDays = (JSON.parse(localStorage.getItem(WAFER_KEY)) || {}).days || []; } catch (e) {}
    let attendBusy = false;
    const pad2 = (n) => String(n).padStart(2, '0');
    const dateStr = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    function saveAttend() { try { localStorage.setItem(WAFER_KEY, JSON.stringify({ days: attendDays })); } catch (e) {} }
    function todayData() { let t = null; try { t = JSON.parse(localStorage.getItem(TODAY_KEY)); } catch (e) {} const d = dateStr(); return (t && t.date === d) ? t : { date: d, pts: 0, theories: [] }; }
    // 오늘의 학습 점수: 문제 1개 +1 · 면접 문항 확인 +1 · 이론 1개 읽기 +2 (목표 5점)
    function addPoints(n, theoryId, meta) {
      const t = todayData();
      if (theoryId) { if (t.theories.includes(theoryId)) return; t.theories.push(theoryId); }
      else if (meta && meta.id) { const key = meta.k + ':' + meta.id; t.items = t.items || []; if (t.items.includes(key)) return; t.items.push(key); }   // 같은 문제·면접은 하루 한 번만 점수 (서버 규칙과 같음)
      t.pts += n; try { localStorage.setItem(TODAY_KEY, JSON.stringify(t)); } catch (e) {}
      if (meta && typeof logStudy === 'function') logStudy(meta.k, meta.cat, meta.label);
      if (meta && meta.id) studySend(meta.k, meta.id);
    }
    // =====================================================
    // 한 달(출석 30일) = 웨이퍼 한 장. 패턴 레벨은 3단계: 기초(기본 빛깔) → 푸른 웨이퍼(10일~) → 프리즘 웨이퍼(20일~).
    // 단계가 오르면 웨이퍼 테두리 빛이 푸른빛, 무지갯빛으로 바뀌고, 칸마다 새겨지는 회로 선도 늘어난다. 30일을 채우면 다음 달 새 웨이퍼가 열린다.
    // =====================================================
    const STAGES = [['Seed Wafer', '기초 웨이퍼'], ['Blue Wafer', '푸른 웨이퍼'], ['Prism Wafer', '프리즘 웨이퍼']];
    const stageOf = (dm) => dm >= 20 ? 3 : dm >= 10 ? 2 : 1;
    const LINE_W3 = [2.1, 1.7, 1.4];   // 단계가 오를수록 칸마다 선이 1개 → 2개 → 3개로 늘고 조금 가늘어진다
    function waferInfo(N) {
      const m = N === 0 ? 0 : Math.floor((N - 1) / 30), dm = N - m * 30, level = stageOf(dm);
      const next = dm >= 30 ? '다음 출석에 새 웨이퍼' : dm < 10 ? `${10 - dm}일 후 푸른 웨이퍼` : dm < 20 ? `${20 - dm}일 후 프리즘 웨이퍼` : `${30 - dm}일 후 웨이퍼 완성`;
      return { m, dm, level, name: STAGES[level - 1], next, collected: Math.floor(N / 30) };
    }
    function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    // 웨이퍼 위의 칩(다이) 격자 + 각 칩에 새겨질 회로 (중심부부터 바깥으로, 위치는 달마다 달라짐). lines[0] 이 기본 회로, 뒤쪽 선은 공정이 미세해질수록 추가로 새겨진다
    const _cellCache = {};
    function waferCells(m) {
      if (_cellCache[m]) return _cellCache[m];
      const rnd = mulberry(7 + m * 13), S = 26, cells = [];
      for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) { const cx = i * S, cy = j * S, r = Math.hypot(cx, cy); if (r <= 112) cells.push({ cx, cy, r }); }
      const order = cells.map(c => ({ c, k: c.r + rnd() * 22 })).sort((a, b) => a.k - b.k).map(x => x.c);
      order.forEach((c, idx) => {
        const r2 = mulberry(1000 + m * 97 + idx * 31), x0 = c.cx - 9, y0 = c.cy + Math.round(r2() * 14 - 7);
        let x = x0, y = y0, d = `M${x} ${y}`; const steps = 2 + Math.floor(r2() * 2);
        for (let k = 0; k < steps; k++) {
          x = Math.min(c.cx + 9, x + Math.round(6 + r2() * 5)); d += ` H${x}`;
          y = Math.max(c.cy - 9, Math.min(c.cy + 9, y + Math.round((r2() * 2 - 1) * 12))); d += ` V${y}`;
        }
        c.start = [x0, y0]; c.end = [x, y]; c.d = d; c.extra = [];
        for (let l = 1; l < 6; l++) {   // 추가 회로선: 칩 안의 가는 띠마다 하나씩
          const by = c.cy - 9 + l * 3.2 + (r2() - .5) * 1.4; let ex = c.cx - 9 + r2() * 4, ey = by, ed = `M${ex.toFixed(1)} ${ey.toFixed(1)}`; const n2 = 2 + Math.floor(r2() * 2);
          for (let s = 0; s < n2; s++) { ex = Math.min(c.cx + 9, ex + 4 + r2() * 5); ed += `H${ex.toFixed(1)}`; ey = Math.max(c.cy - 9, Math.min(c.cy + 9, by + (r2() - .5) * 4)); ed += `V${ey.toFixed(1)}`; }
          c.extra.push(ed);
        }
      });
      return (_cellCache[m] = order);
    }
    const dayOfCell = (m, i) => attendDays[m * 30 + i];
    const RING_CATS = [['반도체 기초 이론', '#22d3ee'], ['반도체 소자', '#34d399'], ['반도체 8대 공정', '#a78bfa'], ['차세대 첨단 기술', '#f472b6']];
    function arcPath(r, a0, a1) {
      const pt = (a) => [r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180)];
      const [x0, y0] = pt(a0), [x1, y1] = pt(a1); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
    }
    // ---------- 날짜별 학습 기록 ----------
    const LOG_KEY = 'semiCbtDayLog';
    const CATS = [{ s: '기초 이론', d: '#22d3ee', l: '#0891b2' }, { s: '소자', d: '#34d399', l: '#059669' }, { s: '8대 공정', d: '#a78bfa', l: '#7c3aed' }, { s: '차세대', d: '#f472b6', l: '#db2777' }];
    let dayLog = {}; try { dayLog = JSON.parse(localStorage.getItem(LOG_KEY)) || {}; } catch (e) {}
    const isDark = () => document.documentElement.classList.contains('dark');
    function saveLog() { const ks = Object.keys(dayLog).sort(); while (ks.length > 400) delete dayLog[ks.shift()]; try { localStorage.setItem(LOG_KEY, JSON.stringify(dayLog)); } catch (e) {} }
    function catIdx(name) { name = String(name || ''); const i = RING_CATS.findIndex(c => c[0] === name); if (i >= 0) return i; return /기초/.test(name) ? 0 : /소자/.test(name) ? 1 : /공정/.test(name) ? 2 : /차세대|첨단/.test(name) ? 3 : -1; }
    function logStudy(kind, cat, label) {
      const d = dateStr(), e = dayLog[d] || (dayLog[d] = { w: {}, th: [], q: 0, iv: 0, qt: {} }), key = String(catIdx(cat));
      e.w[key] = (e.w[key] || 0) + (kind === 'th' ? 2 : 1);
      if (kind === 'th') { if (label && !e.th.includes(label) && e.th.length < 12) e.th.push(label); }
      else if (kind === 'q') { e.q++; if (label && (e.qt[label] || Object.keys(e.qt).length < 12)) e.qt[label] = (e.qt[label] || 0) + 1; }
      else e.iv++;
      saveLog();
    }
    // 그날 가장 많이 공부한 과목 (기록이 없으면 null, 과목을 알 수 없으면 -1)
    function dayMain(date) {
      const e = dayLog[date]; if (!e) return null; let best = -1, bw = 0;
      Object.entries(e.w).forEach(([k, w]) => { if (+k >= 0 && w > bw) { bw = w; best = +k; } });
      return best;
    }
    function dayCol(date, dk, u) { const m = dayMain(date); return m === null ? `url(#prism${u || ''})` : m < 0 ? '#94a3b8' : CATS[m][dk ? 'd' : 'l']; }
    const dayLabel = (s) => { const [y, m, d] = s.split('-').map(Number), w = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()]; return `${m}/${d} (${w})`; };
    function daySummary(date) {
      const e = dayLog[date]; if (!e) return null;
      const p = []; if (e.th.length) p.push(`이론 ${e.th.length}`); if (e.q) p.push(`문제 ${e.q}`); if (e.iv) p.push(`면접 ${e.iv}`);
      return { text: p.join(' · ') || '기록 없음', th: e.th, qt: Object.entries(e.qt).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`), main: dayMain(date) };
    }
    function streakNow() { const s = new Set(attendDays), d = new Date(); let n = 0; while (s.has(dateStr(d))) { n++; d.setDate(d.getDate() - 1); } return n; }

    // info: waferInfo() 결과. o.lvl: 패턴 레벨(기본 info.level) / o.fresh: 막 붙는 단계(2·3) / o.earned: 새겨 둔 칸 수(기본 info.dm) / o.u: id 꼬리표 / o.sel: 선택된 칸 / o.still: 깜빡임 없음 / o.days: 칸마다 연결된 날짜
    function waferSVG(info, o = {}) {
      const u = o.u || '', earned = o.earned != null ? o.earned : info.dm, cells = waferCells(info.m), lvl = o.lvl != null ? o.lvl : info.level, dk = isDark();
      const days = o.days || attendDays.slice(info.m * 30, info.m * 30 + 30), col = (i) => dayCol(days[i], dk, u), nl = lvl, lw = LINE_W3[lvl - 1], gf = o.lite ? '' : ` filter="url(#glow${u})"`;
      const max = Math.max(1, ...RING_CATS.map(([k2]) => (stats.cats[k2] || { t: 0 }).t));
      let h = `<svg id="waferSvg${u}" viewBox="-163 -163 326 326" class="w-full h-full" role="img" aria-label="나의 학습 웨이퍼 ${STAGES[lvl - 1][1]} 단계 ${earned}/30"><defs>
        <radialGradient id="wBase${u}" cx="35%" cy="30%" r="85%">${dk ? '<stop offset="0" stop-color="#3d4968"/><stop offset=".55" stop-color="#1b2542"/><stop offset="1" stop-color="#0b1122"/>' : '<stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#dbe3ee"/><stop offset="1" stop-color="#a3b3c9"/>'}</radialGradient>
        <linearGradient id="prism${u}" gradientUnits="userSpaceOnUse" x1="-120" y1="-120" x2="120" y2="120">${dk ? '<stop offset="0" stop-color="#67e8f9"/><stop offset=".5" stop-color="#a78bfa"/><stop offset="1" stop-color="#f472b6"/>' : '<stop offset="0" stop-color="#0891b2"/><stop offset=".5" stop-color="#6d28d9"/><stop offset="1" stop-color="#db2777"/>'}</linearGradient>
        <linearGradient id="blue${u}" gradientUnits="userSpaceOnUse" x1="-130" y1="-130" x2="130" y2="130">${dk ? '<stop offset="0" stop-color="#bae6fd"/><stop offset=".5" stop-color="#38bdf8"/><stop offset="1" stop-color="#3b82f6"/>' : '<stop offset="0" stop-color="#38bdf8"/><stop offset=".5" stop-color="#0ea5e9"/><stop offset="1" stop-color="#2563eb"/>'}</linearGradient>
        <linearGradient id="rainbow${u}" gradientUnits="userSpaceOnUse" x1="-130" y1="-130" x2="130" y2="130">${dk ? '<stop offset="0" stop-color="#67e8f9"/><stop offset=".25" stop-color="#6ee7b7"/><stop offset=".5" stop-color="#fcd34d"/><stop offset=".75" stop-color="#fda4af"/><stop offset="1" stop-color="#c4b5fd"/>' : '<stop offset="0" stop-color="#06b6d4"/><stop offset=".25" stop-color="#10b981"/><stop offset=".5" stop-color="#f59e0b"/><stop offset=".75" stop-color="#f43f5e"/><stop offset="1" stop-color="#a78bfa"/>'}</linearGradient>
        <clipPath id="wClip${u}"><circle r="138"/></clipPath><linearGradient id="sheenG${u}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="${dk ? .13 : .7}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <filter id="glow${u}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
      RING_CATS.forEach(([k2, c], i) => { const op = (.2 + .8 * ((stats.cats[k2] || { t: 0 }).t / max)).toFixed(2); h += `<path d="${arcPath(155, -90 + i * 360 / RING_CATS.length + 5, -90 + (i + 1) * 360 / RING_CATS.length - 5)}" fill="none" stroke="${c}" stroke-opacity="${op}" stroke-width="4" stroke-linecap="round"/>`; });
      h += `<circle r="140" fill="url(#wBase${u})" stroke="#94a3b8" stroke-opacity=".5"/><circle r="134" fill="none" stroke="${dk ? '#fff' : '#64748b'}" stroke-opacity="${dk ? .06 : .18}"/>`;
      if (lvl >= 2) {   // 2단계: 푸른빛 / 3단계: 무지갯빛 (테두리 빛 + 안쪽 가는 선). 막 바뀐 날은 서서히 나타난다
        const g = lvl >= 3 ? `url(#rainbow${u})` : `url(#blue${u})`;
        h += `<g class="${o.fresh === lvl ? 'wf-pop' : ''}"><circle r="124" fill="none" stroke="${g}" stroke-opacity="${lvl >= 3 ? .5 : .4}" stroke-width=".8"/><circle r="140" fill="none" stroke="${g}" stroke-width="${lvl >= 3 ? 2.4 : 2}"${gf}/>${lvl >= 3 ? `<circle r="147" fill="none" stroke="${g}" stroke-opacity=".3" stroke-width=".7"/>` : ''}</g>`;
      }
      cells.forEach((c, i) => { h += `<rect x="${c.cx - 12}" y="${c.cy - 12}" width="24" height="24" rx="2" ${i < earned ? `fill="${col(i)}" fill-opacity="${dk ? .1 : .13}"` : `fill="${dk ? 'rgba(255,255,255,.015)' : 'rgba(255,255,255,.4)'}"`} stroke="${dk ? 'rgba(148,163,184,.16)' : 'rgba(71,85,105,.22)'}" stroke-width=".6"/>`; });
      for (let i = earned; i < 30 && i < cells.length; i++) h += `<path d="${cells[i].d}" fill="none" stroke="${dk ? '#64748b' : '#8da0b8'}" stroke-opacity="${dk ? .38 : .85}" stroke-width="1"/>`;
      if (lvl >= 3) for (let i = 0; i < earned - 1; i++) { const a = cells[i].end, b = cells[i + 1].start; if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 70) continue; h += `<path d="M${a[0]} ${a[1]} H${b[0]} V${b[1]}" fill="none" stroke="${col(i)}" stroke-opacity=".5" stroke-width=".9" stroke-dasharray="2 2"/>`; }
      for (let i = 0; i < earned && i < cells.length; i++) {
        const c = cells[i], cl = col(i); let ex = ''; for (let l = 0; l < nl - 1; l++) ex += c.extra[l];
        h += `<path ${i === earned - 1 && !o.still ? 'class="wafer-latest"' : ''} d="${c.d}" fill="none" stroke="${cl}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round"${gf}/>`
          + (ex ? `<path d="${ex}" fill="none" stroke="${cl}" stroke-opacity=".85" stroke-width="${(lw * .72).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>` : '')
          + `<circle cx="${c.end[0]}" cy="${c.end[1]}" r="${Math.max(1.2, lw * .9).toFixed(1)}" fill="${cl}"/>`;
      }
      if (o.sel != null && cells[o.sel]) { const c = cells[o.sel]; h += `<rect id="wfSel${u}" x="${c.cx - 14}" y="${c.cy - 14}" width="28" height="28" rx="3" fill="none" stroke="${dk ? '#fff' : '#0f172a'}" stroke-width="1.8"/>`; }
      h += `<circle cx="0" cy="140" r="7" fill="${dk ? '#0b1226' : '#f1f5fb'}"/><g id="waferFx${u}" style="pointer-events:none"></g></svg>`;
      return { svg: h, cells, earned };
    }
    // 눌린 위치에서 가장 가까운 새긴 칸 번호 (칸이 작아도 눌리도록 가까운 칸을 고른다)
    function pickCell(ev, wrap, m, earned) {
      const svg = wrap && wrap.querySelector('svg'); if (!svg || !ev || ev.clientX == null) return null;
      const r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * 326 - 163, y = (ev.clientY - r.top) / r.height * 326 - 163;
      const cells = waferCells(m); let best = null, bd = 20;
      for (let i = 0; i < earned && i < cells.length; i++) { const dd = Math.hypot(cells[i].cx - x, cells[i].cy - y); if (dd < bd) { bd = dd; best = i; } }
      return best;
    }

    // ---------- 홈의 웨이퍼 패널 ----------
    function renderWaferPanel() {
      const panel = document.getElementById('waferPanel'); if (!panel) return;
      const N = attendDays.length, info = waferInfo(N), t = todayData(), doneToday = attendDays.includes(dateStr()), ready = t.pts >= DAILY_GOAL;
      const { svg } = waferSVG(info);
      const btn = doneToday ? `<button disabled class="wf-btn bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300 cursor-default">✅ 오늘의 회로를 새겼어요</button>`
        : ready ? `<button onclick="attendToday()" class="wf-btn pbtn shadow-lg hover:opacity-90 transition">✨ 오늘의 회로 새기기</button>`
        : `<button disabled class="wf-btn bg-slate-100 text-slate-400 dark:bg-white/10 cursor-not-allowed">오늘의 회로 새기기</button>`;
      const st = streakNow(), now = new Date(), mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)), tk = dateStr();
      const week = ['월', '화', '수', '목', '금', '토', '일'].map((w, i) => { const d = dateStr(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i)); return `<span class="${attendDays.includes(d) ? 'on' : ''}${d === tk ? ' now' : ''}"><i></i>${w}</span>`; }).join('');
      panel.innerHTML = `<div class="rounded-2xl bg-white/80 border border-slate-200 shadow-sm dark:shadow-none dark:bg-white/[.04] dark:border-white/10 p-5 sm:p-6 h-full flex flex-col">
        <div class="flex justify-between items-start gap-3">
          <div><p class="font-mono text-[10px] tracking-[.2em] text-indigo-500 dark:text-cyan-200/70 font-bold">THIS MONTH · WAFER #${info.m + 1}</p><p class="text-sm font-bold mt-1">${info.name[1]}</p></div>
          <p class="shrink-0 text-right leading-none"><span id="waferDays" class="font-display text-3xl font-bold">${info.dm}</span><span class="text-slate-400 text-sm font-bold"> / 30</span><span class="block text-[10px] text-slate-400 mt-1">이번 달 출석일수</span></p>
        </div>
        <div class="wf-body flex-1">
        <div class="wf-svg relative mx-auto my-3 w-full max-w-[230px] aspect-square wf-open" role="button" tabindex="0" aria-label="새긴 패턴을 눌러 날짜별 학습 기록 보기" onclick="openWaferLog(event)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openWaferLog()}">${svg}</div>
        <div class="wf-week" aria-label="이번 주 출석">${week}</div>
        <p class="wf-meta">총 ${N}일${st > 1 ? ` · 🔥 ${st}일 연속` : ''}</p>
        <div class="wf-info">${btn}</div></div></div>`;
    }

    // ---------- 날짜별 기록 보기 ----------
    // 열 때·달을 바꿀 때만 전체를 그리고, 칸을 고를 때는 선택 표시와 상세 영역만 바꾼다 (웨이퍼 SVG를 다시 그리지 않아 가볍다)
    let wl = null;
    const dayParts = (s) => { const [y, m, d] = s.split('-').map(Number); return [`${m}/${d}`, ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()]]; };
    const wlW = (e) => CATS.map((c, i) => (e && e.w && e.w[i]) || 0);
    function wlBar(w, dk) { return w.reduce((a, b) => a + b, 0) ? `<div class="wl-bar">${w.map((v, i) => v ? `<i style="flex:${v};background:${CATS[i][dk ? 'd' : 'l']}"></i>` : '').join('')}</div>` : ''; }
    function wlColor() { if (!wl || wl.sel == null) return ''; const mm = dayMain(dayOfCell(wl.m, wl.sel)); return mm !== null && mm >= 0 ? CATS[mm][isDark() ? 'd' : 'l'] : ''; }
    function wlTile(i, date, dk) {
      const e = dayLog[date], mm = dayMain(date), [md, wk] = dayParts(date), hex = mm !== null && mm >= 0 ? CATS[mm][dk ? 'd' : 'l'] : null;
      const n = e ? e.th.length * 2 + e.q + e.iv : 0, a = n >= 8 ? '70' : n >= 4 ? '48' : '28', ic = e ? `${e.th.length ? '📖' : ''}${e.q ? '✏️' : ''}${e.iv ? '🎤' : ''}` : '';
      return `<button type="button" class="wl-t${i === wl.sel ? ' on' : ''}${e ? '' : ' old'}" data-i="${i}" ${hex ? `style="background:${hex}${a}"` : ''} aria-label="DAY ${wl.m * 30 + i + 1}, ${md} ${wk}요일"><b>${md}</b><small>${wk}</small><em>${ic}</em></button>`;
    }
    // 그날 과목 비율 (넓은 화면에서만 보임)
    function wlDayShare(e) {
      const w = wlW(e), tot = w.reduce((a, b) => a + b, 0), dk = isDark(); if (!tot) return '';
      return `<div class="wl-dbar"><p>그날 공부한 과목 비율</p>${wlBar(w, dk)}<div class="wl-dlg">${w.map((v, i) => v ? `<span><i style="background:${CATS[i][dk ? 'd' : 'l']}"></i>${CATS[i].s} <b>${Math.round(v / tot * 100)}%</b></span>` : '').join('')}</div></div>`;
    }
    function wlDetail() {
      if (wl.sel == null) return `<p class="wl-hint">아직 새긴 날이 없어요. 오늘의 학습을 마치고 첫 회로를 새겨 보세요.</p>`;
      const date = dayOfCell(wl.m, wl.sel), e = date ? dayLog[date] : null, mm = date ? dayMain(date) : null, hasC = mm !== null && mm >= 0, [md, wk] = date ? dayParts(date) : ['', ''];
      let h = `<div class="wl-det-h"><span class="wl-dot ${hasC ? '' : 'prism'}"></span><b>DAY ${wl.m * 30 + wl.sel + 1}</b><span>${md} (${wk})</span>${hasC ? `<em>${CATS[mm].s} 중심</em>` : ''}</div>`;
      if (!e) return h + `<p class="wl-hint">학습 기록 기능이 생기기 전에 새긴 칸이라 자세한 내용이 남아 있지 않아요.</p>`;
      h += `<div class="wl-kpi"><div>📖<b>${e.th.length}</b><small>이론</small></div><div>✏️<b>${e.q}</b><small>문제</small></div><div>🎤<b>${e.iv}</b><small>면접</small></div></div>`;
      h += wlDayShare(e);
      const qt = Object.entries(e.qt).sort((a, b) => b[1] - a[1]);
      if (e.th.length || qt.length) h += `<div class="wl-chips">${e.th.map(t => `<span class="wl-chip">📖 ${escH(t)}</span>`).join('')}${qt.map(([t, n]) => `<span class="wl-chip">✏️ ${escH(t)}<b>×${n}</b></span>`).join('')}</div>`;
      return h;
    }
    function openWaferLog(ev) {
      const info = waferInfo(attendDays.length), wrap = ev && ev.currentTarget && ev.currentTarget.classList && ev.currentTarget.classList.contains('wf-svg') ? ev.currentTarget : null;
      wl = { m: info.m, sel: wrap ? pickCell(ev, wrap, info.m, info.dm) : null, earned: 0, opener: document.activeElement };
      let o = document.getElementById('wfLog');
      if (!o) {
        o = document.createElement('div'); o.id = 'wfLog'; o.className = 'wl'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', '날짜별 학습 기록');
        o.addEventListener('click', (e) => {
          if (e.target === o) return closeWaferLog();
          const t = e.target.closest && e.target.closest('.wl-t'); if (t) return wlSelect(+t.dataset.i);
          const w = e.target.closest && e.target.closest('#wlW'); if (w && wl) { const i = pickCell(e, w, wl.m, wl.earned); if (i != null) wlSelect(i, { type: 'wafer' }); }
        });
        document.body.appendChild(o);
      }
      renderWaferLog(); requestAnimationFrame(() => o.classList.add('on'));
    }
    function closeWaferLog() { const o = document.getElementById('wfLog'); if (!o) return; o.classList.remove('on'); setTimeout(() => o.remove(), 220); if (wl && wl.opener && wl.opener.focus) try { wl.opener.focus(); } catch (e) {} wl = null; }
    function wlSelect(i, ev) {
      const o = document.getElementById('wfLog'); if (!wl || !o) return; wl.sel = i;
      const c = waferCells(wl.m)[i], r = o.querySelector('#wfSelL'); if (r && c) { r.setAttribute('x', c.cx - 14); r.setAttribute('y', c.cy - 14); }
      const on = o.querySelector('.wl-t.on'); if (on) on.classList.remove('on'); const t = o.querySelector(`.wl-t[data-i="${i}"]`); if (t) t.classList.add('on');
      const d = o.querySelector('#wlDet'); if (d) { d.innerHTML = wlDetail(); d.style.setProperty('--c', wlColor() || '#a78bfa'); if (!ev || ev.type !== 'wafer') d.scrollIntoView({ block: 'nearest' }); }
    }
    function wlCycle(dir) { if (!wl) return; const max = waferInfo(attendDays.length).m; wl.m = Math.max(0, Math.min(max, wl.m + dir)); wl.sel = null; renderWaferLog(); const o = document.getElementById('wfLog'), c = o && o.querySelector('.wl-scroll'); if (c) c.scrollTop = 0; }
    function renderWaferLog() {
      const o = document.getElementById('wfLog'); if (!o || !wl) return;
      const cur = waferInfo(attendDays.length), isCur = wl.m === cur.m, info = isCur ? cur : waferInfo((wl.m + 1) * 30), earned = info.dm, dk = isDark(), days = attendDays.slice(wl.m * 30, wl.m * 30 + 30);
      if (wl.sel == null || wl.sel >= earned) wl.sel = earned ? earned - 1 : null; wl.earned = earned;
      const { svg } = waferSVG(info, { u: 'L', sel: wl.sel, still: true, lite: true });
      const cnt = [0, 0, 0, 0]; let other = 0; days.forEach(d => { const mm = dayMain(d); if (mm !== null && mm >= 0) cnt[mm]++; else other++; });
      const tot = { th: 0, q: 0, iv: 0 }; days.forEach(d => { const e = dayLog[d]; if (e) { tot.th += e.th.length; tot.q += e.q; tot.iv += e.iv; } });
      const legend = CATS.map((c, i) => cnt[i] ? `<span class="wl-lg"><i style="background:${c[dk ? 'd' : 'l']}"></i>${c.s} <b>${cnt[i]}</b></span>` : '').join('') + (other ? `<span class="wl-lg"><i class="prism"></i>기록 이전 <b>${other}</b></span>` : '');
      const nav = cur.m > 0 ? `<div class="wl-nav"><button type="button" onclick="wlCycle(-1)" ${wl.m <= 0 ? 'disabled' : ''} aria-label="이전 달 웨이퍼">‹</button><span>${isCur ? '이번 달 웨이퍼' : `${wl.m + 1}번째 달 웨이퍼 · 완성`}</span><button type="button" onclick="wlCycle(1)" ${isCur ? 'disabled' : ''} aria-label="다음 달 웨이퍼">›</button></div>` : `<div class="wl-nav"><span>이번 달 웨이퍼</span></div>`;
      o.innerHTML = `<div class="wl-card wl-log"><div class="wl-head"><div class="wl-top"><div><p class="eyebrow">MY WAFER LOG</p><h3>날짜별 학습 기록</h3></div><button type="button" class="wl-x" onclick="closeWaferLog()" aria-label="닫기">✕</button></div>${nav}</div>
        <div class="wl-scroll"><div class="wl-l"><div class="wl-w" id="wlW">${svg}</div>
        <div class="wl-stats"><div><b>${earned}</b><small>새긴 날</small></div><div><b>${tot.th}</b><small>📖 이론</small></div><div><b>${tot.q}</b><small>✏️ 문제</small></div><div><b>${tot.iv}</b><small>🎤 면접</small></div></div>
        ${wlBar(cnt, dk)}<div class="wl-legend">${legend}</div>${cur.collected ? `<p class="wl-lgs">지금까지 수집한 웨이퍼 ${cur.collected}장</p>` : ''}</div>
        <div class="wl-r">${earned ? `<div class="wl-grid">${days.slice(0, earned).map((d, i) => wlTile(i, d, dk)).join('')}</div>` : ''}
        <div class="wl-det" id="wlDet" style="--c:${wlColor() || '#a78bfa'}">${wlDetail()}</div></div></div></div>`;
    }
    document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (document.getElementById('wfLog')) closeWaferLog(); });

    // ---------- 새기는 순간 연출 ----------
    const tween = (ms, fn) => new Promise(res => { const t0 = performance.now(); const f = (t) => { const p = Math.min(1, (t - t0) / ms); fn(p); p < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
    function runCeremony(info) {
      return new Promise(async (done) => {
        const key = dateStr(), dk = isDark(), cells = waferCells(info.m), cell = cells[info.dm - 1], sum = daySummary(key), st = streakNow(), main = dayMain(key);
        const colr = dayCol(key, dk, 'C'), newMonth = info.dm === 1 && info.m > 0, lvPrev = newMonth ? 3 : stageOf(info.dm - 1 || 1);
        const ms = { 10: ['BLUE WAFER UNLOCKED', '웨이퍼에 푸른빛이 감돌기 시작했어요'], 20: ['PRISM WAFER UNLOCKED', '프리즘 단계가 열렸어요. 웨이퍼가 무지갯빛으로 빛나요'], 30: ['WAFER COMPLETE', '이번 달 웨이퍼를 완성했어요! 다음 출석부터 새 달 웨이퍼가 열려요'] }[info.dm] || null, big = !!ms;
        const prevMonth = newMonth ? waferInfo(info.m * 30) : null;
        const start = newMonth ? waferSVG(prevMonth, { u: 'C', still: true }).svg : waferSVG(info, { u: 'C', earned: info.dm - 1, still: true, lvl: lvPrev }).svg;
        const o = document.createElement('div'); o.id = 'wfCer'; o.className = 'wfc'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', '오늘의 회로 새기기');
        o.innerHTML = `<div class="wfc-card"><p class="eyebrow wfc-eb" id="wfcEb">WAFER #${newMonth ? info.m : info.m + 1} · ${STAGES[lvPrev - 1][1]}</p>
          <div class="wfc-day"><span id="wfcN">DAY ${newMonth ? 30 : info.dm - 1}</span><small>/ 30</small></div>
          <div class="wfc-w" id="wfcW">${start}</div>
          <p class="wfc-step" id="wfcStep">${newMonth ? 'NEW WAFER' : 'STEP 01 · 레이저 활성화'}</p>
          <div class="wfc-sum" id="wfcSum"></div>
          <div class="wfc-act"><button type="button" id="wfcOk" class="pbtn wfc-ok" hidden>확인</button></div></div><button type="button" id="wfcSkip" class="wfc-skip">건너뛰기</button>`;
        document.body.appendChild(o); requestAnimationFrame(() => o.classList.add('on'));
        let skip = false, finished = false;   // 'animation reduce' OS 설정과 무관하게 연출을 보여 주고, 건너뛰기 버튼은 그대로 둔다
        const $ = (id) => document.getElementById(id);
        const tw = (ms2, fn) => new Promise(res => { const t0 = performance.now(); const f = (t) => { const p = skip ? 1 : Math.min(1, (t - t0) / ms2); fn(p); p < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
        $('wfcSkip').onclick = () => { skip = true; $('wfcSkip').hidden = true; };
        const close = () => { if (!finished) return; document.removeEventListener('keydown', onKey); o.classList.remove('on'); setTimeout(() => { o.remove(); done(); }, 250); };
        const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); if (finished) close(); else skip = true; } };
        document.addEventListener('keydown', onKey);
        await tw(500, () => {});
        if (newMonth) {   // 지난 웨이퍼가 사라지고 새 달의 웨이퍼가 나타난다
          $('wfcStep').textContent = 'NEW WAFER';
          const w = $('wfcW'); const nxt = document.createElement('div'); nxt.style.cssText = 'position:absolute;inset:0;opacity:0'; nxt.innerHTML = waferSVG(info, { u: 'N', earned: info.dm - 1, still: true, lvl: 1 }).svg; w.style.position = 'relative'; w.appendChild(nxt);
          const old = w.firstElementChild;
          await tw(1500, p => { old.style.opacity = (1 - p).toFixed(3); old.style.transform = `scale(${1 - .06 * p})`; nxt.style.opacity = p.toFixed(3); nxt.style.transform = `scale(${1.06 - .06 * p})`; });
          w.innerHTML = waferSVG(info, { u: 'C', earned: info.dm - 1, still: true, lvl: 1 }).svg; $('wfcEb').textContent = `WAFER #${info.m + 1} · ${STAGES[0][1]}`; $('wfcN').textContent = `DAY ${info.dm - 1}`;
          $('wfcStep').textContent = '새 달의 웨이퍼가 열렸어요 · 지난 웨이퍼는 수집됐어요'; await tw(1000, () => {}); $('wfcStep').textContent = 'STEP 01 · 레이저 활성화';
        }
        const fx = $('waferFxC'), step = $('wfcStep');
        fx.innerHTML = `<rect id="cFlash" x="${cell.cx - 12}" y="${cell.cy - 12}" width="24" height="24" rx="2" fill="${colr}" opacity="0"/><path id="cTrace" d="${cell.d}" fill="none" stroke="${colr}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glowC)" opacity="0"/><circle id="cLaser" r="0" cx="0" cy="0" fill="#fff" filter="url(#glowC)"/><circle id="cRing" cx="${cell.cx}" cy="${cell.cy}" r="0" fill="none" stroke="${colr}" stroke-width="2" opacity="0"/><g id="cSparks"></g>`;
        const path = $('cTrace'), laser = $('cLaser'), len = path.getTotalLength(); path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
        await tw(800, p => { laser.setAttribute('r', 3.4 * p); laser.setAttribute('cx', cell.start[0] * p); laser.setAttribute('cy', cell.start[1] * p); });
        step.textContent = 'STEP 02 · 회로 각인'; path.setAttribute('opacity', 1);
        await tw(1500, p => { path.style.strokeDashoffset = len * (1 - p); const pt = path.getPointAtLength(len * p); laser.setAttribute('cx', pt.x); laser.setAttribute('cy', pt.y); });
        step.textContent = 'STEP 03 · 패턴 활성화';
        const sp = $('cSparks'), N = 14; sp.innerHTML = Array.from({ length: N }, () => `<circle r="1.8" fill="${colr}" opacity="0"/>`).join('');
        const dots = [...sp.children]; try { navigator.vibrate && !skip && navigator.vibrate([30, 40, 70]); } catch (e) {}
        const n = $('wfcN'); n.textContent = `DAY ${info.dm}`; n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop');
        await tw(1000, p => {
          laser.setAttribute('r', 3.4 * (1 - p)); path.setAttribute('stroke-width', 2.2 + 2.6 * Math.sin(Math.PI * p));
          $('cFlash').setAttribute('opacity', (.5 * Math.sin(Math.PI * Math.min(1, p * 1.3))).toFixed(3));
          const ring = $('cRing'); ring.setAttribute('r', (4 + 80 * p).toFixed(1)); ring.setAttribute('opacity', (1 - p).toFixed(3)); ring.setAttribute('stroke-width', (3 - 2 * p).toFixed(2));
          dots.forEach((d, i) => { const a = i / N * Math.PI * 2, r = 8 + 52 * p; d.setAttribute('cx', (cell.cx + Math.cos(a) * r).toFixed(1)); d.setAttribute('cy', (cell.cy + Math.sin(a) * r).toFixed(1)); d.setAttribute('opacity', (1 - p).toFixed(3)); });
        });
        $('wfcW').innerHTML = waferSVG(info, { u: 'C', fresh: info.dm === 10 ? 2 : info.dm === 20 ? 3 : 0 }).svg; $('wfcEb').textContent = `WAFER #${info.m + 1} · ${STAGES[info.level - 1][1]}`;
        step.textContent = ms ? ms[0] : `DAY ${info.dm} COMPLETE`;
        const chip = (main !== null && main >= 0) ? `<span class="wfc-chip" style="--c:${CATS[main][dk ? 'd' : 'l']}"><i></i>${CATS[main].s} 중심</span>` : '';
        const facts = [sum && sum.text, st > 1 && `연속 ${st}일째`].filter(Boolean).join(' · ');
        const th = sum && sum.th[0] ? `<p class="wfc-th">${escH(sum.th.slice(0, 2).join(' · '))}${sum.th.length > 2 ? ` 외 ${sum.th.length - 2}` : ''}</p>` : '';
        $('wfcSum').innerHTML = `${chip}${facts ? `<p class="wfc-facts">${escH(facts)}</p>` : ''}${th}${ms ? `<p class="wfc-ms">${ms[1]}</p>` : ''}`; $('wfcSum').classList.add('on');
        if (big) { try { navigator.vibrate && navigator.vibrate([50, 60, 110]); } catch (e) {} confetti(); }
        $('wfcSkip').hidden = true; const ok = $('wfcOk'); ok.hidden = false; finished = true; ok.onclick = close; ok.focus();
      });
    }
    async function attendToday() {
      if (attendBusy) return; const t = todayData();
      if (attendDays.includes(dateStr()) || t.pts < DAILY_GOAL) return;
      attendBusy = true; attendDays.push(dateStr()); saveAttend();
      try { await runCeremony(waferInfo(attendDays.length)); } catch (e) {}
      attendBusy = false; renderWaferPanel(); renderHome(); updateHeaderChip(); tokenClaim();
    }
    function updateHeaderChip() { const t = `출석 ${attendDays.length}일`; ['navAttendText', 'sbAttendText'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = t; }); }

    // =====================================================
    // 계정(구글 로그인) · 기록 동기화
    // 설정값(firebase-config.js)이 없으면 아무것도 보이지 않고, 지금처럼 이 기기에만 저장된다.
    // 로그인하면 출석·학습 기록·오답 노트·통계·즐겨찾기가 계정에 저장돼 기기가 바뀌어도 이어진다.
    // =====================================================
    const SYNC_KEYS = ['semiCbtWafer', 'semiCbtDayLog', 'semiCbtWrong', 'semiCbtStats', 'semiCbtStarred', 'semiCbtPath', 'semiCbtGloss'];
    const _lsSet = Storage.prototype.setItem;
    let acct = { user: null, ready: false, busy: false, last: 0, err: '' }, fb = null, pushTimer = null;
    Storage.prototype.setItem = function (k, v) { _lsSet.call(this, k, v); if (this === window.localStorage && acct.user && fb && SYNC_KEYS.includes(k)) { clearTimeout(pushTimer); pushTimer = setTimeout(() => syncNow(), 2500); } };
    const jparse = (s) => { try { return s == null ? null : JSON.parse(s); } catch (e) { return null; } };
    function mergeDay(x, y) {
      const mx = (p, q) => { const o = Object.assign({}, q || {}); Object.entries(p || {}).forEach(([k, v]) => { o[k] = Math.max(o[k] || 0, v); }); return o; };
      return { w: mx(x.w, y.w), th: [...new Set([...(y.th || []), ...(x.th || [])])].slice(0, 12), q: Math.max(x.q || 0, y.q || 0), iv: Math.max(x.iv || 0, y.iv || 0), qt: mx(x.qt, y.qt) };
    }
    // 같은 기록이 두 기기에 있을 때 합치는 방법: 출석일·즐겨찾기는 합집합, 오답 노트는 더 최근 것, 날짜별 기록은 항목별로 큰 값, 통계는 문제 수가 더 많은 쪽
    const MERGE = {
      semiCbtWafer: (a, b) => ({ days: [...new Set([...(a.days || []), ...(b.days || [])])].sort() }),
      semiCbtStarred: (a, b) => [...new Set([...(b || []), ...(a || [])])],
      semiCbtGloss: (a, b) => { const o = Object.assign({}, (b && b.t) || {}); Object.entries((a && a.t) || {}).forEach(([k, v]) => { if (!o[k] || (v.l || 0) >= (o[k].l || 0)) o[k] = v; }); return { t: o }; },
      semiCbtPath: (a, b) => { const early = (x, y) => { const o = Object.assign({}, y || {}); Object.entries(x || {}).forEach(([k, v]) => { if (!o[k] || v < o[k]) o[k] = v; }); return o; }; const pl = (a.plan && (!b.plan || a.plan.date >= b.plan.date)) ? a.plan : (b.plan || null); return { pace: a.pace || b.pace || 2, read: early(a.read, b.read), quiz: early(a.quiz, b.quiz), plan: pl, seeded: 1 }; },
      semiCbtWrong: (a, b) => { const o = Object.assign({}, b); Object.entries(a).forEach(([k, v]) => { if (!o[k] || (v.last || 0) >= (o[k].last || 0)) o[k] = v; }); return o; },
      semiCbtDayLog: (a, b) => { const o = Object.assign({}, b); Object.entries(a).forEach(([d, e]) => { o[d] = o[d] ? mergeDay(e, o[d]) : e; }); return o; },
      semiCbtStats: (a, b) => {
        if (!a.cats) return b; if (!b.cats) return a;
        const big = (p, q) => { const o = Object.assign({}, q); Object.entries(p).forEach(([k, v]) => { if (!o[k] || v.t > o[k].t) o[k] = v; }); return o; };
        return { cats: big(a.cats, b.cats), topics: big(a.topics || {}, b.topics || {}), total: (a.total.t >= b.total.t ? a.total : b.total) };
      },
    };
    function reloadFromStorage() {
      const s = jparse(localStorage.getItem('semiCbtStarred')); if (Array.isArray(s)) starredIds = s;
      const w = jparse(localStorage.getItem('semiCbtWrong')); if (w && typeof w === 'object') wrongNotes = w;
      const st = jparse(localStorage.getItem('semiCbtStats')); if (st && st.cats) stats = st;
      const wf = jparse(localStorage.getItem(WAFER_KEY)); if (wf && Array.isArray(wf.days)) attendDays = wf.days;
      const dl = jparse(localStorage.getItem(LOG_KEY)); if (dl && typeof dl === 'object') dayLog = dl;
      const gs = jparse(localStorage.getItem(GM_KEY)); if (gs && gs.t) { gmState = gs; if (currentViewId === 'view-glossary' && !gmSess) glRender(); }
      const pp = jparse(localStorage.getItem(PATH_KEY)); if (pp && typeof pp === 'object') { pathState = Object.assign({ pace: 2, read: {}, quiz: {}, plan: null }, pp); if (currentViewId === 'view-path') ptRender(); }
      if (!attendBusy) { try { renderWaferPanel(); updateHeaderChip(); if (currentViewId === 'view-lobby') renderHome(); } catch (e) {} }
    }
    const ACCT_ERR = { 'auth/unauthorized-domain': '이 사이트 주소가 Firebase의 승인된 도메인에 없어요. 관리자 설정이 필요해요.', 'permission-denied': '저장 권한이 없어요. Firestore 보안 규칙 설정이 필요해요.', 'auth/network-request-failed': '네트워크 연결을 확인해 주세요.', 'unavailable': '네트워크 연결을 확인해 주세요.', 'auth/operation-not-allowed': '구글 로그인이 아직 켜져 있지 않아요. 관리자 설정이 필요해요.' };
    const acctErr = (e) => ACCT_ERR[e && e.code] || ('동기화에 실패했어요' + (e && e.code ? ` (${e.code})` : ''));
    async function syncNow() {
      if (!fb || !acct.user || acct.busy) return; acct.busy = true; acct.err = ''; renderAcct();
      try {
        await fbStore();
        const ref = fb.doc(fb.db, 'users', acct.user.uid), snap = await fb.getDoc(ref), cloud = snap.exists() ? (snap.data().data || {}) : {};
        let localChanged = false, remoteChanged = !snap.exists(); const out = {};
        SYNC_KEYS.forEach((k) => {
          const lraw = localStorage.getItem(k), l = jparse(lraw), r = jparse(cloud[k]); const m = l == null ? r : r == null ? l : MERGE[k](l, r); if (m == null) return;
          const s = JSON.stringify(m); out[k] = s; if (s !== lraw) { _lsSet.call(localStorage, k, s); localChanged = true; } if (s !== cloud[k]) remoteChanged = true;
        });
        if (remoteChanged) { if (JSON.stringify(out).length > 900000) throw { code: 'too-large' }; await fb.setDoc(ref, { v: 1, updatedAt: Date.now(), data: out }); }
        if (localChanged) reloadFromStorage();
        acct.last = Date.now();
      } catch (e) { acct.err = e && e.code === 'too-large' ? '저장할 기록이 너무 커서 동기화하지 못했어요.' : acctErr(e); }
      acct.busy = false; renderAcct();
    }
    // 로그인 부품(Firebase)은 무거워서, 필요할 때만 불러온다.
    //  - 예전에 로그인한 기기: 첫 화면이 다 뜬 뒤 한가할 때 불러와 계정을 이어 붙인다.
    //  - 로그인한 적 없는 기기: 👤 를 누를 때까지 아예 불러오지 않는다. (Firestore 는 처음 동기화할 때 따로 불러온다)
    const FB_BASE = 'https://www.gstatic.com/firebasejs/10.12.2/', ACCT_HINT = 'semiCbtAcct';
    const hintGet = () => { try { return localStorage.getItem(ACCT_HINT) === '1'; } catch (e) { return false; } };
    const hintSet = (on) => { try { on ? _lsSet.call(localStorage, ACCT_HINT, '1') : localStorage.removeItem(ACCT_HINT); } catch (e) {} };
    const idle = (fn, ms) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: ms }) : setTimeout(fn, Math.min(ms, 1500)));
    let sdkP = null, storeP = null;
    function acctSdk() {
      if (sdkP) return sdkP;
      sdkP = (async () => {
        const cfg = window.FIREBASE_CONFIG; if (!cfg || !cfg.apiKey) throw new Error('no-config');
        const [A, U] = await Promise.all([import(FB_BASE + 'firebase-app.js'), import(FB_BASE + 'firebase-auth.js')]);
        const app = A.initializeApp(cfg), auth = U.getAuth(app);
        fb = { app, auth, U };
        U.getRedirectResult(auth).catch((e) => { acct.err = acctErr(e); renderAcct(); });
        U.onAuthStateChanged(auth, (u) => { acct.user = u; if (u) hintSet(true); renderAcct(); if (u) syncNow(); walletLoad().then(() => { if (u) payResume(); }); });
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && acct.user && Date.now() - acct.last > 60000) syncNow(); });
      })().catch((e) => { sdkP = null; acct.err = '로그인 모듈을 불러오지 못했어요. 네트워크를 확인해 주세요.'; renderAcct(); throw e; });
      return sdkP;
    }
    function fbStore() {
      if (storeP) return storeP;
      storeP = import(FB_BASE + 'firebase-firestore.js').then((F) => { Object.assign(fb, { db: F.getFirestore(fb.app), doc: F.doc, getDoc: F.getDoc, setDoc: F.setDoc, deleteDoc: F.deleteDoc }); }).catch((e) => { storeP = null; throw e; });
      return storeP;
    }
    // 토큰 서버(Cloudflare Worker) 호출. 로그인 토큰만 보내고, 계정은 서버가 토큰에서 읽는다.
    const API_BASE = 'https://semicbt-api.semicarve.workers.dev';
    async function apiFetch(path, init) {
      if (!fb || !fb.auth.currentUser) throw new Error('not-signed-in');
      const tok = await fb.auth.currentUser.getIdToken();
      return fetch(API_BASE + path, Object.assign({}, init, { headers: Object.assign({}, init && init.headers, { Authorization: 'Bearer ' + tok }) }));
    }
    window.semiApi = { me: () => apiFetch('/me').then((r) => r.json()) };   // 확인용: 콘솔에서 semiApi.me()

    // =====================================================
    // 🪙 토큰 · 유료 콘텐츠 (잔액·가격·해금은 전부 서버가 정한다. 화면은 요청만 보내고 결과를 보여 준다)
    // =====================================================
    const PRM = { free: 0, paid: 0, unlocked: new Set(), bundles: [], cache: {}, loaded: false, queue: [], pumpP: null, lastSent: 0, welcomed: false, busy: false };
    const PRICE_HINT = { theory: 15, lab: 10, bundle: 22 };
    // 무료 맛보기: 토큰 없이 로그인만 하면 열리는 심화 이론 1편·장비 체험 1개(같은 장비). 서버 FREE_PREVIEW 와 같은 목록으로 맞춘다
    const FREE_PREVIEW = new Set(['TH-543f9c26', 'lab-etch']);   // 화면 안내용일 뿐, 실제 가격은 서버 카탈로그가 정한다
    async function apiJson(path, method, body) {
      const r = await apiFetch(path, { method: method || 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
      let j = {}; try { j = await r.json(); } catch (e) {}
      return { status: r.status, body: j };
    }
    function pmToast(msg) {
      const d = document.createElement('div'); d.textContent = msg; d.setAttribute('role', 'status');
      d.style.cssText = 'position:fixed;left:50%;bottom:5.5rem;transform:translateX(-50%);z-index:100;max-width:90vw;padding:.7rem 1rem;border-radius:.8rem;background:#0f172a;color:#fff;font-size:.85rem;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.3)';
      document.body.appendChild(d); setTimeout(() => d.remove(), 4200);
    }
    // 토큰을 받았을 때의 연출: 화면 가운데에서 코인이 퍼졌다가 상단 토큰 칩으로 날아가 숫자가 올라간다 (모션 줄이기 설정이면 칩만 살짝 반짝)
    function tokenBurst(n, before) {
      try {
        n = Math.max(1, Math.min(99, n | 0));
        const chip = document.getElementById('navTokens'), tx = document.getElementById('navTokensText');
        const total = PRM.free + PRM.paid, from = typeof before === 'number' ? before : total - n;
        const pulse = () => { if (!chip) return; chip.classList.remove('tk-pulse'); void chip.offsetWidth; chip.classList.add('tk-pulse'); setTimeout(() => chip.classList.remove('tk-pulse'), 700); };
        const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (still || !document.body.animate) { if (tx) tx.textContent = total; pulse(); return; }
        if (tx) tx.textContent = from;
        const vw = innerWidth, vh = innerHeight, cx = vw / 2, cy = vh * 0.42;
        let tx0 = vw - 60, ty0 = 28;
        if (chip && !chip.classList.contains('hidden')) { const b = chip.getBoundingClientRect(); if (b.width) { tx0 = b.left + 18; ty0 = b.top + b.height / 2; } }
        const layer = document.createElement('div'); layer.className = 'tkfx-layer'; layer.setAttribute('aria-hidden', 'true');
        const amt = document.createElement('div'); amt.className = 'tkfx-amt'; amt.textContent = '+' + n; amt.style.left = cx + 'px'; amt.style.top = cy + 'px'; layer.appendChild(amt);
        const cnt = Math.min(n, 8); let landed = 0;
        for (let i = 0; i < cnt; i++) {
          const c = document.createElement('div'); c.className = 'tkfx-coin'; c.innerHTML = TK(); layer.appendChild(c);
          const ang = (-Math.PI / 2) + (i - (cnt - 1) / 2) * (Math.PI * 0.75 / Math.max(cnt - 1, 1)) + (Math.random() - .5) * .25;
          const r = 70 + Math.random() * 40, bx = cx + Math.cos(ang) * r - 14, by = cy + Math.sin(ang) * r - 14;
          const a = c.animate([
            { transform: `translate(${cx - 14}px,${cy - 14}px) scale(.3)`, opacity: 0, offset: 0 },
            { transform: `translate(${bx}px,${by}px) scale(1.1)`, opacity: 1, offset: .38, easing: 'cubic-bezier(.5,0,.9,.4)' },
            { transform: `translate(${tx0 - 14}px,${ty0 - 14}px) scale(.55)`, opacity: .95, offset: 1 }
          ], { duration: 1050 + i * 70, delay: i * 55, fill: 'forwards', easing: 'cubic-bezier(.25,.8,.3,1)' });
          a.onfinish = () => { landed++; if (tx) tx.textContent = Math.min(total, from + Math.ceil(n * landed / cnt)); pulse(); };
        }
        amt.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-80%) scale(1.15)', opacity: 1, offset: .3 }, { transform: 'translate(-50%,-130%) scale(1)', opacity: 0 }], { duration: 1300, easing: 'ease-out', fill: 'forwards' });
        document.body.appendChild(layer);
        setTimeout(() => { layer.remove(); if (tx) tx.textContent = PRM.free + PRM.paid; }, 1050 + cnt * 70 + cnt * 55 + 250);
      } catch (e) { const tx = document.getElementById('navTokensText'); if (tx) tx.textContent = PRM.free + PRM.paid; }
    }
    function tokenRender() {
      const chip = document.getElementById('navTokens'), tx = document.getElementById('navTokensText');
      const on = !!(acct.user && PRM.loaded);
      if (chip) chip.classList.toggle('hidden', !on); if (tx) tx.textContent = PRM.free + PRM.paid;
      if (typeof renderAcct === 'function') renderAcct();
      pmBadges();
    }
    async function walletLoad() {
      if (!acct.user) { PRM.loaded = false; PRM.free = PRM.paid = 0; PRM.unlocked = new Set(); PRM.bundles = []; PRM.cache = {}; PRM.queue = []; tokenRender(); return; }
      try {
        const r = await apiJson('/me');
        if (r.status === 200) { PRM.free = r.body.free; PRM.paid = r.body.paid; PRM.unlocked = new Set(r.body.unlocked || []); PRM.bundles = r.body.bundles || []; PRM.loaded = true; }
      } catch (e) {}
      tokenRender(); premiumRefresh();
      if (PRM.loaded && !PRM.welcomed) { PRM.welcomed = true; tokenWelcome(); }
    }
    function premiumRefresh() {   // 잔액·해금이 바뀌었을 때 지금 보고 있는 유료 화면을 다시 그린다
      try {
        if (currentViewId === 'view-learning' && learnState.level === 'detail' && learnState.theoryId) { const t = allTheories.find(x => x.id === learnState.theoryId); if (t && t.premium) renderDetailDOM(t.id); }
        else if (currentViewId === 'view-lab' && typeof enterLab === 'function') { const k = labKind; if (k && !window[LABS[k].g]) enterLab(); }
      } catch (e) {}
    }
    // 학습 기록을 서버에 보낸다 (서버는 기록 사이 3초 이상을 요구하므로 줄을 세워 천천히 보낸다)
    function studySend(kind, id) { if (!acct.user || !id) return; PRM.queue.push({ kind, id }); studyPump(); }
    function studyPump() {
      if (PRM.pumpP) return PRM.pumpP;
      PRM.pumpP = (async () => {
        while (PRM.queue.length) {
          const wait = 3300 - (Date.now() - PRM.lastSent); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
          const e = PRM.queue.shift(); PRM.lastSent = Date.now();
          try { await apiJson('/study', 'POST', e); } catch (err) {}
        }
      })().finally(() => { PRM.pumpP = null; });
      return PRM.pumpP;
    }
    async function tokenClaim() {
      if (!acct.user) return;
      try {
        await studyPump();
        const r = await apiJson('/claim', 'POST');
        if (r.status !== 200) return;
        const before = PRM.free + PRM.paid;
        PRM.free = r.body.free; PRM.paid = r.body.paid; PRM.loaded = true; tokenRender();
        if (r.body.granted) { const n = r.body.amount || (PRM.free + PRM.paid - before) || 1; tokenBurst(n, before); pmToast('출석 보상으로 토큰 ' + n + '개를 받았어요'); }
        else if (r.body.reason === 'not_enough_points') pmToast('로그인한 상태로 쌓은 학습 점수만 토큰으로 인정돼요 (지금 ' + r.body.points + ' / ' + r.body.goal + ')');
        else if (r.body.reason === 'free_cap') pmToast('무료 토큰이 가득 찼어요 (최대 30개). 해금에 써 보세요');
        tokenWelcome();
      } catch (e) {}
    }
    async function tokenWelcome() {
      try {
        const r = await apiJson('/welcome', 'POST');
        if (r.status === 200 && r.body.granted) { const before = PRM.free + PRM.paid; PRM.free = r.body.free; PRM.paid = r.body.paid; tokenRender(); tokenBurst(PRM.free + PRM.paid - before || 3, before); pmToast('🎁 환영 토큰 3개를 받았어요'); }
      } catch (e) {}
    }
    async function premiumFetch(id) {
      if (PRM.cache[id] || PRM.fetching === id) return; PRM.fetching = id;
      try {
        // 영어 모드는 번역본을 요청한다 (번역본이 아직 없으면 서버가 한국어 본문으로 돌려준다). 언어는 페이지 로드 때 정해지므로 캐시를 따로 나눌 필요는 없다
        const r = await apiJson('/content/' + encodeURIComponent(id) + (window.LANG === 'en' ? '?lang=en' : ''));
        if (r.status === 200 && r.body.body) { PRM.cache[id] = r.body.body; premiumRefresh(); }
      } catch (e) {}
      PRM.fetching = null;
    }
    // 해금(토큰 사용) 전에 한 번 더 확인한다: 무엇을, 얼마를, 어떤 토큰으로 쓰는지 + 사용한 토큰은 환불되지 않는다는 고지
    function pmConfirm(name, price) {
      return new Promise((resolve) => {
        const free = PRM.free, paid = PRM.paid, useF = Math.min(free, price), useP = price - useF;
        const o = document.createElement('div'); o.className = 'pmg'; o.id = 'pmc'; o.style.zIndex = '99'; o.setAttribute('role', 'alertdialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-labelledby', 'pmcT');
        const use = [useF ? `무료 ${useF}` : '', useP ? `유료 ${useP}` : ''].filter(Boolean).join(' + ');
        o.innerHTML = `<div class="pmg-card pmc-card"><span class="pmg-tick"><i></i>CONFIRM</span><h3 id="pmcT">토큰을 사용해 해금할까요?</h3>
          <div class="pmc-item"><b>${escH(name)}</b><span>${TK()}${price}</span></div>
          <dl class="pmc-rows"><div><dt>사용하는 토큰</dt><dd>${use} <small>(무료 토큰이 먼저 쓰여요)</small></dd></div><div><dt>해금 후 남는 토큰</dt><dd>${TK()}${free + paid - price} <small>무료 ${free - useF} · 유료 ${paid - useP}</small></dd></div></dl>
          <p class="pmc-warn">${ico('lock')}<span><b>해금에 사용한 토큰은 환불되지 않아요.</b> 해금하면 이 계정에서 계속 볼 수 있어요.</span></p>
          <div class="pmc-btns"><button type="button" class="tkb" id="pmcOk" disabled>${price}토큰 사용하고 해금</button><button type="button" class="pmg-later" id="pmcNo">취소</button></div></div>`;
        const done = (v) => { window.removeEventListener('keydown', onKey, true); o.classList.remove('on'); setTimeout(() => o.remove(), 220); resolve(v); };
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(false); } };
        window.addEventListener('keydown', onKey, true);
        o.addEventListener('click', (e) => { if (e.target === o) done(false); });
        document.body.appendChild(o);
        const ok = o.querySelector('#pmcOk'); ok.onclick = () => done(true); o.querySelector('#pmcNo').onclick = () => done(false);
        requestAnimationFrame(() => o.classList.add('on'));
        setTimeout(() => { ok.disabled = false; try { ok.focus({ preventScroll: true }); } catch (e) {} }, 450);   // 같은 자리를 연달아 눌러 바로 확정되는 실수를 막는다
      });
    }
    async function premiumUnlock(id) {
      if (PRM.busy || document.getElementById('pmc')) return;
      const bd = (PRM.bundles || []).find((b) => b.id === id), isLab = String(id).indexOf('lab-') === 0;
      const price = bd ? bd.price : PRICE_HINT[isLab ? 'lab' : 'theory'];
      const name = bd ? '이론 + 장비 체험 번들' : isLab ? ((LABS[id.slice(4)] || {}).title || '장비 체험') : ((allTheories.find((x) => x.id === id) || {}).title || '이 글');
      if (!(await pmConfirm(name, price))) return;
      return premiumUnlockDo(id);
    }
    async function premiumUnlockDo(id) {
      if (PRM.busy) return; PRM.busy = true;
      try {
        const r = await apiJson('/unlock', 'POST', { contentId: id });
        if (r.status === 200 && r.body.unlocked) {
          PRM.free = r.body.free; PRM.paid = r.body.paid;
          (Array.isArray(r.body.items) ? r.body.items : [id]).forEach((x) => PRM.unlocked.add(x));   // 번들이면 묶인 콘텐츠가 모두 열린다
          tokenRender(); pmToast(r.body.already ? '이미 해금돼 있어요' : '해금했어요');
        }
        else if (r.status === 402) { PRM.free = r.body.free; PRM.paid = r.body.paid; tokenRender(); pmToast('토큰이 모자라요 (필요 ' + r.body.price + ')'); }
        else if (r.status === 409) pmToast('그 사이 상태가 바뀌어서 다시 계산했어요. 한 번 더 눌러 주세요.');
        else pmToast('해금하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      } catch (e) { pmToast('서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'); }
      PRM.busy = false;
      try { await walletLoad(); } catch (e) {}   // 잔액·해금·번들 가격을 서버 기준으로 다시 맞춘다 (premiumRefresh 도 여기서 불린다)
      premiumRefresh();
    }
    // 잠금 카드: 로그인 전 / 로그인 후(잔액 표시 · 해금 버튼) / 해금됨(불러오는 중)
    // 짝이 되는 콘텐츠도 아직 없을 때만 번들을 권한다 (하나라도 가졌으면 번들이 단품과 같아져서 필요 없다)
    function bundleOf(id) {
      const bd = (PRM.bundles || []).find((b) => !b.owned && b.items.includes(id)); if (!bd) return null;
      const rest = bd.items.filter((x) => !PRM.unlocked.has(x)); if (rest.length < 2) return null;
      const sum = rest.reduce((a, x) => a + (String(x).indexOf('lab-') === 0 ? PRICE_HINT.lab : PRICE_HINT.theory), 0);
      return { id: bd.id, price: bd.price, sum, save: sum - bd.price };
    }
    function bundleBlock(id, have) {
      const bd = bundleOf(id); if (!bd) return '';
      return `<div class="pm-bundle"><div class="pmb-h">${ico('pack')}<b>이론 + 장비 체험 번들</b><span>${TK()}${bd.price}</span></div>`
        + (bd.save > 0 ? `<small>따로 사면 ${bd.sum}토큰 · <em>${bd.save}토큰 할인</em></small>` : '')
        + (have >= bd.price ? `<button type="button" class="tkb ghost" onclick="premiumUnlock('${bd.id}')">${TK()} ${bd.price}토큰으로 둘 다 해금하기</button>` : `<small class="pm-sub">번들은 토큰이 ${bd.price - have}개 모자라요</small>`) + `</div>`;
    }
    // 검색용 본문: 해금 전 유료 글은 본문이 없으니(공개 데이터는 안내 한 줄뿐) 제목·태그로만 찾는다
    function pmBody(t) { return t.premium && !PRM.cache[t.id] ? '' : String(t.content || ''); }
    // 잠금 배지: 이론 카드·장비 체험 카드에 🔒 / 🔓 해금됨. 상태가 바뀔 때마다 pmBadges 가 다시 맞춘다.
    function pmLkState(id) {   // 배지의 모양을 한 곳에서 정한다: 무료 맛보기 / 해금됨 / 잠금
      let on = false; try { on = !!(acct.user && PRM.loaded && PRM.unlocked.has(id)); } catch (e) {}
      if (FREE_PREVIEW.has(id)) return { cls: ' free', html: ico('unlock') + ' 무료 맛보기', title: '토큰 없이 볼 수 있어요 (로그인 필요)' };
      return { cls: on ? ' on' : '', html: on ? ico('unlock') + ' 해금됨' : ico('lock'), title: on ? '해금됨' : '토큰으로 해금' };
    }
    function pmLk(id) { const st = pmLkState(id); return `<span class="pm-lk${st.cls}" data-pm="${id}" title="${st.title}">${st.html}</span>`; }
    function pmBadges() {
      document.querySelectorAll('[onclick^="labOpen("]').forEach((b) => {
        const m = /labOpen\('([a-z]+)'\)/.exec(b.getAttribute('onclick') || ''); if (!m || !LABS[m[1]] || b.querySelector('.pm-lk')) return;
        const tmp = document.createElement('span'); tmp.innerHTML = pmLk('lab-' + m[1]); const el = tmp.firstChild, tg = b.querySelector('.ex-tg');
        if (tg) b.insertBefore(el, tg); else b.appendChild(el);
      });
      document.querySelectorAll('.pm-lk[data-pm]').forEach((el) => {
        const st = pmLkState(el.dataset.pm);
        el.classList.toggle('on', st.cls === ' on'); el.classList.toggle('free', st.cls === ' free'); el.innerHTML = st.html; el.title = st.title;
      });
    }
    setTimeout(pmBadges, 0);

    // 해금 팝업: 유료 이론·장비 체험에 들어갈 때 한 번 띄운다. 닫으면 미리보기 + 잠금 카드가 그대로 보인다.
    function pmGateClose() {
      const o = document.getElementById('pmg'); if (!o) return;
      o.id = ''; o.classList.remove('on'); setTimeout(() => o.remove(), 230);
      if (pmGateOpener && pmGateOpener.focus) { try { pmGateOpener.focus({ preventScroll: true }); } catch (e) {} } pmGateOpener = null;
    }
    function pmGateMaybe(id, kind) {
      if (!acct.user && hintGet()) return;   // 로그인 복원 중이면 기다린다 (이미 로그인한 사람에게 로그인 안내가 번쩍이지 않게)
      if (acct.user && !PRM.loaded) return;  // 잔액 확인 중
      if (PRM.unlocked.has(id)) { pmGateClose(); return; }
      const cur = document.getElementById('pmg');
      if (cur) { if (cur.dataset.id === id) { pmGateFill(cur, id, kind); return; } cur.remove(); }
      if (pmGateId === id) return;           // 이번 방문에서 이미 닫았다
      pmGateId = id; pmGateOpener = document.activeElement;
      const o = document.createElement('div'); o.id = 'pmg'; o.className = 'pmg'; o.dataset.id = id;
      o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-labelledby', 'pmgT');
      o.addEventListener('click', (e) => { if (e.target === o) pmGateClose(); });
      document.body.appendChild(o); pmGateFill(o, id, kind);
      requestAnimationFrame(() => { o.classList.add('on'); const f = o.querySelector('.pmg-cta') || o.querySelector('.pmg-of:not(:disabled)') || o.querySelector('.pmg-later'); if (f) f.focus({ preventScroll: true }); });
    }
    function pmGateFill(o, id, kind) {
      let title, sub, tick, ic, pts;
      if (kind === 'lab') {
        const k = id.slice(4), L = LABS[k], gt = allTheories.find((x) => x.category === ADV_CAT && x.lab === k);
        title = L.title; sub = L.desc; tick = 'EQUIPMENT LAB'; ic = ico('flask');
        pts = ['<b>직접 조작</b> — 공정 조건을 바꿔 가며 결과가 어떻게 달라지는지 바로 확인해요', '<b>단면과 수치로 확인</b> — 읽기만으로는 잡히지 않는 장비 감각을 손으로 익혀요']
          .concat(gt ? [`<b>짝이 되는 가이드</b> — “${escH(gt.title)}”와 같은 조건으로 따라 해 볼 수 있어요`] : []);
      } else {
        const t = allTheories.find((x) => x.id === id) || { title: '', lab: '' };
        title = t.title; tick = 'ADVANCED · FIELD GUIDE'; ic = ico('book');
        sub = '장비를 실제로 다루는 사람의 눈으로 정리한 글이에요. 교과서 개념을 넘어 현장에서 쓰는 판단 순서까지 담았어요.';
        pts = ['<b>한 편에 끝까지</b> — 개요 · 구조 · 레시피 · 결과 읽기 · 트러블슈팅' + (t.mins ? ` (약 ${t.mins}분 분량)` : ''), '<b>상황별 대처</b> — 현장에서 마주치는 상황마다 어떻게 대응하는지 정리했어요']
          .concat(t.lab && LABS[t.lab] ? [`<b>바로 실습</b> — 읽은 뒤 “${escH(LABS[t.lab].title)}”에서 같은 조건으로 따라 해 볼 수 있어요`] : []);
      }
      const price = PRICE_HINT[kind], have = PRM.free + PRM.paid;
      let body;
      if (!acct.user && FREE_PREVIEW.has(id)) body = `<button type="button" class="pmg-cta" onclick="pmGateLogin()">구글 로그인하고 무료로 보기</button><p class="pmg-wallet">무료 맛보기예요 · 로그인만 하면 토큰 없이 바로 볼 수 있어요</p>`;
      else if (!acct.user) body = `<button type="button" class="pmg-cta" onclick="pmGateLogin()">구글 로그인하고 시작하기</button><p class="pmg-wallet">로그인하고 하루 학습 미션을 채우면 토큰을 5개씩 받아요</p>`;
      else {
        const bd = bundleOf(id);
        const mk = (cid, label, note, pr, rec) => `<button type="button" class="pmg-of${rec ? ' rec' : ''}"${have >= pr ? '' : ' disabled'} onclick="pmGateUnlock('${cid}')"><span><b>${label}</b><small>${note}</small></span><span class="pr">${TK()}${pr}</span></button>`;
        const offers = (bd ? mk(bd.id, '이론 + 장비 체험 번들', `<em>${bd.save}토큰 할인</em> · 따로 사면 ${bd.sum}토큰`, bd.price, true) : '')
          + mk(id, kind === 'lab' ? '장비 체험만' : '이 글만', '이 계정에 영구 해금', price, !bd);
        const min = bd ? Math.min(bd.price, price) : price;
        body = `<div class="pmg-offers">${offers}</div>` + (have < min ? `<p class="pmg-warn">토큰이 ${min - have}개 모자라요 · 오늘의 학습 미션을 채워 출석하면 하루 5개씩 받아요 · <button type="button" class="underline" onclick="earnOpen()">토큰 얻는 법</button></p>` : '')
          + (have < min ? `<button type="button" class="pmg-cta" onclick="payFromGate()">${TK()} 토큰 충전하기</button>` : '') + `<p class="pmg-wallet">${TK()} 내 토큰 ${have}개 · 무료 ${PRM.free} · 유료 ${PRM.paid}</p>`;
      }
      o.innerHTML = `<div class="pmg-card"><button type="button" class="pmg-x" aria-label="닫기" onclick="pmGateClose()">✕</button>`
        + `<div class="pmg-ic" aria-hidden="true">${ic}</div><span class="pmg-tick"><i></i>${tick}</span><h3 id="pmgT">${escH(title)}</h3><p class="pmg-sub">${escH(sub)}</p>`
        + `<ul class="pmg-pts">${pts.map((x) => `<li>${x}</li>`).join('')}</ul>${body}`
        + `<p class="pmg-fine">한 번 해금하면 이 계정에서 계속 볼 수 있고, 이후 개정본도 추가 비용이 없어요. 해금에 쓴 토큰은 환불되지 않아요.</p><button type="button" class="pmg-later" onclick="pmGateClose()">나중에 볼게요</button></div>`;
    }
    function pmGateLogin() { pmGateId = null; pmGateClose(); openAcct(); }
    function payFromGate() { pmGateClose(); payOpen(); }
    async function pmGateUnlock(cid) {
      const o = document.getElementById('pmg'); if (o) o.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      await premiumUnlock(cid);
      const cur = document.getElementById('pmg'); if (!cur) return;
      const id = cur.dataset.id;
      if (PRM.unlocked.has(id)) pmGateClose(); else pmGateFill(cur, id, id.indexOf('lab-') === 0 ? 'lab' : 'theory');   // 실패(잔액 부족 등)면 최신 상태로 다시 그린다
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('pmg')) pmGateClose(); });

    function premiumLock(id, kind) {
      const el = document.createElement('div'); el.className = 'pm-lock';
      const whatTopic = kind === 'lab' ? '이 장비 체험은' : '이 글의 나머지는', whatObj = kind === 'lab' ? '이 장비 체험을' : '이 글의 나머지를', whatFree = kind === 'lab' ? '이 장비 체험은' : '이 글은';
      const price = PRICE_HINT[kind];
      const head = (ic, t, p) => `<div class="pml-ic" aria-hidden="true">${ico(ic)}</div><h4>${t}</h4>${p ? `<p>${p}</p>` : ''}`;
      let h;
      if (!acct.user && FREE_PREVIEW.has(id)) h = head('unlock', `${whatFree} 무료 맛보기예요`, '구글 로그인만 하면 토큰 없이 바로 볼 수 있어요.') + `<div class="pml-btns"><button type="button" class="tkb" onclick="openAcct()">로그인하고 무료로 보기</button></div>`;
      else if (!acct.user) h = head('lock', `${whatTopic} 토큰으로 열어요`, `구글 로그인 후, 하루 학습 미션을 채우고 출석하면 토큰을 5개씩 받아요. 토큰 ${price}개로 계정에 영구 해금돼요.`) + `<div class="pml-btns"><button type="button" class="tkb" onclick="openAcct()">로그인하고 시작하기</button></div>`;
      else if (!PRM.loaded) h = head('lock', '확인하는 중…');
      else if (PRM.unlocked.has(id)) h = head('unlock', '불러오는 중…');
      else {
        const have = PRM.free + PRM.paid;
        h = head('lock', `${whatObj} 보려면 토큰 ${price}개가 필요해요`, '해금하면 이 계정에서 계속 볼 수 있어요.')
          + `<div class="pml-wal">${TK()}<span>내 토큰 <b>${have}</b></span><i>무료 ${PRM.free} · 유료 ${PRM.paid}</i></div>`
          + `<div class="pml-btns">` + (have >= price ? `<button type="button" class="tkb" onclick="premiumUnlock('${id}')">${TK()} ${price}토큰으로 해금하기</button>` : `<button type="button" class="tkb" onclick="payOpen()">${TK()} 토큰 충전하기</button>`) + `</div>`
          + (have < price ? `<p class="pm-sub pml-miss">토큰이 ${price - have}개 모자라요 · 오늘의 학습 미션을 채워 출석하면 하루 5개씩 받아요 · <button type="button" class="underline" onclick="earnOpen()">토큰 얻는 법</button></p>` : '')
          + bundleBlock(id, have);
      }
      el.innerHTML = h; return el;
    }
    async function acctInit() {
      const btn = document.getElementById('acctBtn'); if (!btn || acct.ready) return;
      try { await new Promise((res) => { const s = document.createElement('script'); s.src = ROOT + 'firebase-config.js?v=' + Date.now(); s.onload = s.onerror = res; document.head.appendChild(s); }); } catch (e) {}
      const cfg = window.FIREBASE_CONFIG; if (!cfg || !cfg.apiKey) return;
      acct.ready = true; btn.classList.remove('hidden'); renderAcct();
      if (hintGet()) idle(() => acctSdk().catch(() => {}), 4000);
      else try { indexedDB.databases().then((l) => { if (l.some((d) => d.name === 'firebaseLocalStorageDb')) idle(() => acctSdk().catch(() => {}), 4000); }).catch(() => {}); } catch (e) {}   // 힌트가 없어도 로그인 흔적이 있으면 이어 붙인다
    }
    async function acctSignIn() {
      if (!fb) { acct.err = '로그인 모듈을 아직 불러오는 중이에요. 잠시 뒤 다시 눌러 주세요.'; renderAcct(); return; }
      acct.err = ''; hintSet(true); const prov = new fb.U.GoogleAuthProvider();
      try { await fb.U.signInWithPopup(fb.auth, prov); }
      catch (e) {
        if (e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request')) return;
        if (e && e.code === 'auth/popup-blocked') { try { await fb.U.signInWithRedirect(fb.auth, prov); return; } catch (e2) { e = e2; } }
        acct.err = acctErr(e); renderAcct();
      }
    }
    async function acctSignOut(wipe) {
      if (!fb) return; await syncNow();   // 평소엔 묻지 않고 로그아웃만 한다. 공용 기기는 '로그아웃하고 이 기기 기록 지우기'를 쓴다.
      try { await fb.U.signOut(fb.auth); } catch (e) {}
      hintSet(false);
      if (wipe) { SYNC_KEYS.concat([TODAY_KEY]).forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} }); starredIds = []; wrongNotes = {}; stats = { cats: {}, topics: {}, total: { r: 0, t: 0 } }; attendDays = []; dayLog = {}; reloadFromStorage(); }
      closeAcct();
    }
    async function acctDelete() {
      if (!fb || !acct.user) return;
      // 서버 기록(학습 기록·남은 토큰)부터 지운다. 서버가 거부하면(환불 처리 중·잔액 변경) 아무것도 지우지 않고 멈춘다.
      try { await walletLoad(); } catch (e) {}
      const paid = PRM.paid, free = PRM.free;
      const tokenMsg = (paid + free) > 0 ? `\n\n⚠ 남은 토큰 ${paid + free}개(무료 ${free} · 유료 ${paid})는 모두 사라져요.${paid > 0 ? '\n미사용 유료 토큰의 환불은 삭제 전에 「토큰 충전 · 결제 내역」에서 신청해 주세요. 삭제하면 환불받을 수 없어요.' : ''}` : '';
      if (!confirm('계정에 저장된 학습 기록을 모두 삭제할까요?\n이 기기에 있는 기록은 그대로 남지만, 다른 기기와의 동기화는 끊겨요.\n삭제한 기록은 되돌릴 수 없어요.' + tokenMsg + '\n\n결제·해금 기록은 법령에 따라 5년간 보관돼요.')) return;
      try {
        const r = await apiJson('/account/delete', 'POST', { confirm: true, paid });
        if (r.status !== 200 || !r.body.ok) {
          acct.err = r.status === 409 && r.body.error === 'refund_in_progress' ? '환불이 처리 중이에요. 완료된 뒤 다시 시도해 주세요.'
            : r.status === 409 ? '토큰 잔액이 방금 바뀌었어요. 다시 눌러 확인해 주세요.' : '서버 기록을 삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
          if (r.status === 409) { try { await walletLoad(); } catch (e) {} }
          renderAcct(); return;
        }
      } catch (e) { acct.err = '서버와 연결하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.'; renderAcct(); return; }
      try { await fbStore(); await fb.deleteDoc(fb.doc(fb.db, 'users', acct.user.uid)); try { await acct.user.delete(); } catch (e) {} try { await fb.U.signOut(fb.auth); } catch (e) {} hintSet(false); closeAcct(); alert('계정에 저장된 기록을 삭제했어요.'); }
      catch (e) { acct.err = acctErr(e); renderAcct(); }
    }
    const gLogo = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';
    function openAcct() { let o = document.getElementById('acctM'); if (!o) { o = document.createElement('div'); o.id = 'acctM'; o.className = 'wl'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', '내 계정'); o.addEventListener('click', (e) => { if (e.target === o) closeAcct(); }); document.body.appendChild(o); } renderAcct(); requestAnimationFrame(() => o.classList.add('on')); acctSdk().catch(() => {}); }
    function closeAcct() { const o = document.getElementById('acctM'); if (!o) return; o.classList.remove('on'); setTimeout(() => o.remove(), 220); }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('acctM')) closeAcct(); });
    function ago(t) { if (!t) return '아직 동기화 전'; const s = Math.round((Date.now() - t) / 1000); return s < 10 ? '방금 전' : s < 60 ? `${s}초 전` : s < 3600 ? `${Math.round(s / 60)}분 전` : `${Math.round(s / 3600)}시간 전`; }
    function renderAcct() {
      const btn = document.getElementById('acctBtn');
      if (btn) { const u = acct.user; btn.innerHTML = u ? (u.photoURL ? `<img src="${escH(u.photoURL)}" alt="" referrerpolicy="no-referrer" class="w-7 h-7 rounded-full">` : `<b class="text-xs">${escH((u.displayName || u.email || '?').slice(0, 1).toUpperCase())}</b>`) : '로그인'; btn.title = u ? `${u.displayName || u.email} · 로그인됨` : '로그인'; btn.classList.toggle('acct-on', !!u); btn.classList.toggle('acct-off', !u); }
      const o = document.getElementById('acctM'); if (!o) return;
      const u = acct.user, priv = `<a href="${ROOT}privacy.html" target="_blank" rel="noopener" class="underline">개인정보 처리방침</a>`, err = acct.err ? `<p class="ac-err">${escH(acct.err)}</p>` : '';
      o.innerHTML = u ? `<div class="wl-card ac-card"><div class="wl-top"><div><p class="eyebrow">MY ACCOUNT</p><h3>내 계정</h3></div><button type="button" class="wl-x" onclick="closeAcct()" aria-label="닫기">✕</button></div>
          <div class="ac-me">${u.photoURL ? `<img src="${escH(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : '<span>👤</span>'}<div><b>${escH(u.displayName || '구글 계정')}</b><p>${escH(u.email || '')}</p></div></div>
          <div class="ac-stat"><span>${acct.busy ? '동기화 중…' : '마지막 동기화'}</span><b>${acct.busy ? '' : ago(acct.last)}</b></div>
          <div class="ac-stat"><span>토큰</span><b class="ac-tk">${TK()}${PRM.free + PRM.paid}<small>무료 ${PRM.free} · 유료 ${PRM.paid}</small></b></div>
          <button type="button" class="pay-open" onclick="payOpen()">${TK()} 토큰 충전 · 결제 내역</button>
          <button type="button" class="earn-link" onclick="earnOpen()">${ico('info')} 토큰 얻는 법 보기</button>
          <p class="ac-note">출석 ${attendDays.length}일 · 오답 노트 ${Object.keys(wrongNotes).length}개 · 즐겨찾기 ${starredIds.length}개가 이 계정과 연결돼 있어요. 기록은 이 기기와 계정에 함께 저장돼요.</p>${err}
          <div class="ac-btns"><button type="button" class="pbtn" onclick="syncNow()" ${acct.busy ? 'disabled' : ''}>지금 동기화</button><button type="button" class="ac-ghost" onclick="acctSignOut()">로그아웃</button></div>
          <button type="button" class="ac-del" onclick="if(confirm('로그아웃하고 이 기기에 저장된 학습 기록을 지울까요?\n(기록은 계정에 남아 있어서 다시 로그인하면 돌아와요.)'))acctSignOut(true)">공용 기기라면: 로그아웃하고 이 기기 기록 지우기</button>
          <button type="button" class="ac-del" onclick="acctDelete()">계정에 저장된 내 기록 삭제</button><p class="ac-priv">${priv}</p></div>`
        : `<div class="wl-card ac-card"><div class="wl-top"><div><p class="eyebrow">MY ACCOUNT</p><h3>내 기록을 계정에 저장하기</h3></div><button type="button" class="wl-x" onclick="closeAcct()" aria-label="닫기">✕</button></div>
          <ul class="ac-list"><li>폰과 PC에서 같은 출석·웨이퍼·오답 노트를 이어 쓸 수 있어요</li><li>브라우저 데이터를 지워도 기록이 남아요</li><li>지금까지 이 기기에 쌓은 기록은 그대로 계정으로 합쳐져요</li></ul>
          <button type="button" class="ac-google" onclick="acctSignIn()">${gLogo}<span>구글로 로그인</span></button>${err}
          <p class="ac-note">로그인하지 않아도 모든 기능을 그대로 쓸 수 있어요. 구글 이름·이메일·프로필 사진과 학습 기록만 저장해요.</p><p class="ac-priv">${priv}</p></div>`;
    }
    idle(acctInit, 3000);
    function updateNav() {
      const v = currentViewId, map = { 'view-lobby': 'home', 'view-flow': 'home', 'view-experience': 'home', 'view-equip': 'home', 'view-fab': 'home', 'view-lab': 'home', 'view-glossary': 'glossary', 'view-path': 'home', 'view-subjects': 'subjects', 'view-learning': 'theory', 'view-quiz': 'quiz', 'view-result': 'quiz', 'view-interview': 'interview', 'view-exam': 'quiz', 'view-note': 'note', 'view-careers': 'careers', 'view-setup': currentMode === 'interview' ? 'interview' : (document.getElementById('examToggle') && document.getElementById('examToggle').checked ? 'exam' : 'quiz') };
      document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === map[v] || (v === 'view-glossary' && b.classList.contains('mt-btn') && b.dataset.nav === 'theory')));
      document.body.dataset.view = v; document.body.dataset.lvl = learnState.level;   // 모바일 화면 조정용 (하단 탭 숨김, 이론 머리글 숨김)
    }
    function renderHome() {
      const el = (id) => document.getElementById(id); if (!el('homeSubjects')) return;
      const now = new Date(), wd = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];
      el('homeDate').textContent = `${now.getMonth() + 1}월 ${now.getDate()}일 ${wd}요일`;
      const T = stats.total, pct = T.t ? Math.round(T.r / T.t * 100) : 0, wc = allQuizData.filter(q => wrongNotes[q.id]).length, t = todayData();
      const nd = el('homeNoteDesc'); if (nd && !nd.dataset.def) nd.dataset.def = nd.textContent;
      if (nd) nd.textContent = wc ? `복습할 오답 ${wc}문제가 기다리고 있어요` : nd.dataset.def;
      const intro = el('introSec'); if (intro) { let seen = false; try { seen = !!localStorage.getItem('semiCbtIntroSeen'); } catch (e) {} intro.classList.toggle('hidden', seen || attendDays.length > 0 || stats.total.t > 0); }
      renderRoutine();
      if (!attendBusy) renderWaferPanel(false);
      updateHeaderChip();
    }
    function startCategory(kind, cat) { folderCtx = { category: cat, subject: null }; startFolder(kind); }
    function renderHomeSubjects() {
      const box = document.getElementById('homeSubjects'); if (!box) return;
      const col = (p) => p >= 80 ? '#10b981' : p >= 50 ? '#f59e0b' : '#f43f5e';
      const cats = FIXED_CATEGORIES.filter(c => c !== ADV_CAT && (CATEGORY_TREE[c] || allTheories.some(t => t.category === c) || allQuizData.some(q => q.category === c)));
      const T = stats.total, card = 'sj-card', q = (c) => escH(c).replace(/'/g, '&#39;');
      const info = cats.map(cat => { const st = stats.cats[cat], recent = subjectAcc(cat); return { cat, th: allTheories.filter(t => t.category === cat).length, qn: allQuizData.filter(x => x.category === cat).length, t: st ? st.t : 0, r: st ? st.r : 0, p: st && st.t ? Math.round(st.r / st.t * 100) : null, recent }; });
      const weak = info.filter(x => x.recent !== null && x.recent < 0.7).sort((a, b) => a.recent - b.recent);
      const order = info.slice().sort((a, b) => (a.p === null) - (b.p === null) || (a.p === null ? 0 : a.p - b.p));
      const rb = document.getElementById('subReset'); if (rb) rb.classList.toggle('hidden', !T.t);
      const act = (x) => `<div class="sj-act"><button type="button" onclick="navTo('view-learning',{level:'category',category:'${q(x.cat)}'})">📖 이론</button><button type="button" class="on" ${x.qn ? '' : 'disabled'} onclick="startCategory('quiz','${q(x.cat)}')">✏️ 문제 풀기</button></div>`;
      const kpi = T.t ? `<div class="${card}"><div class="sj-kpi"><div><small>푼 문제</small><b>${T.t}</b></div><div><small>정답률</small><b style="color:${col(Math.round(T.r / T.t * 100))}">${Math.round(T.r / T.t * 100)}%</b></div><div><small>오답 노트</small><b>${allQuizData.filter(x => wrongNotes[x.id]).length}</b></div></div></div>` : '';
      const rows = order.map(x => `<div class="sj-row"><div class="sj-top"><b>${escH(x.cat)}</b>${weak.includes(x) ? '<span class="sj-weak">약점</span>' : ''}<span class="sj-p">${x.p === null ? '아직 안 풀었어요' : `${x.r}/${x.t} · ${x.p}%`}</span></div>
        <div class="sj-bar"><i style="width:${x.p === null ? 0 : x.p}%;background:${x.p === null ? 'transparent' : col(x.p)}"></i></div>
        <div class="sj-sub"><span>이론 ${x.th} · 문제 ${x.qn}</span>${act(x)}</div></div>`).join('');
      const wk = !T.t ? '' : `<div class="${card}"><h3 class="sj-h">🎯 약점 리포트 <small>과목별 · 최근 풀이 정답률 70% 미만</small></h3>${weak.length ? weak.map(x => `<div class="sj-wk"><div class="sj-top"><b>${escH(x.cat)}</b><span class="sj-p" style="color:${col(Math.round(x.recent * 100))}">최근 ${Math.round(x.recent * 100)}%</span></div><div class="sj-sub"><span>이론을 다시 읽고 풀면 약점에서 빠져요</span><div class="sj-act"><button type="button" class="on" onclick="startCategory('quiz','${q(x.cat)}')">✏️ 이 과목 풀기</button></div></div></div>`).join('') : '<p class="sj-ok">아직 뚜렷한 약점이 없어요. 잘하고 있어요! 👍</p>'}</div>`;
      box.innerHTML = kpi + (rows ? `<div class="${card}"><h3 class="sj-h">과목별 정답률 <small>약한 순</small></h3>${rows}</div>` : '<div class="sj-card sj-ok">콘텐츠를 불러오는 중이에요.</div>') + wk;
    }

    // =====================================================
    // 아이콘 시스템: 텍스트 속 이모지를 사이트 톤에 맞는 라인 SVG로 자동 교체
    // =====================================================
    const ICON = {
      search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
      folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
      layers: '<path d="M12 3 3 8l9 5 9-5-9-5zM3 12.5l9 5 9-5M3 16.5l9 5 9-5"/>',
      book: '<path d="M2 5.5C4 4 8 4 12 6c4-2 8-2 10-.5V19c-2-1.5-6-1.5-10 .5-4-2-8-2-10-.5z"/><path d="M12 6v13.5"/>',
      pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
      chat: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.4A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" stroke-width="2.6"/>',
      timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
      home: '<path d="M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6"/>',
      chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
      notebook: '<path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6z"/><path d="M9 3v18M12 8h4M12 12h4"/>',
      moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
      sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
      xcircle: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
      check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
      alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01" stroke-width="2.2"/>',
      repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
      grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
      bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
      target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
      trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>',
      file: '<path d="M6 3h8l5 5v13H6zM14 3v5h5M9 13h7M9 17h7"/>',
      pin: '<path d="M12 17v5M8 3h8l-1 7 3 3H6l3-3z"/>',
      link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
      x: '<path d="M6 6l12 12M18 6L6 18"/>',
      menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
      chevron: '<path d="M9 6l6 6-6 6"/>',
      star: '<path d="M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.3l-5.6 3 1.2-6.3L3 9.6l6.3-.8z"/>',
      starfill: '<path d="M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.3l-5.6 3 1.2-6.3L3 9.6l6.3-.8z" fill="currentColor"/>',
      none: ''
    };
    const EMOJI_ICON = { '🔍': 'search', '📁': 'folder', '📂': 'folder', '📚': 'layers', '📖': 'book', '📝': 'pencil', '✏': 'pencil', '🗣': 'chat', '⏱': 'timer', '🏠': 'home', '📊': 'chart', '📒': 'notebook', '🌙': 'moon', '☀': 'sun', '✨': 'sparkle', '❌': 'xcircle', '✅': 'check', '⭕': 'check', '🚨': 'alert', '🔁': 'repeat', '🧩': 'grid', '🎯': 'target', '🏆': 'trophy', '📄': 'file', '📌': 'pin', '🔗': 'link', '✕': 'x', '☰': 'menu', '❯': 'chevron', '★': 'starfill', '☆': 'star', '🎉': 'none', '💪': 'none', '👍': 'none' };
    const EMO_RE = new RegExp('(' + Object.keys(EMOJI_ICON).join('|') + ')\\uFE0F?', 'g');
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION', 'TITLE', 'INPUT']);
    function iconHTML(name) { return `<span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg></span>`; }
    function iconize(root) {
      if (!root) return;
      const nodes = [];
      if (root.nodeType === 3) nodes.push(root);
      else if (root.nodeType === 1 && !SKIP_TAGS.has(root.tagName)) { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) nodes.push(n); }
      nodes.forEach(n => {
        const par = n.parentNode; if (!par || SKIP_TAGS.has(par.tagName) || !n.nodeValue) return;
        EMO_RE.lastIndex = 0; if (!EMO_RE.test(n.nodeValue)) return;
        const html = n.nodeValue.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(EMO_RE, (m, ch) => { const k = EMOJI_ICON[ch]; return k === 'none' ? '' : iconHTML(k); });
        const tpl = document.createElement('template'); tpl.innerHTML = html; par.replaceChild(tpl.content, n);
      });
    }
    let emoPending = new Set(), emoRaf = 0;
    const emoObserver = new MutationObserver((muts) => {
      muts.forEach(m => { if (m.type === 'characterData') emoPending.add(m.target); else m.addedNodes.forEach(n => emoPending.add(n)); });
      if (!emoRaf) emoRaf = requestAnimationFrame(flushEmo);
    });
    function flushEmo() {
      emoRaf = 0;
      const set = emoPending; emoPending = new Set();
      emoObserver.disconnect();
      set.forEach(n => { if (!n.isConnected) return; for (let p = n.parentNode; p; p = p.parentNode) if (set.has(p)) return; iconize(n); });
      emoObserver.takeRecords();
      emoObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    iconize(document.body); emoObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

    // ✨ 모션: 숫자 올라가기 / 보기 화면 전환 / 축하 효과
    const REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function countUp(el) {
      const to = parseFloat(el.dataset.cu); if (isNaN(to)) return; if (REDUCE || to === 0) { el.textContent = to; return; }
      const t0 = performance.now(), dur = 900;
      const f = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(to * e); if (p < 1) requestAnimationFrame(f); }; requestAnimationFrame(f);
    }
    function runCountUps(root) { (root || document).querySelectorAll('[data-cu]').forEach(countUp); }
    function confetti() {
      if (REDUCE) return; const colors = ['#67e8f9', '#818cf8', '#e879f9', '#fbbf24', '#34d399'];
      for (let i = 0; i < 46; i++) { const d = document.createElement('i'); d.className = 'confetti-piece'; d.style.left = (Math.random() * 100) + 'vw'; d.style.background = colors[i % colors.length];
        d.style.setProperty('--dx', ((Math.random() - .5) * 240) + 'px'); d.style.setProperty('--rot', (Math.random() * 900 - 450) + 'deg'); d.style.animationDelay = (Math.random() * .5) + 's'; d.style.animationDuration = (1.8 + Math.random() * 1.2) + 's';
        document.body.appendChild(d); setTimeout(() => d.remove(), 3500); }
    }
    // ===== 🚨 오류 제보 =====
    let reportTarget = null;
    function setReportMsg(text, kind) {
      const el = document.getElementById('reportMsg');
      el.textContent = text;
      el.className = 'text-xs mt-2 min-h-[1rem] ' + (kind === 'err' ? 'text-rose-500' : kind === 'ok' ? 'text-indigo-500' : 'text-slate-400');
    }
    function openReportModal() {
      const item = filteredSession[currentIndex];
      if (!item) return;
      reportTarget = { id: String(item.id || ''), text: String(item.question || '').slice(0, 120) };
      const short = reportTarget.text.length > 40 ? reportTarget.text.slice(0, 40) + '…' : reportTarget.text;
      document.getElementById('reportTarget').textContent = `대상: ${reportTarget.id} · ${short}`;
      document.getElementById('reportContent').value = '';
      document.getElementById('reportSubmitBtn').disabled = false;
      setReportMsg('', '');
      const m = document.getElementById('reportModal'); m.classList.remove('hidden'); m.classList.add('flex');
      setTimeout(() => document.getElementById('reportContent').focus(), 50);
    }
    function closeReportModal() {
      const m = document.getElementById('reportModal'); m.classList.remove('flex'); m.classList.add('hidden');
    }
    async function submitReport() {
      if (!reportTarget) return;
      const content = document.getElementById('reportContent').value.trim();
      if (content.length < 5) return setReportMsg('5자 이상 적어 주세요.', 'err');
      let last = 0; try { last = Number(localStorage.getItem('semiCbtLastReport') || 0); } catch (e) {}
      if (Date.now() - last < 15000) return setReportMsg('잠시 후 다시 제보해 주세요.', 'err');
      const btn = document.getElementById('reportSubmitBtn');
      btn.disabled = true; setReportMsg('전송 중...', 'info');
      await ensureSupabase();
      if (!supabaseClient) { btn.disabled = false; return setReportMsg('서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.', 'err'); }
      const { error } = await supabaseClient.from('error_reports').insert({
        question_id: reportTarget.id,
        question_text: reportTarget.text,
        content: content,
        status: 'pending'
      });
      if (error) {
        console.error('제보 실패:', error);
        btn.disabled = false;
        return setReportMsg('전송 실패: ' + (error.message || '알 수 없는 오류'), 'err');
      }
      try { localStorage.setItem('semiCbtLastReport', String(Date.now())); } catch (e) {}
      setReportMsg('✅ 제보가 접수되었습니다. 감사합니다!', 'ok');
      setTimeout(closeReportModal, 1200);
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeReportModal(); });
    // 📁 폴더 단위 풀기: 폴더(대분류/소분류)에 속한 이론과 연결된 문제·면접을 모아서 출제
    let folderCtx = null;
    function folderPool(kind, category, subject) {
      const data = kind === 'quiz' ? allQuizData : allInterviewData, map = new Map();
      allTheories.filter(t => t.category === category && (!subject || t.subject === subject) && !String(t.content).includes('채워질 예정'))
        .forEach(t => matchItems(data, t.title).forEach(x => map.set(x.id, x)));
      if (!subject) data.filter(x => x.category === category).forEach(x => map.set(x.id, x));
      return [...map.values()];
    }
    function folderBar(category, subject) {
      folderCtx = { category, subject };
      const q = folderPool('quiz', category, subject).length, i = folderPool('interview', category, subject).length;
      if (!q && !i) return '';
      const cls = 'flex-1 text-sm font-bold py-3 rounded-xl border transition disabled:opacity-40 disabled:cursor-not-allowed ';
      return `<div class="col-span-full mt-6 pt-6 border-t border-slate-200 dark:border-white/10">
        <p class="eyebrow mb-3" style="color:#94a3b8">PRACTICE · ${subject ? '이 폴더' : '이 분류'}로 연습하기</p>
        <div class="flex flex-col sm:flex-row gap-2.5">
          <button onclick="startFolder('quiz')" ${q ? '' : 'disabled'} class="${cls}border-slate-200 dark:border-white/15 bg-white dark:bg-[#0f1729] text-slate-700 dark:text-slate-200 fbtn fbtn-q hover:border-indigo-400 dark:hover:border-cyan-300/60">🧩 문제 풀기 <span class="text-xs text-slate-400">${q ? q + '문항' : '준비 중'}</span></button>
          <button onclick="startFolder('interview')" ${i ? '' : 'disabled'} class="${cls}border-slate-200 dark:border-white/15 bg-white dark:bg-[#0f1729] text-slate-700 dark:text-slate-200 fbtn fbtn-i hover:border-rose-400 dark:hover:border-rose-300/70">🗣️ 면접 연습 <span class="text-xs text-slate-400">${i ? i + '문항' : '준비 중'}</span></button></div></div>`;
    }
    function startFolder(kind) {
      if (!folderCtx) return;
      const list = folderPool(kind, folderCtx.category, folderCtx.subject); if (!list.length) return;
      filteredSession = list.sort(() => Math.random() - 0.5).slice(0, kind === 'quiz' ? 10 : 5);
      currentKeyword = null; currentIndex = 0; correctCount = 0; sessionLog = []; currentMode = kind;
      navTo(kind === 'quiz' ? 'view-quiz' : 'view-interview'); if (kind === 'quiz') renderQuiz(); else renderInterview();
    }

    // ▶ 이어 풀기: 풀던 세션(문제/면접)을 저장해 두었다가 홈에서 이어서 시작
    const RESUME_KEY = 'semiCbtResume';
    function loadResume() {
      try { const r = JSON.parse(localStorage.getItem(RESUME_KEY)); if (r && r.ids && r.ids.length && r.next < r.ids.length && Date.now() - r.t < 7 * 864e5) return r; } catch (e) {}
      return null;
    }
    function saveResume() {
      if (currentMode !== 'quiz' && currentMode !== 'interview') return;
      if (currentIndex + 1 >= filteredSession.length) return clearResume();
      try { localStorage.setItem(RESUME_KEY, JSON.stringify({ mode: currentMode, ids: filteredSession.map(x => x.id), next: currentIndex + 1, correct: correctCount, kw: currentKeyword, log: sessionLog.map(r => r ? { id: r.q.id, picked: r.picked } : null), t: Date.now() })); } catch (e) {}
    }
    function clearResume() { try { localStorage.removeItem(RESUME_KEY); } catch (e) {} renderResumeBanner(); }
    function renderResumeBanner() {
      const b = document.getElementById('resumeBanner'), r = loadResume();
      if (!r) { b.className = 'hidden'; b.innerHTML = ''; return; }
      b.className = 'bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-2xl p-4 flex items-center gap-3';
      b.innerHTML = `<div class="flex-1 min-w-0"><div class="text-sm font-bold text-amber-800 dark:text-amber-400">▶ 풀던 ${r.mode === 'quiz' ? '문제' : '면접'}가 있어요</div><div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">${r.next} / ${r.ids.length}문항까지 진행</div></div>
        <button onclick="resumeSession()" class="bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm px-4 py-2 rounded-xl shrink-0">이어 풀기</button>
        <button onclick="clearResume()" aria-label="삭제" class="text-slate-400 hover:text-rose-500 text-lg px-1">✕</button>`;
    }
    function resumeSession() {
      const r = loadResume(); if (!r) return;
      const pool = r.mode === 'quiz' ? allQuizData : allInterviewData, list = r.ids.map(id => pool.find(x => x.id === id)).filter(Boolean);
      if (list.length !== r.ids.length) { clearResume(); return alert('일부 문항이 바뀌어서 이어 풀 수 없어요.'); }
      filteredSession = list; currentIndex = r.next; correctCount = r.correct || 0; currentKeyword = r.kw || null; currentMode = r.mode;
      sessionLog = (r.log || []).map(e => { const q = e && list.find(x => x.id === e.id); return q ? { q, picked: e.picked, ok: e.picked === q.answer } : null; });
      navTo(r.mode === 'quiz' ? 'view-quiz' : 'view-interview'); if (r.mode === 'quiz') renderQuiz(); else renderInterview();
    }

    // 🔍 통합 검색 (이론 · 문제 · 면접)
    let searchTimer = null;
    function debouncedSearch() { clearTimeout(searchTimer); searchTimer = setTimeout(runGlobalSearch, 180); }
    function runGlobalSearch() {
      const q = document.getElementById('globalSearchInput').value.trim().toLowerCase(), out = document.getElementById('globalSearchResults');
      const sec = 'text-xs font-bold text-slate-400 dark:text-slate-500 mb-2';
      const card = 'bg-white dark:bg-[#0f1729] border border-slate-200 dark:border-white/10 rounded-xl';
      if (!q) { out.innerHTML = `<p class="text-center text-sm text-slate-400 py-10">이론 제목·본문, 문제, 면접 질문을 한 번에 찾아 드려요.</p>`; return; }
      const has = (...vals) => vals.some(v => String(Array.isArray(v) ? v.join(' ') : v || '').toLowerCase().includes(q));
      const real = (t) => !String(t.content).includes('채워질 예정');
      const th = allTheories.filter(t => real(t) && has(t.title, t.title_en, t.tags, pmBody(t))).slice(0, 8);
      const qs = allQuizData.filter(x => has(x.question, x.topic, x.options, x.explanation)).slice(0, 15);
      const iv = allInterviewData.filter(x => has(x.question, x.topic, x.key_points, x.interview_answer)).slice(0, 10);
      if (!th.length && !qs.length && !iv.length) { out.innerHTML = `<p class="text-center text-sm text-slate-400 py-10">'${escH(q)}' 검색 결과가 없어요.</p>`; return; }
      let h = '';
      if (th.length) h += `<div><p class="${sec}">📖 이론 ${th.length}</p><div class="space-y-2">${th.map(t => `<button onclick="openTheory('${escH(t.id)}')" class="${card} w-full text-left p-4 hover:border-indigo-400 dark:hover:border-[#67e8f9] transition"><div class="font-bold text-slate-900 dark:text-white">${escH(t.title)}</div><div class="text-[11px] text-slate-400 mt-1">${escH(t.category)} › ${escH(t.subject)}</div></button>`).join('')}</div></div>`;
      if (qs.length) h += `<div><p class="${sec}">📝 문제 ${qs.length}</p><div class="space-y-2">${qs.map((x, n) => `<div class="${card}"><button data-sx="q${n}" class="w-full text-left p-4"><div class="text-[11px] text-slate-400 mb-1">${escH(x.category)}</div><div class="text-sm font-bold text-slate-800 dark:text-slate-100">${escH(x.question)}</div></button><div id="sx-q${n}" class="hidden px-4 pb-4 text-sm"><p class="text-emerald-600 dark:text-indigo-400 font-bold mb-2">정답: ${x.answer + 1}번 · ${escH(x.options[x.answer])}</p><p class="text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-[#0a1020] rounded-lg p-3">${escH(x.explanation)}</p>${theoryLinkHtml(x)}</div></div>`).join('')}</div></div>`;
      if (iv.length) h += `<div><p class="${sec}">🗣️ 면접 ${iv.length}</p><div class="space-y-2">${iv.map((x, n) => `<div class="${card}"><button data-sx="i${n}" class="w-full text-left p-4"><div class="text-[11px] text-slate-400 mb-1">${escH(x.category)}</div><div class="text-sm font-bold text-slate-800 dark:text-slate-100">${escH(x.question)}</div></button><div id="sx-i${n}" class="hidden px-4 pb-4 text-sm"><div class="flex flex-wrap gap-1 mb-2">${(x.key_points || []).map(k => `<span class="bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 px-2 py-0.5 rounded text-xs font-bold">#${escH(k)}</span>`).join('')}</div><p class="text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-[#0a1020] rounded-lg p-3">${escH(x.interview_answer)}</p></div></div>`).join('')}</div></div>`;
      out.innerHTML = h; applyMathRendering();
    }
    document.getElementById('globalSearchResults').addEventListener('click', (e) => { const b = e.target.closest('[data-sx]'); if (b) document.getElementById('sx-' + b.dataset.sx).classList.toggle('hidden'); });

    // ⌨️ 단축키 (PC): 숫자키=보기 선택, Enter/→/Space=다음, ←=이전(모의고사), S=즐겨찾기
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''))) return;
      if (!document.getElementById('reportModal').classList.contains('hidden')) return;
      const k = e.key, num = /^[1-9]$/.test(k) ? Number(k) - 1 : -1, next = (k === 'Enter' || k === ' ' || k === 'ArrowRight');
      const click = (el) => { if (el && !el.disabled) { e.preventDefault(); el.click(); return true; } return false; };
      if (currentViewId === 'view-quiz') {
        if (num >= 0) click(document.getElementById('qOptions').children[num]);
        else if (next && !document.getElementById('qExpBox').classList.contains('hidden')) click(document.getElementById('qNextBtn'));
        else if (k === 's' || k === 'S') toggleStar();
      } else if (currentViewId === 'view-interview') {
        if (next) { if (ivSkip) return ivSkip(); if (ivFinishTyping()) return; if (!document.getElementById('iRevealBtn').classList.contains('hidden')) click(document.getElementById('iRevealBtn')); else click(document.getElementById('iNextBtn')); }
      } else if (currentViewId === 'view-exam' && exam) {
        if (num >= 0) click(document.getElementById('exOptions').children[num]);
        else if (k === 'ArrowRight') examGo(1); else if (k === 'ArrowLeft') examGo(-1);
      }
    });


    // ===== 🧭 웨이퍼 한 장의 여정 (한눈에 보기) =====
    // 단계를 고르면 웨이퍼 단면 그림에 층이 하나씩 쌓인다. 내용(글)은 전부 여기에 직접 적은 것이라 AI 생성 글이 아니다.
    const FJ_FOLDER = '반도체 8대 공정';
    const FJ_STAGES = [
      { n: '웨이퍼', scene: 'A', title: '모래에서 얇은 원판으로', sub: '1단계 · 웨이퍼 제조', sub2: '1. 웨이퍼 제조 공정',
        what: '모래에서 뽑은 실리콘을 아주 높은 순도로 정제해 녹이고, 원자가 가지런히 배열된 단결정 기둥(잉곳)으로 키워요. 이 기둥을 얇게 잘라 거울처럼 연마하면 칩이 올라갈 바탕, 웨이퍼가 돼요.',
        why: '원자 배열이 흐트러지면 전기가 고르게 흐르지 못해요. 그래서 하나의 결정으로 이어진 실리콘이 필요해요. 지금은 지름 300 mm(12인치) 웨이퍼가 주로 쓰여요.',
        legend: [['si', '단결정 실리콘 웨이퍼']] },
      { n: '산화', scene: 'A', title: '표면에 유리막 입히기', sub: '2단계 · 산화 공정', sub2: '2. 산화 공정 (Oxidation)',
        what: '고온에서 산소나 수증기와 반응시켜 웨이퍼 표면에 아주 얇은 실리콘 산화막(SiO₂)을 만들어요. 실리콘이 스스로 유리 같은 막으로 변하는 거예요.',
        why: '산화막은 전기가 새지 않게 막아 주고, 뒤따르는 공정에서 표면을 보호하거나 가려 주는 역할을 해요. 트랜지스터의 게이트 절연막도 이 막에서 출발해요.',
        legend: [['si', '실리콘 웨이퍼'], ['ox', '산화막(SiO₂)']] },
      { n: '포토', scene: 'A', title: '회로 그림을 웨이퍼에 옮기기', sub: '3단계 · 포토 공정', sub2: '3. 포토 공정 (Photo)',
        what: '빛에 반응하는 감광액(포토레지스트)을 바르고, 회로 모양이 새겨진 마스크를 통해 빛을 쬐어요. 현상하면 빛을 받은 부분만 녹아 없어지면서 회로 모양의 틀이 남아요.',
        why: '머리카락보다 훨씬 가는 회로를 정해진 자리에 정확히 그리려면, 빛으로 한꺼번에 찍어 내는 방법이 필요해요.',
        note: '3~6단계는 층마다 되풀이돼요. 칩 하나에 이런 층이 수십 겹 쌓여요.',
        legend: [['si', '실리콘 웨이퍼'], ['ox', '산화막'], ['pr', '감광막(포토레지스트)'], ['mask', '마스크(회로 그림)'], ['uv', '빛']] },
      { n: '식각', scene: 'A', title: '틀대로 깎아내기', sub: '4단계 · 식각 공정', sub2: '4. 식각 공정 (Etching)',
        what: '감광막이 가려 주지 않는 부분을 화학 용액(습식)이나 플라즈마(건식)로 깎아내요. 감광막이 방패 역할을 하니, 틀 모양대로 아래 막이 파여요.',
        why: '빛으로 그린 평면 그림을 실제 입체 구조로 바꾸는 단계예요. 원하는 곳만 깎고 나머지는 지키는 정밀함이 중요해요.',
        legend: [['si', '실리콘 웨이퍼'], ['ox', '산화막'], ['pr', '감광막'], ['etch', '깎아내는 방향']] },
      { n: '증착·주입', scene: 'A', title: '막을 쌓고 성질을 입히기', sub: '5단계 · 박막 증착과 이온 주입', sub2: '5. 박막 증착 공정 (Deposition)',
        what: '감광막을 벗겨 낸 뒤, 박막 증착으로 얇은 막(절연막·금속막)을 한 겹씩 쌓아요. 이온 주입으로는 불순물 이온을 실리콘에 쏘아, 전기가 흐르는 성질(n형·p형)을 가진 영역을 만들어요.',
        why: '트랜지스터는 서로 성질이 다른 층과 영역이 맞붙어서 만들어져요. 이 단계에서 그 재료가 갖춰져요.',
        legend: [['si', '실리콘 웨이퍼'], ['ox', '산화막'], ['dop', '불순물 주입 영역'], ['dep', '증착된 박막']] },
      { n: '배선', scene: 'A', title: '트랜지스터끼리 연결하기', sub: '6단계 · 금속 배선 공정', sub2: '6. 금속 배선 공정 (Metallization)',
        what: '구리 같은 금속으로 길(배선)을 놓아 수십억 개의 트랜지스터를 서로 이어요. 절연막에 홈을 파고 금속을 채운 뒤 평평하게 갈아 내는 다마신 방식을 많이 써요.',
        why: '소자가 아무리 좋아도 연결되지 않으면 회로가 되지 않아요. 배선이 가늘고 길수록 신호가 느려지는 것도 이 단계의 숙제예요.',
        note: '3~6단계는 층마다 되풀이돼요. 칩 하나에 이런 층이 수십 겹 쌓여요.',
        legend: [['si', '실리콘 웨이퍼'], ['ox', '산화막'], ['dop', '주입 영역'], ['dep', '박막'], ['ild', '절연막'], ['cu', '구리 배선']] },
      { n: '테스트', scene: 'B', title: '웨이퍼째로 검사하기', sub: '7단계 · EDS 테스트', sub2: '7. EDS 공정 (Testing)',
        what: '웨이퍼를 자르기 전에, 칩(다이)마다 가는 탐침을 대고 전기 신호를 보내 제대로 동작하는지 검사해요. 불량 칩에는 표시를 하고, 메모리는 예비 회로로 고치기도 해요.',
        why: '불량 칩을 일찍 걸러야 값비싼 패키징 비용을 아낄 수 있어요. 웨이퍼 한 장에서 양품이 차지하는 비율이 수율이에요.',
        legend: [['good', '양품 칩'], ['bad', '불량 칩'], ['probe', '탐침(프로브)']] },
      { n: '패키징', scene: 'C', title: '칩을 쓸 수 있는 부품으로', sub: '8단계 · 패키징 공정', sub2: '8. 패키징 공정 (Packaging)',
        what: '웨이퍼를 칩 단위로 자르고, 양품만 기판에 붙여요. 가는 금속선(와이어)이나 범프로 외부와 이은 뒤 몰딩 수지로 감싸고, 마지막 검사를 통과하면 출하돼요.',
        why: '칩은 그대로 두면 충격·습기·열에 약하고, 보드와도 연결할 수 없어요. 패키지는 칩을 보호하고 전기와 열이 드나드는 길을 만들어 줘요.',
        legend: [['si', '칩(다이)'], ['pcb', '패키지 기판'], ['cu', '본딩 와이어'], ['mold', '몰딩 수지'], ['ball', '솔더볼']] }
    ];
    const FJ_BASE = [
      { t: '반도체 물리', d: '전자는 어떻게 움직일까? 밴드·캐리어·PN 접합', cat: '반도체 기초 이론', sub: '반도체 물리' },
      { t: '트랜지스터 소자', d: '스위치가 되는 부품, MOSFET과 문턱 전압', cat: '반도체 소자', sub: '트랜지스터 소자' },
      { t: '메모리 반도체', d: '데이터를 저장하는 칩, DRAM과 NAND', cat: '반도체 소자', sub: '메모리 반도체' },
      { t: '차세대 첨단 기술', d: '더 작고 빠르게, FinFET·GAA·HBM', cat: '차세대 첨단 기술', sub: '' }
    ];
    const FJ_LABELS = { A: '웨이퍼 단면 그림', B: '웨이퍼 위 칩 검사 그림', C: '패키지 단면 그림' };
    let fjIdx = 0, fjTimer = null, fjBuilt = false;
    const fjEl = (id) => document.getElementById(id);

    function fjBuildSvg() {
      const svg = fjEl('fjSvg'); if (!svg || fjBuilt) return; fjBuilt = true;
      const v = (n) => `var(--fj-${n})`;
      const arrow = (x, y1, y2, color) => `<path d="M${x},${y1} V${y2} M${x - 6},${y2 - 7} L${x},${y2} L${x + 6},${y2 - 7}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
      // 장면 A: 웨이퍼 단면 (1~6단계). 층마다 data-s 에 '보이는 단계'를 적는다.
      let lat = ''; for (let x = 32; x <= 330; x += 20) for (let y = 152; y <= 202; y += 16) lat += `<circle cx="${x}" cy="${y}" r="2.2"/>`;
      const A = `<g class="fj-scene" data-scene="A">
        <rect x="20" y="140" width="320" height="70" rx="3" fill="${v('si')}"/>
        <g class="fj-lat" fill="#fff">${lat}</g>
        <g class="fj-ly" data-s="2,3,4,5,6" fill="${v('ox')}"><rect x="20" y="124" width="90" height="16"/><rect x="150" y="124" width="60" height="16"/><rect x="250" y="124" width="90" height="16"/></g>
        <g class="fj-ly" data-s="2,3" fill="${v('ox')}"><rect x="109" y="124" width="42" height="16"/><rect x="209" y="124" width="42" height="16"/></g>
        <g class="fj-ly" data-s="3,4" fill="${v('pr')}"><rect x="20" y="100" width="90" height="24" rx="2"/><rect x="150" y="100" width="60" height="24" rx="2"/><rect x="250" y="100" width="90" height="24" rx="2"/></g>
        <g class="fj-ly" data-s="3" fill="${v('mask')}"><rect x="20" y="58" width="90" height="8" rx="2"/><rect x="150" y="58" width="60" height="8" rx="2"/><rect x="250" y="58" width="90" height="8" rx="2"/></g>
        <g class="fj-ly" data-s="3">${arrow(130, 18, 52, v('uv'))}${arrow(230, 18, 52, v('uv'))}</g>
        <g class="fj-ly" data-s="4">${arrow(130, 98, 126, v('etch'))}${arrow(230, 98, 126, v('etch'))}</g>
        <g class="fj-ly" data-s="5,6"><rect x="112" y="140" width="36" height="16" rx="5" fill="${v('dop')}"/><rect x="212" y="140" width="36" height="16" rx="5" fill="${v('dop')}"/>
          <g fill="#fff" opacity=".8"><circle cx="122" cy="146" r="1.8"/><circle cx="130" cy="151" r="1.8"/><circle cx="138" cy="146" r="1.8"/><circle cx="222" cy="146" r="1.8"/><circle cx="230" cy="151" r="1.8"/><circle cx="238" cy="146" r="1.8"/></g></g>
        <path class="fj-ly" data-s="5,6" d="M20,120 H110 V137 H150 V120 H210 V137 H250 V120 H340" fill="none" stroke="${v('dep')}" stroke-width="6" stroke-linejoin="round"/>
        <g class="fj-ly" data-s="6"><rect x="20" y="96" width="320" height="24" fill="${v('ild')}"/>
          <g fill="${v('cu')}"><rect x="114" y="124" width="32" height="10"/><rect x="122" y="96" width="16" height="28"/><rect x="214" y="124" width="32" height="10"/><rect x="222" y="96" width="16" height="28"/><rect x="118" y="86" width="124" height="11" rx="2"/></g></g>
      </g>`;
      // 장면 B: 웨이퍼를 위에서 본 그림 + 탐침 (7단계). 양품/불량 칩 배치는 고정된 규칙으로 만든다.
      const cx = 180, cy = 117, R = 98, cw = 18, ch = 14, gap = 2; let dies = '', probeDie = null, best = 1e9;
      for (let r = -7; r <= 7; r++) for (let c = -9; c <= 9; c++) {
        const x = cx + c * (cw + gap) - cw / 2, y = cy + r * (ch + gap) - ch / 2;
        const fx = [x, x + cw], fy = [y, y + ch]; let inside = true;
        fx.forEach((px) => fy.forEach((py) => { if ((px - cx) ** 2 + (py - cy) ** 2 > (R - 5) ** 2) inside = false; }));
        if (!inside) continue;
        const bad = ((r * 7 + c * 13 + 100) % 11 === 0) || (r === 2 && c === -3);
        dies += `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="2" fill="${bad ? v('bad') : v('good')}"/>`;
        const d = (x + cw / 2 - 226) ** 2 + (y + ch / 2 - 72) ** 2; if (!bad && d < best) { best = d; probeDie = [x, y]; }
      }
      const B = `<g class="fj-scene" data-scene="B">
        <circle cx="${cx}" cy="${cy}" r="${R}" fill="${v('si')}"/><circle cx="${cx}" cy="${cy + R - 1}" r="6" fill="var(--fj-soft)"/>
        ${dies}
        <rect x="${probeDie[0] - 1.5}" y="${probeDie[1] - 1.5}" width="${cw + 3}" height="${ch + 3}" rx="3" fill="none" stroke="#fff" stroke-width="2"/>
        <path d="M${probeDie[0] + cw / 2},${probeDie[1] + ch / 2} L${probeDie[0] + cw / 2 + 30},${probeDie[1] - 40}" stroke="${v('probe')}" stroke-width="2.4" stroke-linecap="round"/>
        <rect x="${probeDie[0] + cw / 2 + 14}" y="${probeDie[1] - 52}" width="78" height="12" rx="4" fill="${v('probe')}"/>
      </g>`;
      // 장면 C: 패키지 단면 (8단계)
      let balls = ''; for (let i = 0; i < 8; i++) balls += `<circle cx="${72 + i * 31}" cy="176" r="7"/>`;
      const C = `<g class="fj-scene" data-scene="C">
        <rect x="76" y="62" width="208" height="92" rx="12" fill="${v('mold')}" opacity=".45" stroke="${v('mold')}" stroke-width="2"/>
        <rect x="46" y="152" width="268" height="14" rx="3" fill="${v('pcb')}"/>
        <g fill="${v('ball')}" stroke="${v('mold')}" stroke-width="1">${balls}</g>
        <rect x="118" y="118" width="124" height="28" rx="3" fill="${v('si')}"/>
        <g fill="none" stroke="${v('cu')}" stroke-width="2.4" stroke-linecap="round"><path d="M126,118 C112,84 92,92 90,150"/><path d="M150,118 C148,96 128,98 118,150"/><path d="M234,118 C248,84 268,92 270,150"/><path d="M210,118 C212,96 232,98 242,150"/></g>
      </g>`;
      svg.innerHTML = A + B + C;
    }

    function fjRenderRail() {
      const rail = fjEl('fjRail'); if (!rail || rail.childElementCount) return;
      FJ_STAGES.forEach((s, i) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'fj-step'; b.setAttribute('role', 'tab');
        b.onclick = () => { fjStop(); fjGo(i); };
        const num = document.createElement('b'); num.textContent = String(i + 1);
        const nm = document.createElement('span'); nm.textContent = s.n;
        b.append(num, nm); rail.appendChild(b);
      });
    }

    function fjGo(i) {
      fjIdx = Math.max(0, Math.min(FJ_STAGES.length - 1, i)); const s = FJ_STAGES[fjIdx], n = fjIdx + 1;
      fjBuildSvg(); const svg = fjEl('fjSvg'); svg.dataset.stage = String(n);
      svg.setAttribute('aria-label', FJ_LABELS[s.scene] + ' — ' + s.n);
      svg.querySelectorAll('.fj-scene').forEach((g) => g.classList.toggle('on', g.dataset.scene === s.scene));
      svg.querySelectorAll('.fj-ly').forEach((g) => g.classList.toggle('on', g.dataset.s.split(',').includes(String(n))));
      fjEl('fjRail').querySelectorAll('.fj-step').forEach((b, k) => { b.classList.toggle('on', k === fjIdx); b.classList.toggle('done', k < fjIdx); b.setAttribute('aria-selected', k === fjIdx ? 'true' : 'false'); if (k === fjIdx) { try { b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch (e) {} } });
      fjEl('fjBar').style.width = (n / FJ_STAGES.length * 100) + '%';
      fjEl('fjTag').textContent = s.sub.split(' · ')[0] + ' / ' + FJ_STAGES.length + '단계';
      fjEl('fjTitle').textContent = s.title; fjEl('fjSub').textContent = s.sub.split(' · ')[1];
      fjEl('fjWhat').textContent = s.what; fjEl('fjWhy').textContent = s.why;
      const note = fjEl('fjNote'); note.hidden = !s.note; note.textContent = s.note ? '🔁 ' + s.note : '';
      const lg = fjEl('fjLegend'); lg.replaceChildren();
      s.legend.forEach(([k, label]) => { const sp = document.createElement('span'); const dot = document.createElement('i'); dot.style.background = 'var(--fj-' + k + ')'; sp.append(dot, document.createTextNode(label)); lg.appendChild(sp); });
      const th = fjEl('fjTheories'); th.replaceChildren();
      const list = (typeof allTheories !== 'undefined' ? allTheories : []).filter((t) => t.category === FJ_FOLDER && t.subject === s.sub2).slice(0, 5);
      if (!list.length) { const e = document.createElement('span'); e.className = 'fj-chip'; e.textContent = '이론을 불러오는 중이에요'; th.appendChild(e); }
      list.forEach((t) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'fj-chip'; b.textContent = t.title; b.onclick = () => { fjStop(); fjLearn({ level: 'detail', category: t.category, subject: t.subject, theoryId: t.id }); }; th.appendChild(b); });
      fjEl('fjPrev').disabled = fjIdx === 0;
      const nx = fjEl('fjNext'); nx.disabled = fjIdx === FJ_STAGES.length - 1; nx.textContent = fjIdx === FJ_STAGES.length - 2 ? '마지막 단계 →' : '다음 단계 →';
    }
    function fjStep(d) { fjStop(); fjGo(fjIdx + d); }
    function fjStop() { if (fjTimer) { clearInterval(fjTimer); fjTimer = null; } const p = fjEl('fjPlay'); if (p) p.textContent = '▶ 자동 재생'; }
    function fjTogglePlay() {
      if (fjTimer) { fjStop(); return; }
      if (fjIdx >= FJ_STAGES.length - 1) fjGo(0);
      fjEl('fjPlay').textContent = '⏸ 멈춤';
      fjTimer = setInterval(() => { if (fjIdx >= FJ_STAGES.length - 1) { fjStop(); return; } fjGo(fjIdx + 1); if (fjIdx >= FJ_STAGES.length - 1) fjStop(); }, 3800);
    }
    function fjOpenFolder() { fjStop(); const s = FJ_STAGES[fjIdx]; fjLearn({ level: 'subject', category: FJ_FOLDER, subject: s.sub2 }); }

    // 이론 화면으로 갈 때 '한눈에 보기로 돌아가기' 버튼이 뜨게 한다 (직무 지도와 같은 방식)
    function fjLearn(state) { returnCtx = { view: 'view-flow', label: RETURN_LABEL['view-flow'] }; navTo('view-learning', state); }
    function fjOpen() { fjIdx = 0; try { localStorage.setItem('semiCbtIntroSeen', '1'); } catch (e) {} navTo('view-flow'); }   // 로비 입구에서는 처음부터, 폴더에서 돌아올 때는 보던 단계 그대로
    function enterFlow() {
      fjRenderRail(); fjBuildSvg(); fjStop(); fjGo(fjIdx);
      const base = fjEl('fjBase'); base.replaceChildren();
      FJ_BASE.forEach((b) => {
        const el = document.createElement('button'); el.type = 'button';
        const t = document.createElement('b'); t.textContent = b.t; const d = document.createElement('span'); d.textContent = b.d; el.append(t, d);
        el.onclick = () => fjLearn(b.sub ? { level: 'subject', category: b.cat, subject: b.sub } : { level: 'category', category: b.cat });
        base.appendChild(el);
      });
      const cta = fjEl('fjCta'); cta.replaceChildren();
      const mk = (label, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'fj-btn ' + cls; b.textContent = label; b.onclick = fn; cta.appendChild(b); };
      const intro = (typeof allTheories !== 'undefined' ? allTheories : []).find((t) => t.title === '반도체 제조 공정 한눈에 보기');
      if (intro) mk('입문 이론 보기 →', 'main', () => fjLearn({ level: 'subject', category: intro.category, subject: intro.subject }));
      mk('🏭 3D 팹 둘러보기', '', () => { returnCtx = null; fabOpen(); });
      mk('이론 백과사전', '', () => fjLearn({ level: 'home' }));
      mk('문제 풀어 보기', '', () => openSetup('quiz'));
    }
    // ===== 🏭 3D 팹 둘러보기: 화면을 처음 열 때만 three.js(vendor/)와 fab3d.js 를 불러온다 =====
    let fabLoading = null;
    function fabLoad() {
      if (window.FAB) return Promise.resolve();
      if (fabLoading) return fabLoading;
      const ld = (src) => new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = () => no(new Error(src)); document.head.appendChild(sc); });
      fabLoading = ld('vendor/three.min.js').then(() => ld('fab3d.js')).catch((e) => { fabLoading = null; throw e; });
      return fabLoading;
    }
    function fabOpen() { navTo('view-fab'); }
    function enterFab() {
      const el = document.getElementById('fabLoading');
      if (!window.FAB && el) { el.style.display = 'flex'; el.textContent = '3D 팹을 불러오는 중…'; }
      fabLoad().then(() => { if (currentViewId === 'view-fab') window.FAB.start(); })
        .catch(() => { if (el) { el.style.display = 'flex'; el.textContent = '3D 화면을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 열어 주세요.'; } });
    }
    function fabStop() { if (window.FAB) window.FAB.stop(); }
    function fabLearn(cat, sub) { returnCtx = { view: 'view-fab', label: RETURN_LABEL['view-fab'] }; navTo('view-learning', { level: 'subject', category: cat, subject: sub }); }
    // ===== 🧪 장비 체험(식각): 화면을 처음 열 때만 three.js(vendor/)와 lab3d.js 를 불러온다 =====
    // 장비 체험은 같은 화면(#view-lab)을 쓰고, 장비마다 모듈 파일이 따로 있다. 열 때 그 장비 모듈만 불러온다.
    const LABS = {
      etch: { file: ['lab2d.js', 'etch2d.js'], g: 'LAB_ETCH', flat: true, multi: true, title: '플라즈마 식각(RIE) 장비 체험', sub: '4. 식각 공정 (Etching)', desc: '식각 장비를 직접 조작해 보세요. 가스·압력·파워·시간을 정하고, 장비를 단계대로 켜면서 단면이 깎이는 모습과 결과 수치를 확인해요. 수치는 원리를 이해하기 위해 단순화한 값이에요.' },
      lpcvd: { file: ['lab2d.js', 'lpcvd2d.js'], g: 'LAB_LPCVD', flat: true, title: 'LPCVD(저압 CVD) 장비 체험', sub: '5. 박막 증착 공정 (Deposition)', desc: 'LPCVD 튜브 퍼니스를 직접 조작해 보세요. 웨이퍼 50장을 보트에 꽂아 한 번에 넣고, 온도·온도 기울기·압력·가스량·시간을 정해 폴리실리콘을 입힌 뒤, 앞뒤 웨이퍼의 두께가 고른지 확인해요. 가스가 줄어드는 만큼 뒤쪽을 더 뜨겁게 해 맞추는 게 핵심이에요. 수치는 원리를 이해하기 위해 단순화한 값이에요.' },
      pecvd: { file: ['lab2d.js', 'pecvd2d.js'], g: 'LAB_PECVD', flat: true, title: 'PECVD(플라즈마 CVD) 장비 체험', sub: '5. 박막 증착 공정 (Deposition)', desc: 'PECVD 장비를 직접 조작해 보세요. 온도·압력·RF 파워·시간을 정하고, 웨이퍼를 넣어 진공을 뽑고 가스를 흘려 플라즈마로 낮은 온도에서 절연막을 쌓은 뒤, 두께와 배선 사이 단면을 확인해요. 수치는 원리를 이해하기 위해 단순화한 값이에요.' },
      ald: { file: ['lab2d.js', 'ald2d.js'], g: 'LAB_ALD', flat: true, title: 'ALD(원자층 증착) 장비 체험', sub: '5. 박막 증착 공정 (Deposition)', desc: 'ALD 장비를 직접 조작해 보세요. 온도·전구체 펄스·퍼지·사이클 수를 정하고, 두 가스를 번갈아 넣어 원자 한 층씩 쌓은 뒤, 깊은 구멍 바닥까지 고르게 덮였는지 확인해요. 가운데 표면 확대 그림에서 분자가 붙고 반응하는 모습을 볼 수 있어요. 수치는 원리를 이해하기 위해 단순화한 값이에요.' },
      ion: { file: ['lab2d.js', 'ion2d.js'], g: 'LAB_ION', flat: true, title: '이온 주입 장비 체험', sub: '5. 박막 증착 공정 (Deposition)', desc: '이온 주입기를 직접 조작해 보세요. 불순물 종류·에너지·도즈·기울기·어닐 온도를 정하고, 이온을 만들어 가속해 웨이퍼에 박은 뒤 어닐링해서 접합 깊이와 면저항을 확인해요. 수치는 원리를 이해하기 위해 단순화한 값이에요.' },
      cmp: { file: ['lab2d.js', 'cmp2d.js'], g: 'LAB_CMP', flat: true, title: 'CMP(화학적 기계 연마) 장비 체험', sub: '1. 웨이퍼 제조 공정', desc: 'CMP 장비를 직접 조작해 보세요. 슬러리·패드·압력·속도·시간을 정하고 웨이퍼를 패드에 눌러 구리를 간 뒤, 남은 구리·디싱·침식·단차를 확인해요. 수치는 원리를 이해하기 위해 단순화한 값이에요.' },
      furn: { file: ['lab2d.js', 'furn2d.js'], g: 'LAB_FURN', flat: true, title: '확산로(열산화) 장비 체험', sub: '2. 산화 공정 (Oxidation)', desc: '확산로(퍼니스)를 직접 조작해 보세요. 분위기·온도·시간·어닐·보트 투입 속도를 정하고, 웨이퍼를 보트에 싣고 데운 뒤 산화막을 키워 두께와 품질을 확인해요. 수치는 원리를 이해하기 위해 단순화한 값이에요.' },
      wet: { file: ['lab2d.js', 'wet2d.js'], g: 'LAB_WET', flat: true, title: '습식 세정(RCA) 장비 체험', sub: '1. 웨이퍼 제조 공정', desc: '습식 세정 장비(웨트 벤치)를 직접 조작해 보세요. 세정 순서·약액 온도·담금 시간·헹굼·건조 방법을 정하고, 카세트를 약액조와 린스조에 차례로 담가 씻은 뒤 말려서 입자·유기물·금속 오염이 얼마나 남았는지 확인해요. 수치는 원리를 이해하기 위해 단순화한 값이에요.' },
      met: { file: ['lab2d.js', 'met2d.js'], g: 'LAB_MET', flat: true, title: '계측(CD-SEM) 장비 체험', sub: '3. 포토 공정 (Photo)', desc: '계측 장비(CD-SEM)를 직접 조작해 보세요. 가속전압·프레임 수·측정 지점 수·로트에서 재는 웨이퍼 수를 정하고, 웨이퍼를 넣어 진공을 뽑고 지점마다 전자빔으로 선폭을 잰 뒤, 이상이 생긴 웨이퍼를 잡아내는지 확인해요. 수치는 원리를 이해하기 위해 단순화한 값이에요.' },
      pvd: { file: ['lab2d.js', 'pvd2d.js'], g: 'LAB_PVD', flat: true, title: 'PVD(스퍼터링) 장비 체험', sub: '6. 금속 배선 공정 (Metallization)', desc: 'PVD 스퍼터링 장비를 직접 조작해 보세요. 타깃 금속·Ar 압력·전력·바이어스·시간을 정하고, 웨이퍼를 넣어 진공을 뽑고 아르곤 플라즈마로 금속 원자를 떼어 내 쌓은 뒤, 깊은 구멍(비아) 안쪽까지 막이 고르게 입혀졌는지 확인해요. 2D 단면 그림으로 원리를 보여 줘요. 수치는 원리를 이해하기 위해 단순화한 값이에요.' },
      photo: { file: ['lab2d.js', 'photo2d.js'], g: 'LAB_PHOTO', flat: true, multi: true, title: '노광(스캐너) 장비 체험', sub: '3. 포토 공정 (Photo)', desc: '노광 장비(스캐너)를 직접 조작해 보세요. 광원·렌즈·노광량·초점·정렬을 정하고, 웨이퍼를 정렬하고 찍고 현상해서 선폭과 정렬 오차를 확인해요. 수치는 원리를 이해하기 위해 단순화한 값이에요.' },
    };
    let labKind = (() => { try { return LABS[sessionStorage.getItem('labKind')] ? sessionStorage.getItem('labKind') : 'etch'; } catch (e) { return 'etch'; } })();
    const labLoads = {};
    function labLoad(kind) {
      const L = LABS[kind]; if (window[L.g]) return Promise.resolve();
      if (labLoads[kind]) return labLoads[kind];
      // 체험 코드는 공개 파일이 아니라 서버(해금 확인 후)에서 받아 실행한다
      labLoads[kind] = apiJson('/content/lab-' + kind).then((r) => {
        if (r.status !== 200 || !r.body || !r.body.body) throw new Error('lab-' + r.status);
        return new Promise((ok, no) => {
          const url = URL.createObjectURL(new Blob([r.body.body], { type: 'text/javascript' })), sc = document.createElement('script');
          sc.src = url; sc.onload = () => { URL.revokeObjectURL(url); sc.remove(); ok(); }; sc.onerror = () => { URL.revokeObjectURL(url); no(new Error('lab-script')); };
          document.head.appendChild(sc);
        });
      }).catch((e) => { labLoads[kind] = null; throw e; });
      return labLoads[kind];
    }
    function labOpen(kind) {
      labKind = LABS[kind] ? kind : 'etch'; try { sessionStorage.setItem('labKind', labKind); } catch (e) {}
      if (currentViewId === 'view-lab') { labStop(); enterLab(); } else navTo('view-lab');
    }
    function enterLab() {
      const xp = document.getElementById('labXs'); if (xp) { xp.classList.remove('big', 'fl', 'min'); xp.style.left = xp.style.top = ''; }   // 단면 팝업은 들어올 때마다 기본 크기·자리로
      const kind = labKind, L = LABS[kind], el = document.getElementById('labLoading');
      const t = document.getElementById('labTitle'), d = document.getElementById('labDesc'); if (t) t.textContent = L.title; if (d) d.textContent = L.desc;
      const gb = document.getElementById('labGuideBtn'), gt = allTheories.find(x => x.category === ADV_CAT && x.lab === kind); if (gb) { gb.classList.toggle('hidden', !gt); gb.dataset.id = gt ? gt.id : ''; }
      Object.keys(LABS).forEach((k) => { if (k !== kind && window[LABS[k].g]) window[LABS[k].g].stop(); });
      if (!window[L.g] && !PRM.unlocked.has('lab-' + kind)) { if (el) { el.style.display = 'flex'; el.innerHTML = ''; el.appendChild(premiumLock('lab-' + kind, 'lab')); } try { pmGateMaybe('lab-' + kind, 'lab'); } catch (e) {} return; }   // 해금 전: 잠금 화면 + 해금 팝업
      if (!window[L.g] && el) { el.style.display = 'flex'; el.textContent = '장비를 불러오는 중…'; }
      labLoad(kind).then(() => { if (currentViewId === 'view-lab' && labKind === kind) window[L.g].start(); })
        .catch(() => { if (el) { el.style.display = 'flex'; el.textContent = '체험 화면을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 열어 주세요.'; } });
    }
    function labStop() { Object.keys(LABS).forEach((k) => { if (window[LABS[k].g]) window[LABS[k].g].stop(); }); }
    function labGuide() { const gb = document.getElementById('labGuideBtn'); if (gb && gb.dataset.id) openTheory(gb.dataset.id); }
    function labLearn() { returnCtx = { view: 'view-lab', label: RETURN_LABEL['view-lab'] }; navTo('view-learning', { level: 'subject', category: '반도체 8대 공정', subject: LABS[labKind].sub }); }
    // 팝업(#labXs.lab-pop): 머리글을 끌면 화면 어디로든 옮기고(살짝 누르면 접기), 크기는 고정이에요
    (function () {
      let d = null, moved = false;
      // 창 기준(left/top)으로 놓는다. 조상에 transform 이 있으면 fixed 가 그 조상 기준이 되므로, 실제 위치를 재서 어긋난 만큼 보정한다
      const place = (x, L, T) => {
        const q = x.getBoundingClientRect(); L = Math.max(0, Math.min(innerWidth - q.width, L)); T = Math.max(0, Math.min(innerHeight - q.height, T)); x.classList.add('fl');   // 크기는 줄어든 화면상 크기(q)로 잰다
        x.style.left = L + 'px'; x.style.top = T + 'px'; const r = x.getBoundingClientRect(); x.style.left = (2 * L - r.left) + 'px'; x.style.top = (2 * T - r.top) + 'px';
      };
      document.addEventListener('click', (e) => {   // ⤢ 버튼: 작게(기본) ↔ 크게
        const b = e.target.closest('#labXbig'); if (!b) return; const x = b.parentNode; x.classList.toggle('big'); x.classList.remove('min');
        if (x.classList.contains('fl')) { const r = x.getBoundingClientRect(); place(x, r.left, r.top); }
      });
      document.addEventListener('pointerdown', (e) => {
        const h = e.target.closest('#labXs.lab-pop .lab-xhead'); if (!h || e.button) return;
        const x = h.parentNode, r = x.getBoundingClientRect();
        d = { x, dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId, sx: e.clientX, sy: e.clientY }; moved = false; h.setPointerCapture(e.pointerId);
      });
      document.addEventListener('pointermove', (e) => {
        if (!d || e.pointerId !== d.id) return; if (!moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return; moved = true;
        place(d.x, e.clientX - d.dx, e.clientY - d.dy);
      });
      const up = (e) => { if (d && e.pointerId === d.id) d = null; };
      document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
      document.addEventListener('click', (e) => { if (moved && e.target.closest('#labXs .lab-xhead')) { e.stopPropagation(); e.preventDefault(); } moved = false; }, true);
      // 창이 줄어 팝업이 밖으로 밀리면 안으로 당겨 와요
      addEventListener('resize', () => { const x = document.getElementById('labXs'); if (!x || !x.classList.contains('fl')) return; const r = x.getBoundingClientRect(); place(x, r.left, r.top); });
    })();
    // 휴대폰: 단면 미니 그림도 컴퓨터 팝업처럼 끌어서 화면 어디로든 옮겨요(장비 화면 박스 밖으로도, 머리글 아래·화면 안에서)
    (function () {
      let d = null;
      const fit = (m, L, T) => {
        const hd = document.querySelector('header'), top = hd ? Math.max(0, hd.getBoundingClientRect().bottom) : 0;
        L = Math.max(0, Math.min(innerWidth - m.offsetWidth, L)); T = Math.max(top, Math.min(innerHeight - m.offsetHeight, T)); m.classList.add('fl');
        m.style.left = L + 'px'; m.style.top = T + 'px'; const r = m.getBoundingClientRect(); m.style.left = (2 * L - r.left) + 'px'; m.style.top = (2 * T - r.top) + 'px';   // 조상에 transform 이 있어 어긋나면 보정
      };
      document.addEventListener('pointerdown', (e) => {
        const m = e.target.closest('.lab-miniwrap'); if (!m || e.button) return; const r = m.getBoundingClientRect();
        d = { m, id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top }; m.setPointerCapture(e.pointerId);
      });
      document.addEventListener('pointermove', (e) => { if (d && e.pointerId === d.id) fit(d.m, e.clientX - d.dx, e.clientY - d.dy); });
      const up = (e) => { if (d && e.pointerId === d.id) d = null; };
      document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
      // 화면이 바뀌면(회전 등) 밖으로 밀린 미니 그림을 안으로 당겨 와요
      addEventListener('resize', () => { const m = document.querySelector('.lab-miniwrap.fl'); if (m && m.offsetParent) { const r = m.getBoundingClientRect(); fit(m, r.left, r.top); } });
    })();
    // ===== 📖 반도체 용어 단어장 =====
    // 용어 내용은 data/glossary.json 에서 이 화면을 처음 열 때 한 번만 받는다.
    let glData = null, glLoad = null, glFailed = false, glFolder = null, glSub = null, glFocus = null;
    // =====================================================
    // 📚 학습 코스: 처음부터 순서대로, 하루 조금씩.
    //  - 순서는 data/course.json(단원별 이론 id 순서)이 정한다. 이론·문제가 늘어도 코드는 그대로:
    //    · 단원 표에 없는 새 이론은 같은 폴더(category·subject)의 단원 맨 뒤에, 어느 단원에도 안 맞으면 '새로 추가된 이론'에 붙는다.
    //    · '채워질 예정' 이론은 숨겨졌다가 내용이 채워지면 정해 둔 자리에 나타난다.
    //  - 진행은 이론을 열었는지(read)와 코스 문제를 마쳤는지(quiz)만 저장한다. 날짜(Day N)는 읽은 날짜로 센다.
    // =====================================================
    const PATH_KEY = 'semiCbtPath';
    let pathState = { pace: 2, read: {}, quiz: {}, plan: null }, pathQuizCtx = null, pathOpen = null;
    try { const sv = JSON.parse(localStorage.getItem(PATH_KEY)); if (sv && typeof sv === 'object') pathState = Object.assign(pathState, sv); } catch (e) {}
    if (!pathState.read || typeof pathState.read !== 'object') pathState.read = {};
    if (!pathState.quiz || typeof pathState.quiz !== 'object') pathState.quiz = {};
    let courseData = null, courseLoad = null, courseFailed = false;
    function pathSave() { try { localStorage.setItem(PATH_KEY, JSON.stringify(pathState)); } catch (e) {} }
    function loadCourse() {
      if (courseLoad) return courseLoad;
      courseFailed = false;
      courseLoad = fetch(`${ROOT}data/course.json`, { cache: 'no-cache' })
        .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then(j => { courseData = (j && Array.isArray(j.units)) ? j : null; if (!courseData) throw new Error('bad'); return courseData; })
        .catch(() => { courseFailed = true; courseLoad = null; return null; });
      return courseLoad;
    }
    function pathMarkRead(id) { if (id && !pathState.read[id]) { pathState.read[id] = dateStr(); pathSave(); } }
    function pathMarkQuiz(ids) { const d = dateStr(); let ch = false; (ids || []).forEach(id => { if (!pathState.quiz[id]) { pathState.quiz[id] = d; ch = true; } }); if (ch) pathSave(); }
    // 코스 전이 쓰기 전부터 공부한 사람은, 날짜별 기록(제목)으로 이미 읽은 이론을 한 번만 채워 준다.
    function pathSeed() {
      if (pathState.seeded || !allTheories.length) return;
      pathState.seeded = 1;
      try {
        const byTitle = {}; allTheories.forEach(t => { (byTitle[t.title] = byTitle[t.title] || []).push(t.id); });
        Object.entries(typeof dayLog === 'object' && dayLog ? dayLog : {}).forEach(([d, e]) => (e.th || []).forEach(ti => { const ids = byTitle[ti]; if (ids && ids.length === 1 && !pathState.read[ids[0]]) pathState.read[ids[0]] = d; }));
      } catch (e) {}
      pathSave();
    }
    function pathBuild() {
      if (!courseData || !allTheories.length) return null;
      const byId = new Map(allTheories.map(t => [t.id, t])), used = new Set(), units = [];
      courseData.units.forEach(u => { const items = []; (u.order || []).forEach(id => { const t = byId.get(id); if (t && !used.has(id)) { used.add(id); items.push(t); } }); units.push({ u, items }); });
      allTheories.forEach(t => { if (used.has(t.id)) return; const hit = units.find(x => (x.u.match || []).some(m => m.c === t.category && m.s === t.subject)); if (hit) { hit.items.push(t); used.add(t.id); } });
      const out = units.filter(x => x.items.length).map(x => ({ cat: (x.u.match && x.u.match[0] && x.u.match[0].c) || '', id: x.u.id, icon: x.u.icon || '📘', title: x.u.title, desc: x.u.desc || '', items: x.items }));
      const rest = allTheories.filter(t => !used.has(t.id));
      if (rest.length) out.push({ id: 'new', icon: '🆕', title: '새로 추가된 이론', desc: '코스에 아직 자리를 정하지 않은 이론이에요. 먼저 읽어 보세요.', items: rest });
      return out;
    }
    // 현재 코스 상태: 단원, 전체 진행, 오늘 분량(하루 동안 고정), Day 번호
    function pathCur() {
      const units = pathBuild(); if (!units) return null;
      pathSeed();
      const flat = units.flatMap(u => u.items.map(t => ({ t, u }))), rd = pathState.read, today = dateStr();
      const K = Math.min(3, Math.max(1, +pathState.pace || 2)), ids = new Set(flat.map(x => x.t.id));
      let pl = pathState.plan;
      if (!pl || pl.date !== today || !Array.isArray(pl.ids)) { pl = pathState.plan = { date: today, ids: flat.filter(x => !rd[x.t.id]).slice(0, K).map(x => x.t.id) }; pathSave(); }
      pl.ids = pl.ids.filter(id => ids.has(id));
      const doneN = flat.filter(x => rd[x.t.id]).length, days = new Set(Object.values(rd));
      const dayNo = days.size + (days.has(today) ? 0 : 1);
      return { units, flat, plan: pl, K, doneN, total: flat.length, dayNo };
    }
    function pathAddMore() { const c = pathCur(); if (!c) return; const have = new Set(c.plan.ids); c.plan.ids = c.plan.ids.concat(c.flat.filter(x => !pathState.read[x.t.id] && !have.has(x.t.id)).slice(0, c.K).map(x => x.t.id)); pathSave(); ptRender(); }
    function pathSetPace(n) {
      const c = pathCur(); if (!c) return; pathState.pace = n;
      const kept = c.plan.ids.filter(id => pathState.read[id]), have = new Set(kept);
      const need = Math.max(0, n - kept.length);
      pathState.plan = { date: dateStr(), ids: kept.concat(c.flat.filter(x => !pathState.read[x.t.id] && !have.has(x.t.id)).slice(0, need).map(x => x.t.id)) };
      pathSave(); ptRender(); renderRoutine();
    }
    // 오늘 분량 이론에 연결된 문제. 모자라면 같은 폴더의 다른 이론 문제로 채운다.
    function pathQuestions(ids) {
      const set = new Set(ids), tm = new Map(allTheories.map(t => [t.id, t]));
      let qs = allQuizData.filter(q => q.theory_id && set.has(q.theory_id));
      if (qs.length < 4) {
        const folders = new Set(ids.map(id => { const t = tm.get(id); return t ? t.category + '||' + t.subject : ''; }));
        const near = new Set(allTheories.filter(t => folders.has(t.category + '||' + t.subject) && !set.has(t.id)).map(t => t.id));
        qs = qs.concat(allQuizData.filter(q => q.theory_id && near.has(q.theory_id)).sort(() => Math.random() - 0.5).slice(0, 4 - qs.length));
      }
      return qs.sort(() => Math.random() - 0.5).slice(0, 10);
    }
    function pathStartQuiz() {
      const c = pathCur(); if (!c) return;
      const qs = pathQuestions(c.plan.ids); if (!qs.length) return alert('오늘 분량에 연결된 문제가 아직 없어요.');
      filteredSession = qs; currentKeyword = null; currentIndex = 0; correctCount = 0; sessionLog = []; currentMode = 'quiz';
      pathQuizCtx = { ref: filteredSession, ids: c.plan.ids.slice() };
      navTo('view-quiz'); renderQuiz();
    }
    function ptOpen() { navTo('view-path'); }
    function enterPath() {
      ptRender();
      loadCourse().then(() => { if (currentViewId === 'view-path') ptRender(); });
    }
    function ptToggle(id) { pathOpen = pathOpen === id ? '' : id; ptRender(); }
    // 홈의 '오늘의 루틴': 이론 읽기 → 단어 → 오답 복습. 학습 코스(pathCur)의 오늘 분량을 그대로 쓴다.
    function renderRoutine() {
      const box = document.getElementById('routineBox'); if (!box) return;
      if (!courseData && !courseFailed) loadCourse().then(() => { if (currentViewId === 'view-lobby') renderRoutine(); });
      const c = pathCur(), t = todayData(), pts = Math.min(DAILY_GOAL, t.pts), st = streakNow();
      const hasNotes = allQuizData.some(q => wrongNotes[q.id]), sr = srsToday();
      const row = (done, title, sub, act, fn) => `<button type="button" class="pt-row${done ? ' read' : ''}" onclick="${fn}"><span class="ck">${done ? '✓' : ''}</span><span class="nm"><b>${title}</b><em>${sub}</em></span><span class="rt">${act}</span></button>`;
      let rows = [], head = '', n = 0, k = 0;
      // 1) 복습: 새로 배우기 전에 어제 틀린 문제부터 (오답이 한 번도 없으면 이 단계는 보이지 않는다)
      if (hasNotes) {
        const left = Math.max(0, sr.target - sr.rv);
        const sub = sr.due === 0 ? `복습할 문제를 모두 마쳤어요${sr.tomorrow ? ` · 내일 ${sr.tomorrow}개` : ''}` : sr.done ? `오늘 목표를 채웠어요 · ${sr.due}개 더 복습할 수 있어요` : `${left}문제 복습 · 대기 ${sr.due}개`;
        rows.push(row(sr.done, '오늘의 복습', sub, sr.due ? (sr.done ? '더 하기' : '복습 →') : '', sr.due ? 'srsStart()' : "navTo('view-note')")); n++; if (sr.done) k++;
      }
      if (!c) {
        head = `<span class="pt-day">TODAY</span><b>오늘 할 일</b>`;
        rows.push(row(false, '이론 읽기', '백과사전에서 오늘 볼 이론을 골라요', '읽기 →', "navTo('view-learning',{level:'home'})"), row(false, '문제 풀기', '과목과 문항 수를 골라요', '풀기 →', "openSetup('quiz')"));
      } else if (c.doneN >= c.total) {
        head = `<span class="pt-day">코스 완주</span><b>오늘 할 일</b>`;
        rows.push(row(false, '실전 점검', '모의고사 방식으로 풀어 보세요', '풀기 →', "openSetup('quiz', true)"));
      } else {
        const byId = new Map(c.flat.map(x => [x.t.id, x])), pl = c.plan.ids.map(id => byId.get(id)).filter(Boolean);
        const read = pl.filter(x => pathState.read[x.t.id]).length, allRead = pl.length > 0 && read === pl.length;
        const next = pl.find(x => !pathState.read[x.t.id]);
        head = `<span class="pt-day">DAY ${c.dayNo}</span><b>오늘 할 일</b>`;
        rows.push(row(allRead, '오늘의 이론', allRead ? `이론 ${pl.length}개를 모두 읽었어요` : `${read}/${pl.length}개 읽음 · ${escH(next ? next.t.title : '')}`, allRead ? '다시 보기' : '읽기 →', 'ptOpen()'));
        n += 1; k += allRead ? 1 : 0;
      }
      {   // 단어장: 오늘 외웠는지 / 복습할 용어가 몇 개인지 (용어 파일을 안 불러도 저장된 기록만으로 계산)
        const today = dateStr(), vs = Object.values((gmState && gmState.t) || {});
        const studied = vs.some(v => v && v.l && dateStr(new Date(v.l)) === today), due = vs.filter(v => v && !v.m && (v.d || today) <= today).length;
        rows.push(row(studied, '오늘의 단어', studied ? '오늘 용어를 외웠어요' : due ? `복습할 용어 ${due}개 · 새 용어도 외워 봐요` : '반도체 용어를 가려 놓고 10개씩 외워요', studied ? '더 하기' : '외우기 →', 'glOpenView()')); n++; if (studied) k++;
      }
      if (!n) n = 0;
      const left = DAILY_GOAL - pts;
      box.innerHTML = `<div class="pt-card"><div class="rt-head">${head}${st > 0 ? `<span class="rt-streak">🔥 ${st}일 연속</span>` : ''}${n ? `<span class="rt-n">${k}/${n}</span>` : ''}</div>${rows.join('')}
        <div class="rt-foot"><div class="l"><span>오늘 학습 점수</span><span>${pts} / ${DAILY_GOAL}</span></div><div class="pt-bar${left <= 0 ? ' ok' : ''}"><i style="width:${pts / DAILY_GOAL * 100}%"></i></div>${left <= 0 ? '<p class="pt-note" style="margin-top:.45rem">목표를 채웠어요! 웨이퍼에 오늘의 회로를 새겨 보세요.</p>' : ''}</div></div>`;
    }
    function ptRender() {
      const body = document.getElementById('ptBody'); if (!body) return;
      if (courseFailed && !courseData) { body.innerHTML = `<div class="pt-card"><p class="pt-note">학습 코스를 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.</p><button type="button" class="pt-btn ghost" style="margin-top:.7rem" onclick="courseFailed=false;courseLoad=null;enterPath()">다시 불러오기</button></div>`; return; }
      const c = pathCur();
      if (!c) { body.innerHTML = `<div class="pt-card"><p class="pt-note">학습 코스를 불러오는 중이에요…</p></div>`; return; }
      const rd = pathState.read, qd = pathState.quiz, pct = c.total ? Math.round(c.doneN / c.total * 100) : 0, finished = c.doneN >= c.total;
      const byId = new Map(c.flat.map(x => [x.t.id, x]));
      const planRows = c.plan.ids.map(id => byId.get(id)).filter(Boolean);
      const allRead = planRows.length > 0 && planRows.every(x => rd[x.t.id]);
      const nextUnit = (c.flat.find(x => !rd[x.t.id]) || {}).u;
      if (pathOpen == null) pathOpen = nextUnit ? nextUnit.id : '';
      const rowHtml = (x) => { const read = !!rd[x.t.id]; return `<button type="button" class="pt-row${read ? ' read' : ''}" onclick="openTheory('${jsq(x.t.id)}')"><span class="ck">${read ? '✓' : ''}</span><span class="nm"><b>${escH(x.t.title)}</b><em>${escH(x.u.title)}</em></span><span class="rt">${read ? '다시 보기' : '읽기 →'}</span></button>`; };
      let today;
      if (finished) {
        today = `<div class="pt-card"><div class="pt-top"><b>🎉 코스를 모두 마쳤어요</b></div><p class="pt-note" style="margin-top:0">이론 ${c.total}개를 모두 읽었어요. 이제 모의고사로 실력을 확인하고, 틀린 문제는 오답 노트로 복습해 보세요.</p><div class="pt-qz"><button type="button" class="pt-btn" onclick="openSetup('quiz', true)">실전 모의고사 →</button><button type="button" class="pt-btn ghost" onclick="navTo('view-note')">오답 노트</button></div></div>`;
      } else {
        const doneToday = allRead;
        today = `<div class="pt-card"><div class="pt-top"><b><span class="pt-day">DAY ${c.dayNo}</span>오늘의 학습</b><span>${planRows.filter(x => rd[x.t.id]).length}/${planRows.length}</span></div>
          <div class="pt-pace"><span>하루 이론</span>${[1, 2, 3].map(n => `<button type="button" class="${c.K === n ? 'on' : ''}" onclick="pathSetPace(${n})">${n}개</button>`).join('')}</div>
          ${planRows.map(rowHtml).join('')}
          ${doneToday ? `<div class="pt-qz"><span class="pt-done">✓ 오늘 분량을 마쳤어요</span><button type="button" class="pt-btn ghost" onclick="pathAddMore()">더 배우기 +${c.K}</button></div>` : ''}</div>`;
      }
      const parts = []; c.units.forEach(u => { const g = parts[parts.length - 1]; if (g && g.cat === (u.cat || '')) g.units.push(u); else parts.push({ cat: u.cat || '', units: [u] }); });
      const curId = nextUnit ? nextUnit.id : '';
      const unitHtml = parts.map((g, gi) => {
        const gt = g.units.reduce((a, u) => a + u.items.length, 0), gn = g.units.reduce((a, u) => a + u.items.filter(t => rd[t.id]).length, 0);
        return `<section class="cm-part cm-c${gi % 4}"><div class="cm-ph"><span>PART ${gi + 1}</span><b>${escH(g.cat || '더 배우기')}</b><em>${gn}/${gt}</em></div><ol class="cm-list">${g.units.map(u => {
          const n = u.items.filter(t => rd[t.id]).length, all = n === u.items.length, open = pathOpen === u.id, cur = u.id === curId, p = Math.round(n / u.items.length * 100);
          return `<li class="cm-st${all ? ' done' : ''}${cur ? ' cur' : ''}${open ? ' open' : ''}"><span class="cm-node" style="--p:${p}"><span>${escH(u.icon)}</span></span>
            <div class="cm-card"><button type="button" class="cm-hd" onclick="ptToggle('${jsq(u.id)}')" aria-expanded="${open}"><span class="cm-tx"><b>${escH(u.title)}${cur ? '<i class="cm-here">지금 여기</i>' : ''}</b><em>${n}/${u.items.length}개${all ? ' · 완료' : ''}</em></span><svg class="cm-cv" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
              <div class="cm-bd">${u.desc ? `<p class="cm-ud">${escH(u.desc)}</p>` : ''}${u.items.map((t, ti) => `<button type="button" class="cm-it${rd[t.id] ? ' read' : ''}" onclick="openTheory('${jsq(t.id)}')"><span class="ck">${rd[t.id] ? '✓' : ti + 1}</span><span class="tt">${escH(t.title)}</span>${c.plan.ids.includes(t.id) && !rd[t.id] ? '<span class="tg">오늘</span>' : ''}</button>`).join('')}</div></div></li>`;
        }).join('')}</ol></section>`;
      }).join('');
      body.innerHTML = `<div class="pt-card"><div class="pt-top"><b>전체 진행</b><span>${c.doneN} / ${c.total} · ${pct}%</span></div><div class="pt-bar${finished ? ' ok' : ''}"><i style="width:${pct}%"></i></div></div>${today}<div class="cm-title"><b>코스 지도</b><span>단원을 눌러 이론을 열어 보세요</span></div>${unitHtml}`;
    }
    function loadGlossary() {
      if (glLoad) return glLoad;
      glFailed = false;
      const glEn = window.LANG === 'en' ? fetch(`${ROOT}data/en/glossary.json`, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null);
      glLoad = Promise.all([fetch(`${ROOT}data/glossary.json`, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); }), glEn])
        .then(([j, en]) => { glData = { folders: (j && j.folders) || [], terms: window.i18nOverlay(((j && j.terms) || []).filter(t => t && t.t && t.d), en && en.terms, 'glossary', (t) => t.f + '|' + t.s + '|' + t.t) }; return glData; })
        .catch(() => { glFailed = true; glLoad = null; return null; });
      return glLoad;
    }
    function glOpenView() { gmSess = null; glFolder = glSub = glFocus = null; const i = document.getElementById('glSearch'); if (i) i.value = ''; navTo('view-glossary'); }
    function enterGlossary() { glRender(); loadGlossary().then(() => { if (currentViewId === 'view-glossary') glRender(); }); }
    function glBack() {
      if (gmSess) { gmExit(); return; }
      const i = document.getElementById('glSearch');
      if (i.value.trim()) { i.value = ''; glRender(); return; }
      if (glSub) { glFolder = glSub = null; glRender(); window.scrollTo({ top: 0 }); return; }
      backOrLobby();
    }
    function glHome() { glFolder = glSub = null; document.getElementById('glSearch').value = ''; glRender(); }
    function glOpenSub(f, s) { glFolder = f; glSub = s; glFocus = null; glRender(); window.scrollTo({ top: 0 }); }
    function glCard(t, i, withPath, open) {
      const rel = (t.r || []).map(n => glData.terms.findIndex(x => x.t === n)).filter(k => k >= 0);
      const th = t.th && allTheories.find(x => x.title === t.th);
      return `<article class="gl-card${open ? ' open hl' : ''}" id="gl-t-${i}">${withPath ? `<div class="gl-path">📂 ${escH(t.f)} › ${escH(t.s)}</div>` : ''}
        <button type="button" class="gl-head" onclick="glToggle(${i})"><span class="gl-top"><span class="gl-name">${escH(t.t_en || t.t)}</span>${t.en ? `<span class="gl-en">${escH(t.en)}</span>` : ''}<span class="gl-chev">▼</span></span><span class="gl-d">${escH(t.d)}</span></button>
        <div class="gl-more">
          ${t.e ? `<p class="gl-row"><b>쉽게</b>${escH(t.e)}</p>` : ''}
          ${t.u ? `<p class="gl-row"><b>쓰이는 곳</b>${escH(t.u)}</p>` : ''}
          ${rel.length ? `<div class="gl-rel"><b>관련 용어</b>${rel.map(k => `<button type="button" class="gl-chip" onclick="glJump(${k})">${escH(glData.terms[k].t_en || glData.terms[k].t)}</button>`).join('')}</div>` : ''}
          ${th ? `<button type="button" class="gl-th" onclick="openTheory('${escH(th.id)}')">이론 보기 →</button>` : ''}
        </div></article>`;
    }
    function glToggle(i) { const el = document.getElementById('gl-t-' + i); if (el) { el.classList.toggle('open'); el.classList.remove('hl'); } }
    function glJump(i) {
      const t = glData.terms[i]; if (!t) return;
      document.getElementById('glSearch').value = ''; glFolder = t.f; glSub = t.s; glFocus = i; glRender();
      const el = document.getElementById('gl-t-' + i); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    // =====================================================
    // 🧠 단어장 암기 모드: 용어(또는 뜻)를 가려 놓고 떠올린 뒤 '알아요 / 헷갈려요'로 스스로 채점한다.
    //  - 헷갈리면 내일, 알면 3일 → 7일 → 14일 → 30일 뒤에 다시 나오고, 끝까지 알면 '외움'이 된다. (모르는 것만 모아 보기 가능)
    //  - 용어별 상태는 semiCbtGloss 에 저장되어 로그인 동기화에 따라간다: b(단계) · d(다음 복습일) · m(외움) · n(횟수) · l(마지막 시각)
    //  - 용어가 늘어나도 그대로 동작한다. 새 용어는 '새 용어'로 잡히고, 용어 이름이 바뀌면 새 용어로 취급된다.
    // =====================================================
    const GM_KEY = 'semiCbtGloss', GM_DAYS = [1, 3, 7, 14, 30];
    let gmState = { t: {} }, gmSess = null, gmDir = 'td';
    try { const sv = JSON.parse(localStorage.getItem(GM_KEY)); if (sv && sv.t && typeof sv.t === 'object') gmState = sv; } catch (e) {}
    try { if (localStorage.getItem('semiCbtGlossDir') === 'dt') gmDir = 'dt'; } catch (e) {}
    const gmAddDays = (ds, k) => { const [y, m, d] = ds.split('-').map(Number); return dateStr(new Date(y, m - 1, d + k)); };
    function gmSave() { try { localStorage.setItem(GM_KEY, JSON.stringify(gmState)); } catch (e) {} }
    const gmSt = (i) => gmState.t[glData.terms[i].t];
    function gmScope() { return glData.terms.map((t, i) => i).filter(i => { const t = glData.terms[i]; return !glFolder || (t.f === glFolder && (!glSub || t.s === glSub)); }); }
    function gmCounts(idx) {
      const today = dateStr(); const c = { total: idx.length, mastered: 0, fresh: 0, due: 0, weak: 0 };
      idx.forEach(i => { const s = gmSt(i); if (!s) c.fresh++; else if (s.m) c.mastered++; else { if ((s.d || today) <= today) c.due++; if (s.b === 0) c.weak++; } });
      return c;
    }
    function gmPick(kind, idx) {
      const today = dateStr(), shuf = (a) => a.sort(() => Math.random() - 0.5);
      if (kind === 'new') return idx.filter(i => !gmSt(i)).slice(0, 10);
      if (kind === 'due') return shuf(idx.filter(i => { const s = gmSt(i); return s && !s.m && (s.d || today) <= today; }).sort((a, b) => (gmSt(a).d || '').localeCompare(gmSt(b).d || '')).slice(0, 20));
      if (kind === 'weak') return shuf(idx.filter(i => { const s = gmSt(i); return s && !s.m && s.b === 0; }).slice(0, 20));
      return shuf(idx.slice()).slice(0, 20);
    }
    const GM_LABEL = { due: '오늘 복습', new: '새 용어', weak: '모르는 것만', mix: '섞어서' };
    function gmStart(kind, list) {
      if (!glData) return;
      list = list || gmPick(kind, gmScope()); if (!list.length) return;
      gmSess = { kind, list, i: 0, flip: false, known: 0, missed: [], done: false };
      glRender(); window.scrollTo({ top: 0 });
    }
    function gmExit() { gmSess = null; glRender(); window.scrollTo({ top: 0 }); }
    function gmFlip() { if (!gmSess || gmSess.done || gmSess.flip) return; gmSess.flip = true; glRender(); }
    function gmSetDir(d) { gmDir = d; try { localStorage.setItem('semiCbtGlossDir', d); } catch (e) {} glRender(); }
    function gmAnswer(known) {
      const S = gmSess; if (!S || S.done || !S.flip) return;
      const i = S.list[S.i], key = glData.terms[i].t, today = dateStr(), s = gmState.t[key] || (gmState.t[key] = { b: -1, d: null, m: 0, n: 0, l: 0 });
      if (!known) { s.b = 0; s.d = gmAddDays(today, GM_DAYS[0]); s.m = 0; S.missed.push(i); }
      else {
        S.known++;
        if (s.b < 0 || s.b === 0) { s.b = 1; s.d = gmAddDays(today, GM_DAYS[1]); }              // 처음 알았거나, 헷갈렸다가 이번에 맞힘
        else if (!s.m && (s.d || today) <= today) { const nb = s.b + 1; if (nb >= GM_DAYS.length) { s.m = 1; s.b = GM_DAYS.length; s.d = null; } else { s.b = nb; s.d = gmAddDays(today, GM_DAYS[nb]); } }
      }
      s.n++; s.l = Date.now(); gmSave();
      S.i++; S.flip = false; if (S.i >= S.list.length) S.done = true;
      glRender(); window.scrollTo({ top: 0 });
    }
    function gmCard() {
      const idx = gmScope(), c = gmCounts(idx), scope = glSub ? glSub : glFolder ? glFolder : '전체', pct = c.total ? Math.round(c.mastered / c.total * 100) : 0;
      const chip = (kind, n) => `<button type="button" class="gm-chip" ${n ? '' : 'disabled'} onclick="gmStart('${kind}')"><b>${GM_LABEL[kind]}</b><span>${n}</span></button>`;
      return `<div class="gm-card"><div class="gm-h"><span class="gm-ic">🧠</span><div><div class="gm-t">암기 모드</div><div class="gm-s">${escH(scope)} 용어를 가려 놓고 떠올려 봐요</div></div></div>
        <div class="gm-prog"><div class="gm-bar"><i style="width:${pct}%"></i></div><span>외운 용어 ${c.mastered}/${c.total}</span></div>
        <div class="gm-chips">${chip('due', Math.min(20, c.due))}${chip('new', Math.min(10, c.fresh))}${chip('weak', Math.min(20, c.weak))}${chip('mix', Math.min(20, c.total))}</div></div>`;
    }
    function gmRender() {
      const body = document.getElementById('glBody'), S = gmSess, T = glData.terms;
      if (S.done) {
        const n = S.list.length, miss = S.missed.map(i => T[i]);
        body.innerHTML = `<div class="gm-top"><span>${GM_LABEL[S.kind]} 끝!</span><span class="gm-bar"><i style="width:100%"></i></span><button type="button" class="gm-x" onclick="gmExit()">닫기</button></div>
          <div class="gm-res"><div class="big">${S.known} / ${n}</div><p>${miss.length ? `헷갈린 용어 ${miss.length}개는 내일 다시 나와요.` : '전부 알고 있었어요! 간격을 늘려서 다시 나와요.'}</p></div>
          ${miss.length ? `<div class="gm-miss"><h4>헷갈린 용어</h4>${miss.map(t => `<div><b>${escH(t.t_en || t.t)}</b><span>${escH(t.d)}</span></div>`).join('')}</div><button type="button" class="gm-main" onclick="gmStart('weak', gmSess.missed.slice())">헷갈린 ${miss.length}개 바로 다시</button>` : ''}
          <button type="button" class="gm-main ghost" onclick="gmExit()">단어장으로</button>`;
        return;
      }
      const t = T[S.list[S.i]], th = t.th && allTheories.find(x => x.title === t.th), td = gmDir === 'td';
      const front = td ? `<div class="gm-term">${escH(t.t_en || t.t)}</div>${t.en ? `<div class="gm-en">${escH(t.en)}</div>` : ''}` : `<div class="gm-hint" style="margin:0 0 .3rem">이 설명에 해당하는 용어는?</div><div class="gm-def">${escH(t.d)}</div>`;
      const back = td ? `<div class="a">${escH(t.d)}</div>` : `<div class="a">${escH(t.t_en || t.t)}${t.en ? ` <span class="gm-en">${escH(t.en)}</span>` : ''}</div>`;
      body.innerHTML = `<div class="gm-top"><span>${S.i + 1} / ${S.list.length}</span><span class="gm-bar"><i style="width:${S.i / S.list.length * 100}%"></i></span><button type="button" class="gm-x" onclick="gmExit()">그만하기</button></div>
        <div class="gm-dir"><button type="button" class="${td ? 'on' : ''}" onclick="gmSetDir('td')">용어 → 뜻</button><button type="button" class="${td ? '' : 'on'}" onclick="gmSetDir('dt')">뜻 → 용어</button></div>
        <button type="button" class="gm-face" onclick="gmFlip()" ${S.flip ? 'tabindex="-1"' : ''}><div class="gm-path">📂 ${escH(t.f)} › ${escH(t.s)}</div>${front}${S.flip ? '' : '<div class="gm-hint">머릿속으로 먼저 떠올려 보세요 · 눌러서 정답 보기</div>'}</button>
        ${S.flip ? `<div class="gm-ans">${back}${t.e ? `<p class="gl-row"><b>쉽게</b>${escH(t.e)}</p>` : ''}${t.u ? `<p class="gl-row"><b>쓰이는 곳</b>${escH(t.u)}</p>` : ''}${th ? `<button type="button" class="gl-th" onclick="openTheory('${escH(th.id)}')">이론 보기 →</button>` : ''}</div>
          <div class="gm-btns"><button type="button" class="no" onclick="gmAnswer(false)">🤔 헷갈려요</button><button type="button" class="ok" onclick="gmAnswer(true)">✅ 알아요</button></div>` : `<button type="button" class="gm-main" onclick="gmFlip()">정답 보기</button>`}`;
    }
    document.addEventListener('keydown', (e) => {
      if (currentViewId !== 'view-glossary' || !gmSess || gmSess.done || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
      if (!gmSess.flip) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); gmFlip(); } return; }
      if (e.key === 'ArrowLeft' || e.key === '1') gmAnswer(false); else if (e.key === 'ArrowRight' || e.key === '2') gmAnswer(true);
    });
    function glRender() {
      const body = document.getElementById('glBody'); if (!body) return;
      document.getElementById('view-glossary').classList.toggle('gm-on', !!gmSess);
      if (glData && gmSess) return gmRender();
      if (!glData) { body.innerHTML = `<p class="gl-empty">${glFailed ? '단어장을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.' : '단어장을 불러오는 중이에요…'}</p>`; return; }
      const q = document.getElementById('glSearch').value.trim().toLowerCase();
      if (q) {
        const hits = glData.terms.map((t, i) => ({ t, i })).filter(({ t }) => (t.t + ' ' + (t.t_en || '') + ' ' + (t.en || '') + ' ' + t.d).toLowerCase().includes(q));
        body.innerHTML = hits.length ? `<p class="gl-count">검색 결과 ${hits.length}개</p>` + hits.map(({ t, i }) => glCard(t, i, true, false)).join('') : '<p class="gl-empty">찾는 용어가 없어요. 다른 말로 검색해 보세요.</p>';
        return;
      }
      if (glSub) {
        const list = glData.terms.map((t, i) => ({ t, i })).filter(({ t }) => t.f === glFolder && t.s === glSub);
        body.innerHTML = `<div class="gl-crumb"><button type="button" onclick="glHome()">단어장</button>›<span>${escH(glFolder)}</span>›<b>${escH(glSub)}</b></div><p class="gl-count">용어 ${list.length}개 · 눌러서 펼쳐 보세요</p>` + gmCard() + list.map(({ t, i }) => glCard(t, i, false, i === glFocus)).join('');
        return;
      }
      body.innerHTML = gmCard() + glData.folders.map(f => `<section class="gl-folder"><div class="gl-fh"><span class="gl-fi">${escH(f.icon || '📁')}</span><div><div class="gl-fn">${escH(f.name)}</div><div class="gl-fs">${escH(f.desc || '')}</div></div></div>
        <div class="gl-subs">${f.subs.map(s => `<button type="button" class="gl-sub" onclick="glOpenSub('${jsq(f.name)}','${jsq(s)}')"><span>📂 ${escH(s)}</span><i>${glData.terms.filter(t => t.f === f.name && t.s === s).length}</i></button>`).join('')}</div></section>`).join('');
    }

    document.addEventListener('keydown', (e) => {
      if (currentViewId !== 'view-flow' || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
      if (e.key === 'ArrowRight') fjStep(1); else if (e.key === 'ArrowLeft') fjStep(-1);
    });

    ['view-setup', 'view-quiz', 'view-interview', 'view-result', 'view-note', 'view-exam', 'view-search'].forEach(id => document.getElementById(id).classList.add('max-w-2xl', 'mx-auto'));
    document.getElementById('view-learning').classList.add('max-w-4xl', 'mx-auto');
    document.getElementById('view-flow').classList.add('max-w-4xl', 'mx-auto');
    document.getElementById('view-glossary').classList.add('max-w-4xl', 'mx-auto');
    document.getElementById('view-path').classList.add('max-w-4xl', 'mx-auto');
    document.getElementById('view-subjects').classList.add('max-w-4xl', 'mx-auto');
    renderResumeBanner(); updateHeaderChip();
    initApp();
  
