#!/usr/bin/env python3
"""
tools/ 폴더 안의 각 HTML 파일을 통째로 Firestore(tools 컬렉션)에 저장한다.

왜 이렇게 하는가
- GitHub Pages에 있는 파일은 URL만 알면 누구나 볼 수 있다(로그인 여부와 무관).
- 하지만 이 파일들은 "로그인한 직원만 봐야 하는 내부 도구"이므로,
  파일 내용 자체를 Firestore에 넣고 firestore.rules로 접근을 제어한다.
- 메인 페이지(index.html)는 로그인 확인 후에만 Firestore에서 이 내용을 읽어와
  iframe에 srcdoc으로 렌더링한다 (checkup 탭 참고).

사용법
- tools/*.html 파일을 수정한 뒤 이 저장소에 push하면, GitHub Actions가
  자동으로 이 스크립트를 실행해 Firestore를 최신 내용으로 갱신한다.
- 문서 ID는 파일명(확장자 제외)이 된다. 예: tools/checkup.html -> tools 컬렉션의 "checkup" 문서.
"""

import json
import os
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

TOOLS_DIR = Path(__file__).resolve().parent.parent / "tools"


def init_firestore():
    cred_json = os.environ["GOOGLE_APPLICATION_CREDENTIALS_JSON"]
    cred = credentials.Certificate(json.loads(cred_json))
    firebase_admin.initialize_app(cred)
    return firestore.client()


def main() -> None:
    if not TOOLS_DIR.exists():
        print(f"tools 폴더가 없습니다: {TOOLS_DIR}")
        return

    db = init_firestore()
    tools_ref = db.collection("tools")

    html_files = sorted(TOOLS_DIR.glob("*.html"))
    if not html_files:
        print("업로드할 HTML 파일이 없습니다.")
        return

    for path in html_files:
        tool_id = path.stem
        html = path.read_text(encoding="utf-8")
        tools_ref.document(tool_id).set({
            "html": html,
            "filename": path.name,
            "size_bytes": len(html.encode("utf-8")),
        })
        print(f"업로드 완료: {path.name} ({len(html.encode('utf-8'))} bytes) -> tools/{tool_id}")


if __name__ == "__main__":
    main()
