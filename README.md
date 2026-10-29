# Kurio — NFT Marketplace

Implementação em andamento do [desafio](docs/plan/requisitos.md). Este primeiro marco entrega a fundação React/TypeScript, o catálogo integrado à rede simulada e o detalhe de leitura. O [plano de implementação](docs/plan/implementacao.md) mantém as etapas e evidências; a [matriz de aceite](docs/acceptance.md) acompanha o escopo completo.

Disponível: busca, filtros combinados de categoria/coleção, ordenação, paginação e histórico na URL; galeria e seleção de edição/quantidade; loading com shimmer, vazio, falhas recuperáveis, menu mobile acessível e rotas inexistentes. Valores ETH preservam até 18 casas decimais com cálculos inteiros em wei.

Conta, favoritos, carrinho, pagamento, pedidos, Socket.IO, baselines visuais, Lighthouse e deploy público continuam pendentes. Ainda não há credenciais de login nem compras habilitadas. As imagens geométricas e a fonte monoespaçada de sistema são provisórias; os PNGs em `prototype/` orientam o visual enquanto aguardamos os assets individuais/fontes.

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

Para recuperar de uma falha ou reiniciar o cenário, abra `/?mockScenario=default`. Para excluir somente a seleção persistida, remova `nft-marketplace:catalog-scenario` de `sessionStorage` e recarregue sem `mockScenario` na URL. O catálogo é determinístico e somente leitura; banco privado, cenários de compra e reset integral de entidades serão implementados na Fase 2.

Exemplo de filtros combinados: `/?q=a&category=art&collection=Chromatic&sort=name`. Detalhe direto: `/nfts/nft-001`; NFT inexistente: `/nfts/inexistente`.

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

Playwright inicia o servidor automaticamente e cobre Chromium em 390, 768 e 1440 px. Cada teste usa contexto isolado. HTML fica em `playwright-report/`, traces e screenshots de falhas em `test-results/`; ambos ignorados no Git. Os testes consultam a API pelo app/Axios e handlers MSW, sem respostas substituídas no Playwright. O teste do drawer só se aplica ao projeto mobile.

Os testes de precisão usam o runner nativo do Node. Ainda não existem comando, configuração ou resultados Lighthouse; essa entrega pertence à Fase 8. Baselines de regressão visual dependem dos fluxos completos e dos assets definitivos.

## Estrutura e decisões

- [Arquitetura](ARCHITECTURE.md): responsabilidades, cache/retries, cancelamento, decisões de sessão/compra e pendências.
- [Contratos REST e Socket.IO](docs/api-contracts.md): DTOs compartilhados e endpoints previstos. Somente listagem e detalhe estão implementados neste marco.
- [Inspeção dos protótipos](docs/design-audit.md): inventário das 15 telas exportadas, tokens observados e assets faltantes.
- [Registro de verificações](docs/verification.md): resultados executados e limites deste marco.

Nenhum repositório remoto ou deploy foi configurado. O deploy público continua obrigatório no aceite final do desafio.
