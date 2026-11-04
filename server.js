import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomBytes } from 'node:crypto';

const app=express();const http=createServer(app);const io=new Server(http);app.use(express.static('public'));
const rooms=new Map();const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function code(){let c;do{c=Array.from({length:6},()=>alphabet[Math.floor(Math.random()*alphabet.length)]).join('')}while(rooms.has(c));return c}
function clamp(n,min,max){n=Number(n);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.floor(n))):min}
function token(){return randomBytes(24).toString('hex')}
function createRoom(opts){const nb=clamp(opts?.buyers,1,100),ns=clamp(opts?.sellers,1,100),minutes=clamp(opts?.minutes,1,60);const rand=(a,b)=>a+Math.floor(Math.random()*(b-a+1));return {code:code(),hostToken:token(),phase:'lobby',minutes,remaining:minutes*60,endsAt:null,participants:[...Array.from({length:nb},(_,i)=>({id:`B${i+1}`,role:'buyer',value:rand(35,100),joined:false,used:false})),...Array.from({length:ns},(_,i)=>({id:`S${i+1}`,role:'seller',cost:rand(15,80),joined:false,used:false}))],orders:[],trades:[],events:[],seq:0,createdAt:Date.now()}}
function live(r){if(r.phase==='trading'&&r.endsAt&&Date.now()>=r.endsAt){r.phase='ended';r.remaining=0;r.endsAt=null;r.orders=[]}return r.phase==='trading'}
function left(r){return r.phase==='trading'?Math.max(0,Math.ceil((r.endsAt-Date.now())/1000)):r.remaining}
function benchmark(r){const b=r.participants.filter(p=>p.role==='buyer').map(p=>p.value).sort((a,b)=>b-a),s=r.participants.filter(p=>p.role==='seller').map(p=>p.cost).sort((a,b)=>a-b);let q=0,welfare=0;while(q<Math.min(b.length,s.length)&&b[q]>=s[q]){welfare+=b[q]-s[q];q++}const low=q?s[q-1]:null,high=q?b[q-1]:null;return {quantity:q,maxSurplus:welfare,priceInterval:q?[low,high]:null}}
function summary(r,host=false){live(r);const gains=r.trades.reduce((a,t)=>a+t.buyerSurplus+t.sellerSurplus,0),bench=benchmark(r);return {code:r.code,phase:r.phase,remaining:left(r),minutes:r.minutes,counts:{buyers:r.participants.filter(p=>p.role==='buyer').length,sellers:r.participants.filter(p=>p.role==='seller').length,joined:r.participants.filter(p=>p.joined).length},orders:r.orders.map(o=>({id:o.id,owner:o.owner,role:o.role,price:o.price})),trades:r.trades,benchmark:host?bench:null,efficiency:bench.maxSurplus?Math.round(gains/bench.maxSurplus*100):null,participants:host?r.participants.map(({id,role,value,cost,joined,used})=>({id,role,value,cost,joined,used})):undefined,events:host?r.events.slice(-80):undefined}}
function emit(r){io.to(r.code).emit('market',summary(r));io.to(`${r.code}:host`).emit('hostMarket',summary(r,true))}
function fail(ack,message){ack?.({ok:false,error:message})}
function withRoom(data,ack){const r=rooms.get(String(data?.code||'').toUpperCase());if(!r){fail(ack,'Invalid market code');return null}return r}
function isHost(socket,r,data){return socket.data.hostCode===r.code&&socket.data.hostToken===r.hostToken&&data?.hostToken===r.hostToken}
function own(socket,r){return r.participants.find(p=>p.id===socket.data.participantId&&socket.data.roomCode===r.code&&socket.data.participantToken===r.tokens?.get(p.id))}
io.on('connection',socket=>{
 socket.on('create',(data,ack)=>{const r=createRoom(data);r.tokens=new Map();rooms.set(r.code,r);socket.join(r.code);socket.join(`${r.code}:host`);socket.data.hostCode=r.code;socket.data.hostToken=r.hostToken;ack?.({ok:true,code:r.code,hostToken:r.hostToken});emit(r)});
 socket.on('hostJoin',(data,ack)=>{const r=withRoom(data,ack);if(!r)return;if(data.hostToken!==r.hostToken)return fail(ack,'Invalid instructor token');socket.data.hostCode=r.code;socket.data.hostToken=r.hostToken;socket.join(r.code);socket.join(`${r.code}:host`);ack?.({ok:true});emit(r)});
 socket.on('join',(data,ack)=>{
  const r=withRoom(data,ack);if(!r)return;
  if(r.phase==='ended')return fail(ack,'Round has ended');
  // Reconnect only with the secret token issued on the original join.
  let p=null,t=null;
  if(data.participantToken){
   for(const [id,secret] of r.tokens){if(secret===data.participantToken){p=r.participants.find(x=>x.id===id);t=secret;break}}
   if(!p)return fail(ack,'Invalid reconnect token');
  }else{
   if(r.phase!=='lobby')return fail(ack,'Joining is closed after trading begins');
   // Seller slots are allocated first, followed by buyer slots.
   p=r.participants.find(x=>x.role==='seller'&&!x.joined)||r.participants.find(x=>x.role==='buyer'&&!x.joined);
   if(!p)return fail(ack,'This classroom market is full');
   t=token();r.tokens.set(p.id,t);p.joined=true;
  }
  socket.data.roomCode=r.code;socket.data.participantId=p.id;socket.data.participantToken=t;
  socket.join(r.code);
  ack?.({ok:true,participantToken:t,private:{id:p.id,role:p.role,value:p.value,cost:p.cost}});emit(r);
 });
 socket.on('control',(data,ack)=>{const r=withRoom(data,ack);if(!r)return;if(!isHost(socket,r,data))return fail(ack,'Instructor access required');if(data.action==='start'&&r.phase!=='ended'){r.endsAt=Date.now()+left(r)*1000;r.phase='trading'}else if(data.action==='pause'&&r.phase==='trading'){r.remaining=left(r);r.endsAt=null;r.phase='paused'}else if(data.action==='end'){r.phase='ended';r.remaining=left(r);r.endsAt=null;r.orders=[]}else return fail(ack,'Invalid control action');ack?.({ok:true});emit(r)});
 socket.on('post',(data,ack)=>{const r=withRoom(data,ack);if(!r)return;const p=own(socket,r);if(!p)return fail(ack,'Join as a student first');if(!live(r))return fail(ack,'Trading is closed');if(p.used)return fail(ack,'You already traded');const price=Number(data.price);if(!Number.isFinite(price)||price<0||price>200||Math.round(price*100)!==price*100)return fail(ack,'Enter a price between $0 and $200, to cents');if(p.role==='buyer'&&price>p.value||p.role==='seller'&&price<p.cost)return fail(ack,'Offer would give you negative surplus');r.orders=r.orders.filter(o=>o.owner!==p.id);r.orders.push({id:++r.seq,owner:p.id,role:p.role,price});r.events.push({kind:'posted',owner:p.id,role:p.role,price});ack?.({ok:true});emit(r)});
 socket.on('accept',(data,ack)=>{const r=withRoom(data,ack);if(!r)return;const p=own(socket,r);if(!p)return fail(ack,'Join as a student first');if(!live(r)||p.used)return fail(ack,'Trading unavailable');const o=r.orders.find(o=>o.id===Number(data.orderId));if(!o)return fail(ack,'Offer no longer available');if(o.role===p.role)return fail(ack,'Choose an offer from the opposite side');const other=r.participants.find(x=>x.id===o.owner);if(!other||other.used)return fail(ack,'Other participant already traded');const buyer=p.role==='buyer'?p:other,seller=p.role==='seller'?p:other;if(o.price>buyer.value||o.price<seller.cost)return fail(ack,'Price does not work for your private value or cost');buyer.used=true;seller.used=true;const trade={number:r.trades.length+1,buyer:buyer.id,seller:seller.id,price:o.price,buyerSurplus:buyer.value-o.price,sellerSurplus:o.price-seller.cost};r.trades.push(trade);r.events.push({kind:'trade',...trade});r.orders=r.orders.filter(x=>x.owner!==buyer.id&&x.owner!==seller.id);ack?.({ok:true,trade});emit(r)});
 socket.on('reject',(data,ack)=>{const r=withRoom(data,ack);if(!r)return;const p=own(socket,r);if(!p)return fail(ack,'Join first');const o=r.orders.find(x=>x.id===Number(data.orderId));if(!o||o.owner!==p.id)return fail(ack,'Only the owner can withdraw an offer');r.orders=r.orders.filter(x=>x.id!==o.id);r.events.push({kind:'withdrawn',owner:p.id,price:o.price});ack?.({ok:true});emit(r)});
});
setInterval(()=>{for(const r of rooms.values()){if(r.phase==='trading'){const before=r.phase;live(r);if(before!==r.phase)emit(r);else io.to(r.code).emit('clock',left(r))}}},1000);
const port=Number(process.env.PORT||3000);http.listen(port,()=>console.log(`MarketLab at http://localhost:${port}`));
