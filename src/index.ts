import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

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
    "Test the connection and authentication to BearBlog.",
    {},
    async () => {
      const baseUrl = "https://bearblog.dev";

      const dashboardUrl =
        `${baseUrl}/${env.BEAR_BLOG_SUBDOMAIN}/dashboard/`;

      try {
        console.log("BEARBLOG_TEST_START", {
          subdomain: env.BEAR_BLOG_SUBDOMAIN,
          url: dashboardUrl
        });

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

        console.log("BEARBLOG_TEST_RESULT", {
          status: response.status,
          subdomain: env.BEAR_BLOG_SUBDOMAIN,
          htmlLength: html.length,
          success
        });

        return {
          content: [
            {
              type: "text",
              text: success
                ? `✅ BearBlog 连接成功\n\n博客：${env.BEAR_BLOG_SUBDOMAIN}\n状态码：${response.status}\n认证：成功`
                : `❌ BearBlog 认证失败\n\n博客：${env.BEAR_BLOG_SUBDOMAIN}\n状态码：${response.status}\n响应长度：${html.length}`
            }
          ]
        };
      } catch (error) {
        console.error("BEARBLOG_TEST_ERROR", error);

        return {
          content: [
            {
              type: "text",
              text:
                `❌ BearBlog 请求错误\n\n` +
                `${error instanceof Error ? error.message : String(error)}`
            }
          ]
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

    console.log("MCP_REQUEST", {
      method: request.method,
      pathname: url.pathname
    });

    if (url.pathname === "/") {
      return new Response(
        "BearBlog MCP Worker is running.",
        {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8"
          }
        }
      );
    }

    if (url.pathname !== "/mcp") {
      return new Response(
        "Not Found",
        {
          status: 404,
          headers: {
            "Content-Type": "text/plain; charset=utf-8"
          }
        }
      );
    }

    if (request.method !== "POST") {
      return new Response(
        "BearBlog MCP endpoint. Use POST for MCP requests.",
        {
          status: 405,
          headers: {
            Allow: "POST",
            "Content-Type": "text/plain; charset=utf-8"
          }
        }
      );
    }

    try {
      const server = createServer(env);

      const transport =
        new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true
        });

      await server.connect(transport);

      return await transport.handleRequest(request);

    } catch (error) {
      console.error("MCP_SERVER_ERROR", error);

      return new Response(
        JSON.stringify({
          error: "MCP server error",
          message:
            error instanceof Error
              ? error.message
              : String(error)
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }
  }
};
