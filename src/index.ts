server.registerTool(
  "bearblog_test",
  {
    description:
      "Test the BearBlog connection and authentication.",
    inputSchema: {},
  },
  async () => {

    console.log("BearBlog configuration:", {
      subdomain: env.BEAR_BLOG_SUBDOMAIN,
      hasSessionId:
        Boolean(env.BEAR_BLOG_SESSION_ID),
      hasCsrfToken:
        Boolean(env.BEAR_BLOG_CSRF_TOKEN),
    });

    const baseUrl = "https://bearblog.dev";

    const dashboardUrl =
      `${baseUrl}/${env.BEAR_BLOG_SUBDOMAIN}/dashboard/`;

    console.log(
      "BearBlog dashboard URL:",
      dashboardUrl
    );

    try {
      const response = await fetch(
        dashboardUrl,
        {
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
        }
      );

      const html =
        await response.text();

      console.log(
        "BearBlog response:",
        {
          status: response.status,
          location:
            response.headers.get(
              "location"
            ),
          length: html.length,
        }
      );

      const success =
        response.status === 200 &&
        html
          .toLowerCase()
          .includes("dashboard");

      return {
        content: [
          {
            type: "text",
            text: [
              success
                ? "✅ BearBlog 连接成功"
                : "❌ BearBlog 认证失败",

              `博客变量：${
                env.BEAR_BLOG_SUBDOMAIN ??
                "undefined"
              }`,

              `Session ID：${
                env.BEAR_BLOG_SESSION_ID
                  ? "已配置"
                  : "未配置"
              }`,

              `CSRF Token：${
                env.BEAR_BLOG_CSRF_TOKEN
                  ? "已配置"
                  : "未配置"
              }`,

              `请求地址：${dashboardUrl}`,

              `状态码：${response.status}`,

              `Location：${
                response.headers.get(
                  "location"
                ) ?? "无"
              }`,

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
