# Arquitetura — NFT Marketplace

## Estado e referências

O [enunciado](docs/plan/requisitos.md) define o escopo. O [plano](docs/plan/implementacao.md) registra execução e evidências; a [matriz de aceite](docs/acceptance.md) rastreia os critérios. A implementação começa pela fundação e pelos contratos. As fases posteriores continuam pendentes até sua validação.

O primeiro marco implementou leitura de catálogo/detalhe, filtros combinados, URL/histórico, cancelamento e cenários de falha. O segundo implementou conta/sessão, perfil/avatar/senha, carteiras e favoritos. A Fase 5 implementa carrinho, cotações, checkout e pedidos persistentes/idempotentes. Eventos Socket.IO continuam pendentes; sua presença nos DTOs não indica transporte implementado.

A [inspeção do design](docs/design-audit.md) começou com o acesso ao Figma bloqueado. O usuário disponibilizou 15 PNGs em `prototype/`, agora usados como referência de composição, paleta escura/cobre e marca Kurio. Os valores exatos dos estilos, a família tipográfica e os assets individuais ainda precisam de exportação. A fonte de sistema monoespaçada e as artes geométricas locais são substituições provisórias; não há aceite de fidelidade visual.

O usuário confirmou para o título desktop 43 px, peso 700, altura de linha 70 px e espaçamento entre letras zero; esses valores já estão aplicados. A referência `font/family` ainda precisa ser resolvida para o nome da fonte.

## Decisões iniciais

- Aplicação cliente React + TypeScript em modo estrito, com Vite e npm/lockfile. Node.js 24 LTS; nenhuma dependência de backend privado.
- TanStack Router com árvore de rotas tipada definida em código. Estado de busca, filtros, ordenação e página pertence à URL, validado na fronteira da rota. Fluxos privados terão proteção e destino de retorno validado como caminho interno.
- TanStack Query gerencia estado remoto; Axios é o único cliente REST. `AbortSignal` da consulta atravessa o transporte. Componentes não incluem fixtures nem caminhos alternativos de negócio.
- Tailwind CSS com variáveis semânticas e componentes shadcn/ui locais. A troca dos tokens provisórios pelos tokens observados no Figma não deve alterar a lógica de negócio.
- MSW intercepta a rede no desenvolvimento, na demonstração e nos testes. Ativação explícita por `VITE_ENABLE_MOCKS`; aguardar inicialização antes de renderizar a aplicação. Fixtures e persistência pertencem exclusivamente a `src/mocks/`.
- Socket.IO deverá usar `socket.io-client` com transporte WebSocket e binding MSW compatível com o protocolo. O binding precisa ser validado antes de considerar a integração concluída; callbacks diretos na UI não substituem essa etapa.
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

Pedidos começam pendentes; consultas REST podem concluir a simulação após 900 ms. No cenário `pending`, somente o controle autenticado de conclusão avança o pedido. Estoque insuficiente, recusa ou conexão revogada produzem estado terminal recusado sem remover itens. Confirmação diminui estoque exatamente uma vez e emite referência local explicitamente simulada. Não existe extensão de carteira ou transação blockchain real.

O recibo usa exclusivamente o snapshot do pedido: NFT/edição/imagem, quantidades, preços, dados do colecionador, carteira/rede, cupom e totais. Metadados internos de alocação acompanham quantas unidades do pedido ainda estão no carrinho. Reduções/remoções ajustam essa alocação; novas adições não a aumentam. Confirmar subtrai apenas o saldo alocado e ajusta a sobreposição de outros pedidos pendentes. Assim, comprar 2, reduzir para 1 e adicionar 1 preserva a unidade nova após confirmar; snapshot e redução de estoque continuam em 2. Registros anteriores sem alocação usam o snapshot como ponto inicial.

## Cache, sessão e sincronização

Consultas públicas incluem todos os filtros e a página na chave. Consultas privadas incluem o identificador do usuário. Valores iniciais: `staleTime` de 30 s, `gcTime` de 5 min, atualização ao foco/reconexão e no máximo uma repetição apenas para falhas transitórias de consulta. Erros 4xx não repetem. Mutations não repetem automaticamente; pedidos só podem ser reenviados com a mesma chave de idempotência.

O módulo de sessão integra o store de apresentação à consulta REST via TanStack Query. Chaves privadas são `['private', userId, scope, recurso]`; cada autenticação, logout e expiração muda o ciclo, cancela queries e remove queries/mutations privadas anteriores. Callbacks e mutations verificam ciclo/usuário antes de enviar ou publicar dados. O interceptor Axios captura o ciclo de cada request e só trata 401 da sessão atual; erros de credenciais não expiram outra sessão.

Login/cadastro/logout compartilham uma fila para evitar Set-Cookie fora de ordem. Dados privados ficam suspensos desde o início da operação até sua conclusão. Somente a última intenção publica sessão; se ela falhar após sucesso de uma operação superada, a fila consulta a sessão REST diretamente e reconcilia cookie/store antes de liberar dados privados. Se essa reconciliação falhar, o cliente fica anônimo. `refreshSession` aguarda a fila estabilizar, sem deadlock na recuperação interna.

