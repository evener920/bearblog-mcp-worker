import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

interface Env {
  BEAR_BLOG_SESSION_ID: string;
  BEAR_BLOG_CSRF_TOKEN: string;
  BEAR_BLOG_SUBDOMAIN: string;
}

const BEAR_BASE_URL = "https://bearblog.dev";

function blogDashboardUrl(env: Env): string {
  return `${BEAR_BASE_URL}/${env.BEAR_BLOG_SUBDOMAIN}/dashboard/`;
}

function blogPostsUrl(env: Env): string {
  return `${BEAR_BASE_URL}/${env.BEAR_BLOG_SUBDOMAIN}/dashboard/posts/`;
}

function blogCreatePostUrl(env: Env): string {
  return `${BEAR_BASE_URL}/${env.BEAR_BLOG_SUBDOMAIN}/dashboard/posts/create/`;
}

function bearCookie(env: Env): string {
  return [
    `sessionid=${env.BEAR_BLOG_SESSION_ID}`,
    `csrftoken=${env.BEAR_BLOG_CSRF_TOKEN}`,
  ].join("; ");
}

function hasEnv(env: Env): boolean {
  return Boolean(
    env.BEAR_BLOG_SUBDOMAIN &&
      env.BEAR_BLOG_SESSION_ID &&
      env.BEAR_BLOG_CSRF_TOKEN
  );
}

function envDebugText(env: Env): string {
  return [
    "BearBlog 环境变量检查：",
    `BEAR_BLOG_SUBDOMAIN: ${env.BEAR_BLOG_SUBDOMAIN || "undefined"}`,
    `BEAR_BLOG_SESSION_ID: ${
      env.BEAR_BLOG_SESSION_ID ? "已设置" : "undefined"
    }`,
    `BEAR_BLOG_CSRF_TOKEN: ${
      env.BEAR_BLOG_CSRF_TOKEN ? "已设置" : "undefined"
    }`,
  ].join("\n");
}

