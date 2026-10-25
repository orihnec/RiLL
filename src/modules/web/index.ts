import { z } from "zod";
import { errMsg } from "../../lib/error";
import type { Module } from "../../kernel/module";
import type { Tool } from "../../kernel/agent/types";
import { webSearch } from "../../kernel/search";
import { fetchPage } from "./fetch";

const web_search: Tool = {
  name: "web_search",
  description:
    "联网搜索（实时信息、新闻、不在知识库里的问题）。支持 Tavily / SearXNG / Wikipedia 后端，未配置时自动用 Wikipedia 免费搜索。回答需要最新信息或用户明确要求联网时使用；搜到的网页如有需要可再追问细节。",
  parameters: z.object({
    query: z.string().describe("搜索关键词或问题，中文直接输入"),
    maxResults: z.number().int().min(1).max(8).optional().describe("返回条数，默认 5"),
  }),
  execute: async (args) => {
    const query = String(args.query ?? "").trim();
    if (!query) return "query 不能为空";
    const max = typeof args.maxResults === "number" ? args.maxResults : 5;
    try {
      const { results, provider } = await webSearch(query, max);
      if (results.length === 0) return `（${provider} 后端无结果）`;
      const head =
        results.length > 1
          ? `搜索到 ${results.length} 条结果（后端：${provider}）：`
          : `搜索结果（后端：${provider}）：`;
      return (
        head +
        "\n" +
        results
          .map(
            (r, i) =>
              `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content.slice(0, 500)}`,
          )
          .join("\n")
      );
    } catch (e) {
      return `搜索失败：${errMsg(e)}`;
    }
  },
};

const web_fetch: Tool = {
  name: "web_fetch",
  description:
    "打开一个网页并读取正文（纯文本，最多 8000 字）。web_search 只给摘要片段，用户说「打开这个链接看看」「这个招聘页要求什么」「帮我读一下这篇」时用本工具。只支持 http/https 网页；PDF/图片请让用户存到知识库或用聊天附件。",
  parameters: z.object({
    url: z.string().describe("完整链接（http/https），通常来自 web_search 结果或用户粘贴"),
    maxChars: z.number().int().min(500).max(20000).optional().describe("最多取多少字符，默认 8000"),
  }),
  execute: async (args) => {
    const url = String(args.url ?? "").trim();
    if (!url) return "url 不能为空";
    try {
      const page = await fetchPage(url, typeof args.maxChars === "number" ? args.maxChars : undefined);
      if (!page.text) return `页面能打开但没有可读正文（可能是纯图片或需要登录）：${page.url}`;
      const head = `【${page.title || "无标题"}】${page.url}${page.truncated ? `（原文 ${page.chars} 字，已截断）` : ""}`;
      return `${head}\n${page.text}`;
    } catch (e) {
      return `抓取失败：${errMsg(e)}`;
    }
  },
};

/** web 模块：联网搜索 + 读网页正文（后端可配置，纯本地壳）。 */
export const webModule: Module = {
  id: "web",
  name: "联网搜索",
  tools: { web_search, web_fetch },
  panels: [],
};
