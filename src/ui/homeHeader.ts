import { studyNav } from "./studyNav";

export function homeHeader(userLabel: string, loggedIn: boolean) {
  return `<header class="home-header"><div class="home-brand"><h1>考研英语</h1><p>专注真题语境的智能背词</p></div><div class="home-nav-wrap">${studyNav("/")}<div class="home-account">${loggedIn ? `<span>${userLabel}</span><button id="logout">退出</button>` : `<a href="/login">登录</a>`}</div></div></header>`;
}
