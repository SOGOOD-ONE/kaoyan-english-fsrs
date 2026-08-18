/* V3 UI -> authenticated backend API bridge */
(function(){
  const API='/api'; let authUser=null;
  const json=async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('API '+r.status));return d;};
  const request=async(path,options={})=>json(await fetch(API+path,{credentials:'include',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}}));
  window.V3API={
    async me(){const d=await json(await fetch(API+'/auth/me',{credentials:'include'}));authUser=d.user||null;return authUser;},
    async login(email,password){const d=await request('/auth/login',{method:'POST',body:JSON.stringify({email,password})});authUser=d.user;return authUser;},
    async register(email,password,nickname){const d=await request('/auth/register',{method:'POST',body:JSON.stringify({email,password,nickname})});authUser=d.user;return authUser;},
    async logout(){await request('/auth/logout',{method:'POST'});authUser=null;},
    async settings(){return request('/settings');},
    async saveSettings(data){return request('/settings',{method:'PUT',body:JSON.stringify(data)});},
    async today(){return request('/study/today');},
    async progress(){return request('/study/today/progress');},
    async cards(){return request('/cards');},
    async card(id){return request('/cards/'+encodeURIComponent(id));},
    async updateCard(id,data){return request('/cards/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify(data)});},
    async words(params){const q=params?('?'+new URLSearchParams(params).toString()):'';return request('/words'+q);},
    async syncStudy(){return request('/sync/study');},
    async review(payload){return request('/reviews',{method:'POST',body:JSON.stringify(payload)});},
    async vocabularies(){return request('/vocabularies');},
    async vocabulary(id){return request('/vocabularies/'+encodeURIComponent(id));},
    async selectVocabulary(id,enabled){return request('/vocabularies/'+encodeURIComponent(id)+'/selection',{method:'PUT',body:JSON.stringify({enabled})});},
    user(){return authUser;}
  };
  window.V3APIReady=window.V3API.me().catch(()=>null);
})();