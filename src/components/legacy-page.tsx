"use client";

import { useEffect, useState } from "react";

type LegacyPageProps = {
  markup: string;
  css: string;
  scripts: string[];
};

const loadedScripts = new Map<string, Promise<void>>();

function loadScript(src: string) {
  const existing = loadedScripts.get(src);
  if (existing) return existing;

  const scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Não foi possível carregar ${src}.`));
    document.body.appendChild(script);
  });

  loadedScripts.set(src, scriptPromise);
  return scriptPromise;
}

export default function LegacyPage({ markup, css, scripts }: LegacyPageProps) {
  const [scriptError, setScriptError] = useState("");

  useEffect(() => {
    let active = true;
    const pagePath = window.location.pathname;

    function navigateAcrossPages(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === pagePath) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.assign(destination.href);
    }

    function reloadAfterHistoryNavigation() {
      window.setTimeout(() => {
        if (window.location.pathname !== pagePath) {
          window.location.reload();
        }
      }, 0);
    }

    document.addEventListener("click", navigateAcrossPages, true);
    window.addEventListener("popstate", reloadAfterHistoryNavigation);

    async function initialize() {
      for (const script of scripts) {
        await loadScript(script);
      }
    }

    initialize().catch((error: unknown) => {
      if (active) {
        setScriptError(
          error instanceof Error ? error.message : "Não foi possível iniciar esta página.",
        );
      }
    });

    return () => {
      active = false;
      document.removeEventListener("click", navigateAcrossPages, true);
      window.removeEventListener("popstate", reloadAfterHistoryNavigation);
    };
  }, [scripts]);

  return (
    <>
      {scriptError ? <p className="legacy-error" role="alert">{scriptError}</p> : null}
      <style>{css}</style>
      <div dangerouslySetInnerHTML={{ __html: markup }} />
    </>
  );
}
