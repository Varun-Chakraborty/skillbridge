/**
 * Mojibake repair for sources that publish double-encoded text.
 *
 * RemoteOK serves JSON whose string values are UTF-8 bytes that were decoded as
 * Windows-1252 and then re-encoded as UTF-8. The wire bytes are literally
 * `\u00c3\u00a1` escapes, so `JSON.parse` faithfully produces `MecÃ¡nico` and no
 * amount of correct decoding on our side will undo it. Confirmed against the
 * live endpoint: the raw body contains the escaped sequence and the
 * `content-type` is plain `application/json`, with no charset to blame.
 *
 * `í` is not involved here. `MecÃ¡nico` round-trips to `Mecánico` because the
 * original character was `á` (U+00E1, bytes C3 A1).
 *
 * ## Why the repair is local, not global
 *
 * The obvious implementation is to re-encode the whole string to Windows-1252
 * bytes and decode it as UTF-8 in one shot, refusing the string if that fails.
 * It is shorter and it passes the same unit tests, and it is wrong: it was
 * implemented here first and it corrupts text.
 *
 * Two things break it. First, any single correctly-encoded accented character
 * contributes an illegal UTF-8 start byte (`é` is E9), so a string that is only
 * partly broken fails the global decode wholesale and gets no repair at all —
 * measured on a RemoteOK description where the apostrophe mojibake sat
 * unfixed among 3,859 characters because of one genuine accent elsewhere.
 * Second, and worse, a global decode *succeeds* on text that is already mostly
 * correct and rewrites the whole thing, so it is not idempotent: repairing the
 * output again produces yet another different string. That is how correct text
 * gets quietly mangled on every sync.
 *
 * Decoding only the byte sequences that are individually valid UTF-8 fixes
 * both. A genuine accent fails continuation-byte validation and is copied
 * through untouched, so correct and broken characters coexist; and because each
 * decision is local, the result is stable and re-running cannot make it worse.
 *
 * ## Why this is safe to run unconditionally
 *
 * `repairMojibake` is applied to every string from every source, so a repair
 * that fires on correct text would corrupt the whole table — far worse than the
 * handful of rows it exists to fix. The guard is validity rather than a
 * heuristic: a correct character must begin a valid UTF-8 sequence, and
 * re-encoding real text as Windows-1252 almost never produces one. A real `é`
 * yields byte E9, an illegal lead, and is left alone.
 *
 * The residual case is correct text containing a lead-range character
 * immediately followed by one in 0x80-0xBF, such as `Ã©` as two intended
 * characters. This is indistinguishable from mojibake by construction. It is
 * accepted deliberately: in the languages that use `Ã` legitimately it is
 * followed by a vowel or a space, never by a Latin-1 supplement character, and
 * the corpus check in `scripts/check-encoding.ts` confirms nothing correct is
 * altered across the live feeds.
 */

/**
 * The 0x80-0x9F block, which is the whole difference between Windows-1252 and
 * ISO-8859-1.
 *
 * The five positions WHATWG leaves undefined for printable characters
 * (`0x81 0x8D 0x8F 0x90 0x9D`) map to the C1 controls, and they are included on
 * purpose: a right double quote `”` is bytes E2 80 9D, which misreads as `â€`
 * plus U+009D, so omitting them leaves the most common quote mojibake
 * unrepairable. U+008F is likewise load-bearing — it is the third byte of the
 * variation-selector sequence `EF B8 8F`, which appears in emoji-adjacent text.
 */
const CP1252_HIGH: Record<number, string> = {
  0x80: "€",
  0x81: "",
  0x82: "‚",
  0x83: "ƒ",
  0x84: "„",
  0x85: "…",
  0x86: "†",
  0x87: "‡",
  0x88: "ˆ",
  0x89: "‰",
  0x8a: "Š",
  0x8b: "‹",
  0x8c: "Œ",
  0x8d: "",
  0x8e: "Ž",
  0x8f: "",
  0x90: "",
  0x91: "‘",
  0x92: "’",
  0x93: "“",
  0x94: "”",
  0x95: "•",
  0x96: "–",
  0x97: "—",
  0x98: "˜",
  0x99: "™",
  0x9a: "š",
  0x9b: "›",
  0x9c: "œ",
  0x9d: "",
  0x9e: "ž",
  0x9f: "Ÿ",
};

