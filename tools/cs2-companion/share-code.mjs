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

/**
 * Sharecode aus Match-ID, Reservierungs-ID (Outcome) und TV-Port bilden, wie in den
 * Match-Infos von Valve (alle Zahlen als Text oder BigInt, nie über Number runden).
 */
export function encodeShareCode({ matchId, outcomeId, tvPort }) {
  const bytes = new Uint8Array(18);
  const put64 = (value, from) => {
    let v = BigInt(value);
    for (let i = 0; i < 8; i++) {
      bytes[from + i] = Number(v & 0xffn);
      v >>= 8n;
    }
  };
  put64(matchId, 0);
  put64(outcomeId, 8);
  const port = Number(tvPort) & 0xffff;
  bytes[16] = port & 0xff;
  bytes[17] = (port >> 8) & 0xff;
  let big = 0n;
  for (const b of bytes) big = (big << 8n) | BigInt(b);
  let chars = "";
  for (let i = 0; i < 25; i++) {
    chars += alphabet[Number(big % 57n)];
    big /= 57n;
  }
  return `CSGO-${chars.slice(0, 5)}-${chars.slice(5, 10)}-${chars.slice(10, 15)}-${chars.slice(15, 20)}-${chars.slice(20, 25)}`;
}
