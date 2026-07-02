import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'test-output');
const URL = process.env.REPORT_URL || 'http://127.0.0.1:5173/report-demo';

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

const client = await page.createCDPSession();
await client.send('Page.setDownloadBehavior', {
  behavior: 'allow',
  downloadPath: OUT_DIR,
});

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const results = { url: URL, tests: [] };
const pass = (name, detail) => results.tests.push({ name, ok: true, detail });
const fail = (name, detail) => results.tests.push({ name, ok: false, detail });

try {
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 45000 });
  await page.waitForSelector('.lab-report-document', { timeout: 20000 });

  const pageCheck = await page.evaluate(() => {
    const report = document.querySelector('.lab-report-document');
    const text = report?.innerText || '';
    return {
      hasReport: !!report,
      textLen: text.length,
      hasTable: !!report?.querySelector('.lab-rpt-table tbody tr'),
      hasPatient: !!report?.querySelector('.lab-rpt-patient-bar'),
      pageDir: document.querySelector('.lab-report-page')?.getAttribute('dir'),
      sample: text.slice(0, 150),
    };
  });

  if (pageCheck.hasReport && pageCheck.textLen > 300 && pageCheck.hasTable) {
    pass('page-load', pageCheck);
  } else {
    fail('page-load', pageCheck);
  }

  // Print button → iframe with LTR document + content
  const printBtns = await page.$$('button');
  let printBtn = null;
  for (const btn of printBtns) {
    const txt = await page.evaluate((el) => el.textContent, btn);
    if (txt && (txt.includes('طباعة') || txt.includes('Print'))) {
      printBtn = btn;
      break;
    }
  }

  if (!printBtn) {
    fail('print-button', 'Print button not found');
  } else {
    await printBtn.click();
    await delay(800);

    const printFrame = await page.evaluate(() => {
      const iframe = document.getElementById('lims-lab-report-print-frame');
      if (!iframe) return { found: false };
      const doc = iframe.contentWindow?.document;
      const report = doc?.querySelector('.lab-report-document');
      const text = report?.innerText || '';
      return {
        found: true,
        htmlDir: doc?.documentElement?.getAttribute('dir'),
        textLen: text.length,
        hasTable: !!report?.querySelector('.lab-rpt-table tbody tr'),
        hasHeader: !!report?.querySelector('.lab-rpt-header'),
        hasPatient: !!report?.querySelector('.lab-rpt-patient-bar'),
        hasToast: !!doc?.body?.innerText?.includes('تم'),
        sample: text.slice(0, 200),
      };
    });

    if (
      printFrame.found
      && printFrame.htmlDir === 'ltr'
      && printFrame.textLen > 300
      && printFrame.hasTable
      && !printFrame.hasToast
    ) {
      pass('print-iframe', printFrame);
    } else {
      fail('print-iframe', printFrame);
    }
  }

  // PDF download
  const beforeFiles = new Set(fs.readdirSync(OUT_DIR));
  let downloadBtn = null;
  for (const btn of printBtns) {
    const txt = await page.evaluate((el) => el.textContent, btn);
    if (txt && (txt.includes('PDF') || txt.includes('تحميل'))) {
      downloadBtn = btn;
      break;
    }
  }

  if (!downloadBtn) {
    fail('pdf-button', 'Download PDF button not found');
  } else {
    await downloadBtn.click();
    let pdfFile = null;
    for (let i = 0; i < 30; i++) {
      await delay(500);
      const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.pdf'));
      const newFile = files.find((f) => !beforeFiles.has(f));
      if (newFile) {
        pdfFile = path.join(OUT_DIR, newFile);
        break;
      }
    }

    if (!pdfFile) {
      fail('pdf-download', 'No PDF file downloaded within 15s');
    } else {
      const stat = fs.statSync(pdfFile);
      const buf = fs.readFileSync(pdfFile);
      const isPdf = buf.slice(0, 4).toString() === '%PDF';
      const detail = { file: path.basename(pdfFile), bytes: stat.size, isPdf };
      if (isPdf && stat.size > 5000) {
        pass('pdf-download', detail);
      } else {
        fail('pdf-download', detail);
      }
    }
  }

  // Screenshot of on-screen report for visual check
  const shotPath = path.join(OUT_DIR, 'report-screen.png');
  await page.screenshot({ path: shotPath, fullPage: true });
  pass('screenshot', { path: shotPath });
} catch (err) {
  fail('runtime', err.message);
} finally {
  await browser.close();
}

const failed = results.tests.filter((t) => !t.ok);
console.log(JSON.stringify(results, null, 2));
console.log(`\n${results.tests.length - failed.length}/${results.tests.length} passed`);
process.exit(failed.length ? 1 : 0);
