# Combustível

App de celular (PWA, um arquivo só, sem dependências) que responde a duas perguntas:

- **Meu carro:** no posto, qual combustível sai mais barato por km no meu carro flex?
- **Aluguel:** como abastecer um carro alugado para devolver no nível combinado gastando o mínimo?

Publicado pelo GitHub Pages em `https://lugustavos.github.io/combustivel/`.

## Como usar

1. Digite o preço da gasolina e do etanol. A resposta aparece logo abaixo.
2. Escolha o carro na lista (80 versões atuais da tabela de 2026 e 80 versões mais antigas das tabelas de 2011, 2014, 2015 e 2016, todas com números do Inmetro) ou digite os seus.
3. Na aba **Aluguel**, informe os km de estrada e de cidade. O app diz se a viagem cabe em um tanque, o que
   pôr no meio (se precisar) e o que pôr antes de devolver.

Tudo fica guardado só no aparelho. Para levar a outro aparelho: *Ajustes → Copiar meus dados*.

### Instalar no celular

- **iPhone:** abra o endereço no Safari → Compartilhar → Adicionar à Tela de Início.
- **Android:** abra no Chrome → menu ⋮ → Adicionar à tela inicial (ou Instalar app).

Depois de aberto uma vez com internet, funciona sem internet. No iPhone, o app da tela inicial e o Safari guardam
dados separados: use sempre o mesmo (ou leve os dados com a cópia de segurança).

## Como a conta é feita

### Dia a dia

Custo por km = preço do litro ÷ km por litro. Ganha o menor. Se a diferença entre os dois primeiros for menor que
3%, o app responde "tanto faz", porque isso é menos que o erro das estimativas.

O ponto de virada do etanol (até que porcentagem do preço da gasolina ele compensa) é a razão entre os km/L do
etanol e os da gasolina **naquele carro**. Não existe um número único que sirva para todos.

### Consumo do carro

Os km/L vêm da etiqueta do Inmetro (PBE Veicular). O ensaio usa gasolina com **22% de etanol**, e a gasolina da
bomba tem mais que isso (32% em novembro de 2026). Mais etanol significa menos energia por litro, então o app
multiplica os km/L de gasolina da etiqueta por

```
energia(mistura atual) ÷ energia(22%),   com   energia(x) = 31,65 − 10,455 · x   (MJ/L, x de 0 a 1)
```

Com 32% o desconto é de 3,6%. O etanol da bomba é o mesmo do ensaio e não leva ajuste.

Resultado nas 80 versões da tabela: com gasolina de 32%, o etanol compensa até **71% a 76%** do preço da gasolina,
com mediana em **73%**. A regra antiga dos 70% fica um pouco abaixo disso; os "75% a 78%" que circulam na imprensa
ficam acima para a maioria dos carros.

Se você medir o consumo real (encher, rodar, encher de novo), o app usa a sua medição no lugar da etiqueta.
Medindo só um combustível, o outro é estimado pela proporção da etiqueta.

### Aluguel

O carro sai com um nível de tanque e precisa voltar em um nível combinado. Daí saem duas regras diferentes:

- **Último abastecimento, antes de devolver:** você só repõe litros, e quem vai queimar esse combustível é o
  próximo cliente. Vale o **menor preço por litro**.
- **Abastecimento no meio da viagem:** esse combustível é queimado por você. Vale o **menor custo por km**. Se ele
  for diferente do combustível do fim, coloque só o necessário para terminar a viagem.

O app simula a viagem em dois cenários (otimista e conservador) e mostra a faixa de litros e de custo. O cenário
conservador supõe que o tanque veio com etanol (se você não souber), soma 15% de folga no consumo e não conta com
os últimos 15% do tanque.

O teste `tests/nucleo.test.mjs` sorteia 1.500 viagens e confere que esse plano custa o mesmo que a melhor de 12
estratégias possíveis em cada uma.

## De onde vêm os números

