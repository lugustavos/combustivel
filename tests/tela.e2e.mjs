// Teste da tela em um Chrome de verdade (opcional). Precisa do puppeteer-core e de um Chrome instalado:
//   npm i --no-save puppeteer-core
//   CHROME_PATH=/caminho/do/chrome node tests/tela.e2e.mjs
// Variável opcional FOTOS=/pasta para salvar capturas de tela.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => fs.existsSync(p));
const FOTOS = process.env.FOTOS || '';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.mjs': 'text/javascript' };

const servidor = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const arq = path.join(RAIZ, p);
  if (!arq.startsWith(RAIZ) || !fs.existsSync(arq)) { res.writeHead(404); res.end('não achei'); return; }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(arq)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(arq).pipe(res);
});
await new Promise(ok => servidor.listen(0, '127.0.0.1', ok));
const URL_BASE = 'http://localhost:' + servidor.address().port + '/';

let falhas = 0, feitos = 0;
const confere = (cond, msg) => { feitos++; if (cond) console.log('  ok  ' + msg); else { falhas++; console.log('FALHOU ' + msg); } };
const igual = (a, b, msg) => confere(a === b, msg + (a === b ? '' : `  (esperado "${b}", veio "${a}")`));
const contem = (a, b, msg) => confere(String(a).includes(b), msg + (String(a).includes(b) ? '' : `  (esperado conter "${b}", veio "${a}")`));

const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] });

