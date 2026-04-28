const express = require('express');
const puppeteer = require('puppeteer-core');
const app = express();
app.use(express.json());

app.post('/gerar-boleto', async (req, res) => {
  const { url, token } = req.body;
  if (token !== process.env.PDF_SECRET) return res.status(401).json({ error: 'Nao autorizado' });
  if (!url) return res.status(400).json({ error: 'URL obrigatoria' });

  try {
    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000));
    await page.evaluate(() => {
      const els = document.querySelectorAll('*');
      for(const el of els) {
        if(el.textContent.trim() === 'Boleto bancário' && el.children.length === 0) {
          el.click(); break;
        }
      }
    });
    await new Promise(r => setTimeout(r, 3000));
    const height = await page.evaluate(() => document.body.scrollHeight);
    const pdf = await page.pdf({
      printBackground: true,
      width: '210mm',
      height: (height + 100) + 'px'
    });
    await browser.close();
    res.set('Content-Type', 'application/pdf');
    res.send(pdf);
  } catch(e) {
    console.error('Erro PDF:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`PDF service na porta ${PORT}`));
