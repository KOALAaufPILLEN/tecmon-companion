/** Keep the acknowledgement readable before shutting down the old HTTP service. */
export function updateHandoff(server, response, exit, delay=1500) {
  // Called only after a confirmed, verified updater has successfully spawned.
  // A desktop/browser timeout can close the response while the download runs.
  // In that case "finish" never fires, but the updater still needs us to exit.
  let scheduled=false;
  const schedule=()=>{
    if(scheduled)return;
    scheduled=true;
    const timer=setTimeout(()=>{server.closeAllConnections();server.close();exit?.();},delay);
    timer.unref();
  };
  response.once("finish",schedule);
  response.once("close",schedule);
  if(response.destroyed || response.writableFinished)schedule();
}
