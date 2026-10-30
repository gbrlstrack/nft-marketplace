# Kurio — NFT Marketplace

Implementação em andamento do [desafio](docs/plan/requisitos.md). A Fase 6 integra atualizações Socket.IO e reconciliação REST ao catálogo, carrinho, checkout e pedidos. O [plano de implementação](docs/plan/implementacao.md) mantém as etapas e evidências; a [matriz de aceite](docs/acceptance.md) acompanha o escopo completo.

Disponível: busca, filtros combinados de categoria/coleção, faixa de preço e rede (Ethereum, Polygon e Solana), ordenação, paginação e histórico na URL; galeria e seleção de edição/quantidade; loading com shimmer, vazio, falhas recuperáveis, menu mobile acessível e rotas inexistentes. Valores ETH preservam até 18 casas decimais com cálculos inteiros em wei.

O catálogo tem abas “Todos os NFTs”, “Novos lançamentos” e “Em alta”, com navegação por teclado e estado na URL. Lançamentos usam os últimos 30 dias da referência fixa da demonstração (30/10/2026); popularidade usa um score fictício de 0 a 100, incluindo obras com pelo menos 70 pontos. “Em alta” começa por popularidade quando não há ordenação explícita. O seletor à direita mantém as opções de preço/nome e a aplicação pelo botão “Aplicar filtros”. A paginação numerada destaca a página atual e usa o total real da API.

Também disponíveis: cadastro/login/logout, recuperação e expiração da sessão, retorno seguro ao fluxo anterior, favoritos com atualização otimista/rollback, perfil/avatar/senha e cadastro/edição/conexão simulada de carteiras. Dados privados usam usuário e ciclo da sessão na chave de cache; operações de autenticação concorrentes são serializadas e reconciliadas com a API.

Carrinho persistente, fusão no login, cupons, revisão do pagamento e recibo imutável estão implementados. Timeout recupera o mesmo pedido por chave de idempotência. Confirmação remove apenas as unidades compradas ainda representadas no carrinho; adições posteriores são preservadas, inclusive após uma redução de quantidade durante a pendência. Recusa conserva o carrinho.

Eventos `nft.updated` e `order.updated` atravessam o cliente Socket.IO real e o binding MSW. Alterações de preço/estoque atualizam os recursos e invalidam a revisão do checkout; reconexão consulta o REST para recuperar eventos perdidos. Duplicatas, versões antigas e eventos de outra sessão são descartados, e pedidos terminais permanecem terminais.

Baselines visuais, Lighthouse e deploy público continuam pendentes. As imagens geométricas e a fonte monoespaçada de sistema são provisórias; os PNGs em `prototype/` orientam o visual. O título desktop usa as medidas fornecidas: 43 px, peso 700 e altura de linha 70 px. O usuário não dispõe do nome da fonte original.

## Contas de demonstração

| Colecionador | E-mail            | Senha fictícia |
| ------------ | ----------------- | -------------- |
| Maya Silva   | `maya@kurio.test` | `Demo123!`     |
| Theo Costa   | `theo@kurio.test` | `Demo123!`     |

Esses são os valores após reset. Cada conta começa com perfil próprio, uma carteira principal e nenhum favorito. Cadastro cria outra conta persistente. Senhas são derivadas com sal; a base local não armazena o texto da senha. Login, perfil, carteiras e favoritos não dependem de um backend privado.

Rotas públicas: `/`, `/nfts/:nftId`, `/cart`, `/login` e `/register`. Rotas privadas: `/profile`, `/wallets`, `/favorites`, `/checkout` e `/orders/:orderId`; exigem sessão e preservam o destino para o login. Login/cadastro são páginas próprias nesta etapa; o overlay desktop do protótipo ainda exige refinamento visual. Login social não foi implementado.

Para comprar, adicione um NFT ao carrinho, entre na conta, conecte a carteira simulada e revise os dados antes de confirmar. `KURIO10` concede 10% de desconto no subtotal, arredondado para baixo em wei; `EXPIRED` demonstra cupom expirado. As taxas iniciais são `0.016 ETH` em Ethereum e `0.001 ETH` em Sepolia. A cotação dura 60 segundos e é revalidada na confirmação. Nenhuma transferência real ocorre.

