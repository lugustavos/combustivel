// Testes do núcleo de cálculo. Rodar na raiz do projeto:  node --test tests/
// Não usa dependências: lê os blocos <script id="dados"> e <script id="nucleo"> do index.html.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bloco = id => html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>'))[1];
const ctx = vm.createContext({});
vm.runInContext(bloco('dados') + '\nglobalThis.CARROS = CARROS;', ctx);
vm.runInContext(bloco('nucleo'), ctx);
const { Core, CARROS } = ctx;

const CFG = { mistura: 32, premium: 25, margem: 15, reserva: 15, empate: 3 };
const perto = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` esperado ${b}, veio ${a}`);
const carro = id => { const c = CARROS.find(x => x[0] === id); return { ec: c[3], eh: c[4], gc: c[5], gh: c[6], tanque: c[8], pbev: true }; };
const F32 = Core.fatorMistura(32);

test('dados: tabela do Inmetro coerente', () => {
  assert.equal(CARROS.length, 80);
  assert.equal(new Set(CARROS.map(c => c[0])).size, CARROS.length, 'ids repetidos');
  const h = (c, e) => 1 / (0.55 / c + 0.45 / e);
  for (const [id, marca, nome, ec, eh, gc, gh, mj, tanque] of CARROS) {
    assert.ok(marca && nome, id);
    for (const v of [ec, eh, gc, gh]) assert.ok(v > 5 && v < 20, id + ' km/L fora da faixa');
    assert.ok(ec < gc && eh < gh, id + ' etanol deveria render menos');
    for (const r of [ec / gc, eh / gh]) assert.ok(r > 0.64 && r < 0.78, id + ' proporção etanol/gasolina estranha: ' + r);
    // km/L combinado × MJ/km fica numa faixa estreita em toda a tabela: pega erro de digitação grosseiro
    assert.ok(h(gc, gh) * mj > 20.2 && h(gc, gh) * mj < 22.2, id + ' gasolina × MJ/km');
    assert.ok(h(ec, eh) * mj > 14.0 && h(ec, eh) * mj < 15.6, id + ' etanol × MJ/km');
    assert.ok(tanque === null || (tanque >= 30 && tanque <= 80), id + ' tanque');
  }
});

test('num: lê números digitados à brasileira', () => {
  assert.equal(Core.num('6,86'), 6.86);
  assert.equal(Core.num('R$ 6,859'), 6.859);
  assert.equal(Core.num('6.86'), 6.86);
  assert.equal(Core.num(' 12 '), 12);
  assert.equal(Core.num('1.234,5'), 1234.5);
  assert.equal(Core.num(7.5), 7.5);
  for (const ruim of ['', '  ', 'abc', '-3', '0', 0, -1, null, undefined, NaN, Infinity, '6,8,9']) assert.equal(Core.num(ruim), null, String(ruim));
});

test('energia por litro reproduz a tabela da AEA', () => {
  perto(Core.energia(0), 31.65, 1e-9);
  perto(Core.energia(22), 29.35, 0.005);
  perto(Core.energia(25), 29.03, 0.01);
  perto(Core.energia(27), 28.82, 0.01);
  perto(Core.fatorMistura(22), 1, 1e-12);
  perto(F32, 0.9644, 0.0005);
  assert.ok(Core.fatorMistura(30) > F32 && Core.fatorMistura(35) < F32);
});

test('media: harmônica ponderada pela distância', () => {
  perto(Core.media(10, 20, 0.5), 1 / (0.5 / 10 + 0.5 / 20));
  assert.equal(Core.media(10, 20, 1), 10);
  assert.equal(Core.media(10, 20, 0), 20);
});

test('completar: estima o que falta pelas proporções do carro típico', () => {
  const t = Core.TIPICO;
  const tudo = Core.completar({});
  assert.deepEqual([tudo.gc, tudo.gh, tudo.ec, tudo.eh], [t.gc, t.gh, t.ec, t.eh]);
  assert.equal(tudo.estimado.length, 4);
  const soG = Core.completar({ gc: '12' });
  perto(soG.gh, 12 * t.gh / t.gc); perto(soG.ec, 12 * t.ec / t.gc); perto(soG.eh, soG.gh * t.eh / t.gh);
  const soE = Core.completar({ eh: 10 });
  perto(soE.ec, 10 * t.ec / t.eh); perto(soE.gh, 10 * t.gh / t.eh);
  const cheio = Core.completar({ gc: 13, gh: 15, ec: 9, eh: 10 });
  assert.equal(cheio.estimado.length, 0);
});

