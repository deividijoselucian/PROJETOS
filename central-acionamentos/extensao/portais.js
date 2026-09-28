// Portais que a extensão lê. Usado pela central e pelo serviço em segundo plano.
// "recarregar" é de quantos em quantos minutos a extensão recarrega a aba (0 = não recarrega),
// para portais cuja tela não se atualiza sozinha. Dá para mudar na central.
self.PORTAIS = {
  porto: {
    nome: 'Porto Seguro',
    url: 'https://prestador.portoseguro.com.br/pdp/iframe?menuid=PDP-00077&javax.portlet.ctx_iframe=url=https://www.portoseguro.com.br/integracaoportaldeprestadores/chaveadorReceberServicos.do?portal=2',
    tela: 'Serviços e Frota › Recebimento de Serviços',
    recarregar: 0,
    dica: 'A própria tela da Porto se atualiza a cada 90 segundos.',
  },
  tokio: {
    nome: 'Tokio Marine',
    url: 'https://tms-prestador.tokiomarine.com.br/acompanhamentoServico',
    tela: 'Acompanhamento de Serviço',
    recarregar: 2,
    dica: '',
  },
  notro: {
    nome: 'Notro Hub',
    url: 'https://hub.notro.io/#/atividades',
    tela: 'Acompanhamento',
    recarregar: 0,
    dica: 'No Notro, ligue “Atualizar a cada 30 seg” no alto da tela de Acompanhamento.',
  },
  aciona: {
    nome: 'Aciona Fácil',
    url: 'https://acionafacil.com.br/Default.aspx',
    tela: 'Meus Serviços',
    recarregar: 2,
    dica: '',
  },
};
self.ORDEM_PORTAIS = ['porto', 'tokio', 'notro', 'aciona'];
