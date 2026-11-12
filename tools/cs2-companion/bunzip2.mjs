// Aus tecmon lib/demoReplay/bunzip2.ts übernommen (gleiches Projekt, MIT). Nur Typen entfernt.
/**
 * bzip2-Entpacker als TransformStream, ohne Abhaengigkeiten.
 *
 * Valve liefert die Demos aus dem Match-Verlauf als .dem.bz2 aus. Der Browser
 * kann das nicht selbst entpacken (DecompressionStream kennt nur gzip und
 * deflate), deshalb steckt hier ein kleiner Decoder fuer das Format:
 * Huffman-Gruppen, Move-to-front mit RUNA/RUNB, Burrows-Wheeler ruecklaeufig
 * und zum Schluss die Lauflaengen der ersten Stufe. Jeder Block wird ueber
 * seine CRC geprueft. Mehrere aneinandergehaengte Streams (pbzip2) gehen auch.
 */
const BLOCK_MAGIC_HI = 0x314159;
const BLOCK_MAGIC_LO = 0x265359;
const END_MAGIC_HI = 0x177245;
const END_MAGIC_LO = 0x385090;
const GROUP_SIZE = 50;
const MAX_CODE_LEN = 20;
/** So viele gepackte Bytes sollen vorliegen, bevor ein Block versucht wird. */
const LOOKAHEAD = 1 << 20;
const OUT_CHUNK = 1 << 20;
/** Ein Block braucht mehr Eingabe, als bisher angekommen ist. */
class NeedMore extends Error {
}
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i << 24;
        for (let k = 0; k < 8; k++)
            c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1;
        table[i] = c >>> 0;
    }
    return table;
})();
export class Bunzip2 {
    buf = new Uint8Array(0);
    pos = 0;
    bitBuf = 0;
    bitCount = 0;
    blockMax = 0;
    tt = null;
    streamCrc = 0;
    state = "header";
    ended = false;
    /** Neue gepackte Bytes anhaengen. */
    push(chunk) {
        if (!chunk.length)
            return;
        const rest = this.buf.subarray(this.pos);
        const next = new Uint8Array(rest.length + chunk.length);
        next.set(rest, 0);
        next.set(chunk, rest.length);
        this.buf = next;
        this.pos = 0;
    }
    /** Keine weiteren Daten mehr. */
    end() {
        this.ended = true;
    }
    /**
     * Entpackt so viele Bloecke wie moeglich und gibt die Ausgabe weiter.
     * Ohne `end()` wird nur gearbeitet, solange genug Vorlauf da ist.
     */
    drain(emit) {
        while (this.state !== "done") {
            if (!this.ended && this.buf.length - this.pos < LOOKAHEAD)
                return;
            const saved = [this.pos, this.bitBuf, this.bitCount];
            try {
                if (this.state === "header") {
                    if (this.ended && this.pos >= this.buf.length && this.bitCount < 8) {
                        if (this.blockMax)
                            this.state = "done";
                        else
                            throw new Error("Leere bzip2-Datei");
                        return;
                    }
                    this.readHeader();
                }
                else {
                    this.readBlock(emit);
                }
            }
            catch (error) {
                if (!(error instanceof NeedMore))
                    throw error;
                [this.pos, this.bitBuf, this.bitCount] = saved;
                if (this.ended)
                    throw new Error("bzip2-Datei ist abgeschnitten");
                return;
            }
        }
    }
    bits(n) {
        while (this.bitCount < n) {
            if (this.pos >= this.buf.length)
                throw new NeedMore();
            this.bitBuf = ((this.bitBuf << 8) | this.buf[this.pos++]) >>> 0;
            this.bitCount += 8;
        }
        this.bitCount -= n;
        const value = (this.bitBuf >>> this.bitCount) & ((1 << n) - 1);
        this.bitBuf &= (1 << this.bitCount) - 1;
        return value;
    }
    /** Ein Huffman-Symbol; schneller Weg mit genug Bits im Puffer. */
    symbol(table) {
        const { buf } = this;
        while (this.bitCount <= 24 && this.pos < buf.length) {
            this.bitBuf = ((this.bitBuf << 8) | buf[this.pos++]) >>> 0;
            this.bitCount += 8;
        }
        let zn = table.minLen;
        if (this.bitCount >= MAX_CODE_LEN) {
            const { bitBuf, bitCount } = this;
            const limit = table.limit;
            let zvec = (bitBuf >>> (bitCount - zn)) & ((1 << zn) - 1);
            while (zvec > limit[zn]) {
                if (++zn > MAX_CODE_LEN)
                    throw new Error("bzip2-Datei ist beschaedigt");
                zvec = (bitBuf >>> (bitCount - zn)) & ((1 << zn) - 1);
            }
            this.bitCount -= zn;
            this.bitBuf = (bitBuf & ((1 << this.bitCount) - 1)) >>> 0;
            return table.perm[zvec - table.base[zn]];
        }
        let zvec = this.bits(zn);
        while (zvec > table.limit[zn]) {
            if (++zn > MAX_CODE_LEN)
                throw new Error("bzip2-Datei ist beschaedigt");
            zvec = (zvec << 1) | this.bits(1);
        }
        return table.perm[zvec - table.base[zn]];
    }
    bits32() {
        return ((this.bits(16) << 16) | this.bits(16)) >>> 0;
    }
    readHeader() {
        const b = this.bits(8);
        const z = this.bits(8);
        const h = this.bits(8);
        const level = this.bits(8) - 0x30;
        if (b !== 0x42 || z !== 0x5a || h !== 0x68 || level < 1 || level > 9) {
            if (this.blockMax) {
                // Muell hinter dem letzten Stream wird ignoriert.
                this.state = "done";
                return;
            }
            throw new Error("Keine bzip2-Datei");
        }
        const max = level * 100000;
        if (max > this.blockMax)
            this.tt = new Uint32Array(max);
        this.blockMax = Math.max(this.blockMax, max);
        this.streamCrc = 0;
        this.state = "blocks";
    }
    readBlock(emit) {
        const hi = this.bits(24);
        const lo = this.bits(24);
        if (hi === END_MAGIC_HI && lo === END_MAGIC_LO) {
            const crc = this.bits32();
            if (crc !== this.streamCrc)
                throw new Error("bzip2-Pruefsumme stimmt nicht");
            // Auf das naechste Byte springen; dort kann ein weiterer Stream folgen.
            this.bits(this.bitCount & 7);
            this.state = "header";
            return;
        }
        if (hi !== BLOCK_MAGIC_HI || lo !== BLOCK_MAGIC_LO)
            throw new Error("bzip2-Datei ist beschaedigt");
        const blockCrc = this.bits32();
        if (this.bits(1))
            throw new Error("Veraltete bzip2-Variante wird nicht unterstuetzt");
        const origPtr = this.bits(24);
        // Welche Bytes kommen im Block vor?
        const symToByte = [];
        const used = this.bits(16);
        for (let i = 0; i < 16; i++) {
            if (!(used & (0x8000 >> i)))
                continue;
            const k = this.bits(16);
            for (let j = 0; j < 16; j++)
                if (k & (0x8000 >> j))
                    symToByte.push(i * 16 + j);
        }
        if (!symToByte.length)
            throw new Error("bzip2-Datei ist beschaedigt");
        const alphaSize = symToByte.length + 2;
        const nGroups = this.bits(3);
        const nSelectors = this.bits(15);
        if (nGroups < 2 || nGroups > 6 || nSelectors < 1)
            throw new Error("bzip2-Datei ist beschaedigt");
        const order = Array.from({ length: nGroups }, (_, i) => i);
        const selectors = new Uint8Array(nSelectors);
        for (let i = 0; i < nSelectors; i++) {
            let j = 0;
            while (this.bits(1))
                if (++j >= nGroups)
                    throw new Error("bzip2-Datei ist beschaedigt");
            const v = order[j];
            for (; j > 0; j--)
                order[j] = order[j - 1];
            order[0] = v;
            selectors[i] = v;
        }
        // Huffman-Tabellen je Gruppe.
        const tables = [];
        const lengths = new Uint8Array(alphaSize);
        for (let t = 0; t < nGroups; t++) {
            let curr = this.bits(5);
            for (let s = 0; s < alphaSize; s++) {
                for (;;) {
                    if (curr < 1 || curr > MAX_CODE_LEN)
                        throw new Error("bzip2-Datei ist beschaedigt");
                    if (!this.bits(1))
                        break;
                    curr += this.bits(1) ? -1 : 1;
                }
                lengths[s] = curr;
            }
            let minLen = MAX_CODE_LEN;
            let maxLen = 0;
            for (let s = 0; s < alphaSize; s++) {
                minLen = Math.min(minLen, lengths[s]);
                maxLen = Math.max(maxLen, lengths[s]);
            }
            const perm = new Uint16Array(alphaSize);
            let pp = 0;
            for (let l = minLen; l <= maxLen; l++)
                for (let s = 0; s < alphaSize; s++)
                    if (lengths[s] === l)
                        perm[pp++] = s;
            const base = new Int32Array(MAX_CODE_LEN + 2);
            const limit = new Int32Array(MAX_CODE_LEN + 2).fill(-1);
            for (let s = 0; s < alphaSize; s++)
                base[lengths[s] + 1]++;
            for (let i = 1; i < base.length; i++)
                base[i] += base[i - 1];
            let vec = 0;
            for (let l = minLen; l <= maxLen; l++) {
                vec += base[l + 1] - base[l];
                limit[l] = vec - 1;
                vec <<= 1;
            }
            for (let l = minLen + 1; l <= maxLen; l++)
                base[l] = ((limit[l - 1] + 1) << 1) - base[l];
            tables.push({ limit, base, perm, minLen });
        }
        // Symbole lesen: RUNA/RUNB-Laeufe und Move-to-front.
        const tt = this.tt;
        const counts = new Int32Array(256);
        const mtf = Array.from({ length: symToByte.length }, (_, i) => i);
        const eob = alphaSize - 1;
        let nblock = 0;
        let groupNo = -1;
        let groupPos = 0;
        let table = tables[0];
        let runLen = 0;
        let runPow = 1;
        for (;;) {
            if (groupPos === 0) {
                if (++groupNo >= nSelectors)
                    throw new Error("bzip2-Datei ist beschaedigt");
                table = tables[selectors[groupNo]];
                groupPos = GROUP_SIZE;
            }
            groupPos--;
            const sym = this.symbol(table);
            if (sym <= 1) {
                runLen += (sym + 1) * runPow;
                runPow <<= 1;
                if (runLen > this.blockMax)
                    throw new Error("bzip2-Datei ist beschaedigt");
                continue;
            }
            if (runLen) {
                if (nblock + runLen > this.blockMax)
                    throw new Error("bzip2-Datei ist beschaedigt");
                const b = symToByte[mtf[0]];
                counts[b] += runLen;
                tt.fill(b, nblock, nblock + runLen);
                nblock += runLen;
                runLen = 0;
                runPow = 1;
            }
            if (sym === eob)
                break;
            if (nblock >= this.blockMax)
                throw new Error("bzip2-Datei ist beschaedigt");
            let i = sym - 1;
            const v = mtf[i];
            for (; i > 0; i--)
                mtf[i] = mtf[i - 1];
            mtf[0] = v;
            const b = symToByte[v];
            counts[b]++;
            tt[nblock++] = b;
        }
        if (origPtr >= nblock)
            throw new Error("bzip2-Datei ist beschaedigt");
        // Burrows-Wheeler rueckwaerts.
        let sum = 0;
        for (let i = 0; i < 256; i++) {
            const c = counts[i];
            counts[i] = sum;
            sum += c;
        }
        for (let i = 0; i < nblock; i++) {
            const b = tt[i] & 0xff;
            tt[counts[b]++] |= i << 8;
        }
        // Ausgabe mit Lauflaengen der ersten Stufe und CRC.
        let out = new Uint8Array(OUT_CHUNK);
        let o = 0;
        let crc = 0xffffffff;
        let p = tt[origPtr] >>> 8;
        let last = -1;
        let run = 0;
        for (let k = 0; k < nblock; k++) {
            const entry = tt[p];
            const b = entry & 0xff;
            p = entry >>> 8;
            let reps = 1;
            let value = b;
            if (run === 4) {
                reps = b;
                value = last;
                run = 0;
            }
            else if (b === last)
                run++;
            else {
                last = b;
                run = 1;
            }
            for (let r = 0; r < reps; r++) {
                if (o === OUT_CHUNK) {
                    emit(out);
                    out = new Uint8Array(OUT_CHUNK);
                    o = 0;
                }
                out[o++] = value;
                crc = (crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ value) & 0xff];
            }
        }
        if (o)
            emit(out.subarray(0, o));
        crc = ~crc >>> 0;
        if (crc !== blockCrc)
            throw new Error("bzip2-Pruefsumme stimmt nicht");
        this.streamCrc = (((this.streamCrc << 1) | (this.streamCrc >>> 31)) ^ crc) >>> 0;
    }
}
/** Entpackt einen bzip2-Bytestrom. */
export function bunzip2Stream() {
    const decoder = new Bunzip2();
    return new TransformStream({
        transform(chunk, controller) {
            decoder.push(chunk);
            decoder.drain((bytes) => controller.enqueue(bytes));
        },
        flush(controller) {
            decoder.end();
            decoder.drain((bytes) => controller.enqueue(bytes));
        },
    });
}
/** Entpackt einen ganzen Puffer auf einmal (Tests, kleine Dateien). */
export function bunzip2(bytes) {
    const decoder = new Bunzip2();
    const parts = [];
    decoder.push(bytes);
    decoder.end();
    decoder.drain((b) => parts.push(b.slice()));
    const out = new Uint8Array(parts.reduce((s, b) => s + b.length, 0));
    let o = 0;
    for (const b of parts) {
        out.set(b, o);
        o += b.length;
    }
    return out;
}
