// Firebase 콘솔 > 프로젝트 설정 > "내 앱" 에서 복사한 값을 그대로 붙여넣으세요.
// 이 값들은 공개되어도 괜찮은 값입니다(브라우저에 항상 노출되는 값).
// 실제 보안은 firestore.rules 와 구글 로그인 + 이메일 허용목록이 담당합니다.
export const firebaseConfig = {
  apiKey: "AIzaSyBS5-D13IsMrimzaZncFcMMSUbGFVg5pRQ",
  authDomain: "fatima-amc.firebaseapp.com",
  projectId: "fatima-amc",
  storageBucket: "fatima-amc.firebasestorage.app",
  messagingSenderId: "169810110394",
  appId: "1:169810110394:web:ca7ea7c88290ec9b9f5f83",
  measurementId: "G-ZD2FF5B76M"
};

// 관리자(직원 이메일을 추가/삭제할 수 있는 사람) 구글 이메일 목록.
// 여기 적힌 이메일로 로그인한 사람만 "직원 관리" 탭이 보이고 사용할 수 있습니다.
//
// 주의: 이 배열은 화면에 "관리 탭을 보여줄지" 판단하는 용도일 뿐입니다.
// 실제 쓰기 권한은 firestore.rules 안에도 똑같은 이메일을 넣어야 진짜로 보호됩니다.
// (firestore.rules 의 isAdmin() 함수 참고 — 두 곳을 항상 같이 수정하세요.)
export const ADMIN_EMAILS = ["changhee2505@gmail.com"];
