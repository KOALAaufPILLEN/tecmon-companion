/** Keep the acknowledgement readable before shutting down the old HTTP service. */
export function updateHandoff(server, response, exit, delay=1500) {
  response.once("finish",()=>{
    const timer=setTimeout(()=>{server.closeAllConnections();server.close();exit?.();},delay);
    timer.unref();
  });
}
