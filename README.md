# 반도체 새김 (semicbt)

반도체 직무 준비용 학습 사이트 — 이론 백과사전, 문제 풀이(CBT), 모의고사, 면접 대비, 오답 노트, 직무 지도.
사이트: https://semicarve.com

## 구성
- `index.html`, `src/`, `sw.js` — 사이트 본체 (정적 페이지, GitHub Pages 배포)
- `data/` — 이론·문제·면접·직무 데이터 (AI가 생성하고 검수소에서 사람이 검수한 뒤 등재)
- `theory/` — 이론별 고유 주소 페이지 (`scripts/build_pages.py` 가 자동 생성)
- `.github/workflows/` — 콘텐츠 자동 생성·검수·페이지 빌드 (API 키는 GitHub Secrets 로만 사용)
- `firebase/` — Firestore 보안 규칙 (구글 로그인 사용자의 학습 기록 동기화)
- `admin.html` — 검수소·제보함 (관리자 전용)

## 콘텐츠와 라이선스
- 문제와 이론은 AI로 생성한 뒤 검수해 게시합니다. 오류는 사이트의 🚨 제보 또는 이슈로 알려 주세요.
- 별도의 라이선스를 지정하기 전까지 코드와 콘텐츠의 모든 권리는 저작자에게 있습니다. 무단 복제·재배포를 허용하지 않습니다.

## 개인정보
[개인정보 처리방침](https://semicarve.com/privacy.html)
