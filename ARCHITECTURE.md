# Arquitetura — NFT Marketplace

## Estado e referências

O [enunciado](docs/plan/requisitos.md) define o escopo. O [plano](docs/plan/implementacao.md) registra execução e evidências; a [matriz de aceite](docs/acceptance.md) rastreia os critérios. A implementação começa pela fundação e pelos contratos. As fases posteriores continuam pendentes até sua validação.

O primeiro marco implementou leitura de catálogo/detalhe, filtros combinados, URL/histórico, cancelamento e cenários de falha. O segundo implementa conta/sessão, perfil/avatar/senha, carteiras e favoritos. Carrinho, cotações, compra, pedidos e eventos continuam pendentes; a presença de seus DTOs não indica disponibilidade dos endpoints.

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

Os [contratos REST e de eventos](docs/api-contracts.md) descrevem endpoints e invariantes compartilhados. ETH trafega como string decimal. Cálculos monetários usam unidades inteiras `bigint` (wei), sem conversão para `number`; quantidades são inteiros positivos. O servidor simulado fornecerá cotação versionada, também ao visitante, e snapshot imutável do pedido. A validade de uma cotação será conferida novamente ao criar o pedido; uma mudança exige revisão e confirmação explícita.

A criação de pedido usa `Idempotency-Key`, vinculada ao usuário e ao conteúdo da tentativa. Repetir conteúdo/chave recupera o mesmo pedido; conteúdo diferente com a mesma chave retorna conflito. Timeout não implica compra recusada. O cliente persiste a tentativa e recupera o pedido por consulta ou repetição idempotente. Somente o estado confirmado habilita o recibo de sucesso. Confirmado/recusado são terminais.

O banco de conta MSW é versionado e persistido em `kurio:mock-account-db:v1`, com dois usuários e dados distintos. Operações usam fila local e Web Locks para transações entre abas; cada transação relê o storage dentro do lock e só publica um draft persistido. Sem Web Locks, a garantia de atomicidade é restrita à aba. Os testes unitários simulam duas instâncias, concorrência, alterações externas e rollback. Senhas usam Web Crypto PBKDF2/SHA-256, 100 mil iterações, derivação de 256 bits e sal aleatório de 128 bits por usuário; não são persistidas em claro.

Sessão usa cookie opaco `nft_session` e expiração em uma hora. O servidor simulado captura o principal no início do request e revalida token/dono/validade dentro da transação, incluindo após latência artificial. Perfil, avatar, senha, favoritos e carteiras são privados. As conexões de carteira são temporárias, vinculadas ao usuário/token/carteira/rede, com recusa e desconexão simuladas. Edição da carteira revoga conexões anteriores; troca de senha revoga outras sessões e todas as conexões, preservando a sessão que confirmou a troca.

Cookies do MSW em navegador não são HttpOnly, e o banco fica acessível ao usuário local: limitações exclusivas da simulação. Um backend real exigiria cookies HttpOnly/Secure e autenticação no servidor. As credenciais são públicas e fictícias. O cookie do carrinho visitante e sua fusão na autenticação ainda não estão implementados.

## Cache, sessão e sincronização

Consultas públicas incluem todos os filtros e a página na chave. Consultas privadas incluem o identificador do usuário. Valores iniciais: `staleTime` de 30 s, `gcTime` de 5 min, atualização ao foco/reconexão e no máximo uma repetição apenas para falhas transitórias de consulta. Erros 4xx não repetem. Mutations não repetem automaticamente; pedidos só podem ser reenviados com a mesma chave de idempotência.

O módulo de sessão integra o store de apresentação à consulta REST via TanStack Query. Chaves privadas são `['private', userId, scope, recurso]`; cada autenticação, logout e expiração muda o ciclo, cancela queries e remove queries/mutations privadas anteriores. Callbacks e mutations verificam ciclo/usuário antes de enviar ou publicar dados. O interceptor Axios captura o ciclo de cada request e só trata 401 da sessão atual; erros de credenciais não expiram outra sessão.

Login/cadastro/logout compartilham uma fila para evitar Set-Cookie fora de ordem. Dados privados ficam suspensos desde o início da operação até sua conclusão. Somente a última intenção publica sessão; se ela falhar após sucesso de uma operação superada, a fila consulta a sessão REST diretamente e reconcilia cookie/store antes de liberar dados privados. Se essa reconciliação falhar, o cliente fica anônimo. `refreshSession` aguarda a fila estabilizar, sem deadlock na recuperação interna.

Rotas de perfil/carteiras/favoritos revalidam sessão em `beforeLoad`; o shell também bloqueia dados privados ao perder autorização. Expiração durante alteração retorna ao login com caminho interno validado, preservando query/hash do destino. Os testes rejeitam URLs externas, barras invertidas e separadores codificados. Reconexão/visibilidade e alterações no banco de outra aba consultam a sessão novamente; listeners do shell são removidos no unmount. Checkout, carrinho e subscriptions Socket.IO ainda precisam dessa integração nas próximas fases.

Favoritos usam mutation otimista, cancelamento da consulta, snapshot e rollback em falha; alterações concorrentes na mesma sessão são desabilitadas durante a mutation. Retorno da API e invalidação pertencem ao ciclo ativo. O cenário de erro 503 comprova o estado antecipado, o rollback e a nova tentativa. Perfil/carteiras preservam a maior versão conhecida no cache após respostas de leitura/escrita e mantêm os formulários durante falhas de atualização em segundo plano.

Eventos deverão carregar ID estável, recurso, versão e, para pedidos, usuário. O cliente deverá descartar eventos repetidos/antigos e nunca regredir pedido terminal. Após reconexão, REST será a fonte de reconciliação dos recursos ativos. O banco simulado será atualizado antes da emissão; carrinho/checkout invalidarão cotação alterada. Essas integrações Socket.IO continuam pendentes.

## Demonstração e deploy

MSW 3 intercepta catálogo e os recursos de conta, mantendo fixtures de catálogo em `src/mocks/fixtures.ts` e banco/handlers privados em `src/mocks/account/`. Os seis cenários de leitura e os cenários da conta persistem em sessionStorage. Reset HTTP restaura contas, senhas derivadas, favoritos, carteiras, sessões, conexões e cenários; será ampliado às entidades de compra futuras. Requests inesperados em `/api` são erros, enquanto assets locais podem passar pela rede. A discriminação HTTP usa `HttpNetworkFrame` de `msw/experimental`, fixado pelo lockfile; revisar essa integração ao atualizar MSW.

Rotas de autenticação e conta carregam seus componentes sob demanda. Isso evita incluir todos os formulários no chunk inicial; o build não mascara avisos alterando limites de tamanho. Ainda não existe resultado Lighthouse para afirmar cumprimento das metas.

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
