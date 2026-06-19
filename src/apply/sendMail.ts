import * as dotenv from 'dotenv';
dotenv.config();
import nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const [,, to, subject, htmlFile] = process.argv;
  if (!to || !subject || !htmlFile) {
    console.error('Usage: tsx sendMail.ts <to> <subject> <htmlFile>');
    process.exit(1);
  }

  const htmlBody = fs.readFileSync(htmlFile, 'utf-8');
  const cvPath   = path.join(process.cwd(), 'src', 'CV', 'ALEX - CV 2026.pdf');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER!,
      pass: process.env.GMAIL_APP_PASSWORD!,
    },
  });

  const attachments = fs.existsSync(cvPath)
    ? [{ filename: 'Alex_Grossi_CV.pdf', path: cvPath }]
    : (console.warn('CV PDF not found — sending without attachment'), []);

  await transporter.sendMail({
    from:    `Alex Grossi <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html:    htmlBody,
    attachments,
  });

  console.log(`✓ Sent to ${to}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
