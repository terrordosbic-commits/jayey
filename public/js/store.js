
var SUPABASE_URL=window.JAYEY_SUPABASE_CONFIG.url;
var SUPABASE_ANON_KEY=window.JAYEY_SUPABASE_CONFIG.anonKey;
var supabaseConfigured=Boolean(SUPABASE_URL&&SUPABASE_ANON_KEY);
var customMusicUrl=SUPABASE_URL.replace(/\/+$/,"")+"/storage/v1/object/public/jayey-media/store/music";
fetch(customMusicUrl,{method:"HEAD",cache:"no-store"}).then(function(response){
 if(response.ok){
  var music=$("site-music");
  music.src=customMusicUrl+"?v="+Date.now();
 }
}).catch(function(error){
 console.warn("Não foi possível verificar a música personalizada da loja.",error);
});
var inventoryReady=!supabaseConfigured;
var accessToken="";
var inventory={};
var INVENTORY_STORAGE_KEY="jayey.inventory.v1";
var CATALOG_STORAGE_KEY="jayey.catalog.v1";
var CART_STORAGE_KEY="jayey.cart.v1";
function closeCategoryMenu(){$("category-menu").open=false}
document.addEventListener("click",function(event){
 var target=event.target.closest("[data-coming-soon]");
 if(target){var category=target.getAttribute("data-coming-soon");notify(category==="Pods"?"Pods chegarão futuramente!":"Rosh chegará futuramente!");closeCategoryMenu();return}
 if(event.target.closest(".category-list a"))closeCategoryMenu();
});
function loadLocalInventory(){
 try{
  var stored=localStorage.getItem(INVENTORY_STORAGE_KEY);
  if(!stored)return false;
  var data=JSON.parse(stored);
  if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("Os dados locais do estoque estão inválidos.");
  Object.keys(data).forEach(function(id){
   var item=data[id];
   if(item&&((item.stock===null)||(Number.isInteger(item.stock)&&item.stock>=0))&&Array.isArray(item.flavors)){
    inventory[id]={stock:item.stock,flavors:item.flavors.filter(function(flavor){return typeof flavor==="string"})};
   }
  });
  return true;
 }catch(error){
  $("sync-status").textContent="Não foi possível ler o estoque salvo neste navegador: "+error.message;
  return false;
 }
}
var P=[
{id:"zomo",c:"essencias",n:"Essência Zomo",brand:"Zomo",l:"Z",p:12,compareAtPrice:15,d:"Essência para narguilé da marca Zomo.",t1:"MAIS VENDIDA",img:"zomo-strong-edition-especial.png"},
{id:"ziggy",c:"essencias",n:"Essência Ziggy",brand:"Ziggy",l:"Z",p:11,compareAtPrice:13,d:"Essência para narguilé da marca Ziggy.",img:"ziggy-essencia.jpg"},
{id:"nay",c:"essencias",n:"Essência Nay",brand:"Nay",l:"N",p:11,compareAtPrice:13,d:"Essência para narguilé da marca Nay.",img:"nay-essencia.jpg"},
{id:"bass",c:"carvao",n:"Carvão de coco Bass",brand:"Bass",l:"B",p:1.5,compareAtPrice:2,d:"Carvão de coco da marca Bass.",img:"cocobass.webp"},
{id:"alu",c:"aluminio",n:"Alumínio de alta qualidade",brand:"Alligator Hookah",l:"A",p:1,d:"Papel alumínio Alligator Hookah com 50 folhas.",img:"aluminio-alligator.webp"}
];
var S={essencias:["Essências","Escolha sua marca favorita"],carvao:["Carvão","Brasa que dura a sessão toda"],aluminio:["Alumínio","Alta qualidade, preço baixo"]};
var cart={};
var cartStorageWarningShown=false;
var kitFlavorOptions=[];
var pendingProduct=null,productDialogTrigger=null;
function $(i){return document.getElementById(i)}
function isStoreOpen(now){
 var day=now.getDay(),minutes=now.getHours()*60+now.getMinutes();
 var opensAt=day===0||day===5||day===6?16*60:18*60;
 if(minutes>=opensAt)return true;
 if(minutes<60){
  var previousDay=(day+6)%7;
  return previousDay===0||previousDay===5||previousDay===6;
 }
 return false;
}
function updateStoreStatus(){
 var badge=$("store-status"),open=isStoreOpen(new Date());
 badge.textContent=open?"ABERTO AGORA":"FECHADO AGORA";
 badge.classList.toggle("open",open);badge.classList.toggle("closed",!open);
}
updateStoreStatus();
window.setInterval(updateStoreStatus,30000);
window.addEventListener("focus",updateStoreStatus);
function R(v){return "R$ "+v.toFixed(2).replace(".",",")}
function esc(v){return String(v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function productImageSource(product){
 if(!product||typeof product.img!=="string"||!product.img)return "";
 if(/^data:image\/(?:png|jpeg|webp);base64,/i.test(product.img)||/^https?:\/\//i.test(product.img))return product.img;
 return "/"+product.img.replace(/^\/+/,"");
}
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
function loadCatalog(){
 var stored=localStorage.getItem(CATALOG_STORAGE_KEY);
 if(!stored)return;
 var data=JSON.parse(stored);
 if(!data||!Array.isArray(data.products)||!Array.isArray(data.categories))throw new Error("Os dados do catálogo salvos estão inválidos.");
 data.categories.forEach(function(category){
  if(!category||typeof category.id!=="string"||typeof category.name!=="string"||typeof category.description!=="string")throw new Error("Uma categoria salva está inválida.");
 });
 data.products.forEach(function(product){
  if(!product||typeof product.id!=="string"||typeof product.c!=="string"||typeof product.n!=="string"||typeof product.brand!=="string"||typeof product.d!=="string"||typeof product.img!=="string"||!Number.isFinite(product.p)||product.p<0)throw new Error("Um produto salvo está inválido.");
 });
 if(updateDefaultPrices(data.products))localStorage.setItem(CATALOG_STORAGE_KEY,JSON.stringify(data));
 P=data.products;
 S={};
 data.categories.forEach(function(category){S[category.id]=[category.name,category.description]});
}
function renderCategoryMenu(){
 var links=Object.keys(S).map(function(id){return '<a href="#'+esc(id)+'">'+esc(S[id][0])+'</a>'}).join("");
 $("category-list").innerHTML=links+'<div class="menu-divider"></div><a href="#kits">Kits sessão</a><a href="#faq">Dúvidas</a>';
}
function stockFor(id){return inventory[id]||{stock:null,flavors:[],flavor_stock:{}}}
function countInCart(id){return Object.keys(cart).reduce(function(n,key){
 var item=cart[key],contents=item.contents||[{id:item.id,quantity:1}];
 return n+contents.reduce(function(total,content){return total+(content.id===id?content.quantity*item.q:0)},0);
},0)}
function countFlavorInCart(id,flavor){return Object.keys(cart).reduce(function(total,key){
var item=cart[key];
return total+(item.id===id&&item.flavor===flavor?item.q:0);
},0)}
function notify(message){var t=$("ts");t.textContent=message;t.classList.add("show");setTimeout(function(){t.classList.remove("show");t.textContent="Adicionado ao carrinho"},1800)}
function loadCart(){
 var stored=localStorage.getItem(CART_STORAGE_KEY);
 if(!stored)return;
 var data=JSON.parse(stored);
 if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("Os dados salvos do carrinho estão inválidos.");
 Object.keys(data).forEach(function(key){
  var item=data[key];
  if(!item||typeof item!=="object"||typeof item.id!=="string"||typeof item.n!=="string"||!Number.isFinite(item.p)||item.p<0||!Number.isInteger(item.q)||item.q<1||item.q>100||typeof item.flavor!=="string")return;
  var contents=Array.isArray(item.contents)?item.contents:[{id:item.id,quantity:1}];
  if(!contents.length||contents.some(function(content){
   return !content||typeof content.id!=="string"||!P.some(function(product){return product.id===content.id})||!Number.isInteger(content.quantity)||content.quantity<1||content.quantity>100;
  }))return;
  cart[key]={id:item.id,n:item.n,p:item.p,q:item.q,flavor:item.flavor,contents:contents.map(function(content){return {id:content.id,quantity:content.quantity}})};
 });
}
function supabaseRequest(path,options){
 options=options||{};
 var headers={"apikey":SUPABASE_ANON_KEY};
 if(accessToken)headers["Authorization"]="Bearer "+accessToken;
 else if(!SUPABASE_ANON_KEY.startsWith("sb_publishable_"))headers["Authorization"]="Bearer "+SUPABASE_ANON_KEY;
 if(options.body)headers["Content-Type"]="application/json";
 if(options.prefer)headers["Prefer"]=options.prefer;
 return fetch(SUPABASE_URL.replace(/\/$/,"")+"/"+path,{method:options.method||"GET",headers:headers,body:options.body?JSON.stringify(options.body):undefined}).then(function(response){
  return response.text().then(function(text){
   var data=text?JSON.parse(text):null;
   if(!response.ok)throw new Error(data&&data.message?data.message:"Falha na conexão com Supabase ("+response.status+").");
   return data;
  });
 });
}
function updateFilterOptions(){
 var brands={},flavors={};
 P.forEach(function(p){brands[p.brand]=true;stockFor(p.id).flavors.forEach(function(f){flavors[f]=true})});
 $("filter-brand").innerHTML='<option value="">Todas as marcas</option>'+Object.keys(brands).sort().map(function(b){return '<option value="'+esc(b)+'">'+esc(b)+'</option>'}).join("");
 $("filter-flavor").innerHTML='<option value="">Todos os sabores</option>'+Object.keys(flavors).sort().map(function(f){return '<option value="'+esc(f)+'">'+esc(f)+'</option>'}).join("");
}
function updateKitOptions(){
 var es=P.filter(function(p){return p.c=="essencias"}),options=[];
 es.forEach(function(p){
  var current=stockFor(p.id);
  if(current.stock===0)return;
  current.flavors.forEach(function(flavor){options.push({product:p,flavor:flavor})});
 });
 kitFlavorOptions=options;
 if(supabaseConfigured&&!inventoryReady){
  $("ks").innerHTML='<option value="">Carregando sabores do estoque…</option>';
  $("ks").disabled=true;
 }else if(!options.length){
  $("ks").innerHTML='<option value="">Nenhum sabor cadastrado no estoque</option>';
  $("ks").disabled=true;
 }else{
  $("ks").innerHTML=options.map(function(option,index){return '<option value="'+index+'">'+esc(option.product.n.replace("Essência ",""))+" — "+esc(option.flavor)+'</option>'}).join("");
  $("ks").disabled=false;
 }
 var coal=stockFor("bass"),aluminum=stockFor("alu");
 $("kit-coal-qty").max=Number.isInteger(coal.stock)?coal.stock:"";
 $("kit-alu-qty").max=Number.isInteger(aluminum.stock)?aluminum.stock:"";
 $("kit-coal-qty").disabled=coal.stock===0;
 $("kit-alu-qty").disabled=aluminum.stock===0;
 if(coal.stock===0||aluminum.stock===0)$("kit-note").textContent="Kit indisponível: carvão ou alumínio está esgotado.";
 else if(supabaseConfigured&&!inventoryReady)$("kit-note").textContent="Carregando os sabores e estoques disponíveis…";
 else if(!options.length)$("kit-note").textContent="Cadastre os sabores das essências no dashboard para escolher neste kit.";
 else $("kit-note").textContent="Sabores carregados do estoque de essências da loja.";
 kupd();
 validateKit();
}
function kitSelection(){
 var option=kitFlavorOptions[Number($("ks").value)];
 if(!option||$("ks").disabled)return null;
 var coalQty=Number($("kit-coal-qty").value),aluminumQty=Number($("kit-alu-qty").value);
 if(!Number.isInteger(coalQty)||coalQty<1||!Number.isInteger(aluminumQty)||aluminumQty<1)return null;
 return {product:option.product,flavor:option.flavor,coalQty:coalQty,aluminumQty:aluminumQty,contents:[
  {id:option.product.id,quantity:1},{id:"bass",quantity:coalQty},{id:"alu",quantity:aluminumQty}
 ]};
}
function validateKit(){
 var selection=kitSelection(),valid=Boolean(selection);
 if(selection){
  valid=selection.contents.every(function(content){
   var available=stockFor(content.id).stock;
   return available===null||!Number.isInteger(available)||countInCart(content.id)+content.quantity<=available;
  });
  if(!valid)$("kit-note").textContent="A quantidade escolhida excede o estoque disponível.";
 }
 $("kadd").disabled=!valid||(!inventoryReady&&supabaseConfigured);
 return selection;
}
function syncInventory(){
 if(!supabaseConfigured){
  if(!$("sync-status").textContent.startsWith("Não foi possível"))$("sync-status").textContent=loadLocalInventory()?"Estoque e sabores salvos neste navegador; não compartilhados com outros dispositivos.":"Estoque compartilhado ainda não conectado. O dashboard salva alterações neste navegador.";
  updateFilterOptions();updateKitOptions();
  render($("q").value.toLowerCase().trim());
  return Promise.resolve();
 }
 $("sync-status").textContent="Carregando estoque compartilhado…";
 return supabaseRequest("rest/v1/inventory?select=id,stock,flavors,flavor_stock").then(function(rows){
  rows.forEach(function(row){inventory[row.id]={stock:row.stock,flavors:Array.isArray(row.flavors)?row.flavors:[],flavor_stock:row.flavor_stock&&typeof row.flavor_stock==="object"?row.flavor_stock:{}}});
  inventoryReady=true;
  $("sync-status").textContent="Estoque e sabores sincronizados.";
  updateFilterOptions();updateKitOptions();render($("q").value.toLowerCase().trim());
 }).catch(function(error){
  $("sync-status").textContent="Não foi possível carregar o estoque compartilhado: "+error.message;
  inventoryReady=false;
  render($("q").value.toLowerCase().trim());
 });
}
window.addEventListener("storage",function(event){
 if(event.key===CATALOG_STORAGE_KEY){
  try{
   loadCatalog();renderCategoryMenu();updateFilterOptions();updateKitOptions();render($("q").value.toLowerCase().trim());
  }catch(error){$("sync-status").textContent="Não foi possível carregar o catálogo atualizado: "+error.message}
 }
 if(event.key===INVENTORY_STORAGE_KEY&&!supabaseConfigured){
  inventory={};
  loadLocalInventory();updateFilterOptions();updateKitOptions();render($("q").value.toLowerCase().trim());
 }
});
var music=$("site-music"),volume=$("music-volume"),volumeValue=$("music-volume-value");
music.volume=Number(volume.value)/100;
var musicAudioContext=null,musicGain=null;
function setMusicVolume(){
 var level=Number(volume.value)/100;
 if(musicGain&&musicAudioContext)musicGain.gain.setTargetAtTime(level,musicAudioContext.currentTime,.015);
 else music.volume=level;
 volumeValue.value=volume.value+"%";
 volumeValue.textContent=volume.value+"%";
}
function prepareMusicAudio(){
 var AudioContextType=window.AudioContext||window.webkitAudioContext;
 if(!AudioContextType)return Promise.resolve();
 try{
  if(!musicAudioContext){
   musicAudioContext=new AudioContextType();
   var source=musicAudioContext.createMediaElementSource(music);
   musicGain=musicAudioContext.createGain();
   source.connect(musicGain);musicGain.connect(musicAudioContext.destination);
   music.volume=1;setMusicVolume();
  }
 }catch{
  musicGain=null;musicAudioContext=null;music.volume=Number(volume.value)/100;
  notify("O controle de volume avançado não está disponível neste navegador.");
  return Promise.resolve();
 }
 return musicAudioContext.state==="suspended"?musicAudioContext.resume():Promise.resolve();
}
 $("volume-toggle").addEventListener("click",function(){
 var control=$("volume-control"),open=control.classList.toggle("open");
 this.setAttribute("aria-expanded",String(open));
 this.setAttribute("aria-label",open?"Fechar controle de volume":"Abrir controle de volume");
});
volume.addEventListener("input",setMusicVolume);
document.addEventListener("click",function startMusic(){
 prepareMusicAudio().catch(function(){
  notify("Não foi possível ativar o controle de volume avançado.");
 });
 music.play().catch(function(){
  var t=$("ts");t.textContent="Não foi possível iniciar a música neste navegador";t.classList.add("show");
  setTimeout(function(){t.classList.remove("show");t.textContent="Adicionado ao carrinho"},3500);
 });
},{once:true});
function card(p){
 var current=stockFor(p.id),soldOut=current.stock===0;
 var stockLabel=soldOut?'<span class="sold-out">Esgotado</span>':"";
 var disabled=soldOut||!inventoryReady;
 var price=p.compareAtPrice>p.p?'<span class="price-before">De '+R(p.compareAtPrice)+'</span><span class="price-current"><span class="sale-badge">OFERTA</span>'+R(p.p)+'</span>':'<span class="price-current">'+R(p.p)+'</span>';
 return '<div class="pc"><div class="ph">'+(p.t1?'<span class="tag">'+esc(p.t1)+'</span>':'')+(p.img?'<img src="'+esc(p.img)+'" alt="'+esc(p.n)+'" loading="lazy">':'<span class="m">'+esc(p.l)+'</span>')+stockLabel+'</div><div class="pb"><h3>'+esc(p.n)+'</h3><p>'+esc(p.d)+'</p><div class="pr">'+price+'<small>à vista</small></div><button class="add" data-id="'+p.id+'" '+(disabled?"disabled":"")+'>'+(soldOut?"Esgotado":!inventoryReady?"Estoque indisponível":"Adicionar")+'</button></div></div>'
}
function render(f){
 var h="";
 var brand=$("filter-brand").value,flavor=$("filter-flavor").value;
 var min=$("filter-min").value===""?null:Number($("filter-min").value);
 var max=$("filter-max").value===""?null:Number($("filter-max").value);
 Object.keys(S).forEach(function(k){
  var l=P.filter(function(p){var flavors=stockFor(p.id).flavors;return p.c==k&&p.n.toLowerCase().indexOf(f)>-1&&(!brand||p.brand==brand)&&(!flavor||flavors.indexOf(flavor)>-1)&&(min===null||p.p>=min)&&(max===null||p.p<=max)});
  if(!l.length)return;
  h+='<section id="'+k+'" class="rv"><h2>'+S[k][0]+'</h2><p class="sub">'+S[k][1]+'</p><div class="grid">'+l.map(card).join("")+'</div></section>';
 });
 $("sections").innerHTML=h||'<p class="empty">Nenhum produto encontrado.</p>';
 obs();
}
function add(id,n,pr,flavor,cartKey,contents,quantity){
 quantity=quantity||1;
 var key=cartKey||id+(flavor?"::"+flavor:""),parts=contents||[{id:id,quantity:1}];
 if(!Number.isInteger(quantity)||quantity<1){notify("Informe uma quantidade válida");return}
 if(!inventoryReady&&supabaseConfigured){notify("Estoque indisponível no momento");return}
 for(var i=0;i<parts.length;i++){
  var stock=stockFor(parts[i].id).stock;
  if(stock===0){notify("Produto esgotado: "+(P.filter(function(p){return p.id===parts[i].id})[0]||{}).n);return}
  if(Number.isInteger(stock)&&countInCart(parts[i].id)+parts[i].quantity*quantity>stock){notify("Quantidade máxima em estoque atingida");return}
 }
 if(P.some(function(product){return product.id===id&&product.c==="essencias"})){
  var flavorStock=stockFor(id).flavor_stock[flavor];
  if(stockFor(id).flavors.indexOf(flavor)===-1||!Number.isInteger(flavorStock)||countFlavorInCart(id,flavor)+quantity>flavorStock){notify("Não há estoque disponível para este sabor");return}
 }
 if(cart[key])cart[key].q+=quantity;
 else cart[key]={id:id,n:n,flavor:flavor||"",p:pr,q:quantity,contents:parts};
 upd();notify("Adicionado ao carrinho");
}
function closeProductDialog(){
 $("product-modal").hidden=true;
 pendingProduct=null;
 if(productDialogTrigger&&productDialogTrigger.isConnected)productDialogTrigger.focus();
}
function updateProductDialog(){
 if(!pendingProduct)return;
 var product=pendingProduct,current=stockFor(product.id),remaining=Number.isInteger(current.stock)?Math.max(0,current.stock-countInCart(product.id)):null;
 var quantityField=$("product-quantity-field"),flavorField=$("product-flavor-field"),dialog=$("product-dialog"),quantity=Number($("product-quantity").value),valid=Number.isInteger(quantity)&&quantity>0&&(remaining===null||quantity<=remaining);
 if(product.c==="essencias"){
  dialog.classList.remove("quantity-mode");dialog.classList.add("essence-mode");
  var flavors=current.flavors;
  flavorField.hidden=false;quantityField.hidden=true;
  $("product-dialog-title").textContent="Escolha o sabor da essência";
  $("product-flavor").innerHTML=flavors.map(function(flavor){
   var available=Number.isInteger(current.flavor_stock[flavor])?Math.max(0,current.flavor_stock[flavor]-countFlavorInCart(product.id,flavor)):0;
   return '<option value="'+esc(flavor)+'" '+(available===0?"disabled":"")+'>'+esc(flavor)+" ("+available+" disponíveis)"+'</option>';
  }).join("");
  valid=valid&&flavors.length>0;
  var selectedFlavor=$("product-flavor").value;
  valid=valid&&Boolean(selectedFlavor)&&Number.isInteger(current.flavor_stock[selectedFlavor])&&current.flavor_stock[selectedFlavor]>countFlavorInCart(product.id,selectedFlavor);
  $("product-dialog-note").textContent=remaining===0?"Não há unidades disponíveis no estoque.":flavors.length?"Selecione um sabor com estoque disponível.":"Nenhum sabor cadastrado para esta essência no estoque.";
  if(!flavors.length)$("product-flavor").innerHTML='<option value="">Sem sabores cadastrados</option>';
 }else{
  dialog.classList.remove("essence-mode");dialog.classList.add("quantity-mode");
  flavorField.hidden=true;quantityField.hidden=false;
  $("product-dialog-title").textContent="Escolha a quantidade";
  $("product-quantity").max=remaining===null?"":remaining;
  $("product-dialog-note").textContent=remaining===0?"Não há unidades disponíveis no estoque.":"Escolha quantas unidades deseja adicionar.";
  valid=valid&&remaining!==0;
 }
 if(remaining!==null&&remaining>0&&quantity>remaining)$("product-dialog-note").textContent="Estoque disponível: "+remaining+" unidade(s).";
 $("product-dialog-total").textContent=R(product.p*(product.c==="essencias"?1:(valid?quantity:Math.max(1,quantity))));
 $("product-dialog-confirm").disabled=!valid||(!inventoryReady&&supabaseConfigured);
}
function openProductDialog(id,trigger){
 var product=P.filter(function(item){return item.id===id})[0];
 if(!product)return;
 pendingProduct=product;productDialogTrigger=trigger;
 $("product-dialog-title").textContent=product.n;
 $("product-dialog-description").textContent=product.c==="essencias"?"Escolha o sabor cadastrado para adicionar ao carrinho.":"Informe a quantidade antes de adicionar ao carrinho.";
 $("product-quantity").value="1";
 $("product-modal").hidden=false;
 updateProductDialog();
 $("product-dialog").focus();
}
function upd(){
 var ks=Object.keys(cart),c=0,s=0,h="";
 ks.forEach(function(k){
  var i=cart[k],name=i.n+(i.flavor?" — "+i.flavor:""),product=P.filter(function(candidate){return candidate.id===i.id})[0];
  var image=productImageSource(product);
  var thumbnail=image?'<img src="'+esc(image)+'" alt="" loading="lazy">':'<span aria-hidden="true">'+esc(product&&product.l||i.n.charAt(0).toUpperCase())+'</span>';
  c+=i.q;s+=i.q*i.p;
  h+='<div class="it"><div class="it-product"><div class="it-thumb" aria-hidden="true">'+thumbnail+'</div><div class="it-info"><strong>'+esc(name)+'</strong><small>'+R(i.p)+' cada</small></div></div><div class="q"><button type="button" data-m="'+esc(k)+'" aria-label="Diminuir '+esc(name)+'">−</button><span>'+i.q+'</span><button type="button" data-a="'+esc(k)+'" aria-label="Aumentar '+esc(name)+'">+</button></div></div>';
 });
 try{
  localStorage.setItem(CART_STORAGE_KEY,JSON.stringify(cart));
  cartStorageWarningShown=false;
 }catch{
  if(!cartStorageWarningShown){notify("Não foi possível salvar o carrinho neste navegador.");cartStorageWarningShown=true}
 }
 $("cn").textContent=c;$("tt").textContent=R(s);
 $("items").innerHTML=h||'<div class="empty"><span class="empty-icon" aria-hidden="true">🛒</span><strong>Seu carrinho está vazio</strong><span>Adicione produtos para montar seu pedido.</span><button type="button" class="empty-continue" id="empty-continue">Ver produtos</button></div>';
 var continueButton=$("empty-continue");
 if(continueButton)continueButton.onclick=function(){var productSection=document.querySelector("#essencias");$("dr").classList.remove("open");if(productSection)productSection.scrollIntoView({behavior:"smooth"})};
 $("checkout").style.display=ks.length?"block":"none";
 validateKit();
}
document.addEventListener("click",function(e){
 var t=e.target.closest("button");
 if(!t)return;
 var id=t.getAttribute("data-id");
 if(id){openProductDialog(id,t);return}
 var increase=t.getAttribute("data-a");
 if(increase){var item=cart[increase];add(item.id,item.n,item.p,item.flavor,increase,item.contents)}
 var m=t.getAttribute("data-m");
 if(m){if(--cart[m].q<=0)delete cart[m];upd()}
});
$("product-quantity").addEventListener("input",updateProductDialog);
$("product-quantity").addEventListener("change",updateProductDialog);
$("product-flavor").addEventListener("change",updateProductDialog);
$("product-dialog-cancel").onclick=closeProductDialog;
$("product-dialog-confirm").onclick=function(){
 if(!pendingProduct)return;
 var product=pendingProduct,flavor=product.c==="essencias"?$("product-flavor").value:"",quantity=product.c==="essencias"?1:Number($("product-quantity").value);
 if(product.c==="essencias"&&!flavor){updateProductDialog();return}
 add(product.id,product.n,product.p,flavor,undefined,undefined,quantity);
 closeProductDialog();
};
$("product-modal").addEventListener("click",function(event){if(event.target===$("product-modal"))closeProductDialog()});
document.addEventListener("keydown",function(event){if(event.key==="Escape"&&!$("product-modal").hidden)closeProductDialog()});
$("oc").onclick=function(){$("dr").classList.add("open")};
$("cl").onclick=$("bk").onclick=function(){$("dr").classList.remove("open")};
$("checkout-form").onsubmit=function(event){
 var lines=[];
 Object.keys(cart).forEach(function(key){
  var item=cart[key],contents=item.contents||[{id:item.id,quantity:1}];
  contents.forEach(function(content){
   var product=P.filter(function(candidate){return candidate.id===content.id})[0];
   lines.push({id:content.id,quantity:content.quantity*item.q,flavor:product&&product.c==="essencias"?item.flavor:""});
  });
 });
 if(!lines.length){event.preventDefault();return}
 try{
  localStorage.setItem("jayey.checkout.items.v1",JSON.stringify(lines));
 }catch{
 event.preventDefault();
 notify("Não foi possível iniciar o checkout neste navegador");
 }
};
$("q").oninput=function(){render(this.value.toLowerCase().trim())};
["filter-brand","filter-flavor","filter-min","filter-max"].forEach(function(id){$(id).addEventListener("input",function(){render($("q").value.toLowerCase().trim())});$(id).addEventListener("change",function(){render($("q").value.toLowerCase().trim())})});
function kitTotal(selection){
 if(!selection)return 0;
 var coal=P.filter(function(p){return p.id==="bass"})[0],aluminum=P.filter(function(p){return p.id==="alu"})[0];
 return selection.product.p+selection.coalQty*coal.p+selection.aluminumQty*aluminum.p;
}
function kupd(){
 var selection=kitSelection();
 $("kt").textContent=R(kitTotal(selection));
 validateKit();
}
["ks","kit-coal-qty","kit-alu-qty"].forEach(function(id){$(id).addEventListener("input",kupd);$(id).addEventListener("change",kupd)});
$("kadd").onclick=function(){
 var selection=validateKit();
 if(!selection)return;
 var name="Kit Sessão — "+selection.product.n+" ("+selection.flavor+") + "+selection.coalQty+"x Carvão Bass + "+selection.aluminumQty+"x Alumínio";
 var key="kit-"+selection.product.id+"-"+selection.flavor+"-"+selection.coalQty+"-"+selection.aluminumQty;
 add(key,name,kitTotal(selection),"","",selection.contents);
};
var io;
function obs(){
 if(!("IntersectionObserver" in window)){document.querySelectorAll(".rv").forEach(function(x){x.classList.add("in")});return}
 io=io||new IntersectionObserver(function(en){en.forEach(function(x){if(x.isIntersecting){x.target.classList.add("in");io.unobserve(x.target)}})},{threshold:.1});
 document.querySelectorAll(".rv:not(.in)").forEach(function(x){io.observe(x)});
}
try{loadCatalog()}catch(error){$("sync-status").textContent="Não foi possível carregar o catálogo: "+error.message}
try{loadCart()}catch(error){$("sync-status").textContent="Não foi possível recuperar o carrinho salvo: "+error.message}
renderCategoryMenu();updateFilterOptions();updateKitOptions();render("");upd();syncInventory();
