/** No work until a caller asks for a demo operation; concurrent callers share startup. */
export function lazyEngine(start) {
  let pending;
  return () => {
    if (!pending) pending = Promise.resolve().then(start).finally(() => { pending = null; });
    return pending;
  };
}
