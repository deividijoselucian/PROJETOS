# Ponto Deconto como app, com CPF e senha — design curto

**Data:** 2026-11-28 · Muda a fase 1 do RH (`2026-11-28-rh-ponto-design.md`).

## Pedido do dono
"Tem que gerar algo que eu logue pelo celular e obrigue mandar a localização e tirar foto";
"o link tem que ser todo um app". Escolha do dono: **CPF e senha, com ícone de app**.

## O que muda
1. **App "Ponto Deconto"** em `/ponto/` (ex.: `https://deconto.sinistravistorias.com.br/ponto/`),
   instalável no celular: Android/Chrome mostra "Instalar app"; iPhone "Adicionar à Tela de Início".
   Abre em tela cheia com ícone próprio (PWA: manifest + service worker simples; não registra sem
   internet). A tela de entrada ensina a instalar.
2. **Login com CPF e senha** (só funcionário ativo).
   - O RH define a **senha inicial** no cadastro (ou "Gerar senha" na central) e passa ao funcionário.
   - No **primeiro acesso**, o app obriga a trocar a senha (mínimo 6 caracteres).
   - Fica **logado no celular** (sessão própria do ponto, longa, ~180 dias); não abre o Painel,
     DECONTO, Controle nem a central do RH.
   - 5 senhas erradas seguidas → espera 15 minutos.
   - Na central: **"Trocar senha"** (nova senha inicial) e **"Sair de todos os celulares"**.
   - Funcionário desligado: sessão para de valer na hora.
3. **Foto obrigatória tirada na hora:** câmera da frente ao vivo dentro do app (prévia + botão
   "Tirar foto"); **não há opção de galeria**. Sem permissão da câmera, não registra e mostra como
   liberar.
4. **Localização obrigatória:** pede GPS de alta precisão na hora do registro; sem permissão ou sem
   sinal, não registra e mostra como liberar. Guarda a precisão (metros).
5. **O link pessoal sai:** as rotas `/ponto/<token>` deixam de valer; a central troca "Copiar link"
   por "Senha inicial" e mostra o endereço do app para mandar ao funcionário.

## Continua igual
Hora do servidor (fuso de Xanxerê), entrada/saída alternando, bloqueio de duplo toque, limite por
dia, foto até 3 MB JPEG/PNG conferida pelo servidor, central, correção com justificativa, relatório
do mês. "Controle interno de ponto".

## Limites que o dono precisa saber
- App de GPS falso no celular ainda pode enganar a localização; a foto e a precisão ajudam o RH a
  desconfiar. Bloquear isso de verdade só com app nativo (Play Store/App Store), fora desta fase.
- Precisa de https (já tem).
