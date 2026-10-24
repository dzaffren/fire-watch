import { LogoMark } from "../icons";
import "./preview.css";

// The three page headers as each page draws them, in both themes. Print takes the light tokens.
const HEADERS = [
  ["Landing", <a className="fw-link" href="/?tool">Open the tool</a>],
  [
    "Tool",
    <div className="app-top-end">
      <p className="fw-help">Records are sealed on Base Sepolia, a test network</p>
      <a className="fw-link" href="/">About Fire Watch</a>
    </div>,
  ],
  ["Pack", <p className="fw-help">Records are sealed on Base Sepolia, a test network</p>],
] as const;

export default function SiteLogoPreview() {
  return (
    <div className="preview preview--page">
      <div className="preview-bar">
        <p className="fw-help">Preview of site-logo. Each page's header with the Clasp mark, light then dark. Print uses the light one.</p>
      </div>
      {(["light", "dark"] as const).map((theme) => (
        <section key={theme} data-theme={theme} className="logo-preview" aria-label={`${theme} theme`}>
          {HEADERS.map(([page, end]) => (
            <div key={page} className="logo-preview-row">
              <p className="fw-help">{page}</p>
              <header className="app-top">
                <span className="app-name"><LogoMark />Fire Watch</span>
                {end}
              </header>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
