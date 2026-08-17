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
    version: "0.1.0"
  });

  server.tool(
    "bearblog_test",
    "Test the BearBlog MCP Worker connection.",
    {},
    async () => ({
      content: [
        {
          type: "text",
          text: `BearBlog MCP Worker is running for ${env.BEAR_BLOG_SUBDOMAIN}.`
        }
      ]
    })
  );

  return server;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/mcp") {
      return new Response("BearBlog MCP Worker is running.", {
        status: 200
      });
    }

    if (request.method === "GET") {
      return new Response("BearBlog MCP endpoint is ready.", {
        status: 200
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: {
          Allow: "GET, POST"
        }
      });
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
