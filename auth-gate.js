(() => {
  const API_BASE = "/api";
  const HIDE_STYLE_ID = "auth-gate-hide";
  const LOGIN_ID = "auth-gate-root";

  const hideApp = () => {
    if (document.getElementById(HIDE_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = HIDE_STYLE_ID;
    style.textContent = "body > * { visibility: hidden !important; } #" + LOGIN_ID + " { visibility: visible !important; }";
    document.head.appendChild(style);
  };

  const showApp = () => document.getElementById(HIDE_STYLE_ID)?.remove();

  const renderLogin = (mode = "login") => {
    document.getElementById(LOGIN_ID)?.remove();
    const root = document.createElement("main");
    root.id = LOGIN_ID;
    root.innerHTML = `
      <section class="auth-card">
        <div class="auth-brand"><h1>考研英语</h1><p>专注真题语境的智能背词</p></div>
        <div class="auth-tabs">
          <button id="gate-login-tab" class="${mode === "login" ? "active" : ""}">登录</button>
          <button id="gate-register-tab" class="${mode === "register" ? "active" : ""}">注册</button>
        </div>
        <form id="gate-form">
          <label><span>邮箱</span><input id="gate-email" type="email" autocomplete="email" required placeholder="name@example.com"></label>
          <label><span>密码</span><input id="gate-password" type="password" autocomplete="current-password" minlength="8" required placeholder="至少 8 位"></label>
          <label id="gate-nickname-row" ${mode === "register" ? "" : "hidden"}><span>昵称</span><input id="gate-nickname" type="text" maxlength="80" placeholder="考研用户"></label>
          <button class="auth-submit" type="submit" id="gate-submit">${mode === "login" ? "登录" : "创建账号"}</button>
          <p class="auth-status" id="gate-status"></p>
        </form>
      </section>`;
    document.body.appendChild(root);

    let currentMode = mode;
    const tabLogin = root.querySelector("#gate-login-tab");
    const tabRegister = root.querySelector("#gate-register-tab");
    const nicknameRow = root.querySelector("#gate-nickname-row");
    const submit = root.querySelector("#gate-submit");
    const status = root.querySelector("#gate-status");
    const syncMode = () => {
      nicknameRow.hidden = currentMode !== "register";
      submit.textContent = currentMode === "login" ? "登录" : "创建账号";
      tabLogin.classList.toggle("active", currentMode === "login");
      tabRegister.classList.toggle("active", currentMode === "register");
      status.textContent = "";
    };
    tabLogin.onclick = () => { currentMode = "login"; syncMode(); };
    tabRegister.onclick = () => { currentMode = "register"; syncMode(); };

    root.querySelector("#gate-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      status.textContent = "";
      submit.disabled = true;
      const email = root.querySelector("#gate-email").value.trim().toLowerCase();
      const password = root.querySelector("#gate-password").value;
      const nickname = root.querySelector("#gate-nickname").value.trim() || "考研用户";
      try {
        const response = await fetch(`${API_BASE}/auth/${currentMode === "login" ? "login" : "register"}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(currentMode === "login" ? { email, password } : { email, password, nickname })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(result.error || `API ${response.status}`));
        const me = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
        if (!me.ok) throw new Error("auth_failed");
        const meResult = await me.json();
        if (meResult.user) localStorage.setItem("currentUser", JSON.stringify(meResult.user));
        location.reload();
      } catch (error) {
        const code = error instanceof Error ? error.message : "auth_failed";
        const messages = {
          invalid_credentials: "邮箱或密码不正确",
          email_exists: "这个邮箱已经注册",
          invalid_email: "请输入有效邮箱",
          password_too_short: "密码至少需要 8 位",
          auth_failed: "登录状态验证失败，请重试"
        };
        status.textContent = messages[code] || "操作失败，请稍后重试";
      } finally {
        submit.disabled = false;
      }
    });
  };

  const injectStyles = () => {
    if (document.getElementById("auth-gate-style")) return;
    const style = document.createElement("style");
    style.id = "auth-gate-style";
    style.textContent = `
      #${LOGIN_ID}{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#F0F4F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif;color:#0F172A}
      #${LOGIN_ID} *{box-sizing:border-box}
      #${LOGIN_ID} .auth-card{width:min(420px,calc(100vw - 32px));padding:32px;border-radius:18px;background:#fff;border:1px solid #F1F5F9;box-shadow:0 8px 24px rgba(0,0,0,.08)}
      #${LOGIN_ID} .auth-brand{text-align:center;margin-bottom:24px}.auth-brand h1{font-size:24px;margin:0 0 6px}.auth-brand p{font-size:13px;color:#64748B;margin:0}
      #${LOGIN_ID} .auth-tabs{display:flex;gap:8px;margin-bottom:20px}.auth-tabs button{flex:1;padding:10px;border:0;border-bottom:2px solid #E2E8F0;background:#fff;color:#64748B;font-weight:600;cursor:pointer}.auth-tabs button.active{border-bottom-color:#3B82F6;color:#3B82F6}
      #${LOGIN_ID} form{display:grid;gap:14px}#${LOGIN_ID} label{display:grid;gap:7px;font-size:13px;font-weight:600}#${LOGIN_ID} input{width:100%;padding:12px 13px;border:1px solid #E2E8F0;border-radius:10px;font-size:14px;outline:none}#${LOGIN_ID} input:focus{border-color:#3B82F6;box-shadow:0 0 0 3px #DBEAFE}
      #${LOGIN_ID} .auth-submit{padding:13px;border:0;border-radius:12px;background:#3B82F6;color:#fff;font-size:15px;font-weight:700;cursor:pointer}#${LOGIN_ID} .auth-submit:disabled{opacity:.6;cursor:not-allowed}.auth-status{min-height:18px;margin:0;text-align:center;font-size:12px;color:#EF4444}
    `;
    document.head.appendChild(style);
  };

  const boot = async () => {
    hideApp();
    injectStyles();
    try {
      const response = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
      if (response.ok) {
        const result = await response.json();
        if (result.user) {
          localStorage.setItem("currentUser", JSON.stringify(result.user));
          showApp();
          return;
        }
      }
      renderLogin("login");
    } catch (error) {
      console.error("Auth gate check failed:", error);
      renderLogin("login");
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else void boot();
})();
