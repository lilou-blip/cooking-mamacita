import type { CSSProperties, ReactNode } from "react";
import "./BookSpread.css";

interface BookSpreadProps {
  left: ReactNode;
  right: ReactNode;
  accentColor?: string;
  turning?: "next" | "prev" | null;
}

export function BookSpread({ left, right, accentColor, turning }: BookSpreadProps) {
  const style = accentColor ? ({ "--gingham-color": accentColor } as CSSProperties) : undefined;

  return (
    <div className="book-spread" style={style}>
      <div
        className={`book-spread__page book-spread__page--left${turning === "prev" ? " book-spread__page--turning" : ""}`}
      >
        {left}
      </div>
      <div className="book-spread__spine" aria-hidden="true" />
      <div
        className={`book-spread__page book-spread__page--right${turning === "next" ? " book-spread__page--turning" : ""}`}
      >
        {right}
      </div>
    </div>
  );
}
