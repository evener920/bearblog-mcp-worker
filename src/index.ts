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
  "Test the real BearBlog connection.",
  {},
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
          `csrftoken=${env.BEAR_BLOG_CSRF_TOKEN}`
      }
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
            : `❌ BearBlog 认证失败\n博客：${env.BEAR_BLOG_SUBDOMAIN}\n状态码：${response.status}\n响应长度：${html.length}`
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
