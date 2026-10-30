# Arquitetura — NFT Marketplace

## Estado e referências

O [enunciado](docs/plan/requisitos.md) define o escopo. O [plano](docs/plan/implementacao.md) registra execução e evidências; a [matriz de aceite](docs/acceptance.md) rastreia os critérios. A implementação começa pela fundação e pelos contratos. As fases posteriores continuam pendentes até sua validação.

O primeiro marco implementou leitura de catálogo/detalhe, filtros combinados, URL/histórico, cancelamento e cenários de falha. O segundo implementou conta/sessão, perfil/avatar/senha, carteiras e favoritos. A Fase 5 implementou carrinho, cotações, checkout e pedidos persistentes/idempotentes. A Fase 6 integra `socket.io-client` ao transporte WebSocket interceptado pelo MSW, eventos de NFTs/pedidos e reconciliação REST. O registro de execução e os resultados de validação estão em [verificações de tempo real](docs/verification-realtime.md); implementação e prova de transporte não equivalem ao aceite final do desafio.

A [inspeção do design](docs/design-audit.md) começou com o acesso ao Figma bloqueado. O usuário disponibilizou 15 PNGs em `prototype/`, agora usados como referência de composição, paleta escura/cobre e marca Kurio. Os valores exatos dos estilos, a família tipográfica e os assets individuais ainda precisam de exportação. A fonte de sistema monoespaçada e as artes geométricas locais são substituições provisórias; não há aceite de fidelidade visual.

O usuário confirmou para o título desktop 43 px, peso 700, altura de linha 70 px e espaçamento entre letras zero; esses valores já estão aplicados. A referência `font/family` ainda precisa ser resolvida para o nome da fonte.

## Decisões iniciais

- Aplicação cliente React + TypeScript em modo estrito, com Vite e npm/lockfile. Node.js 24 LTS; nenhuma dependência de backend privado.
- TanStack Router com árvore de rotas tipada definida em código. Estado de busca, filtros, ordenação e página pertence à URL, validado na fronteira da rota. Fluxos privados terão proteção e destino de retorno validado como caminho interno.
- TanStack Query gerencia estado remoto; Axios é o único cliente REST. `AbortSignal` da consulta atravessa o transporte. Componentes não incluem fixtures nem caminhos alternativos de negócio.
- Tailwind CSS com variáveis semânticas e componentes shadcn/ui locais. A troca dos tokens provisórios pelos tokens observados no Figma não deve alterar a lógica de negócio.
- MSW intercepta a rede no desenvolvimento, na demonstração e nos testes. Ativação explícita por `VITE_ENABLE_MOCKS`; aguardar inicialização antes de renderizar a aplicação. Fixtures e persistência pertencem exclusivamente a `src/mocks/`.
- Socket.IO usa `socket.io-client` 4.8.4 com transporte WebSocket e binding local MSW baseado nos parsers oficiais Engine.IO/Socket.IO. Eventos recebidos pelo cliente atualizam o estado remoto; controles da simulação operam no backend MSW e enviam os pacotes pela rede interceptada.
- Playwright usa Chromium em 390, 768 e 1440 px, estado isolado, HTML e traces de falhas. Baselines visuais definitivas só serão geradas após acesso ao Figma e fluxos estáveis.

## Organização

```text
src/
  app/            # providers, router e composição
  components/ui/  # componentes shadcn/ui adaptáveis por tokens
  contracts/      # DTOs REST e envelopes de eventos compartilhados
  features/       # telas, consultas e mutations por recurso
  lib/            # transporte, cache, ambiente e precisão ETH
  mocks/          # fixtures, banco simulado, cenários e handlers MSW
  styles/         # tokens e estilos globais
tests/e2e/        # testes pela interface e pela rede simulada
docs/             # aceite, design, contratos e evidências
```

## Invariantes dos contratos

Os [contratos REST e de eventos](docs/api-contracts.md) descrevem endpoints e invariantes compartilhados. ETH trafega como string decimal. Cálculos monetários usam unidades inteiras `bigint` (wei), sem conversão para `number`; quantidades são inteiros positivos. O servidor simulado fornece cotação versionada, também ao visitante, e snapshot imutável do pedido. A validade da cotação é conferida novamente ao criar o pedido; uma mudança exige revisão e confirmação explícita.

