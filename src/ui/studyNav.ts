export function studyNav(active: "/" | "/vocabularies" | "/history" | "/settings") {
  const links = [
    ["/", "学习"],
    ["/vocabularies", "我的词库"],
    ["/history", "学习历史"],
    ["/settings", "设置"],
  ] as const;
  return `<nav class="study-nav">${links.map(([href, label]) => `<a href="${href}" class="${active === href ? "active" : ""}">${label}</a>`).join("")}</nav>`;
}
