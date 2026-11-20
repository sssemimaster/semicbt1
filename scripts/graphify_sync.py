"""graphify 가 HTML 인라인 <script> 를 코드로 못 읽는 문제를 우회한다.

루트 *.html 의 인라인 스크립트를 .graphify-src/<이름>.js 로 뽑되, 원본과 줄 번호가 같도록
앞을 빈 줄로 채운다. 그래프의 loc=L2300 은 곧 index.html:2300 이다. 그런 다음 graphify update 를 돌린다.
사용: python scripts/graphify_sync.py
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / ".graphify-src"
MIN_LINES = 20  # shortcut: 짧은 스크립트(GTM·테마 부트스트랩)는 구조 정보가 없어 건너뜀, 필요하면 낮춘다
SCRIPT = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", re.S | re.I)


def mirror(html: Path) -> int:
    text = html.read_text(encoding="utf-8")
    lines = [""] * (text.count("\n") + 1)
    kept = 0
    for m in SCRIPT.finditer(text):
        body = m.group(1)
        if body.count("\n") < MIN_LINES:
            continue
        start = text.count("\n", 0, m.start(1))
        # 여는 태그와 같은 줄에 붙은 코드는 앞 줄바꿈이 없으므로 그 줄부터 그대로 채운다
        for i, ln in enumerate(body.split("\n")):
            lines[start + i] = ln
        kept += 1
    if kept:
        (OUT / (html.stem + ".inline.js")).write_text("\n".join(lines), encoding="utf-8")
    return kept


OUT.mkdir(exist_ok=True)
for old in OUT.glob("*.inline.js"):
    old.unlink()
total = sum(mirror(h) for h in ROOT.glob("*.html"))
print(f"graphify_sync: {total} inline script block(s) mirrored")
sys.exit(subprocess.call(["graphify", "update", str(ROOT)]))
