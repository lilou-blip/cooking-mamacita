import "./LoadingScreen.css";

interface LoadingScreenProps {
  message?: string;
  fullScreen?: boolean;
}

export function LoadingScreen({ message = "Ça mijote...", fullScreen = true }: LoadingScreenProps) {
  return (
    <div className={`loading-screen${fullScreen ? " loading-screen--full" : ""}`}>
      <svg className="loading-screen__art" viewBox="0 0 120 120" role="presentation" aria-hidden="true">
        <ellipse className="loading-screen__shadow" cx="60" cy="100" rx="30" ry="6" />

        <path
          className="loading-screen__bowl"
          d="M28 58 C28 58 32 96 60 96 C88 96 92 58 92 58 Z"
        />
        <ellipse className="loading-screen__rim" cx="60" cy="58" rx="32" ry="9" />
        <ellipse className="loading-screen__batter" cx="60" cy="57" rx="26" ry="6.5" />

        <g className="loading-screen__whisk">
          <rect x="57" y="14" width="6" height="34" rx="3" className="loading-screen__handle" />
          <path
            className="loading-screen__wires"
            d="M60 44
               C 46 50, 44 62, 60 66
               M60 44
               C 74 50, 76 62, 60 66
               M60 44
               C 50 54, 52 64, 60 66
               M60 44
               C 70 54, 68 64, 60 66"
          />
        </g>

        <circle className="loading-screen__spark loading-screen__spark--1" cx="34" cy="52" r="2" />
        <circle className="loading-screen__spark loading-screen__spark--2" cx="88" cy="48" r="1.6" />
        <circle className="loading-screen__spark loading-screen__spark--3" cx="80" cy="40" r="1.4" />
      </svg>
      <p className="loading-screen__message">{message}</p>
    </div>
  );
}
