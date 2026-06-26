import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';

/**
 * Renders a tailored CV markdown file into a clean A4 PDF.
 *
 * Usage: tsx renderCv.ts <markdownFile> <outputPdf>
 *
 * The markdown is expected to follow the master-cv.md structure:
 *   #   name          (document title)
 *   ##  section       (Summary, Work Experience, ...)
 *   ### role — company
 *   *…* whole-line italic (dates / consent clause)
 *   - / * bullet
 *   **bold** inline runs, --- horizontal rules
 *
 * Uses pdfkit's built-in Helvetica family — no external fonts, no headless
 * browser — so it renders reliably inside the cloud sandbox.
 */

const COLOR_DARK = '#1a1a1a';
const COLOR_ACCENT = '#2b5797';
const COLOR_MUTED = '#555555';

function renderInline(doc: PDFKit.PDFDocument, text: string): void {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(p => p.length > 0);
  if (parts.length === 0) { doc.text('', { continued: false }); return; }
  parts.forEach((part, i) => {
    const isBold = part.startsWith('**') && part.endsWith('**');
    const clean = isBold ? part.slice(2, -2) : part;
    doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(clean, { continued: i < parts.length - 1 });
  });
}

function main(): void {
  const [, , mdPath, outPath] = process.argv;
  if (!mdPath || !outPath) {
    console.error('Usage: tsx renderCv.ts <markdownFile> <outputPdf>');
    process.exit(1);
  }

  const md = fs.readFileSync(mdPath, 'utf-8');
  const lines = md.split(/\r?\n/);

  const doc = new PDFDocument({ size: 'A4', margins: { top: 52, bottom: 52, left: 56, right: 56 } });
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim() === '') { doc.moveDown(0.35); continue; }

    // Horizontal rule — render as a slim spacer (sections already get their own rule)
    if (/^-{3,}$/.test(line.trim())) { doc.moveDown(0.15); continue; }

    // # Name
    if (line.startsWith('# ')) {
      doc.moveDown(0.1);
      doc.font('Helvetica-Bold').fontSize(22).fillColor(COLOR_DARK);
      doc.text(line.slice(2).trim());
      doc.moveDown(0.15);
      continue;
    }

    // ## Section
    if (line.startsWith('## ')) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(12.5).fillColor(COLOR_ACCENT);
      doc.text(line.slice(3).trim().toUpperCase(), { characterSpacing: 0.5 });
      const y = doc.y + 1;
      doc.moveTo(doc.page.margins.left, y)
        .lineTo(doc.page.margins.left + contentWidth, y)
        .lineWidth(0.5).strokeColor(COLOR_ACCENT).stroke();
      doc.moveDown(0.45);
      continue;
    }

    // ### Role — Company
    if (line.startsWith('### ')) {
      doc.moveDown(0.25);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_DARK);
      renderInline(doc, line.slice(4).trim());
      continue;
    }

    // Whole-line italic (dates, consent clause): *text* but not **bold**
    const italicMatch = line.trim().match(/^\*([^*].*[^*]|[^*])\*$/);
    if (italicMatch && !line.trim().startsWith('**')) {
      doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(COLOR_MUTED);
      doc.text(italicMatch[1]);
      continue;
    }

    // Bullet
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (bulletMatch) {
      doc.fontSize(10).fillColor(COLOR_DARK);
      doc.font('Helvetica').text('•  ', { continued: true, indent: 8 });
      renderInline(doc, bulletMatch[1].trim());
      continue;
    }

    // Plain paragraph (may contain inline bold)
    doc.fontSize(10).fillColor(COLOR_DARK);
    renderInline(doc, line.trim());
  }

  doc.end();
  stream.on('finish', () => console.log(`✓ CV rendered → ${outPath}`));
  stream.on('error', err => { console.error(err.message); process.exit(1); });
}

main();
