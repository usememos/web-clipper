import { ArrowRight, Check } from "lucide-react";
import { createRoot } from "react-dom/client";
import lockup from "../../assets/brand/lockup.svg?url";
import mark from "../../assets/brand/mark.svg?url";
import { quote } from "./fixtures";
import "./artboards.css";

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand${compact ? " compact" : ""}`}>
      <img src={lockup} alt="Memos" />
      <span>Web Clipper</span>
    </div>
  );
}

function SourcePage({ compact = false }: { compact?: boolean }) {
  return (
    <article className={`source-page${compact ? " compact-source" : ""}`}>
      <div className="source-address">fieldnotes.example</div>
      <div className="source-body">
        <div className="publication">Field notes</div>
        <h2>
          A little room <br />
          to think
        </h2>
        <p>Not everything needs to become a plan.</p>
        <p>
          <mark>{quote}</mark>
        </p>
        <p>Write down what catches your attention. You can decide what to do with it another day.</p>
      </div>
    </article>
  );
}

function Popup({ review = false }: { review?: boolean }) {
  return (
    <div className={`popup-frame${review ? " review-popup" : ""}`}>
      <iframe title="Memos clipper" src="./ui.html" />
    </div>
  );
}

function Selection() {
  return (
    <main className="artboard screenshot selection">
      <Brand compact />
      <div className="headline">
        <h1>
          From a page
          <br />
          to your memos.
        </h1>
        <p>
          Save a selection, with a link
          <br />
          back to where you found it.
        </p>
      </div>
      <div className="selection-source">
        <SourcePage />
      </div>
      <div className="selection-popup">
        <Popup />
      </div>
      <div className="selection-arrow">
        <ArrowRight strokeWidth={1.5} />
      </div>
      <div className="bottom-note">Pages, selections, and images.</div>
    </main>
  );
}

function Review() {
  return (
    <main className="artboard screenshot review">
      <Brand compact />
      <div className="headline">
        <h1>
          Review before
          <br />
          saving.
        </h1>
        <p>
          Edit the clip.
          <br />
          Choose who can see it.
        </p>
      </div>
      <div className="review-popup-position">
        <Popup review />
      </div>
      <div className="review-note">
        <span className="note-rule" />
        <p>
          Your own words.
          <br />
          The original source.
        </p>
      </div>
      <div className="bottom-note">Private until you choose otherwise.</div>
    </main>
  );
}

function History() {
  return (
    <main className="artboard screenshot history">
      <div className="history-headline">
        <h1>Find a saved clip.</h1>
        <p>Search your clips. Open the source or your memo.</p>
      </div>
      <div className="history-frame">
        <iframe title="Saved clips" src="./ui.html?view=history" />
      </div>
    </main>
  );
}

function SmallPromo() {
  return (
    <main className="artboard small-promo">
      <Brand compact />
      <div className="promo-quote">
        <span>Leave a little</span>
        <br />
        <span>room to think.</span>
      </div>
      <ArrowRight className="promo-arrow" strokeWidth={1.5} />
      <img className="promo-bird" src={mark} alt="" />
      <div className="promo-caption">
        <Check size={15} /> Saved to Memos
      </div>
    </main>
  );
}

function Marquee() {
  return (
    <main className="artboard marquee">
      <Brand />
      <div className="headline">
        <h1>
          Save what
          <br />
          you find.
        </h1>
        <p>
          Pages, selections, and images.
          <br />
          Kept in your memos.
        </p>
      </div>
      <div className="marquee-source">
        <SourcePage compact />
      </div>
      <div className="marquee-popup">
        <Popup />
      </div>
    </main>
  );
}

const art = new URLSearchParams(location.search).get("art") ?? "selection";
const views: Record<string, React.ReactNode> = {
  selection: <Selection />,
  review: <Review />,
  history: <History />,
  small: <SmallPromo />,
  marquee: <Marquee />,
};
createRoot(document.getElementById("artboard")!).render(views[art] ?? views.selection);
