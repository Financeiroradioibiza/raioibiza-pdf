const express = require('express');
const { chromium } = require('playwright');
const app = express();
app.use(express.json());
app.use((req,res,next)=>{res.set("Access-Control-Allow-Origin","*");res.set("Access-Control-Allow-Methods","GET,POST,OPTIONS");res.set("Access-Control-Allow-Headers","Content-Type");if(req.method==="OPTIONS")return res.sendStatus(200);next();});

async function abrirPagBoleto(url) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials'
    ]
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 1600 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    extraHTTPHeaders: {
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
    }
  });

  // Script stealth
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR','pt','en'] });
    window.chrome = { runtime: {} };
  });

  const page = await context.newPage();

  let tentativas = 0;
  while (tentativas < 5) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch(e) {
      console.log('Erro goto:', e.message);
    }
    // Espera dinamica
    await page.waitForTimeout(6000);
    const temErro = await page.evaluate(() => document.body.innerText.includes('Não foi possível'));
    if (!temErro) break;
    tentativas++;
    console.log('Retry', tentativas);
    await page.waitForTimeout(5000);
  }

  await page.evaluate(() => {
    const els = document.querySelectorAll('*');
    for(const el of els) {
      if(el.textContent.trim() === 'Boleto bancário' && el.children.length === 0) {
        el.click(); break;
      }
    }
  });
  await page.waitForTimeout(4000);
  return { browser, page };
}

app.post('/extrair-boleto', async (req, res) => {
  const { url, token } = req.body;
  if (token !== process.env.PDF_SECRET) return res.status(401).json({ error: 'Nao autorizado' });
  if (!url) return res.status(400).json({ error: 'URL obrigatoria' });
  try {
    const { browser, page } = await abrirPagBoleto(url);
    const dados = await page.evaluate(() => {
      const texto = document.body.innerText;
      const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
      const codigoBarras = linhas.find(l => /^\d{47,48}$/.test(l.replace(/\s/g,''))) || '';
      return { linhas: linhas.slice(0,20), codigoBarras };
    });
    await browser.close();
    return res.status(200).json({ ok: true, ...dados });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/gerar-boleto', async (req, res) => {
  const { url, token } = req.body;
  if (token !== process.env.PDF_SECRET) return res.status(401).json({ error: 'Nao autorizado' });
  if (!url) return res.status(400).json({ error: 'URL obrigatoria' });
  try {
    const { browser, page } = await abrirPagBoleto(url);
    const temBoleto = await page.evaluate(() => {
      const txt = document.body.innerText;
      return !txt.includes('Não foi possível') && txt.length > 500;
    });
    if (!temBoleto) {
      await browser.close();
      return res.status(502).json({ error: 'IUGU bloqueou' });
    }
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    res.set('Content-Type', 'application/pdf');
    res.send(pdf);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/health', (req, res) => res.json({ ok: true }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server on', PORT));
