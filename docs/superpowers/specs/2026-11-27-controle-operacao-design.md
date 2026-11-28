# Controle de Operação: Operação, Agenda de operação e Documento

Data: 27/11/2026. Arquivo principal: `munck/munck.html` (vira `publico/operacao.html` no Painel Deconto).

## Por quê

O Controle de Operação foi feito para obras (obra, etapa, mapa). O dia a dia da Deconto é outro:
cada serviço é uma **operação** para um **cliente**, de um **destino A** para um **destino B**, com
**valor** e **se já foi pago**. A empresa quer registrar isso, saber o que falta receber e
controlar o **documento e o seguro** de cada caminhão.

## O que muda (pedido do dono)

1. Sai a aba **Mapa**.
2. Sai a aba **Km das obras**.
3. Sai a aba **Obras**.
4. Entra a aba **Operação**, com: data, cliente, destino A, destino B, valor, pago (sim/não),
   motorista, caminhão, km inicial, km final e horímetro (só se o caminhão for munck).
5. A **Agenda** vira **agenda de operação**: caminhão, motorista, cliente, destino A, destino B,
   dia, até (vários dias), hora, o que vai fazer e situação. Sem obra e sem etapa.
6. Entra a aba **Documento**, uma linha por caminhão: número do documento, se tem seguro,
   vencimento do documento e vencimento do seguro.
7. No Painel Deconto (tela inicial), entra o cartão **Monitoramento de Frota**, "Em breve".

Gráficos e indicadores por empresa **não** entram aqui: vão para o trabalho 2 (relatórios no
Painel Deconto).

## Como: caminho escolhido

**Reaproveitar o Km.** A coleção `km` e a aba "Km das obras" viram a Operação.

- Considerado: cadastro novo `operacoes`, separado do km. Fica mais limpo por dentro, mas
  Relatório, Painel e avisos teriam que ser religados, e o km já lançado sumiria dos relatórios.
  O dobro de trabalho e mais risco. Descartado.
- Considerado: só esconder as abas. Não serve: Agenda, Painel e Relatório continuariam pedindo obra.

## Desenho

### Dados (registros novos; nada antigo é apagado)

- `km` (Operação): `data, caminhaoId, motoristaId, cliente, destinoA, destinoB, valor, pago,
  kmInicial, kmFinal, horimetroInicial, horimetroFinal, obs`.
  Registro antigo continua valendo: `obraId`, `etapa`, `dataFim`, `modo` e `horas` são lidos
  quando existirem.
- `agenda`: `data, dataFim, hora, caminhaoId, motoristaId, cliente, destinoA, destinoB, servico,
  situacao, obs`. Registro antigo com `obraId` continua aparecendo.
- `documentos` (coleção nova, uma por caminhão): `caminhaoId, numero, temSeguro, vencDocumento,
  vencSeguro, obs`.
- `obras` continua carregada só para mostrar os registros antigos. Ninguém cria nem edita mais.

Regra de exibição única, usada em todo lugar que hoje mostra a obra: **cliente · destino A →
destino B**. Num registro antigo sem cliente, mostra o nome da obra.

### Aba Operação (era "Km das obras")

- Formulário: data, caminhão, motorista, cliente, destino A, destino B, valor (R$), pago (sim/não),
  km inicial, km final, horímetro inicial e final, observação.
- Sai o "por dia / por etapa": a operação é de um dia.
- Cliente e destinos têm sugestões com os nomes já usados (sem cadastro à parte).
- Motorista, cliente e destinos vêm do agendamento daquele caminhão naquele dia. O km inicial
  vem do último km final, como hoje. O horímetro inicial vem do último horímetro final.
- Horímetro aparece quando a operação marca **Usou o munck? Sim**, em qualquer caminhão
  (mudança de 2026-11-28; antes dependia do campo Munck do cadastro). Com Sim, inicial e final
  são obrigatórios.
- Ao salvar, o agendamento do dia fica "Feito", como hoje.
- Lista com filtros (caminhão, cliente, mês, pago / a receber). Colunas: data, caminhão,
  motorista, cliente e destinos, km rodados, horas, valor e pago. Totais: km, horas, valor e
  a receber.

### Agenda de operação

- O mesmo quadro da semana e a mesma lista. No formulário, obra e etapa viram cliente, destino A
  e destino B. O filtro "obra" vira "cliente".

### Aba Documento

- Tabela com todos os caminhões: placa, número do documento, tem seguro, vencimento do documento,
  vencimento do seguro e situação (em dia, vence em 30 dias, vencido). Botão "Preencher" ou
  "Editar" abre o formulário já com aquele caminhão.
- Um registro por caminhão: o formulário não deixa criar um segundo para o mesmo caminhão.
- Vencimento do seguro só é pedido quando "tem seguro" = sim.

### Painel (aba do Controle)

- Os cartões dos caminhões mostram a operação do dia (cliente e destinos) no lugar da obra.
- O indicador "Obras em andamento" vira **"A receber"**: a soma das operações não pagas.
- Avisos: sai "obra passou da previsão". "Falta o km" vira "falta lançar a operação". Entram
  "documento vencido / vence em 30 dias" e "seguro vencido / vence em 30 dias".

