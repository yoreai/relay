import { useState } from "react";

export default function CopyButton({ text }: { text: string }) {
  const [label, setLabel] = useState("copy");

  const handleClick = async () => {
    await navigator.clipboard.writeText(text);
    setLabel("copied");
    setTimeout(() => setLabel("copy"), 1200);
  };

  return (
    <button className="copy" onClick={handleClick}>
      {label}
    </button>
  );
}
