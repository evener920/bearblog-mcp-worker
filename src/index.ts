import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

interface Env {
  BEAR_BLOG_SUBDOMAIN?: string;
  BEAR_BLOG_SESSION_ID?: string;
  BEAR_BLOG_CSRF_TOKEN?: string;
}

const BEAR_BASE_URL = "https://bearblog.dev";

function getBlog(env: Env): string {
  return env.BEAR_BLOG_SUBDOMAIN || "";
}

function dashboardUrl(env: Env): string {
  return `${BEAR_BASE_URL}/${getBlog(env)}/dashboard/`;
}

function postsUrl(env: Env): string {
  return `${BEAR_BASE_URL}/${getBlog(env)}/dashboard/posts/`;
}

function createPostUrl(env: Env): string {
  return `${BEAR_BASE_URL}/${getBlog(env)}/dashboard/posts/create/`;
}

function cookieHeader(env: Env): string {
  return [
    `sessionid=${env.BEAR_BLOG_SESSION_ID || ""}`,
    `csrftoken=${env.BEAR_BLOG_CSRF_TOKEN || ""}`,
  ].join("; ");
}

function envStatus(env: Env): string {
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

function envReady(env: Env): boolean {
  return Boolean(
    env.BEAR_BLOG_SUBDOMAIN &&
      env.BEAR_BLOG_SESSION_ID &&
      env.BEAR_BLOG_CSRF_TOKEN
  );
}

function createServer(env: Env) {
  const server = new McpServer({
    name: "bearblog-mcp-worker",
    version: "0.1.0",
  });

  server.registerTool(
    "bearblog_debug_env",
    {
      description:
        "Check BearBlog environment variable status without exposing secrets.",
      inputSchema: {},
    },
    async () => {
      return {
        content: [
          {
            type: "text",
            text: envStatus(env),
          },
        ],
      };
    }
  );

  server.registerTool(
    "bearblog_test",
    {
      description: "Test BearBlog dashboard authentication.",
      inputSchema: {},
    },
    async () => {
      if (!envReady(env)) {
        return {
          content: [
            {
              type: "text",
              text: [
                "❌ BearBlog 环境变量不完整",
                "",
                envStatus(env),
              ].join("\n"),
            },
          ],
        };
      }

      const url = dashboardUrl(env);

      try {
        const response = await fetch(url, {
          method: "GET",
          redirect: "manual",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Referer": `${BEAR_BASE_URL}/dashboard/`,
            "Cookie": cookieHeader(env),
          },
        });

        const html = await response.text();
        const lower = html.toLowerCase();
        const location = response.headers.get("location") || "";

        const ok =
          response.status === 200 &&
          (lower.includes("posts") ||
            lower.includes("settings") ||
            lower.includes("sign out") ||
            lower.includes("dashboard"));

        return {
          content: [
            {
              type: "text",
              text: ok
                ? [
                    "✅ BearBlog 认证成功",
                    "",
                    `博客：${getBlog(env)}`,
                    `访问地址：${url}`,
                    `状态码：${response.status}`,
                  ].join("\n")
                : [
                    "❌ BearBlog 认证失败",
                    "",
                    `博客：${getBlog(env)}`,
                    `访问地址：${url}`,
                    `状态码：${response.status}`,
                    `Location：${location || "无"}`,
                    `响应长度：${html.length}`,
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
      description: "Create a BearBlog post.",
      inputSchema: {
        title: z.string().describe("文章标题"),
        content: z.string().describe("文章正文，支持 Markdown"),
        published: z.boolean().optional().default(false).describe("是否发布"),
        tags: z.string().optional().describe("标签，多个标签用逗号分隔"),
      },
    },
    async ({ title, content, published, tags }) => {
      if (!envReady(env)) {
        return {
          content: [
            {
              type: "text",
              text: [
                "❌ BearBlog 环境变量不完整，无法创建文章",
                "",
                envStatus(env),
              ].join("\n"),
            },
          ],
        };
      }

      const url = createPostUrl(env);

      const form = new URLSearchParams();
      form.set("csrfmiddlewaretoken", env.BEAR_BLOG_CSRF_TOKEN || "");
      form.set("title", title);
      form.set("content", content);

      if (published) {
        form.set("is_published", "on");
      }

      if (tags) {
        form.set("tags", tags);
      }

      try {
        const response = await fetch(url, {
          method: "POST",
          redirect: "manual",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Origin": BEAR_BASE_URL,
            "Referer": postsUrl(env),
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": cookieHeader(env),
          },
          body: form.toString(),
        });

        const text = await response.text();
        const location = response.headers.get("location") || "";
        const lower = text.toLowerCase();

        const ok =
          response.status === 302 ||
          response.status === 303 ||
          (response.status === 200 &&
            !lower.includes("csrf") &&
            !lower.includes("accounts/login") &&
            !lower.includes("forbidden"));

        return {
          content: [
            {
              type: "text",
              text: ok
                ? [
                    "✅ BearBlog 文章提交成功",
                    "",
                    `标题：${title}`,
                    `博客：${getBlog(env)}`,
                    `状态码：${response.status}`,
                    `Location：${location || "无"}`,
                    `发布状态：${published ? "已发布" : "草稿"}`,
                  ].join("\n")
                : [
                    "❌ BearBlog 文章提交失败",
                    "",
                    `标题：${title}`,
                    `博客：${getBlog(env)}`,
                    `提交地址：${url}`,
                    `状态码：${response.status}`,
                    `Location：${location || "无"}`,
                    `响应长度：${text.length}`,
                    "",
                    "响应前 1000 字：",
                    text.slice(0, 1000),
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
      return new Response(envStatus(env), {
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
