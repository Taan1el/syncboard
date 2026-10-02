interface DemoBarProps {
  onReset: () => void;
}

export function DemoBar({ onReset }: DemoBarProps) {
  return (
    <div className="demo-bar">
      <div className="container demo-bar-inner">
        <span>Demo: everything runs in your browser with sample data.</span>
        <span className="demo-bar-links">
          <button type="button" className="link-btn" onClick={onReset}>
            Reset sample data
          </button>
          <a href="https://github.com/Taan1el/syncboard" target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        </span>
      </div>
    </div>
  );
}
