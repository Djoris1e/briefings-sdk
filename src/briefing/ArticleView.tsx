import { useLayoutEffect, useRef, useState } from "react";
import type { BriefingArticle } from "./types";
import "./article-view.css";

/** A bounded reading surface keeps the host's prompt and format controls nearby. */
export function ArticleView({ article, summary, title, briefingId, publisher = "Product updates", pending = false }: {
  article?: BriefingArticle; summary: string; title: string; briefingId?: string; publisher?: string; pending?: boolean;
}) {
  const reader = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [scrollable, setScrollable] = useState(false);
  const words = (article ? [article.title, article.dek, ...article.sections.flatMap(section => [section.heading, ...section.paragraphs])].join(" ") : summary).trim().split(/\s+/u).length;
  const minutes = Math.max(1, Math.ceil(words / 220));
  useLayoutEffect(() => {
    const element = reader.current;
    if (!element) return;
    element.scrollTop = 0;
    const measure = () => {
      const remaining = element.scrollHeight - element.clientHeight;
      setScrollable(remaining > 2);
      setProgress(remaining > 2 ? Math.min(1, element.scrollTop / remaining) : 1);
    };
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(element);
    if (element.firstElementChild) observer?.observe(element.firstElementChild);
    return () => { element.removeEventListener("scroll", measure); observer?.disconnect(); };
  }, [briefingId, article, summary]);
  return <div className="po-reader">
    <div className="po-reading-meta"><span>{publisher}</span><span>{pending ? "Preparing…" : `${minutes} min read`}</span></div>
    <div className="po-reading-progress" aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>
    <div ref={reader} className="po-reading-scroll" role="region" aria-label="Scrollable article" tabIndex={0}>
      <article className="po-article" aria-label="Generated text" aria-busy={pending}>
        <header><p className="po-article-eyebrow">Selected for you</p><h1>{article?.title ?? title}</h1>{article && <p className="po-article-dek">{article.dek}</p>}</header>
        {pending ? <div className="po-article-loading" role="status"><p>Preparing your article…</p><div aria-hidden="true"><i /><i /><i /></div></div> : article ? article.sections.map((section, index) => <section key={index}><h2>{section.heading}</h2>{section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</section>)
          : summary.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        {!pending && <div className="po-article-end" aria-hidden="true">∎</div>}
      </article>
    </div>
    {scrollable && <div className="po-reading-hint">{progress >= .98 ? "You’re all caught up." : "Scroll to keep reading"}</div>}
  </div>;
}
