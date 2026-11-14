/* Independent of game rules, randomness and archive storage. */
(function (root) {
  'use strict';
  function create(env, config) {
    const noop={start(){},complete(){},sync(){},end(){}};
    try {
      const c=config||{},loc=env.location,doc=env.document;
      const production=c.environment==='production'&&loc.protocol==='https:'&&loc.hostname==='merrierstudio.github.io'&&(loc.pathname==='/bagen/'||loc.pathname==='/bagen/index.html');
      const validation=c.environment==='validation'&&['localhost','127.0.0.1'].includes(loc.hostname)&&c.productionWebsiteId&&c.websiteId!==c.productionWebsiteId;
      if(env.BagenTarget!=='browser'||!c.enabled||(!production&&!validation)||!c.websiteId||!c.gameVersion||!/^https:\/\//.test(c.scriptUrl||''))return noop;
      const key='bagen.analytics.visitor.v1';
      function random(){try{const words=new Uint32Array(4);env.crypto.getRandomValues(words);return Array.from(words,w=>w.toString(16).padStart(8,'0')).join('');}catch(_){return null;}}
      let visitor=null;
      try{visitor=env.localStorage.getItem(key);if(!/^[a-f0-9]{32}$/.test(visitor||'')){visitor=random();if(visitor)env.localStorage.setItem(key,visitor);}}catch(_){visitor=visitor||random();}
      let stopped=false,ready=false,busy=false,queue=[],match=null,timer;
      const path='/bagen/';
      function stop(){stopped=true;queue=[];env.clearTimeout(timer);}
      // Whitelist the complete payload, including automatic URL/referrer fields.
      env.BagenAnalyticsBeforeSend=function(type,payload){
        if(stopped||type!=='event'||(payload.name&&!['match_start','match_complete'].includes(payload.name)))return false;
        const clean={website:c.websiteId,hostname:production?'merrierstudio.github.io':loc.hostname,url:path,title:'拔根儿',referrer:'',language:env.navigator.language,screen:env.screen.width+'x'+env.screen.height,timestamp:payload.timestamp};
        if(visitor)clean.id=visitor;
        if(validation)clean.tag='bagen-validation';
        if(payload.name){clean.name=payload.name;clean.data=payload.data;}
        return clean;
      };
      function drain(){
        if(stopped||!ready||busy||!queue.length)return;
        busy=true;const item=queue.shift();
        timer=env.setTimeout(stop,10000);
        Promise.resolve().then(()=>env.umami.track(item)).catch(()=>{}).then(()=>{env.clearTimeout(timer);busy=false;drain();});
      }
      function enqueue(name,data){
        if(stopped)return;
        const item={timestamp:Math.floor(Date.now()/1000)};
        if(name){item.name=name;item.data=data;}
        queue.push(env.BagenAnalyticsBeforeSend('event',item));if(queue.length>32)queue.shift();drain();
      }
      function now(){try{const n=env.performance.now();return Number.isFinite(n)?n:null;}catch(_){return null;}}
      function close(){if(!match||match.since===null)return;const n=now();if(n===null||n<match.since)match.invalid=true;else match.duration+=n-match.since;match.since=null;}
      function sync(paused){if(!match||match.done)return;close();if(!paused&&!doc.hidden)match.since=now();if(!paused&&!doc.hidden&&match.since===null)match.invalid=true;}
      const api={
        start(paused){close();const id=random();match=id?{id,done:false,duration:0,since:null,invalid:false}:null;if(!match)return;enqueue('match_start',{schema_version:1,match_id:id,game_version:c.gameVersion});sync(paused);},
        complete(playerWon){if(!match||match.done)return;close();match.done=true;const data={schema_version:1,match_id:match.id,game_version:c.gameVersion,result:playerWon?'win':'loss'};if(!match.invalid&&Number.isFinite(match.duration))data.active_duration_ms=Math.round(match.duration);enqueue('match_complete',data);},
        sync,
        end(){close();match=null;}
      };
      enqueue();
      const script=doc.createElement('script');script.src=c.scriptUrl;script.async=true;script.referrerPolicy='no-referrer';
      const attrs={'data-website-id':c.websiteId,'data-auto-track':'false','data-exclude-search':'true','data-exclude-hash':'true','data-before-send':'BagenAnalyticsBeforeSend'};
      if(visitor)attrs['data-distinct-id']=visitor;
      Object.keys(attrs).forEach(k=>script.setAttribute(k,attrs[k]));
      timer=env.setTimeout(stop,10000);
      script.onload=()=>{if(stopped)return;env.clearTimeout(timer);if(!env.umami||typeof env.umami.track!=='function'){stop();return;}ready=true;drain();};script.onerror=stop;
      doc.head.appendChild(script);
      // Even unexpected adapter errors must never escape into game callbacks.
      Object.keys(api).forEach(k=>{const fn=api[k];api[k]=(...args)=>{try{return fn(...args);}catch(_){stop();}};});
      return api;
    }catch(_){return noop;}
  }
  if(typeof module==='object'&&module.exports)module.exports={create};
  else root.BagenAnalytics={create};
})(typeof window==='object'?window:globalThis);
