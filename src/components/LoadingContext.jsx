import React, { createContext, useContext, useState, useCallback, useRef } from "react";

const LoadingContext = createContext(null);

export function LoadingProvider({ children }) {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(null); // null = indeterminate spin
  const [label, setLabel] = useState("Loading...");
  const simInterval = useRef(null);

  // Show loader. If you don't know real progress, just call showLoader("Loading fees...")
  // and it will auto-creep toward 90% until you call hideLoader().
  const showLoader = useCallback((text = "Loading...", autoSimulate = true) => {
    setLabel(text);
    setProgress(autoSimulate ? 0 : null);
    setIsLoading(true);

    if (autoSimulate) {
      let p = 0;
      clearInterval(simInterval.current);
      simInterval.current = setInterval(() => {
        p = Math.min(p + Math.random() * 12, 90);
        setProgress(p);
      }, 200);
    }
  }, []);

  // Call this when your real fetch resolves.
  const hideLoader = useCallback(() => {
    clearInterval(simInterval.current);
    setProgress(100);
    setTimeout(() => {
      setIsLoading(false);
      setProgress(null);
    }, 300);
  }, []);

  // For manual/real progress tracking (e.g. multi-step fetch), call this directly.
  const updateProgress = useCallback((value, text) => {
    clearInterval(simInterval.current);
    setProgress(value);
    if (text) setLabel(text);
  }, []);

  return (
    <LoadingContext.Provider
      value={{ isLoading, progress, label, showLoader, hideLoader, updateProgress }}
    >
      {children}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const ctx = useContext(LoadingContext);
  if (!ctx) throw new Error("useLoading must be used within a LoadingProvider");
  return ctx;
}
