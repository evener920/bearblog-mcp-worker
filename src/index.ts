import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/sdk/server/mcp.js";

interface Env {
  BEAR_BLOG_SESSION_ID: string;
  BEAR_BLOG_CSRF_TOKEN: string;
  BEAR_BLOG_SUBDOMAIN: string;
}

function createServer(env: Env) {
  const server = new McpServer({
    name: "bearblog-mcp-worker",
    version: "1.0.0",
  });

  // =========================
  // 1. 测试 BearBlog 连接
  // =========================

  server.tool(
    "bearblog_test",
    "Test the BearBlog connection and authentication.",
    {},
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
                `错误：${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // =========================
  // 2. 创建文章
  // =========================

  server.tool(
    "bearblog_create_post",
    "Create and publish a new post on BearBlog.",
    {
      title: {
        type: "string",
        description: "文章标题",
      },

      content: {
        type: "string",
        description: "文章正文，支持 Markdown",
      },

      published: {
        type: "boolean",
        description: "是否立即发布",
      },

      published_date: {
        type: "string",
        description:
          "发布时间，可选，例如 2026-08-17",
      },

      tags: {
        type: "string",
        description:
          "标签，可选，多个标签使用逗号分隔",
      },
    },
    async ({
      title,
      content,
      published = true,
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
          form.set("published_date", published_date);
        }

        if (tags) {
          form.set("tags", tags);
        }

        form.set("csrfmiddlewaretoken", env.BEAR_BLOG_CSRF_TOKEN);

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

        const responseText = await response.text();

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
                `发布状态：${published ? "已发布" : "草稿"}`,
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
                `错误：${error instanceof Error ? error.message : String(error)}`,
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

    // =========================
    // 首页
    // =========================

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

    // =========================
    // MCP Endpoint
    // =========================

    if (url.pathname !== "/mcp") {
      return new Response("Not Found", {
        status: 404,
      });
    }

    // =========================
    // CORS
    // =========================

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods":
            "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version",
          "Access-Control-Expose-Headers":
            "Mcp-Session-Id",
        },
      });
    }

    // =========================
    // MCP 使用 POST
    // =========================

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

    try {
      const server = createServer(env);

      const transport =
        new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });

      await server.connect(transport);

      const response =
        await transport.handleRequest(request);

      const headers = new Headers(response.headers);

      headers.set(
        "Access-Control-Allow-Origin",
        "*"
      );

      headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version"
      );

      headers.set(
        "Access-Control-Expose-Headers",
        "Mcp-Session-Id"
      );

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });

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
              "application/json; charset=utf-8",
            "Access-Control-Allow-Origin":
              "*",
          },
        }
      );
    }
  },
};