A criação de pedido usa `Idempotency-Key`, vinculada ao usuário e ao conteúdo da tentativa. Repetir conteúdo/chave recupera o mesmo pedido; conteúdo diferente com a mesma chave retorna conflito. Timeout não implica compra recusada. O cliente persiste a tentativa e recupera o pedido por consulta ou repetição idempotente. Somente o estado confirmado habilita o recibo de sucesso. Confirmado/recusado são terminais.

O banco de conta MSW é versionado e persistido em `kurio:mock-account-db:v1`, com dois usuários e dados distintos. Operações usam fila local e Web Locks para transações entre abas; cada transação relê o storage dentro do lock e só publica um draft persistido. Sem Web Locks, a garantia de atomicidade é restrita à aba. Os testes unitários simulam duas instâncias, concorrência, alterações externas e rollback. Senhas usam Web Crypto PBKDF2/SHA-256, 100 mil iterações, derivação de 256 bits e sal aleatório de 128 bits por usuário; não são persistidas em claro.

Sessão usa cookie opaco `nft_session` e expiração em uma hora. O servidor simulado captura o principal no início do request e revalida token/dono/validade dentro da transação, incluindo após latência artificial. Perfil, avatar, senha, favoritos e carteiras são privados. As conexões de carteira são temporárias, vinculadas ao usuário/token/carteira/rede, com recusa e desconexão simuladas. Edição da carteira revoga conexões anteriores; troca de senha revoga outras sessões e todas as conexões, preservando a sessão que confirmou a troca.

Cookies do MSW em navegador não são HttpOnly, e o banco fica acessível ao usuário local: limitações exclusivas da simulação. Um backend real exigiria cookies HttpOnly/Secure e autenticação no servidor. As credenciais são públicas e fictícias.

## Carrinho, cotação e pedidos

O campo opcional `commerce` estende a mesma base versionada sem apagar contas existentes. Sua inicialização clona o catálogo inicial; todos os endpoints de leitura e compra usam esse catálogo compartilhado. Carrinhos, cotações, pedidos e índices de idempotência participam das mesmas transações de conta. Uma falha de validação não publica alterações parciais.

O visitante recebe cookie opaco `nft_cart` por 90 dias, criado antes de requests iniciais concorrentes. Login/cadastro fundem o carrinho visitante na conta dentro da transação: somam NFT/edição, limitam por estoque, registram ajustes persistentes e preservam o cupom da conta quando existente. A identidade visitante é aposentada para impedir que escritas atrasadas recriem o carrinho já transferido. Somente uma leitura posterior renova um cookie aposentado para um novo carrinho vazio; uma mutation com identidade antiga recebe conflito.

Cotação dura 60 segundos. O cupom `KURIO10` calcula `subtotalWei / 10n`, com arredondamento para baixo; `EXPIRED` e códigos desconhecidos retornam erros distintos. Taxas iniciais por rede são 0.016 ETH em Ethereum e 0.001 ETH em Sepolia. Na confirmação, API revalida dono/sessão, versão do carrinho, validade/consumo da cotação, preço/versão/estoque de cada edição, cupom, taxa e conexão da carteira vinculada à conta/token/rede. Repetição de chave/conteúdo é resolvida antes dessas validações de cotação, permitindo recuperar um pedido mesmo após a cotação expirar ou ser consumida.

A interface consulta uma cotação nova antes da revisão e da confirmação. O comparador considera itens/versões/quantidades, cupom, rede e valores; ignora apenas ID e expiração da cotação recém-criada. Mudanças, inclusive redução de preço/taxa, invalidam o consentimento anterior. O rascunho e a tentativa ficam no `sessionStorage` por usuário. Antes do primeiro POST, a tentativa guarda chave e corpo; se a persistência falhar, a interface bloqueia o envio. Timeout de 1,2 s consulta por chave e permite repetir somente o mesmo corpo/chave. Refresh ou reautenticação retoma a tentativa sem iniciar outra compra.

