(function (scope) {
  'use strict';
  function bytes(text) { let n=0; for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c<128)n++;else if(c<2048)n+=2;else if(c>=0xd800&&c<=0xdbff&&i+1<text.length){n+=4;i++;}else n+=3;}return n; }
  class Archive {
    constructor(storage) { this.storage=storage; this.loaded=false; this.busy=false; this.value=null; }
    decode(raw) {
      if(raw===null)return null;
      const envelope=JSON.parse(raw);
      if(!envelope || envelope.format!=='bagen-save-v1' || typeof envelope.body!=='string' || scope.BagenCore.checksum(envelope.body)!==envelope.checksum)throw Error('收藏记录完整性检查失败，原记录保留。');
      const value=JSON.parse(envelope.body);new scope.BagenRules.Game({archive:value});return value;
    }
    async load() { this.loaded=false;const value=this.decode(await this.storage.read());this.value=value;this.loaded=true;return value; }
    async commit(next, expectedID) {
      if(!this.loaded)throw Error('请先恢复收藏读取，原记录保留。');
      if(this.busy)throw Error('正在保存，请稍候。');
      const body=JSON.stringify(next),raw=JSON.stringify({format:'bagen-save-v1',body:body,checksum:scope.BagenCore.checksum(body)});
      this.decode(raw);if(bytes(raw)>1048576)throw Error('收藏超过当前单条存储容量，原记录已保留；请反馈以处理存储扩容。');
      this.busy=true;
      try{
        const current=this.decode(await this.storage.read());
        if(current&&current.commitID===next.commitID){if(JSON.stringify(current)!==body)throw Error('同一提交内容不一致，原记录保留。');this.value=current;return current;}
        if((current?current.commitID:'')!==expectedID)throw Error('收藏已在其他页面更新，请保留本页并反馈，避免覆盖。');
        await this.storage.write(raw);
        const verified=this.decode(await this.storage.read());
        if(!verified||JSON.stringify(verified)!==body)throw Error('保存尚未确认，请重试同一结果。');
        this.value=verified;return verified;
      }finally{this.busy=false;}
    }
  }
  scope.BagenSave={Archive:Archive};
})(typeof window==='undefined'?globalThis:window);
