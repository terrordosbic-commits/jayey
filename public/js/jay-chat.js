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
 function addMessage(text,from,link,linkText){
  var message=document.createElement("div");
  message.className="jay-chat-message"+(from==="user"?" user":"");
  message.textContent=text;
  if(link){
   var anchor=document.createElement("a");
   anchor.href=link;
   anchor.target="_blank";
   anchor.rel="noopener noreferrer";
   anchor.textContent=linkText||"Chamar a equipe no WhatsApp";
   message.appendChild(document.createElement("br"));
   message.appendChild(anchor);
  }
  messages.appendChild(message);
  messages.scrollTop=messages.scrollHeight;
 }
 function linkToTeam(message){
  return {text:message||"Para não te passar uma informação errada, é melhor confirmar isso com a equipe da loja.",link:"https://wa.me/"+WHATS+"?text="+encodeURIComponent("Olá! Vim pelo site Jay Ey e queria tirar uma dúvida.")};
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
    if(product.c==="essencias"&&stock.flavors.length)summary+=". Sabores: "+stock.flavors.map(function(flavor){
     var quantity=stock.flavor_stock&&stock.flavor_stock[flavor];
     return flavor+(Number.isInteger(quantity)?" ("+(quantity>0?quantity+(quantity===1?" unidade disponível":" unidades disponíveis"):"esgotado")+")":"");
    }).join(", ");
    else if(product.c==="essencias"&&!stock.flavors.length)summary+=". Consulte os sabores disponíveis com a equipe.";
   }
   return summary;
  }).join("\n");
 }
 function allFlavors(){
  return P.filter(function(product){return product.c==="essencias"}).map(function(product){
   var flavors=stockFor(product.id).flavors;
   return flavors.length?product.brand+": "+flavors.map(function(flavor){
    var quantity=stockFor(product.id).flavor_stock&&stockFor(product.id).flavor_stock[flavor];
    return flavor+(Number.isInteger(quantity)?" ("+(quantity>0?quantity+(quantity===1?" unidade disponível":" unidades disponíveis"):"esgotado")+")":"");
   }).join(", "):"";
  }).filter(Boolean);
 }
 function answer(question){
  var text=normalize(question);
  var words=text.split(" ").filter(Boolean);
  var products=matchedProducts(text);
  var flavors=[];
  if(
   contains(text,["dashboard","painel administrativo","painel da loja"])&&
   contains(text,["abrir","abre","acessar","acessa","entrar","ir para","ir pro","me leva","mostrar"])
  ){
   return {text:"Claro! Vou abrir o dashboard da loja em uma nova aba. Entre com sua senha administrativa.",link:"/dashboard",linkLabel:"Abrir dashboard",openDashboard:true};
  }
  P.filter(function(product){return product.c==="essencias"}).forEach(function(product){
   stockFor(product.id).flavors.forEach(function(flavor){
    if(text.indexOf(normalize(flavor))!==-1)flavors.push({product:product,flavor:flavor});
   });
  });

  if(contains(text,["whatsapp","pessoa","humano","atendente","vendedor","falar com alguem","falar com a equipe"])){
   return linkToTeam("Claro! Você pode falar diretamente com a equipe da loja por aqui.");
  }
  if(words.length<=5&&/^(oi|ola|eae|eai|opa|bom dia|boa tarde|boa noite|fala|salve|tudo bem|tudo certo)$/.test(text)){
   return {text:"Ô, tudo certo? Sou a Jay, atendente virtual da Jay Ey 😊 Posso ajudar você a encontrar produtos e sabores, consultar preços, fazer um pedido ou conferir nosso horário."};
  }
  if(contains(text,["horario","abre","aberto","fecha","fechado","funcionamento"])){
   return {text:(isStoreOpen(new Date())?"Estamos abertos agora!":"No momento a loja está fechada.")+" Nosso horário: segunda a quinta, das 18h à meia-noite; sexta a domingo, das 16h à 1h."};
  }
  if(contains(text,["entrega","entregam","delivery","frete","bairro","regiao","regioes","endereco","onde fica","localizacao","retirada","retirar","buscar na loja"])){
   return {text:"No checkout, você pode escolher retirada no local ou entrega e informar seu bairro. A taxa aparece antes de confirmar o pagamento."};
  }
  if(contains(text,["pagamento","pagar","pix","cartao","dinheiro","parcela","parcelamento"])){
   return {text:"O pagamento é feito pelo próprio site, pelo Mercado Pago. Depois de escolher retirada ou entrega e informar seus dados, você pode pagar com Pix ou cartão."};
  }
  if(contains(text,["troca","devolucao","reembolso","garantia","problema com pedido","pedido atrasado"])){
   return linkToTeam("Sinto muito pelo problema. A equipe consegue conferir seu pedido e orientar você.");
  }
  if(flavors.length){
   lastProducts=flavors.map(function(match){return match.product});
   return {text:flavors.map(function(match){
    var quantity=stockFor(match.product.id).flavor_stock&&stockFor(match.product.id).flavor_stock[match.flavor];
    return Number.isInteger(quantity)&&quantity<1
     ?"O sabor "+match.flavor+" da "+match.product.brand+" está cadastrado, mas está esgotado no momento."
     :"O sabor "+match.flavor+" da "+match.product.brand+" está "+(Number.isInteger(quantity)?"disponível ("+quantity+(quantity===1?" unidade":" unidades")+")":"cadastrado")+". A essência custa "+R(match.product.p)+".";
   }).join("\n")};
  }
  if(contains(text,["sabor","sabores","essencia","essencias"])&&!products.length){
   var available=allFlavors();
   return {text:available.length?"Estes são os sabores cadastrados no estoque agora:\n"+available.join("\n"):"Ainda não há sabores cadastrados no estoque do site. A equipe pode confirmar outras opções disponíveis."};
  }
  if(contains(text,["estoque","disponivel","disponibilidade","tem","vende","vendem","encontrar","comprar"])&&products.length){
   lastProducts=products;
   return {text:productSummary(products,true)};
  }
  if(contains(text,["estoque","disponivel","disponibilidade"])&&!products.length){
   return {text:"Posso conferir o estoque para você. Qual produto ou sabor está procurando? Se a informação não estiver atualizada no site, peço ajuda à equipe."};
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
   return {text:"Estas são as marcas disponíveis no catálogo: "+brands.join(", ")+". Qual delas você quer conhecer?"};
  }
  if(contains(text,["carvao","brasa","bass"])){
   var coal=P.filter(function(product){return product.c==="carvao"});
   return {text:coal.length?"Estas são as opções de carvão no catálogo:\n"+productSummary(coal,true):"Não encontrei carvão no catálogo agora. A equipe pode confirmar as opções pelo WhatsApp."};
  }
  if(contains(text,["aluminio","papel aluminio","folha"])){
   var aluminum=P.filter(function(product){return product.c==="aluminio"});
   return {text:aluminum.length?"Esta é a opção de alumínio no catálogo:\n"+productSummary(aluminum,true):"Não encontrei alumínio no catálogo agora. A equipe pode confirmar as opções pelo WhatsApp."};
  }
  if(contains(text,["catalogo","produtos","produto","o que voces tem","o que tem na loja","opcoes","opcao","recomenda","indica","sugestao"])){
   return {text:"No catálogo temos:\n"+productSummary(P,true)+"\nSe você me disser o que procura, posso ajudar a encontrar."};
  }
  if(contains(text,["carrinho","pedido","pedir","finalizar","comprar","como funciona","como faco"])){
   return {text:"É simples: escolha os produtos, adicione ao carrinho e toque em “Continuar para pagamento”. No checkout, informe seus dados, escolha retirada ou entrega e pague pelo Mercado Pago no próprio site."};
  }
  if(contains(text,["loja","jay ey","jayey","quem e voce","quem e a jay"])){
   return {text:"Sou a Jay, atendente virtual da Jay Ey Conveniência 😊 Posso ajudar com produtos, preços, sabores cadastrados, horário e pedidos."};
  }
  return linkToTeam("Ainda não tenho essa informação cadastrada. Posso ajudar com catálogo, preços, sabores, estoque, horário e pedidos. Para outros assuntos, a equipe responde pelo WhatsApp.");
 }
 function send(question){
  var text=question.trim();
  if(!text)return;
  addMessage(text,"user");
  var response=answer(text);
  addMessage(response.text,"jay",response.link,response.linkLabel);
  if(response.openDashboard)window.open("/dashboard","_blank","noopener,noreferrer");
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
   if(!messages.children.length)addMessage("Ô, tudo certo? Sou a Jay da Jay Ey 😊 Como posso ajudar você hoje?","jay");
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
