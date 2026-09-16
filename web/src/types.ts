/* Ambient declarations for the globals the app touches but does not own.
   `va` is Vercel Analytics: the page loads it from /_vercel/insights, so it
   may or may not be there, and the two call sites already guard on that. */
declare global {
  interface Window {
    va?: (...a: any[]) => void;
  }
}

export {};
