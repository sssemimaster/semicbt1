// 나이스페이먼츠 클라이언트 키(Client ID). 화면(브라우저)에 노출돼도 되는 '공개용' 값입니다.
//  - 나이스페이 가맹점관리자 → 개발정보 의 "클라이언트 키" (운영 키).
//  - 시크릿 키는 절대 여기에 넣지 마세요. 서버(semicbt-api)의 GitHub Secret NICEPAY_SECRET_KEY 로만 등록하고,
//    클라이언트 키도 NICEPAY_CLIENT_ID 로 함께 등록해야 합니다 — 두 곳의 값이 같아야 합니다.
//  - 비워 두면 결제 화면은 "준비 중"으로 표시되고 결제 버튼이 동작하지 않습니다.
window.NICEPAY_CLIENT_ID = 'R2_bb0fbcbca69e4d078d4ee983c236a52b';
