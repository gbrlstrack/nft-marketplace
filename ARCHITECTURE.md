# Arquitetura — NFT Marketplace

## Estado e referências

O [enunciado](docs/plan/requisitos.md) define o escopo. O [plano](docs/plan/implementacao.md) registra execução e evidências; a [matriz de aceite](docs/acceptance.md) rastreia os critérios. A implementação começa pela fundação e pelos contratos. As fases posteriores continuam pendentes até sua validação.

A [inspeção do design](docs/design-audit.md) começou com o acesso ao Figma bloqueado. O usuário disponibilizou 15 PNGs em `prototype/`, agora usados como referência de composição, paleta escura/cobre e marca Kurio. Os valores exatos dos estilos, a família tipográfica e os assets individuais ainda precisam de exportação. A fonte de sistema monoespaçada e as artes geométricas locais são substituições provisórias; não há aceite de fidelidade visual.

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

O banco MSW será versionado, persistido e reinicializável integralmente. Dois usuários fictícios terão dados privados distintos. Senhas serão derivadas com sal pela Web Crypto; não serão persistidas em claro. Sessão e identidade do carrinho visitante usarão cookies opacos, com a limitação de não serem HttpOnly na simulação em navegador. Um backend real exigiria cookies HttpOnly/Secure. A credencial de demonstração será pública e exclusivamente fictícia. A persistência do navegador pertence à simulação e não representa autenticação de produção.

## Cache, sessão e sincronização

Consultas públicas incluem todos os filtros e a página na chave. Consultas privadas incluem o identificador do usuário. Valores iniciais: `staleTime` de 30 s, `gcTime` de 5 min, atualização ao foco/reconexão e no máximo uma repetição apenas para falhas transitórias de consulta. Erros 4xx não repetem. Mutations não repetem automaticamente; pedidos só podem ser reenviados com a mesma chave de idempotência.

Logout/troca de usuário devem cancelar consultas, remover dados privados e encerrar listeners/subscriptions da sessão anterior. Expiração deve preservar carrinho e contexto de retorno, sem permitir renderizar dados privados antigos. Esses comportamentos dependem das fases de sessão e ainda precisam de testes E2E.

Eventos carregam ID estável, recurso, versão e, para pedidos, usuário. O cliente descarta eventos repetidos/antigos e nunca regride um pedido terminal. Após reconexão, REST é a fonte de reconciliação dos recursos ativos. O banco simulado deve ser atualizado antes da emissão do evento. Carrinho e checkout invalidam cotação ao mudar preço/disponibilidade. Favoritos terão mutation otimista com snapshot e rollback; implementação e testes acompanham a fase correspondente.

## Demonstração e deploy

O primeiro marco é local. O deploy público previsto no enunciado ocorre na Fase 8, após os fluxos, testes e auditorias. Proposta inicial: hospedagem estática do `dist/` com fallback de rotas para `index.html` (Vercel ou equivalente). O build de demonstração deverá incluir worker MSW e eventos simulados, sem serviço privado. Provedor, repositório remoto e URL pública ainda não estão definidos.

Lighthouse será executado contra build otimizado, três medições por página/perfil em início e detalhe. Relatórios devem registrar versões, ambiente, medianas, LCP/CLS/TBT e causas de metas não atingidas. Não há resultados de auditoria nesta etapa.

## Limitações acompanhadas

- PNGs desktop/mobile disponíveis; arquivo Figma, fontes e assets individuais ainda ausentes. Fundação visual sujeita a refinamento.
- Não confundir configuração de uma ferramenta com implementação de todos os fluxos que a utilizam.
- Contratos, handlers, sessões, compra e eventos só terão status concluído após implementação e verificações registradas no plano.
- A escolha do binding Socket.IO e suas limitações serão documentadas depois da prova de integração real.

## Fontes técnicas

- [Vite: configuração inicial](https://vite.dev/guide/).
- [TanStack Router: configuração e rotas tipadas](https://tanstack.com/router/latest/docs/quick-start).
- [shadcn/ui: instalação manual](https://ui.shadcn.com/docs/installation/manual).