## Executar

Requer Node.js 24 LTS e npm. Não há backend privado.

```sh
npm ci
npm run dev
```

Abra o endereço local informado pelo Vite. `dev` e `build` usam o modo `demo`, com MSW ativado por `.env.demo`. O worker é iniciado antes da renderização e o build contém `/mockServiceWorker.js`. Não abra `index.html` diretamente pelo sistema de arquivos: o service worker requer HTTP em localhost ou HTTPS.

```sh
npm run build
npm run preview
```

No workspace Windows desta sessão foi preparado Node portátil em `.tools/node-v24.22.2-win-x64` e Chromium em `.cache/ms-playwright`, ambos ignorados no Git. Para usar esses arquivos numa nova sessão PowerShell:

```powershell
$env:Path = "$PWD\.tools\node-v24.22.2-win-x64;$env:Path"
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.cache\ms-playwright"
npm.cmd run dev
```

Esses diretórios locais não são necessários para outro checkout com Node/Chromium instalados normalmente.

## Configuração

| Variável            | Demonstração | Uso                                                               |
| ------------------- | ------------ | ----------------------------------------------------------------- |
| `VITE_ENABLE_MOCKS` | `true`       | Ativa os handlers MSW. Qualquer outro valor desativa a simulação. |
| `VITE_API_BASE_URL` | `/api`       | Base do cliente Axios; os mocks deste marco atendem `/api`.       |

`.env.example` documenta as mesmas variáveis. Overrides locais podem ser definidos em `.env.demo.local`, ignorado pelo Git. Variáveis `VITE_` são públicas no bundle: não colocar segredos. Se a inicialização do MSW falhar, a aplicação apresenta erro de inicialização e não substitui a API por dados na interface.

## Cenários reproduzíveis

Abra uma das URLs abaixo. O cenário é salvo em `sessionStorage` para sobreviver à navegação e ao refresh na mesma aba.

| URL                            | Comportamento                                                         |
| ------------------------------ | --------------------------------------------------------------------- |
| `/?mockScenario=default`       | 24 NFTs, páginas de 8 itens, latência de 160 ms.                      |
| `/?mockScenario=empty`         | Catálogo vazio.                                                       |
| `/?mockScenario=slow`          | Respostas com atraso de 2 s e skeletons visíveis.                     |
| `/?mockScenario=catalog-error` | HTTP 503 persistente; botão de tentativa faz nova consulta.           |
| `/?mockScenario=offline`       | Falha de conexão na camada de rede.                                   |
| `/?mockScenario=out-of-order`  | Buscas curtas demoram mais; a consulta antiga é cancelada/descartada. |

Para recuperar de uma falha do catálogo, abra `/?mockScenario=default`. Para excluir somente essa seleção persistida, remova `nft-marketplace:catalog-scenario` de `sessionStorage` e recarregue sem `mockScenario` na URL. O catálogo inicial é determinístico; compras confirmadas e controles de comércio atualizam o mesmo estoque persistido usado pelo catálogo, detalhe e carrinho.

Exemplo de filtros combinados: `/?q=a&category=art&collection=Chromatic&sort=name`. Detalhe direto: `/nfts/nft-001`; NFT inexistente: `/nfts/inexistente`.

Preço e rede: `/?network=polygon&minPrice=0.2&maxPrice=1.6`. A faixa compara o menor preço entre as edições disponíveis, incluindo os limites. O slider permite ajustar de 0 a 16 ETH, em passos de 0,01 ETH; o botão “Aplicar” confirma a faixa exibida, inicialmente 0,02–12,30 ETH. A seleção de rede aplica o formulário e reinicia a paginação. A URL e a API aceitam limites com até 18 casas sem arredondar. As redes do catálogo são metadados de descoberta da demonstração; os valores continuam em ETH e o pagamento simulado mantém as redes Ethereum/Sepolia.

