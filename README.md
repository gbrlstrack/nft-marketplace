# Kurio — NFT Marketplace

Implementação em andamento do [desafio](docs/plan/requisitos.md). O segundo marco acrescenta conta, sessão, favoritos, perfil e carteiras ao catálogo integrado à rede simulada. O [plano de implementação](docs/plan/implementacao.md) mantém as etapas e evidências; a [matriz de aceite](docs/acceptance.md) acompanha o escopo completo.

Disponível: busca, filtros combinados de categoria/coleção, ordenação, paginação e histórico na URL; galeria e seleção de edição/quantidade; loading com shimmer, vazio, falhas recuperáveis, menu mobile acessível e rotas inexistentes. Valores ETH preservam até 18 casas decimais com cálculos inteiros em wei.

Também disponíveis: cadastro/login/logout, recuperação e expiração da sessão, retorno seguro ao fluxo anterior, favoritos com atualização otimista/rollback, perfil/avatar/senha e cadastro/edição/conexão simulada de carteiras. Dados privados usam usuário e ciclo da sessão na chave de cache; operações de autenticação concorrentes são serializadas e reconciliadas com a API.

Carrinho, pagamento, pedidos, Socket.IO, baselines visuais, Lighthouse e deploy público continuam pendentes. As imagens geométricas e a fonte monoespaçada de sistema são provisórias; os PNGs em `prototype/` orientam o visual. O título desktop usa as medidas fornecidas: 43 px, peso 700 e altura de linha 70 px. O usuário não dispõe do nome da fonte original.

## Contas de demonstração

| Colecionador | E-mail            | Senha fictícia |
| ------------ | ----------------- | -------------- |
| Maya Silva   | `maya@kurio.test` | `Demo123!`     |
| Theo Costa   | `theo@kurio.test` | `Demo123!`     |

Esses são os valores após reset. Cada conta começa com perfil próprio, uma carteira principal e nenhum favorito. Cadastro cria outra conta persistente. Senhas são derivadas com sal; a base local não armazena o texto da senha. Login, perfil, carteiras e favoritos não dependem de um backend privado.

Rotas: `/login`, `/register`, `/profile`, `/wallets` e `/favorites`. As três últimas exigem sessão e preservam o destino para o login. Login/cadastro são páginas próprias nesta etapa; o overlay desktop do protótipo ainda exige refinamento visual. Login social não foi implementado.

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

Para recuperar de uma falha do catálogo, abra `/?mockScenario=default`. Para excluir somente essa seleção persistida, remova `nft-marketplace:catalog-scenario` de `sessionStorage` e recarregue sem `mockScenario` na URL. O catálogo é determinístico e somente leitura; cenários de compra e reset das futuras entidades serão acrescentados nas próximas fases.

Exemplo de filtros combinados: `/?q=a&category=art&collection=Chromatic&sort=name`. Detalhe direto: `/nfts/nft-001`; NFT inexistente: `/nfts/inexistente`.

Os controles de conta são HTTP e só existem com MSW ativo. No console do navegador, depois de abrir a aplicação:

```js
// Restaurar contas, senhas, favoritos, carteiras, sessões e cenários conhecidos.
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

A base simulada está em `localStorage` (`kurio:mock-account-db:v1`); a sessão usa cookie opaco `nft_session`, válido por uma hora. A API simula a autenticação no navegador e não representa segurança de produção. Avatares aceitam PNG/JPEG/WebP de até 512 KiB e 4096 × 4096 px. Carteiras não abrem extensões; suas conexões duram até cinco minutos e são liberadas ao sair da tela/sessão.

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
- [Contratos REST e Socket.IO](docs/api-contracts.md): endpoints de catálogo/conta implementados e contratos previstos de compra/eventos.
- [Inspeção dos protótipos](docs/design-audit.md): inventário das 15 telas exportadas, tokens observados e assets faltantes.
- [Verificações da conta](docs/verification-account.md): resultados do segundo marco e limites atuais.
- [Verificações iniciais](docs/verification.md): histórico do primeiro marco.

Nenhum repositório remoto ou deploy foi configurado. O deploy público continua obrigatório no aceite final do desafio.
