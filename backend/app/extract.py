"""Turn uploaded TXT, DOCX and PDF files into plain text for analysis.

Files are processed in memory and never stored. Each format is checked by its
content (not only its extension), and archive/page limits keep a malicious file
from using unbounded memory or CPU.
"""

import io
import re
import zipfile
from dataclasses import dataclass

MAX_DOCX_UNCOMPRESSED = 60 * 1024 * 1024  # guard against zip bombs
MAX_PDF_PAGES = 300
OLE_MAGIC = b"\xd0\xcf\x11\xe0"  # old .doc files and password-protected Office files


class ExtractionError(ValueError):
    """The file can't be turned into text; the message is shown to the user."""


class UnsupportedFileError(ExtractionError):
    pass


@dataclass
class Extracted:
    text: str
    file_type: str  # txt | docx | pdf
    truncated: bool


def extract_text(filename: str, data: bytes, max_chars: int) -> Extracted:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "pdf" or data.startswith(b"%PDF-"):
        file_type, text = "pdf", _pdf(data, max_chars)
    elif ext in ("doc", "docx") and data.startswith(OLE_MAGIC):
        raise UnsupportedFileError(
            "This Word file is in the old .doc format or is password-protected. "
            "Save it as an unprotected .docx and try again."
        )
    elif ext == "docx":
        file_type, text = "docx", _docx(data)
    elif ext in ("txt", "md", "text", ""):
        if b"\x00" in data[:4096] and not data.startswith((b"\xff\xfe", b"\xfe\xff")):
            raise UnsupportedFileError("This looks like a binary file. Upload a .txt, .docx or .pdf file.")
        file_type, text = "txt", _txt(data)
    else:
        raise UnsupportedFileError("Unsupported file type. Upload a .txt, .docx or .pdf file.")

    text = _tidy(text)
    if not text:
        hint = " Scanned PDFs need OCR, which isn't supported yet." if file_type == "pdf" else ""
        raise ExtractionError(f"No text found in the file.{hint}")
    truncated = len(text) > max_chars
    if truncated:
        cut = text.rfind(" ", 0, max_chars)
        text = text[: cut if cut > max_chars // 2 else max_chars].rstrip()
    return Extracted(text=text, file_type=file_type, truncated=truncated)


def _txt(data: bytes) -> str:
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        return data.decode("utf-16", errors="replace")
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("cp1252", errors="replace")


def _docx(data: bytes) -> str:
    import docx
    from docx.table import Table

    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            if sum(info.file_size for info in zf.infolist()) > MAX_DOCX_UNCOMPRESSED:
                raise ExtractionError("The Word file is too large once unpacked.")
        document = docx.Document(io.BytesIO(data))
    except ExtractionError:
        raise
    except Exception as exc:
        raise ExtractionError("Could not read the Word file. Is it a valid .docx?") from exc

    blocks: list[str] = []
    for item in document.iter_inner_content():  # paragraphs and tables, in document order
        if isinstance(item, Table):
            for row in item.rows:
                previous = None
                for cell in row.cells:
                    if cell._tc is not previous:  # merged cells repeat; keep one copy
                        blocks.append(cell.text)
                    previous = cell._tc
        else:
            blocks.append(item.text)
    return "\n\n".join(b.strip() for b in blocks if b.strip())


def _pdf(data: bytes, max_chars: int) -> str:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(""):
            raise ExtractionError("The PDF is password-protected.")
        pages: list[str] = []
        total = 0
        for page in reader.pages[:MAX_PDF_PAGES]:
            pages.append(page.extract_text() or "")
            total += len(pages[-1])
            if total > max_chars:
                break
    except ExtractionError:
        raise
    except Exception as exc:  # pypdf raises many error types on malformed files
        if "crypt" in str(exc).lower():
            raise ExtractionError("The PDF is encrypted and can't be read.") from exc
        raise ExtractionError("Could not read the PDF. Is it a valid PDF file?") from exc
    # Pages are joined as one stream so a paragraph that crosses a page break stays whole.
    return _pdf_paragraphs("\n".join(p.strip() for p in pages))


_PAGE_NUMBER = re.compile(r"(page\s+)?\d{1,4}(\s*(of|/)\s*\d{1,4})?|-\s*\d{1,4}\s*-", re.IGNORECASE)
_CLOSED = re.compile(r"[.!?…:;,\"'”’)\]]$")  # line ends like a finished clause


def _pdf_paragraphs(raw: str) -> str:
    """Rejoin the hard-wrapped lines of PDF text into paragraphs.

    PDF text comes out one visual line at a time, and pypdf drops the vertical gaps
    between paragraphs. Leaving the line breaks in would cut sentences apart (every
    line break ends a sentence for the analyser). So: a line clearly shorter than a
    full line ends its paragraph; a short line with no closing punctuation that follows
    a finished sentence is a heading; other lines continue the current paragraph.
    """
    lines = [re.sub(r"\s+", " ", line).strip() for line in raw.splitlines()]
    lines = [line for line in lines if not _PAGE_NUMBER.fullmatch(line)]
    lengths = sorted(len(line) for line in lines if line)
    if not lengths:
        return ""
    full = lengths[int(0.9 * (len(lengths) - 1))]  # a typical full line, robust to many short ones
    paragraphs: list[str] = []
    current = ""
    for line in lines:
        if not line:
            if current:
                paragraphs.append(current)
            current = ""
            continue
        short = len(line) < 0.7 * full
        if current and short and current[-1] in ".!?…" and not _CLOSED.search(line) and not line[0].islower():
            paragraphs += [current, line]  # heading after a finished paragraph
            current = ""
            continue
        if not current:
            current = line
        elif re.search(r"[a-z]-$", current) and line[:1].islower():
            current = current[:-1] + line  # word hyphenated across the line break
        else:
            current += " " + line
        if short:
            paragraphs.append(current)
            current = ""
    if current:
        paragraphs.append(current)
    return "\n\n".join(paragraphs)


def _tidy(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    return re.sub(r"\n{3,}", "\n\n", text).strip()
