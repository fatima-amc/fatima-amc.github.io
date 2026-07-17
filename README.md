# 최신 수의학 논문 (병원 내부용)

PubMed에서 최신 논문을 자동 수집하고, 병원 내부 직원만 **구글 계정으로 로그인**해서
논문에 리뷰/의견을 남기고, CRI(지속정맥주입) 계산기도 함께 쓸 수 있는 내부 사이트.

## 구조

```
.
├── index.html                      # 로그인 + 논문목록/리뷰 + CRI 계산기 + 건강검진 도구 + 직원 관리 화면
├── firebase-config.js              # Firebase 프로젝트 설정값 + 관리자 이메일 (직접 채워야 함)
├── cri-calculator.js               # CRI 계산 로직 + 약물 목록 설정
├── firestore.rules                 # Firestore 보안 규칙(허용된 이메일만 접근 가능)
├── tools/
│   └── checkup.html                # 건강검진 결과지 작성 도구 (통째로 Firestore에 동기화됨)
├── scripts/
│   ├── fetch_papers.py             # PubMed 자동 수집 → Firestore 저장
│   ├── add_existing_papers.py      # 기존 논문을 PMID로 일괄 추가
│   ├── upload_tool_html.py         # tools/*.html → Firestore 동기화
│   └── requirements.txt
└── .github/workflows/
    ├── update-papers.yml           # 매일 자동 수집
    ├── add-papers.yml              # 기존 논문 추가용 수동 실행
    └── sync-tools.yml              # tools/*.html 변경 시 자동 동기화
```

## 접근 제어 방식

- 로그인 자체는 **구글 계정**으로 합니다 (아무 구글 계정이나 로그인 시도는 가능).
- 하지만 실제로 논문/리뷰 데이터를 볼 수 있는 건 **미리 등록된 이메일**만입니다.
  등록 안 된 이메일로 로그인하면 "접근 권한이 없습니다" 화면만 보입니다.
- 이메일을 등록/삭제할 수 있는 사람은 **관리자(원장님)** 뿐입니다. 로그인 후
  "직원 관리" 탭에서 이메일을 추가하거나 삭제하면 바로 반영됩니다.

## 처음 설정하는 순서

### 1. Firebase 프로젝트 만들기
1. https://console.firebase.google.com 접속 → "프로젝트 추가"
2. 프로젝트 이름 입력 (예: `wecare-vet-internal`) 후 생성

### 2. 구글 로그인 설정
1. 왼쪽 메뉴 Authentication → "시작하기"
2. 로그인 방법에서 **Google** 활성화 (프로젝트 지원 이메일만 지정하면 됨)
3. Authentication → Settings → **승인된 도메인(Authorized domains)** →
   실제 사이트 도메인 추가 (예: `wecarevet.github.io`)
   - 이걸 빼먹으면 구글 로그인 팝업에서 오류가 납니다.

### 3. 데이터베이스(Firestore) 설정
1. 왼쪽 메뉴 Firestore Database → "데이터베이스 만들기" (프로덕션 모드)
2. 이 저장소의 `firestore.rules` 내용을 Firestore → 규칙(Rules) 탭에 붙여넣고 게시
3. **`firestore.rules` 안의 `isAdmin()` 함수에 원장님 본인의 구글 이메일을 적어주세요.**
   ```
   function isAdmin() {
     return request.auth != null &&
       request.auth.token.email in [
         '실제원장님이메일@gmail.com'
       ];
   }
   ```

### 4. 웹앱 등록 & 설정값 복사
1. 프로젝트 설정(톱니바퀴) → "내 앱" → 웹 아이콘(</>) 클릭 → 앱 등록
2. 표시되는 `firebaseConfig` 값을 `firebase-config.js`의 `firebaseConfig`에 붙여넣기
3. `firebase-config.js`의 `ADMIN_EMAILS` 배열에도 **3번에서 적은 것과 똑같은 이메일**을 적기
   (두 파일에 같은 이메일이 들어가야 관리자 탭이 정상적으로 보이고 동작합니다)

### 5. 서비스 계정 키 (GitHub Actions용)
1. 프로젝트 설정 → 서비스 계정 → "새 비공개 키 생성" → JSON 다운로드
2. GitHub 저장소 → Settings → Secrets and variables → Actions →
   "New repository secret"
   - 이름: `FIREBASE_SERVICE_ACCOUNT`
   - 값: 방금 받은 JSON 파일 내용 전체를 그대로 붙여넣기

### 6. GitHub Pages 배포
1. 이 폴더 전체를 GitHub 저장소(예: `wecarevet.github.io`)에 push
2. Settings → Pages → Source를 `main` 브랜치 root로 설정

## 사용 방법

### 직원 등록하기
1. 관리자(원장님) 계정으로 사이트에 로그인
2. "직원 관리" 탭 → 직원 구글 이메일 입력 후 "추가"
3. 그 이메일로 로그인한 사람은 바로 접속 가능
4. 직원이 그만두면 같은 탭에서 "삭제"

### 논문에 리뷰 남기기
각 논문 카드의 "리뷰 보기 / 남기기" 버튼을 누르면 기존 리뷰들이 보이고,
이름과 의견을 입력해 새 리뷰를 남길 수 있습니다. 실시간으로 동기화되어
동료가 남긴 리뷰도 바로 보입니다.