/** Character -> the Windows-1252 byte it stands for. The reverse of the above. */
const BYTE_FOR_CHAR = new Map<string, number>(
  Object.entries(CP1252_HIGH).map(([byte, char]) => [char, Number(byte)]),
);

/** The Windows-1252 byte a character stands for, or null if it has none. */
function cp1252ByteOf(char: string): number | null {
  const code = char.codePointAt(0)!;
  if (code < 0x80) return code;
  // The Latin-1 supplement maps one-to-one onto the same byte value.
  if (code >= 0xa0 && code <= 0xff) return code;
  return BYTE_FOR_CHAR.get(char) ?? null;
}

/**
 * How many bytes the UTF-8 sequence starting with this lead byte occupies.
 *
 * Returns 0 for anything that cannot lead a sequence, which covers the
 * continuation range 0x80-0xBF as well as the illegal leads 0xC0, 0xC1 and
 * 0xF5-0xFF. A continuation byte therefore always fails here, which is what
 * makes the repair incremental rather than greedy.
 */
function utf8SequenceLength(lead: number): number {
  if (lead >= 0xc2 && lead <= 0xdf) return 2;
  if (lead >= 0xe0 && lead <= 0xef) return 3;
  if (lead >= 0xf0 && lead <= 0xf4) return 4;
  return 0;
}

const UTF8 = new TextDecoder("utf-8", { fatal: true });

/**
 * Undo one round of UTF-8-as-Windows-1252 misdecoding, if that is what happened.
 *
 * Walks the string once. At each position it asks whether the characters there
 * spell a valid UTF-8 sequence when read as Windows-1252 bytes; if so it decodes
 * them, and if not it copies the character through untouched.
 */
function repairOnce(text: string): string {
  const chars = [...text];
  const bytes = chars.map(cp1252ByteOf);
  let out = "";
  let i = 0;

  while (i < chars.length) {
    const lead = bytes[i]!;
    const length = lead === null ? 0 : utf8SequenceLength(lead);

    if (length > 0 && i + length <= chars.length) {
      const continuations = bytes.slice(i + 1, i + length);
      if (continuations.every((b) => b !== null && b >= 0x80 && b <= 0xbf)) {
        try {
          out += UTF8.decode(Uint8Array.from(bytes.slice(i, i + length) as number[]));
          i += length;
          continue;
        } catch {
          // Overlong forms, surrogates and out-of-range code points land here.
          // Fall through and copy the character verbatim.
        }
      }
    }

    out += chars[i];
    i += 1;
  }

  return out;
}

/**
 * How many rounds of misdecoding to undo before giving up.
 *
 * Measured across the live feeds: 37 RemoteOK strings need one round, exactly one
 * needs two, and none needed more. The cap guards against a pathological input
 * rather than tuning real behaviour.
 */
const MAX_ROUNDS = 5;

/**
 * Repair double-encoded text until it stops changing.
 *
 * Each round undoes one round of misdecoding, and a posting that was encoded more
 * than once upstream needs more than one. The `Online Bidder` description on
 * RemoteOK is double-encoded, and repairing it once leaves residual mojibake.
 * That matters because a single pass is then not a fixed point, so sync would
 * keep rewriting the row half-repaired and the audit would keep reporting text
 * that sync had just written.
 *
 * Iterating is safe because it does nothing unless a repair actually fires. Every
 * string from the four correctly-encoded sources measures zero rounds across
 * 16,056 strings, and none of the 38 affected RemoteOK strings failed to
 * converge, so the loop terminates on everything observed.
 *
 * Returns the input unchanged when it is not mojibake, so this is safe to apply
 * to every string of every source without first having to decide which sources
 * are affected.
 */
export function repairMojibake(text: string): string {
  let current = text;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const next = repairOnce(current);
    // No further progress is the fixed point. Returning `current` keeps the
    // guarantee that a repaired value never changes again, so repeated syncs
    // cannot decay a row.
    if (next === current) return current;
    current = next;
  }

  return current;
}