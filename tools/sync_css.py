# css/style.css 를 고친 뒤 실행하세요: python tools/sync_css.py
# js/shot-css.js (이미지·GIF 저장용 CSS 사본)를 css/style.css 와 같은 내용으로 다시 만듭니다.
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
css = (root / "css" / "style.css").read_text(encoding="utf-8")
head = "/* 자동 생성 파일: css/style.css의 사본 (직접 고치지 마세요)\n   index.html을 더블클릭해서 열면 브라우저가 css 파일을 읽지 못하게 막아서, 이미지·GIF 저장이 이 사본을 씁니다.\n   웹 서버로 열면 css/style.css를 직접 읽으므로 이 파일은 쓰이지 않습니다.\n   css/style.css를 고친 뒤에는 tools/sync_css.py를 실행하면 이 파일이 새로 만들어집니다. */\n"
(root / "js" / "shot-css.js").write_text(head + "window.SHOT_CSS = " + json.dumps(css, ensure_ascii=False) + ";\n", encoding="utf-8")
print("js/shot-css.js 를 css/style.css 와 맞췄어요.")
