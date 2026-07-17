#!/usr/bin/env python3
"""
PubMed(NCBI E-utilities)에서 최신 수의학 논문을 수집해 Firestore에 저장한다.

기존 버전과의 차이:
- 예전에는 data/papers.json 파일에 저장했지만, 이제는 로그인/댓글 기능을 위해
  Firestore(papers 컬렉션)에 직접 저장한다.
- 문서 ID = PMID 로 저장하므로 같은 논문이 중복 저장되지 않는다.
- 기존에 저장된 논문의 필드는 건드리지 않고(merge=True), 새 필드만 채운다.
  -> 나중에 누군가 Firestore에서 카테고리를 수동으로 고쳐도 자동 수집이 덮어쓰지 않는다.

필요한 환경변수:
  GOOGLE_APPLICATION_CREDENTIALS_JSON : Firebase 서비스 계정 키(JSON) 전체 내용을 문자열로

사용 라이브러리: firebase-admin (requirements.txt 참고)
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
# 설정: 필요에 따라 자유롭게 수정
# ---------------------------------------------------------------------------

CATEGORIES = {
    "영상진단": (
        '("veterinary radiology"[MeSH Terms] OR "diagnostic imaging"[MeSH Terms]) '
        'AND ("dog"[MeSH Terms] OR "cat"[MeSH Terms])'
    ),
    "외과": (
        '"veterinary surgical procedures"[MeSH Terms] '
        'AND ("dog"[MeSH Terms] OR "cat"[MeSH Terms])'
    ),
    "내과": (
        '"veterinary internal medicine"[MeSH Terms] '
        'AND ("dog"[MeSH Terms] OR "cat"[MeSH Terms])'
    ),
}

RECENT_DAYS = 30
PER_CATEGORY_LIMIT = 15
NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
REQUEST_DELAY_SEC = 0.4


def init_firestore():
    cred_json = os.environ["GOOGLE_APPLICATION_CREDENTIALS_JSON"]
    cred = credentials.Certificate(json.loads(cred_json))
    firebase_admin.initialize_app(cred)
    return firestore.client()


def esearch(term: str) -> list[str]:
    params = {
        "db": "pubmed",
        "term": term,
        "retmax": str(PER_CATEGORY_LIMIT),
        "retmode": "json",
        "sort": "date",
        "reldate": str(RECENT_DAYS),
        "datetype": "pdat",
    }
    url = f"{NCBI_BASE}/esearch.fcgi?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=30) as resp:
        payload = json.load(resp)
    return payload.get("esearchresult", {}).get("idlist", [])


def esummary(pmids: list[str]) -> dict:
    if not pmids:
        return {}
    params = {"db": "pubmed", "id": ",".join(pmids), "retmode": "json"}
    url = f"{NCBI_BASE}/esummary.fcgi?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=30) as resp:
        payload = json.load(resp)
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

    for category, term in CATEGORIES.items():
        try:
            pmids = esearch(term)
            time.sleep(REQUEST_DELAY_SEC)
            summaries = esummary(pmids)
            time.sleep(REQUEST_DELAY_SEC)
        except Exception as exc:  # noqa: BLE001
            print(f"[경고] '{category}' 수집 실패: {exc}")
            continue

        for pmid in pmids:
            summary = summaries.get(pmid)
            if not summary:
                continue
            entry = build_entry(pmid, summary, category)
            papers_ref.document(pmid).set(entry, merge=True)
            print(f"저장: {pmid} - {entry['title'][:40]}")


if __name__ == "__main__":
    main()
