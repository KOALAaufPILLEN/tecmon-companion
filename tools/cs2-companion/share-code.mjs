const alphabet = "ABCDEFGHJKLMNOPQRSTUVWXYZabcdefhijkmnopqrstuvwxyz23456789";

export function shareCode(value) {
  if (typeof value !== "string") throw new Error("Ungültiger Sharecode.");
  const code = value.trim();
  if (!/^CSGO(-[A-Za-z0-9]{5}){5}$/.test(code) ||
      ![...code.slice(5).replaceAll("-", "")].every((c) => alphabet.includes(c)))
    throw new Error("Ungültiger Sharecode. Erwartet wird CSGO-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx.");
  return code;
}

export function matchDownloadRequest(value) {
  if (!value || value.format !== "tecmon-match-download" || value.version !== 1 ||
      !Array.isArray(value.shareCodes) || !value.shareCodes.length || value.shareCodes.length > 10)
    throw new Error("Bitte eine Match-Datei mit 1 bis 10 Sharecodes öffnen.");
  return [...new Set(value.shareCodes.map(shareCode))];
}
