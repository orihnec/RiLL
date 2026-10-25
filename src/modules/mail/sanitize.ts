/**
 * 邮件 HTML 消毒 + 提取链接。
 *
 * 安全模型（两层，缺一不可）：
 * 1. **本文件**：用 DOMParser 把 HTML 解析成文档树，删掉一切可执行/可外联的元素与属性
 *    （script/iframe/object/embed/form/base/meta/link/svg + on* 事件 + javascript: 协议）。
 * 2. **渲染层**：结果塞进 `<iframe sandbox>`（无 allow-scripts / 无 allow-top-navigation），
 *    即使本文件漏掉某个向量，邮件里的代码也无法触碰应用页面与 Tauri IPC。
 *
 * 远程图片默认不加载（防追踪像素把"你什么时候看了这封邮件"回报给发件人），
 * 用户点「显示图片」后才放行；被拦下的图片保留原地址在 data-blocked-src 里。
 */

/** 直接整棵删除的元素（含其子树）。导出仅为让无头测试断言覆盖范围。 */
export const DROP_TAGS = new Set([
  "script",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "base",
  "meta",
  "link",
  "svg",
  "math",
  "template",
  "audio",
  "video",
  "source",
  "track",
]);

/** 保留但必须清掉属性的元素（属性白名单在下面按标签给）。 */
const KEEP_TAGS_KEEP_ATTRS: Record<string, string[]> = {
  a: ["href", "title"],
  img: ["src", "alt", "width", "height", "title"],
  td: ["colspan", "rowspan", "width", "height", "align", "valign", "bgcolor"],
  th: ["colspan", "rowspan", "width", "height", "align", "valign", "bgcolor"],
  table: ["width", "height", "border", "cellpadding", "cellspacing", "align", "bgcolor"],
  font: ["color", "face", "size"],
};

