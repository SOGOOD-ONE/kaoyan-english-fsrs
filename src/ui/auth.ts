import { apiRequest } from "../services/api";

type AuthResult = { user: { id: string; email: string; nickname: string } };

export async function mountAuth(root: HTMLElement) {
  let mode: "login" | "register" = "login";
  root.innerHTML = `<main class="auth-page"><section class="auth-card"><div class="auth-brand"><h1>考研英语</h1><p>专注真题语境的智能背词</p></div><div class="auth-tabs"><button id="login-tab" class="active">登录</button><button id="register-tab">注册</button></div><form id="auth-form"><label><span>邮箱</span><input id="auth-email" type="email" autocomplete="email" required placeholder="name@example.com"></label><label><span>密码</span><input id="auth-password" type="password" autocomplete="current-password" minlength="8" required placeholder="至少 8 位"></label><label id="nickname-row" hidden><span>昵称</span><input id="auth-nickname" type="text" maxlength="80" placeholder="考研用户"></label><button class="auth-submit" type="submit" id="auth-submit">登录</button><p class="auth-status" id="auth-status"></p></form></section></main>`;

  const form = document.getElementById("auth-form") as HTMLFormElement;
  const nicknameRow = document.getElementById("nickname-row")!;
  const submit = document.getElementById("auth-submit")!;
  const status = document.getElementById("auth-status")!;
  const syncMode = () => { nicknameRow.hidden = mode !== "register"; submit.textContent = mode === "login" ? "登录" : "创建账号"; status.textContent = ""; };
  document.getElementById("login-tab")!.addEventListener("click", () => { mode = "login"; document.getElementById("login-tab")!.classList.add("active"); document.getElementById("register-tab")!.classList.remove("active"); syncMode(); });
  document.getElementById("register-tab")!.addEventListener("click", () => { mode = "register"; document.getElementById("register-tab")!.classList.add("active"); document.getElementById("login-tab")!.classList.remove("active"); syncMode(); });
  form.addEventListener("submit", async event => {
    event.preventDefault(); status.textContent = "";
    const email = (document.getElementById("auth-email") as HTMLInputElement).value.trim().toLowerCase();
    const password = (document.getElementById("auth-password") as HTMLInputElement).value;
    const nickname = (document.getElementById("auth-nickname") as HTMLInputElement).value.trim() || "考研用户";
    submit.setAttribute("disabled", "true");
    try {
      await apiRequest<AuthResult>(mode === "login" ? "/auth/login" : "/auth/register", { method: "POST", body: JSON.stringify(mode === "login" ? { email, password } : { email, password, nickname }) });
      location.href = "/";
    } catch (error) {
      const code = error instanceof Error ? error.message : "auth_failed";
      const messages: Record<string, string> = { invalid_credentials: "邮箱或密码不正确", email_exists: "这个邮箱已经注册", invalid_email: "请输入有效邮箱", password_too_short: "密码至少需要 8 位" };
      status.textContent = messages[code] || "操作失败，请稍后重试";
    } finally { submit.removeAttribute("disabled"); }
  });
}