test('consumo: desconta a mistura só nos números de etiqueta', () => {
  const argo = carro('argo-10');
  const c = Core.consumo(argo, 1, 32);
  perto(c.g, 13.6 * F32); perto(c.e, 9.4);
  const naBomba = Core.consumo({ ...argo, pbev: false }, 1, 32);
  perto(naBomba.g, 13.6); perto(naBomba.e, 9.4);
  // sem etanol informado e medido na bomba: a estimativa não pode ganhar nem perder o desconto
  const parcial = Core.consumo({ gc: 12, gh: 14, pbev: false }, 1, 32);
  perto(parcial.g, 12); perto(parcial.e, 12 / F32 * Core.TIPICO.ec / Core.TIPICO.gc);
  perto(Core.consumo(argo, 0, 22).g, 14.5);
});

test('dia a dia: custo por km, ponto de virada e empate', () => {
  const argo = carro('argo-10');
  const base = { perfil: argo, cidade: 0.55, cfg: CFG };
  const kg = Core.media(13.6 * F32, 14.5 * F32, 0.55), ke = Core.media(9.4, 10.4, 0.55);
  let r = Core.diaADia({ ...base, precos: { g: '6,00', e: '3,60' } });
  assert.equal(r.melhor.id, 'e'); assert.equal(r.empate, false);
  perto(r.paridade, ke / kg); perto(r.relacao, 0.6); perto(r.etanolAte, 6 * ke / kg);
  perto(r.melhor.custo, 3.6 / ke); perto(r.segundo.custo, 6 / kg);
  r = Core.diaADia({ ...base, precos: { g: '6,00', e: '5,20' } });
  assert.equal(r.melhor.id, 'g'); assert.equal(r.empate, false);
  // exatamente no ponto de virada os custos empatam
  r = Core.diaADia({ ...base, precos: { g: 6, e: 6 * ke / kg } });
  perto(r.diferenca, 0, 1e-9); assert.equal(r.empate, true);
  // logo dentro e logo fora da faixa de empate (3%)
  r = Core.diaADia({ ...base, precos: { g: 6, e: 6 * ke / kg * 0.98 } });
  assert.equal(r.melhor.id, 'e'); assert.equal(r.empate, true);
  r = Core.diaADia({ ...base, precos: { g: 6, e: 6 * ke / kg * 0.96 } });
  assert.equal(r.melhor.id, 'e'); assert.equal(r.empate, false);
  // a paridade do carro típico com 32% fica perto de 73%, não de 70% nem de 75%
  const tip = Core.diaADia({ perfil: { ...Core.TIPICO, pbev: true }, cidade: 0.55, cfg: CFG, precos: { g: 6, e: 4 } });
  assert.ok(tip.paridade > 0.72 && tip.paridade < 0.74, 'paridade típica ' + tip.paridade);
  // só um preço: sem resposta
  r = Core.diaADia({ ...base, precos: { g: 6 } });
  assert.equal(r.melhor, undefined); assert.equal(r.lista.length, 1);
});

