const express = require('express');
const { chromium } = require('playwright');
const app = express();
app.use(express.json());

app.post('/extrair-boleto', async (req, res) => {
  const { url, token } = req.body;
  if (token !== process.env.PDF_SECRET) return res.status(401).json({ error: 'Nao autorizado' });
  if (!url) return res.status(400).json({ error: 'URL obrigatoria' });

  try {
    const browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(4000);

    // Clica na aba Boleto
    await page.evaluate(() => {
      const els = document.querySelectorAll('*');
      for(const el of els) {
        if(el.textContent.trim() === 'Boleto bancário' && el.children.length === 0) {
          el.click(); break;
        }
      }
    });
    await page.waitForTimeout(3000);

    // Extrai dados do boleto
    const dados = await page.evaluate(() => {
      const texto = document.body.innerText;
      const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
      
      // Busca codigo de barras (sequencia de 47 digitos)
      const codigoBarras = linhas.find(l => /^\d{47,48}$/.test(l.replace(/\s/g,''))) || '';
      
      // Busca nosso numero
      const nossoNumIdx = linhas.findIndex(l => l.toLowerCase().includes('nosso número') || l.toLowerCase().includes('nosso numero'));
      const nossoNum = nossoNumIdx >= 0 ? linhas[nossoNumIdx + 1] : '';

      // Busca vencimento
      const vencIdx = linhas.findIndex(l => l.toLowerCase().includes('vencimento'));
      const vencimento = vencIdx >= 0 ? linhas[vencIdx + 1] : '';

      // Busca valor
      const valorIdx = linhas.findIndex(l => l.toLowerCase().includes('valor do doc'));
      const valor = valorIdx >= 0 ? linhas[valorIdx + 1] : '';

      return { codigoBarras: codigoBarras.replace(/\s/g,''), nossoNum, vencimento, valor, linhas: linhas.slice(0,50) };
    });

    await browser.close();
    return res.status(200).json({ ok: true, ...dados });

  } catch(e) {
    console.error('Erro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`PDF service na porta ${PORT}`));
