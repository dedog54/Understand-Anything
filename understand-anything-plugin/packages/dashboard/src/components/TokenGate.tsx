import { useState } from "react";
import { tokenFromInput } from "../accessToken";

interface TokenGateProps {
  onTokenValid: (token: string) => void;
  expired?: boolean;
}

export default function TokenGate({ onTokenValid, expired = false }: TokenGateProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const zh = typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = tokenFromInput(input);
    if (!token) { setError(zh ? "请粘贴含 token 的完整访问链接，或访问令牌。" : "Paste a complete access URL containing a token, or the token itself."); return; }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/knowledge-graph.json?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        onTokenValid(token);
      } else if (res.status === 401 || res.status === 403) {
        setError(zh ? "该访问凭证已失效，请使用当前服务终端打印的新链接。" : "This token is no longer valid. Use the access URL printed by the current server.");
      } else {
        setError(`Unexpected response (${res.status}). Is the dashboard server running?`);
      }
    } catch (err) {
      setError(
        `Could not reach the server: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-root noise-overlay">
      <div className="w-full max-w-md px-8 py-10 bg-surface border border-border-subtle rounded-lg shadow-2xl">
        {/* Heading */}
        <h1 className="font-heading text-2xl text-text-primary tracking-wide text-center mb-2">
        {zh ? (expired ? "访问链接已失效" : "打开本地图谱") : (expired ? "Access link expired" : "Open local graph")}
        </h1>
        <p className="text-text-muted text-sm text-center mb-8">
          {zh ? "请从服务终端的 🔑 提示行复制完整访问链接，粘贴到下方。也可以直接粘贴令牌。" : "Copy the complete access URL from the 🔑 line in the server terminal and paste it below. A token alone also works."}
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError(null);
            }}
            placeholder={zh ? "粘贴完整访问链接或令牌…" : "Paste access URL or token…"}
            aria-label={zh ? "访问链接或令牌" : "Access URL or token"}
            autoFocus
            className="w-full px-4 py-3 bg-elevated border border-border-subtle rounded text-text-primary placeholder:text-text-muted/50 font-mono text-sm focus:outline-none focus:border-accent transition-colors"
          />

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-full py-3 bg-accent text-root font-semibold rounded transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (zh ? "正在验证…" : "Validating…") : (zh ? "打开图谱" : "Open graph")}
          </button>
        </form>
      </div>
    </div>
  );
}
