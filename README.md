# Diário de Trades

App Android (APK) para registrar e analisar trades em R, com visual preto AMOLED. Tudo fica guardado no aparelho.

## O que o app faz

- **Painel:** curva de resultado, indicadores do período, calendário colorido por dia (com soma da semana), últimas fotos, resumo das contas de prop firm e últimos trades.
- **Trades:** lista ou **galeria de fotos** (1 ou 2 colunas), busca, filtros (resultado, estratégia, categoria, conta, com ou sem foto) e detalhe com carrossel de fotos. Toque na foto para ampliar com pinça, duplo toque e arrastar para fechar.
- **Fotos de verdade:** cada trade aceita várias fotos (entrada, saída, setup). Os 131 prints do TradingView do histórico já vêm dentro do app. Dá para adicionar da galeria ou colar um link do TradingView, que vira foto guardada no aparelho.
- **Dados do trade:** além do essencial, preços (entrada, stop, alvo, saída), R planejado, quando abriu, até quanto chegou (para ver o que ficou na mesa), confluências, erros, nota de qualidade e estado emocional.
- **Contas de prop firm:** cadastre cada conta com tamanho, fase, meta, perda diária, perda máxima (estática ou trailing), dias mínimos, consistência e divisão de lucro. O app estima o saldo pelos trades marcados na conta, mostra quanto falta para a meta e quanto sobra até o limite, avisa antes de violar, registra saques e gastos, calcula ROI e fluxo de caixa e simula a chance de passar o desafio com o seu histórico.
- **Estatísticas:** quatro abas (Resumo, Tempo, Setups, Disciplina) com curva de capital, queda desde o pico, distribuição dos R, calendário mensal, dia da semana, expectativa móvel, evolução por estratégia, melhores e piores ativos, confluências que funcionam, custo dos erros, sequências de perdas e o que ficou na mesa. Todo gráfico tem uma tabela equivalente.
- **Backup:** salvar e restaurar tudo (trades, contas, saques, gastos, ajustes e as fotos que você adicionou) em um arquivo. Backups da versão anterior continuam funcionando.

## Como gerar o APK

A cada push no branch `main`, o GitHub Actions compila e publica o APK em **Releases** (`DiarioDeTrades.apk`). Baixe no celular e instale. As versões novas instalam por cima, sem perder os dados (o APK é sempre assinado com a mesma chave).

## Desenvolvimento

```bash
npm install
npm run dev     # navegador
npm test        # testes das contas e das estatísticas
npm run sync    # monta e copia para o projeto Android
```

Fotos do histórico: `public/photos/<id>.webp` (e `<id>_t.webp`, miniatura), ligadas aos trades por `src/seedPhotos.json`.