Os controles de conta são HTTP e só existem com MSW ativo. No console do navegador, depois de abrir a aplicação:

```js
// Restaurar contas, catálogo, carrinhos, cupons, cotações, pedidos e cenários.
await fetch('/api/__mock/reset', { method: 'POST' })
location.href = '/login'
```

```js
// Forçar um cenário da conta; não precisa recarregar para a próxima operação.
await fetch('/api/__mock/scenario', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'favorite-error' }),
})
```

| Cenário da conta | Resultado                                                                   |
| ---------------- | --------------------------------------------------------------------------- |
| `default`        | Fluxos normais.                                                             |
| `favorite-error` | Mutation de favorito retorna 503 após 700 ms; permite observar rollback.    |
| `profile-error`  | Alteração de perfil/avatar/senha retorna 503 sem persistir.                 |
| `wallet-refused` | Conexão da carteira é recusada com feedback.                                |
| `slow-private`   | Leitura/escrita privada espera 1,5 s, permitindo exercitar troca de sessão. |
| `slow-auth`      | Login/cadastro espera 1,5 s, permitindo exercitar operações concorrentes.   |

Para restaurar os fluxos, envie `{ name: 'default' }`. Os cenários persistem em `sessionStorage` na chave `kurio:account-scenario`. Para expirar a sessão atual, envie `POST /api/__mock/session/expire` e tente salvar o perfil ou alterar um favorito: a API recusa a operação e o app pede login com destino preservado.

A base simulada está em `localStorage` (`kurio:mock-account-db:v1`); a sessão usa cookie opaco `nft_session`, válido por uma hora. O visitante usa `nft_cart`, válido por 90 dias; login/cadastro fundem os itens na conta respeitando estoque e aposentam a identidade visitante. Rascunho do checkout e tentativa de compra são guardados em `sessionStorage` por usuário, permitindo retomar após expiração/refresh sem gerar outra chave. Após reset da API, recarregue a página para reiniciar o cache e as versões públicas da aplicação. O reset não apaga rascunhos locais: para uma demonstração inteiramente nova, limpe também as chaves `kurio:checkout:*` do `sessionStorage`.

A API simula a autenticação no navegador e não representa segurança de produção. Avatares aceitam PNG/JPEG/WebP de até 512 KiB e 4096 × 4096 px. Carteiras não abrem extensões; suas conexões duram até cinco minutos. Sair do formulário libera a conexão, exceto enquanto há tentativa de compra pendente; o recibo terminal conclui a limpeza.

Os controles de comércio também são HTTP, disponíveis somente com MSW:

```js
await fetch('/api/__mock/commerce/scenario', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'order-timeout' }),
})
```

| Cenário de comércio | Resultado                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `default`           | Pedido pendente, com conclusão simulada consultável após 900 ms.                          |
| `payment-declined`  | Pagamento recusado, preservando os itens.                                                 |
| `order-timeout`     | Cria o pedido e atrasa a primeira resposta em 2,5 s; o cliente recupera pela mesma chave. |
| `pending`           | Mantém o pedido pendente até acionar o controle de conclusão.                             |
| `offline-orders`    | Falha de rede nas consultas de pedido; dados já recebidos permanecem visíveis.            |

A seleção persiste na chave `kurio:commerce-scenario`. Envie `{ name: 'default' }` para restaurar. Com a conta autenticada, `POST /api/__mock/commerce/settle` com `{ orderId }` conclui somente um pedido próprio; sem ID, conclui os pendentes próprios. Controles de catálogo, taxas e expiração de cupom estão detalhados nos [contratos](docs/api-contracts.md). Alterações do catálogo e conclusões de pedidos também emitem eventos. Leituras REST periódicas do carrinho (2 s) e de pedidos pendentes (500 ms) continuam como recuperação complementar.

## Tempo real e cenários

