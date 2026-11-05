(function(){
 var chatWindow=document.getElementById("jay-chat-window");
 var toggle=document.getElementById("jay-chat-toggle");
 var input=document.getElementById("jay-chat-input");
 var messages=document.getElementById("jay-chat-messages");
 var form=document.getElementById("jay-chat-form");
 var lastProducts=[];
 if(!chatWindow||!toggle||!input||!messages||!form)return;

 function normalize(value){
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^\w\s]/g," ").replace(/\s+/g," ").trim();
 }
 function addMessage(text,from,link){
  var message=document.createElement("div");
  message.className="jay-chat-message"+(from==="user"?" user":"");
  message.textContent=text;
  if(link){
   var anchor=document.createElement("a");
   anchor.href=link;
   anchor.target="_blank";
   anchor.rel="noopener noreferrer";
   anchor.textContent="Chamar a equipe no WhatsApp";
   message.appendChild(document.createElement("br"));
   message.appendChild(anchor);
  }
  messages.appendChild(message);
  messages.scrollTop=messages.scrollHeight;
 }
 function linkToTeam(message){
  return {text:message||"Bah, pra essa informação não te passar nada errado, melhor confirmar direto com a equipe, tchê.",link:"https://wa.me/"+WHATS+"?text="+encodeURIComponent("Olá! Vim pelo site Jay Ey e queria tirar uma dúvida.")};
 }
 function contains(text,words){
  return words.some(function(word){return text.indexOf(word)!==-1});
 }
 function productTerms(product){
  var aliases={essencias:["essencia","essencias","fumo","tabaco"],carvao:["carvao","carvao de coco","bass","cocobass","brasa"],aluminio:["aluminio","papel aluminio","folha","alligator"]};
  return [normalize(product.n),normalize(product.brand)].concat(aliases[product.c]||[]);
 }
 function matchedProducts(text){
  return P.filter(function(product){
   return productTerms(product).some(function(term){return term&&text.indexOf(term)!==-1});
  });
 }
 function productSummary(products,withDetails){
  return products.map(function(product){
   var summary=product.n+" — "+R(product.p);
   if(withDetails){
    var stock=stockFor(product.id);
    if(stock.stock===0)summary+=" (esgotado no estoque do site)";
    else if(Number.isInteger(stock.stock))summary+=" ("+stock.stock+" unidade(s) no estoque)";
    else summary+=" (estoque atual a confirmar com a equipe)";
    if(product.c==="essencias"&&stock.flavors.length)summary+=". Sabores: "+stock.flavors.join(", ");
    else if(product.c==="essencias"&&!stock.flavors.length)summary+=". Consulte os sabores disponíveis com a equipe.";
   }
   return summary;
  }).join("\n");
 }
 function allFlavors(){
  return P.filter(function(product){return product.c==="essencias"}).map(function(product){
   var flavors=stockFor(product.id).flavors;
   return flavors.length?product.brand+": "+flavors.join(", "):"";
  }).filter(Boolean);
 }
 function answer(question){
  var text=normalize(question);
  var words=text.split(" ").filter(Boolean);
  var products=matchedProducts(text);
  var flavors=[];
  P.filter(function(product){return product.c==="essencias"}).forEach(function(product){
   stockFor(product.id).flavors.forEach(function(flavor){
    if(text.indexOf(normalize(flavor))!==-1)flavors.push({product:product,flavor:flavor});
   });
  });

  if(contains(text,["whatsapp","pessoa","humano","atendente","vendedor","falar com alguem","falar com a equipe"])){
   return linkToTeam("Bah, claro! Te passo pra equipe da loja agora.");
  }
  if(words.length<=5&&/^(oi|ola|eae|eai|opa|bom dia|boa tarde|boa noite|fala|salve|tudo bem|tudo certo)$/.test(text)){
   return {text:"Bah, tudo certo por aqui! Sou a Jay da Jay Ey, tchê 😄 O que tu tá procurando? Te ajudo com produtos, sabores, preços, pedidos e horário."};
  }
  if(contains(text,["horario","abre","aberto","fecha","fechado","funcionamento"])){
   return {text:(isStoreOpen(new Date())?"Bah, estamos abertos agora!":"No momento a loja tá fechada.")+" Nosso horário: segunda a quinta, das 18h à meia-noite; sexta a domingo, das 16h à 1h."};
  }
  if(contains(text,["entrega","entregam","delivery","frete","bairro","regiao","regioes","endereco","onde fica","localizacao","retirada","retirar","buscar na loja"])){
   return linkToTeam("Sobre entrega, bairros atendidos, endereço ou retirada, a equipe confirma certinho contigo pra não ter erro.");
  }
  if(contains(text,["pagamento","pagar","pix","cartao","dinheiro","parcela","parcelamento"])){
   return linkToTeam("As formas de pagamento são combinadas com a equipe ao fechar o pedido. Eles confirmam direitinho pra ti.");
  }
  if(contains(text,["troca","devolucao","reembolso","garantia","problema com pedido","pedido atrasado"])){
   return linkToTeam("Bah, sinto muito por isso. A equipe da loja consegue conferir teu pedido e te orientar certinho.");
  }
  if(flavors.length){
   lastProducts=flavors.map(function(match){return match.product});
   return {text:flavors.map(function(match){return "Temos o sabor "+match.flavor+" da "+match.product.brand+"! A essência tá "+R(match.product.p)+"."}).join("\n")};
  }
  if(contains(text,["sabor","sabores","essencia","essencias"])&&!products.length){
   var available=allFlavors();
   return {text:available.length?"Olha só os sabores cadastrados no estoque agora:\n"+available.join("\n"):"Não há sabores cadastrados no estoque do site no momento. Chama a equipe que eles conferem as opções disponíveis, tchê."};
  }
  if(contains(text,["estoque","disponivel","disponibilidade","tem","vende","vendem","encontrar","comprar"])&&products.length){
   lastProducts=products;
   return {text:productSummary(products,true)};
  }
  if(contains(text,["estoque","disponivel","disponibilidade"])&&!products.length){
   return {text:"Posso conferir o estoque de um item pra ti. Me diz qual produto ou sabor tu procura; alguns estoques precisam ser confirmados com a equipe."};
  }
  if(contains(text,["preco","precos","custa","custam","valor","quanto"])&&(products.length||lastProducts.length)){
   if(products.length)lastProducts=products;
   else products=lastProducts;
   return {text:productSummary(products,false)};
  }
  if(contains(text,["preco","precos","custa","custam","valor","quanto"])&&!products.length){
   return {text:"Claro! Estes são os preços cadastrados no site:\n"+productSummary(P,false)};
  }
  if(products.length){
   lastProducts=products;
   return {text:productSummary(products,true)};
  }
  if(contains(text,["marca","marcas"])){
   var brands=P.map(function(product){return product.brand}).filter(function(brand,index,all){return all.indexOf(brand)===index});
   return {text:"No catálogo tem estas marcas: "+brands.join(", ")+". Qual delas tu quer conhecer, tchê?"};
  }
  if(contains(text,["carvao","brasa","bass"])){
   var coal=P.filter(function(product){return product.c==="carvao"});
   return {text:coal.length?"Temos estas opções de carvão no catálogo:\n"+productSummary(coal,true):"Não encontrei carvão cadastrado no catálogo agora, tchê. A equipe confirma pra ti no WhatsApp."};
  }
  if(contains(text,["aluminio","papel aluminio","folha"])){
   var aluminum=P.filter(function(product){return product.c==="aluminio"});
   return {text:aluminum.length?"Temos esta opção de alumínio no catálogo:\n"+productSummary(aluminum,true):"Não encontrei alumínio cadastrado no catálogo agora. A equipe confirma pra ti no WhatsApp."};
  }
  if(contains(text,["catalogo","produtos","produto","o que voces tem","o que tem na loja","opcoes","opcao","recomenda","indica","sugestao"])){
   return {text:"Bah, no catálogo de agora tem:\n"+productSummary(P,true)+"\nSe tu me disser o que procura, vejo os detalhes, tchê."};
  }
  if(contains(text,["carrinho","pedido","pedir","finalizar","comprar","como funciona","como faco"])){
   return {text:"É tri fácil: escolhe os produtos, adiciona ao carrinho e toca em “Finalizar pelo WhatsApp”. A mensagem do pedido vai pronta pra equipe. Se pintar dúvida, tô por aqui!"};
  }
  if(contains(text,["loja","jay ey","jayey","quem e voce","quem e a jay"])){
   return {text:"Sou a Jay, atendente virtual da Jay Ey Conveniência! Te ajudo com o catálogo, preços, sabores cadastrados, horário e pedidos, tchê."};
  }
  return linkToTeam("Bah, ainda não tenho essa informação cadastrada por aqui. Posso te ajudar com catálogo, preço, sabor, estoque, horário e pedidos; pra outros assuntos, a equipe te responde no WhatsApp.");
 }
 function send(question){
  var text=question.trim();
  if(!text)return;
  addMessage(text,"user");
  var response=answer(text);
  addMessage(response.text,"jay",response.link);
 }
 function sendFromInput(event){
  event.preventDefault();
  var question=input.value;
  input.value="";
  send(question);
  input.focus();
 }
 toggle.addEventListener("click",function(){
  chatWindow.hidden=!chatWindow.hidden;
  toggle.setAttribute("aria-expanded",String(!chatWindow.hidden));
  if(!chatWindow.hidden){
   if(!messages.children.length)addMessage("Bah, tudo certo? Sou a Jay da Jay Ey, tchê 😄 Como posso te ajudar?","jay");
   input.focus();
  }
 });
 document.getElementById("jay-chat-close").addEventListener("click",function(){
  chatWindow.hidden=true;
  toggle.setAttribute("aria-expanded","false");
  toggle.focus();
 });
 form.addEventListener("submit",sendFromInput);
 document.querySelectorAll("[data-jay-question]").forEach(function(button){
  button.addEventListener("click",function(){send(button.getAttribute("data-jay-question"))});
 });
})();