| Dado | Fonte |
| --- | --- |
| Km/L por versão (cidade e estrada, etanol e gasolina) | Inmetro, [Tabela PBE Veicular 2026](https://www.gov.br/inmetro/pt-br/assuntos/avaliacao-da-conformidade/programa-brasileiro-de-etiquetagem/tabelas-de-eficiencia-energetica/veiculos-automotivos-pbe-veicular), revisão de 27/02/2026. As 80 linhas foram lidas do PDF e conferidas uma segunda vez contra ele. |
| Energia por litro de cada mistura | Oliveira et al., [Influencing Flex Fuel Car Customers at the Gas Station](https://pdf.blucher.com.br/engineeringproceedings/simea2025/PAP103.pdf), SIMEA 2025 (AEA), Tabela 1 |
| Gasolina do ensaio com 22% de etanol | A própria ficha técnica dos fabricantes traz "Gasolina (E22)"; ver também a tabela acima |
| Carros mais antigos (grupos "Marca · mais antigos") | Linhas das tabelas PBE Veicular do Inmetro de 2011, 2014, 2015 e 2016, lidas dos PDFs oficiais e conferidas por coerência (etanol rende menos que gasolina, proporção e MJ/km dentro de faixas). O nome de cada carro diz de qual tabela veio. Limites: a GM não aparece nas tabelas de 2011 a 2015 que li, então Celta, Corsa e Agile ficam de fora; o Sandero 1.6 8V só foi etiquetado em 2015 (etanol 7,3 / 8,7, gasolina 10,6 / 12,5), com o mesmo motor do modelo 2011/12. Carro com anos de uso rende diferente da etiqueta: se você mede o consumo real, digite em "Ajustar os números do carro", que vale mais que qualquer tabela. |
| Mistura de 32% | Resolução CNPE nº 9/2026: vale de 01/08/2026 por 180 dias, prorrogável uma vez por igual período. A premium continua com 25%. [Comunicado da ANP](https://www.gov.br/anp/pt-br/canais_atendimento/imprensa/noticias-comunicados/e32-gasolina-com-32-de-etanol-passa-a-valer-temporariamente-a-partir-de-amanha-1-8) |
| Aditivada | [ANP](https://www.gov.br/anp/pt-br/assuntos/producao-de-derivados-de-petroleo-e-processamento-de-gas-natural/producao-de-derivados-de-petroleo-e-processamento-de-gas-natural/gasolina): é a gasolina comum (ou premium) com detergente, sem especificação própria. Por isso o app usa o mesmo km/L da comum. |
| Regras da Localiza | [Tanque cheio](https://www.localiza.com/brasil/pt-br/como-alugar-um-carro/tanque-cheio), [perguntas frequentes](https://cliente.localiza.com/faq/preciso-abastecer-o-carro-antes-de-devolver) e [contrato](https://www.localiza.com/Contratos/Brasil/pt/Contrato_Geral_Aluguel_de_Carros.pdf), consultados em novembro de 2026 |
| Tanque (litros) | Fichas dos fabricantes para Argo (48), Mobi (44), C3 (47), 208 (47) e Onix (44); imprensa especializada para HB20 (50), Polo (49) e Kwid (38). Nos outros modelos o campo fica vazio para você preencher pelo manual. |
| Preços | Não há preço embutido. Você digita o do posto. O botão "Preços da ANP" abre o [levantamento semanal](https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/levantamento-de-precos-de-combustiveis-ultimas-semanas-pesquisadas). |

Observações sobre a tabela do Inmetro:

- O Polo Track aparece sem km/L na revisão usada, mas com o mesmo consumo energético (1,48 MJ/km) do Polo 1.0 MPI.
  O app usa os números do MPI para os dois.
- O perfil "Ainda não sei (pior caso)" junta o pior consumo e o menor tanque dos econômicos mais comuns em
  locadoras (consumo do C3 1.0, tanque de 44 L do Onix).
- O perfil "Flex típico (1.0)" é a mediana dos 1.0 manuais.

## O que muda com o tempo, e onde ajustar

Nada disto exige mexer no código:

| O que muda | Onde ajustar no app |
| --- | --- |
| Preço | Campos do topo. O app mostra a data dos preços guardados. |
| Mistura de etanol na gasolina | *Ajustes → Etanol na gasolina comum*. A partir de 28/01/2027, quando vence a regra temporária de 32%, o app pergunta sozinho qual é a mistura, e volta a perguntar a cada seis meses. |
| Consumo do carro | *Ajustar os números do carro*, ou a medição de tanque a tanque. |
| Carro que não está na lista | "Outro carro (digitar os números)". |
| Folga, reserva e faixa de empate | *Ajustes*. |

Mexer no código só vale a pena para trocar a tabela de carros por uma edição nova do Inmetro: é o bloco
`<script id="dados">` do `index.html`, uma linha por versão.

## Limites

- A etiqueta é medida em laboratório. Trânsito, ar-condicionado, calor, velocidade e carga mudam o consumo real;
  por isso existem a folga e a medição de tanque a tanque. O teto de precisão é o consumo real do carro, não a conta.
- O ajuste da mistura supõe que os km/L acompanham a energia por litro. É uma boa aproximação, não uma medição.
- O plano de aluguel usa um preço só para a viagem toda. Se o posto do meio for mais caro que o da cidade de
  devolução, refaça a conta com o preço de cada um.
- Regras de locadora mudam. O app pergunta a regra (cheio ou mesmo nível) em vez de presumir; confira no contrato.

## Arquivos

- `index.html`: tudo (tela, dados e cálculo). Os blocos de script são `dados`, `nucleo` e `app`.
- `sw.js`: deixa o app abrir sem internet (rede primeiro, cópia guardada como reserva).
- `manifest.webmanifest`, `icon-*.png`: instalação na tela inicial.
- `tests/nucleo.test.mjs`: testes do cálculo. `node --test tests/nucleo.test.mjs` (Node 20 ou mais novo, sem dependências).
- `tests/tela.e2e.mjs`: teste da tela em um Chrome de verdade (opcional): `npm i --no-save puppeteer-core` e
  `node tests/tela.e2e.mjs`.
