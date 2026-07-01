/**
 * Resolve Puppeteer launch options for local dev and Render/Linux production.
 */
const getLaunchOptions = async (puppeteer) => {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--font-render-hinting=none',
  ];

  const options = { headless: true, args };

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    options.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    return options;
  }

  if (typeof puppeteer.executablePath === 'function') {
    try {
      options.executablePath = await puppeteer.executablePath();
    } catch {
      /* use puppeteer default lookup */
    }
  }

  return options;
};

const isChromeMissingError = (err) => (
  /Could not find Chrome|Failed to launch the browser|Browser was not found|ENOENT.*chrom/i.test(String(err?.message || err))
);

module.exports = { getLaunchOptions, isChromeMissingError };
