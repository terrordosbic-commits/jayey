# Jay Ey Conveniência

Loja e dashboard executados com Next.js App Router.

## Executar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000` para a loja e `http://localhost:3000/dashboard` para o dashboard.

No Windows, também é possível iniciar o servidor e abrir a loja com duplo clique em `Abrir Jay Ey.bat`. Mantenha aberta a janela do servidor enquanto usa o site.

Use o dashboard em `http://localhost:3000/dashboard`, aberto pelo mesmo site. O antigo arquivo `dashboard.html` mostra um aviso e encaminha para a página correta. Não abra a loja HTML antiga diretamente: navegadores isolam os dados `file://` dos dados de `http://localhost:3000`.

Use `npm run build` para criar a versão de produção e `npm start` para executá-la.

## Checkout

No checkout, o cliente escolhe entre retirada e entrega, informa nome e telefone e o pedido é gravado no Supabase antes de abrir o pagamento do Mercado Pago. Para entrega, também informa rua, número e bairro e escolhe a região da taxa: Promorar/Bela Vista (grátis), Santa Helena (R$ 7), Cidade Alta (R$ 8), Centro (R$ 10) ou demais bairros (R$ 16). O total é recalculado no servidor.

O dashboard (`/dashboard`) exibe os pedidos online e os dados de contato/endereço atrás de uma senha. Configure `DASHBOARD_PASSWORD` com uma senha exclusiva de pelo menos 12 caracteres nas variáveis privadas do servidor. Sem ela, o dashboard permanece fechado. A sessão usa cookie HttpOnly, SameSite=Strict, com expiração em oito horas.

No servidor, configure `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `MERCADOPAGO_ACCESS_TOKEN`, `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY` e `DASHBOARD_PASSWORD`. Mantenha as chaves secretas somente nas variáveis privadas do servidor; apenas a chave pública do Mercado Pago pode ser exposta ao navegador.

Execute novamente `supabase-orders.sql` no Supabase para criar/atualizar a tabela com os campos de recebimento, entrega e contato antes de testar o fluxo.

O dashboard permite cadastrar e editar produtos, preços, descrições, categorias e imagens, além de gerenciar o estoque e os sabores. O catálogo, estoque e vendas ficam no `localStorage` deste navegador e não são compartilhados entre dispositivos. Imagens enviadas são redimensionadas e armazenadas no navegador; evite cadastrar muitas imagens grandes. Como o navegador separa dados por origem, os registros feitos ao abrir os arquivos antigos diretamente (`file://`) não aparecem automaticamente em `http://localhost:3000`; eles permanecem na origem antiga. As páginas originais em HTML foram mantidas como referência; o conteúdo migrado está em `src/legacy`, e imagens e outros arquivos estáticos são servidos por `public`.
