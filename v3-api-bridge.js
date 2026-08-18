/* V3 UI -> authenticated backend API bridge */
(function(){
  const API='/api'; let authUser=null;
  const json=async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('API '+r.status));return d;};
  window.V3API={
    async me(){const d=await json(await fetch(API+'/auth/me',{credentials:'include'}));authUser=d.user||null;return authUser;},
    async login(email,password){const d=await json(await fetch(API+'/auth/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})}));authUser=d.user;return authUser;},
    async register(email,password,nickname){const d=await json(await fetch(API+'/auth/register',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,nickname})}));authUser=d.user;return authUser;},
    async logout(){await json(await fetch(API+'/auth/logout',{method:'POST',credentials:'include'}));authUser=null;},
    async settings(){return json(await fetch(API+'/settings',{credentials:'include'}));},
    async saveSettings(data){return json(await fetch(API+'/settings',{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}));},
    async today(){return json(await fetch(API+'/study/today',{credentials:'include'}));},
    async cards(){return json(await fetch(API+'/cards',{credentials:'include'}));},
    async words(params){const q=params?('?'+new URLSearchParams(params).toString()):'';return json(await fetch(API+'/words'+q,{credentials:'include'}));},
    async syncStudy(){return json(await fetch(API+'/sync/study',{credentials:'include'}));},
    async review(payload){return json(await fetch(API+'/reviews',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}));},
    async vocabularies(){return json(await fetch(API+'/vocabularies',{credentials:'include'}));},
    async vocabulary(id){return json(await fetch(API+'/vocabularies/'+encodeURIComponent(id),{credentials:'include'}));},
    async selectVocabulary(id,enabled){return json(await fetch(API+'/vocabularies/'+encodeURIComponent(id)+'/selection',{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled})}));},
    user(){return authUser;}
  };
  window.V3APIReady=window.V3API.me().catch(()=>null);
})();
