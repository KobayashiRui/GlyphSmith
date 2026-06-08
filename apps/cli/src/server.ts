import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { handleMcpBody } from "@glyphsmith/mcp";
import type { ProjectStore } from "./project-store.js";
import { WebSocketHub } from "./websocket.js";

export type HostServer = {
  close(): void;
  server: Server;
};

export type HostServerOptions = {
  host: string;
  mcpUrl: string;
  port: string;
  store: ProjectStore;
};

export function startHostServer(options: HostServerOptions): HostServer {
  const websocketHub = new WebSocketHub(options.store);
  const app = createHostApp(options);
  const server = createServer(async (request, response) => {
    try {
      const fetchRequest = await nodeRequestToFetchRequest(request);
      const fetchResponse = await app.fetch(fetchRequest);
      await writeFetchResponse(response, fetchResponse);
    } catch (error) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`);
    }
  });

  server.on("upgrade", (request, socket) => {
    websocketHub.handleUpgrade(request, socket as Socket);
  });

  server.listen(Number(options.port), options.host);

  return {
    close() {
      websocketHub.close();
      server.close();
    },
    server
  };
}

function createHostApp(options: HostServerOptions): Hono {
  const app = new Hono();

  app.use("/mcp", cors());

  app.get("/health", (context) => {
    return context.json({
      ok: true,
      server: "glyphsmith-cli",
      mcpUrl: options.mcpUrl,
      projectFile: options.store.projectFile
    });
  });

  app.get("/project", (context) => {
    return context.json({
      project: options.store.readProject(),
      revision: options.store.revision()
    });
  });

  app.options("/mcp", (context) => {
    return context.body(null, 204);
  });

  app.post("/mcp", async (context) => {
    const body = await context.req.json();
    const result = await handleMcpBody({ store: options.store }, body);

    if (!result) {
      return context.json({}, 202);
    }

    return context.json(result);
  });

  app.notFound((context) => {
    return context.json({ ok: false, error: "Not found." }, 404);
  });

  return app;
}

async function nodeRequestToFetchRequest(request: IncomingMessage): Promise<Request> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  const method = request.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";

  return new Request(url, {
    method,
    headers,
    body: hasBody ? (await readRequestBody(request)).toString("utf8") : undefined
  });
}

function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk) => {
      chunks.push(chunk as Buffer);
    });

    request.on("end", () => {
      resolveBody(Buffer.concat(chunks));
    });

    request.on("error", rejectBody);
  });
}

async function writeFetchResponse(response: ServerResponse, fetchResponse: Response): Promise<void> {
  response.writeHead(fetchResponse.status, Object.fromEntries(fetchResponse.headers.entries()));
  response.end(Buffer.from(await fetchResponse.arrayBuffer()));
}