A conexão usa `socket.io-client` 4.8.4, transporte WebSocket na mesma origem e um binding local MSW 3 com parsers oficiais Engine.IO/Socket.IO. Não é necessário servidor remoto. A simulação suporta namespace padrão e eventos de texto; não implementa HTTP polling como transporte, acknowledgements, namespaces personalizados ou anexos binários. Autenticação e limpeza seguem o ciclo da sessão. A tela informa quando está conectada ou tentando reconectar.

Para reproduzir a mudança durante checkout, adicione `nft-001`, entre na conta, conecte a carteira e revise. No console da aplicação aberta, execute:

```js
await fetch('/api/__mock/realtime/nft', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    nftId: 'nft-001',
    editionId: 'nft-001-standard',
    priceEth: '0.2',
    available: 3,
    delivery: 'duplicate',
  }),
})
```

O controle persiste os valores antes de enviar o evento pelo socket. O resumo muda, a interface anuncia a alteração e a confirmação anterior desaparece até uma nova revisão. `delivery: 'stale'` reenvia uma versão anterior sem regredir a base. Também existe replay por ID, descrito nos [contratos](docs/api-contracts.md).

| Controle                                                                        | Uso                                                                                                                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GET /api/__mock/realtime/status`                                               | Inspeciona conexões prontas, contadores e metadados de eventos públicos/próprios, sem tokens.                       |
| `POST /api/__mock/realtime/connection` com `{online: false}` / `{online: true}` | Interrompe/restaura o socket; REST continua disponível. O cliente tenta reconectar e reconcilia os recursos ativos. |
| `POST /api/__mock/realtime/order` com `{orderId}`                               | Conclui pedido próprio e entrega `order.updated`; combine com cenário `pending` para controlar o momento.           |

Os controles de eventos aceitam `delayMs` de 0 a 10000 e `delivery` normal/duplicate/stale quando aplicável. Para perder eventos de um pedido pendente sem a consulta periódica antecipar a recuperação, combine `offline-orders` com socket offline, conclua o pedido pelo controle e então restaure ambos. O mesmo ID e snapshot são recuperados sem outra compra. O cenário de interrupção persiste em `kurio:realtime-online` no `sessionStorage`; histórico de eventos vive apenas na aba e é descartado no refresh/reset.

## Verificações

```sh
npm run typecheck
npm run lint
npm run format:check
npm run test:unit
npx playwright install chromium
npm run test:e2e -- --workers=2
npm run test:e2e:report
```

Playwright gera o build otimizado e inicia seu preview automaticamente, cobrindo Chromium em 390, 768 e 1440 px. Não reutiliza servidor existente na porta 4173, para garantir que o artefato avaliado corresponda ao código atual e evitar recarregamentos HMR durante operações. Cada teste usa contexto isolado. HTML fica em `playwright-report/`, traces e screenshots de falhas em `test-results/`; ambos ignorados no Git. Os testes consultam a API pelo app/Axios e handlers MSW, sem respostas substituídas no Playwright. O teste do drawer só se aplica ao projeto mobile.

Os testes de precisão usam o runner nativo do Node. Ainda não existem comando, configuração ou resultados Lighthouse; essa entrega pertence à Fase 8. Baselines de regressão visual dependem dos fluxos completos e dos assets definitivos.

## Estrutura e decisões

- [Arquitetura](ARCHITECTURE.md): responsabilidades, cache/retries, cancelamento, decisões de sessão/compra e pendências.
- [Contratos REST e Socket.IO](docs/api-contracts.md): endpoints, eventos implementados, controles e limites do binding.
- [Verificações de tempo real](docs/verification-realtime.md): resultados da Fase 6, reconexão, isolamento e regressões.
- [Verificações de comércio](docs/verification-commerce.md): resultados da Fase 5, regressões e limites atuais.
- [Inspeção dos protótipos](docs/design-audit.md): inventário das 15 telas exportadas, tokens observados e assets faltantes.
- [Verificações da conta](docs/verification-account.md): resultados do segundo marco e limites atuais.
- [Verificações iniciais](docs/verification.md): histórico do primeiro marco.

Nenhum repositório remoto ou deploy foi configurado. O deploy público continua obrigatório no aceite final do desafio.
