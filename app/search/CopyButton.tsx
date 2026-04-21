"use client";

import { useState } from "react";

type CopyButtonProps = {
  text: string;
  label: string;
};

export default function CopyButton({ text, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" onClick={handleCopy} style={{ padding: "8px 10px" }}>
      {copied ? "Copied" : label}
    </button>
  );
}
