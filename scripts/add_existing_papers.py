#!/usr/bin/env python3
"""
기존에 알고 있던 논문들을 PMID 목록으로 한번에 추가한다.

사용법 (로컬):
  PMIDS="12345678,23456789" CATEGORY="영상진단" \
  GOOGLE_APPLICATION_CREDENTIALS_JSON="$(cat serviceAccount.json)" \
  python3 scripts/add_existing_papers.py

GitHub Actions에서는 "기존 논문 추가" 워크플로우(add-papers.yml)를 Actions 탭에서
수동 실행(Run workflow)하면서 pmids / category 입력칸에 값을 넣으면 된다.
쉼표, 공백, 줄바꿈 어떤 걸로 구분해도 인식한다.
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

NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
REQUEST_DELAY_SEC = 0.4
BATCH_SIZE = 100  # esummary 한 번에 넣을 수 있는 PMID 개수(넉넉하게 제한)


def parse_pmids(raw: str) -> list[str]:
    return [p for p in re.split(r"[,\s]+", raw.strip()) if p]


def init_firestore():
    cred_json = os.environ["GOOGLE_APPLICATION_CREDENTIALS_JSON"]
    cred = credentials.Certificate(json.loads(cred_json))
    firebase_admin.initialize_app(cred)
    return firestore.client()


def esummary(pmids: list[str]) -> dict:
    if not pmids:
        return {}
    params = {"db": "pubmed", "id": ",".join(pmids), "retmode": "json"}
    url = f"{NCBI_BASE}/esummary.fcgi?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=30) as resp:
        payload = json.load(resp)
    return payload.get("result", {})


def build_entry(pmid: str, summary: dict, category: str) -> dict:
    authors = [a.get("name", "") for a in summary.get("authors", [])][:6]
    return {
        "pmid": pmid,
        "title": summary.get("title", "").rstrip("."),
        "authors": authors,
        "journal": summary.get("fulljournalname") or summary.get("source", ""),
        "pubdate": summary.get("pubdate", ""),
        "category": category,
        "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        "source": "manual",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def main() -> None:
    pmids = parse_pmids(os.environ.get("PMIDS", ""))
    category = os.environ.get("CATEGORY", "미분류").strip() or "미분류"

    if not pmids:
        print("PMIDS 환경변수가 비어있습니다. 예: PMIDS='12345,23456'")
        return

    db = init_firestore()
    papers_ref = db.collection("papers")

    added, failed = 0, []
    for i in range(0, len(pmids), BATCH_SIZE):
        chunk = pmids[i : i + BATCH_SIZE]
        try:
            summaries = esummary(chunk)
        except Exception as exc:  # noqa: BLE001
            print(f"[경고] esummary 호출 실패: {exc}")
            failed.extend(chunk)
            continue
        time.sleep(REQUEST_DELAY_SEC)

        for pmid in chunk:
            summary = summaries.get(pmid)
            if not summary or summary.get("error"):
                failed.append(pmid)
                continue
            entry = build_entry(pmid, summary, category)
            papers_ref.document(pmid).set(entry, merge=True)
            print(f"추가: {pmid} - {entry['title'][:40]}")
            added += 1

    print(f"\n완료: {added}건 추가됨, 실패 {len(failed)}건")
    if failed:
        print("실패한 PMID:", ", ".join(failed))


if __name__ == "__main__":
    main()
