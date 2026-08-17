import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

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

  /*
   * 1. 测试 BearBlog 登录状态
   */
  server.registerTool(
    "bearblog_test",
    {
      description: "Test the BearBlog connection and authentication.",
      inputSchema: {},
    },
    async () => {
      const baseUrl = "https://bearblog.dev";

      const dashboardUrl =
        `${baseUrl}/${env.BEAR_BLOG_SUBDOMAIN}/dashboard/`;

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
    }
  );

  /*
   * 2. 创建 BearBlog 文章
   */
  server.registerTool(
    "bearblog_create_post",
    {
      description:
        "Create and publish a new article on BearBlog.",
      inputSchema: {
        title: z.string().min(1).describe("Article title"),

        content: z
          .string()
          .min(1)
          .describe("Article content in Markdown or HTML"),

        published: z
          .boolean()
          .optional()
          .default(true)
          .describe("Whether to publish immediately"),

        slug: z
          .string()
          .optional()
          .describe("Optional article slug"),

        meta_description: z
          .string()
          .optional()
          .describe("Optional meta description"),

        tags: z
          .string()
          .optional()
          .describe("Optional comma-separated tags"),
      },
    },
    async ({
      title,
      content,
      published = true,
      slug,
      meta_description,
      tags,
    }) => {
      const baseUrl = "https://bearblog.dev";

      const dashboardUrl =
        `${baseUrl}/${env.BEAR_BLOG_SUBDOMAIN}/dashboard/`;

      /*
       * 第一步：访问 dashboard
       * 获取 BearBlog 当前页面和 CSRF 状态
       */
      const dashboardResponse = await fetch(dashboardUrl, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",

          "Cookie":
            `sessionid=${env.BEAR_BLOG_SESSION_ID}; ` +
            `csrftoken=${env.BEAR_BLOG_CSRF_TOKEN}`,
        },
      });

      const dashboardHtml =
        await dashboardResponse.text();

      if (dashboardResponse.status !== 200) {
        return {
          content: [
            {
              type: "text",
              text:
                `❌ 无法访问 BearBlog Dashboard\n` +
                `状态码：${dashboardResponse.status}\n` +
                `响应长度：${dashboardHtml.length}`,
            },
          ],
        };
      }

      /*
       * 第二步：
       * 从 Dashboard 页面提取 CSRF token
       *
       * 如果页面中有新的 csrftoken，
       * 优先使用新的 token。
       */
      let csrfToken =
        env.BEAR_BLOG_CSRF_TOKEN;

      const csrfMatch =
        dashboardHtml.match(
          /name=["']csrfmiddlewaretoken["'][^>]*value=["']([^"']+)["']/i
        );

      if (csrfMatch) {
        csrfToken = csrfMatch[1];
      }

      /*
       * BearBlog 新文章页面
       */
      const newPostUrl =
        `${baseUrl}/${env.BEAR_BLOG_SUBDOMAIN}/dashboard/posts/new/`;

      const newPostResponse = await fetch(
        newPostUrl,
        {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",

            "Cookie":
              `sessionid=${env.BEAR_BLOG_SESSION_ID}; ` +
              `csrftoken=${csrfToken}`,
          },
        }
      );

      const newPostHtml =
        await newPostResponse.text();

      if (newPostResponse.status !== 200) {
        return {
          content: [
            {
              type: "text",
              text:
                `❌ 无法打开 BearBlog 新文章页面\n` +
                `状态码：${newPostResponse.status}`,
            },
          ],
        };
      }

      /*
       * 从新文章页面寻找真正的提交地址
       */
      const formMatch =
        newPostHtml.match(
          /<form[^>]+action=["']([^"']+)["'][^>]*>/i
        );

      const formAction =
        formMatch?.[1] ||
        newPostUrl;

      const submitUrl =
        formAction.startsWith("http")
          ? formAction
          : new URL(
              formAction,
              baseUrl
            ).toString();

      /*
       * 提取页面里的 CSRF token
       */
      const pageCsrfMatch =
        newPostHtml.match(
          /name=["']csrfmiddlewaretoken["'][^>]*value=["']([^"']+)["']/i
        );

      if (pageCsrfMatch) {
        csrfToken = pageCsrfMatch[1];
      }

      /*
       * 构造提交数据
       */
      const formData =
        new URLSearchParams();

      formData.set(
        "csrfmiddlewaretoken",
        csrfToken
      );

      formData.set(
        "title",
        title
      );

      formData.set(
        "body",
        content
      );

      if (slug) {
        formData.set(
          "slug",
          slug
        );
      }

      if (meta_description) {
        formData.set(
          "meta_description",
          meta_description
        );
      }

      if (tags) {
        formData.set(
          "tags",
          tags
        );
      }

      /*
       * BearBlog 表单字段
       *
       * published=true 时尝试提交发布状态
       */
      if (published) {
        formData.set(
          "published",
          "on"
        );
      }

      /*
       * 提交文章
       */
      const createResponse =
        await fetch(
          submitUrl,
          {
            method: "POST",

            redirect: "manual",

            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",

              "Referer":
                newPostUrl,

              "Origin":
                baseUrl,

              "Cookie":
                `sessionid=${env.BEAR_BLOG_SESSION_ID}; ` +
                `csrftoken=${csrfToken}`,

              "Content-Type":
                "application/x-www-form-urlencoded",
            },

            body:
              formData.toString(),
          }
        );

      const responseText =
        await createResponse.text();

      /*
       * BearBlog 正常创建后通常会返回 302
       */
      const success =
        createResponse.status === 302 ||
        createResponse.status === 303 ||
        createResponse.status === 200;

      if (!success) {
        return {
          content: [
            {
              type: "text",
              text:
                `❌ BearBlog 发布失败\n` +
                `状态码：${createResponse.status}\n` +
                `提交地址：${submitUrl}\n` +
                `响应长度：${responseText.length}\n\n` +
                `请检查 BearBlog 页面字段是否发生变化。`,
            },
          ],
        };
      }

      const location =
        createResponse.headers.get(
          "location"
        );

      return {
        content: [
          {
            type: "text",
            text: [
              "✅ BearBlog 文章发布成功",
              `博客：${env.BEAR_BLOG_SUBDOMAIN}`,
              `标题：${title}`,
              `状态码：${createResponse.status}`,
              location
                ? `跳转地址：${location}`
                : "",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      };
    }
  );

  return server;
}

export default {
  fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    /*
     * 首页
     */
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

    /*
     * MCP endpoint
     */
    if (url.pathname === "/mcp") {
      return createMcpHandler(
        createServer(env)
      )(request, env);
    }

    return new Response(
      "Not Found",
      {
        status: 404,
      }
    );
  },
};