test('dia a dia: aditivada, premium e consumo medido', () => {
  const argo = carro('argo-10');
  const base = { perfil: argo, cidade: 0.55, cfg: CFG };
  let r = Core.diaADia({ ...base, precos: { g: 6, a: 6.3 } });
  assert.equal(r.melhor.id, 'g'); perto(r.diferenca, 0.05);
  r = Core.diaADia({ ...base, precos: { g: 6, p: 7 } });
  const ganho = Core.energia(25) / Core.energia(32);
  perto(r.lista.find(x => x.id === 'p').km / r.lista.find(x => x.id === 'g').km, ganho);
  assert.ok(ganho > 1.02 && ganho < 1.03);
  assert.equal(r.melhor.id, 'g');
  // medição do motorista substitui a etiqueta
  r = Core.diaADia({ ...base, perfil: { ...argo, realG: '11,5', realE: '8,4' }, precos: { g: 6, e: 4.3 } });
  assert.equal(r.base, 'medido'); perto(r.km.g, 11.5); perto(r.km.e, 8.4); perto(r.paridade, 8.4 / 11.5);
  const etq = Core.consumo(argo, 0.55, 32);
  r = Core.diaADia({ ...base, perfil: { ...argo, realG: 11.5 }, precos: { g: 6, e: 4.3 } });
  assert.equal(r.base, 'medido-g'); perto(r.km.e, 11.5 * etq.e / etq.g);
  r = Core.diaADia({ ...base, perfil: { ...argo, realE: 8.4 }, precos: { g: 6, e: 4.3 } });
  assert.equal(r.base, 'medido-e'); perto(r.km.g, 8.4 * etq.g / etq.e);
});

const viagem = (extra = {}) => ({ precos: { g: '6,85', e: '4,86' }, perfil: carro('argo-10'), kmEstrada: '240', kmCidade: '95', nivel: '1', regra: 'cheio', noTanque: 'nao-sei', cfg: CFG, ...extra });

test('aluguel: viagem que cabe em um tanque', () => {
  const r = Core.aluguel(viagem());
  assert.equal(r.fFim, 'e'); assert.equal(r.status, 'folga'); assert.equal(r.paradas, 0);
  const lg = 95 / (13.6 * F32) + 240 / (14.5 * F32), le = 95 / 9.4 + 240 / 10.4;
  perto(r.fim[0], lg, 1e-6); perto(r.fim[1], le * 1.15, 1e-6);
  perto(r.custo[0], lg * 4.86, 1e-6); perto(r.custo[1], le * 1.15 * 4.86, 1e-6);
  perto(r.economia[0], lg * (6.85 - 4.86), 1e-6);
  perto(r.autonomia, 48 * 0.85 / (le / 335) / 1.15, 1e-6);
  assert.equal(r.extra, 0); assert.equal(r.meio, undefined);
  // sabendo o que veio no tanque, a faixa é só a da folga
  const g = Core.aluguel(viagem({ noTanque: 'g' }));
  perto(g.fim[0], lg, 1e-6); perto(g.fim[1], lg * 1.15, 1e-6);
});

test('aluguel: estados sem preço, sem viagem e sem tanque', () => {
  assert.equal(Core.aluguel(viagem({ precos: { g: 6 } })).falta, 'precos');
  const sv = Core.aluguel(viagem({ kmEstrada: '', kmCidade: '' }));
  assert.equal(sv.semViagem, true); assert.equal(sv.fFim, 'e');
  const st = Core.aluguel(viagem({ perfil: { ...carro('argo-10'), tanque: '' } }));
  assert.equal(st.semTanque, true); assert.equal(st.status, null);
  assert.ok(st.fim[0] > 20 && st.fim[1] < 45);
  const igual = Core.aluguel(viagem({ precos: { g: 5, e: 5 } }));
  assert.equal(igual.fimEmpate, true); assert.equal(igual.fMeio, 'g');
});

test('aluguel: nível na retirada e regra de devolução', () => {
  const meio = Core.aluguel(viagem({ nivel: '0.5' }));
  perto(meio.extra, 24); assert.equal(meio.alvo, 1);
  assert.notEqual(meio.status, 'folga');   // meio tanque não dá folga para 335 km
  const mesmo = Core.aluguel(viagem({ nivel: '0.5', regra: 'mesmo', kmEstrada: '60', kmCidade: '20' }));
  assert.equal(mesmo.alvo, 0.5); assert.equal(mesmo.extra, 0); assert.equal(mesmo.status, 'folga');
  // devolvendo no mesmo nível, o que se compra é o que se gastou
  perto(mesmo.otimista.fim, mesmo.otimista.queimado, 1e-9);
});

