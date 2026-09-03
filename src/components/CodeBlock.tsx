"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

interface CodeBlockProps {
  code: string;
  lang?: string;
}

const LANG_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  tsx: "tsx",
  jsx: "jsx",
  py: "python",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
};

export default function CodeBlock({ code, lang }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const normalizedLang = LANG_ALIASES[(lang ?? "").toLowerCase()] ?? (lang || "text");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { codeToHtml } = await import("shiki");
        const out = await codeToHtml(code, {
          lang: normalizedLang || "text",
          theme: "github-dark",
        });
        if (!cancelled) setHtml(out);
      } catch {
        if (!cancelled) setHtml(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, normalizedLang]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-white/10">
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/40 text-xs text-gray-400 font-mono-custom">
        <span>{lang || "text"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-white transition-colors"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Kopyalandı" : "Kopyala"}
        </button>
      </div>
      {html ? (
        <div className="[&>pre]:m-0 [&>pre]:p-3 [&>pre]:overflow-x-auto text-sm" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="m-0 p-3 overflow-x-auto text-sm bg-[#0d1117] font-mono-custom">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
