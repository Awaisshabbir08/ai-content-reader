// Reference-list entries and in-text citations in APA 7, MLA 9, Chicago 17
// (notes-bibliography) and Harvard (Cite Them Right). A citation is a list of segments,
// so italics survive both on screen and when copied into a word processor.

export type CitationStyle = "apa" | "mla" | "chicago" | "harvard";
export type SourceType = "website" | "book" | "journal";

export const STYLES: { id: CitationStyle; label: string }[] = [
  { id: "apa", label: "APA 7" },
  { id: "mla", label: "MLA 9" },
  { id: "chicago", label: "Chicago 17" },
  { id: "harvard", label: "Harvard" },
];

export interface Author {
  first: string; // given names; leave empty for an organisation
  last: string; // family name, or the organisation's full name
}

export interface SourceFields {
  type: SourceType;
  authors: Author[];
  title: string;
  container: string; // website name / journal name
  publisher: string;
  place: string; // place of publication (Chicago, Harvard books)
  edition: string;
  year: string;
  month: string; // "1".."12" or ""
  day: string;
  volume: string;
  issue: string;
  pages: string;
  url: string;
  doi: string;
  accessed: string; // yyyy-mm-dd
}

export const EMPTY_SOURCE: SourceFields = {
  type: "website",
  authors: [{ first: "", last: "" }],
  title: "",
  container: "",
  publisher: "",
  place: "",
  edition: "",
  year: "",
  month: "",
  day: "",
  volume: "",
  issue: "",
  pages: "",
  url: "",
  doi: "",
  accessed: "",
};

export interface Segment {
  text: string;
  italic?: boolean;
}

export interface Citation {
  reference: Segment[];
  inText: Segment[];
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MLA_MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

// ---------- helpers ----------

const t = (s: string) => s.trim();
const isOrg = (a: Author) => !t(a.first) && !!t(a.last);

function namedAuthors(src: SourceFields): Author[] {
  return src.authors.filter((a) => t(a.last) || t(a.first)).map((a) => (t(a.last) ? a : { first: "", last: a.first }));
}

function initials(first: string, spaced: boolean): string {
  return t(first)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      part
        .split("-")
        .map((p) => `${p[0].toUpperCase()}.`)
        .join("-"),
    )
    .join(spaced ? " " : "");
}

/** Add a closing punctuation mark unless the text already ends with one. */
function close(s: string, mark = "."): string {
  const v = t(s);
  return /[.!?]$/.test(v) ? v : v + mark;
}