Pedidos começam pendentes e guardam o instante elegível de processamento (900 ms no cenário padrão). Um timer da camada de mocks antecipa a entrega ao socket; consultas REST também podem concluir a simulação. A conexão retoma o agendamento de pedidos persistidos, de modo que a correção não depende de um timer sobreviver ao refresh. No cenário `pending`, somente o controle autenticado de conclusão avança o pedido. Estoque insuficiente, recusa ou conexão revogada produzem estado terminal recusado sem remover itens. Confirmação diminui estoque exatamente uma vez e emite referência local explicitamente simulada. Não existe extensão de carteira ou transação blockchain real.

O recibo usa exclusivamente o snapshot do pedido: NFT/edição/imagem, quantidades, preços, dados do colecionador, carteira/rede, cupom e totais. Metadados internos de alocação acompanham quantas unidades do pedido ainda estão no carrinho. Reduções/remoções ajustam essa alocação; novas adições não a aumentam. Confirmar subtrai apenas o saldo alocado e ajusta a sobreposição de outros pedidos pendentes. Assim, comprar 2, reduzir para 1 e adicionar 1 preserva a unidade nova após confirmar; snapshot e redução de estoque continuam em 2. Registros anteriores sem alocação usam o snapshot como ponto inicial.

## Cache, sessão e sincronização

Consultas públicas incluem todos os filtros e a página na chave. Consultas privadas incluem o identificador do usuário. Valores iniciais: `staleTime` de 30 s, `gcTime` de 5 min, atualização ao foco/reconexão e no máximo uma repetição apenas para falhas transitórias de consulta. Erros 4xx não repetem. Mutations não repetem automaticamente; pedidos só podem ser reenviados com a mesma chave de idempotência.

O módulo de sessão integra o store de apresentação à consulta REST via TanStack Query. Chaves privadas são `['private', userId, scope, recurso]`; cada autenticação, logout e expiração muda o ciclo, cancela queries e remove queries/mutations privadas anteriores. Callbacks e mutations verificam ciclo/usuário antes de enviar ou publicar dados. O interceptor Axios captura o ciclo de cada request e só trata 401 da sessão atual; erros de credenciais não expiram outra sessão.

Login/cadastro/logout compartilham uma fila para evitar Set-Cookie fora de ordem. Dados privados ficam suspensos desde o início da operação até sua conclusão. Somente a última intenção publica sessão; se ela falhar após sucesso de uma operação superada, a fila consulta a sessão REST diretamente e reconcilia cookie/store antes de liberar dados privados. Se essa reconciliação falhar, o cliente fica anônimo. `refreshSession` aguarda a fila estabilizar, sem deadlock na recuperação interna.

Rotas de perfil/carteiras/favoritos/checkout/pedidos revalidam sessão em `beforeLoad`; o shell também bloqueia dados privados ao perder autorização. Expiração durante alteração retorna ao login com caminho interno validado, preservando query/hash do destino e o rascunho de checkout da conta. Os testes rejeitam URLs externas, barras invertidas e separadores codificados. Reconexão/visibilidade e alterações no banco de outra aba consultam a sessão novamente; listeners do shell são removidos no unmount. O ciclo de conexão Socket.IO acompanha a identidade e o `scope` da sessão.

Carrinho visitante também usa uma chave no namespace privado, com identidade `guest` e ciclo de sessão; isso permite cancelar/remover dados na autenticação. Queries e mutations de comércio verificam ciclo/dono antes do envio e antes de publicar. Carrinho preserva a maior versão do mesmo ID; cotação inclui a versão do NFT na chave. Pedido verifica owner/ID/versão e conserva o estado terminal já conhecido. A interface não usa confirmação otimista. Ao receber estado terminal, o recibo limpa a tentativa correspondente, libera a conexão e invalida os recursos ativos; apenas confirmação limpa o rascunho.

O carrinho mantém consulta REST a cada 2 s e o pedido pendente a cada 500 ms como recuperação complementar. Uma falha conserva o último pedido visível e permite nova consulta; refresh continua buscando o mesmo ID. Essas consultas não são usadas como substitutas do transporte Socket.IO: a camada de eventos também recebe os pacotes reais do cliente e atualiza/invalida os recursos ativos.

