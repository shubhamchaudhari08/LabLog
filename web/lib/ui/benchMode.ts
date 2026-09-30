/** Bench mode is full-screen: the shell drops its chrome here (contracts/ui-routes.md §1). */
export const isBenchPath = (pathname: string) =>
  /^\/dashboard\/experiments\/[^/]+\/bench\/?$/.test(pathname);
