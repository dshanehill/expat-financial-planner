"""Rebuild Index.html from src/app.js and src/index.template.html.

Google Apps Script's HTML service can damage some modern JavaScript, so the app
code is stored inside Index.html in base64 form and decoded in the browser.
Edit src/app.js, then run:  python3 build.py
"""
import base64, pathlib
root = pathlib.Path(__file__).parent
app = (root / "src" / "app.js").read_text(encoding="utf-8")
tpl = (root / "src" / "index.template.html").read_text(encoding="utf-8")
(root / "Index.html").write_text(tpl.replace("__B64__", base64.b64encode(app.encode("utf-8")).decode()), encoding="utf-8")
print("Index.html rebuilt")
