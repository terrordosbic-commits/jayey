
var CATALOG_STORAGE_KEY="jayey.catalog.v1";
var SALES_STORAGE_KEY="jayey.sales.v1";
var sharedInventory={};
var sharedInventoryReady=false;
var salesRecords=[];
var ordersRefreshTimer=null;
var selectedPeriod="all";
var categories=[
 {id:"essencias",name:"Essências",description:"Escolha sua marca favorita"},
 {id:"carvao",name:"Carvão",description:"Brasa que dura a sessão toda"},
 {id:"aluminio",name:"Alumínio",description:"Alta qualidade, preço baixo"}
];
var products=[
 {id:"zomo",c:"essencias",n:"Essência Zomo",brand:"Zomo",l:"Z",p:12,compareAtPrice:15,d:"Essência para narguilé da marca Zomo.",t1:"MAIS VENDIDA",img:"zomo-strong-edition-especial.png"},
 {id:"ziggy",c:"essencias",n:"Essência Ziggy",brand:"Ziggy",l:"Z",p:11,compareAtPrice:13,d:"Essência para narguilé da marca Ziggy.",img:"ziggy-essencia.jpg"},
 {id:"nay",c:"essencias",n:"Essência Nay",brand:"Nay",l:"N",p:11,compareAtPrice:13,d:"Essência para narguilé da marca Nay.",img:"nay-essencia.jpg"},
 {id:"bass",c:"carvao",n:"Carvão de coco Bass",brand:"Bass",l:"B",p:1.5,compareAtPrice:2,d:"Carvão de coco da marca Bass.",img:"cocobass.webp"},
 {id:"alu",c:"aluminio",n:"Alumínio de alta qualidade",brand:"Alligator Hookah",l:"A",p:1,d:"Papel alumínio Alligator Hookah com 50 folhas.",img:"aluminio-alligator.webp"}
];
function $(id){return document.getElementById(id)}
function money(value){return "R$ "+value.toFixed(2).replace(".",",")}
function localDateString(date){
 return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
}
function readSales(){
 var stored=localStorage.getItem(SALES_STORAGE_KEY);
 if(!stored)return salesRecords;
 var legacySales=JSON.parse(stored);
 if(!Array.isArray(legacySales)||legacySales.some(function(sale){
  return !sale||typeof sale.id!=="string"||typeof sale.date!=="string"||!Number.isFinite(sale.amount)||sale.amount<=0;
 }))throw new Error("Os registros manuais antigos salvos neste navegador estão inválidos.");
 return salesRecords.concat(legacySales.map(function(sale){
  return {id:"local-"+sale.id,amount:sale.amount,date:sale.date,source:"legacy",note:""};
 }));
}
function periodSales(){
 var sales=readSales(),now=new Date(),today=localDateString(now);
 var monday=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 monday.setDate(monday.getDate()-(monday.getDay()+6)%7);
 var start=localDateString(monday);
 var nextMonday=new Date(monday);nextMonday.setDate(nextMonday.getDate()+7);
 var end=localDateString(nextMonday);
 return sales.filter(function(sale){
  var date=localDateString(new Date(sale.date));
  if(selectedPeriod==="all")return true;
  if(selectedPeriod==="day")return date===today;
  if(selectedPeriod==="week")return date>=start&&date<end;
  return date.slice(0,7)===today.slice(0,7);
 });
}
function drawSales(){
 var sales=periodSales(),total=sales.reduce(function(sum,sale){return sum+sale.amount},0);
 $("sales-total").textContent=money(total);
 $("sales-count").textContent=String(sales.length);
 $("sales-average").textContent=money(sales.length?total/sales.length:0);
 var today=new Date(),buckets=[],title="";
 if(selectedPeriod==="all"){
  title="Vendas por mês · todo o período";
  var currentMonth=new Date(today.getFullYear(),today.getMonth(),1);
  for(var monthIndex=11;monthIndex>=0;monthIndex--){
   var bucketMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()-monthIndex,1);
   buckets.push({label:bucketMonth.toLocaleDateString("pt-BR",{month:"short",year:"2-digit"}),date:bucketMonth.getFullYear()+"-"+String(bucketMonth.getMonth()+1).padStart(2,"0"),amount:0});
  }
  sales.forEach(function(sale){
   var monthKey=localDateString(new Date(sale.date)).slice(0,7);
   var bucket=buckets.filter(function(item){return item.date===monthKey})[0];
   if(bucket)bucket.amount+=sale.amount;
  });
 }else if(selectedPeriod==="day"){
  title="Vendas por hora · hoje";
  for(var hour=0;hour<24;hour++)buckets.push({label:String(hour).padStart(2,"0")+"h",amount:0});
  sales.forEach(function(sale){var hour=new Date(sale.date).getHours();if(Number.isInteger(hour)&&hour>=0&&hour<24)buckets[hour].amount+=sale.amount});
 }else if(selectedPeriod==="week"){
  title="Vendas por dia · esta semana";
  var monday=new Date(today.getFullYear(),today.getMonth(),today.getDate());monday.setDate(monday.getDate()-(monday.getDay()+6)%7);
  var weekdays=["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
  for(var day=0;day<7;day++){var bucketDate=new Date(monday);bucketDate.setDate(bucketDate.getDate()+day);buckets.push({label:weekdays[day],date:localDateString(bucketDate),amount:0})}
  sales.forEach(function(sale){var bucket=buckets.filter(function(item){return item.date===localDateString(new Date(sale.date))})[0];if(bucket)bucket.amount+=sale.amount});
 }else{
  title="Vendas por dia · este mês";
  var year=today.getFullYear(),month=today.getMonth(),daysInMonth=new Date(year,month+1,0).getDate();
  for(var date=1;date<=daysInMonth;date++)buckets.push({label:String(date),date:year+"-"+String(month+1).padStart(2,"0")+"-"+String(date).padStart(2,"0"),amount:0});
  sales.forEach(function(sale){var bucket=buckets.filter(function(item){return item.date===localDateString(new Date(sale.date))})[0];if(bucket)bucket.amount+=sale.amount});
 }
 $("chart-title").textContent=title;
 var peak=Math.max.apply(null,buckets.map(function(bucket){return bucket.amount}).concat([0]));
 $("sales-chart").innerHTML=buckets.map(function(bucket){
  var height=peak?Math.max(bucket.amount?4:2,bucket.amount/peak*112):2;
  return '<div class="bar-column" title="'+bucket.label+': '+money(bucket.amount)+'"><span class="bar-label">'+bucket.label+'</span><div class="bar" style="height:'+height+'px"></div></div>';
 }).join("");
 var recent=readSales().sort(function(a,b){return b.date.localeCompare(a.date)||b.id.localeCompare(a.id)}).slice(0,10);
 $("sales-list").innerHTML=recent.length?recent.map(function(sale){
  var date=new Date(sale.date);
  var source=sale.source==="online"?"Pagamento online aprovado":sale.source==="legacy"?"Venda manual (histórico deste navegador)":"Venda manual";
  var note=sale.note?'<small>'+escapeHtml(sale.note)+'</small>':"";
  return '<div class="sale-row"><div><b>'+source+'</b><small>'+date.toLocaleDateString("pt-BR")+" às "+date.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+'</small>'+note+'</div><span class="sale-value">'+money(sale.amount)+'</span></div>';
 }).join(""):'<p class="message">Nenhuma venda registrada ainda.</p>';
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,function(char){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]})}
async function loadSales(){
 var response=await fetch("/api/dashboard/sales",{cache:"no-store",credentials:"same-origin"});
 var result=await response.json();
 if(response.status===401){setDashboardAccess(false);$("dashboard-login-message").textContent="Sua sessão expirou. Entre novamente.";return}
 if(!response.ok)throw new Error(typeof result.error==="string"?result.error:"Não foi possível carregar as vendas.");
 if(!Array.isArray(result.sales))throw new Error("O servidor retornou uma lista de vendas inválida.");
 salesRecords=result.sales.filter(function(sale){
  return sale&&typeof sale.id==="string"&&Number.isInteger(sale.amountCents)&&sale.amountCents>0&&typeof sale.occurredAt==="string"&&Number.isFinite(Date.parse(sale.occurredAt));
 }).map(function(sale){
  return {id:sale.id,amount:sale.amountCents/100,date:sale.occurredAt,source:sale.source,note:typeof sale.note==="string"?sale.note:""};
 });
 drawSales();
 $("sales-message").textContent=Array.isArray(result.warnings)&&result.warnings.length?result.warnings.join(" "):"Total do período selecionado, somando pagamentos online aprovados e vendas manuais.";
}
function setDashboardAccess(authenticated){
 $("dashboard-login").hidden=authenticated;
 $("dashboard-content").hidden=!authenticated;
 if(authenticated){
  loadOrders();loadSharedInventory();
  loadSales().catch(function(error){$("sales-message").textContent="Não foi possível carregar as vendas: "+error.message});
  if(!ordersRefreshTimer)ordersRefreshTimer=window.setInterval(function(){
   loadOrders();
   loadSales().catch(function(error){$("sales-message").textContent="Não foi possível atualizar as vendas: "+error.message});
  },15000);
 }else{
  sharedInventoryReady=false;salesRecords=[];
  drawSales();
  if(ordersRefreshTimer){window.clearInterval(ordersRefreshTimer);ordersRefreshTimer=null}
 }
}
async function loadSharedInventory(){
 var message=$("message");
 sharedInventoryReady=false;
 message.textContent="Carregando estoque e sabores compartilhados...";
 try{
  var response=await fetch("/api/dashboard/inventory",{cache:"no-store",credentials:"same-origin"});
  var result=await response.json();
  if(response.status===401){setDashboardAccess(false);$("dashboard-login-message").textContent="Sua sessão expirou. Entre novamente.";return}
  if(!response.ok)throw new Error(typeof result.error==="string"?result.error:"Não foi possível carregar o estoque compartilhado.");
  if(!Array.isArray(result.inventory))throw new Error("O servidor retornou um estoque inválido.");
  sharedInventory={};
  result.inventory.forEach(function(item){
   if(item&&typeof item.id==="string")sharedInventory[item.id]={stock:item.stock,flavors:Array.isArray(item.flavors)?item.flavors:[],flavor_stock:item.flavor_stock&&typeof item.flavor_stock==="object"?item.flavor_stock:{}};
  });
  sharedInventoryReady=true;
  render();
  message.textContent="Estoque e sabores sincronizados com a loja.";
 }catch(error){
  message.textContent="Não foi possível carregar o estoque compartilhado: "+error.message;
  render();
 }
}
async function loadOrders(){
 var list=$("orders-list"),message=$("orders-message");
 message.textContent="Carregando pedidos...";
 try{
  var response=await fetch("/api/dashboard/orders",{cache:"no-store",credentials:"same-origin"});
  var result=await response.json();
  if(response.status===401){setDashboardAccess(false);message.textContent="Sua sessão expirou. Entre novamente.";return}
  if(!response.ok)throw new Error(typeof result.error==="string"?result.error:"Não foi possível carregar os pedidos.");
  if(!Array.isArray(result.orders))throw new Error("O servidor retornou uma lista de pedidos inválida.");
  var statusNames={awaiting_payment:"Aguardando pagamento",creating:"Iniciando pagamento",pending:"Pagamento pendente",approved:"Pago",rejected:"Recusado",cancelled:"Cancelado",error:"Erro no pagamento",unknown:"Status não confirmado"};
  var zoneNames={promorar_bela_vista:"Promorar ou Bela Vista",santa_helena:"Santa Helena",cidade_alta:"Cidade Alta",centro_proximos:"Centro",other:"Demais bairros"};
  var visibleOrders=result.orders.filter(function(order){
   if(order.status==="approved")return true;
   if(order.status!=="awaiting_payment"&&order.status!=="creating"&&order.status!=="pending")return false;
   var createdAt=Date.parse(order.created_at||"");
   var age=Date.now()-createdAt;
   return Number.isFinite(createdAt)&&age>=0&&age<5*60*1000;
  });
  list.innerHTML=visibleOrders.length?visibleOrders.map(function(order){
   var items=Array.isArray(order.items)?order.items:[];
   var itemMarkup=items.map(function(item){
    var title=escapeHtml(item&&item.title||"Item");
    var quantity=Number.isInteger(item&&item.quantity)?item.quantity:0;
    var amount=Number.isInteger(item&&item.unit_price_cents)?item.unit_price_cents/100:0;
    return '<li>'+quantity+' × '+title+' <span>'+money(amount*quantity)+'</span></li>';
   }).join("");
   var fulfillment=order.fulfillment_type==="delivery"?"Entrega":"Retirada no local";
   var address=order.fulfillment_type==="delivery"
    ?'<p class="order-address">'+escapeHtml(order.delivery_street||"")+", "+escapeHtml(order.delivery_number||"")+" · "+escapeHtml(order.delivery_neighborhood||"")+'<br><small>'+escapeHtml(zoneNames[order.delivery_zone]||"Região não informada")+' · entrega '+money((order.delivery_fee_cents||0)/100)+'</small></p>'
    :'';
   var email=order.customer_email?'<p class="order-contact">'+escapeHtml(order.customer_email)+'</p>':'';
   var date=order.created_at?new Date(order.created_at).toLocaleString("pt-BR"):"";
   var status=statusNames[order.status]||escapeHtml(order.status||"Desconhecido");
   var paymentRef=order.payment_id?'<small>Pagamento MP: '+escapeHtml(order.payment_id)+'</small>':'';
   return '<article class="order-card"><div class="order-top"><div><b>Pedido '+escapeHtml(String(order.external_reference||"").slice(0,8))+'</b><small>'+escapeHtml(date)+'</small></div><span class="order-status">'+status+'</span></div><p class="order-contact"><strong>'+escapeHtml(order.customer_name||"Cliente")+'</strong> · '+escapeHtml(order.customer_phone||"Sem telefone")+'</p>'+email+'<p class="order-fulfillment">'+fulfillment+'</p>'+address+'<ul class="order-items">'+itemMarkup+'</ul><div class="order-total"><span>Total</span><strong>'+money((order.amount_cents||0)/100)+'</strong></div>'+paymentRef+(order.status_detail?'<small class="order-detail">'+escapeHtml(order.status_detail)+'</small>':'')+'</article>';
  }).join(""):'<p class="message">Nenhum pedido online registrado ainda.</p>';
  message.textContent="Mostrando "+visibleOrders.length+" pedido(s): aprovados e pendentes há menos de 5 minutos.";
 }catch(error){
  message.textContent="Não foi possível carregar pedidos: "+error.message;
 }
}
async function checkDashboardSession(){
 try{
  var response=await fetch("/api/dashboard/session",{cache:"no-store",credentials:"same-origin"});
  var result=await response.json();
  setDashboardAccess(response.ok&&result.authenticated===true);
  if(!response.ok)$("dashboard-login-message").textContent=result.error||"Configure a senha do dashboard no servidor.";
 }catch(error){
  setDashboardAccess(false);
  $("dashboard-login-message").textContent="Não foi possível verificar o acesso ao dashboard: "+error.message;
 }
}
function slug(value){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}
function updateDefaultPrices(products){
 var changed=false;
 products.forEach(function(product){
  var regularPrice=product.id==="zomo"?15:13;
  if(product.c==="essencias"&&product.p===15){product.p=product.id==="zomo"?12:11;product.compareAtPrice=regularPrice;changed=true}
  if(product.c==="essencias"&&product.p===11&&product.compareAtPrice!==regularPrice){product.compareAtPrice=regularPrice;changed=true}
  if(product.id==="zomo"&&product.p===11&&product.compareAtPrice===15){product.p=12;changed=true}
  if(product.id==="zomo"&&product.p===12&&product.compareAtPrice!==15){product.compareAtPrice=15;changed=true}
  if(product.id==="bass"&&product.p===2){product.p=1.5;product.compareAtPrice=2;changed=true}
  if(product.id==="bass"&&product.p===1.5&&product.compareAtPrice!==2){product.compareAtPrice=2;changed=true}
  if(product.id==="alu"&&product.p===.5){product.p=1;changed=true}
 });
 return changed;
}
function readCatalog(){
 var stored=localStorage.getItem(CATALOG_STORAGE_KEY);
 if(!stored)return {products:products,categories:categories};
 var catalog=JSON.parse(stored);
 if(!catalog||!Array.isArray(catalog.products)||!Array.isArray(catalog.categories)||!catalog.categories.length)throw new Error("Os dados salvos do catálogo estão inválidos.");
 if(catalog.products.some(function(product){return !product||typeof product.id!=="string"||typeof product.c!=="string"||typeof product.n!=="string"||typeof product.brand!=="string"||typeof product.d!=="string"||typeof product.img!=="string"||!Number.isFinite(product.p)||product.p<0}))throw new Error("Um produto salvo está inválido.");
 if(catalog.categories.some(function(category){return !category||typeof category.id!=="string"||typeof category.name!=="string"||typeof category.description!=="string"}))throw new Error("Uma categoria salva está inválida.");
 if(updateDefaultPrices(catalog.products))localStorage.setItem(CATALOG_STORAGE_KEY,JSON.stringify(catalog));
 return catalog;
}
function saveCatalog(catalog){
 localStorage.setItem(CATALOG_STORAGE_KEY,JSON.stringify(catalog));
 products=catalog.products;categories=catalog.categories;
}
function categoryOptions(selected){
 return categories.map(function(category){return '<option value="'+escapeHtml(category.id)+'" '+(category.id===selected?"selected":"")+'>'+escapeHtml(category.name)+'</option>'}).join("");
}
function readInventory(){
 return sharedInventoryReady?sharedInventory:{};
}
function inventoryItemFromFlavorForm(form,id,addedFlavor,addedQuantity){
 var flavors=[],flavorStock={};
 form.querySelectorAll(".flavor-stock-input").forEach(function(input){
  var flavor=input.getAttribute("data-flavor"),quantityText=input.value,quantity=Number(quantityText);
  if(!flavor||!/^\d+$/.test(quantityText)||!Number.isSafeInteger(quantity)||quantity<0)throw new Error("Informe um estoque inteiro igual ou maior que zero para cada sabor.");
  if(flavors.some(function(existing){return existing.toLocaleLowerCase()===flavor.toLocaleLowerCase()}))throw new Error("Há sabores repetidos no estoque.");
  flavors.push(flavor);flavorStock[flavor]=quantity;
 });
 if(addedFlavor){
  if(flavors.some(function(existing){return existing.toLocaleLowerCase()===addedFlavor.toLocaleLowerCase()}))throw new Error("Esse sabor já está cadastrado. Edite a quantidade na lista de sabores.");
  flavors.push(addedFlavor);flavorStock[addedFlavor]=addedQuantity;
 }
 if(flavors.length>50)throw new Error("Cadastre no máximo 50 sabores por produto.");
 var stock=flavors.reduce(function(total,flavor){return total+flavorStock[flavor]},0);
 if(!Number.isSafeInteger(stock)||stock>2147483647)throw new Error("A soma do estoque dos sabores é grande demais.");
 return {id:id,stock:stock,flavors:flavors,flavorStock:flavorStock};
}
async function saveInventoryItem(item){
 var response=await fetch("/api/dashboard/inventory",{
  method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({items:[item]})
 });
 var result=await response.json();
 if(response.status===401){setDashboardAccess(false);throw new Error("Sua sessão expirou. Entre novamente no dashboard.")}
 if(!response.ok)throw new Error(typeof result.error==="string"?result.error:"Não foi possível salvar o estoque.");
 if(!Array.isArray(result.inventory)||!result.inventory.length)throw new Error("O servidor não confirmou a atualização do estoque.");
 result.inventory.forEach(function(saved){
  if(saved&&typeof saved.id==="string")sharedInventory[saved.id]={
   stock:saved.stock,
   flavors:Array.isArray(saved.flavors)?saved.flavors:[],
   flavor_stock:saved.flavor_stock&&typeof saved.flavor_stock==="object"?saved.flavor_stock:{}
  };
 });
}
function render(){
 var inventory,catalog;
 try{inventory=readInventory();catalog=readCatalog()}
 catch(error){$("message").textContent="Não foi possível carregar o estoque ou catálogo: "+error.message;return}
 products=catalog.products;categories=catalog.categories;
 $("new-product-form").elements.category.innerHTML=categoryOptions(categories[0].id);
 $("categories").innerHTML=categories.map(function(category){
  return '<article class="category-row"><form data-category-save="'+escapeHtml(category.id)+'"><label>Nome<input name="name" maxlength="40" value="'+escapeHtml(category.name)+'" required></label><label>Descrição<input name="description" maxlength="100" value="'+escapeHtml(category.description)+'"></label><div class="category-row-actions"><button class="secondary" type="submit">Salvar categoria</button><button class="secondary danger" type="button" data-category-delete="'+escapeHtml(category.id)+'">Excluir categoria</button></div></form></article>';
 }).join("");
 $("products").innerHTML=products.map(function(product){
  var current=inventory[product.id]||{stock:null,flavors:[],flavor_stock:{}};
  var flavors=Array.isArray(current.flavors)?current.flavors:[];
  var flavorStock=current.flavor_stock&&typeof current.flavor_stock==="object"?current.flavor_stock:{};
  var isEssence=product.c==="essencias";
  var totalFlavorStock=flavors.reduce(function(total,flavor){return total+(Number.isInteger(flavorStock[flavor])?flavorStock[flavor]:0)},0);
  var image=product.img||"",imageSource=image.indexOf("data:image/")===0||image.indexOf("https://")===0||image.indexOf("http://")===0?image:"/"+image;
  var imagePreview=image?'<img src="'+escapeHtml(imageSource)+'" alt="">':"";
  var deleteButton=product.id==="bass"||product.id==="alu"?"":'<button class="secondary danger" type="button" data-product-delete="'+escapeHtml(product.id)+'">Excluir produto</button>';
  var stockField=isEssence
   ?'<label>Estoque total (calculado)<input class="stock" type="number" value="'+totalFlavorStock+'" readonly><small>O total é a soma das quantidades por sabor.</small></label>'
   :'<label>Estoque<input class="stock" type="number" min="0" step="1" inputmode="numeric" value="'+(Number.isInteger(current.stock)?current.stock:"")+'" placeholder="Não informado" '+(sharedInventoryReady?"":"disabled")+'></label>';
  var flavorField=isEssence
   ?'<div class="flavor-manager wide-field"><div class="flavor-stock-list">'+(flavors.length?flavors.map(function(flavor){return '<label class="flavor-stock-row"><span>'+escapeHtml(flavor)+'</span><input class="flavor-stock-input" data-flavor="'+escapeHtml(flavor)+'" type="number" min="0" step="1" inputmode="numeric" value="'+(Number.isInteger(flavorStock[flavor])?flavorStock[flavor]:0)+'" aria-label="Estoque de '+escapeHtml(flavor)+'" '+(sharedInventoryReady?"":"disabled")+'></label>'}).join(""):'<p class="flavor-empty">Nenhum sabor cadastrado ainda.</p>')+'</div><div class="flavor-add-row"><label>Novo sabor<input class="new-flavor-name" maxlength="50" placeholder="Ex.: Fresh Lemon" '+(sharedInventoryReady?"":"disabled")+'></label><label>Quantidade<input class="new-flavor-quantity" type="number" min="0" step="1" inputmode="numeric" placeholder="Ex.: 5" '+(sharedInventoryReady?"":"disabled")+'></label><button class="secondary" type="button" data-flavor-add '+(sharedInventoryReady?"":"disabled")+'>Adicionar sabor</button></div><small>Os sabores já cadastrados ficam salvos. Adicione um sabor novo sem apagar os anteriores.</small></div>'
   :'<input class="flavors" type="hidden" value="">';
  return '<article class="product" data-product="'+escapeHtml(product.id)+'"><h2>'+escapeHtml(product.n)+'</h2><form class="product-editor" data-product-save="'+escapeHtml(product.id)+'"><div class="product-editor-grid"><label>Nome<input name="name" maxlength="80" value="'+escapeHtml(product.n)+'" required></label><label>Marca<input name="brand" maxlength="50" value="'+escapeHtml(product.brand)+'" required></label><label>Categoria<select name="category">'+categoryOptions(product.c)+'</select></label><label>Preço (R$)<input name="price" type="number" min="0.01" step="0.01" value="'+product.p+'" required></label><label class="wide-field">Descrição<input name="description" maxlength="180" value="'+escapeHtml(product.d)+'" required></label><label class="wide-field">Trocar imagem<input name="image" type="file" accept="image/png,image/jpeg,image/webp"><small>Imagem atual: '+(product.img?"configurada":"nenhuma")+'. Selecione um arquivo para substituir.</small></label></div><div class="product-preview">'+imagePreview+'<span>Prévia da imagem do produto</span></div><div class="product-actions"><button class="secondary" type="submit">Salvar produto</button>'+deleteButton+'</div></form><form class="product-form" data-save="'+escapeHtml(product.id)+'">'+stockField+flavorField+'<button class="secondary" type="submit" '+(sharedInventoryReady?"":"disabled")+'>Salvar estoque online</button></form></article>';
 }).join("");
}
$("categories").addEventListener("submit",function(event){
 var form=event.target.closest("[data-category-save]");
 if(!form)return;
 event.preventDefault();
 try{
  var catalog=readCatalog(),category=catalog.categories.find(function(item){return item.id===form.getAttribute("data-category-save")});
  if(!category)throw new Error("A categoria não foi encontrada.");
  category.name=form.elements.name.value.trim();category.description=form.elements.description.value.trim();
  if(!category.name)throw new Error("Informe o nome da categoria.");
  saveCatalog(catalog);render();$("message").textContent="Categoria atualizada na loja neste navegador.";
 }catch(error){$("message").textContent="Não foi possível salvar a categoria: "+error.message}
});
$("categories").addEventListener("click",function(event){
 var button=event.target.closest("[data-category-delete]");
 if(!button)return;
 var id=button.getAttribute("data-category-delete");
 try{
  var catalog=readCatalog();
  if(catalog.products.some(function(product){return product.c===id})){$("message").textContent="Mova ou exclua os produtos desta categoria antes de removê-la.";return}
  if(catalog.categories.length<=1){$("message").textContent="Mantenha pelo menos uma categoria cadastrada.";return}
  catalog.categories=catalog.categories.filter(function(category){return category.id!==id});
  saveCatalog(catalog);render();$("message").textContent="Categoria removida.";
 }catch(error){$("message").textContent="Não foi possível remover a categoria: "+error.message}
});
$("category-form").addEventListener("submit",function(event){
 event.preventDefault();
 var name=$("category-name").value.trim(),description=$("category-description").value.trim(),id=slug(name);
 if(!name||!id){$("message").textContent="Informe um nome válido para a categoria.";return}
 try{
  var catalog=readCatalog();
  if(catalog.categories.some(function(category){return category.id===id||category.name.toLowerCase()===name.toLowerCase()}))throw new Error("Essa categoria já existe.");
  catalog.categories.push({id:id,name:name,description:description||"Confira nossos produtos"});
  saveCatalog(catalog);$("category-form").reset();render();$("message").textContent="Categoria adicionada à loja.";
 }catch(error){$("message").textContent="Não foi possível adicionar a categoria: "+error.message}
});
function readImage(file){
 return new Promise(function(resolve,reject){
  if(!file.type.match(/^image\/(png|jpeg|webp)$/))return reject(new Error("Escolha uma imagem PNG, JPG ou WebP."));
  if(file.size>8*1024*1024)return reject(new Error("A imagem original deve ter até 8 MB."));
  createImageBitmap(file).then(function(bitmap){
   var scale=Math.min(1,1000/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement("canvas");
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
   var quality=.86,data=canvas.toDataURL("image/webp",quality);
   while(data.length>550000&&quality>.5){quality-=.08;data=canvas.toDataURL("image/webp",quality)}
   if(data.length>550000)return reject(new Error("A imagem ainda ficou grande demais. Use um arquivo menor."));
   resolve(data);
  }).catch(function(){reject(new Error("Não foi possível abrir o arquivo de imagem."))});
 });
}
async function productFromForm(form,current){
 var name=form.elements.name.value.trim(),brand=form.elements.brand.value.trim(),description=form.elements.description.value.trim(),price=Number(form.elements.price.value),category=form.elements.category.value,image=current?current.img:"";
 if(!name||!brand||!description||!Number.isFinite(price)||price<=0)throw new Error("Preencha nome, marca, descrição e um preço maior que zero.");
 if(!categories.some(function(item){return item.id===category}))throw new Error("Selecione uma categoria válida.");
 var file=form.elements.image.files[0];
 if(file)image=await readImage(file);
 var updated={id:current?current.id:slug(name)+"-"+Date.now().toString(36),c:category,n:name,brand:brand,l:name.charAt(0).toUpperCase(),p:price,d:description,img:image,t1:current?current.t1:""};
 if(current&&price===current.p&&current.compareAtPrice>price)updated.compareAtPrice=current.compareAtPrice;
 return updated;
}
$("new-product-form").addEventListener("submit",async function(event){
 event.preventDefault();
 var form=event.currentTarget,button=form.querySelector("button[type=submit]");button.disabled=true;
 try{
  var catalog=readCatalog(),product=await productFromForm(form,null);
  if(catalog.products.some(function(item){return item.id===product.id}))throw new Error("Já existe um produto com esse identificador. Tente outro nome.");
  catalog.products.push(product);
  localStorage.setItem(CATALOG_STORAGE_KEY,JSON.stringify(catalog));
  products=catalog.products;categories=catalog.categories;form.reset();render();$("message").textContent="Produto cadastrado na loja neste navegador.";
 }catch(error){$("message").textContent="Não foi possível cadastrar o produto: "+error.message}
 finally{button.disabled=false}
});
$("products").addEventListener("submit",async function(event){
 var productForm=event.target.closest("[data-product-save]");
 if(productForm){
  event.preventDefault();
  var saveButton=productForm.querySelector("button[type=submit]");saveButton.disabled=true;
  (async function(){
   try{
    var catalog=readCatalog(),id=productForm.getAttribute("data-product-save"),index=catalog.products.findIndex(function(product){return product.id===id});
    if(index<0)throw new Error("O produto não foi encontrado.");
    catalog.products[index]=await productFromForm(productForm,catalog.products[index]);
    saveCatalog(catalog);render();$("message").textContent="Produto atualizado na loja neste navegador.";
   }catch(error){$("message").textContent="Não foi possível salvar o produto: "+error.message}
   finally{saveButton.disabled=false}
  })();
  return;
 }
 var form=event.target.closest("[data-save]");
 if(!form)return;
 event.preventDefault();
 var id=form.getAttribute("data-save");
 var stockText=form.querySelector(".stock").value;
 var stock=stockText===""?null:Number(stockText);
 var product=products.filter(function(item){return item.id===id})[0];
 if(!product){$("message").textContent="O produto não foi encontrado.";return}
 var inventoryItem;
 if(product.c==="essencias"){
  try{
   inventoryItem=inventoryItemFromFlavorForm(form,id);
  }catch(error){$("message").textContent=error.message;return}
 }else{
  inventoryItem={id:id,stock:stock,flavors:[],flavorStock:{}};
 }
 if(stock!==null&&(!Number.isInteger(stock)||stock<0)){
  $("message").textContent="Informe um estoque inteiro igual ou maior que zero.";
  return;
 }
 if(!sharedInventoryReady){$("message").textContent="O estoque compartilhado ainda não carregou. Atualize o dashboard e tente novamente.";return}
 var submitButton=form.querySelector("button[type=submit]");
 submitButton.disabled=true;
 $("message").textContent="Salvando estoque e sabores para a loja...";
 try{
  products=readCatalog().products;
  if(product.c!=="essencias")inventoryItem.stock=stock;
  await saveInventoryItem(inventoryItem);
  render();
  $("message").textContent=product.c==="essencias"?"Quantidades dos sabores atualizadas sem remover nenhum sabor.":"Estoque salvo online. Já está disponível na loja.";
 }catch(error){$("message").textContent="Não foi possível salvar o estoque compartilhado: "+error.message}
 finally{submitButton.disabled=!sharedInventoryReady}
});
$("products").addEventListener("click",async function(event){
 var addFlavorButton=event.target.closest("[data-flavor-add]");
 if(addFlavorButton){
  var flavorForm=addFlavorButton.closest("[data-save]");
  var flavorName=flavorForm.querySelector(".new-flavor-name").value.trim();
  var quantityText=flavorForm.querySelector(".new-flavor-quantity").value;
  var quantity=Number(quantityText),productId=flavorForm.getAttribute("data-save");
  if(!flavorName||flavorName.length>50||!/^\d+$/.test(quantityText)||!Number.isSafeInteger(quantity)||quantity<0){
   $("message").textContent="Informe o nome do sabor e uma quantidade inteira igual ou maior que zero.";
   return;
  }
  if(!sharedInventoryReady){$("message").textContent="O estoque compartilhado ainda não carregou. Atualize o dashboard e tente novamente.";return}
  addFlavorButton.disabled=true;
  $("message").textContent="Salvando o novo sabor...";
  try{
   var item=inventoryItemFromFlavorForm(flavorForm,productId,flavorName,quantity);
   await saveInventoryItem(item);
   render();
   $("message").textContent='Sabor "'+flavorName+'" salvo. Os sabores anteriores foram mantidos.';
  }catch(error){
   $("message").textContent="Não foi possível adicionar o sabor: "+error.message;
   addFlavorButton.disabled=false;
  }
  return;
 }
 var button=event.target.closest("[data-product-delete]");
 if(!button)return;
 var id=button.getAttribute("data-product-delete");
 if(!window.confirm("Excluir este produto da loja?"))return;
 try{
  var catalog=readCatalog();catalog.products=catalog.products.filter(function(product){return product.id!==id});
  localStorage.setItem(CATALOG_STORAGE_KEY,JSON.stringify(catalog));
  products=catalog.products;categories=catalog.categories;render();$("message").textContent="Produto removido da loja.";
 }catch(error){$("message").textContent="Não foi possível excluir o produto: "+error.message}
});
$("products").addEventListener("input",function(event){
 var input=event.target.closest(".flavor-stock-input");
 if(!input)return;
 var form=input.closest("[data-save]"),total=0,valid=true;
 form.querySelectorAll(".flavor-stock-input").forEach(function(field){
  if(!/^\d+$/.test(field.value)||!Number.isSafeInteger(Number(field.value))){valid=false;return}
  total+=Number(field.value);
 });
 var totalInput=form.querySelector(".stock");
 if(totalInput)totalInput.value=valid?String(total):"";
});
window.addEventListener("storage",function(event){if(event.key===CATALOG_STORAGE_KEY)render()});
document.querySelectorAll("[data-period]").forEach(function(button){
 button.addEventListener("click",function(){
  selectedPeriod=button.getAttribute("data-period");
  document.querySelectorAll("[data-period]").forEach(function(item){item.setAttribute("aria-pressed",String(item===button))});
  drawSales();
 });
});
$("sale-date").value=localDateString(new Date());
$("sale-form").addEventListener("submit",function(event){
 event.preventDefault();
 var amount=Number($("sale-amount").value),date=$("sale-date").value;
 if(!Number.isFinite(amount)||amount<=0||!date){$("sales-message").textContent="Informe um valor válido e a data da venda.";return}
 var now=new Date(),time=String(now.getHours()).padStart(2,"0")+":"+String(now.getMinutes()).padStart(2,"0")+":"+String(now.getSeconds()).padStart(2,"0");
 var occurredAt=new Date(date+"T"+time);
 if(!Number.isFinite(occurredAt.getTime())){$("sales-message").textContent="Informe uma data válida para a venda.";return}
 var button=this.querySelector("button[type=submit]");
 button.disabled=true;$("sales-message").textContent="Registrando venda no servidor...";
 fetch("/api/dashboard/sales",{
  method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({amountCents:Math.round(amount*100),occurredAt:occurredAt.toISOString(),note:""})
 }).then(async function(response){
  var result=await response.json();
  if(response.status===401){setDashboardAccess(false);throw new Error("Sua sessão expirou. Entre novamente no dashboard.")}
  if(!response.ok)throw new Error(typeof result.error==="string"?result.error:"Não foi possível registrar a venda.");
  $("sale-amount").value="";
 $("sales-message").textContent="Venda manual registrada online.";
 try{await loadSales()}
 catch(error){$("sales-message").textContent="A venda foi registrada, mas não foi possível atualizar o resumo: "+error.message}
 }).catch(function(error){$("sales-message").textContent="Não foi possível registrar a venda: "+error.message})
  .finally(function(){button.disabled=false});
});
$("dashboard-login-form").addEventListener("submit",async function(event){
 event.preventDefault();
 var button=this.querySelector("button[type=submit]"),message=$("dashboard-login-message");
 button.disabled=true;message.textContent="Verificando senha...";
 try{
  var response=await fetch("/api/dashboard/session",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:$("dashboard-password").value})});
  var result=await response.json();
  if(!response.ok)throw new Error(result.error||"Não foi possível entrar no dashboard.");
  $("dashboard-password").value="";
  message.textContent="";
  setDashboardAccess(true);
 }catch(error){message.textContent=error.message}
 finally{button.disabled=false}
});
$("dashboard-logout").addEventListener("click",async function(){
 try{await fetch("/api/dashboard/session",{method:"DELETE",credentials:"same-origin"})}
 catch(error){$("orders-message").textContent="Não foi possível encerrar a sessão: "+error.message;return}
 $("orders-list").innerHTML="";
 $("dashboard-login-message").textContent="Sessão encerrada.";
 setDashboardAccess(false);
});
$("music-form").addEventListener("submit",async function(event){
 event.preventDefault();
 var file=$("music-file").files[0],button=this.querySelector("button[type=submit]"),message=$("music-message");
 if(!file){message.textContent="Selecione um arquivo de áudio.";return}
 button.disabled=true;message.textContent="Enviando música...";
 try{
  var formData=new FormData();formData.append("music",file);
  var response=await fetch("/api/dashboard/music",{method:"POST",credentials:"same-origin",body:formData});
  var result=await response.json();
  if(response.status===401){setDashboardAccess(false);throw new Error("Sua sessão expirou. Entre novamente no dashboard.")}
  if(!response.ok)throw new Error(typeof result.error==="string"?result.error:"Não foi possível trocar a música.");
  this.reset();
  message.textContent="Música trocada! Ela já está disponível para os visitantes da loja.";
 }catch(error){message.textContent=error.message||"Não foi possível trocar a música."}
 finally{button.disabled=false}
});
void checkDashboardSession();
try{var initialCatalog=readCatalog();products=initialCatalog.products;categories=initialCatalog.categories}
catch(error){$("message").textContent="Não foi possível carregar o catálogo: "+error.message}
render();
drawSales();
