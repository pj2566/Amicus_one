// Parses an Act published in the Gazette of India (English text) into sections.
// Uses text positions: body text sits in the central column, marginal headings
// (section titles) sit in the outer margin, so they can be separated reliably.
//
// Usage: node parse-gazette.js <act.pdf> <ACT_CODE> <out.json> [expectedSectionCount]

const fs = require('fs');
const pdfParse = require('pdf-parse');

const [pdfPath, actCode, outPath, expectedArg] = process.argv.slice(2);
const BODY_MIN_X = 80;
const BODY_MAX_X = 475;

process.on('unhandledRejection', () => {});

const groupLines = (items, tolerance = 2) => {
  const lines = [];
  for (const it of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find(l => Math.abs(l.y - it.y) <= tolerance);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  // The PDF splits words into fragments, so only insert a space where there is a visible gap
  const joinItems = items => items.sort((a, b) => a.x - b.x).reduce((acc, it, i, arr) => {
    if (i === 0) return it.s;
    const prev = arr[i - 1];
    const gap = it.x - (prev.x + prev.w);
    return acc + (gap > 1.2 && !/\s$/.test(acc) && !/^\s/.test(it.s) ? ' ' : '') + it.s;
  }, '');
  return lines
    .map(l => ({ y: l.y, x: Math.min(...l.items.map(i => i.x)), text: joinItems(l.items).replace(/\s+/g, ' ').trim() }))
    .filter(l => l.text)
    .sort((a, b) => b.y - a.y);
};

// Hindi gazette boilerplate is in a legacy font that extracts as Latin gibberish
const isBoilerplate = t =>
  /^(THE GAZETTE OF INDIA|PART II|PUBLISHED BY AUTHORITY|EXTRAORDINARY|REGISTERED NO|Separate paging|MINISTRY OF LAW|\(Legislative Department\)|New Delhi, the|The following Act of Parliament|received the assent|CG-DL-E|xxxGID|No\. \d+\]NEW DELHI|DR\. |Secretary to the Govt|UPLOADED BY|PRINTED BY|^\d+$)/i.test(t) ||
  /[ऀ-ॿ]/.test(t) || /(vlk\/kkj|izkf\/kdkj|Hkkx|lañ|jftLVªh|bl Hkkx)/.test(t);

(async () => {
  const pages = [];
  await pdfParse(fs.readFileSync(pdfPath), {
    max: 0,
    pagerender: async pg => {
      const tc = await pg.getTextContent();
      pages.push({
        n: pg.pageIndex + 1,
        items: tc.items.map(i => ({ x: i.transform[4], y: i.transform[5], w: i.width, s: i.str })).filter(i => i.s.trim())
      });
      return '';
    }
  });
  pages.sort((a, b) => a.n - b.n);

  // Start at the English enactment; BNSS ships a Hindi version in the same gazette
  let started = false, ended = false;
  const stream = []; // ordered body lines and margin blocks
  for (const p of pages) {
    const bodyLines = groupLines(p.items.filter(i => i.x >= BODY_MIN_X && i.x <= BODY_MAX_X));
    // Margins also carry citations of other Acts ("45 of 1860.") — those are not headings
    const marginLines = groupLines(p.items.filter(i => i.x < BODY_MIN_X || i.x > BODY_MAX_X))
      .map(l => ({ ...l, text: l.text.replace(/\b\d+\s*of\s*\d{2}\s?\d{2}\.?/g, '').replace(/\s+/g, ' ').trim() }))
      .filter(l => l.text);

    // Margin lines → blocks of consecutive lines (a heading wraps over several)
    const blocks = [];
    for (const l of marginLines) {
      const last = blocks[blocks.length - 1];
      // A heading ends with a full stop; the next heading can start on the very next line
      if (last && last.bottom - l.y < 16 && !/\.$/.test(last.text)) { last.text += ' ' + l.text; last.bottom = l.y; }
      else blocks.push({ top: l.y, bottom: l.y, text: l.text });
    }

    for (const l of bodyLines) {
      if (!started && /^BE it enacted by Parliament/.test(l.text)) started = true;
      if (!started || ended || isBoilerplate(l.text)) continue;
      stream.push({ page: p.n, y: l.y, text: l.text, blocks });
    }
    // Stop after the English version (the Hindi version, if any, follows)
    if (started && bodyLines.some(l => /^[ऀ-ॿ]/.test(l.text)) && stream.length > 50) ended = true;
  }

  // Walk lines: chapters, sections (strictly sequential numbering)
  const sections = [];
  let chapter = null, chapterTitle = null, current = null, expected = 1, pendingChapter = false;
  for (const line of stream) {
    const t = line.text;
    const ch = t.match(/^CHAPTER\s+([IVXLC]+[A-Z]?)$/);
    if (ch) { chapter = ch[1]; chapterTitle = null; pendingChapter = true; continue; }
    if (pendingChapter && /^[A-Z ,.'’\-–—()]+$/.test(t)) {
      // Wide kerning in capitals splits off a last letter ("STAT E"); rejoin it ("A" and "I" are real words)
      const fixed = t.replace(/\b([A-Z]{2,}) ([B-HJ-Z])\b/g, '$1$2');
      chapterTitle = (chapterTitle ? chapterTitle + ' ' : '') + fixed;
      continue;
    }
    pendingChapter = false;

    // Schedules follow the last section (e.g. BNSS First Schedule: classification of offences)
    const sch = t.match(/^THE\s+(FIRST|SECOND|THIRD|FOURTH)?\s*SCHEDULE$/);
    if (sch) {
      current = { act: actCode, section: `Schedule ${sch[1] ? sch[1][0] + sch[1].slice(1).toLowerCase() : ''}`.trim(), title: '', chapter: null, chapter_title: null, text: '', page: line.page };
      sections.push(current);
      expected = Infinity;
      continue;
    }
    if (current && current.section.startsWith('Schedule') && !current.title && !current.text) { current.title = t; continue; }

    const m = t.match(/^(\d+)([A-Z]?)\.\s?(.*)$/);
    if (m && Number(m[1]) === expected && !m[2]) {
      // The heading block nearest the section's first line (it is often offset by a line or two)
      const heading = line.blocks
        .filter(b => !b.used && Math.abs(b.top - line.y) <= 26)
        .sort((a, b) => Math.abs(a.top - line.y) - Math.abs(b.top - line.y))[0];
      if (heading) heading.used = true;
      current = {
        act: actCode,
        section: String(expected),
        title: (heading?.text || '').replace(/\s+/g, ' ').replace(/\.$/, '').trim(),
        chapter, chapter_title: chapterTitle,
        text: m[3],
        page: line.page
      };
      sections.push(current);
      expected++;
      continue;
    }
    if (current) {
      // Sub-headings like "Of cheating" belong to what follows, not the previous section's text
      current.text += (/[-–]$/.test(current.text) ? '' : '\n') + t;
    }
  }

  for (const s of sections) s.text = s.text.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
  const expectedCount = Number(expectedArg) || null;
  const untitled = sections.filter(s => !s.title).map(s => s.section);
  fs.writeFileSync(outPath, JSON.stringify(sections, null, 1));
  const numbered = sections.filter(s => !s.section.startsWith('Schedule'));
  console.log(`${actCode}: ${numbered.length} sections + ${sections.length - numbered.length} schedules${expectedCount ? ` (expected ${expectedCount})` : ''}, untitled: ${untitled.length ? untitled.join(',') : 'none'}`);
  if (expectedCount && numbered.length !== expectedCount) process.exitCode = 1;
})();
