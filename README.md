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

No checkout, o cliente escolhe entre retirada e entrega, informa nome, telefone e e-mail e o pedido é gravado no Supabase antes de abrir o pagamento do Mercado Pago. O e-mail é solicitado antes do formulário de pagamento e enviado como dado inicial ao Mercado Pago para evitar falhas de preenchimento automático em navegadores móveis. Para entrega, também informa rua, número e bairro e escolhe a região da taxa: Promorar/Bela Vista (grátis), Santa Helena (R$ 7), Cidade Alta (R$ 8), Centro (R$ 10) ou demais bairros (R$ 16). O total é recalculado no servidor.

O dashboard (`/dashboard`) exibe os pedidos online e os dados de contato/endereço atrás de uma senha. Configure `DASHBOARD_PASSWORD` com uma senha exclusiva de pelo menos 12 caracteres nas variáveis privadas do servidor. Sem ela, o dashboard permanece fechado. A sessão usa cookie HttpOnly, SameSite=Strict, com expiração em oito horas.

No servidor, configure `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `MERCADOPAGO_ACCESS_TOKEN`, `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY` e `DASHBOARD_PASSWORD`. Mantenha as chaves secretas somente nas variáveis privadas do servidor; apenas a chave pública do Mercado Pago pode ser exposta ao navegador.

Execute novamente `supabase-orders.sql` no Supabase para criar/atualizar a tabela com os campos de recebimento, entrega e contato antes de testar o fluxo.

Para editar estoque e sabores no dashboard e disponibilizar as alterações online sem novo deploy, execute novamente `supabase-setup.sql` no SQL Editor do Supabase depois de publicar a atualização. Para essências, informe uma linha por sabor no formato `Sabor | quantidade` (por exemplo, `Menta | 5`); o total é calculado e a loja impede compras acima do estoque daquele sabor. Sabores antigos começam com quantidade zero na nova coluna para não presumir como o estoque existente deve ser dividido; informe as quantidades de cada um no dashboard. O dashboard salva as alterações com sua sessão administrativa; a loja lê somente os dados públicos de estoque e sabores da tabela `inventory`.

O resumo de vendas combina pedidos online com status aprovado e vendas manuais registradas no dashboard. Para persistir as vendas manuais, execute também `supabase-setup.sql` no SQL Editor; os dados ficam na tabela `manual_sales`, sem acesso público. Registros manuais antigos no armazenamento local continuam aparecendo somente no navegador em que foram criados; as novas vendas são gravadas online.

Para trocar a música da loja sem novo deploy, execute `supabase-music.sql` uma vez no SQL Editor do Supabase. Depois entre em `/dashboard`, use a seção “Música da loja” e envie um arquivo MP3, M4A, OGG, WAV ou WebM de até 5 MB. O arquivo fica no bucket público `jayey-media`; o endpoint de upload exige sessão do dashboard e usa a chave secreta apenas no servidor.

O dashboard permite cadastrar e editar produtos, preços, descrições, categorias e imagens, além de gerenciar estoque e sabores compartilhados online. O catálogo e as imagens dos produtos continuam no `localStorage` deste navegador. Imagens enviadas são redimensionadas e armazenadas no navegador; evite cadastrar muitas imagens grandes. Como o navegador separa dados por origem, os registros feitos ao abrir os arquivos antigos diretamente (`file://`) não aparecem automaticamente em `http://localhost:3000`; eles permanecem na origem antiga. As páginas originais em HTML foram mantidas como referência; o conteúdo migrado está em `src/legacy`, e imagens e outros arquivos estáticos são servidos por `public`.

JavaScript enviado ao navegador não pode ser mantido secreto por criptografia: o navegador precisa interpretá-lo. A proteção depende de credenciais secretas somente no servidor, endpoints autenticados e validação dos dados; as chaves secretas deste projeto não devem ser incluídas em arquivos públicos.