Favoritos usam mutation otimista, cancelamento da consulta, snapshot e rollback em falha; alterações concorrentes na mesma sessão são desabilitadas durante a mutation. Retorno da API e invalidação pertencem ao ciclo ativo. O cenário de erro 503 comprova o estado antecipado, o rollback e a nova tentativa. Perfil/carteiras preservam a maior versão conhecida no cache após respostas de leitura/escrita e mantêm os formulários durante falhas de atualização em segundo plano.

## Transporte e reconciliação em tempo real

O bootstrap em `src/main.tsx` aguarda a inicialização do MSW e só então importa dinamicamente o router e o grafo da aplicação. Essa ordem é necessária porque o Engine.IO captura o construtor `WebSocket` durante a avaliação do módulo: importar o cliente antes do interceptor preservaria a implementação nativa e contornaria o mock. Falha na inicialização continua exibindo um erro, sem dados alternativos na interface.

`src/mocks/realtime/protocol.ts` implementa o binding para Engine.IO v4 e Socket.IO no namespace padrão `/`, com frames de texto sobre WebSocket. Usa `engine.io-parser` 5.2.3 e `socket.io-parser` 4.2.7; o cliente é `socket.io-client` 4.8.4. Não há fallback de transporte por HTTP polling, namespaces personalizados, acknowledgements ou anexos binários. O binding publicado `@mswjs/socket.io-binding` 0.2.0 declara compatibilidade com MSW 2 e não é instalado com peers forçados no projeto MSW 3. O binding local realiza abertura da sessão, autenticação de namespace, framing, ping/pong e fechamento; heartbeat envia ping a cada 25 s e fecha por ausência de pong após 10 s.

Durante o cenário offline, a abertura Engine.IO é concluída e a conexão é fechada ao primeiro frame, sem autorizar o namespace. Isso permite que o Manager inicie outra tentativa; fechar antes da abertura o deixava aguardando o timeout padrão de 20 s.

O cliente conecta na mesma origem com `path: '/socket.io'`, `transports: ['websocket']`, `forceNew: true` e `auth: {userId, scope}`. O mock captura `nft_session` na conexão e resolve o principal pelo banco: `userId` informado pelo cliente deve coincidir, mas não concede autorização. Visitantes recebem somente eventos públicos de NFT. Cada envio revalida sessão/expiração e dono do pedido. Atrasos capturam os sockets destinatários existentes ao serem agendados; uma entrega não migra para a conexão de outra sessão. Ao encerrar o ciclo, o cliente remove listeners, desconecta o socket, limpa listeners do Manager e descarta o ledger privado. Timers/decoders do binding são liberados ao fechar a conexão.

Transações em `src/mocks/realtime/events.ts` coletam alterações de versão do catálogo e dos pedidos, persistem o banco e só depois publicam envelopes. A liquidação também emite alterações do estoque compartilhado. O histórico de até 256 envelopes fica em memória para controles de replay/duplicação/ordem e desaparece no refresh/reset; não representa fila durável de mensagens. A entrega ao cliente não tem replay garantido.

O cliente valida envelope e payload em runtime: tipo, ID do evento, recurso, versão, data, campos do NFT/pedido e usuário do pedido. O ledger de recursos conserva a maior versão conhecida pelo socket ou REST. IDs duplicados são descartados; versões menores ou iguais não substituem o recurso; pedidos terminais não retrocedem mesmo com versão maior e seu snapshot permanece fixo. O conjunto de IDs é limitado a 1000, mantendo a proteção por versão/terminal após a remoção de IDs antigos. Os helpers de leitura REST preservam o mesmo limite de versão para impedir que uma resposta atrasada sobrescreva o evento mais recente.

`nft.updated` atualiza detalhe/carrinho conhecidos e invalida catálogo, carrinho e cotação. A lista de catálogo volta ao REST para respeitar filtro, ordenação e paginação; não é reordenada com patches isolados. O checkout anuncia mudanças e invalida a revisão também por ID/versão/cupom do carrinho e versões dos NFTs, inclusive quando o REST observa a mudança antes do evento ou recupera um evento perdido. Uma mudança durante a consulta de confirmação é checada novamente antes do POST. `order.updated` só publica na chave do dono/ciclo ativos e conserva estado terminal; os efeitos já existentes do recibo continuam executados uma vez.

