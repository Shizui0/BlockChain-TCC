# FIA Systems — Controle de Estoque

Dashboard local e responsivo para acompanhamento de produtos, movimentações e indicadores de estoque.

## Como executar

1. Abra um terminal nesta pasta.
2. Execute `npm start`.
3. Acesse `http://localhost:4173`.

O projeto não depende de internet nem de instalação de pacotes. Os produtos cadastrados e as movimentações realizadas pela interface são mantidos no armazenamento local do navegador.

## Recursos principais

- visão geral com indicadores animados;
- entrada, saída e cadastro de produtos;
- pesquisa por nome, SKU ou categoria;
- relatório CSV;
- gráficos interativos e tooltips;
- microinterações com cursor limitadas por `requestAnimationFrame`;
- layout adaptado para notebook, tablet e celular;
- suporte a `prefers-reduced-motion`.