### Relatório e Excel

- A tabela e o gráfico "Por obra" viram **"Por cliente"**, com km, horas, operações, valor e
  a receber. Nos números do topo entram **Faturado** e **A receber**.
- No Excel, as abas "Obras" e "Km por obra" dão lugar a **"Operações"** e **"Documentos"**. A aba
  "Agenda" passa a ter cliente e destinos.

### Painel Deconto (servidor)

- `painel/servidor/sistemas.js`: descrição nova do Controle de Operação; `extras` sem
  `mapa-sul.json`; `cols` com `documentos` (e `obras` continua, para não perder os dados antigos);
  cartão novo `monitoramento` ("Monitoramento de Frota", pronto: false).
- `montar-pacote.sh` e o workflow param de levar `mapa-sul.json`. O `munck/mapa-sul.json` e o
  `munck/mapa/` saem do repositório.

## Fora do escopo (não fazer)

- Gráficos e indicadores por empresa (trabalho 2).
- PDF do documento ou da apólice (o Controle não guarda arquivos).
- Data do pagamento, nota fiscal, cadastro de clientes à parte.
- Apagar ou converter os dados antigos de obras e km.

## Cuidados

- **Publicar mexe na produção:** o workflow `painel-deconto.yml` roda em push de **qualquer**
  branch e troca o pacote da release `painel-deconto`. Só fazer push quando estiver testado.
- Atualizar a VM: rodar de novo o instalador no console. Ele mantém os dados e a senha.
  O console da Locaweb não recebe Shift/Ctrl de mim, então quem digita ou cola o comando é o dono.
- `painel/testes/servidor.test.js` usa `documentos` como coleção que a operação **não** tem
  (linha 166) e testa o `mapa-sul.json`. Esses testes mudam junto.

## Decisões minhas (pode corrigir)

- Horímetro com **inicial e final** (o sistema calcula as horas), igual ao km.
- "A receber" no lugar de "Obras em andamento" no Painel do Controle.
- Faturado e A receber no Relatório do Controle.
- Documento guardado numa coleção nova, um por caminhão, em vez de campos no cadastro do caminhão.

## Tarefas

Trabalho 1 (este documento):
- [x] Servidor: `sistemas.js` (descrição, extras, `documentos`, cartão Monitoramento de Frota)
- [x] Tirar abas Mapa e Obras e o código delas; tirar `mapa-sul.json` do pacote
- [x] Aba Operação (era Km das obras): campos novos, horímetro só para munck, filtros e totais
- [x] Agenda de operação: cliente e destinos no lugar de obra e etapa
- [x] Aba Documento e avisos de vencimento
- [x] Painel do Controle: cartões, "A receber" e avisos
- [x] Relatório e Excel: por cliente, faturado, a receber, abas Operações e Documentos
- [x] Testes de servidor e de tela atualizados e passando
- [x] README do munck atualizado
- [x] Publicar (push) e atualizar a VM

Depois (trabalho 2):
- [ ] Relatórios no Painel Deconto juntando DECONTO e Controle de Operação: índices do mês,
      caminhões, combustível, manutenção e operações, separados por empresa
- [ ] Definir as empresas e ligar cada caminhão a uma empresa
- [ ] Monitoramento de Frota (integração futura)

Feito depois do trabalho 1 (2026-11-28):
- [x] Operação: "Usou o munck?" mostra o horímetro em qualquer caminhão
- [x] Carga no servidor: 18 veículos, 2 semirreboques e 20 CRLVs no DECONTO; 11 caminhões no Controle
- [x] Endereço provisório https://deconto.sinistravistorias.com.br (o firewall da empresa bloqueia sslip.io)
- [ ] Destino A e B puxando a cidade (plano `docs/superpowers/plans/2026-11-28-destino-cidade.md`)
- [ ] Pesquisa de sistemas de frota do mercado → lista de funções para trazer

Depois (trabalho 3):
- [ ] Sistema de RH (o cartão "RH" do Painel): controle de funcionários, banco de horas,
      salário, férias e 13º
- [ ] Ponto pelo celular: o funcionário registra o ponto, o sistema pega a localização e uma
      foto, e tudo vai para o RH

Depois (trabalho 4):
- [ ] O Painel Deconto vira o painel do administrador
- [ ] Cada sistema com o seu subdomínio (ex.: `operacao.…sslip.io`), para a equipe entrar direto
      no sistema dela sem passar pelo Painel Deconto

Depois (trabalho 5) — Controle de Estoque (pedido em 2026-11-28):
- [ ] Estoque geral: todo o material da empresa, com entradas, saídas (baixa) e saldo
- [ ] Depósito de diesel: quantos litros tem; o abastecimento lançado no DECONTO dá baixa no tanque
- [ ] Aviso de quando precisa comprar diesel (nível mínimo do tanque)
- [ ] Pneus: estoque e ligação com os caminhões
