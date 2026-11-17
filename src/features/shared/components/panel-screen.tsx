import type { PageKey } from "../types";

/** Keeps page transitions consistent while the shared admin shell stays mounted. */
export function PanelScreen({ page, children }: { page: PageKey; children: React.ReactNode }) {
  return (
    <div
      key={page}
      className="screen-transition motion-reduce:animate-none"
      aria-label={`${page} screen`}
    >
      {children}
    </div>
  );
}
