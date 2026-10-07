import assert from 'node:assert/strict';
import {test} from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('provider fetch options are valid in the actual Cloudflare runtime',async()=>{
 const bundled=await build({stdin:{contents:`import {providerText} from './functions/_video-chat/provider.mjs';

 export default {async fetch(){
  let calls=0;
  const context={systemPrompt:'Test',userPrompt:'Test',maxOutputTokens:1,signal:new AbortController().signal};
  const result=await providerText(context,{OPENAI_API_KEY:'test-only'},async(url,options)=>{
   const native=new Request(url,options);
   if(native.redirect!=='manual') throw Error('Redirects must not be followed');
   calls++;
   return Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Ready'}]}]});
  });
  return Response.json({result,calls});
 }}`,resolveDir:fileURLToPath(new URL('../..',import.meta.url)),sourcefile:'provider-runtime-entry.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-04-09',script:bundled.outputFiles[0].text}));
 try{assert.deepEqual(await(await mf.dispatchFetch('https://test.invalid')).json(),{result:'Ready',calls:1});}
 finally{await mf.dispose();}
});

async function speechRuntime() {
  const bundled = await build({
    stdin: { contents: `
    import { generateSpeech } from './functions/_video-chat/speech.mjs';
    export default { async fetch() {
      let calls = 0;
      const result = await generateSpeech({text:'Hi, café!',signal:new AbortController().signal}, {OPENAI_API_KEY:'test-only'}, async (url, options) => {
        const native = new Request(url, options);
        if (native.redirect !== 'manual') throw Error('Redirects must not be followed');
        if (native.headers.get('Authorization') !== 'Bearer test-only') throw Error('Missing server credential');
        const body = await native.json();
        if (url !== 'https://api.openai.com/v1/audio/speech') throw Error('Wrong provider');
        if (body.voice !== 'marin' || body.model !== 'gpt-4o-mini-tts' || body.response_format !== 'mp3' || body.input !== 'Hi, café!') throw Error('Wrong fixed speech configuration');
        calls++;
        return new Response(new Uint8Array([73,68,51]), {headers:{'Content-Type':'audio/mpeg'}});
      });
      return Response.json({...result,audio:Array.from(result.audio),calls});
    }}`,
    resolveDir: fileURLToPath(new URL('../..', import.meta.url)), sourcefile: 'speech-runtime-entry.mjs' },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  });
  return new Miniflare(convertV4MiniflareOptions({
    modules: true, compatibilityDate: '2026-04-09', script: bundled.outputFiles[0].text,
  }));
}

test('OpenAI speech request and raw MP3 work in the actual Cloudflare runtime', async () => {
  const mf = await speechRuntime();
  try {
    assert.deepEqual(await (await mf.dispatchFetch('https://test.invalid/raw')).json(), {
      audio: [73, 68, 51], mediaType: 'audio/mpeg', calls: 1,
    });
  } finally { await mf.dispose(); }
});
