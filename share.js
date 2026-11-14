(function (scope) {
  'use strict';
  class ResultShare {
    constructor(env, changed, notify) { this.env=env;this.changed=changed;this.notify=notify;this.items={};this.active=null; }
    prepare(won, retry) {
      const key=won?'won':'lost';
      if(this.items[key]&&!retry)return this.items[key];
      const item={key:key,url:'./assets/'+(won?'ShareWon':'ShareLost')+'.png',status:'loading',file:null};
      this.items[key]=item;
      item.ready=(async()=>{
        try {
          const response=await this.env.fetch(item.url);
          if(!response.ok)throw Error('image request failed');
          const blob=await response.blob();
          if(!blob.size||blob.type.split(';')[0]!=='image/png')throw Error('invalid image');
          item.file=new this.env.File([blob],'bagen-'+key+'.png',{type:'image/png'});item.status='ready';
        } catch (_) { item.status='error'; }
        this.changed();
      })();
      return item;
    }
    share(won) {
      if(this.active)return;
      const item=this.prepare(won),nav=this.env.navigator;
      if(item.status==='error'){this.prepare(won,true);this.changed();return;}
      if(item.status!=='ready')return;
      const data={files:[item.file]};
      try {
        if(!this.env.isSecureContext||typeof nav.share!=='function'||typeof nav.canShare!=='function'||!nav.canShare(data)){
          this.notify('当前环境暂不支持图片分享');return;
        }
        this.active=item;this.changed();
        // Call in the click handler, without awaiting image loading or an animation.
        return Promise.resolve(nav.share(data)).then(()=>{
          this.active=null;this.changed();
        },error=>{
          this.active=null;this.changed();
          if(!error||error.name!=='AbortError')this.notify('分享未能打开，请再试一次');
        });
      } catch (_) { this.active=null;this.changed();this.notify('分享未能打开，请再试一次'); }
    }
  }
  scope.BagenResultShare=ResultShare;
})(typeof window==='undefined'?globalThis:window);
