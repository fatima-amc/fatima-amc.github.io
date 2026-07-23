#!/usr/bin/env python3
"""
PubMed(NCBI E-utilities)에서 최신 수의학 논문을 수집해 Firestore(papers 컬렉션)에 저장한다.

[이 버전에서 바뀐 점 — 왜 예전에는 0건이었는가]
예전 버전은 MeSH Terms(사서가 논문에 나중에 붙이는 주제 색인)로만 검색했다. 그런데
  1) MeSH 색인은 출판 후 몇 주~몇 달 뒤에 붙는다. 그래서 "최근 30일 논문"과
     "MeSH가 달린 논문"은 사실상 겹치지 않아 항상 0건이 나왔다.
  2) 'veterinary internal medicine'[MeSH Terms] 처럼 실재하지 않는 MeSH 용어를 썼다.
     (실제 MeSH는 Dogs, Cats 처럼 복수형이고, '수의영상의학' 같은 MeSH는 없다.)
이 버전은 MeSH를 버리고 제목/초록의 실제 단어([Title/Abstract])로 검색하므로,
출판 직후 논문도 바로 잡힌다.

필요한 환경변수:
  GOOGLE_APPLICATION_CREDENTIALS_JSON : Firebase 서비스 계정 키(JSON) 전체 내용
선택 환경변수:
  RECENT_DAYS       : 최근 며칠 이내 논문을 볼지 (기본 60)
  PER_CATEGORY_LIMIT: 분과당 최대 몇 편 (기본 15)
"""

import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, firestore

# ---------------------------------------------------------------------------
# 설정
# ---------------------------------------------------------------------------

# 개/고양이 논문만 걸러내는 공통 조건. 제목이나 초록에 이 단어들이 있어야 한다.
SPECIES = (
    "("
    "dog[Title/Abstract] OR dogs[Title/Abstract] OR canine[Title/Abstract] "
    "OR canines[Title/Abstract] "
    "OR cat[Title/Abstract] OR cats[Title/Abstract] OR feline[Title/Abstract] "
    'OR felines[Title/Abstract] OR "small animal"[Title/Abstract]'
    ")"
)

# 분과별 주제어. 필요하면 이 목록만 고치면 된다.
# (단어를 추가할수록 더 많이 잡히고, 줄일수록 정확해진다.)
TOPICS = {
    "영상진단": [
        "ultrasound", "ultrasonography", "ultrasonographic", "sonographic",
        "radiograph", "radiography", "radiographic",
        "computed tomography", "magnetic resonance", "MRI",
        "fluoroscopy", "elastography", "diagnostic imaging",
    ],
    "외과": [
        "surgery", "surgical", "postoperative", "perioperative",
        "laparoscopic", "arthroscopy", "osteotomy", "anastomosis",
        "orthopedic", "orthopaedic", "reconstruction",
    ],
    "내과": [
        "gastrointestinal", "enteropathy", "pancreatitis", "hepatic",
        "renal", "kidney disease", "endocrine", "hyperadrenocorticism",
        "hypothyroidism", "diabetes mellitus", "immune-mediated",
        "inflammatory bowel",
    ],
    "심장": [
        "cardiac", "cardiology", "myxomatous mitral valve", "mitral",
        "cardiomyopathy", "heart failure", "arrhythmia", "echocardiography",
        "echocardiographic", "pulmonary hypertension", "pimobendan",
    ],
    "종양": [
        "tumor", "tumour", "neoplasia", "neoplasm", "carcinoma", "sarcoma",
        "lymphoma", "mast cell tumor", "chemotherapy", "oncology", "metastasis",
    ],
    "신경": [
        "neurologic", "neurological", "seizure", "epilepsy",
        "intervertebral disc", "myelopathy", "spinal cord", "encephalitis",
        "vestibular", "neuropathy",
    ],
    "응급/중환자": [
        "emergency", "critical care", "sepsis", "shock", "resuscitation",
        "trauma", "transfusion", "coagulopathy", "intensive care",
    ],
    "피부": [
        "dermatitis", "dermatology", "atopic", "pruritus", "alopecia",
        "pyoderma", "otitis externa",
    ],
    "안과": [
        "ophthalmic", "ophthalmology", "corneal", "cornea", "glaucoma",
        "cataract", "uveitis", "retinal", "keratoconjunctivitis",
    ],
}

RECENT_DAYS = int(os.environ.get("RECENT_DAYS", "60"))
PER_CATEGORY_LIMIT = int(os.environ.get("PER_CATEGORY_LIMIT", "15"))
NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
REQUEST_DELAY_SEC = 0.4
TOOL_NAME = "FatimaClinicalHub"
CONTACT_EMAIL = os.environ.get("NCBI_CONTACT", "")


