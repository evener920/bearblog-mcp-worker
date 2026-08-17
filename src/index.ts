import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

interface Env {
  BEAR_BLOG_SESSION_ID: string;
  BEAR_BLOG_CSRF_TOKEN: string;
  BEAR_BLOG_SUBDOMAIN: string;
}

/**
 * 创建 BearBlog MCP Server
 *
 * 注意：
 * 这是 MCP SDK v2 的 server factory。
 * createMcpHandler 会在每次 MCP 请求时创建独立 server。
 */
function createServer(env: Env) {
  const server = new McpServer({
    name: "bearblog-mcp-worker",
    version: "0.3.1",
  });

  // =========================================================
  // 1. BearBlog 测试
  // =========================================================

  server.registerTool(
    "bearblog_test",
    {
      description:
        "Test the BearBlog connection and authentication.",
      inputSchema: {},
    },
    async () => {
      const baseUrl = "https://bearblog.dev";

      const dashboardUrl =
        `${baseUrl}/${env.BEAR_BLOG_SUBDOMAIN}/dashboard/`;

      try {
        const response = await fetch(dashboardUrl, {
          method: "GET",
          redirect: "manual",

          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",

            "Referer": baseUrl,

            "Cookie":
              `sessionid=${env.BEAR_BLOG_SESSION_ID}; ` +
              `csrftoken=${env.BEAR_BLOG_CSRF_TOKEN}`,
          },
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
                ? [
                    "✅ BearBlog 连接成功",
                    `博客：${env.BEAR_BLOG_SUBDOMAIN}`,
                    `状态码：${response.status}`,
                    "认证：成功",
                  ].join("\n")
                : [
                    "❌ BearBlog 认证失败",
                    `博客：${env.BEAR_BLOG_SUBDOMAIN}`,
                    `状态码：${response.status}`,
                    `响应长度：${html.length}`,
                  ].join("\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text:
                "❌ BearBlog 请求异常\n" +
                `错误：${
                  error instanceof Error
                    ? error.message
                    : String(error)
                }`,
            },
          ],
        };
      }
    }
  );

  // =========================================================
  // 2. 创建 BearBlog 文章
  // =========================================================

  server.registerTool(
    "bearblog_create_post",
    {
      description:
        "Create and publish a new post on BearBlog.",

      inputSchema: {
        title: z
          .string()
          .describe("文章标题"),

        content: z
          .string()
          .describe("文章正文，支持 Markdown"),

        published: z
          .boolean()
          .optional()
          .default(true)
          .describe("是否立即发布"),

        published_date: z
          .string()
          .optional()
          .describe(
            "发布时间，可选，例如 2026-08-17"
          ),

        tags: z
          .string()
          .optional()
          .describe(
            "标签，可选，多个标签使用逗号分隔"
          ),
      },
    },

    async ({
      title,
      content,
      published,
      published_date,
      tags,
    }) => {
      try {
        const url =
          `https://bearblog.dev/${env.BEAR_BLOG_SUBDOMAIN}/dashboard/posts/create/`;

        const form = new URLSearchParams();

        form.set("title", title);
        form.set("content", content);

        if (published) {
          form.set("is_published", "on");
        }

        if (published_date) {
          form.set(
            "published_date",
            published_date
          );
        }

        if (tags) {
          form.set("tags", tags);
        }

        form.set(
          "csrfmiddlewaretoken",
          env.BEAR_BLOG_CSRF_TOKEN
        );

        const response = await fetch(url, {
          method: "POST",

          redirect: "manual",

          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",

            "Referer":
              `https://bearblog.dev/${env.BEAR_BLOG_SUBDOMAIN}/dashboard/`,

            "Content-Type":
              "application/x-www-form-urlencoded",

            "Cookie":
              `sessionid=${env.BEAR_BLOG_SESSION_ID}; ` +
              `csrftoken=${env.BEAR_BLOG_CSRF_TOKEN}`,
          },

          body: form.toString(),
        });

        const responseText =
          await response.text();

        const success =
          response.status === 302 ||
          response.status === 303 ||
          response.status === 200;

        if (!success) {
          return {
            content: [
              {
                type: "text",
                text: [
                  "❌ BearBlog 发布失败",
                  `状态码：${response.status}`,
                  `响应长度：${responseText.length}`,
                  `博客：${env.BEAR_BLOG_SUBDOMAIN}`,
                ].join("\n"),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: [
                "✅ BearBlog 文章发布成功",
                `标题：${title}`,
                `博客：${env.BEAR_BLOG_SUBDOMAIN}`,
                `状态码：${response.status}`,
                `发布状态：${
                  published ? "已发布" : "草稿"
                }`,
              ].join("\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text:
                "❌ BearBlog 发布异常\n" +
                `错误：${
                  error instanceof Error
                    ? error.message
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


// =========================================================
// MCP Handler
//
// 关键：
// 不要在 fetch() 里面 createMcpHandler()
// =========================================================

const handler = createMcpHandler(
  createServer
);


// =========================================================
// Worker
// =========================================================

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {

    const url = new URL(request.url);

    // =====================================================
    // 首页
    // =====================================================

    if (url.pathname === "/") {
      return new Response(
        "BearBlog MCP Worker is running.",
        {
          status: 200,
          headers: {
            "Content-Type":
              "text/plain; charset=utf-8",
          },
        }
      );
    }

    // =====================================================
    // MCP
    // =====================================================

    if (url.pathname === "/mcp") {
      return handler(
        request,
        env,
        ctx
      );
    }

    // =====================================================
    // 404
    // =====================================================

    return new Response(
      "Not Found",
      {
        status: 404,
      }
    );
  },
};
