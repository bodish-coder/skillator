"""Read values from the first XLSX worksheet without evaluating formulas."""
import json
import posixpath
import re
import sys
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile

MAX_XML_BYTES = 16 * 1024 * 1024


def read_workbook(path):
    with ZipFile(path) as book:
        remaining = MAX_XML_BYTES

        def xml(name):
            nonlocal remaining
            part = book.getinfo(name)
            if part.file_size > remaining:
                raise ValueError("worksheet XML exceeds 16 MiB")
            data = book.read(part)
            remaining -= len(data)
            text = data.decode("utf-8-sig")
            if re.search(r"<!\s*(?:DOCTYPE|ENTITY)\b", text, re.IGNORECASE):
                raise ValueError("DTD and entity declarations are forbidden")
            return ElementTree.fromstring(text)

        workbook = xml("xl/workbook.xml")
        sheet = workbook.find("./{*}sheets/{*}sheet")
        if sheet is None:
            raise ValueError("workbook has no worksheets")
        relation_id = next((value for key, value in sheet.attrib.items() if key.endswith("}id")), None)
        relationships = xml("xl/_rels/workbook.xml.rels")
        relation = next((rel for rel in relationships if rel.get("Id") == relation_id), None)
        if relation is None or relation.get("TargetMode") == "External" or not relation.get("Type", "").endswith("/worksheet"):
            raise ValueError("first sheet must reference an internal worksheet")
        target = relation.get("Target", "")
        name = posixpath.normpath(target.lstrip("/") if target.startswith("/") else posixpath.join("xl", target))
        if not name.startswith("xl/"):
            raise ValueError("invalid worksheet path")

        def cell_text(node):
            return "".join(item.text or "" for item in node.findall("./{*}t") + node.findall("./{*}r/{*}t"))

        shared = []
        if "xl/sharedStrings.xml" in book.namelist():
            shared = [cell_text(item) for item in xml("xl/sharedStrings.xml").findall("{*}si")]

        rows = []
        remaining_output = MAX_XML_BYTES
        for row in xml(name).findall("./{*}sheetData/{*}row"):
            values = []
            for cell in row.findall("{*}c"):
                address = re.fullmatch(r"([A-Z]{1,3})[1-9]\d*", cell.get("r", ""))
                if address is None:
                    raise ValueError("worksheet cell has an invalid address")
                position = 0
                for letter in address[1]:
                    position = position * 26 + ord(letter) - ord("A") + 1
                kind = cell.get("t")
                value = cell.findtext("{*}v", "")
                if kind == "inlineStr":
                    inline = cell.find("{*}is")
                    value = cell_text(inline) if inline is not None else ""
                if kind == "s":
                    index = int(value)
                    if not 0 <= index < len(shared):
                        raise ValueError("invalid shared string reference")
                    value = shared[index]
                # Sparse rows can otherwise expand far beyond the XML size.
                if position > 16384 or position < len(values) + 1:
                    raise ValueError("worksheet cell is out of order or outside the worksheet")
                remaining_output -= len(value) + 4 * (position - len(values))
                if remaining_output < 0:
                    raise ValueError("expanded worksheet values exceed the import limit")
                values.extend([""] * (position - len(values) - 1))
                values.append(value)
            rows.append(values)
            if len(rows) > 50000:
                raise ValueError("worksheet exceeds 50,000 rows")
        return rows


if __name__ == "__main__":
    try:
        print(json.dumps(read_workbook(sys.argv[1]), ensure_ascii=False))
    except (BadZipFile, ElementTree.ParseError, KeyError, OSError, ValueError) as error:
        sys.exit(f"Invalid XLSX: {error}")