### 최신 논문 자동 수집
`.github/workflows/update-papers.yml`이 매일 한국시간 06시에 자동 실행됩니다.
지금 바로 받고 싶으면 GitHub Actions 탭 → "Update veterinary papers" →
"Run workflow".

### 기존에 있던 논문 추가하기 (PMID로)
1. GitHub 저장소 → Actions 탭 → "Add existing papers by PMID" → "Run workflow"
2. `pmids` 칸에 PMID를 쉼표/공백/줄바꿈으로 구분해서 붙여넣기
   (예: `12345678, 23456789, 34567890`)
3. `category` 칸에 분과명 입력 (예: `영상진단`, `외과`, `내과` 등 — 자유롭게 새 분과명을 써도 됨)
4. 실행하면 몇 분 내로 사이트에 반영됩니다.

PMID는 https://pubmed.ncbi.nlm.nih.gov/ 에서 논문 검색 후 상세 페이지에
표시되는 번호입니다.

### CRI 계산기 수정/추가
`cri-calculator.js`의 `DRUG_GROUPS` 배열에 약물을 추가/수정하면 됩니다.
계산 방식(`type`)은 4가지 중 하나를 고르면 됩니다:
- `perMin_mg`: μg/kg/min 용량 + mg/ml 농도 (대부분의 심혈관계 약물)
- `perHr_mg`: mg/kg/hr 용량 + mg/ml 농도 (이뇨제, 진정제 등)
- `perMin_units`: mU/kg/min 용량 + IU/ml 농도 (Vasopressin 전용)
- `targetConc`: 체중과 무관하게 수액 내 목표 농도를 맞추는 방식 (KCl 전용)
- `bicarbonate`: Base Excess 기반 보정량 계산 (NaHCO3 전용)

Loading dose가 있는 약물은 `loading: { low, high, unit: 'mg/kg' }`를 추가하면
자동으로 계산되어 표시됩니다.

### 건강검진 도구 (checkup.html) 업데이트하기
"건강검진" 탭은 `tools/checkup.html` 파일 내용을 통째로 Firestore에 저장해뒀다가,
로그인한 직원에게만 iframe으로 보여주는 방식입니다 (그 안의 입력 내용은 그 사람
브라우저 안에서만 유지되고 서버에 저장되지 않습니다 — 인쇄/PDF 저장은 각자 컴퓨터에서).

도구 자체를 수정하고 싶으면:
1. `tools/checkup.html` 파일을 새 버전으로 교체
2. 저장소에 push (또는 Actions 탭 → "Sync internal tools to Firestore" → Run workflow)
3. 몇 초 내로 사이트의 "건강검진" 탭에 새 버전이 반영됩니다 (직원들은 새로고침하면 최신 버전을 봄)

같은 방식으로 `tools/` 폴더에 html 파일을 더 추가하면 자동으로 Firestore에
동기화되지만, 화면에 새 탭으로 보이게 하려면 `index.html`에 탭 버튼과
로딩 로직을 추가로 연결해줘야 합니다.

## 카카오톡 링크로 열었을 때 로그인이 안 되는 경우

구글은 보안 정책상 카카오톡, 인스타그램 등 **앱 안에 내장된 브라우저**에서는
구글 로그인을 막아버립니다("이 브라우저 또는 앱은 안전하지 않을 수 있습니다" 오류).
이 경우 화면 안내대로 우측 상단 메뉴에서 "다른 브라우저로 열기"(Safari/Chrome 등)를
선택한 뒤 다시 시도하면 됩니다. 이건 우리 사이트의 문제가 아니라 구글의 정책이라
고칠 수 있는 부분이 아니에요 — 직원들에게 미리 안내해두시면 좋습니다.

## 로컬 테스트

Firebase 콘솔에서 값 설정 후, 아무 정적 서버로 열어보면 됩니다:

```bash
python3 -m http.server 8000
# http://localhost:8000 접속 (localhost는 Firebase가 기본으로 승인된 도메인에 포함)
```

```bash
# 자동 수집 스크립트만 따로 테스트하고 싶을 때
pip install -r scripts/requirements.txt
GOOGLE_APPLICATION_CREDENTIALS_JSON="$(cat serviceAccount.json)" python3 scripts/fetch_papers.py
```

## 보안 관련 참고

- 사이트의 HTML/JS 코드 자체는 GitHub Pages 특성상 완전히 비공개로 만들 수 없습니다
  (URL만 알면 코드는 누구나 볼 수 있음). 다만 실제 논문 데이터와 리뷰는 Firestore에
  있고, `firestore.rules`에 의해 **등록된 이메일로 로그인한 사람만** 읽고 쓸 수 있습니다.
- 비밀번호 방식과 달리, 링크나 비밀번호가 잘못 유출되어도 구글 계정 자체를 훔치지
  않는 한 접속할 수 없습니다.
- `isAdmin()`에 들어가는 이메일은 `firestore.rules`와 `firebase-config.js` 두 곳에
  똑같이 있어야 합니다. 관리자를 추가/변경할 때는 두 파일을 함께 고치고, Firestore
  규칙은 콘솔에서 다시 게시해야 적용됩니다.