def build_term(topics: list[str]) -> str:
    """분과 주제어들을 PubMed 검색식으로 조립한다."""
    parts = []
    for t in topics:
        # 공백이 있는 구(句)는 따옴표로 묶어야 정확히 매칭된다.
        term = f'"{t}"' if " " in t else t
        parts.append(f"{term}[Title/Abstract]")
    return f"({' OR '.join(parts)}) AND {SPECIES}"


def init_firestore():
    cred_json = os.environ["GOOGLE_APPLICATION_CREDENTIALS_JSON"]
    cred = credentials.Certificate(json.loads(cred_json))
    firebase_admin.initialize_app(cred)
    return firestore.client()


def _get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": f"{TOOL_NAME}/2.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def esearch(term: str, reldate: int) -> tuple[list, list]:
    """검색 실행. (PMID 목록, 경고메시지 목록)을 돌려준다."""
    params = {
        "db": "pubmed",
        "term": term,
        "retmax": str(PER_CATEGORY_LIMIT),
        "retmode": "json",
        "sort": "date",
        "reldate": str(reldate),
        "datetype": "edat",  # PubMed 등재일 기준(출판일보다 최신 논문을 잘 잡는다)
        "tool": TOOL_NAME,
    }
    if CONTACT_EMAIL:
        params["email"] = CONTACT_EMAIL
    url = f"{NCBI_BASE}/esearch.fcgi?{urllib.parse.urlencode(params)}"
    payload = _get_json(url)
    result = payload.get("esearchresult", {})
    warnings = []
    warn = result.get("warninglist", {})
    for key in ("phrasesnotfound", "quotedphrasesnotfound", "outputmessages"):
        for item in warn.get(key, []):
            warnings.append(f"{key}: {item}")
    return result.get("idlist", []), warnings


def esummary(pmids: list) -> dict:
    if not pmids:
        return {}
    params = {
        "db": "pubmed",
        "id": ",".join(pmids),
        "retmode": "json",
        "tool": TOOL_NAME,
    }
    if CONTACT_EMAIL:
        params["email"] = CONTACT_EMAIL
    url = f"{NCBI_BASE}/esummary.fcgi?{urllib.parse.urlencode(params)}"
    payload = _get_json(url)
    return payload.get("result", {})


def build_entry(pmid: str, summary: dict, category: str, source: str = "auto") -> dict:
    authors = [a.get("name", "") for a in summary.get("authors", [])][:6]
    return {
        "pmid": pmid,
        "title": summary.get("title", "").rstrip("."),
        "authors": authors,
        "journal": summary.get("fulljournalname") or summary.get("source", ""),
        "pubdate": summary.get("pubdate", ""),
        "category": category,
        "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        "source": source,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def main() -> None:
    db = init_firestore()
    papers_ref = db.collection("papers")

    print(f"설정: 최근 {RECENT_DAYS}일 · 분과당 최대 {PER_CATEGORY_LIMIT}편")
    print(f"분과 {len(TOPICS)}개: {', '.join(TOPICS)}\n")

    total_saved = 0
    empty_categories = []

    for category, topics in TOPICS.items():
        term = build_term(topics)
        try:
            pmids, warnings = esearch(term, RECENT_DAYS)
            time.sleep(REQUEST_DELAY_SEC)

            # 최근 기간에 결과가 없으면 기간을 넓혀 한 번 더 시도한다.
            if not pmids:
                wider = RECENT_DAYS * 3
                print(f"[{category}] 최근 {RECENT_DAYS}일 0건 → {wider}일로 확대 재시도")
                pmids, warnings = esearch(term, wider)
                time.sleep(REQUEST_DELAY_SEC)

            summaries = esummary(pmids)
            time.sleep(REQUEST_DELAY_SEC)
        except Exception as exc:  # noqa: BLE001
            print(f"[경고] '{category}' 수집 실패: {exc}")
            continue

        for w in warnings:
            print(f"  [PubMed 경고] {category}: {w}")

        if not pmids:
            empty_categories.append(category)
            print(f"[{category}] 검색 결과 0건")
            continue

        saved = 0
        for pmid in pmids:
            summary = summaries.get(pmid)
            if not summary:
                continue
            entry = build_entry(pmid, summary, category)
            if not entry["title"]:
                continue
            papers_ref.document(pmid).set(entry, merge=True)
            print(f"  저장: {pmid} - {entry['title'][:60]}")
            saved += 1

        total_saved += saved
        print(f"[{category}] {saved}편 저장\n")

    print("=" * 60)
    print(f"완료: 총 {total_saved}편 저장")
    if empty_categories:
        print(f"결과 없던 분과: {', '.join(empty_categories)}")
    if total_saved == 0:
        print("한 편도 저장되지 않았습니다. RECENT_DAYS를 늘리거나 TOPICS 주제어를 확인하세요.")


if __name__ == "__main__":
    main()
