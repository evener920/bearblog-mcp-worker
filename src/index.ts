import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

interface Env {
  BEAR_BLOG_SESSION_ID: string;
  BEAR_BLOG_CSRF_TOKEN: string;
  BEAR_BLOG_SUBDOMAIN: string;
}

const BASE_URL = "https://bearblog.dev";

function cookieHeader(env: Env) {
  return (
    `sessionid=${env.BEAR_BLOG_SESSION_ID}; ` +
    `csrftoken=${env.BEAR_BLOG_CSRF_TOKEN}`
  );
}

function headers(env: Env) {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    "Referer": `${BASE_URL}/${env.BEAR_BLOG_SUBDOMAIN}/dashboard/`,
    "Cookie": cookieHeader(env),
  };
}

function createServer(env: Env) {
  const server = new McpServer({
    name: "bearblog-mcp-worker",
    version: "1.1.0",
  });

  // --------------------------------------------------
  // 1. 测试 BearBlog 连接
  // --------------------------------------------------

  server.tool(
    "bearblog_test",
    "Test the real BearBlog connection.",
    {},
    async () => {
      const dashboardUrl =
        `${BASE_URL}/${env.BEAR_BLOG_SUBDOMAIN}/dashboard/`;

      const response = await fetch(dashboardUrl, {
        method: "GET",
        redirect: "manual",
        headers: headers(env),
      });

      const html = await response.text();

      const success =
        response.status === 200 &&
        html.toLowerCase().includes("dashboard");

      return {
        content: [
          {
            type: "text",
            text: success
              ? `✅ BearBlog 连接成功\n博客：${env.BEAR_BLOG_SUBDOMAIN}\n状态码：${response.status}`
              : `❌ BearBlog 认证失败\n博客：${env.BEAR_BLOG_SUBDOMAIN}\n状态码：${response.status}\n响应长度：${html.length}`,
          },
        ],
      };
    }
  );

  // --------------------------------------------------
  // 2. 创建 BearBlog 文章
  // --------------------------------------------------

  server.tool(
    "bearblog_create_post",
    "Create a new post on BearBlog.",
    {
      title: z.string().min(1).describe("文章标题"),
      content: z.string().describe("文章正文，支持 Markdown"),
      published: z
        .boolean()
        .default(true)
        .describe("是否立即发布；false 表示草稿"),
      slug: z
        .string()
        .optional()
        .describe("文章 slug，可选"),
      meta_description: z
        .string()
        .optional()
        .describe("SEO 描述，可选"),
      tags: z
        .string()
        .optional()
        .describe("标签，可选，例如：AI,Notion,BearBlog"),
    },
    async ({
      title,
      content,
      published,
      slug,
      meta_description,
      tags,
    }) => {
      try {
        /*
         * BearBlog 后台新建文章页面
         */
        const newPostUrl =
          `${BASE_URL}/${env.BEAR_BLOG_SUBDOMAIN}/dashboard/posts/new/`;

        const pageResponse = await fetch(newPostUrl, {
          method: "GET",
          redirect: "manual",
          headers: headers(env),
        });

        const pageHtml = await pageResponse.text();

        if (
          pageResponse.status !== 200 &&
          pageResponse.status !== 302
        ) {
          return {
            content: [
              {
                type: "text",
                text:
                  `❌ 无法打开 BearBlog 新建文章页面\n` +
                  `状态码：${pageResponse.status}\n` +
                  `响应长度：${pageHtml.length}`,
              },
            ],
          };
        }

        /*
         * 从页面中寻找 CSRF token
         */
        const csrfMatch =
          pageHtml.match(
            /name=["']csrfmiddlewaretoken["'][^>]*value=["']([^"']+)["']/i
          ) ||
          pageHtml.match(
            /value=["']([^"']+)["'][^>]*name=["']csrfmiddlewaretoken["']/i
          );

        const csrfToken =
          csrfMatch?.[1] || env.BEAR_BLOG_CSRF_TOKEN;

        /*
         * 构造 BearBlog 表单
         *
         * 注意：
         * BearBlog 的后台字段可能随着版本变化。
         * 因此这里保留最常见字段。
         */
        const form = new URLSearchParams();

        form.set("csrfmiddlewaretoken", csrfToken);
        form.set("title", title);
        form.set("content", content);

        if (slug) {
          form.set("slug", slug);
        }

        if (meta_description) {
          form.set("meta_description", meta_description);
        }

        if (tags) {
          form.set("tags", tags);
        }

        /*
         * 发布状态
         */
        form.set("published", published ? "on" : "");

        /*
         * 提交
         */
        const createUrl =
          `${BASE_URL}/${env.BEAR_BLOG_SUBDOMAIN}/dashboard/posts/new/`;

        const response = await fetch(createUrl, {
          method: "POST",
          redirect: "manual",
          headers: {
            ...headers(env),
            "Content-Type":
              "application/x-www-form-urlencoded",
            "X-CSRFToken": csrfToken,
          },
          body: form.toString(),
        });

        const responseText = await response.text();

        /*
         * Django/BearBlog 成功提交通常会跳转
         */
        const success =
          response.status >= 300 &&
          response.status < 400;

        const location =
          response.headers.get("location");

        if (success) {
          return {
            content: [
              {
                type: "text",
                text:
                  `✅ BearBlog 文章创建成功\n\n` +
                  `标题：${title}\n` +
                  `状态：${published ? "已发布" : "草稿"}\n` +
                  `博客：${env.BEAR_BLOG_SUBDOMAIN}\n` +
                  `跳转：${location || "成功"}`,
              },
            ],
          };
        }

        /*
         * 如果不是跳转，返回一部分服务器响应，
         * 方便我们继续定位 BearBlog 当前表单字段。
         */
        return {
          content: [
            {
              type: "text",
              text:
                `⚠️ BearBlog 没有确认创建成功\n\n` +
                `HTTP 状态：${response.status}\n` +
                `响应长度：${responseText.length}\n\n` +
                `服务器响应前 1000 字符：\n` +
                responseText.substring(0, 1000),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text:
                `❌ 创建 BearBlog 文章时发生错误\n\n` +
                `${error instanceof Error
                  ? error.message
                  : String(error)}`,
            },
          ],
        };
      }
    }
  );

  return server;
}

export default {
  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {
    const url = new URL(request.url);

    /*
     * 首页
     */
    if (url.pathname === "/") {
      return new Response(
        "BearBlog MCP Worker is running."
      );
    }

    /*
     * MCP endpoint
     */
    if (url.pathname !== "/mcp") {
      return new Response("Not Found", {
        status: 404,
      });
    }

    /*
     * MCP 只接受 POST
     */
    if (request.method !== "POST") {
      return new Response(
        "BearBlog MCP endpoint. Use POST for MCP requests.",
        {
          status: 405,
          headers: {
            Allow: "POST",
          },
        }
      );
    }

    const server = createServer(env);

    const transport =
      new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

    await server.connect(transport);

    return transport.handleRequest(request);
  },
};