async function novaPagina(opcoes = {}) {
  const ctx = await navegador.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: opcoes.largura || 390, height: opcoes.altura || 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (opcoes.escuro != null) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: opcoes.escuro ? 'dark' : 'light' }]);
  if (opcoes.agora) await page.evaluateOnNewDocument(ms => { const real = Date.now.bind(Date), delta = ms - real(); Date.now = () => real() + delta; }, opcoes.agora);
  const erros = [];
  page.on('pageerror', e => erros.push('erro de script: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
  page.erros = erros; page.ctx = ctx;
  await page.goto(URL_BASE, { waitUntil: 'load' });
  return page;
}
const por = (page, sel, v) => page.$eval(sel, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const txt = (page, sel) => page.$eval(sel, el => el.textContent.trim());
const visivel = (page, sel) => page.$eval(sel, el => !!(el.offsetParent || el.getClientRects().length));
const foto = async (page, nome) => { if (FOTOS) { fs.mkdirSync(FOTOS, { recursive: true }); await page.screenshot({ path: path.join(FOTOS, nome + '.png'), fullPage: true }); } };
const semRolagemLateral = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

try {
  console.log('\n1. Abertura e dia a dia');
  let page = await novaPagina({ escuro: false });
  igual(await txt(page, '#ans'), '—', 'abre sem resposta enquanto não há preço');
  igual(await page.$eval('#tabMeu', el => el.classList.contains('on')), true, 'abre na aba Meu carro');
  igual(await visivel(page, '#cardViagem'), false, 'cartões do aluguel ficam escondidos');
  igual(await page.$$eval('#carro option', o => o.length), 80 + 1 + 3 + 8, 'lista de carros completa (80 de 2026 + 1 antigo + 3 genéricos + 8 repetidos em locadoras)');
  await page.type('#pg', '6,00'); await page.type('#pe', '3,60');      // digitação real de teclado
  igual(await txt(page, '#ans'), 'ETANOL', 'etanol a 60% vence');
  contem(await txt(page, '#sub'), 'compensa até 73%', 'mostra o ponto de virada do carro típico');
  contem(await txt(page, '#meter'), '60%', 'mostra a relação de preços');
  await por(page, '#pe', '5,20');
  igual(await txt(page, '#ans'), 'GASOLINA', 'etanol a 87% perde');
  await por(page, '#pg', '6,85'); await por(page, '#pe', '4,86');
  igual(await txt(page, '#ans'), 'TANTO FAZ', 'perto da virada dá empate');
  await por(page, '#pe', 'abc');
  igual(await txt(page, '#ans'), '—', 'texto inválido no preço não quebra');
  await por(page, '#pe', '48,6');
  contem(await txt(page, '#meter'), 'Confira os preços', 'preço absurdo gera aviso');
  await por(page, '#pe', '4,86');
  await foto(page, 'meu-claro');

  console.log('\n2. Carro, uso e medição');
  await page.select('#carro', 'sandero-16-8v');
  contem(await txt(page, '#carroResumo'), '10,6 / 12,5', 'carro antigo traz os números aproximados');
  contem(await txt(page, '#carroResumo'), 'sem etiqueta oficial', 'e avisa que não é número oficial');
  contem(await txt(page, '#carroResumo'), 'Tanque 50 L', 'com o tanque');
  contem(await txt(page, '#base'), 'aproximado', 'o resultado também diz que o consumo é aproximado');
  await page.select('#carro', 'hb20-10');
  contem(await txt(page, '#carroResumo'), '13,3 / 15,4', 'escolher o carro traz os números do Inmetro');
  contem(await txt(page, '#carroResumo'), 'Tanque 50 L', 'e o tanque');
  await page.click('[data-uso="cidade"]');
  contem(await txt(page, '#facts'), '9,9 km/L', 'uso em cidade usa o consumo urbano do etanol');
  igual(await txt(page, '#ans'), 'ETANOL', 'HB20 na cidade: etanol a 71% compensa (virada em 77%)');
  await page.click('#ajCarro summary');
  await por(page, '#mKm', '420'); await por(page, '#mL', '35');
  await page.click('#mG');
  igual(await page.$eval('#realG', el => el.value), '12,0', 'medição preenche o consumo real');
  contem(await txt(page, '#base'), 'medida por você', 'e a origem do número aparece');
  await por(page, '#gc', '14,9');
  contem(await txt(page, '#carroResumo'), 'ajustado por você', 'editar número marca como ajustado');
  await page.select('#carro', 'outro');
  igual(await page.$eval('#gc', el => el.value), '14,9', '"Outro carro" mantém os números para editar');

  console.log('\n3. Aditivada e premium');
  await page.select('#carro', 'tipico');
  await page.click('#outros summary');
  await por(page, '#pe', ''); await por(page, '#pa', '7,10');
  igual(await txt(page, '#ans'), 'GASOLINA', 'aditivada mais cara não vence a comum');
  await por(page, '#pa', ''); await por(page, '#pp', '7,90'); await por(page, '#pe', '4,86');
  igual((await txt(page, '#facts')).includes('Premium'), true, 'premium entra na lista');

  console.log('\n4. Aluguel');
  await por(page, '#pp', '');
  await page.click('#tabAlug');
  igual(await visivel(page, '#cardViagem'), true, 'cartão da viagem aparece');
  igual(await visivel(page, '#uso'), false, 'seletor de uso some');
  igual(await txt(page, '#ans'), 'ETANOL', 'no fim vale o mais barato por litro');
  contem(await txt(page, '#facts'), 'Sim, mas apertado', 'carro desconhecido: pior caso fica apertado');
  igual(await visivel(page, '#meioBox'), true, 'mostra a conta da parada no meio');
  await page.select('#carro', 'argo-10');
  contem(await txt(page, '#facts'), 'Sim, com folga', 'Argo: a viagem cabe com folga');
  contem(await txt(page, '#facts'), '24 L a 38 L', 'faixa de litros');
  igual(await visivel(page, '#meioBox'), false, 'sem parada no meio');
  contem(await txt(page, '#passos'), 'Não abasteça durante a viagem', 'plano manda não abastecer no meio');
  contem(await txt(page, '#passos'), 'encha o tanque com etanol', 'e encher com etanol no fim');
  await foto(page, 'aluguel-claro');
  await por(page, '#kmEstrada', '1200');
  contem(await txt(page, '#facts'), 'Não: ', 'viagem longa não cabe');
  contem(await txt(page, '#passos'), 'Pode encher o tanque', 'etanol a 71% no Argo em estrada: enche no meio');
  await por(page, '#pe', '5,60');
  contem(await txt(page, '#passos'), 'abasteça com gasolina', 'etanol a 82%: gasolina no meio');
  contem(await txt(page, '#passos'), 'com etanol', 'e etanol no fim');
  contem(await txt(page, '#meioOut'), 'encha o tanque com gasolina', 'falta mais de um tanque: manda encher');
  contem(await txt(page, '#meioOut'), 'refaça esta conta', 'e avisa que haverá outra parada');
  await por(page, '#faltam', '100');
  contem(await txt(page, '#meioOut'), 'Para 100 km: coloque ≈ 8 L', 'conta refeita para os km digitados');
  await por(page, '#pe', '4,86'); await por(page, '#kmEstrada', '240'); await por(page, '#faltam', '');
  await page.select('#nivel', '0.5');
  contem(await txt(page, '#passos'), 'saiu com 1/2', 'tanque pela metade na retirada gera alerta');
  await page.select('#regra', 'mesmo');
  contem(await txt(page, '#lbl'), 'complete com', 'devolução no mesmo nível muda o texto');
  contem(await txt(page, '#passos'), 'mesma marca da retirada (1/2)', 'e o passo final');
  await page.select('#nivel', '1'); await page.select('#regra', 'cheio');
  await por(page, '#tanque', '');
  contem(await txt(page, '#facts'), 'Informe o tanque', 'sem tanque pede o dado');
  await page.select('#carro', 'argo-10');
  await por(page, '#pg', '5,00'); await por(page, '#pe', '5,00');
  igual(await txt(page, '#ans'), 'TANTO FAZ', 'preços iguais por litro');
  await por(page, '#pg', '6,85'); await por(page, '#pe', '4,86');
  await page.click('#cardCheck summary');
  igual(await visivel(page, '#cardCheck ul'), true, 'lista de retirada e devolução abre');

  console.log('\n5. Guardar, recarregar, cópia de segurança');
  await page.reload({ waitUntil: 'load' });
  igual(await page.$eval('#tabMeu', el => el.classList.contains('on')), true, 'reabre na aba Meu carro');
  igual(await page.$eval('#pg', el => el.value), '6,85', 'preço guardado');
  igual(await page.$eval('#carro', el => el.value), 'tipico', 'carro do dia a dia guardado');
  await page.click('#tabAlug');
  igual(await page.$eval('#carro', el => el.value), 'argo-10', 'carro do aluguel guardado em separado');
  await page.click('#cardAjustes summary');
  await page.click('#btnExport');
  const codigo = await page.$eval('#txtBackup', el => el.value);
  igual(codigo.startsWith('CMB4.'), true, 'gera o código de cópia');
  await page.click('#btnReset'); await page.click('#btnReset');
  igual(await page.$eval('#pg', el => el.value), '', 'apagar tudo limpa os preços');
  await por(page, '#txtBackup', 'lixo');
  await page.click('#btnImport');
  contem(await txt(page, '#bkOut'), 'não é válido', 'código inválido é recusado');
  await por(page, '#txtBackup', codigo);
  await page.click('#btnImport');
  igual(await page.$eval('#pg', el => el.value), '6,85', 'código válido restaura os dados');

  console.log('\n6. Ajustes');
  await page.click('#tabMeu');
  await page.select('#carro', 'argo-10');
  const antes = await txt(page, '#sub');
  await por(page, '#cMistura', '27');
  confere((await txt(page, '#sub')) !== antes, 'mudar a mistura recalcula o resultado');
  contem(await txt(page, '#cfgNota'), '27%', 'nota mostra a mistura nova');
  contem(await txt(page, '#base'), '27%', 'e a base do resultado também');
  await por(page, '#cMistura', '99');
  igual(await page.$eval('#cMistura', el => el.value), '27', 'valor fora da faixa é ignorado');
  await por(page, '#cMistura', '32');
  igual(page.erros.length, 0, 'nenhum erro de script' + (page.erros.length ? ': ' + page.erros.join(' | ') : ''));
  await page.ctx.close();

  console.log('\n7. Aviso quando a regra da mistura vence');
  page = await novaPagina({ agora: Date.UTC(2026, 10, 16, 15) });
  igual(await visivel(page, '#aviso'), false, 'em nov/2026 não há aviso');
  await page.ctx.close();
  page = await novaPagina({ agora: Date.UTC(2027, 2, 1, 15) });
  igual(await visivel(page, '#aviso'), true, 'em mar/2027 o aviso aparece');
  contem(await txt(page, '#aviso'), 'venceu em janeiro de 2027', 'com a explicação');
  await page.evaluate(() => [...document.querySelectorAll('#aviso button')].find(b => b.textContent === 'É 30%').click());
  igual(await visivel(page, '#aviso'), false, 'some depois de responder');
  await page.click('#cardAjustes summary');
  igual(await page.$eval('#cMistura', el => el.value), '30', 'e grava a mistura escolhida');
  await page.reload({ waitUntil: 'load' });
  igual(await visivel(page, '#aviso'), false, 'continua respondido depois de recarregar');
  igual(page.erros.length, 0, 'nenhum erro de script');
  await page.ctx.close();

  console.log('\n8. Telas pequenas e tema escuro');
  for (const [largura, altura] of [[320, 568], [360, 740], [430, 932]]) {
    page = await novaPagina({ largura, altura, escuro: true });
    await por(page, '#pg', '6,85'); await por(page, '#pe', '4,86');
    igual(await semRolagemLateral(page), true, `${largura}px: Meu carro sem rolagem lateral`);
    await page.click('#ajCarro summary'); await page.click('#cardAjustes summary');
    igual(await semRolagemLateral(page), true, `${largura}px: com tudo aberto`);
    await page.click('#tabAlug'); await por(page, '#kmEstrada', '1200'); await page.click('#cardCheck summary');
    igual(await semRolagemLateral(page), true, `${largura}px: Aluguel sem rolagem lateral`);
    igual(await page.$eval('#ans', el => el.scrollWidth <= el.clientWidth + 1), true, `${largura}px: resposta cabe na tela`);
    if (largura === 320) await foto(page, 'aluguel-escuro-320');
    await page.click('#tabMeu');
    if (largura === 430) await foto(page, 'meu-escuro-430');
    await page.ctx.close();
  }

  console.log('\n9. Sem internet');
  page = await novaPagina();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'load' });
  igual(await page.evaluate(() => !!navigator.serviceWorker.controller), true, 'service worker no controle');
  await por(page, '#pg', '6,85'); await por(page, '#pe', '4,86');
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'load' });
  igual(await txt(page, '#ans'), 'TANTO FAZ', 'abre e calcula sem internet');
  igual(await page.$eval('link[rel="apple-touch-icon"]', l => l.href.endsWith('icon-180.png')), true, 'ícone declarado');
  await page.setOfflineMode(false);
  await page.ctx.close();
} catch (e) {
  falhas++; console.log('FALHOU com exceção: ' + (e && e.stack || e));
}

await navegador.close(); servidor.close();
console.log(`\n${feitos} conferências, ${falhas} falha(s).`);
process.exit(falhas ? 1 : 0);
