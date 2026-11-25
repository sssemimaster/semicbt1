// 나이스페이먼츠 클라이언트 키(Client ID). 화면(브라우저)에 노출돼도 되는 '공개용' 값입니다.
//  - 나이스페이 가맹점관리자 → 개발정보 의 "클라이언트 키". 샌드박스(테스트 상점) 키와 운영 키는 서로 다르고, 모양(32자리 영숫자)은 같습니다.
//  - 시크릿 키는 절대 여기에 넣지 마세요. (서버 GitHub Secret NICEPAY_SECRET_KEY 로만 등록, 클라이언트 키는 NICEPAY_CLIENT_ID 로도 함께 등록해야 합니다 — 두 곳의 값이 같아야 합니다)
//  - 비워 두면 결제 화면은 "준비 중"으로 표시되고 결제 버튼이 동작하지 않습니다.
window.NICEPAY_CLIENT_ID = 'R2_bb0fbcbca69e4d078d4ee983c236a52b';
// 테스트(샌드박스) 키로 시험하는 동안만 true. 화면에 "테스트 결제 모드" 안내를 보여 줍니다.
// ⚠ 운영(실결제) 키로 바꿀 때는 반드시 false 로 되돌리세요(서버 Secret NICEPAY_API_BASE 도 비우기).
window.NICEPAY_TEST = true;