test('aluguel: viagem longa usa custo por km no meio e preço por litro no fim', () => {
  // etanol a 80% da gasolina: perde por km, ganha por litro
  let r = Core.aluguel(viagem({ precos: { g: 6, e: 4.8 }, kmEstrada: '1200', kmCidade: '0', noTanque: 'g' }));
  assert.equal(r.status, 'nao'); assert.equal(r.fMeio, 'g'); assert.equal(r.fFim, 'e'); assert.ok(r.paradas >= 1);
  const ult = r.conservador.paradas[r.conservador.paradas.length - 1];
  assert.ok(ult.litros < 48 * 0.85 - 1e-6, 'a última parada do meio não deve encher o tanque');
  perto(r.conservador.fim, 48 * 0.85, 1e-6, 'no fim completa da reserva até cheio; ');
  // etanol a 60%: ganha nos dois critérios, então enche no meio
  r = Core.aluguel(viagem({ precos: { g: 6, e: 3.6 }, kmEstrada: '1200', kmCidade: '0', noTanque: 'g' }));
  assert.equal(r.fMeio, 'e'); assert.equal(r.fFim, 'e');
  perto(r.conservador.paradas[0].litros, 48 * 0.85, 1e-6);
  assert.equal(r.meio.encher, true);
  // economia: sempre medida contra pôr só gasolina e encher em toda parada; nunca negativa
  assert.ok(r.economia[0] > 0 && r.economia[0] <= r.economia[1]);
  r = Core.aluguel(viagem({ precos: { g: 5, e: 5.5 }, kmEstrada: '1200', kmCidade: '0', noTanque: 'g' }));
  assert.equal(r.fFim, 'g'); assert.equal(r.fMeio, 'g');
  perto(r.economia[1], 0, 1e-9, 'quando o plano já é só gasolina não há economia; ');
});

// Simulador independente: testa todas as combinações de estratégia para conferir que o plano é o mais barato.
function forcaBruta(p, comb, modo, fim) {
  const lpk = f => p.fator / p.k[f];
  let nivel = p.T * p.s, falta = p.D, atual = p.inicial, custo = 0, i = 0;
  while (falta > 1e-9 && i++ < 500) {
    const alc = Math.max(0, nivel - p.T * p.r) / lpk(atual);
    if (alc >= falta - 1e-9) { nivel -= falta * lpk(atual); falta = 0; break; }
    nivel -= alc * lpk(atual); falta -= alc;
    const cabe = p.T - nivel, precisa = falta * lpk(comb);
    const litros = modo === 'encher' ? cabe : modo === 'exato' ? Math.min(cabe, precisa) : Math.min(cabe, precisa + Math.max(0, p.T * p.alvo - nivel));
    custo += litros * p.pr[comb]; nivel += litros; atual = comb;
  }
  return custo + Math.max(0, p.T * p.alvo - nivel) * p.pr[fim];
}

