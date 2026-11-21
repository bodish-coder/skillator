"""Parse ticket intake files without resolving any external XML resources."""

import hashlib
import json
import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET


FIELDS = {
    "type": "type", "title": "title", "description": "description",
    "steps": "steps", "severity": "severity", "reporter": "reporter",
    "screenshot": "screenshot-link",
}
LIMIT = 16 * 1024 * 1024


class IntakeTree(ET.TreeBuilder):
    def doctype(self, name, pubid, system):
        raise ValueError("DTD and entity declarations are forbidden")

    def start(self, tag, attrs):
        if tag.startswith("{http://www.w3.org/2001/XInclude}"):
            raise ValueError("XML includes are forbidden")
        return super().start(tag, attrs)


def read_file(path):
    with Path(path).open("rb") as stream:
        data = stream.read(LIMIT + 1)
    if len(data) > LIMIT:
        raise ValueError("intake input must be at most 16 MiB")
    return data


def text(element):
    return "".join(element.itertext()).strip()


def junit(root):
    drafts = []
    suites = [(root, ())]
    while suites:
        element, parents = suites.pop()
        path = parents + (element.get("name", ""),) if element.tag == "testsuite" else parents
        suites.extend((child, path) for child in reversed(element)
                      if child.tag in {"testsuite", "testsuites"})
        if element.tag != "testsuite":
            continue
        for case in element.findall("testcase"):
            problems = [child for child in case if child.tag in {"failure", "error"}]
            if not problems:
                continue
            name = case.get("name", "").strip()
            if not name or not path[-1].strip():
                raise ValueError("failed JUnit cases require a suite name and test name")
            identity = hashlib.sha256(json.dumps([path, name], ensure_ascii=False).encode()).hexdigest()
            suite = " / ".join(part for part in path if part)
            details = [piece for problem in problems
                       for piece in (problem.get("message", "").strip(), text(problem)) if piece]
            drafts.append({"type": "B", "title": f"{suite}: {name}",
                           "description": "\n".join(details), "source": "JUnit",
                           "sourceId": f"junit-{identity}"})
    return drafts


def template(root):
    drafts = []
    for row in root:
        if row.tag != "ticket" or any(child.tag not in FIELDS.values() for child in row):
            raise ValueError("ticket XML must contain ticket elements with template fields")
        draft = {key: text(element) for key, tag in FIELDS.items()
                 if (element := row.find(tag)) is not None}
        kind = {"b": "B", "bug": "B", "f": "F", "feature": "F"}.get(draft.get("type", "").lower())
        if kind is None:
            raise ValueError("ticket Type must be Bug, Feature, B or F")
        drafts.append({**draft, "type": kind, "source": "XML"})
    return drafts


def mapped(root, mapping):
    if not isinstance(mapping, dict) or set(mapping) != {"records", "fields"}:
        raise ValueError("mapping requires records and fields")
    records, fields = mapping["records"], mapping["fields"]
    name = r"[A-Za-z_][\w.-]*"
    path = rf"{name}(/{name})*"
    if not isinstance(records, str) or not re.fullmatch(path, records) or "/" not in records:
        raise ValueError("records must be a slash-separated path starting with the root tag")
    if (not isinstance(fields, dict) or not {"title", "sourceId"} <= fields.keys()
            or set(fields) - ((FIELDS.keys() - {"type"}) | {"sourceId", "expected"})
            or any(not isinstance(selector, str)
                   or not re.fullmatch(rf"(?:{path}(?:/@{name})?|@{name})", selector)
                   for selector in fields.values())):
        raise ValueError("fields must map title, sourceId and optional draft fields to child paths or attributes")

    def values(record, selector):
        if selector.startswith("@"):
            return record.get(selector[1:], "")
        child_path, _, attribute = selector.partition("/@")
        return "\n".join(child.get(attribute, "") if attribute else text(child)
                         for child in record.findall(child_path))

    root_tag, child_path = records.split("/", 1)
    if root.tag != root_tag:
        raise ValueError("XML root does not match the mapping")
    scenarios = root.findall(child_path)
    if not scenarios:
        raise ValueError("mapping selected no XML records")
    drafts = [{key: values(record, selector) for key, selector in fields.items()}
              for record in scenarios]
    if any(not draft["sourceId"].strip() for draft in drafts):
        raise ValueError("mapped scenarios require a source ID")
    for draft in drafts:
        expected = draft.pop("expected", "").strip()
        if expected:
            draft["description"] = "\n".join(filter(None, (draft.get("description"), f"Expected: {expected}")))
    return [{**draft, "type": "F", "source": "ATS scenario"} for draft in drafts]


def synthetic_results(data):
    if not isinstance(data, dict) or data.get("format") != "skillator.synthetic-ats-results.v1":
        raise ValueError("expected the documented synthetic ATS results format")
    results = data.get("results")
    if not isinstance(results, list):
        raise ValueError("synthetic ATS results must be an array")
    drafts = []
    for result in results:
        if not isinstance(result, dict):
            raise ValueError("each synthetic ATS result must be an object")
        if result.get("outcome") != "failed":
            continue
        if any(not isinstance(result.get(key), str) or not result[key].strip()
               for key in ("id", "title", "expected", "actual")):
            raise ValueError("failed synthetic ATS results require id, title, expected and actual")
        drafts.append({"type": "B", "title": result["title"],
                       "description": f"Expected: {result['expected']}\nActual: {result['actual']}",
                       "source": "Synthetic ATS result", "sourceId": result["id"]})
    return drafts


def read_drafts(file, mapping=None):
    data = read_file(file)
    if Path(file).suffix.lower() == ".json" and mapping is None:
        return synthetic_results(json.loads(data))
    root = ET.fromstring(data, parser=ET.XMLParser(target=IntakeTree()))
    if mapping is not None:
        return mapped(root, json.loads(read_file(mapping)))
    if root.tag in {"testsuites", "testsuite"}:
        return junit(root)
    if root.tag == "tickets":
        return template(root)
    raise ValueError("unrecognized XML root; supply a mapping for custom XML")


if __name__ == "__main__":
    try:
        print(json.dumps(read_drafts(*sys.argv[1:])))
    except (OSError, ValueError, ET.ParseError) as error:
        sys.exit(str(error))
