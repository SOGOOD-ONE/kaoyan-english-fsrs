const items = [
  ["/", "学习"],
  ["/vocabularies", "我的词库"],
  ["/history", "学习历史"],
  ["/settings", "设置"],
] as const;

export function renderNav(currentPath: string) {
  return `<nav class="product-nav">${items.map(([href, label]) => `<a href="${href}" class="${currentPath === href ? "active" : ""}">${label}</a>`).join("")}</nav>`;
}