Rotas de perfil/carteiras/favoritos/checkout/pedidos revalidam sessão em `beforeLoad`; o shell também bloqueia dados privados ao perder autorização. Expiração durante alteração retorna ao login com caminho interno validado, preservando query/hash do destino e o rascunho de checkout da conta. Os testes rejeitam URLs externas, barras invertidas e separadores codificados. Reconexão/visibilidade e alterações no banco de outra aba consultam a sessão novamente; listeners do shell são removidos no unmount. Subscriptions Socket.IO continuam pendentes.

Carrinho visitante também usa uma chave no namespace privado, com identidade `guest` e ciclo de sessão; isso permite cancelar/remover dados na autenticação. Queries e mutations de comércio verificam ciclo/dono antes do envio e antes de publicar. Carrinho preserva a maior versão do mesmo ID; cotação inclui a versão do NFT na chave. Pedido verifica owner/ID/versão e conserva o estado terminal já conhecido. A interface não usa confirmação otimista. Ao receber estado terminal, o recibo limpa a tentativa correspondente, libera a conexão e invalida os recursos ativos; apenas confirmação limpa o rascunho.

Por enquanto o carrinho consulta REST a cada 2 s e o pedido pendente a cada 500 ms. Uma falha conserva o último pedido visível e permite nova consulta; refresh continua buscando o mesmo ID. Essa recuperação REST não implementa os critérios de eventos, duplicatas ou reconexão Socket.IO da Fase 6.

Favoritos usam mutation otimista, cancelamento da consulta, snapshot e rollback em falha; alterações concorrentes na mesma sessão são desabilitadas durante a mutation. Retorno da API e invalidação pertencem ao ciclo ativo. O cenário de erro 503 comprova o estado antecipado, o rollback e a nova tentativa. Perfil/carteiras preservam a maior versão conhecida no cache após respostas de leitura/escrita e mantêm os formulários durante falhas de atualização em segundo plano.

Eventos deverão carregar ID estável, recurso, versão e, para pedidos, usuário. O cliente deverá descartar eventos repetidos/antigos e nunca regredir pedido terminal. Após reconexão, REST será a fonte de reconciliação dos recursos ativos. O banco simulado será atualizado antes da emissão; carrinho/checkout invalidarão cotação alterada. Essas integrações Socket.IO continuam pendentes.

## Demonstração e deploy

MSW 3 intercepta catálogo e recursos de conta/compra, mantendo fixtures iniciais em `src/mocks/fixtures.ts`, banco/handlers de conta em `src/mocks/account/` e regras de comércio em `src/mocks/commerce/`. Cenários de leitura, conta e comércio persistem em sessionStorage. Reset HTTP restaura contas, senhas derivadas, favoritos, carteiras, sessões, conexões, catálogo, carrinhos, cotações, cupons, pedidos e cenários. Rascunhos/tentativas locais do checkout são independentes desse reset da API. Requests inesperados em `/api` são erros, enquanto assets locais podem passar pela rede. A discriminação HTTP usa `HttpNetworkFrame` de `msw/experimental`, fixado pelo lockfile; revisar essa integração ao atualizar MSW.

Rotas de autenticação, conta, carrinho, checkout e pedido carregam seus componentes sob demanda. Isso evita incluir todos os formulários no chunk inicial; o build não mascara avisos alterando limites de tamanho. Ainda não existe resultado Lighthouse para afirmar cumprimento das metas.

Os scripts `dev` e `build` usam o modo Vite `demo` e a configuração versionada `.env.demo`. `VITE_ENABLE_MOCKS=false` desativa a simulação; não há fallback de fixtures na UI. O bootstrap aguarda o service worker e apresenta erro se ele não iniciar.

O primeiro marco é local. O deploy público previsto no enunciado ocorre na Fase 8, após os fluxos, testes e auditorias. Proposta inicial: hospedagem estática do `dist/` com fallback de rotas para `index.html` (Vercel ou equivalente). O build de demonstração deverá incluir worker MSW e eventos simulados, sem serviço privado. Provedor, repositório remoto e URL pública ainda não estão definidos.

Lighthouse será executado contra build otimizado, três medições por página/perfil em início e detalhe. Relatórios devem registrar versões, ambiente, medianas, LCP/CLS/TBT e causas de metas não atingidas. Não há resultados de auditoria nesta etapa.

## Limitações acompanhadas

- PNGs desktop/mobile disponíveis; arquivo Figma, fontes e assets individuais ainda ausentes. Fundação visual sujeita a refinamento.
- Não confundir configuração de uma ferramenta com implementação de todos os fluxos que a utilizam.
- Contratos, handlers, sessões, compra e eventos só terão status concluído após implementação e verificações registradas no plano.
- A escolha do binding Socket.IO e suas limitações serão documentadas depois da prova de integração real.
- Login/cadastro têm rotas próprias neste marco; o overlay desktop do protótipo ainda não foi reproduzido. Não há login social.

## Fontes técnicas

- [Vite: configuração inicial](https://vite.dev/guide/).
- [TanStack Router: configuração e rotas tipadas](https://tanstack.com/router/latest/docs/quick-start).
- [shadcn/ui: instalação manual](https://ui.shadcn.com/docs/installation/manual).
