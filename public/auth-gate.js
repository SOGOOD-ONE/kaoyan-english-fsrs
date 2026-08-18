(() => {
  const API = "/api";
  const ROOT_ID = "auth-gate-root";
  const STYLE_ID = "auth-gate-style";
  const HIDE_ID = "auth-gate-hide";

  const css = `
    #${ROOT_ID}{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;background:linear-gradient(135deg,#f8fbff 0%,#eef4fb 100%);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#0f172a}
    #${ROOT_ID},#${ROOT_ID} *{box-sizing:border-box}
    #${ROOT_ID} .auth-wrap{width:min(920px,100%);display:grid;grid-template-columns:1.05fr .95fr;overflow:hidden;border:1px solid #e5eaf1;border-radius:24px;background:#fff;box-shadow:0 20px 60px rgba(15,23,42,.10)}
    #${ROOT_ID} .auth-intro{padding:52px;background:linear-gradient(145deg,#f8fbff,#eef6ff);display:flex;flex-direction:column;justify-content:center}
    #${ROOT_ID} .brand{display:flex;align-items:center;gap:12px;margin-bottom:34px}.brand-mark{width:42px;height:42px;border-radius:12px;background:#2563eb;color:#fff;display:grid;place-items:center;font-weight:800;font-size:20px}.brand-name{font-size:18px;font-weight:750}.brand-sub{font-size:12px;color:#64748b;margin-top:2px}
    #${ROOT_ID} .intro-title{font-size:32px;line-height:1.25;letter-spacing:-.5px;margin:0 0 14px}.intro-title strong{color:#2563eb}.intro-copy{font-size:14px;line-height:1.8;color:#64748b;margin:0 0 28px}.features{display:grid;gap:12px}.feature{display:flex;gap:10px;align-items:center;font-size:13px;color:#334155}.dot{width:8px;height:8px;border-radius:50%;background:#2563eb}
    #${ROOT_ID} .auth-panel{padding:42px}.auth-panel h2{font-size:24px;margin:0 0 7px}.auth-panel .desc{font-size:13px;color:#64748b;margin:0 0 25px}.tabs{display:flex;border-bottom:1px solid #e2e8f0;margin-bottom:22px}.tabs button{flex:1;border:0;background:none;padding:11px 0;font-size:14px;font-weight:650;color:#64748b;cursor:pointer;border-bottom:2px solid transparent}.tabs button.active{color:#2563eb;border-bottom-color:#2563eb}.form{display:grid;gap:15px}.field{display:grid;gap:7px}.field span{font-size:13px;font-weight:650}.field input{height:44px;width:100%;border:1px solid #dbe3ed;border-radius:10px;padding:0 13px;font-size:14px;outline:none;transition:.15s}.field input:focus{border-color:#60a5fa;box-shadow:0 0 0 3px #dbeafe}.submit{height:45px;border:0;border-radius:11px;background:#2563eb;color:#fff;font-size:14px;font-weight:700;cursor:pointer;margin-top:3px}.submit:hover{background:#1d4ed8}.submit:disabled{opacity:.6;cursor:not-allowed}.status{min-height:18px;margin:0;text-align:center;font-size:12px;color:#dc2626}.hint{font-size:11px;color:#94a3b8;text-align:center;margin:0}.hidden{display:none!important}
    @media(max-width:720px){#${ROOT_ID} .auth-wrap{grid-template-columns:1fr}#${ROOT_ID} .auth-intro{display:none}#${ROOT_ID} .auth-panel{padding:30px 24px}}
  `;

  function hideApp(){
    if(document.getElementById(HIDE_ID)) return;
    const s=document.createElement("style"); s.id=HIDE_ID;
    s.textContent=`body>*{visibility:hidden!important}#${ROOT_ID}{visibility:visible!important}`;
    document.head.appendChild(s);
  }
  function showApp(){document.getElementById(HIDE_ID)?.remove();document.getElementById(ROOT_ID)?.remove();}
  function ensureStyle(){if(document.getElementById(STYLE_ID))return;const s=document.createElement("style");s.id=STYLE_ID;s.textContent=css;document.head.appendChild(s)}
  function message(code){return ({invalid_credentials:"邮箱或密码不正确",email_exists:"该邮箱已经注册",invalid_email:"请输入有效的邮箱地址",password_too_short:"密码至少需要 8 位",nickname_too_long:"昵称过长",auth_failed:"登录状态验证失败，请重试"})[code]||"操作失败，请检查信息后重试"}

  function render(mode="login"){
    document.getElementById(ROOT_ID)?.remove();
    const root=document.createElement("main");root.id=ROOT_ID;
    root.innerHTML=`<div class="auth-wrap">
      <section class="auth-intro"><div class="brand"><div class="brand-mark">词</div><div><div class="brand-name">考研英语核心词</div><div class="brand-sub">FSRS-6 智能记忆系统</div></div></div>
      <h1 class="intro-title">把每一次复习，<br><strong>变成长期记忆。</strong></h1><p class="intro-copy">基于 FSRS-6 的考研英语词汇学习系统，自动安排复习节奏，让你的学习进度与账号始终保持同步。</p>
      <div class="features"><div class="feature"><i class="dot"></i>个性化复习计划与记忆状态</div><div class="feature"><i class="dot"></i>学习记录跟随账号云端同步</div><div class="feature"><i class="dot"></i>核心词库与自主词库统一管理</div></div></section>
      <section class="auth-panel"><h2 id="auth-title">欢迎回来</h2><p class="desc" id="auth-desc">登录后继续你的学习计划</p>
        <div class="tabs"><button id="auth-login-tab" class="active">登录</button><button id="auth-register-tab">注册</button></div>
        <form class="form" id="auth-form"><label class="field"><span>邮箱</span><input id="auth-email" type="email" autocomplete="email" placeholder="name@example.com" required></label>
        <label class="field"><span>密码</span><input id="auth-password" type="password" autocomplete="current-password" minlength="8" placeholder="至少 8 位" required></label>
        <label class="field hidden" id="auth-nickname-field"><span>昵称</span><input id="auth-nickname" type="text" maxlength="80" autocomplete="nickname" placeholder="你的昵称"></label>
        <label class="field hidden" id="auth-confirm-field"><span>确认密码</span><input id="auth-confirm" type="password" autocomplete="new-password" minlength="8" placeholder="再次输入密码"></label>
        <button class="submit" id="auth-submit" type="submit">登录</button><p class="status" id="auth-status"></p><p class="hint">账号用于保存你的学习进度，不会改变 V3 学习界面。</p></form>
      </section></div>`;
    document.body.appendChild(root);
    let current=mode;
    const $=id=>root.querySelector(id), loginTab=$("#auth-login-tab"), registerTab=$("#auth-register-tab"), nick=$("#auth-nickname-field"), confirm=$("#auth-confirm-field"), submit=$("#auth-submit"), title=$("#auth-title"), desc=$("#auth-desc"), status=$("#auth-status"), form=$("#auth-form");
    function sync(){const reg=current==="register";loginTab.classList.toggle("active",!reg);registerTab.classList.toggle("active",reg);nick.classList.toggle("hidden",!reg);confirm.classList.toggle("hidden",!reg);submit.textContent=reg?"创建账号":"登录";title.textContent=reg?"创建你的账号":"欢迎回来";desc.textContent=reg?"注册后即可保存并同步学习进度":"登录后继续你的学习计划";status.textContent="";$("#auth-password").autocomplete=reg?"new-password":"current-password"}
    loginTab.onclick=()=>{current="login";sync()};registerTab.onclick=()=>{current="register";sync()};sync();
    form.addEventListener("submit",async e=>{e.preventDefault();status.textContent="";const email=$("#auth-email").value.trim().toLowerCase(),password=$("#auth-password").value,nickname=$("#auth-nickname").value.trim()||"考研用户",confirmation=$("#auth-confirm").value;if(current==="register"&&password!==confirmation){status.textContent="两次输入的密码不一致";return}submit.disabled=true;submit.textContent=current==="register"?"创建中…":"登录中…";try{const r=await fetch(`${API}/auth/${current}`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(current==="register"?{email,password,nickname}:{email,password})});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(String(data.error||`API ${r.status}`));const me=await fetch(`${API}/auth/me`,{credentials:"include"});if(!me.ok)throw new Error("auth_failed");const meData=await me.json();if(!meData.user)throw new Error("auth_failed");localStorage.setItem("currentUser",JSON.stringify(meData.user));showApp();location.reload()}catch(err){status.textContent=message(err instanceof Error?err.message:"auth_failed")}finally{submit.disabled=false;submit.textContent=current==="register"?"创建账号":"登录"}});
  }

  async function boot(){hideApp();ensureStyle();try{const r=await fetch(`${API}/auth/me`,{credentials:"include",cache:"no-store"});if(r.ok){const d=await r.json();if(d.user){localStorage.setItem("currentUser",JSON.stringify(d.user));showApp();return}}render("login")}catch(e){console.error("Auth gate check failed:",e);render("login")}}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else void boot();
})();
