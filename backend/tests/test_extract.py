import io
import zipfile

import docx
import pytest
from fastapi.testclient import TestClient

from app import extract as extract_module
from app.config import Settings, get_settings
from app.extract import ExtractionError, UnsupportedFileError, extract_text
from app.main import app


def make_pdf(pages: list[list[str]]) -> bytes:
    """Minimal valid PDF: each page is a list of lines; "" leaves a blank line."""

    def esc(s: str) -> str:
        return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    objects: list[bytes] = []
    n_pages = len(pages)
    kids = " ".join(f"{4 + 2 * i} 0 R" for i in range(n_pages))
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {n_pages} >>".encode())
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    for i, lines in enumerate(pages):
        ops = ["BT /F1 11 Tf 14 TL 72 720 Td"]
        for line in lines:
            ops.append(f"({esc(line)}) Tj T*" if line else "T*")
        ops.append("ET")
        stream = "\n".join(ops).encode("latin-1")
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {5 + 2 * i} 0 R >>".encode()
        )
        objects.append(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for num, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % num + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return bytes(out)


def make_docx(build) -> bytes:
    document = docx.Document()
    build(document)
    buf = io.BytesIO()
    document.save(buf)
    return buf.getvalue()


# --- plain text -------------------------------------------------------------

def test_txt_utf8_with_bom_and_windows_newlines():
    result = extract_text("essay.txt", "﻿First line.\r\nSecond line café.\r\n".encode("utf-8"), 1000)
    assert result.file_type == "txt"
    assert result.text == "First line.\nSecond line café."
    assert result.truncated is False


def test_txt_falls_back_to_cp1252():
    assert extract_text("a.txt", "naïve “quotes”".encode("cp1252"), 1000).text == "naïve “quotes”"


def test_txt_utf16():
    assert extract_text("a.txt", "Hello wörld".encode("utf-16"), 1000).text == "Hello wörld"


def test_long_text_is_truncated_at_a_word_boundary():
    result = extract_text("a.txt", ("word " * 100).encode(), 52)
    assert result.truncated is True
    assert len(result.text) <= 52
    assert result.text.split() == ["word"] * len(result.text.split())


def test_empty_text_file_is_rejected():
    with pytest.raises(ExtractionError, match="No text found"):
        extract_text("a.txt", b"  \n\n ", 1000)


# --- Word -------------------------------------------------------------------

def test_docx_keeps_paragraph_and_table_order():
    def build(d):
        d.add_heading("My essay", level=1)
        d.add_paragraph("First paragraph.")
        d.add_paragraph("")  # empty paragraphs are dropped
        table = d.add_table(rows=1, cols=2)
        table.cell(0, 0).text = "Cell A"
        table.cell(0, 1).text = "Cell B"
        d.add_paragraph("Last paragraph.")

    result = extract_text("essay.docx", make_docx(build), 1000)
    assert result.file_type == "docx"
    assert result.text == "My essay\n\nFirst paragraph.\n\nCell A\n\nCell B\n\nLast paragraph."


def test_docx_merged_cells_are_not_repeated():
    def build(d):
        table = d.add_table(rows=1, cols=3)
        table.cell(0, 0).merge(table.cell(0, 1)).text = "Merged"
        table.cell(0, 2).text = "Right"

    assert extract_text("t.docx", make_docx(build), 1000).text == "Merged\n\nRight"


def test_docx_zip_bomb_guard(monkeypatch):
    monkeypatch.setattr(extract_module, "MAX_DOCX_UNCOMPRESSED", 1000)
    data = make_docx(lambda d: d.add_paragraph("x" * 2000))
    with pytest.raises(ExtractionError, match="too large"):
        extract_text("big.docx", data, 10_000)


def test_invalid_docx_is_rejected():
    with pytest.raises(ExtractionError, match="valid .docx"):
        extract_text("broken.docx", b"PK\x03\x04 not really a zip", 1000)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("hello.txt", "a zip, but not a Word file")
    with pytest.raises(ExtractionError, match="valid .docx"):
        extract_text("other.docx", buf.getvalue(), 1000)


# --- PDF --------------------------------------------------------------------

WRAPPED = [
    "Introduction",
    "The history of the printing press shows how a single technical",
    "change can reshape the way ideas spread through a whole society,",
    "and how it shaped the education of many readers over several genera-",
    "tions of readers.",
    "A second paragraph starts here and runs across more than one line",
    "of text before it ends.",
]


def test_pdf_lines_are_rejoined_into_paragraphs():
    # pypdf drops vertical gaps, so paragraph ends are found from short last lines.
    result = extract_text("paper.pdf", make_pdf([WRAPPED]), 10_000)
    assert result.file_type == "pdf"
    assert result.text.split("\n\n") == [
        "Introduction",
        "The history of the printing press shows how a single technical change can reshape the way "
        "ideas spread through a whole society, and how it shaped the education of many readers over "
        "several generations of readers.",
        "A second paragraph starts here and runs across more than one line of text before it ends.",
    ]


def test_pdf_paragraph_continues_across_a_page_break():
    page1 = [
        "Orchestra musicians follow the conductor, who stands at the front of",
        "the stage and keeps the tempo while shaping how loud each section",
        "1",  # page number: dropped
    ]
    page2 = [
        "plays (and when) during the piece, so the players stay together all",
        "the way to the end.",
    ]
    result = extract_text("upload.bin", make_pdf([page1, page2]), 10_000)  # detected by %PDF- header
    assert result.file_type == "pdf"
    assert result.text == (
        "Orchestra musicians follow the conductor, who stands at the front of the stage and keeps the "
        "tempo while shaping how loud each section plays (and when) during the piece, so the players "
        "stay together all the way to the end."
    )


def test_pdf_heading_after_a_full_last_line_starts_a_new_paragraph():
    lines = [
        "The first paragraph is long enough to fill the line from margin to",
        "margin, and its final line happens to run nearly the full width too.",
        "Section 2",
        "The second section begins here and also fills its lines from one",
        "margin to the other margin before it ends on a short line.",
        "Like this.",
    ]
    assert extract_text("a.pdf", make_pdf([lines]), 10_000).text.split("\n\n") == [
        "The first paragraph is long enough to fill the line from margin to margin, and its final "
        "line happens to run nearly the full width too.",
        "Section 2",
        "The second section begins here and also fills its lines from one margin to the other margin "
        "before it ends on a short line. Like this.",
    ]


def test_pdf_without_text_suggests_ocr():
    with pytest.raises(ExtractionError, match="OCR"):
        extract_text("scan.pdf", make_pdf([[]]), 1000)


def test_corrupt_pdf_is_rejected():
    with pytest.raises(ExtractionError, match="valid PDF"):
        extract_text("bad.pdf", b"%PDF-1.4\nthis is not a pdf", 1000)


# --- types ------------------------------------------------------------------

@pytest.mark.parametrize("name", ["slides.pptx", "image.png", "sheet.xlsx"])
def test_unsupported_types(name):
    with pytest.raises(UnsupportedFileError, match="Unsupported"):
        extract_text(name, b"data", 1000)


@pytest.mark.parametrize("name", ["old.doc", "protected.docx"])
def test_old_or_protected_word_files_have_a_specific_message(name):
    with pytest.raises(UnsupportedFileError, match="password-protected"):
        extract_text(name, b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 100, 1000)


def test_binary_file_without_extension_is_rejected():
    with pytest.raises(UnsupportedFileError, match="binary"):
        extract_text("upload", b"\x7fELF\x02\x01\x01\x00\x00\x00", 1000)


# --- API --------------------------------------------------------------------

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_extract_endpoint(client):
    res = client.post("/api/v1/extract", files={"file": ("essay.txt", b"Hello there, world.", "text/plain")})
    assert res.status_code == 200
    assert res.json() == {
        "text": "Hello there, world.",
        "filename": "essay.txt",
        "file_type": "txt",
        "word_count": 3,
        "truncated": False,
    }


def test_extract_endpoint_errors(client):
    res = client.post("/api/v1/extract", files={"file": ("a.png", b"\x89PNG", "image/png")})
    assert res.status_code == 415
    res = client.post("/api/v1/extract", files={"file": ("scan.pdf", make_pdf([[]]), "application/pdf")})
    assert res.status_code == 422
    assert "OCR" in res.json()["detail"]
    assert client.post("/api/v1/extract").status_code == 422  # no file


def test_extract_endpoint_size_limit(client):
    app.dependency_overrides[get_settings] = lambda: Settings(load_model=False, max_upload_mb=0)
    res = client.post("/api/v1/extract", files={"file": ("a.txt", b"some text", "text/plain")})
    assert res.status_code == 413
