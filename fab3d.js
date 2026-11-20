/* 3D 팹 둘러보기 (시제품)
   - three.js(vendor/three.min.js)가 먼저 불러와진 뒤에 실행된다. 팹 화면을 처음 열 때만 불러온다.
   - 장비는 이해를 돕기 위해 단순한 도형으로 만들었고, 크기도 보기 좋게 과장했다.
   - 디자인을 키울 때: 장비 모양은 '장비 모델'의 build* 함수에만 들어 있다. 실제 모델(glTF 등)로 바꿀 때는 이 함수들만 교체하면 되고,
     배치는 BAYS / ITEMS 데이터(베이 위치, 장비의 fwd·lat)가 정한다.
   - 바깥(index.html)과 주고받는 것: window.FAB.start()/stop(), window.fabLearn(category, subject) */
(function () {
  'use strict';
  const T = window.THREE;
  if (!T) return;
  const CAT = '반도체 8대 공정';
  const D2R = Math.PI / 180;
  const $ = (id) => document.getElementById(id);

  /* ───────── 내용 ───────── */
  const SPINE = 4.5, Z_TOP = 14, Z_END = -92, BAY_END = 34.5, BAY_HALF = 9, WALL_H = 6.4, EYE = 1.65, PI2 = Math.PI / 2;
  // 베이: 같은 종류의 장비를 모아 둔 긴 방. side -1 = 복도 왼쪽, +1 = 오른쪽, z = 복도 위의 위치. soon = 아직 안 만든 베이
  const BAYS = [
    { id: 'photo', side: -1, z: -22, name: '포토 베이', en: 'PHOTO BAY', floor: 0xffca28 },
    { id: 'etch', side: 1, z: -22, name: '식각 베이', en: 'ETCH BAY', floor: 0x9575cd },
    { id: 'dep', side: -1, z: -48, name: '증착 베이', en: 'THIN FILM BAY', floor: 0xffa726 },
    { id: 'cmp', side: 1, z: -48, name: 'CMP 베이', en: 'CMP BAY', floor: 0x4db6ac },
    { id: 'diff', side: -1, z: -74, name: '확산 · 이온주입 베이', en: 'DIFFUSION / IMPLANT', floor: 0x7986cb },
    { id: 'metro', side: 1, z: -74, name: '세정 · 계측 베이', en: 'CLEAN / METROLOGY', floor: 0x4fc3f7 },
  ];
  // 구역(카메라 자리). pose.yaw: 0 = 복도 아래쪽(-z)을 봄, 베이는 입구에서 안쪽을 본다
  const STATIONS = [
    { id: 'intake', short: '입고', name: '입고 · 반송', tag: '복도 입구 · 웨이퍼 보관과 반송', pose: { x: 0, z: 9, yaw: 0 }, sub2: '1. 웨이퍼 제조 공정', color: 0xffffff,
      intro: '복도(스파인) 입구예요. 웨이퍼 상자(FOUP)는 스토커에 보관됐다가 천장 레일(OHT)을 타고 각 베이로 흘러가요. 모든 공정은 여기서 시작해요.' },
    { id: 'photo', short: '포토', name: '포토 베이', tag: '회로를 빛으로 그리는 곳', pose: { x: -3.5, z: -22, yaw: PI2 }, sub2: '3. 포토 공정 (Photo)', color: 0xffd54f,
      intro: '베이는 같은 종류의 장비를 모아 둔 긴 방이에요. 여기는 포토 베이 — 감광액을 바르고 마스크의 회로를 빛으로 찍어요. 감광액이 엉뚱한 빛에 반응하지 않도록 노란 조명(옐로룸)을 써요.' },
    { id: 'etch', short: '식각', name: '식각 베이', tag: '필요 없는 부분을 깎는 곳', pose: { x: 3.5, z: -22, yaw: -PI2 }, sub2: '4. 식각 공정 (Etching)', color: 0xb388ff,
      intro: '빛으로 그린 패턴을 따라 필요 없는 부분을 깎아내요. 플라즈마를 쓰는 건식 식각이 가장 많이 쓰여요.' },
    { id: 'dep', short: '증착', name: '증착 베이', tag: '얇은 막을 쌓는 곳', pose: { x: -3.5, z: -48, yaw: PI2 }, sub2: '5. 박막 증착 공정 (Deposition)', color: 0xffab40,
      intro: '회로의 층을 이루는 얇은 막을 웨이퍼 위에 입혀요. 기체 반응(CVD), 금속 타격(PVD), 원자층(ALD) 같은 방식이 있어요.' },
    { id: 'cmp', short: 'CMP', name: 'CMP 베이', tag: '표면을 평평하게 가는 곳', pose: { x: 3.5, z: -48, yaw: -PI2 }, sub2: '1. 웨이퍼 제조 공정', color: 0x80cbc4,
      intro: '층을 쌓다 보면 웨이퍼 표면이 울퉁불퉁해져요. 여기서 표면을 평평하게 갈아 다음 층을 쌓을 준비를 해요.' },
    { id: 'diff', short: '확산·주입', name: '확산 · 이온주입 베이', tag: '불순물을 넣고 열처리하는 곳', pose: { x: -3.5, z: -74, yaw: PI2 }, sub2: '5. 박막 증착 공정 (Deposition)', color: 0xff8a65,
      intro: '실리콘에 불순물을 넣어 전기적 성질을 바꾸는 곳이에요. 고온으로 열처리하는 확산로, 불순물 이온을 쏘아 넣는 이온 주입기가 있어요.' },
    { id: 'metro', short: '세정·계측', name: '세정 · 계측 베이', tag: '씻고, 재고, 검사하는 곳', pose: { x: 3.5, z: -74, yaw: -PI2 }, sub2: '3. 포토 공정 (Photo)', color: 0x81d4fa,
      intro: '공정 사이사이에 웨이퍼를 씻어 오염을 없애고, 만든 패턴이 설계대로인지 재고 검사해요. 문제를 일찍 찾을수록 손실이 줄어요.' },
  ];

  // fwd/lat: 카메라 자리에서 앞으로 / 오른쪽으로 몇 m(음수는 왼쪽). view: 눌렀을 때 장비 앞에서 서는 거리, fy: 바라볼 높이, pinY: 핀 높이
  const ITEMS = [
    { id: 'foup', st: 0, name: 'FOUP', en: 'Front Opening Unified Pod', one: '웨이퍼 25장을 담는 밀폐 운반 상자',
      what: '300mm 웨이퍼를 최대 25장까지 담아 장비와 장비 사이를 옮기는 밀폐 용기예요. 앞문이 열리는 구조라서 로봇이 웨이퍼를 한 장씩 꺼내 장비에 넣어 줘요.',
      why: '웨이퍼 위의 회로는 먼지 한 톨에도 불량이 나요. FOUP 안은 바깥보다 훨씬 깨끗하게 유지돼서, 사람이 웨이퍼를 직접 만지지 않고도 공정을 이어 갈 수 있어요.',
      pts: ['25장 단위', '밀폐 · 클린', '앞문 개방형', '자동 반송과 한 세트'], fwd: 6, lat: -3.2, view: 4.5, fy: 1.7, pinY: 3.1, ring: 1.4 },
    { id: 'wafer', st: 0, name: '웨이퍼', en: '300mm Silicon Wafer', one: '칩이 새겨지는 얇은 실리콘 원판',
      what: '순도 높은 단결정 실리콘을 얇게 자른 원판이에요. 지금은 지름 300mm가 가장 많이 쓰이고, 두께는 약 0.775mm예요. 표면에 같은 칩(다이)을 격자 모양으로 한꺼번에 만들어요.',
      why: '한 장에 칩을 많이 올릴수록 칩 하나당 비용이 내려가요. 그래서 웨이퍼는 150mm → 200mm → 300mm로 점점 커져 왔어요. (여기서는 보기 좋게 확대해 두었어요.)',
      pts: ['지름 300mm', '두께 약 0.775mm', '단결정 실리콘', '칩(다이)이 격자로 배치'], fwd: 6, lat: 3.2, view: 4.0, fy: 2.0, pinY: 3.3, ring: 1.0 },
    { id: 'oht', st: 0, name: 'OHT', en: 'Overhead Hoist Transport', one: '천장 레일을 달리는 무인 반송 차량',
      what: '천장에 설치된 레일 위를 달리며 FOUP을 집어 올리고 내려놓는 무인 운반 시스템이에요. 장비 앞 로드포트 바로 위에서 멈춰 FOUP을 내려 줘요.',
      why: '공정이 수백 단계라서 웨이퍼는 팹 안을 쉬지 않고 이동해요. 바닥을 비우고 사람 손을 줄여서 먼지와 사고 위험을 낮추고, 장비가 놀지 않게 해 줘요.',
      pts: ['천장 레일', '무인 · 자동', 'FOUP 단위로 이동', '바닥 공간 절약'], view: 4.6, fy: 4.0, pinY: 0, ring: 0 },

    { id: 'stocker', st: 0, name: '스토커', en: 'Stocker', one: '웨이퍼 상자(FOUP)를 보관하는 자동 창고',
      what: '공정과 공정 사이에서 잠시 쉬어 가는 FOUP을 선반에 쌓아 두는 자동 창고예요. 크레인이 필요한 FOUP을 꺼내 OHT에 실어 주고, 돌아온 FOUP은 다시 선반에 넣어요.',
      why: '웨이퍼는 다음 장비가 빌 때까지 기다려야 해요. 스토커가 대기 중인 웨이퍼를 깨끗한 환경에 안전하게 보관해서 장비가 놀지 않게 해 줘요.',
      pts: ['FOUP 자동 보관', '크레인이 입출고', '반송 시스템과 연결', '대기 웨이퍼 버퍼'], fwd: 14.5, lat: -3.4, view: 5.8, fy: 2.6, pinY: 5.6, ring: 3.6 },
    { id: 'track', st: 1, name: '포토 트랙', en: 'Coater / Developer Track', one: '감광액을 바르고, 노광 뒤에 현상하는 장비',
      what: '웨이퍼를 빙글빙글 돌려 감광액(PR)을 얇고 고르게 바르고(스핀 코팅), 굽고, 노광이 끝난 웨이퍼는 현상액으로 씻어 패턴을 드러내요. 보통 스캐너와 한 줄로 이어져 있어요.',
      why: '감광막 두께가 고르지 않으면 초점이 어긋나 패턴이 번져요. 트랙이 막을 균일하게 만들어야 미세한 회로가 정확하게 찍혀요.',
      pts: ['스핀 코팅', '베이크(굽기)', '현상', '스캐너와 인라인 연결'], fwd: 8, lat: 4.4, view: 6.5, fy: 1.5, pinY: 3.0, ring: 2.6 },
    { id: 'scanner', lab: 'photo', st: 1, name: '노광 장비', en: 'Scanner (EUV / DUV)', one: '마스크의 회로를 빛으로 웨이퍼에 찍는 장비',
      what: '마스크(레티클)의 회로 패턴에 빛을 쏘고, 렌즈로 보통 4분의 1로 줄여 웨이퍼의 감광막에 새겨요. 웨이퍼를 한 칸씩 옮기며(스텝 앤 스캔) 전체를 찍어요. 가장 미세한 공정에는 파장 13.5nm의 EUV 광원을 써요.',
      why: '회로 선폭은 빛으로 그릴 수 있는 한계에 좌우돼요. 파장이 짧을수록 더 가는 선을 그릴 수 있어서, 노광 기술이 반도체 미세화를 이끌어 왔어요. EUV 스캐너는 사실상 ASML 한 곳이 만들어요.',
      pts: ['보통 4배 축소 투영', 'ArF 193nm → EUV 13.5nm', '정렬(오버레이)이 생명', '초고가 장비'], fwd: 13.5, lat: 4.4, view: 7.5, fy: 2.4, pinY: 5.0, ring: 2.4 },
    { id: 'reticle', st: 1, name: '포토마스크', en: 'Photomask / Reticle', one: '회로 도안이 새겨진 유리판',
      what: '투명한 석영 유리판 위에 크롬 같은 막으로 회로 패턴을 새긴 원판이에요. 빛이 지나가는 곳과 막히는 곳이 생겨서, 필름 원판처럼 패턴을 웨이퍼에 옮겨요. EUV에서는 빛을 반사하는 반사형 마스크를 써요.',
      why: '마스크에 결함이 하나라도 있으면 그 마스크로 찍은 모든 웨이퍼에 같은 불량이 복사돼요. 그래서 먼지를 막는 펠리클을 씌우고 아주 엄격하게 검사해요.',
      pts: ['석영 기판', '한 층에 마스크 한 장', '결함이 그대로 복사', '펠리클로 보호'], fwd: 12, lat: -4.6, view: 4.2, fy: 2.3, pinY: 3.5, ring: 1.0 },

    { id: 'etcher', lab: 'etch', st: 2, name: '식각 장비', en: 'Etcher (Cluster Tool)', one: '마스크로 가려지지 않은 부분을 깎아내는 장비',
      what: '가운데의 반송 로봇이 웨이퍼를 여러 공정 챔버로 나눠 넣어 줘요. 챔버 안에서는 플라즈마로 감광막이 덮이지 않은 부분만 깎아 회로 모양을 만들어요.',
      why: '노광이 그린 도안을 실제 물질에 새기는 단계예요. 수직으로 곧게 깎아야(이방성 식각) 좁은 간격에서도 회로가 무너지지 않고 원하는 폭이 나와요.',
      pts: ['건식 식각(플라즈마)', '이방성 = 수직으로', '클러스터 구조', '식각 선택비'], fwd: 12, lat: -4.6, view: 8.0, fy: 1.6, pinY: 3.6, ring: 3.0 },
    { id: 'plasma', st: 2, name: '플라즈마', en: 'Plasma', one: '기체에 전기를 걸어 만든 빛나는 상태',
      what: '챔버에 기체를 넣고 고주파 전력을 걸면 기체가 이온과 전자로 나뉘며 빛나는 플라즈마가 돼요. 이온은 웨이퍼를 향해 수직으로 부딪히고, 활성 라디칼은 화학 반응으로 물질을 깎아요.',
      why: '이온의 물리적 충격과 라디칼의 화학 반응이 함께 일어나서 빠르고 수직인 식각이 가능해요. 증착(PECVD)과 세정에도 널리 쓰여요.',
      pts: ['이온 + 라디칼', 'RF 전력', '수직 방향 식각', '증착 · 세정에도 사용'], fwd: 8, lat: 4.4, view: 4.5, fy: 1.9, pinY: 3.4, ring: 1.1 },

    { id: 'cvd', lab: 'pecvd', st: 3, name: 'CVD', en: 'Chemical Vapor Deposition', one: '기체가 반응해 웨이퍼 위에 막을 만드는 장비',
      what: '반응 기체를 챔버에 흘려 넣으면, 뜨거운 웨이퍼 표면(또는 플라즈마) 위에서 화학 반응이 일어나 얇은 막이 쌓여요. 산화막·질화막 같은 절연막에 많이 써요.',
      why: '회로 층 사이를 절연하고 구조를 쌓으려면 균일한 막이 필요해요. CVD는 비교적 빠르고, 다양한 물질의 막을 만들 수 있어요.',
      pts: ['기체 반응', '절연막(SiO₂ · Si₃N₄)', 'PECVD / LPCVD', '속도가 빠름'], fwd: 9.5, lat: 4.4, view: 6.5, fy: 2.3, pinY: 5.2, ring: 2.0 },
    { id: 'pvd', lab: 'pvd', st: 3, name: 'PVD', en: 'Sputtering', one: '금속 타깃을 때려 막을 입히는 장비',
      what: '진공 챔버에서 아르곤 플라즈마의 이온이 금속 타깃을 때리면 금속 원자가 튀어나와 웨이퍼에 달라붙어 막이 돼요. 금속 배선용 막에 자주 써요.',
      why: '화학 반응 없이 물리적으로 금속 막을 입혀서 순도가 높은 금속막을 만들 수 있어요.',
      pts: ['타깃 + 아르곤 이온', '금속막', '진공 챔버', '물리적 증착'], fwd: 11, lat: -4.4, view: 6.5, fy: 2.0, pinY: 4.3, ring: 2.0 },
    { id: 'ald', lab: 'ald', st: 3, name: 'ALD', en: 'Atomic Layer Deposition', one: '원자층을 한 겹씩 쌓는 장비',
      what: '두 가지 기체를 번갈아 넣어 원자층을 한 겹씩 쌓는 방식이에요. 한 번 돌 때마다 반응이 표면에서 끝나서(자기 제한 반응) 두께를 원자 단위로 정할 수 있어요.',
      why: '회로가 작고 깊어질수록 구멍 속까지 얇고 고르게 덮어야 해요. ALD는 느리지만 가장 균일해서 게이트 절연막 같은 핵심 층에 쓰여요.',
      pts: ['한 번에 한 원자층', '자기 제한 반응', '균일한 덮임', '느리지만 정밀'], fwd: 17, lat: 4.4, view: 6.5, fy: 1.7, pinY: 3.9, ring: 2.2 },
    { id: 'cmp', lab: 'cmp', st: 4, name: 'CMP 장비', en: 'Chemical Mechanical Planarization', one: '표면을 화학+기계로 평평하게 가는 장비',
      what: '회전하는 연마 패드 위에 웨이퍼를 눌러 대고 연마제(슬러리)를 흘려서, 화학 반응과 기계적 마찰로 울퉁불퉁한 표면을 평평하게 깎아요. 가공이 끝나면 웨이퍼를 세정하고 건조해서 내보내요.',
      why: '층을 여러 번 쌓다 보면 표면이 울퉁불퉁해져서 다음 층의 포토 초점이 흐려져요. CMP로 표면을 평탄하게 만들어야 미세한 패턴이 정확히 찍히고, 구리 배선 같은 구조도 만들 수 있어요.',
      pts: ['화학 + 기계 연마', '평탄화', '회전 패드 + 슬러리', '연마 후 세정'], fwd: 9, lat: 4.5, view: 6.5, fy: 1.7, pinY: 3.3, ring: 2.4, sub: '1. 웨이퍼 제조 공정' },
    { id: 'slurry', st: 4, name: '슬러리 공급', en: 'Slurry Delivery', one: '연마제(슬러리)를 섞어 CMP로 보내는 설비',
      what: '아주 작은 연마 입자(실리카 등)와 화학약품이 섞인 액체를 탱크에서 섞고, 배관과 펌프로 CMP 패드 위에 일정한 양으로 흘려 줘요.',
      why: '슬러리의 농도와 입자 크기, 양이 조금만 달라져도 연마 속도와 표면 상태가 달라져요. 큰 입자나 뭉침은 웨이퍼에 긁힘을 만들어서 필터로 걸러 줘요.',
      pts: ['연마 입자 + 화학약품', '일정한 유량', '필터로 뭉침 제거', 'CMP 장비와 배관으로 연결'], fwd: 8, lat: -4.6, view: 5.5, fy: 1.3, pinY: 3.7, ring: 2.0, sub: '1. 웨이퍼 제조 공정' },
    { id: 'furnace', lab: 'furn', st: 5, name: '확산로 (퍼니스)', en: 'Diffusion Furnace', one: '웨이퍼 여러 장을 한꺼번에 고온에서 열처리하는 장비',
      what: '석영 보트에 웨이퍼를 세로로 꽂아 가열된 관 안에 넣고, 약 800~1,200℃의 고온에서 산화막을 키우거나 불순물을 퍼뜨리고(확산) 열처리(어닐링)해요.',
      why: '한 번에 많은 장을 처리해서 비용이 낮고, 막 두께와 불순물 분포를 온도와 시간으로 정밀하게 조절할 수 있어요.',
      pts: ['고온 열처리', '여러 장 한꺼번에(배치)', '산화 · 확산 · 어닐링', '온도 · 시간 제어'], fwd: 9, lat: 4.4, view: 7.0, fy: 2.4, pinY: 5.5, ring: 1.8, sub: '2. 산화 공정 (Oxidation)' },
    { id: 'implanter', lab: 'ion', st: 5, name: '이온 주입기', en: 'Ion Implanter', one: '불순물 이온을 가속해 웨이퍼에 박아 넣는 장비',
      what: '붕소·인·비소 같은 불순물을 이온으로 만들어 전기장으로 가속하고, 자석으로 원하는 이온만 골라 웨이퍼에 쏘아요. 이온의 에너지가 박히는 깊이를, 이온 개수(도즈)가 농도를 정해요. 주입 뒤에는 어닐링으로 결정 손상을 회복해요.',
      why: '불순물을 얼마나 깊이, 얼마나 넣느냐가 트랜지스터의 전기적 특성을 정해요. 이온 주입은 깊이와 양을 정밀하게 조절할 수 있어서 소스·드레인, 웰 같은 곳을 만드는 데 쓰여요.',
      pts: ['이온을 전기장으로 가속', '자석으로 이온 선별', '에너지 = 깊이', '도즈 = 농도'], fwd: 12, lat: -4.6, view: 8.2, fy: 1.7, pinY: 3.5, ring: 3.6, sub: '5. 박막 증착 공정 (Deposition)' },
    { id: 'wet', lab: 'wet', st: 6, name: '습식 세정 장비', en: 'Wet Bench / Cleaning', one: '약액으로 웨이퍼 표면의 오염을 씻어내는 장비',
      what: '웨이퍼를 여러 약액 조에 차례로 담그고 초순수로 헹궈서 입자, 유기물, 금속 오염을 제거한 뒤 말려요. 공정 사이사이에 수시로 들어가요.',
      why: '눈에 보이지 않는 먼지나 금속 이온 하나도 불량의 원인이 돼요. 세정은 거의 모든 공정 앞뒤에 들어가서, 전체 공정 단계에서 큰 비중을 차지해요.',
      pts: ['약액 조 + 초순수', '입자 · 금속 제거', '건조', 'RCA 세정(SC-1 / SC-2)'], fwd: 9.5, lat: 4.5, view: 6.5, fy: 1.5, pinY: 3.6, ring: 2.5, sub: '1. 웨이퍼 제조 공정' },
    { id: 'metrology', lab: 'met', st: 6, name: '계측 · 검사 장비', en: 'Metrology (CD-SEM)', one: '만든 패턴이 설계대로인지 재는 장비',
      what: 'CD-SEM 같은 장비는 전자빔으로 웨이퍼 위 패턴의 선폭(CD)을 나노미터 단위로 재요. 노광·식각 직후 이런 검사로 선폭, 겹침(오버레이), 결함을 확인해요.',
      why: '불량을 공정 초기에 찾아야 손실이 적어요. 측정값을 앞 공정 장비에 되돌려 조건을 보정(피드백)하기도 해요.',
      pts: ['선폭(CD) 측정', '오버레이 · 결함 검사', '전자빔(SEM)', '공정에 피드백'], fwd: 8, lat: -4.4, view: 6.0, fy: 2.0, pinY: 4.2, ring: 1.8, sub: '3. 포토 공정 (Photo)' },
  ];
  ITEMS.forEach((d, i) => { d.n = ITEMS.filter((x, j) => j < i && x.st === d.st).length + 1; });

  /* ───────── 상태 ───────── */
  let inited = false, gl = false, running = false, raf = 0;
  let renderer, scene, camera, wrap, canvas, pinsEl, infoEl, navEl, hudEl, hintEl, loadEl, toolsEl, legendEl;
  let baseFov = 60, W = 0, H = 0, camBack = 0;
  const cam = { x: 0, y: EYE, z: 9, yaw: 0, pitch: -0.1 };
  let station = 0, selId = null, anim = null, heldOht = false, firstTouch = false, overview = false, routeOn = false, routeAuto = false;
  const items = {};            // id -> { def, group, pin, focus(), pinPos() }
  const ticks = [], pickRoots = [], mats = {}, bayPins = [], routeDots = [];
  const ray = new T.Raycaster(), ndc = new T.Vector2(), tmpV = new T.Vector3();
  let lightBase = 14, selRing, ohtMain, dark = false, lights = {}, ceilG, routeG, wallsG;

  /* ───────── 도형 도우미 ───────── */
  function mt(c, o) {
    const k = c + (o ? JSON.stringify(o) : '');
    return mats[k] || (mats[k] = new T.MeshLambertMaterial(Object.assign({ color: c }, o || {})));
  }
  const B = (w, h, d) => new T.BoxGeometry(w, h, d);
  const C = (rt, rb, h, s) => new T.CylinderGeometry(rt, rb, h, s || 28);
  function mk(parent, geo, color, x, y, z, o) {
    const m = new T.Mesh(geo, mt(color, o));
    m.position.set(x || 0, y || 0, z || 0); parent.add(m); return m;
  }
  const GLASS = { transparent: true, opacity: 0.2, depthWrite: false, side: T.DoubleSide };
  function glow(parent, geo, color, op, x, y, z) {
    const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false }));
    m.position.set(x || 0, y || 0, z || 0); parent.add(m); return m;
  }
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }
  function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  /* ───────── 텍스처 ───────── */
  function floorTex(rx, ry) {
    return canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#d5dce5'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#aab5c2'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
      g.fillStyle = '#b6c0cc';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(24 + i * 27, 24 + j * 27, 4, 0, 7); g.fill(); }
    }, [rx, ry]);
  }
  function waferTex() {
    return canvasTex(512, 512, (g) => {
      const gr = g.createLinearGradient(0, 0, 512, 512);
      gr.addColorStop(0, '#6b7fb0'); gr.addColorStop(.35, '#41507a'); gr.addColorStop(.65, '#7a5fa3'); gr.addColorStop(1, '#3b5f86');
      g.fillStyle = gr; g.beginPath(); g.arc(256, 256, 254, 0, 7); g.fill();
      g.save(); g.beginPath(); g.arc(256, 256, 244, 0, 7); g.clip();
      const r = rnd(7);
      for (let y = 20; y < 500; y += 34) for (let x = 20; x < 500; x += 40) {
        const l = 52 + r() * 10; g.fillStyle = `hsl(${215 + r() * 40},38%,${l}%)`; g.fillRect(x, y, 37, 31);
        g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(x + 3, y + 3, 14, 3);
      }
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 4; g.beginPath(); g.arc(256, 256, 252, 0, 7); g.stroke();
    });
  }
  function reticleTex() {
    return canvasTex(512, 512, (g) => {
      g.fillStyle = '#111827'; g.fillRect(0, 0, 512, 512);
      g.fillStyle = '#c9dff0'; g.fillRect(34, 34, 444, 444);
      const r = rnd(11);
      g.fillStyle = '#0f172a';
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
        const ox = 44 + a * 143, oy = 44 + b * 143;
        g.strokeStyle = 'rgba(15,23,42,.6)'; g.lineWidth = 2; g.strokeRect(ox, oy, 132, 132);
        for (let k = 0; k < 14; k++) {
          const hor = r() > .5, x = ox + 8 + r() * 100, y = oy + 8 + r() * 100;
          g.fillRect(x, y, hor ? 12 + r() * 20 : 4, hor ? 4 : 12 + r() * 20);
        }
      }
    });
  }
  function signTex(text, sub) {
    return canvasTex(768, 192, (g, w, h) => {
      g.fillStyle = 'rgba(15,23,42,.9)'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 28); g.fill();
      // 글자가 판보다 길면(영어 등) 글씨를 줄여 판 안에 맞춘다
      const fit = (str, wt, px, min) => { let f = px; g.font = wt + ' ' + f + 'px sans-serif'; while (f > min && g.measureText(str).width > w - 48) { f -= 2; g.font = wt + ' ' + f + 'px sans-serif'; } };
      g.fillStyle = '#94a3b8'; fit(sub, 700, 34, 20); g.textAlign = 'center'; g.fillText(sub, w / 2, 70);
      g.fillStyle = '#fff'; fit(text, 800, 66, 34); g.fillText(text, w / 2, 144);
    });
  }

  /* ───────── 장비 모델 ───────── */
  function foupBody() {
    const g = new T.Group();
    mk(g, B(1, 1.1, 1), 0xffa726, 0, 0, 0, { transparent: true, opacity: 0.36, depthWrite: false });
    for (let i = 0; i < 9; i++) mk(g, C(.4, .4, .025, 28), 0xb0bac8, 0, -0.42 + i * 0.105, -0.02);
    mk(g, B(.92, .98, .04), 0x37474f, 0, 0, .51, { transparent: true, opacity: 0.5, depthWrite: false });
    mk(g, B(.18, .12, .18), 0x455a64, 0, .61, 0); mk(g, B(.62, .05, .42), 0x455a64, 0, .69, 0);
    mk(g, B(.06, .2, .34), 0x37474f, -.53, .1, 0); mk(g, B(.06, .2, .34), 0x37474f, .53, .1, 0);
    return g;
  }
  function buildFoup() {
    const g = new T.Group();
    mk(g, B(1.7, .1, 1.4), 0x607d8b, 0, .95, 0);
    [[-.7, -.55], [.7, -.55], [-.7, .55], [.7, .55]].forEach((p) => mk(g, C(.05, .05, .9, 12), 0x455a64, p[0], .5, p[1]));
    mk(g, B(1.6, .06, 1.3), 0x455a64, 0, .08, 0);
    mk(g, B(.3, .06, .04), 0x4caf50, 0, 1.02, .71, { emissive: 0x4caf50, emissiveIntensity: .8 });
    const f = foupBody(); f.scale.setScalar(1.3); f.position.y = 1.72; g.add(f);
    return g;
  }
  function ohtVehicle(scale, simple) {
    const g = new T.Group();
    mk(g, B(.8, .3, 1.5), 0xeceff1, 0, 0, 0); mk(g, B(.86, .06, 1.56), 0x1976d2, 0, .17, 0);
    mk(g, B(.06, .95, .06), 0x546e7a, -.28, -.6, 0); mk(g, B(.06, .95, .06), 0x546e7a, .28, -.6, 0);
    mk(g, B(.72, .16, .5), 0x455a64, 0, -1.1, 0);
    const f = simple ? new T.Mesh(B(.6, .66, .6), mt(0xffa726, { transparent: true, opacity: .75 })) : foupBody();
    if (!simple) f.scale.setScalar(.6); f.position.y = -1.55; g.add(f);
    g.scale.setScalar(scale || 1); return g;
  }
  function buildWafer() {
    const g = new T.Group();
    mk(g, C(.55, .68, .9, 32), 0xeceff1, 0, .45, 0); mk(g, C(.72, .72, .06, 32), 0x607d8b, 0, .93, 0);
    mk(g, C(.035, .035, 1.0, 10), 0x78909c, 0, 1.45, -.05);
    const spin = new T.Group(); spin.position.set(0, 2.1, 0); g.add(spin);
    const tex = waferTex();
    const cap = new T.MeshLambertMaterial({ map: tex, emissive: 0x223355, emissiveIntensity: .35 });
    const w = new T.Mesh(C(1.05, 1.05, .05, 64), [mt(0x9aa7b8), cap, cap]);
    w.rotation.x = Math.PI / 2; spin.add(w);
    mk(g, B(.5, .08, .08), 0x78909c, 0, 1.2, -.05);
    return { g, spin };
  }
  function buildTrack() {
    const g = new T.Group();
    mk(g, B(4.4, 2.1, 1.7), 0xeceff1, 0, 1.05, 0); mk(g, B(4.42, .14, 1.72), 0x1976d2, 0, .35, 0);
    mk(g, C(.35, .35, .8, 20), 0x90a4ae, -1.3, 2.5, -.3); mk(g, C(.35, .35, .8, 20), 0x90a4ae, 1.3, 2.5, -.3);
    [-1.4, 0, 1.4].forEach((x) => {
      mk(g, B(1.1, .9, .04), 0x263238, x, 1.35, .86, { emissive: 0xffd54f, emissiveIntensity: .55 });
      mk(g, C(.3, .3, .03, 28), 0xb0bec5, x, 1.35, .9).rotation.x = Math.PI / 2;
      mk(g, B(1.2, .08, .06), 0x546e7a, x, .86, .88);
    });
    mk(g, B(.08, .8, .08), 0x546e7a, 2.55, 1.6, .85); mk(g, B(.8, .55, .06), 0x263238, 2.55, 2.1, .9, { emissive: 0x42a5f5, emissiveIntensity: .5 });
    return g;
  }
  function buildScanner() {
    const g = new T.Group(), ring = { m: null };
    mk(g, B(3.4, 1.1, 2.8), 0xcfd8dc, 0, .55, 0); mk(g, B(3.42, .14, 2.82), 0x1565c0, 0, .85, 0);
    mk(g, B(2.4, 1.5, 2.2), 0xf5f7f9, 0, 1.85, 0); mk(g, B(1.2, .7, .05), 0x263238, 0, 1.85, 1.11, { emissive: 0x7c4dff, emissiveIntensity: .4 });
    mk(g, C(.62, .75, 1.3, 32), 0x78909c, 0, 3.2, 0); mk(g, C(.82, .82, .1, 32), 0x455a64, 0, 2.62, 0); mk(g, C(.8, .8, .1, 32), 0x455a64, 0, 3.85, 0);
    mk(g, C(.36, .36, .9, 24), 0x37474f, 0, 4.4, 0);
    ring.m = glow(g, new T.TorusGeometry(.72, .06, 10, 40), 0xb388ff, .85, 0, 2.5, 0); ring.m.rotation.x = Math.PI / 2;
    mk(g, B(1.0, 1.3, 1.5), 0xb0bec5, -2.3, .65, -.4); mk(g, B(.7, .08, .9), 0x37474f, -2.3, 1.34, -.4);
    g.userData.ring = ring.m; return g;
  }
  function buildReticle() {
    const g = new T.Group();
    mk(g, C(.5, .6, .12, 28), 0x455a64, 0, .06, 0); mk(g, C(.05, .05, 1.6, 10), 0x78909c, 0, .9, -.08);
    const spin = new T.Group(); spin.position.set(0, 2.45, 0); g.add(spin);
    mk(spin, B(1.75, 1.75, .06), 0x37474f, 0, 0, -.07);
    const edge = mt(0x1f2937), front = new T.MeshLambertMaterial({ map: reticleTex(), emissive: 0x1e293b, emissiveIntensity: .25 });
    spin.add(new T.Mesh(B(1.5, 1.5, .07), [edge, edge, edge, edge, front, edge]));
    mk(spin, B(1.54, 1.54, .012), 0xbbdefb, 0, 0, .055, { transparent: true, opacity: .12, depthWrite: false });
    return { g, spin };
  }
  function buildEtcher() {
    const g = new T.Group(), inn = new T.Group(); inn.position.z = 1.8; g.add(inn);
    mk(inn, B(3.6, 1.8, 1.1), 0xeceff1, 0, .9, 0); mk(inn, B(3.62, .12, 1.12), 0x7c4dff, 0, .3, 0);
    [-.9, .9].forEach((x) => { mk(inn, B(.9, .5, .5), 0x546e7a, x, 1.05, .8); const f = foupBody(); f.scale.setScalar(.42); f.position.set(x, 1.5, .78); inn.add(f); });
    mk(inn, C(1.2, 1.2, 1.6, 6), 0xb0bec5, 0, .8, -1.9); mk(inn, C(1.0, 1.0, .1, 6), 0x607d8b, 0, 1.65, -1.9); mk(inn, C(.32, .32, .16, 16), 0x37474f, 0, 1.78, -1.9);
    [[-2.3, -2.9], [2.3, -2.9], [0, -4.1]].forEach((p) => {
      mk(inn, C(.95, .95, 2.3, 28), 0xcfd8dc, p[0], 1.15, p[1]); mk(inn, C(1.0, 1.0, .18, 28), 0x78909c, p[0], 2.4, p[1]);
      mk(inn, B(.5, .5, .5), 0x37474f, p[0], 2.75, p[1]); mk(inn, C(.99, .99, .08, 28), 0x7c4dff, p[0], 1.55, p[1], { emissive: 0x7c4dff, emissiveIntensity: .9 });
    });
    return g;
  }
  function buildPlasma() {
    const g = new T.Group();
    mk(g, C(.72, .82, .9, 32), 0x37474f, 0, .45, 0); mk(g, C(.78, .78, .1, 32), 0x90a4ae, 0, .95, 0); mk(g, C(.52, .52, .03, 28), 0x607d8b, 0, 1.03, 0);
    const glass = new T.Mesh(new T.CylinderGeometry(.88, .88, 1.6, 40, 1, true), mt(0xb3e5fc, GLASS)); glass.position.y = 1.85; g.add(glass);
    mk(g, C(.78, .78, .1, 32), 0xb0bec5, 0, 2.7, 0); mk(g, C(.08, .08, .7, 10), 0xb0bec5, 0, 3.1, 0); mk(g, B(.7, .4, .5), 0x1976d2, 0, 3.6, 0);
    const outer = glow(g, C(.72, .72, 1.4, 32), 0xa855f7, .3, 0, 1.85, 0), inner = glow(g, C(.42, .42, 1.2, 28), 0xe9d5ff, .5, 0, 1.85, 0);
    const N = 70, pos = new Float32Array(N * 3), rr = rnd(3);
    for (let i = 0; i < N; i++) { const a = rr() * 6.28, r = Math.sqrt(rr()) * .6; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = 1.1 + rr() * 1.5; pos[i * 3 + 2] = Math.sin(a) * r; }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const pts = new T.Points(geo, new T.PointsMaterial({ color: 0x6d28d9, size: .1, transparent: true, opacity: .95, depthWrite: false }));
    g.add(pts);
    return { g, outer, inner, pts, pos, N };
  }
  function buildCvd() {
    const g = new T.Group();
    mk(g, B(2.6, 1.3, 2.2), 0xeceff1, 0, .65, 0); mk(g, B(2.0, 1.0, 1.8), 0xcfd8dc, 0, 1.8, 0);
    mk(g, C(.9, .9, 1.1, 32), 0xb0bec5, 0, 2.85, 0);
    const dome = new T.Mesh(new T.SphereGeometry(.9, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), mt(0xb0bec5)); dome.position.y = 3.4; g.add(dome);
    const ring = glow(g, new T.TorusGeometry(.92, .08, 10, 40), 0xffa040, .9, 0, 2.85, 0); ring.rotation.x = Math.PI / 2;
    [-.35, 0, .35].forEach((x, i) => { mk(g, C(.035, .035, 1.0, 8), 0x90a4ae, x, 4.8, 0); mk(g, B(.12, .12, .12), [0x2196f3, 0xff9800, 0x4caf50][i], x, 4.3, 0); });
    mk(g, B(1.2, .08, .08), 0x90a4ae, 0, 5.3, 0);
    mk(g, B(1.2, 2.4, 1.4), 0xcfd8dc, 2.3, 1.2, 0);
    [0, 1, 2].forEach((i) => mk(g, B(.18, .18, .05), [0x2196f3, 0xff9800, 0x4caf50][i], 2.3, 1.9 - i * .35, .72, { emissive: [0x2196f3, 0xff9800, 0x4caf50][i], emissiveIntensity: .7 }));
    const pipe = mk(g, C(.05, .05, 1.3, 8), 0x90a4ae, 1.65, 3.0, 0); pipe.rotation.z = Math.PI / 2;
    return { g, ring };
  }
  function buildPvd() {
    const g = new T.Group();
    mk(g, B(2.8, 1.6, 2.2), 0xeceff1, 0, .8, 0); mk(g, C(1.15, 1.15, 1.2, 36), 0xcfd8dc, 0, 2.2, 0);
    mk(g, new T.CircleGeometry(.62, 32), 0x0d1b3e, 0, 2.2, 1.16);
    const ring = glow(g, new T.TorusGeometry(.42, .05, 10, 40), 0x4fc3f7, .95, 0, 2.2, 1.18), disc = glow(g, new T.CircleGeometry(.4, 32), 0x4fc3f7, .35, 0, 2.2, 1.17);
    mk(g, new T.CircleGeometry(.2, 24), 0xd4a017, 0, 2.2, 1.165);
    mk(g, C(.9, .9, .4, 28), 0xc77d3a, 0, 3.0, 0); mk(g, B(.5, .5, .5), 0x37474f, 0, 3.45, 0);
    mk(g, C(.04, .04, .9, 8), 0x4fc3f7, -.5, 3.4, .3); mk(g, C(.04, .04, .9, 8), 0x4fc3f7, .5, 3.4, .3);
    mk(g, C(.5, .5, 1.4, 20), 0x546e7a, 2.0, .7, 0);
    return { g, ring, disc };
  }
  function buildAld() {
    const g = new T.Group(), inn = new T.Group(); inn.position.x = -1.35; g.add(inn);
    mk(inn, B(1.8, 1.8, 1.7), 0xeceff1, 0, .9, 0); mk(inn, C(.6, .6, .9, 28), 0xcfd8dc, 0, 2.25, 0); mk(inn, C(.66, .66, .12, 28), 0x78909c, 0, 2.77, 0);
    [-.5, 0, .5].forEach((x, i) => mk(inn, B(.22, .22, .06), [0x2196f3, 0xf06292, 0x4caf50][i], x, 1.2, .86, { emissive: [0x2196f3, 0xf06292, 0x4caf50][i], emissiveIntensity: .6 }));
    mk(inn, C(.04, .04, 1.0, 8), 0x90a4ae, 0, 3.4, 0);
    mk(inn, C(.8, .9, .85, 32), 0x37474f, 2.7, .42, 0);
    const dome = new T.Mesh(new T.SphereGeometry(1.0, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), mt(0xb3e5fc, GLASS)); dome.position.set(2.7, .85, 0); inn.add(dome);
    const layers = [];
    [0x38bdf8, 0xf472b6, 0x38bdf8, 0xf472b6, 0x34d399, 0xfbbf24].forEach((c, i) => { const m = mk(inn, C(.72, .72, .1, 32), c, 2.7, 1.02 + i * .16, 0, { emissive: c, emissiveIntensity: .35 }); layers.push(m); });
    return { g, layers };
  }

  function buildStocker() {
    const g = new T.Group();
    mk(g, B(7, 5.2, .3), 0x78909c, 0, 2.6, -.8);
    [-3.4, 3.4].forEach((x) => mk(g, B(.2, 5.2, 1.8), 0x546e7a, x, 2.6, 0));
    for (let r = 0; r < 6; r++) mk(g, B(6.8, .08, 1.6), 0x455a64, 0, .4 + r * 1.0, 0);
    const inst = new T.InstancedMesh(B(.7, .75, .8), mt(0xf5a623), 5 * 8), m4 = new T.Matrix4(), rr = rnd(9); let n = 0;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) { m4.makeScale(1, 1, 1); if (rr() < .22) m4.makeScale(0, 0, 0); m4.setPosition(-3.0 + c * .86, .85 + r * 1.0, 0); inst.setMatrixAt(n++, m4); }
    g.add(inst);
    const crane = new T.Group(); g.add(crane); mk(crane, B(.25, 5.2, .25), 0x1976d2, 0, 2.6, 1.05);
    const car = new T.Group(); crane.add(car); mk(car, B(.9, .7, .9), 0xeceff1, 0, 0, 1.05); mk(car, B(.5, .15, .5), 0xffa726, 0, .45, 1.05);
    mk(g, B(7, .12, .12), 0x1976d2, 0, .1, 1.05);
    return { g, crane, car };
  }
  function buildGeneric(seed) {
    const r = rnd(seed), g = new T.Group(), w = 2.6 + r() * 1.6, h = 2 + r() * 1.8;
    mk(g, B(w, h, 1.8), r() > .5 ? 0xeceff1 : 0xcfd8dc, 0, h / 2, 0); mk(g, B(w + .02, .12, 1.82), [0x1976d2, 0x7c4dff, 0xffa726][Math.floor(r() * 3)], 0, .35, 0);
    mk(g, B(.9, .6, .04), 0x263238, -w / 4, h * .62, .91, { emissive: 0x42a5f5, emissiveIntensity: .4 });
    return g;
  }

  function buildCmp() {
    const g = new T.Group(), pads = [];
    mk(g, B(3.6, .95, 2.4), 0xeceff1, 0, .475, 0); mk(g, B(3.62, .1, 2.42), 0x1976d2, 0, .3, 0);
    [-1, 1].forEach((s) => {
      const x = s * .95;
      mk(g, C(.82, .82, .12, 40), 0x37474f, x, 1.0, .1);
      const pad = new T.Group(); pad.position.set(x, 1.09, .1); g.add(pad); pads.push(pad);
      mk(pad, C(.76, .76, .06, 40), 0x78909c, 0, 0, 0); mk(pad, C(.4, .4, .03, 32), 0x90a4ae, 0, .04, 0); mk(pad, B(.28, .04, .1), 0xffa726, .55, .05, 0);
      mk(g, C(.38, .38, .35, 24), 0x455a64, x, 1.55, .1); mk(g, C(.06, .06, .8, 8), 0x546e7a, x, 2.1, .1);
      mk(g, B(.12, .12, 1.3), 0x546e7a, x, 2.5, -.55); mk(g, C(.08, .08, 2.0, 8), 0x546e7a, x, 1.5, -1.15);
      mk(g, B(.04, .04, 1.1), 0x90a4ae, x + s * .35, 1.5, -.35); mk(g, new T.SphereGeometry(.07, 10, 8), 0x4fc3f7, x + s * .35, 1.38, .22, { emissive: 0x4fc3f7, emissiveIntensity: .8 });
    });
    mk(g, B(3.6, 1.6, .04), 0xb3e5fc, 0, 1.8, 1.2, { transparent: true, opacity: .14, depthWrite: false });
    mk(g, B(3.6, .08, .06), 0xcfd8dc, 0, 2.62, 1.2);
    return { g, pads };
  }
  function buildSlurry() {
    const g = new T.Group();
    [-1.3, 0, 1.3].forEach((x, i) => {
      mk(g, C(.55, .55, 1.9, 28), 0xeceff1, x, 1.0, 0); mk(g, C(.55, .3, .3, 28), 0xcfd8dc, x, 2.1, 0); mk(g, C(.5, .5, .1, 28), 0x90a4ae, x, .08, 0);
      mk(g, B(.12, 1.2, .04), [0x4fc3f7, 0xffffff, 0x81c784][i], x, 1.0, .56, { emissive: [0x4fc3f7, 0xdddddd, 0x81c784][i], emissiveIntensity: .5 });
      mk(g, C(.05, .05, 1.2, 8), 0x90a4ae, x, 2.7, 0);
    });
    mk(g, B(3.4, .08, .08), 0x90a4ae, 0, 3.3, 0);
    mk(g, B(.8, .6, .7), 0x1976d2, 2.3, .3, .1); mk(g, C(.3, .3, .5, 20), 0x546e7a, 2.3, .85, .1); mk(g, B(.5, .4, .05), 0x263238, 2.3, 1.5, .5, { emissive: 0x42a5f5, emissiveIntensity: .4 });
    return g;
  }
  function buildFurnace() {
    const g = new T.Group(), inn = new T.Group(); inn.position.x = -.7; g.add(inn);
    mk(inn, B(2.2, 1.1, 1.6), 0xeceff1, 0, .55, 0); mk(inn, B(.9, .6, .05), 0x263238, .3, .7, .82, { emissive: 0x42a5f5, emissiveIntensity: .5 });
    mk(inn, C(.88, .88, 3.4, 36), 0xb0bec5, 0, 2.8, -.1); mk(inn, C(.55, .55, .4, 24), 0x78909c, 0, 4.7, -.1); mk(inn, C(.12, .12, .7, 10), 0x90a4ae, 0, 5.1, -.1);
    const bs = [];
    [2.2, 2.8, 3.4].forEach((y) => { const b = glow(inn, new T.TorusGeometry(.9, .07, 10, 40), 0xff9800, .85, 0, y, -.1); b.rotation.x = Math.PI / 2; bs.push(b); });
    mk(inn, C(.62, .7, .7, 28), 0x546e7a, 2.0, .35, .3);
    mk(inn, new T.CylinderGeometry(.55, .55, 1.3, 28, 1, true), 0xb3e5fc, 2.0, 1.35, .3, GLASS);
    for (let i = 0; i < 14; i++) mk(inn, C(.46, .46, .025, 24), 0xaab4c4, 2.0, .8 + i * .08, .3);
    return { g, bands: bs };
  }
  function buildImplanter() {
    const g = new T.Group(), beams = [];
    mk(g, B(7, .5, 1.7), 0x546e7a, 0, .25, 0);
    mk(g, B(1.4, 2.0, 1.6), 0x1e3a8a, -2.9, 1.5, 0); mk(g, B(.5, .4, .05), 0x263238, -2.9, 1.7, .82, { emissive: 0xff9800, emissiveIntensity: .7 });
    mk(g, C(.2, .2, 1.0, 14), 0x90a4ae, -1.9, 1.6, 0).rotation.z = Math.PI / 2;
    mk(g, B(1.5, 2.3, 1.9), 0x37474f, -.7, 1.6, 0); mk(g, C(.5, .5, .3, 24), 0xc77d3a, -.7, 2.9, 0); mk(g, C(.5, .5, .3, 24), 0xc77d3a, -.7, .5, 0);
    mk(g, C(.2, .2, .9, 14), 0x90a4ae, .5, 1.6, 0).rotation.z = Math.PI / 2;
    for (let i = 0; i < 6; i++) mk(g, C(.62, .62, .12, 28), i % 2 ? 0x1976d2 : 0xb0bec5, 1.0 + i * .24, 1.6, 0).rotation.z = Math.PI / 2;
    mk(g, B(1.7, 2.1, 1.7), 0xeceff1, 3.0, 1.55, 0);
    const wheel = new T.Group(); wheel.position.set(3.0, 1.6, .9); g.add(wheel);
    mk(wheel, C(.65, .65, .05, 32), 0x607d8b, 0, 0, 0).rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, w = mk(wheel, C(.15, .15, .03, 16), 0xaab4c4, Math.cos(a) * .42, Math.sin(a) * .42, .04); w.rotation.x = Math.PI / 2; }
    [[-1.9, 1.0], [.5, .9], [1.9, 1.8]].forEach((p) => { const b = glow(g, C(.06, .06, p[1], 10), 0xc084fc, .85, p[0], 1.6, 0); b.rotation.z = Math.PI / 2; beams.push(b); });
    return { g, wheel, beams };
  }
  function buildWet() {
    const g = new T.Group();
    mk(g, B(4.2, .9, 1.5), 0xeceff1, 0, .45, 0); mk(g, B(4.22, .1, 1.52), 0x00acc1, 0, .3, 0);
    [-1.5, -.5, .5, 1.5].forEach((x, i) => { mk(g, B(.92, .3, 1.2), 0x607d8b, x, .98, 0); mk(g, B(.8, .05, 1.08), [0x4fc3f7, 0x81c784, 0xffe082, 0xb3e5fc][i], x, 1.12, 0, { emissive: [0x4fc3f7, 0x81c784, 0xffe082, 0xb3e5fc][i], emissiveIntensity: .3 }); });
    mk(g, B(4.2, 1.5, .04), 0xb3e5fc, 0, 1.95, .75, { transparent: true, opacity: .14, depthWrite: false }); mk(g, B(4.2, .1, 1.5), 0xcfd8dc, 0, 2.75, 0);
    mk(g, C(.35, .35, .6, 20), 0x90a4ae, 0, 3.1, 0);
    mk(g, B(4.0, .08, .08), 0x78909c, 0, 2.55, .1);
    const arm = new T.Group(); arm.position.set(0, 0, .1); g.add(arm); mk(arm, B(.1, 1.4, .1), 0x546e7a, 0, 1.85, 0); mk(arm, B(.5, .45, .3), 0xffa726, 0, 1.2, 0, { transparent: true, opacity: .75 });
    mk(g, B(.06, 1.0, .06), 0x546e7a, 2.5, .5, .7); mk(g, B(.8, .55, .05), 0x263238, 2.5, 1.4, .72, { emissive: 0x42a5f5, emissiveIntensity: .5 });
    return { g, arm };
  }
  function semTex() {
    return canvasTex(128, 128, (g, w, h) => {
      const r = rnd(21); g.fillStyle = '#4b5563'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) { const v = 70 + r() * 90; g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(r() * w, r() * h, 2, 2); }
      g.fillStyle = 'rgba(240,240,240,.85)'; for (let x = 16; x < 120; x += 22) g.fillRect(x, 10, 9, 108);
      g.strokeStyle = '#38bdf8'; g.lineWidth = 2; g.beginPath(); g.moveTo(25, 64); g.lineTo(47, 64); g.stroke();
    });
  }
  function buildMetro() {
    const g = new T.Group();
    mk(g, B(2.6, .8, 2.0), 0x607d8b, 0, .4, 0); mk(g, B(2.0, 1.4, 1.6), 0xf5f7f9, 0, 1.5, 0); mk(g, B(2.02, .1, 1.62), 0x7c4dff, 0, .95, 0);
    mk(g, C(.38, .46, 1.3, 28), 0x263238, 0, 2.85, 0); mk(g, C(.3, .3, .3, 24), 0x90a4ae, 0, 3.6, 0); mk(g, B(.35, .3, .35), 0x37474f, .55, 3.0, 0);
    mk(g, B(.7, .8, .9), 0xcfd8dc, -1.5, 1.2, 0);
    const cone = glow(g, new T.ConeGeometry(.28, .9, 20, 1, true), 0x7dd3fc, .4, 0, 2.0, 0); cone.rotation.x = Math.PI;
    mk(g, B(.06, 1.0, .06), 0x546e7a, 1.75, .5, .9);
    const sc = new T.Mesh(B(.95, .65, .05), new T.MeshBasicMaterial({ map: semTex() })); sc.position.set(1.75, 1.45, .95); sc.rotation.y = -.35; g.add(sc);
    return { g, cone };
  }

  /* ───────── 배치 도우미 ─────────
     장비는 '카메라 기준' 좌표(fwd=앞으로 몇 m, lat=오른쪽으로 몇 m)로 놓고, lat 이 0이 아니면 통로 쪽을 바라본다. */
  function frameOf(b) { return { x: b.side * 3.5, z: b.z, yaw: -b.side * PI2 }; }
  function at(F, fwd, lat) {
    const s = Math.sin(F.yaw), c = Math.cos(F.yaw);
    return { x: F.x - s * fwd + c * lat, z: F.z - c * fwd - s * lat, face: lat > 0 ? F.yaw - PI2 : lat < 0 ? F.yaw + PI2 : F.yaw };
  }
  function put(g, F, fwd, lat) { const p = at(F, fwd, lat); g.position.set(p.x, 0, p.z); g.rotation.y = p.face; scene.add(g); return g; }
  const grp = (o) => (o && o.isObject3D ? o : o.g);

  /* ───────── 장면 ───────── */
  function signMesh(text, sub, w, h) {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: signTex(text, sub), transparent: true }));
    return m;
  }
  function build() {
    scene = new T.Scene();
    scene.fog = new T.Fog(0xdfe7f0, 16, 66);
    camera = new T.PerspectiveCamera(60, 1, 0.1, 260);
    lights.hemi = new T.HemisphereLight(0xffffff, 0xaab6c4, 2.0); scene.add(lights.hemi);
    lights.dir = new T.DirectionalLight(0xffffff, 1.1); lights.dir.position.set(-6, 12, 8); scene.add(lights.dir);
    // 점광원은 개수만큼 모든 면의 계산량이 늘어나서 2개만 쓰고, 카메라가 보는 쪽 구역의 색을 따라가게 한다
    lights.pts = [0, 1].map(() => { const l = new T.PointLight(0xffffff, 12, 24, 1); l.position.set(0, 4.6, 0); scene.add(l); return l; });
    lights.slp = STATIONS.map((s) => { const p = at(s.pose, 7, 0); return { x: p.x, z: p.z, c: new T.Color(s.color) }; });

    const FW = BAY_END * 2, FL = Z_TOP - Z_END, CZ = (Z_TOP + Z_END) / 2;
    const floor = new T.Mesh(new T.PlaneGeometry(FW, FL), new T.MeshLambertMaterial({ map: floorTex(FW / 2, FL / 2) }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, CZ); scene.add(floor);

    // 천장 + FFU(팬 필터 유닛) 조명 — 위에서 볼 때는 숨긴다. 포토 베이는 노란빛
    ceilG = new T.Group(); scene.add(ceilG);
    const ceil = new T.Mesh(new T.PlaneGeometry(FW, FL), new T.MeshLambertMaterial({ color: 0xc9d3de }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, WALL_H, CZ); ceilG.add(ceil);
    const cols = 29, rows = 44, ffu = new T.InstancedMesh(B(1.3, .06, 1.3), new T.MeshBasicMaterial({ color: 0xffffff }), cols * rows);
    const m4 = new T.Matrix4(), col = new T.Color(); let n = 0;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = -33.6 + i * 2.4, z = 12.8 - j * 2.4; m4.setPosition(x, WALL_H - .04, z); ffu.setMatrixAt(n, m4);
      col.set(x < -SPINE && Math.abs(z + 22) < BAY_HALF ? 0xffe28a : 0xffffff); ffu.setColorAt(n, col); n++;
    }
    ceilG.add(ffu);

    // 벽: 복도(스파인) 양쪽 벽에 베이 입구가 뚫려 있고, 베이는 옆으로 길게 붙어 있다
    wallsG = new T.Group(); scene.add(wallsG);
    const wall = (x1, z1, x2, z2, c) => {
      const len = Math.hypot(x2 - x1, z2 - z1), ax = Math.abs(x2 - x1) > Math.abs(z2 - z1);
      const m = new T.Mesh(ax ? B(len, WALL_H, .35) : B(.35, WALL_H, len), mt(c || 0xdfe6ee)); m.position.set((x1 + x2) / 2, WALL_H / 2, (z1 + z2) / 2); wallsG.add(m);
    };
    [-1, 1].forEach((side) => {
      const sx = side * SPINE, doors = BAYS.filter((b) => b.side === side).map((b) => b.z).sort((a, b) => b - a); let prev = Z_TOP;
      doors.forEach((z) => { wall(sx, prev, sx, z + 4.5); prev = z - 4.5; }); wall(sx, prev, sx, Z_END);
    });
    wall(-SPINE, Z_TOP, SPINE, Z_TOP); wall(-SPINE, Z_END, SPINE, Z_END);
    BAYS.forEach((b) => {
      const s = b.side, x0 = s * SPINE, x1 = s * BAY_END;
      wall(x0, b.z - BAY_HALF, x1, b.z - BAY_HALF); wall(x0, b.z + BAY_HALF, x1, b.z + BAY_HALF); wall(x1, b.z - BAY_HALF, x1, b.z + BAY_HALF);
      mk(wallsG, B(.35, 2.2, 9), 0xc5ced8, x0, WALL_H - 1.1, b.z);                     // 입구 위 보
      if (b.soon) wall(x0, b.z - 4.5, x0, b.z + 4.5, 0xb0bec5);                          // 준비 중인 베이는 문을 닫아 둔다
      if (!b.soon) { const p = new T.Mesh(new T.PlaneGeometry(BAY_END - SPINE, BAY_HALF * 2), new T.MeshBasicMaterial({ color: b.floor, transparent: true, opacity: .2, depthWrite: false })); p.rotation.x = -Math.PI / 2; p.position.set(s * (SPINE + (BAY_END - SPINE) / 2), .02, b.z); scene.add(p); }
      const door = signMesh(b.name, b.en + (b.soon ? ' · 준비 중' : ''), 5.6, 1.4); door.position.set(s * (SPINE - .3), 4.7, b.z); door.rotation.y = -s * PI2; scene.add(door);
      if (!b.soon) { const e = signMesh(b.name, b.en, 6, 1.5); e.position.set(s * (BAY_END - .4), 4.4, b.z); e.rotation.y = -s * PI2; scene.add(e); }
    });
    [-1, 1].forEach((s) => { const l = new T.Mesh(new T.PlaneGeometry(.15, FL), new T.MeshBasicMaterial({ color: 0x42a5f5 })); l.rotation.x = -Math.PI / 2; l.position.set(s * 3.9, .03, CZ); scene.add(l); });
    const intakeSign = signMesh('입고 · 반송', 'INTAKE · STOCKER', 6, 1.5); intakeSign.position.set(0, 5.0, -13); scene.add(intakeSign);

    // 천장 레일: 복도의 베이 간 레일 + 베이 안의 베이 내 레일
    const rail = (x, y, z, w, h, d) => { const r = new T.Mesh(B(w, h, d), mt(0x90a4ae)); r.position.set(x, y, z); scene.add(r); };
    [-2.5, 0, 2.5].forEach((x) => { rail(x, 5.9, CZ, .16, .12, FL); for (let z = 12; z > -92; z -= 6) rail(x, 6.15, z, .06, .5, .06); });
    BAYS.forEach((b) => { const cx = b.side * (SPINE + (BAY_END - SPINE) / 2); rail(cx, 5.9, b.z, BAY_END - SPINE, .12, .16); for (let u = 6; u < 30; u += 6) rail(b.side * (SPINE + u), 6.15, b.z, .06, .5, .06); });
    const loops = [];
    [[-2.5, 1, 0], [-2.5, 1, 50], [2.5, -1, 20], [2.5, -1, 75]].forEach((c) => { const v = ohtVehicle(1, true); scene.add(v); loops.push({ v, axis: 'z', fixed: c[0], a: c[1] > 0 ? 12 : -90, b: c[1] > 0 ? -90 : 12, speed: 3.4, off: c[2] }); });
    BAYS.forEach((b, i) => { const v = ohtVehicle(1, true); v.rotation.y = PI2; scene.add(v); loops.push({ v, axis: 'x', fixed: b.z, a: b.side * SPINE, b: b.side * (BAY_END - 1), speed: 2.6, off: i * 9 }); });
    ticks.push((t) => loops.forEach((o) => {
      const len = Math.abs(o.b - o.a), f = ((t * o.speed + o.off) % len) / len, p = o.a + (o.b - o.a) * f;
      if (o.axis === 'z') o.v.position.set(o.fixed, 5.55, p); else o.v.position.set(p, 5.55, o.fixed);
    }));

    // 선택 표시 링
    selRing = new T.Mesh(new T.RingGeometry(.92, 1, 56), new T.MeshBasicMaterial({ color: 0x6366f1, transparent: true, opacity: .9, side: T.DoubleSide, depthWrite: false }));
    selRing.rotation.x = -Math.PI / 2; selRing.position.y = .05; selRing.visible = false; scene.add(selRing);

    // 눌러 볼 수 있는 장비
    const def = (id) => ITEMS.find((x) => x.id === id);
    const place = (id, g) => {
      const d = def(id), F = STATIONS[d.st].pose; put(g, F, d.fwd, d.lat); g.userData.itemId = id; pickRoots.push(g);
      const it = { def: d, group: g, focus: () => tmpV.set(g.position.x, d.fy, g.position.z), pinPos: () => tmpV.set(g.position.x, d.pinY, g.position.z) };
      items[id] = it; return it;
    };
    const decor = (st, fn, fwd, lat) => { const g = grp(fn()); put(g, STATIONS[st].pose, fwd, lat); return g; };

    // 입고·반송 (복도 입구)
    place('foup', buildFoup());
    { const w = buildWafer(); place('wafer', w.g); ticks.push((t) => { w.spin.rotation.y = Math.sin(t * .7) * .6; }); }
    { const s = buildStocker(); place('stocker', s.g); ticks.push((t) => { s.crane.position.x = Math.sin(t * .45) * 2.8; s.car.position.y = 2.4 + Math.sin(t * .9) * 1.7; }); }
    { const s = buildStocker(); put(s.g, STATIONS[0].pose, 14.5, 3.4); ticks.push((t) => { s.crane.position.x = Math.sin(t * .4 + 2) * 2.8; s.car.position.y = 2.4 + Math.sin(t * .7) * 1.7; }); }
    [[21, -3.4], [26, -3.4], [21, 3.4], [26, 3.4]].forEach((p, i) => decor(0, () => buildGeneric(30 + i), p[0], p[1]));
    { // OHT: 입구 구역을 천천히 오가는 차량
      const d = def('oht'), v = ohtVehicle(1.25); v.position.set(0, 5.55, -1); v.userData.itemId = 'oht'; scene.add(v); pickRoots.push(v); ohtMain = v;
      items.oht = { def: d, group: v, focus: () => v.getWorldPosition(tmpV).setY(4.0), pinPos: () => v.getWorldPosition(tmpV).setY(4.9) };
      let ph = 0, last = 0;
      ticks.push((t) => { const dt = Math.min(.1, t - last); last = t; if (!heldOht) ph += dt; v.position.z = 0.5 + Math.sin(ph * .42) * 4.5; });
    }

    // 포토 베이: 트랙과 스캐너는 서로 붙어 한 줄로 서 있다
    place('track', buildTrack());
    { const g = buildScanner(); place('scanner', g); const r = g.userData.ring; ticks.push((t) => { r.material.opacity = .6 + .3 * Math.sin(t * 3); }); }
    { const r = buildReticle(); place('reticle', r.g); ticks.push((t) => { r.spin.rotation.y = Math.sin(t * .8) * .45; }); }
    [-4.4, 4.4].forEach((lat) => { decor(1, buildTrack, 19, lat); decor(1, buildScanner, 24.5, lat); });

    // 식각 베이
    place('etcher', buildEtcher());
    { const p = buildPlasma(); place('plasma', p.g);
      ticks.push((t) => {
        const f = .85 + Math.sin(t * 17) * .06 + Math.sin(t * 5.3) * .08; p.outer.material.opacity = .26 * f + .06; p.inner.material.opacity = .5 * f; p.inner.scale.set(f, 1, f);
        for (let i = 0; i < p.N; i++) { let y = p.pos[i * 3 + 1] - .016 * (1 + (i % 5) * .3); if (y < 1.1) y = 2.6; p.pos[i * 3 + 1] = y; }
        p.pts.geometry.attributes.position.needsUpdate = true;
      }); }
    [[20, -4.6], [28, -4.6], [17, 4.6], [25, 4.6]].forEach((p) => decor(2, buildEtcher, p[0], p[1]));

    // 증착 베이
    { const c = buildCvd(); place('cvd', c.g); ticks.push((t) => { c.ring.material.opacity = .65 + .3 * Math.sin(t * 2.2); }); }
    { const p = buildPvd(); place('pvd', p.g); ticks.push((t) => { p.ring.rotation.z = t * 1.4; p.ring.material.opacity = .75 + .2 * Math.sin(t * 6); p.disc.material.opacity = .25 + .15 * Math.sin(t * 9); }); }
    { const a = buildAld(); place('ald', a.g); ticks.push((t) => { const k = Math.floor(t * .9) % 8; a.layers.forEach((m, i) => { m.visible = i < Math.min(k, 6) || k === 7 && i < 6; }); }); }
    decor(3, buildCvd, 19, -4.4); decor(3, buildPvd, 23.5, 4.4); decor(3, buildAld, 27, -4.4);

    // CMP 베이
    { const c = buildCmp(); place('cmp', c.g); ticks.push((t) => { c.pads.forEach((p, i) => { p.rotation.y = t * (i ? -1.6 : 1.6); }); }); }
    place('slurry', buildSlurry());
    [[16, 4.5], [23, 4.5], [15, -4.5], [22.5, -4.5]].forEach((p) => decor(4, () => buildCmp(), p[0], p[1]));
    // 확산 · 이온주입 베이
    { const f = buildFurnace(); place('furnace', f.g); ticks.push((t) => { f.bands.forEach((b, i) => { b.material.opacity = .65 + .3 * Math.sin(t * 1.6 + i); }); }); }
    { const im = buildImplanter(); place('implanter', im.g); ticks.push((t) => { im.wheel.rotation.z = t * 1.2; im.beams.forEach((b) => { b.material.opacity = .6 + .3 * Math.sin(t * 8); }); }); }
    [[15, 4.4], [21, 4.4], [27, 4.4]].forEach((p) => decor(5, buildFurnace, p[0], p[1])); decor(5, buildImplanter, 22.5, -4.6);
    // 세정 · 계측 베이
    { const w = buildWet(); place('wet', w.g); ticks.push((t) => { w.arm.position.x = Math.sin(t * .5) * 1.6; }); }
    { const m = buildMetro(); place('metrology', m.g); ticks.push((t) => { m.cone.material.opacity = .3 + .15 * Math.sin(t * 5); }); }
    [[16, 4.5], [22, 4.5]].forEach((p) => decor(6, buildWet, p[0], p[1])); [[14, -4.4], [19.5, -4.4], [25, -4.4]].forEach((p) => decor(6, buildMetro, p[0], p[1]));

    wallsG.children.forEach((m) => { if (m.isMesh) { m.userData.fo = 1; wallInfo.push({ m, box: new T.Box3().setFromObject(m) }); } });
    buildRoute();
    applyTheme();
  }

  // 웨이퍼 경로: 한 장의 웨이퍼가 같은 베이를 여러 번 오간다(재진입)
  const ROUTE_STOPS = [
    { n: 1, name: '입고', bay: 'intake', p: [0, -1], sub: 'FOUP 도착' },
    { n: 2, name: '포토', bay: 'photo', p: [-15, -22], sub: '회로 패턴 찍기' },
    { n: 3, name: '식각', bay: 'etch', p: [15, -22], sub: '패턴대로 깎기' },
    { n: 4, name: '증착', bay: 'dep', p: [-15, -48], sub: '막 쌓기' },
    { n: 5, name: 'CMP', bay: 'cmp', p: [15, -48], sub: '평평하게 갈기' },
  ];
  const routePins = [];
  function buildRoute() {
    routeG = new T.Group(); routeG.visible = false; scene.add(routeG);
    const spine = (z) => [0, z], bayIn = (s, z) => [s * SPINE, z], bayEnd = (s, z) => [s * 15, z];
    const visit = (s, z) => [bayIn(s, z), bayEnd(s, z), bayIn(s, z), spine(z)];
    const pass1 = [[0, 12], spine(-22)].concat(visit(-1, -22), visit(1, -22), [spine(-48)], visit(-1, -48), visit(1, -48));
    const pass2 = [spine(-48), spine(-22)].concat(visit(-1, -22), visit(1, -22), [spine(-48)], visit(-1, -48), visit(1, -48));
    const ash = new T.Shape(); ash.moveTo(0, 1.1); ash.lineTo(-1, -.7); ash.lineTo(0, -.2); ash.lineTo(1, -.7); ash.closePath(); const ageo = new T.ShapeGeometry(ash);
    [[pass1, -0.5, 0x06b6d4, .5, 1], [pass2, 0.5, 0xec4899, .28, .75]].forEach((P) => {
      const pts = P[0].map((p) => [p[0] + P[1], p[1] + P[1]]), cum = [0], w = P[3];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ax = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
        cum.push(cum[i - 1] + len);
        if (len < .01) continue;
        const m = new T.Mesh(ax ? B(len + w, .03, w) : B(w, .03, len + w), new T.MeshBasicMaterial({ color: P[2], transparent: true, opacity: .9 })); m.position.set((a[0] + b[0]) / 2, .07, (a[1] + b[1]) / 2); routeG.add(m);
        const n = Math.max(1, Math.round(len / 6)), yaw = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
        for (let k = 0; k < n; k++) {
          const u = (k + .5) / n, h = new T.Mesh(ageo, new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide, transparent: true, opacity: .95 }));
          h.rotation.order = 'YXZ'; h.rotation.x = -Math.PI / 2; h.rotation.y = yaw; h.scale.setScalar(P[4] * 1.1); h.position.set(a[0] + (b[0] - a[0]) * u, .12, a[1] + (b[1] - a[1]) * u); routeG.add(h);
        }
      }
      const path = { pts, cum, total: cum[cum.length - 1] };
      [0, .5].forEach((o) => {
        const d = new T.Group(); d.add(new T.Mesh(new T.SphereGeometry(.45, 16, 12), new T.MeshBasicMaterial({ color: P[2] })));
        const h = new T.Mesh(new T.SphereGeometry(.85, 16, 12), new T.MeshBasicMaterial({ color: P[2], transparent: true, opacity: .25, depthWrite: false })); d.add(h); d.position.y = .8; routeG.add(d);
        routeDots.push({ d, path, off: o * path.total });
      });
    });
    ticks.push((t) => {
      if (!routeG.visible) return;
      routeDots.forEach((r) => {
        const P = r.path, s = (t * 7 + r.off) % P.total; let i = 1; while (i < P.cum.length - 1 && P.cum[i] < s) i++;
        const a = P.pts[i - 1], b = P.pts[i], u = (s - P.cum[i - 1]) / Math.max(P.cum[i] - P.cum[i - 1], .001);
        r.d.position.x = a[0] + (b[0] - a[0]) * u; r.d.position.z = a[1] + (b[1] - a[1]) * u;
      });
    });
  }

  function applyTheme() {
    dark = document.documentElement.classList.contains('dark');
    if (!scene) return;
    const bg = dark ? 0x0a1220 : 0xdfe7f0;
    scene.fog.color.set(bg); renderer.setClearColor(bg, 1);
    lights.hemi.intensity = dark ? 0.75 : 2.0; lights.dir.intensity = dark ? 0.3 : 1.1;
    lightBase = dark ? 7 : 14;
  }

  /* ───────── 카메라 ───────── */
  const wrapAng = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  // 세로 화면에서는 한 걸음 물러서서 더 넓게 보이게 한다
  function stationPose(i) {
    const P = STATIONS[i].pose; return { x: P.x + Math.sin(P.yaw) * camBack, z: P.z + Math.cos(P.yaw) * camBack, y: EYE, yaw: P.yaw, pitch: -0.1 };
  }
  function overviewPose() {
    const tf = Math.tan(baseFov * D2R / 2), asp = W / Math.max(H, 1);
    return { x: 0, z: (Z_TOP + Z_END) / 2, y: Math.max((Z_TOP - Z_END + 12) / 2 / tf, (BAY_END * 2 + 8) / 2 / (tf * asp)), yaw: 0, pitch: -1.5707 };
  }
  // 이동 방식: 벽을 뚫고 목적지까지 곧장 부드럽게 미끄러진다(꺾이는 경로가 없어 끊기거나 어지럽지 않게).
  // 벽을 건너는 동안만 벽을 숨겨서 시야가 가려지지 않게 하고, 시선은 일정한 속도로 천천히 목적지 쪽으로 돌린다.
  const wrapAngTo = (a, b) => a + wrapAng(b - a);
  const bayOf = (x, z) => (Math.abs(x) > SPINE + .3 ? Math.sign(x) * 1000 + Math.round(z / 26) : 0);
  function flyTo(to) {
    const x1 = to.x, z1 = to.z, ty = to.y == null ? EYE : to.y, yaw = wrapAngTo(cam.yaw, to.yaw == null ? cam.yaw : to.yaw);
    const dist = Math.hypot(x1 - cam.x, z1 - cam.z), dyaw = Math.abs(yaw - cam.yaw);
    const hide = cam.y < 4 && ty < 4 && bayOf(cam.x, cam.z) !== bayOf(x1, z1) && dist > 3;
    const dur = Math.min(3200, Math.max(650, dist * 32, dyaw * 57.3 * 1.5 / 80 * 1000));
    anim = { t0: performance.now(), dur, g: { x0: cam.x, z0: cam.z, x1, z1, a: cam.yaw, b: yaw }, y0: cam.y, p0: cam.pitch, to, hide };
  }
  // 이동 중 시야를 가리는 벽(목적지로 향하는 선 위에 있거나 카메라에 아주 가까운 벽)만 투명하게 하고, 나머지 벽은 그대로 둔다
  const wallInfo = [], wray = new T.Raycaster();
  function updateWallFade(active) {
    const want = new Set();
    if (active && anim) {
      const tx = anim.to.x, tz = anim.to.z, d = Math.hypot(tx - cam.x, tz - cam.z), o = new T.Vector3(cam.x, cam.y, cam.z);
      if (d > 1) {
        const px = -(tz - cam.z) / d, pz = (tx - cam.x) / d;
        [-1.5, 0, 1.5].forEach((off) => {
          const dir = new T.Vector3(tx + px * off, cam.y, tz + pz * off).sub(o), L = dir.length(); dir.normalize(); wray.set(o, dir); wray.far = L;
          wray.intersectObjects(wallsG.children, false).forEach((h) => want.add(h.object));
        });
      }
      wallInfo.forEach((w) => { const b = w.box; if (cam.x > b.min.x - 1.8 && cam.x < b.max.x + 1.8 && cam.z > b.min.z - 1.8 && cam.z < b.max.z + 1.8) want.add(w.m); });
    }
    wallInfo.forEach((w) => {
      const m = w.m, t = want.has(m) ? .1 : 1, cur = m.userData.fo; if (cur === t) return;
      let n = cur + (t - cur) * .4; if (Math.abs(n - t) < .02) n = t;
      if (!m.userData.own) { m.material = m.material.clone(); m.userData.own = true; }
      const was = m.material.transparent; m.material.transparent = n < 1; m.material.opacity = n; m.material.depthWrite = n > .6; if (was !== m.material.transparent) m.material.needsUpdate = true;
      m.userData.fo = n;
    });
  }
  function stepAnim(now) {
    if (!anim) return;
    const tt = Math.min(1, (now - anim.t0) / anim.dur), k = tt * tt * (3 - 2 * tt), ty2 = Math.min(1, tt * 1.7), ky = ty2 * ty2 * (3 - 2 * ty2);   // 시선은 이동보다 먼저 돌아서 목적지를 일찍 바라본다
    const g = anim.g;
    cam.x = g.x0 + (g.x1 - g.x0) * k; cam.z = g.z0 + (g.z1 - g.z0) * k; cam.yaw = g.a + (g.b - g.a) * ky;
    const ty = anim.to.y == null ? EYE : anim.to.y, tp = anim.to.pitch == null ? -0.1 : anim.to.pitch;
    cam.y = anim.y0 + (ty - anim.y0) * k; cam.pitch = anim.p0 + (tp - anim.p0) * k;
    if (now - anim.t0 >= anim.dur) { cam.x = anim.to.x; cam.z = anim.to.z; cam.y = ty; cam.pitch = tp; anim = null; }
  }
  function goStation(i, instant) {
    station = Math.max(0, Math.min(STATIONS.length - 1, i)); selId = null; heldOht = false;
    if (overview) routeOn = false; overview = false;
    const to = stationPose(station);
    if (gl) { if (instant) { Object.assign(cam, to); anim = null; } else flyTo(to); }
    update();
  }
  function setOverview(on) {
    if (!on) { goStation(station); return; }
    overview = true; selId = null; heldOht = false;
    if (gl) flyTo(overviewPose());
    update();
  }
  function select(id) {
    if (!id) { selId = null; heldOht = false; overview = false; if (gl) flyTo(stationPose(station)); update(); return; }
    const it = items[id]; if (!it) return;
    overview = false; station = it.def.st; selId = id; heldOht = id === 'oht'; if (hintEl) hintEl.classList.add('off');
    if (window.innerWidth < 1024 && wrap) { const y = wrap.getBoundingClientRect().top; if (Math.abs(y - 72) > 8) window.scrollTo({ top: Math.max(0, window.scrollY + y - 72), behavior: 'smooth' }); }
    if (gl) {
      it.focus(); const wp = tmpV.clone(); let x, z;
      if (id === 'oht') { const sp = stationPose(0), dx = wp.x - sp.x, dz = wp.z - sp.z, L = Math.hypot(dx, dz) || 1; x = wp.x - dx / L * it.def.view; z = wp.z - dz / L * it.def.view; }
      else { const f = it.group.rotation.y; x = it.group.position.x + Math.sin(f) * it.def.view; z = it.group.position.z + Math.cos(f) * it.def.view; }
      const dx = wp.x - x, dz = wp.z - z, L = Math.hypot(dx, dz) || 1;
      const P = { x, z, y: EYE, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(wp.y - 0.4 - EYE, L) };
      flyTo(P);
    }
    update();
  }
  function nextItem(dir) {
    const i = ITEMS.findIndex((d) => d.id === selId), n = selId ? (i + dir + ITEMS.length) % ITEMS.length : (dir > 0 ? ITEMS.findIndex((d) => d.st === station) : 0);
    select(ITEMS[n].id);
  }

  /* ───────── 화면(HTML) ───────── */
  const ovIntro = '실제 팹은 공정 순서대로 일렬로 서 있지 않아요. 같은 종류의 장비를 한 베이(Bay)에 모아 두고, 가운데 복도(스파인)로 베이들을 이어요. 웨이퍼 상자(FOUP)는 천장 레일(OHT)을 타고 베이 사이를 오가요.';
  const ovRoute = '웨이퍼 한 장은 포토 → 식각 → 증착을 거친 뒤 다시 포토로 돌아와요. 층을 하나 쌓을 때마다 같은 베이를 또 지나가서, 수십 번 되돌아오는 이 흐름을 재진입이라고 불러요.';
  function flowHtml() {
    return '<h4>웨이퍼 한 장의 길</h4><p style="margin:.2rem 0 .5rem">① → ⑤ 순서로 지나가요. 층을 하나 쌓을 때마다 ②~⑤를 다시 돌아서(재진입), 이 과정을 수십 번 반복해요.</p>'
      + '<div class="fab-flow">' + ROUTE_STOPS.map((r) => '<button class="fab-eq" data-bay="' + r.bay + '"><i>' + r.n + '</i>' + r.name + '<small>' + r.sub + '</small></button>').join('<em>›</em>') + '<em class="rep">↻ 다시 ②로</em></div>';
  }
  function update() {
    const s = STATIONS[station], list = ITEMS.filter((d) => d.st === station), d = selId && items[selId] ? items[selId].def : null;
    if (hudEl) hudEl.innerHTML = overview ? '<b>MAP</b> · 위에서 본 팹' : '<b>STATION ' + (station + 1) + '</b> / ' + STATIONS.length + ' · ' + s.name;
    if (navEl) {
      navEl.querySelectorAll('[data-st]').forEach((b) => { const v = b.dataset.st; if (/^\d$/.test(v)) b.classList.toggle('on', !overview && +v === station); });
      navEl.querySelector('[data-st="prev"]').disabled = overview || station === 0; navEl.querySelector('[data-st="next"]').disabled = overview || station === STATIONS.length - 1;
    }
    if (toolsEl) {
      toolsEl.querySelector('[data-tool="map"]').textContent = overview ? '🚶 걸어서 보기' : '🗺 구조 보기';
      const rb = toolsEl.querySelector('[data-tool="route"]'); rb.classList.toggle('on', routeOn); rb.textContent = routeOn ? '웨이퍼 경로 끄기' : '웨이퍼 경로 보기';
    }
    if (routeG) routeG.visible = routeOn;
    if (hintEl) hintEl.style.display = overview ? 'none' : '';
    if (legendEl) legendEl.style.display = routeOn ? '' : 'none';
    let h;
    if (overview) {
      h = '<div class="fab-sthead"><span class="no">MAP</span><b>팹 구조 한눈에</b><span class="tag">위에서 본 모습</span></div>'
        + '<p class="fab-intro">' + ovIntro + '</p>' + (routeOn ? flowHtml() : '<p class="fab-tipline" style="margin:.6rem 0 0">👆 베이 이름을 누르면 그 베이로 들어가요. 웨이퍼가 지나가는 길은 ‘웨이퍼 경로 보기’로 확인하세요.</p>')
        + '<div class="fab-eqs" style="margin-top:.9rem">' + BAYS.map((b) => b.soon ? '<span class="fab-eq soon"><i>·</i>' + b.name + ' (준비 중)</span>' : '<button class="fab-eq" data-bay="' + b.id + '"><i>›</i>' + b.name + '</button>').join('') + '</div>'
        + '<p class="fab-tipline">ⓘ 실제 배치는 회사마다 달라요. 이 화면은 일반적인 구조를 단순하게 옮긴 거예요.</p>'
        + '<div class="fab-ctl"><button class="fab-btn main" data-act="walk">걸어서 둘러보기</button></div>';
    } else {
      h = '<div class="fab-sthead"><span class="no">STATION ' + (station + 1) + '</span><b>' + s.name + '</b><span class="tag">' + s.tag + '</span></div>';
      h += '<div class="fab-eqs">' + list.map((x) => '<button class="fab-eq' + (x.id === selId ? ' on' : '') + '" data-eq="' + x.id + '"><i>' + x.n + '</i>' + x.name + '</button>').join('') + '</div>';
      if (!d) {
        h += '<p class="fab-intro">' + s.intro + '</p><p class="fab-tipline">👆 화면의 번호 핀이나 장비를 눌러서 설명을 들어 보세요.</p>'
          + '<div class="fab-ctl"><button class="fab-btn main" data-act="first">첫 장비 보기</button><button class="fab-btn" data-act="learn">이 공정 이론 보기</button></div>';
      } else {
        h += '<h3 class="fab-name">' + d.name + '</h3><div class="fab-en">' + d.en + '</div><p class="fab-one">' + d.one + '</p>'
          + '<h4>하는 일</h4><p>' + d.what + '</p><h4>왜 중요해요?</h4><p>' + d.why + '</p>'
          + '<div class="fab-chips">' + d.pts.map((p) => '<span>' + p + '</span>').join('') + '</div>'
          + '<div class="fab-ctl"><button class="fab-btn main" data-act="next">다음 장비 →</button><button class="fab-btn" data-act="learn">관련 이론 보기</button>' + (d.lab ? '<button class="fab-btn main" data-act="lab">🧪 직접 체험해 보기</button>' : '') + '<button class="fab-btn ghost" data-act="back">구역 전체 보기</button></div>';
      }
    }
    if (infoEl) infoEl.innerHTML = h;
    Object.keys(items).forEach((id) => { const p = items[id].pin; if (p) p.classList.toggle('on', id === selId); });
    if (selRing) { const it = d && items[selId]; selRing.visible = !!(it && d.ring); if (selRing.visible) { selRing.scale.setScalar(d.ring); selRing.position.x = it.group.position.x; selRing.position.z = it.group.position.z; } }
  }

  function showPin(el, pos) {
    pos.project(camera);
    const x = (pos.x * .5 + .5) * W, y = (-pos.y * .5 + .5) * H, ok = pos.z < 1 && x > 16 && x < W - 16 && y > 16 && y < H - 52;
    el.style.display = ok ? '' : 'none';
    if (ok) el.style.transform = 'translate(' + (x - 14).toFixed(1) + 'px,' + (y - 14).toFixed(1) + 'px)';
  }
  function project() {
    Object.keys(items).forEach((id) => {
      const it = items[id], p = it.pin; if (!p) return;
      if (overview || it.def.st !== station) { p.style.display = 'none'; return; }
      showPin(p, it.pinPos());
    });
    routePins.forEach((r) => { if (overview && routeOn) showPin(r.el, r.pos.clone()); else r.el.style.display = 'none'; });
    bayPins.forEach((b) => {
      if (overview) { if (routeOn) b.el.style.display = 'none'; else showPin(b.el, b.map.clone()); }
      else if (station === 0 && b.door && b.near) showPin(b.el, b.door.clone());
      else b.el.style.display = 'none';
    });
  }

  function pick(cx, cy) {
    const r = wrap.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(pickRoots, true);
    for (const h of hits) { let o = h.object; while (o && !o.userData.itemId) o = o.parent; if (o) return o.userData.itemId; }
    return null;
  }

  /* ───────── 입력 ───────── */
  function openBay(id) { const i = STATIONS.findIndex((s) => s.id === id); if (i >= 0) goStation(i); }
  function bindInput() {
    let drag = null;
    wrap.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.fab-pin,.fab-nav,.fab-tools,button')) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
      try { wrap.setPointerCapture(e.pointerId); } catch (x) {}
      if (hintEl) hintEl.classList.add('off');
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) { drag.moved = true; if (!overview) { anim = null; heldOht = selId === 'oht'; } }
      if (!drag.moved || overview) return;
      const k = (baseFov * D2R) / Math.max(H, 1);
      cam.yaw += (e.clientX - drag.lx) * k;
      cam.pitch = Math.max(-0.6, Math.min(1.15, cam.pitch + (e.clientY - drag.ly) * k));
      drag.lx = e.clientX; drag.ly = e.clientY;
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const was = drag; drag = null; try { wrap.releasePointerCapture(e.pointerId); } catch (x) {}
      if (!was.moved && e.type === 'pointerup') { const id = pick(e.clientX, e.clientY); if (id) select(id); else if (selId) select(null); }
    };
    wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
    pinsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pin]'); if (b) { select(b.dataset.pin); return; }
      const y = e.target.closest('[data-bay]'); if (y && !y.classList.contains('soon')) openBay(y.dataset.bay);
    });
    toolsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tool]'); if (!b) return;
      if (b.dataset.tool === 'map') setOverview(!overview); else { routeOn = !routeOn; if (routeOn && !overview) setOverview(true); else update(); }
    });
    navEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-st]'); if (!b) return; const v = b.dataset.st;
      goStation(v === 'prev' ? station - 1 : v === 'next' ? station + 1 : +v);
    });
    infoEl.addEventListener('click', (e) => {
      const q = e.target.closest('[data-eq]'); if (q) { select(q.dataset.eq); return; }
      const y = e.target.closest('[data-bay]'); if (y) { openBay(y.dataset.bay); return; }
      const a = e.target.closest('[data-act]'); if (!a) return; const act = a.dataset.act;
      if (act === 'first') select(ITEMS.find((d) => d.st === station).id);
      else if (act === 'next') nextItem(1);
      else if (act === 'back') select(null);
      else if (act === 'walk') goStation(station);
      else if (act === 'lab' && window.labOpen) { const it = selId && items[selId]; window.labOpen((it && it.def.lab) || 'etch'); }
      else if (act === 'learn' && window.fabLearn) { const it = selId && items[selId]; window.fabLearn(CAT, (it && it.def.sub) || STATIONS[station].sub2); }
    });
    document.addEventListener('keydown', (e) => {
      if (!running || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
      if (e.key === 'ArrowRight' && !overview) goStation(station + 1); else if (e.key === 'ArrowLeft' && !overview) goStation(station - 1);
      else if (e.key === 'Escape') { if (overview) setOverview(false); else if (selId) select(null); }
    });
  }

  function resize() {
    if (!wrap) return;
    const r = wrap.getBoundingClientRect(); if (r.width < 10 || r.height < 10) return;
    W = r.width; H = r.height; baseFov = W / H < 1.15 ? 70 : 56; camBack = W / H < 1.15 ? 2.6 : 0;
    if (gl) { renderer.setPixelRatio(pr || Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(W, H, false); camera.aspect = W / H; camera.fov = baseFov; camera.updateProjectionMatrix(); }
    if (inited && !anim) { if (overview) Object.assign(cam, overviewPose()); else if (!selId) Object.assign(cam, stationPose(station)); }
  }

  function init() {
    wrap = $('fabWrap'); canvas = $('fabCanvas'); pinsEl = $('fabPins'); infoEl = $('fabInfo'); navEl = $('fabNav'); hudEl = $('fabHud'); hintEl = $('fabHint'); loadEl = $('fabLoading'); toolsEl = $('fabTools'); legendEl = $('fabLegend');
    if (!wrap || !infoEl) return false;
    navEl.innerHTML = '<button data-st="prev" aria-label="이전 구역">‹</button>' + STATIONS.map((s, i) => '<button data-st="' + i + '" aria-label="' + s.name + '"><i>' + (i + 1) + '</i><span>' + s.short + '</span></button>').join('') + '<button data-st="next" aria-label="다음 구역">›</button>';
    toolsEl.innerHTML = '<button data-tool="map">🗺 구조 보기</button><button data-tool="route">웨이퍼 경로 보기</button>';
    legendEl.innerHTML = '<span><i style="background:#06b6d4"></i>1번째 층 ①→⑤</span><span><i style="background:#ec4899"></i>2번째 층(다시 ②부터)</span>'; legendEl.style.display = 'none';
    pinsEl.innerHTML = ITEMS.map((d) => '<button class="fab-pin" data-pin="' + d.id + '" aria-label="' + d.name + '"><i>' + d.n + '</i><span>' + d.name + '</span></button>').join('')
      + BAYS.map((b) => '<button class="fab-pin bay' + (b.soon ? ' soon' : '') + '" data-bay="' + b.id + '" aria-label="' + b.name + '"><i>›</i><span>' + b.name + (b.soon ? ' · 준비 중' : '') + '</span></button>').join('')
      + '<button class="fab-pin bay" data-bay="intake" aria-label="입고 · 반송"><i>›</i><span>입고 · 반송</span></button>'
      + ROUTE_STOPS.map((r) => '<span class="fab-pin rt" data-rt="' + r.n + '"><i>' + r.n + '</i><span>' + r.name + '</span></span>').join('');
    try {
      renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      gl = true;
    } catch (e) { gl = false; }
    if (gl) {
      build();
      ITEMS.forEach((d) => { items[d.id].pin = pinsEl.querySelector('[data-pin="' + d.id + '"]'); });
      BAYS.forEach((b) => bayPins.push({ id: b.id, el: pinsEl.querySelector('[data-bay="' + b.id + '"]'), door: new T.Vector3(b.side * (SPINE - .2), 3.9, b.z), near: b.z >= -22, map: new T.Vector3(b.side * (SPINE + 15), .5, b.z) }));
      ROUTE_STOPS.forEach((r) => routePins.push({ el: pinsEl.querySelector('[data-rt="' + r.n + '"]'), pos: new T.Vector3(r.p[0], .6, r.p[1]) }));
      bayPins.push({ id: 'intake', el: pinsEl.querySelector('[data-bay="intake"]'), door: null, map: new T.Vector3(0, .5, 5) });
      new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap);
      window.addEventListener('resize', resize);
      document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); else if (running) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } });
    } else {
      canvas.style.display = 'none'; pinsEl.style.display = 'none'; toolsEl.style.display = 'none';
      wrap.insertAdjacentHTML('beforeend', '<div class="fab-nogl">이 기기에서는 3D 화면을 띄울 수 없어요.<br>아래 장비 목록으로 설명은 볼 수 있어요.</div>');
    }
    bindInput(); inited = true; return true;
  }

  function updateLights(hi) {
    const A = lights.pts[0], B = lights.pts[1];
    if (hi) { A.intensity = B.intensity = 0; return; }
    const fx = cam.x - Math.sin(cam.yaw) * 8, fz = cam.z - Math.cos(cam.yaw) * 8; let best = lights.slp[0], bd = 1e9;
    lights.slp.forEach((p) => { const d = (p.x - fx) * (p.x - fx) + (p.z - fz) * (p.z - fz); if (d < bd) { bd = d; best = p; } });
    A.position.x += (fx - A.position.x) * .2; A.position.z += (fz - A.position.z) * .2; A.color.lerp(best.c, .08); A.intensity = lightBase;
    B.position.set(cam.x, 3.4, cam.z); B.intensity = lightBase * .55;
  }
  // 프레임이 늦어지면 해상도를 한 단계씩 낮춰서 렉을 줄인다
  let lastMs = 0, emaDt = 16, qCount = 0, pr = 0;
  function adaptQuality(ms) {
    const dt = ms - lastMs; lastMs = ms; if (dt <= 0 || dt > 120) return;
    emaDt = emaDt * .92 + dt * .08;
    if (++qCount < 45) return; qCount = 0;
    if (!pr) pr = Math.min(window.devicePixelRatio || 1, 2);
    if (emaDt > 26 && pr > 0.9) { pr = Math.max(0.9, pr - 0.25); renderer.setPixelRatio(pr); renderer.setSize(W, H, false); }
  }
  function frame(ms) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const t = ms / 1000;
    stepAnim(performance.now());
    ticks.forEach((f) => f(t));
    const hi = cam.y > 5.8; ceilG.visible = !hi; updateWallFade(!!(anim && anim.hide)); scene.fog.near = hi ? 500 : 16; scene.fog.far = hi ? 900 : 66;
    const far = hi ? 260 : 76; if (camera.far !== far) { camera.far = far; camera.updateProjectionMatrix(); }   // 안개에 완전히 묻히는 먼 물체는 아예 그리지 않는다
    updateLights(hi);
    adaptQuality(ms);
    camera.position.set(cam.x, cam.y, cam.z); camera.rotation.set(cam.pitch, cam.yaw, 0, 'YXZ');
    camera.updateMatrixWorld();
    project();
    renderer.render(scene, camera);
  }

  window.FAB = {
    start() {
      if (!inited && !init()) return;
      if (loadEl) loadEl.style.display = 'none';
      running = true; resize();
      if (!firstTouch) { firstTouch = true; goStation(0, true); } else update();
      if (gl) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
    },
    stop() { running = false; cancelAnimationFrame(raf); },
  };
})();