function createServer(env: Env) {
  const server = new McpServer({
    name: "bearblog-mcp-worker",
    version: "0.4.1",
  });

  server.registerTool(
    "bearblog_debug_env",
    {
      description:
        "Check whether BearBlog environment variables are configured. Does not reveal secret values.",
      inputSchema: {},
    },
    async () => {
      return {
        content: [
          {
            type: "text",
            text: envDebugText(env),
          },
        ],
      };
    }
  );

  server.registerTool(
    "bearblog_test",
    {
      description: "Test the BearBlog connection and authentication.",
      inputSchema: {},
    },
    async () => {
      if (!hasEnv(env)) {
        return {
          content: [
            {
              type: "text",
              text: [
                "❌ BearBlog 环境变量不完整",
                "",
                envDebugText(env),
                "",
                "请到 Cloudflare Worker → 设置 → 变量和密钥，确认这三项存在：",
                "BEAR_BLOG_SUBDOMAIN",
                "BEAR_BLOG_SESSION_ID",
                "BEAR_BLOG_CSRF_TOKEN",
              ].join("\n"),
            },
          ],
        };
      }

      const dashboardUrl = blogDashboardUrl(env);

      try {
        const response = await fetch(dashboardUrl, {
          method: "GET",
          redirect: "manual",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Referer": `${BEAR_BASE_URL}/dashboard/`,
            "Cookie": bearCookie(env),
          },
        });

        const html = await response.text();
        const lower = html.toLowerCase();
        const location = response.headers.get("location") ?? "";

        const success =
          response.status === 200 &&
          (lower.includes("dashboard") ||
            lower.includes("posts") ||
            lower.includes("logout") ||
            lower.includes("sign out") ||
            lower.includes("settings"));

        return {
          content: [
            {
              type: "text",
              text: success
                ? [
                    "✅ BearBlog 连接成功",
                    "",
                    `博客：${env.BEAR_BLOG_SUBDOMAIN}`,
                    `访问地址：${dashboardUrl}`,
                    `状态码：${response.status}`,
                    "认证：成功",
                    "",
                    envDebugText(env),
                  ].join("\n")
                : [
                    "❌ BearBlog 认证可能失败",
                    "",
                    `博客：${env.BEAR_BLOG_SUBDOMAIN}`,
                    `访问地址：${dashboardUrl}`,
                    `状态码：${response.status}`,
                    `Location：${location || "无"}`,
                    `响应长度：${html.length}`,
                    "",
                    envDebugText(env),
                    "",
                    "响应前 800 字：",
                    html.slice(0, 800),
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
                  error instanceof Error ? error.message : String(error)
                }`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "bearblog_create_post",
    {
      description: "Create a new post on BearBlog.",
      inputSchema: {
        title: z.string().describe("文章标题"),
        content: z.string().describe("文章正文，支持 Markdown"),
        published: z.boolean().optional().default(true).describe("是否立即发布"),
        published_date: z
          .string()
          .optional()
          .describe("发布时间，可选，例如 2026-08-17"),
        tags: z.string().optional().describe("标签，可选，多个标签使用逗号分隔"),
      },
    },
    async ({ title, content, published, published_date, tags }) => {
      if (!hasEnv(env)) {
        return {
          content: [
            {
              type: "text",
              text: [
                "❌ BearBlog 环境变量不完整，无法发布",
                "",
                envDebugText(env),
              ].join("\n"),
            },
          ],
        };
      }

      const createUrl = blogCreatePostUrl(env);
      const dashboardUrl = blogDashboardUrl(env);

      try {
        const form = new URLSearchParams();

        form.set("title", title);
        form.set("content", content);
        form.set("csrfmiddlewaretoken", env.BEAR_BLOG_CSRF_TOKEN);

        if (published) {
          form.set("is_published", "on");
        }

        if (published_date) {
          form.set("published_date", published_date);
        }

        if (tags) {
          form.set("tags", tags);
        }

        const response = await fetch(createUrl, {
          method: "POST",
          redirect: "manual",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Referer": dashboardUrl,
            "Origin": BEAR_BASE_URL,
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": bearCookie(env),
          },
          body: form.toString(),
        });

        const responseText = await response.text();
        const location = response.headers.get("location") ?? "";

        const lower = responseText.toLowerCase();

        const success =
          response.status === 302 ||
          response.status === 303 ||
          (response.status === 200 &&
            !lower.includes("csrf") &&
            !lower.includes("forbidden") &&
            !lower.includes("accounts/login"));

        if (!success) {
          return {
            content: [
              {
                type: "text",
                text: [
                  "❌ BearBlog 发布失败",
                  "",
                  `提交地址：${createUrl}`,
                  `状态码：${response.status}`,
                  `Location：${location || "无"}`,
                  `响应长度：${responseText.length}`,
                  `博客：${env.BEAR_BLOG_SUBDOMAIN}`,
                  "",
                  envDebugText(env),
                  "",
                  "响应前 1000 字：",
                  responseText.slice(0, 1000),
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
                "✅ BearBlog 文章提交成功",
                "",
                `标题：${title}`,
                `博客：${env.BEAR_BLOG_SUBDOMAIN}`,
                `提交地址：${createUrl}`,
                `状态码：${response.status}`,
                `Location：${location || "无"}`,
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
                `错误：${
                  error instanceof Error ? error.message : String(error)
                }`,
            },
          ],
        };
      }
    }
  );

  return server;
}

const handler = createMcpHandler(createServer);

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("BearBlog MCP Worker is running. Use /mcp.", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    if (url.pathname === "/debug") {
      return new Response(envDebugText(env), {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    if (url.pathname === "/mcp") {
      return handler(request, env, ctx);
    }

    return new Response("Not Found", {
      status: 404,
    });
  },
};
