import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export class T3 {
  private client: Client | null = null;
  constructor(private url: string, private token: () => string, private refresh?: () => Promise<void>) {}

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    const client = new Client({ name: "discord-bot", version: "0.1.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(this.url), {
        requestInit: { headers: { Authorization: `Bearer ${this.token()}` } },
      }),
    );
    return (this.client = client);
  }

  async call<T = any>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        const res: any = await (await this.connect()).callTool({ name, arguments: args }, undefined, { timeout: 15 * 60_000 });
        if (res.isError) throw new Error(res.content?.find((c: any) => c.text)?.text ?? `${name} failed`);
        return res.structuredContent as T;
      } catch (e: any) {
        if (attempt === 0 && /connect|fetch|closed|ECONN|401|session|invalid_mcp/i.test(String(e?.message))) {
          this.client = null;
          if (this.refresh && /401|invalid_mcp/i.test(String(e?.message))) await this.refresh();
          continue;
        }
        throw e;
      }
    }
  }
}
