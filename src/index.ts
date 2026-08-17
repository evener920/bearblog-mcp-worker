import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

interface Env {
  BEAR_BLOG_SESSION_ID: string;
  BEAR_BLOG_CSRF_TOKEN: string;
  BEAR_BLOG_SUBDOMAIN: string;
}

const BASE_URL = "https://bearblog.dev";

function getCookieHeader(env: Env): string {
  return (
    `sessionid=${env.BEAR_BLOG_SESSION_ID}; ` +
    `csrftoken=${env.BEAR_BLOG_CSRF_TOKEN}`
  );
}

function getBearBlogHeaders(env: Env): HeadersInit {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/120 Safari/537.36",

    "Referer":
      `${BASE_URL}/${env.BEAR_BLOG_SUBDOMAIN}/dashboard/`,

    "Cookie": getCookieHeader(env),
  };
}

function createServer(env: Env): McpServer {
  const server = new McpServer({
    name: "bearblog-mcp-worker",
    version: "1.1.0",
  });

  // ============================================================
  // BearBlog connection test
  // ============================================================

  server.tool(
    "bearblog_test",
    "Test the real BearBlog connection.",
    {},
    async () => {
      try {
        const dashboardUrl =
          `${BASE_URL}/${env.BEAR_BLOG_SUBDOMAIN}/dashboard/`;

        const response = await fetch(dashboardUrl, {
          method: "GET",
          redirect: "manual",
          headers: getBearBlogHeaders(env),
        });

        const html = await response.text();

        const success =
          response.status === 200 &&
          html.toLowerCase().includes("dashboard");

        if (success) {
          return {
            content: [
              {
                type: "text",
                text:
                  `✅ BearBlog 连接成功\n` +
                  `博客：${env.BEAR_BLOG_SUBDOMAIN}\n` +
                  `状态码：${response.status}\n` +
                  `认证：成功`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text:
                `❌ BearBlog 认证失败\n` +
                `博客：${env.BEAR_BLOG_SUBDOMAIN}\n` +
                `状态码：${response.status}\n` +
                `响应长度：${html.length}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text:
                `❌ BearBlog 连接异常\n` +
                `${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // Create BearBlog post
  // ============================================================

  server.tool(
    "bearblog_create_post",
    "Create a new post on BearBlog.",
    {
      title: z
        .string()
        .min(1)
        .describe("文章标题"),

      content: z
        .string()
        .describe("文章正文，支持 Markdown"),

      published: z
        .boolean()
        .default(true)
        .describe("true=立即发布，false=保存为草稿"),

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
        .describe("文章标签，例如：AI,Notion,BearBlog"),
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
        // --------------------------------------------------------
        // 第一步：打开 BearBlog 新建文章页面
        // --------------------------------------------------------

        const newPostUrl =
          `${BASE_URL}/${env.BEAR_BLOG_SUBDOMAIN}/dashboard/posts/new/`;

        const pageResponse = await fetch(newPostUrl, {
          method: "GET",
          redirect: "manual",
          headers: getBearBlogHeaders(env),
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

        // --------------------------------------------------------
        // 第二步：寻找 CSRF token
        // --------------------------------------------------------

        const csrfMatch =
          pageHtml.match(
            /name=["']csrfmiddlewaretoken["'][^>]*value=["']([^"']+)["']/i
          ) ||
          pageHtml.match(
            /value=["']([^"']+)["'][^>]*name=["']csrfmiddlewaretoken["']/i
          );

        const csrfToken =
          csrfMatch?.[1] || env.BEAR_BLOG_CSRF_TOKEN;

        // --------------------------------------------------------
        // 第三步：创建表单
        // --------------------------------------------------------

        const form = new URLSearchParams();

        form.set(
          "csrfmiddlewaretoken",
          csrfToken
        );

        form.set(
          "title",
          title
        );

        form.set(
          "content",
          content
        );

        if (slug) {
          form.set(
            "slug",
            slug
          );
        }

        if (meta_description) {
          form.set(
            "meta_description",
            meta_description
          );
        }

        if (tags) {
          form.set(
            "tags",
            tags
          );
        }

        if (published) {
          form.set(
            "published",
            "on"
          );
        }

        // --------------------------------------------------------
        // 第四步：提交 BearBlog
        // --------------------------------------------------------

        const response = await fetch(newPostUrl, {
          method: "POST",
          redirect: "manual",

          headers: {
            ...getBearBlogHeaders(env),

            "Content-Type":
              "application/x-www-form-urlencoded",

            "X-CSRFToken":
              csrfToken,
          },

          body: form.toString(),
        });

        const responseText =
          await response.text();

        // --------------------------------------------------------
        // 第五步：判断结果
        // --------------------------------------------------------

        const location =
          response.headers.get("location");

        const redirected =
          response.status >= 300 &&
          response.status < 400;

        if (redirected) {
          return {
            content: [
              {
                type: "text",
                text:
                  `✅ BearBlog 文章创建成功\n\n` +
                  `标题：${title}\n` +
                  `状态：${published ? "已发布" : "草稿"}\n` +
                  `博客：${env.BEAR_BLOG_SUBDOMAIN}\n` +
                  `HTTP：${response.status}\n` +
                  `跳转：${location || "成功"}`,
              },
            ],
          };
        }

        // --------------------------------------------------------
        // 如果没有跳转，返回服务器信息
        // --------------------------------------------------------

        return {
          content: [
            {
              type: "text",
              text:
                `⚠️ BearBlog 没有确认文章创建成功\n\n` +
                `HTTP 状态：${response.status}\n` +
                `响应长度：${responseText.length}\n\n` +
                `服务器响应：\n` +
                responseText.substring(0, 2000),
            },
          ],
        };

      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text:
                `❌ 创建 BearBlog 文章时发生异常\n\n` +
                `${
                  error instanceof Error
                    ? error.stack || error.message
                    : String(error)
                }`,
            },
          ],
        };
      }
    }
  );

  return server;
}

// ================================================================
// Cloudflare Worker
// ================================================================

export default {
  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {

    const url =
      new URL(request.url);

    // ------------------------------------------------------------
    // 首页
    // ------------------------------------------------------------

    if (url.pathname === "/") {
      return new Response(
        "BearBlog MCP Worker is running.",
        {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
        }
      );
    }

    // ------------------------------------------------------------
    // MCP endpoint
    // ------------------------------------------------------------

    if (url.pathname !== "/mcp") {
      return new Response(
        "Not Found",
        {
          status: 404,
        }
      );
    }

    // ------------------------------------------------------------
    // MCP 使用 POST
    // ------------------------------------------------------------

    if (request.method !== "POST") {
      return new Response(
        "BearBlog MCP endpoint. Use POST for MCP requests.",
        {
          status: 405,
          headers: {
            "Allow": "POST",
          },
        }
      );
    }

    try {
      // ----------------------------------------------------------
      // 创建 MCP Server
      // ----------------------------------------------------------

      const server =
        createServer(env);

      // ----------------------------------------------------------
      // Cloudflare Worker 必须使用 Web Standard Transport
      // ----------------------------------------------------------

      const transport =
        new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });

      // ----------------------------------------------------------
      // MCP Server → Transport
      // ----------------------------------------------------------

      await server.connect(
        transport
      );

      // ----------------------------------------------------------
      // 处理 MCP 请求
      // ----------------------------------------------------------

      return await transport.handleRequest(
        request
      );

    } catch (error) {

      console.error(
        "MCP Worker Error:",
        error
      );

      return new Response(
        JSON.stringify({
          error: "MCP server error",
          message:
            error instanceof Error
              ? error.message
              : String(error),
        }),
        {
          status: 500,
          headers: {
            "Content-Type":
              "application/json",
          },
        }
      );
    }
  },
};