test('aluguel: o plano empata com a melhor estratégia possível (1500 cenários sorteados)', () => {
  let semente = 12345;
  const rnd = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648;
  const entre = (a, b) => a + (b - a) * rnd();
  const cfg = { ...CFG, empate: 0 };
  let comParada = 0;
  for (let i = 0; i < 1500; i++) {
    const c = CARROS[Math.floor(rnd() * CARROS.length)];
    const T = Math.round(entre(38, 60));
    const pg = entre(5, 8), pe = pg * entre(0.55, 1.05);
    const nivel = ['1', '0.75', '0.5', '0.25'][Math.floor(rnd() * 4)];
    const regra = rnd() < 0.5 ? 'cheio' : 'mesmo';
    const noTanque = ['nao-sei', 'g', 'e'][Math.floor(rnd() * 3)];
    const kmE = Math.round(entre(0, 1800)), kmC = Math.round(entre(0, 300));
    if (kmE + kmC === 0) continue;
    const perfil = { ec: c[3], eh: c[4], gc: c[5], gh: c[6], tanque: T, pbev: true };
    const r = Core.aluguel({ precos: { g: pg, e: pe }, perfil, kmEstrada: kmE, kmCidade: kmC, nivel, regra, noTanque, cfg });
    const s = Number(nivel), alvo = regra === 'mesmo' ? s : 1;
    for (const [sim, inicial, fator] of [[r.otimista, r.noTanque.melhor, 1], [r.conservador, r.noTanque.pior, 1.15]]) {
      const p = { T, s, alvo, r: 0.15, D: kmE + kmC, k: r.km, pr: { g: pg, e: pe }, inicial, fator };
      let melhor = Infinity;
      for (const comb of ['g', 'e']) for (const modo of ['encher', 'exato', 'exato+alvo']) for (const fim of ['g', 'e']) melhor = Math.min(melhor, forcaBruta(p, comb, modo, fim));
      assert.ok(sim.custo <= melhor + 1e-6, `cenário ${i}: plano R$ ${sim.custo.toFixed(2)} > melhor R$ ${melhor.toFixed(2)}`);
      assert.ok(sim.custo >= melhor - 1e-6, `cenário ${i}: plano abaixo do mínimo possível?`);
      // conservação: o que se compra é o que se queima mais a diferença de nível (nunca menos que isso)
      assert.ok(sim.total >= sim.queimado + T * (alvo - s) - 1e-6, `cenário ${i}: faltou combustível`);
      assert.ok(sim.custo >= 0 && sim.fim >= -1e-9);
      if (sim.paradas.length) comParada++;
    }
    assert.ok(r.custo[0] <= r.custo[1] + 1e-9 && r.litros[0] <= r.litros[1] + 1e-9);
    if (r.status === 'folga') assert.equal(r.conservador.paradas.length, 0, `cenário ${i}`);
    if (r.status === 'nao') assert.ok(r.otimista.paradas.length >= 0 && r.conservador.paradas.length >= 1, `cenário ${i}`);
  }
  assert.ok(comParada > 300, 'poucos cenários com parada: ' + comParada);
});

test('parada no meio: quanto colocar', () => {
  // outro combustível que não o do fim: só o necessário para chegar, com a folga
  let p = Core.paradaMeio({ faltamKm: 120, km: 12, margem: 15, tanque: 48, reserva: 15, mesmoDoFim: false, alvo: 1 });
  perto(p.litros, 120 / 12 * 1.15); assert.equal(p.encher, false); assert.equal(p.maisParadas, false);
  // mesmo combustível do fim e devolução cheia: enche
  p = Core.paradaMeio({ faltamKm: 120, km: 12, margem: 15, tanque: 48, reserva: 15, mesmoDoFim: true, alvo: 1 });
  assert.equal(p.encher, true); perto(p.litros, 48 * 0.85);
  // mesmo combustível e devolução em 1/2: chega e já deixa no nível
  p = Core.paradaMeio({ faltamKm: 120, km: 12, margem: 15, tanque: 48, reserva: 15, mesmoDoFim: true, alvo: 0.5 });
  perto(p.litros, 120 / 12 * 1.15 + 48 * 0.35); assert.equal(p.encher, false);
  // falta mais do que um tanque: enche e avisa
  p = Core.paradaMeio({ faltamKm: 900, km: 12, margem: 15, tanque: 48, reserva: 15, mesmoDoFim: false, alvo: 1 });
  assert.equal(p.encher, true); assert.equal(p.maisParadas, true); perto(p.litros, 48 * 0.85);
});

test('aviso de mistura: aparece quando a regra vence e depois a cada seis meses', () => {
  const fim = Core.FIM_REGRA_E32, dia = 864e5;
  assert.equal(new Date(fim).toISOString().slice(0, 10), '2027-01-28');
  assert.equal(Core.conferirMistura(Date.UTC(2026, 10, 16), 0), 0);
  assert.equal(Core.conferirMistura(fim - 1, 0), 0);
  assert.equal(Core.conferirMistura(fim + dia, 0), 1);
  assert.equal(Core.conferirMistura(fim + dia, Date.UTC(2026, 10, 16)), 1);      // conferida antes do vencimento não conta
  assert.equal(Core.conferirMistura(fim + 30 * dia, fim + dia), 0);
  assert.equal(Core.conferirMistura(fim + 200 * dia, fim + dia), 2);
});