function ordinal(edition: string): string {
  const n = parseInt(edition, 10);
  if (!n) return t(edition);
  const lastTwo = n % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

function pages(p: string): string {
  return t(p).replace(/\s*[-–—]\s*/g, "–");
}

function doiUrl(doi: string): string {
  const v = t(doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
  return v ? `https://doi.org/${v}` : "";
}

function link(src: SourceFields): string {
  return doiUrl(src.doi) || t(src.url);
}

function monthName(m: string): string {
  const i = parseInt(m, 10);
  return i >= 1 && i <= 12 ? MONTHS[i - 1] : "";
}

function parseIso(date: string): { y: string; m: string; d: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t(date));
  return match ? { y: match[1], m: String(Number(match[2])), d: String(Number(match[3])) } : null;
}

function shortTitle(title: string): string {
  const w = t(title).split(/\s+/);
  return w.length > 4 ? `${w.slice(0, 4).join(" ")}…` : t(title);
}

/** Build segments from parts; empty parts are dropped and adjacent text is merged. */
function seg(...parts: (Segment | string | false | null | undefined)[]): Segment[] {
  const out: Segment[] = [];
  for (const p of parts) {
    if (!p) continue;
    const s = typeof p === "string" ? { text: p } : p;
    if (!s.text) continue;
    const last = out[out.length - 1];
    if (last && !!last.italic === !!s.italic) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

const i = (text: string): Segment | null => (t(text) ? { text: t(text), italic: true } : null);

// ---------- author lists ----------

function apaAuthors(list: Author[]): string {
  const names = list.map((a) => (isOrg(a) ? t(a.last) : `${t(a.last)}, ${initials(a.first, true)}`));
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length <= 20) return `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
  return `${names.slice(0, 19).join(", ")}, . . . ${names[names.length - 1]}`;
}

function invertedFirst(a: Author): string {
  return isOrg(a) ? t(a.last) : `${t(a.last)}, ${t(a.first)}`;
}

function natural(a: Author): string {
  return isOrg(a) ? t(a.last) : `${t(a.first)} ${t(a.last)}`;
}

function mlaAuthors(list: Author[]): string {
  if (list.length === 0) return "";
  if (list.length === 1) return invertedFirst(list[0]);
  if (list.length === 2) return `${invertedFirst(list[0])}, and ${natural(list[1])}`;
  return `${invertedFirst(list[0])}, et al.`;
}

function chicagoAuthors(list: Author[]): string {
  if (list.length === 0) return "";
  if (list.length === 1) return invertedFirst(list[0]);
  const shown = list.length > 10 ? list.slice(0, 7) : list;
  const rest = shown.slice(1).map(natural);
  if (list.length > 10) return `${invertedFirst(shown[0])}, ${rest.join(", ")}, et al.`;
  if (rest.length === 1) return `${invertedFirst(shown[0])}, and ${rest[0]}`;
  return `${invertedFirst(shown[0])}, ${rest.slice(0, -1).join(", ")}, and ${rest[rest.length - 1]}`;
}

function harvardAuthors(list: Author[]): string {
  const names = list.map((a) => (isOrg(a) ? t(a.last) : `${t(a.last)}, ${initials(a.first, false)}`));
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length >= 4) return `${names[0]} et al.`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function inTextNames(list: Author[], and: string): string {
  const lasts = list.map((a) => t(a.last));
  if (lasts.length === 1) return lasts[0];
  if (lasts.length === 2) return `${lasts[0]} ${and} ${lasts[1]}`;
  return `${lasts[0]} et al.`;
}

// ---------- styles ----------

function apa(src: SourceFields): Citation {
  const authors = namedAuthors(src);
  const year = t(src.year) || "n.d.";
  const md = src.type === "website" && t(src.year) && monthName(src.month)
    ? `, ${monthName(src.month)}${t(src.day) ? ` ${t(src.day)}` : ""}`
    : "";
  const date = `(${year}${md}).`;
  const who = authors.length ? close(apaAuthors(authors)) : "";
  const url = link(src);
  let reference: Segment[];

  if (src.type === "website") {
    const site = t(src.container) && !(authors.length === 1 && t(authors[0].last) === t(src.container)) ? close(src.container) : "";
    reference = who
      ? seg(`${who} ${date} `, i(close(src.title)), site && ` ${site}`, url && ` ${url}`)
      : seg(i(close(src.title)), ` ${date}`, site && ` ${site}`, url && ` ${url}`);
  } else if (src.type === "book") {
    const ed = t(src.edition) ? ` (${ordinal(src.edition)} ed.)` : "";
    const titlePart = seg(i(t(src.title)), ed ? `${ed}.` : /[.!?]$/.test(t(src.title)) ? "" : ".");
    const rest = seg(t(src.publisher) && ` ${close(src.publisher)}`, url && ` ${url}`);
    reference = who ? seg(`${who} ${date} `, ...titlePart, ...rest) : seg(...titlePart, ` ${date}`, ...rest);
  } else {
    const issue = t(src.issue) ? `(${t(src.issue)})` : "";
    const pp = t(src.pages) ? `, ${pages(src.pages)}` : "";
    const head = who ? `${who} ${date} ${close(src.title)}` : `${close(src.title)} ${date}`;
    reference = seg(head, " ", i(src.container), t(src.volume) && ", ", i(src.volume), `${issue}${pp}.`, url && ` ${url}`);
  }

  const name = authors.length ? inTextNames(authors, "&") : "";
  const inText = name
    ? seg(`(${name}, ${year})`)
    : src.type === "journal"
      ? seg(`(“${shortTitle(src.title)},” ${year})`)
      : seg("(", i(shortTitle(src.title)), `, ${year})`);
  return { reference, inText };
}

function mla(src: SourceFields): Citation {
  const authors = namedAuthors(src);
  const who = authors.length ? `${close(mlaAuthors(authors))} ` : "";
  const url = t(src.url).replace(/^https?:\/\//i, "");
  const doi = doiUrl(src.doi);
  let reference: Segment[];

  if (src.type === "website") {
    const m = parseInt(src.month, 10);
    const date = t(src.year)
      ? `${t(src.day) && m ? `${t(src.day)} ` : ""}${m ? `${MLA_MONTHS[m - 1]} ` : ""}${t(src.year)}`
      : "";
    const acc = parseIso(src.accessed);
    const accessed = acc ? ` Accessed ${acc.d} ${MLA_MONTHS[Number(acc.m) - 1]} ${acc.y}.` : "";
    const tail = [date, url].filter(Boolean).join(", ");
    reference = seg(
      who,
      `“${close(src.title)}”`,
      t(src.container) && " ",
      i(src.container),
      t(src.container) ? (tail ? `, ${tail}.` : ".") : tail ? ` ${tail}.` : "",
      accessed,
    );
  } else if (src.type === "book") {
    const ed = t(src.edition) ? `${ordinal(src.edition)} ed., ` : "";
    const tail = [t(src.publisher), t(src.year)].filter(Boolean).join(", ");
    reference = seg(who, i(close(src.title)), (ed || tail) && ` ${ed}${tail}.`, doi && ` ${doi}.`);
  } else {
    const parts = [
      t(src.volume) && `vol. ${t(src.volume)}`,
      t(src.issue) && `no. ${t(src.issue)}`,
      t(src.year),
      t(src.pages) && `pp. ${pages(src.pages)}`,
    ].filter(Boolean);
    reference = seg(
      who,
      `“${close(src.title)}”`,
      " ",
      i(src.container),
      parts.length ? `, ${parts.join(", ")}.` : ".",
      (doi || url) && ` ${doi || url}.`,
    );
  }

  const name = authors.length ? inTextNames(authors, "and") : "";
  const inText = name
    ? seg(`(${name})`)
    : src.type === "book"
      ? seg("(", i(shortTitle(src.title)), ")")
      : seg(`(“${shortTitle(src.title)}”)`);
  return { reference, inText };
}

function chicago(src: SourceFields): Citation {
  const authors = namedAuthors(src);
  const who = authors.length ? `${close(chicagoAuthors(authors))} ` : "";
  const url = link(src);
  let reference: Segment[];

  if (src.type === "website") {
    const month = monthName(src.month);
    const date = t(src.year) ? `${month ? `${month} ${t(src.day) ? `${t(src.day)}, ` : ""}` : ""}${t(src.year)}.` : "";
    const acc = parseIso(src.accessed);
    const accessed = !date && acc ? `Accessed ${monthName(acc.m)} ${acc.d}, ${acc.y}.` : "";
    reference = seg(
      who,
      `“${close(src.title)}”`,
      t(src.container) && ` ${close(src.container)}`,
      (date || accessed) && ` ${date || accessed}`,
      url && ` ${url}.`,
    );
  } else if (src.type === "book") {
    const ed = t(src.edition) ? ` ${ordinal(src.edition)} ed.` : "";
    const pub = [t(src.place) && t(src.publisher) ? `${t(src.place)}: ${t(src.publisher)}` : t(src.publisher), t(src.year)]
      .filter(Boolean)
      .join(", ");
    reference = seg(who, i(close(src.title)), ed, pub && ` ${pub}.`, url && ` ${url}.`);
  } else {
    const vol = [t(src.volume), t(src.issue) && `no. ${t(src.issue)}`].filter(Boolean).join(", ");
    reference = seg(
      who,
      `“${close(src.title)}”`,
      " ",
      i(src.container),
      vol && ` ${vol}`,
      t(src.year) && ` (${t(src.year)})`,
      t(src.pages) ? `: ${pages(src.pages)}.` : ".",
      url && ` ${url}.`,
    );
  }

  const name = authors.length ? inTextNames(authors, "and") : "";
  const year = t(src.year) || "n.d.";
  const inText = name
    ? seg(`(${name} ${year})`)
    : src.type === "book"
      ? seg("(", i(shortTitle(src.title)), ` ${year})`)
      : seg(`(“${shortTitle(src.title)}” ${year})`);
  return { reference, inText };
}

function harvard(src: SourceFields): Citation {
  const authors = namedAuthors(src);
  const year = t(src.year) || "no date";
  const head = authors.length ? `${harvardAuthors(authors)} (${year}) ` : "";
  const acc = parseIso(src.accessed);
  const accessed = acc ? ` (Accessed: ${acc.d} ${monthName(acc.m)} ${acc.y})` : "";
  let reference: Segment[];

  if (src.type === "website") {
    const titled = authors.length ? seg(i(close(src.title))) : seg(i(t(src.title)), ` (${year}).`);
    reference = seg(
      head,
      ...titled,
      t(src.container) && authors.length > 0 && ` ${close(src.container)}`,
      t(src.url) && ` Available at: ${t(src.url)}${accessed}.`,
    );
  } else if (src.type === "book") {
    const ed = t(src.edition) ? ` ${ordinal(src.edition)} edn.` : "";
    const pub = t(src.place) && t(src.publisher) ? `${t(src.place)}: ${t(src.publisher)}` : t(src.publisher);
    const titled = authors.length ? seg(i(close(src.title))) : seg(i(t(src.title)), ` (${year}).`);
    reference = seg(head, ...titled, ed, pub && ` ${close(pub)}`, link(src) && ` Available at: ${link(src)}${accessed}.`);
  } else {
    const vol = `${t(src.volume)}${t(src.issue) ? `(${t(src.issue)})` : ""}`;
    reference = seg(
      head,
      `‘${t(src.title)}’, `,
      i(src.container),
      vol && `, ${vol}`,
      t(src.pages) ? `, pp. ${pages(src.pages)}.` : ".",
      link(src) && ` Available at: ${link(src)}${accessed}.`,
    );
  }

  const name = authors.length ? inTextNames(authors, "and") : "";
  const inText = name ? seg(`(${name}, ${year})`) : seg("(", i(shortTitle(src.title)), `, ${year})`);
  return { reference, inText };
}

export function formatCitation(style: CitationStyle, src: SourceFields): Citation {
  return { apa, mla, chicago, harvard }[style](src);
}

export function toPlain(segments: Segment[]): string {
  return segments.map((s) => s.text).join("");
}

export function toHtml(segments: Segment[]): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return segments.map((s) => (s.italic ? `<i>${esc(s.text)}</i>` : esc(s.text))).join("");
}

export function isComplete(src: SourceFields): boolean {
  return !!t(src.title);
}