Em toda conexão e reconexão, `RealtimeLifecycle` consulta a sessão, verifica se o ciclo ainda é atual, cancela leituras anteriores e invalida/refaz via REST os recursos ativos públicos e privados desse ciclo. Assim, eventos perdidos não deixam o cliente dependente de replay. A tela informa conexão/interrupção, e a recuperação consulta o pedido existente, preservando a tentativa/chave; nenhuma reconexão inicia outra compra.

## Demonstração e deploy

MSW 3 intercepta catálogo, recursos de conta/compra e o WebSocket, mantendo fixtures iniciais em `src/mocks/fixtures.ts`, banco/handlers de conta em `src/mocks/account/`, regras de comércio em `src/mocks/commerce/` e protocolo/eventos/controles em `src/mocks/realtime/`. Cenários de leitura, conta, comércio e o estado de interrupção do socket persistem em sessionStorage. Reset HTTP restaura contas, senhas derivadas, favoritos, carteiras, sessões, conexões, catálogo, carrinhos, cotações, cupons, pedidos e cenários; limpa histórico/timers/entregas de eventos e fecha conexões. Depois do reset, recarregar a página reinicializa o cache/ledger público e o snapshot da aplicação, pois as versões das fixtures voltam ao início. Rascunhos/tentativas locais do checkout são independentes desse reset da API. Requests inesperados em `/api` são erros, enquanto assets locais podem passar pela rede. A discriminação HTTP usa `HttpNetworkFrame` de `msw/experimental`, fixado pelo lockfile; revisar essa integração ao atualizar MSW.

Rotas de autenticação, conta, carrinho, checkout e pedido carregam seus componentes sob demanda. Isso evita incluir todos os formulários no chunk inicial; o build não mascara avisos alterando limites de tamanho. Ainda não existe resultado Lighthouse para afirmar cumprimento das metas.

Os scripts `dev` e `build` usam o modo Vite `demo` e a configuração versionada `.env.demo`. `VITE_ENABLE_MOCKS=false` desativa a simulação; não há fallback de fixtures na UI. O bootstrap aguarda o service worker e apresenta erro se ele não iniciar.

O primeiro marco é local. O deploy público previsto no enunciado ocorre na Fase 8, após os fluxos, testes e auditorias. Proposta inicial: hospedagem estática do `dist/` com fallback de rotas para `index.html` (Vercel ou equivalente). O build de demonstração deverá incluir worker MSW e eventos simulados, sem serviço privado. Provedor, repositório remoto e URL pública ainda não estão definidos.

Lighthouse será executado contra build otimizado, três medições por página/perfil em início e detalhe. Relatórios devem registrar versões, ambiente, medianas, LCP/CLS/TBT e causas de metas não atingidas. Não há resultados de auditoria nesta etapa.

## Limitações acompanhadas

- PNGs desktop/mobile disponíveis; arquivo Figma, fontes e assets individuais ainda ausentes. Fundação visual sujeita a refinamento.
- Não confundir configuração de uma ferramenta com implementação de todos os fluxos que a utilizam.
- Contratos, handlers, sessões, compra e eventos só terão status concluído após implementação e verificações registradas no plano.
- Tempo real usa binding local limitado ao namespace padrão e eventos de texto; não oferece acknowledgements, binário, HTTP polling, servidor remoto ou replay durável. Histórico de eventos e agendamento vivem na aba; REST e os dados persistidos permitem reconciliação após refresh.
- Login/cadastro têm rotas próprias neste marco; o overlay desktop do protótipo ainda não foi reproduzido. Não há login social.

## Fontes técnicas

- [Vite: configuração inicial](https://vite.dev/guide/).
- [TanStack Router: configuração e rotas tipadas](https://tanstack.com/router/latest/docs/quick-start).
- [shadcn/ui: instalação manual](https://ui.shadcn.com/docs/installation/manual).
- [Socket.IO: opções do cliente](https://socket.io/docs/v4/client-options/).
- [Engine.IO v4: protocolo](https://github.com/socketio/engine.io-protocol).
- [Socket.IO: protocolo](https://github.com/socketio/socket.io-protocol).
- [MSW: WebSocket](https://mswjs.io/docs/websocket/).
