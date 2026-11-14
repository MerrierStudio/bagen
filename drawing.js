(function (scope) {
  'use strict';
  const names=['OpponentReference','Kids','ClosedTin','OpenTin','Petiole','Pinch','Bowl','Shoe','PoplarLeaves','LeafSearchBacking','Victory','CardLu','CardWu','MarbleYellow','MarbleBlue','MarbleRed'];
  const images={};
  function load(){return Promise.all(names.map(name=>new Promise(resolve=>{const img=new Image();images[name]=img;img.onload=()=>resolve(null);img.onerror=()=>resolve(name);img.src='./assets/'+name+(['PoplarLeaves','LeafSearchBacking'].includes(name)?'.jpg':'.png');}))).then(failed=>failed.filter(Boolean));}
  function bezier(a,b,c,d,t){const s=1-t;return{x:s*s*s*a.x+3*s*s*t*b.x+3*s*t*t*c.x+t*t*t*d.x,y:s*s*s*a.y+3*s*s*t*b.y+3*s*t*t*c.y+t*t*t*d.y};}
  function image(ctx,name,x,y,w,h){const img=images[name];if(img&&img.complete&&img.naturalWidth)ctx.drawImage(img,x,y,w,h);}
  function sprite(ctx,root,x,y,height,angle){ctx.save();ctx.translate(x,y);ctx.rotate(angle||0);if('filter'in ctx)ctx.filter=root.rarity===1?'brightness(.82) saturate(.85)':root.rarity===2?'brightness(.92) saturate(.6)':'none';image(ctx,'Petiole',-height*.063,-height/2,height*.126,height);ctx.restore();}
  function gather(ctx,w,h,roots,age,reduced){
    ctx.fillStyle='#fcf5e0';ctx.fillRect(0,0,w,h);
    const iw=Math.max(w,h*836/1881),ih=iw*1881/836,ox=(w-iw)/2,oy=(h-ih)/2;
    const fade=age<.64?1:Math.max(0,1-(age-.64)/.58);
    ctx.save();ctx.globalAlpha=fade;image(ctx,'PoplarLeaves',ox,oy,iw,ih);
    const starts=[[590,565],[180,950],[620,1190]];
    if(age>0&&!reduced){starts.forEach((p,i)=>{const x=ox+p[0]/836*iw,y=oy+p[1]/1881*ih,dir=i===1?-1:1,travel=age<.28?age/.28*18:age<.64?18+(age-.28)/.36*20:38;ctx.save();ctx.beginPath();ctx.ellipse(x,y,iw*.12,ih*.055,i*.7,0,Math.PI*2);ctx.clip();image(ctx,'LeafSearchBacking',ox,oy,iw,ih);ctx.translate(dir*travel*iw/836,-travel*.35*iw/836);image(ctx,'PoplarLeaves',ox,oy,iw,ih);ctx.restore();});}
    ctx.restore();
    if(roots.length&&age>=.28&&!reduced){roots.forEach((r,i)=>{const p=starts[i],blend=Math.max(0,Math.min(1,(age-.64)/.58)),x=(ox+p[0]/836*iw)*(1-blend)+w*(i+.5)/3*blend,y=(oy+p[1]/1881*ih-45)*(1-blend)+90*blend;ctx.save();ctx.globalAlpha=Math.min(1,(age-.28)/.2);sprite(ctx,r,x,y,100,((i-1)*13)*(1-blend)*Math.PI/180);ctx.restore();});}
  }
  function selectionLayout(w,h){
    const scale=Math.min(w/390*.84,h/390,.96);
    return {scale:scale,x:(w-280*scale)/2,y:2,width:280*scale,height:136*scale};
  }
  function opponent(ctx,w,h){
    const layout=selectionLayout(w,h),s=layout.scale;
    // Only the supplied portrait pixels are displayed; no root information enters this view.
    const portrait=images.OpponentReference;
    if(portrait&&portrait.complete&&portrait.naturalWidth){
      ctx.drawImage(portrait,300,500,260,340,(w-140*s)/2,layout.y+layout.height+5*s,140*s,140*s*340/260);
    }
    ctx.save();ctx.translate(layout.x,layout.y);ctx.scale(s,s);
    ctx.beginPath();ctx.moveTo(96,113);
    ctx.bezierCurveTo(41,109,1,96,1,58);
    ctx.bezierCurveTo(0,22,32,8,76,5);
    ctx.bezierCurveTo(122,-1,166,2,205,7);
    ctx.bezierCurveTo(251,12,279,28,279,57);
    ctx.bezierCurveTo(277,96,244,111,188,114);
    ctx.bezierCurveTo(155,116,133,115,111,115);
    ctx.bezierCurveTo(105,117,105,127,108,135);
    ctx.bezierCurveTo(102,131,98,121,96,113);
    ctx.closePath();ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.lineJoin='round';ctx.stroke();ctx.restore();
  }
  function battle(ctx,w,h,options){
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
    if(options.preview){opponent(ctx,w,h);return;}
    const roots=options.roots,preview=options.preview,elapsed=options.elapsed||0,finish=options.finishAge||0,broken=options.broken;
    const tension=options.held?Math.min(1,.65+elapsed*.18):0,positions=[],paths=[],cx=w/2,cy=h/2;
    for(let i=0;i<4;i++){const end=options.ends&&options.ends[i%2],phase=elapsed*1.7+(i%2)*.15,pull=i>=2?(end||{x:0,y:0}):{x:preview?0:.62+.2*Math.sin(phase),y:preview?0:.45+.12*Math.sin(phase)};positions.push({x:w*(i%2 ? .66 : .34)+(i%2?1:-1)*pull.x*w*.06,y:h*(i<2?.27:.73)+(i<2?-1:1)*pull.y*h*.015});}
    for(let side=0;side<2;side++){
      const sign=side===0?1:-1,recoil=broken===side?Math.min(1,finish*5)*35:0,a=positions[side*2],d=positions[side*2+1],mid={x:cx,y:cy+sign*10-sign*recoil},slack=(1-tension)*8;
      const left={x:cx-19-slack,y:cy-sign*18-sign*recoil},right={x:cx+19+slack,y:cy-sign*18-sign*recoil},pts=[];
      for(let i=0;i<=120;i++){
        if(i<12)pts.push({x:a.x-26+26*i/12,y:a.y});
        else if(i<=60)pts.push(bezier(a,{x:a.x+45,y:a.y},{x:left.x,y:mid.y},mid,(i-12)/48));
        else if(i<=108)pts.push(bezier(mid,{x:right.x,y:mid.y},{x:d.x-45,y:d.y},d,(i-60)/48));
        else pts.push({x:d.x+26*(i-108)/12,y:d.y});
      }paths.push(pts);
    }
    function hand(i,tips){const p=positions[i];ctx.save();ctx.translate(p.x,p.y);ctx.rotate(i%2?-Math.PI/2:Math.PI/2);if(i<2)ctx.scale(-1,1);if(tips){ctx.beginPath();ctx.rect(-32,-14,64,19);ctx.clip();}image(ctx,'Pinch',-32,-14,64,112);ctx.restore();}
    function stalk(side,from,to){const tex=images.Petiole,r=roots[side]||roots[0];if(!tex||!tex.naturalWidth)return;ctx.save();if('filter'in ctx&&r.rarity===2)ctx.filter='brightness(.7) saturate(.6)';for(let i=from;i<to;i++){
      if(broken===side&&i>=54&&i<=66)continue;const a=paths[side][i],b=paths[side][i+1],dx=b.x-a.x,dy=b.y-a.y,len=Math.sqrt(dx*dx+dy*dy),width=(13+r.appearanceSeed%6+Math.sin(i*.2)*.8)*(i<12||i>=108?.45:1);
      ctx.save();ctx.translate(a.x,a.y);ctx.rotate(Math.atan2(dy,dx)-Math.PI/2);ctx.drawImage(tex,0,i*tex.naturalHeight/120,tex.naturalWidth,Math.min(tex.naturalHeight-i*tex.naturalHeight/120,tex.naturalHeight/120+1),-width/2,-.3,width,len+.7);ctx.restore();
    }ctx.restore();}
    for(let i=0;i<(preview?2:4);i++)hand(i,false);
    if(!preview)stalk(1,0,120);stalk(0,0,120);
    if(!preview&&broken===null){const crossing=[];for(let i=61;i<100;i++)if(Math.abs(paths[1][i].y-cy)<8)crossing.push(i);if(crossing.length)stalk(1,crossing[0],crossing[crossing.length-1]+1);}
    for(let i=0;i<(preview?2:4);i++){
      hand(i,true);const p=positions[i],sx=i%2?1:-1,y=p.y+(i<2?-32:32),end=p.x+sx*34;ctx.strokeStyle=i<2||options.held?'#168cff':'#171717';ctx.lineWidth=2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p.x+sx*8,y);ctx.lineTo(end,y);ctx.moveTo(end-sx*9,y-7);ctx.lineTo(end,y);ctx.lineTo(end-sx*9,y+7);ctx.stroke();
    }
    if(!preview&&broken!==null){const p=paths[broken][60];ctx.strokeStyle='#916739';ctx.lineWidth=1;for(let i=0;i<8;i++){const a=i*2.4,r=Math.min(1,finish*4)*(12+i*4);ctx.beginPath();ctx.moveTo(p.x+Math.cos(a)*r,p.y+Math.sin(a)*r);ctx.lineTo(p.x+Math.cos(a)*(r+5),p.y+Math.sin(a)*(r+5));ctx.stroke();}ctx.fillStyle='#111';ctx.font='40px LongCang';ctx.textAlign='center';ctx.fillText('啪！',cx,cy-75);}
  }
  scope.BagenDrawing={selectionLayout:selectionLayout,load:load,gather:gather,battle:battle};
})(window);
