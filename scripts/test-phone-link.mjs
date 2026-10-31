import {test} from 'node:test';import assert from 'node:assert/strict';import {tunnelUrl,verifyPhoneLink} from './phone-link.mjs';
test('extracts only an HTTPS temporary Cloudflare hostname',()=>{assert.equal(tunnelUrl('https://docs.cloudflare.com; https://one-two-3.trycloudflare.com'),'https://one-two-3.trycloudflare.com');assert.equal(tunnelUrl('http://one.trycloudflare.com'),null);});
test('requires both a JSON API and built application before advertising a phone link',async()=>{
 const make=(body,status=200,content='text/html')=>new Response(body,{status,headers:{'content-type':content}});
 const responses=[make('{}',200,'application/json'),make('<div id="root"></div><script src="/assets/app.js"></script>')];
 assert.equal(await verifyPhoneLink('https://sample.trycloudflare.com',async()=>responses.shift()),true);
 assert.equal(await verifyPhoneLink('https://sample.trycloudflare.com',async()=>make('Tunnel unavailable',502)),false);
 assert.equal(await verifyPhoneLink('https://sample.trycloudflare.com',async()=>make('<html>Gateway error</html>')),false);
});
test('DNS fallback never applies to unrelated hosts or certificate failures',async()=>{
 const {publicRequest}=await import('./phone-link.mjs');const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;throw Object.assign(new Error('lookup failed'),{cause:{code:'ENOTFOUND'}});};await assert.rejects(publicRequest('https://example.com/login'),/lookup failed/);assert.equal(calls,1);
 globalThis.fetch=async()=>{throw Object.assign(new Error('certificate failed'),{cause:{code:'CERT_HAS_EXPIRED'}});};await assert.rejects(publicRequest('https://one.trycloudflare.com/login'),/certificate failed/);
 }finally{globalThis.fetch=original;}
});
