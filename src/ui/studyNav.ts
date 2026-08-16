const BASE_PATH = "/kaoyan-english-fsrs";

function appHref(path: string) {
  return `${BASE_PATH}${path === "/" ? "/" : path.startsWith("/") ? path : `/${path}`}`;
}

export function studyNav(active: "/" | "/vocabularies" | "/history" | "/settings") {
  const links = [
    ["/", "学习"],
    ["/vocabularies", "我的词库"],
    ["/history", "学习历史"],
    ["/settings", "设置"],
  ] as const;
  return `<nav class="study-nav">${links.map(([href, label]) => `<a href="${appHref(href)}" class="${active === href ? "active" : ""}">${label}</a>`).join("")}</nav>`;
}
