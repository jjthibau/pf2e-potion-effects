import {transport} from './transport.js';
export const ID='pf2e-potion-effects';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const eligible=i=>i?.actor?.isOfType('character')&&i.isOfType('consumable')&&i.category==='potion';
const busy=new Set();let request,originalConsume;
export async function effects(item){
 const override=item.getFlag(ID,'effect');if(override===false)return [];
 const uuids=override?[override]:[...item.system.description.value.matchAll(/@UUID\[([^\]]+)\]/g)].map(m=>m[1]);
 if(!override&&(item.sourceId==='Compendium.pf2e.equipment-srd.Item.kORpovlPYicysr2g'||item.slug==='potion-of-quickness'))uuids.push('Compendium.pf2e.spell-effects.Item.ElkXovNrHB0Doi6O');
 const found=[];for(const uuid of new Set(uuids)){const effect=await fromUuid(uuid);if(effect?.isOfType('effect')&&!found.some(e=>e.uuid===effect.uuid))found.push(effect);}
 if(override&&!found.length)throw Error('The configured potion effect could not be found.');return found;
}
async function execute(actor,action,data){
 if(action!=='use')throw Error('Unknown potion action.');const item=actor.items.get(data.item);
 if(!eligible(item)||item.quantity<1||item.uses.value<1)throw Error('That potion is no longer available.');
 const choices=await effects(item),effect=choices.find(e=>e.uuid===data.effect);if(!effect)throw Error('That effect no longer belongs to this potion.');
 const source=effect.toObject();delete source._id;source.flags??={};source.flags[ID]={effect:effect.uuid,potion:item.sourceId??item.uuid,name:item.name};source.system.context={origin:{actor:actor.uuid,item:item.uuid,token:actor.getActiveTokens(true,true)[0]?.uuid??null},target:null,roll:null};
 // A fresh native instance owns its duration and grants, independent of the consumed item.
 const created=await actor.createEmbeddedDocuments('Item',[source]);if(!created.length)return {status:'cancelled'};
 try{await originalConsume.call(item,1);}catch(e){await actor.deleteEmbeddedDocuments('Item',created.map(i=>i.id));throw e;}
 return {status:'used',effects:created.map(i=>i.id),actor:actor.uuid};
}
export async function use(item){
 if(!item.actor.isOwner)throw Error('Character ownership is required.');if(busy.has(item.uuid))return;busy.add(item.uuid);
 try{
  const choices=await effects(item);if(!choices.length)return originalConsume.call(item,1);
  let effect=choices[0];if(choices.length>1){const selected=await foundry.applications.api.DialogV2.wait({window:{title:'Potion Effect'},content:`<p>Choose the effect for ${esc(item.name)}.</p><select>${choices.map((e,i)=>`<option value="${i}">${esc(e.name)}</option>`).join('')}</select>`,buttons:[{action:'use',label:'Drink potion',default:true,callback:(_e,_b,d)=>Number(d.element.querySelector('select').value)},{action:'cancel',label:'Cancel',callback:()=>false}],rejectClose:false});if(selected===null||selected===false)return;effect=choices[selected];}
  return request(item.actor,'use',{item:item.id,effect:effect.uuid});
 }finally{busy.delete(item.uuid);}
}
Hooks.once('ready',()=>{
 request=transport(ID,execute);const proto=CONFIG.PF2E.Item.documentClasses.consumable.prototype;originalConsume=proto.consume;
 proto.consume=async function(...args){if(eligible(this))return use(this);return originalConsume.apply(this,args);};
 game.modules.get(ID).api={effects,use,request:(a,action,data)=>request(a,action,data)};
 Hooks.on('renderConsumableSheetPF2e',async(sheet,html)=>{
  const item=sheet.item;if(item.category!=='potion'||!sheet.isEditable)return;const root=html instanceof HTMLElement?html:html[0],panel=root.querySelector('[data-tab="details"]');if(!panel||panel.querySelector('.potion-effects-config'))return;
  const box=document.createElement('div');box.className='form-group potion-effects-config';const value=item.getFlag(ID,'effect');box.innerHTML=`<label>Potion effect UUID</label><div class="form-fields"><input type="text" placeholder="Automatic from potion" value="${esc(typeof value==='string'?value:'')}" aria-label="Potion effect UUID"></div><p class="hint">Optional native effect override. Leave blank for automatic detection.</p>`;panel.append(box);
  box.querySelector('input').addEventListener('change',async event=>{try{const uuid=event.target.value.trim();if(uuid){const effect=await fromUuid(uuid);if(!effect?.isOfType('effect'))throw Error('Choose a native PF2e effect.');await item.setFlag(ID,'effect',uuid);}else await item.unsetFlag(ID,'effect');}catch(e){ui.notifications.warn(e.message);}});
 });
});