/** 样式里可能外联或遮罩点击的东西。 */
const STYLE_BLOCKLIST = /@import|expression\s*\(|javascript:|url\s*\(\s*['"]?\s*(?!https?:|data:image\/)/gi;

export interface SanitizeResult {
  /** 可安全塞进 sandbox iframe 的 HTML */
  html: string;
  /** 正文里出现的链接（去重、已过滤 javascript:），渲染在正文下方供点击 */
  links: { href: string; text: string }[];
  /** 被拦下的远程图片数量 */
  blockedImages: number;
}

function isSafeHref(href: string): boolean {
  const v = href.trim();
  if (!v) return false;
  // 只允许 http/https/mailto；其余（javascript:, data:, vbscript:, file:）一律丢弃
  return /^(https?:|mailto:)/i.test(v) && !/^javascript:/i.test(v);
}

function isRemote(src: string): boolean {
  return /^https?:/i.test(src.trim());
}

/**
 * @param raw 邮件原始 HTML
 * @param showImages 是否放行远程图片（默认 false = 防追踪像素）
 */
export function sanitizeMailHtml(raw: string, showImages = false): SanitizeResult {
  if (typeof DOMParser === "undefined") {
    return { html: "", links: [], blockedImages: 0 };
  }
  const doc = new DOMParser().parseFromString(raw, "text/html");
  const links = new Map<string, string>();
  let blockedImages = 0;

  // 从后往前遍历，边删边收集
  const all = doc.body ? [doc.body, ...Array.from(doc.body.querySelectorAll("*"))] : [];
  for (const el of all) {
    const tag = el.tagName.toLowerCase();
    if (DROP_TAGS.has(tag)) {
      el.remove();
      continue;
    }

    // 属性处理
    const allowed = KEEP_TAGS_KEEP_ATTRS[tag];
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name === "style") {
        if (STYLE_BLOCKLIST.test(value)) el.removeAttribute("style");
        STYLE_BLOCKLIST.lastIndex = 0;
        continue;
      }
      if (name === "href") {
        if (!isSafeHref(value)) el.removeAttribute("href");
        continue;
      }
      if (name === "src" || name === "srcset" || name === "background" || name === "poster") {
        if (tag === "img" && name === "src") continue; // 下面单独处理
        el.removeAttribute(attr.name);
        continue;
      }
      // 其它属性：仅在白名单里保留（保留 class/style 以维持排版）
      if (allowed?.includes(name) || name === "class" || name === "id") continue;
      if (name.startsWith("data-")) continue;
      el.removeAttribute(attr.name);
    }

    if (tag === "a") {
      const href = el.getAttribute("href") ?? "";
      const text = (el.textContent ?? "").trim();
      // iframe 里点链接打不开，统一收集到下方"链接"区由应用打开（走系统浏览器）
      el.removeAttribute("href");
      el.setAttribute("data-href", href);
      el.setAttribute("title", href);
      if (href && isSafeHref(href)) {
        if (!links.has(href)) links.set(href, text || href);
      }
      // 去掉可点击外观，避免用户以为点了会跳转
      const cls = el.getAttribute("class") ?? "";
      el.setAttribute("class", `${cls} mail-link`.trim());
    }

    if (tag === "img") {
      const src = el.getAttribute("src") ?? "";
      if (isRemote(src) && !showImages) {
        blockedImages++;
        el.removeAttribute("src");
        el.setAttribute("data-blocked-src", src);
        el.setAttribute("alt", el.getAttribute("alt") || "（远程图片已拦截）");
      } else if (src && !isRemote(src) && !/^data:image\//i.test(src)) {
        // cid: 内嵌图在 M1 暂不解析，直接去掉避免破图
        el.removeAttribute("src");
      }
    }
  }

  // 补一段基础排版（邮件自带样式常常一团糟）
  // 注意：**不要**在这里给 body 设 background / color ——
  // 我的 <style> 追加在邮件自己的样式之后，同优先级会**覆盖邮件配色**，
  // 于是深色底邮件会被刷成白底而文字还是浅色（看不清）。画布底色交给 iframe 元素本身设白。
  const style = doc.createElement("style");
  style.textContent = `
    html, body { margin: 0; padding: 0; background: transparent; }
    body { padding: 12px; font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
           font-size: 13px; line-height: 1.6;
           /* 邮件常按 600px 固定宽排版，这里强制不溢出，消灭横向滚动条 */
           overflow-x: hidden; word-break: break-word; overflow-wrap: anywhere; }
    img { max-width: 100% !important; height: auto !important; }
    table { max-width: 100% !important; }
    td, th { word-break: break-word; }
    /* 固定宽度（width:600px 之类）的元素一律压到容器宽度内 */
    * { max-width: 100% !important; box-sizing: border-box; }
    pre { white-space: pre-wrap; overflow-x: auto; }
    a.mail-link { color: #4f6bd8; text-decoration: underline; cursor: default; }
    a.mail-link::after { content: " ↗"; font-size: 10px; opacity: .6; }
    blockquote { margin: 8px 0; padding-left: 10px; border-left: 2px solid rgba(128,128,128,.35); opacity: .85; }
  `;
  doc.head?.appendChild(style);

  return {
    html: doc.body?.innerHTML ?? "",
    links: [...links.entries()].map(([href, text]) => ({ href, text: text.slice(0, 80) })),
    blockedImages,
  };
}

/** 从纯文本里粗略提取链接（没有 HTML 正文时用）。 */
export function linksFromText(text: string): { href: string; text: string }[] {
  const out = new Map<string, string>();
  // 中文标点不能吃掉：否则「https://a.com/x，或看」会被当成一个链接
  const re = /https?:\/\/[^\s<>"'）)】\]，。；：、！？（）《》“”‘’]+/gi;
  for (const m of text.matchAll(re)) {
    const href = m[0].replace(/[.,;:!?]+$/, "");
    if (!out.has(href)) out.set(href, href);
  }
  return [...out.entries()].map(([href, text]) => ({ href, text }));
}
