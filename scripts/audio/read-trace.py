"""Read an owner trace workbook without changing it; emit private provenance JSON."""
import hashlib
import json
from pathlib import Path
import re
import sys
from html.parser import HTMLParser
from urllib.parse import parse_qs, urlparse, urlunparse

import openpyxl


class Attribution(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.current = {"url": dict(attrs).get("href", ""), "text": ""}

    def handle_data(self, text):
        if self.current is not None:
            self.current["text"] += text

    def handle_endtag(self, tag):
        if tag == "a" and self.current is not None:
            self.links.append(self.current)
            self.current = None


source = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
if source == output or output.suffix != ".json":
    raise ValueError("Trace extraction writes a separate JSON file, never the source workbook.")
workbook_bytes = source.read_bytes()
workbook = openpyxl.load_workbook(source, data_only=True, keep_links=False)
entries = {}
duplicates = []
for sheet in workbook:
    for row in sheet.iter_rows(min_row=2):
        values = [cell.value for cell in row]
        if len(values) < 3 or not values[1]:
            continue
        name = str(values[1]).strip()
        if not re.fullmatch(r"[a-z0-9-]+\.mp3", name):
            raise ValueError("Unexpected source filename: " + name)
        attribution = Attribution()
        attribution.feed(str(values[2] or ""))
        asset_ids = sorted({parse_qs(urlparse(link["url"]).query).get("utm_content", [""])[0]
                            for link in attribution.links} - {""})
        if len(asset_ids) > 1:
            raise ValueError("Conflicting source IDs for " + name)
        creator_link = next((link for link in attribution.links
                             if urlparse(link["url"]).path.startswith("/users/")), None)
        detail = next((link["url"] for link in attribution.links
                       if re.search(r"/sound-effects/[^/]+-\d+/?$", urlparse(link["url"]).path)), None)
        creator_url = None
        if creator_link:
            parsed = urlparse(creator_link["url"])
            creator_url = urlunparse(parsed._replace(query="", fragment=""))
        audio = source.parent / name
        record = {
            "file": name,
            "sourceSHA256": hashlib.sha256(audio.read_bytes()).hexdigest() if audio.exists() else None,
            "provider": "Pixabay (owner attribution)",
            "assetId": asset_ids[0] if asset_ids else None,
            "sourceUrl": detail,
            "creator": creator_link["text"] if creator_link else None,
            "creatorUrl": creator_url,
            "recordingOrAI": "unverified",
            "licenseEvidence": None,
            "acquisitionDate": None,
            "traceCells": {"sheet": sheet.title, "range": f"A{row[0].row}:D{row[0].row}"},
        }
        if name in entries:
            if entries[name]["assetId"] != record["assetId"]:
                raise ValueError("Conflicting duplicate row: " + name)
            duplicates.append({"file": name, "range": record["traceCells"]})
        else:
            entries[name] = record

result = {
    "version": 1,
    "workbook": source.name,
    "workbookSHA256": hashlib.sha256(workbook_bytes).hexdigest(),
    "entries": list(entries.values()),
    "duplicatesMerged": duplicates,
    "missingFiles": sorted(file.name for file in source.parent.glob("*.mp3")
                           if file.name not in entries and not file.name.startswith("axe-")),
    "note": "Attribution URLs expose asset IDs but often not individual detail pages. No license or recording claims are inferred.",
}
if source.read_bytes() != workbook_bytes:
    raise RuntimeError("Trace workbook changed while reading; rerun after editing finishes.")
output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"entries": len(entries), "missing": result["missingFiles"],
                  "duplicatesMerged": len(duplicates), "workbookSHA256": result["workbookSHA256"]}))
