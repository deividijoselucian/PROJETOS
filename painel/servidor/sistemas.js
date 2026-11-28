'use strict';
/* Sistemas do Painel Deconto, na ordem da tela inicial.
   pronto: false = cartão "Em desenvolvimento" (ainda não abre).
   Sistema novo: uma linha aqui e a página em publico/<pagina>. */
module.exports = [
  {
    id: 'frota', numero: 1, nome: 'DECONTO', pronto: true,
    descricao: 'Frota: km do dia, abastecimento, manutenção, documentos com vencimento e relatório.',
    pagina: 'frota.html', arquivos: true, extras: [], cor: '#1C47B5',
    cols: ['caminhoes', 'semirreboques', 'motoristas', 'dias', 'abastecimentos', 'manutencoes', 'trocas', 'documentos', 'config'],
  },
  {
    id: 'operacao', numero: 2, nome: 'Controle de Operação', pronto: true,
    descricao: 'Caminhões munck: agenda de operação, operações, documentos, manutenção e relatório.',
    pagina: 'operacao.html', arquivos: false, extras: [], cor: '#5B3FD6',
    // obras: só para mostrar os registros antigos (não se cria mais obra)
    cols: ['caminhoes', 'motoristas', 'obras', 'agenda', 'km', 'manutencoes', 'documentos', 'config'],
  },
  {
    id: 'rh', numero: 3, nome: 'RH', pronto: true,
    descricao: 'Ponto pelo celular com foto e local, registros de cada dia e relatório do mês para a contabilidade.',
    pagina: 'rh.html', arquivos: true, extras: [], cor: '#0B7550',
    // soServidor: só o servidor grava (o ponto do celular, a correção com justificativa e o link novo)
    cols: ['funcionarios', 'pontos', 'links'], soServidor: ['pontos', 'links'],
  },
  { id: 'financeiro', numero: 4, nome: 'Financeiro', pronto: false, descricao: 'Em desenvolvimento.', cor: '#8A5300', cols: [] },
  { id: 'cargas', numero: 5, nome: 'Cargas', pronto: false, descricao: 'Em desenvolvimento.', cor: '#BA2E29', cols: [] },
  { id: 'monitoramento', numero: 6, nome: 'Monitoramento de Frota', pronto: false, descricao: 'Em desenvolvimento.', cor: '#0E7490', cols: [] },
  {
    id: 'estoque', numero: 7, nome: 'Estoque', pronto: true,
    descricao: 'Materiais, pneus e tanques de diesel: compras, saídas, medições, saldo e avisos. Ligado ao DECONTO e ao Controle.',
    pagina: 'estoque.html', arquivos: false, extras: [], cor: '#4D7C0F',
    // o saldo não é guardado: o servidor calcula (estoque.js) com o Abastecimento e as Manutenções dos outros
    cols: ['materiais', 'movimentos'],
  },
];
