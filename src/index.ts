import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

interface Env {
  BEAR_BLOG_SESSION_ID: string;
  BEAR_BLOG_CSRF_TOKEN: string;
  BEAR_BLOG_SUBDOMAIN: string;
}

function createServer(env: Env) {
  const server = new McpServer({
    name: "bearblog-mcp-worker",
    version: "1.0.0"
  });

  server.tool(
    "bearblog_test",
    "Test BearBlog connection.",
    {},
    async () => ({
      content: [
        {
          type: "text",
          text:
            `BearBlog MCP connected.\n` +
            `Blog: ${env.BEAR_BLOG_SUBDOMAIN}\n` +
            `Session configured: ${Boolean(env.BEAR_BLOG_SESSION_ID)}\n` +
            `CSRF configured: ${Boolean(env.BEAR_BLOG_CSRF_TOKEN)}`
        }
      ]
    })
  );

  server.tool(
    "bearblog_create_post",
    "Create a new BearBlog post.",
    {
      title: z.string().describe("Post title"),
      content: z.string().describe("Markdown or HTML content"),
      published_date: z.string().optional().describe("Publish date, optional")
    },
    async ({ title, content, published_date }) => {

      /*
       * 第一步先测试参数是否能够从 MCP 正常传进来。
       * 真正的 BearBlog API 请求下一步再接。
       */

      return {
        content: [
          {
            type: "text",
            text:
              `收到发布请求\n\n` +
              `标题：${title}\n` +
              `内容长度：${content.length}\n` +
              `发布时间：${published_date ?? "立即"}\n` +
              `博客：${env.BEAR_BLOG_SUBDOMAIN}`
          }
        ]
      };
    }
  );

  return server;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {

    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("BearBlog MCP Worker is running.");
    }

    if (url.pathname !== "/mcp") {
      return new Response("Not Found", {
        status: 404
      });
    }

    if (request.method !== "POST") {
      return new Response(
        "BearBlog MCP endpoint. Use POST for MCP requests.",
        {
          status: 405,
          headers: {
            Allow: "POST"
          }
        }
      );
    }

    const server = createServer(env);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    await server.connect(transport);

    return transport.handleRequest(request);
  }
};
