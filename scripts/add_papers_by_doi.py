#!/usr/bin/env python3
"""
DOI 목록으로 논문을 CrossRef에서 가져와 "스터디" 탭(study_papers 컬렉션)에 추가한다.
PubMed에 색인되지 않아 PMID가 없는 논문을 넣을 때 사용한다.

사용법 (로컬):
  DOIS="10.1111/jvim.16644, 10.2460/javma.21.03.0123" CATEGORY="영상진단" \
  GOOGLE_APPLICATION_CREDENTIALS_JSON="$(cat serviceAccount.json)" \
  python3 scripts/add_papers_by_doi.py

GitHub Actions에서는 "Add papers by DOI" 워크플로우(add-papers-doi.yml)를 Actions 탭에서
수동 실행(Run workflow)하면서 dois / category 입력칸에 값을 넣으면 된다.
쉼표, 공백, 줄바꿈 어떤 걸로 구분해도 인식한다. DOI 앞에 https://doi.org/ 가 붙어 있어도 된다.
"""

import json
import os
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, firestore

CROSSREF_BASE = "https://api.crossref.org/works"
REQUEST_DELAY_SEC = 0.5
# CrossRef는 연락용 이메일을 쿼리에 넣으면 더 안정적인 응답을 준다(polite pool).
CONTACT_EMAIL = os.environ.get("CROSSREF_CONTACT", "vet-archive@example.com")


def parse_dois(raw: str) -> list[str]:
    tokens = re.split(r"[,\s]+", raw.strip())
    dois = []
    for t in tokens:
        if not t:
            continue
        # https://doi.org/10.xxxx 형태에서 DOI 부분만 추출
        t = re.sub(r"^https?://(dx\.)?doi\.org/", "", t, flags=re.IGNORECASE)
        dois.append(t)
    return dois


def init_firestore():
    cred_json = os.environ["GOOGLE_APPLICATION_CREDENTIALS_JSON"]
    cred = credentials.Certificate(json.loads(cred_json))
    firebase_admin.initialize_app(cred)
    return firestore.client()


def fetch_crossref(doi: str) -> dict | None:
    url = f"{CROSSREF_BASE}/{urllib.parse.quote(doi)}?mailto={urllib.parse.quote(CONTACT_EMAIL)}"
    req = urllib.request.Request(url, headers={"User-Agent": f"FatimaClinicalHub/1.0 (mailto:{CONTACT_EMAIL})"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.load(resp)
        return payload.get("message")
    except Exception as exc:  # noqa: BLE001
        print(f"[경고] CrossRef 조회 실패 {doi}: {exc}")
        return None


def build_entry(doi: str, msg: dict, category: str) -> dict:
    # 저자: "Given Family" 형태로 최대 6명
    authors = []
    for a in msg.get("author", [])[:6]:
        name = " ".join(x for x in [a.get("given"), a.get("family")] if x)
        if name:
            authors.append(name)

    # 제목
    title_list = msg.get("title") or []
    title = (title_list[0] if title_list else "").strip()

    # 저널명
    container = msg.get("container-title") or []
    journal = container[0] if container else msg.get("publisher", "")

    # 출판일: published-print / published-online / issued 순으로 시도
    def get_date(parts_key):
        parts = msg.get(parts_key, {}).get("date-parts", [[]])
        return parts[0] if parts and parts[0] else []

    date_parts = get_date("published-print") or get_date("published-online") or get_date("issued")
    months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    if date_parts:
        y = date_parts[0]
        m = months[date_parts[1]] if len(date_parts) > 1 and 1 <= date_parts[1] <= 12 else ""
        d = str(date_parts[2]) if len(date_parts) > 2 else ""
        pubdate = " ".join(x for x in [str(y), m, d] if x)
    else:
        pubdate = ""

    url = msg.get("URL") or f"https://doi.org/{doi}"

    return {
        "doi": doi,
        "title": title.rstrip("."),
        "authors": authors,
        "journal": journal,
        "pubdate": pubdate,
        "category": category,
        "url": url,
        "source": "doi",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def doc_id_for(doi: str) -> str:
    # Firestore 문서 ID에는 '/'가 들어갈 수 없으므로 안전한 문자로 치환
    return "doi_" + re.sub(r"[^A-Za-z0-9._-]", "_", doi)


def main() -> None:
    dois = parse_dois(os.environ.get("DOIS", ""))
    category = os.environ.get("CATEGORY", "미분류").strip() or "미분류"

    if not dois:
        print("DOIS 환경변수가 비어있습니다. 예: DOIS='10.1111/jvim.16644'")
        return

    db = init_firestore()
    papers_ref = db.collection("study_papers")

    added, failed = 0, []
    for doi in dois:
        msg = fetch_crossref(doi)
        time.sleep(REQUEST_DELAY_SEC)
        if not msg:
            failed.append(doi)
            continue
        entry = build_entry(doi, msg, category)
        if not entry["title"]:
            print(f"[경고] 제목을 찾지 못함: {doi}")
            failed.append(doi)
            continue
        papers_ref.document(doc_id_for(doi)).set(entry, merge=True)
        print(f"추가: {doi} - {entry['title'][:50]}")
        added += 1

    print(f"\n완료: {added}건 추가됨, 실패 {len(failed)}건")
    if failed:
        print("실패한 DOI:", ", ".join(failed))


if __name__ == "__main__":
    main()
