/**
 * WebM(Opus) → OGG(Opus) remuxer for in-composer voice notes.
 *
 * WhatsApp voice notes (PTT) must be OGG/Opus (RFC 7845). Evergreen
 * Chromium — and therefore WebView2 — cannot record OGG through
 * MediaRecorder; its only Opus-capable container is `audio/webm`. The
 * recorder hands this module the finished WebM take and it is re-muxed,
 * without re-encoding, into a spec-compliant Ogg Opus stream:
 *
 * - page 0: OpusHead identification header (BOS), copied from the WebM
 *   `CodecPrivate` (channels, pre-skip, output gain, mapping family);
 * - page 1: OpusTags;
 * - audio pages: the exact Opus packets carried by the WebM SimpleBlocks,
 *   granule-positioned from each packet's TOC (frame count × frame
 *   duration at 48 kHz) so players and the server-side PTT authentication
 *   see true duration.
 *
 * The server never has to accept a foreign container: a take that cannot
 * be authenticated as Opus-in-WebM throws and the composer fails closed.
 */

const CRC32_POLY = 0x04c11db7;

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index << 24;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 0x80000000) !== 0 ? ((value << 1) ^ CRC32_POLY) >>> 0 : (value << 1) >>> 0;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

/** Ogg page CRC: poly 0x04c11db7, init 0, no reflection, no final xor. */
function oggCrc32(bytes: Uint8Array): number {
  let crc = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte === undefined) break;
    const entry = CRC32_TABLE[(crc >>> 24) ^ byte];
    if (entry === undefined) break;
    crc = ((crc << 8) ^ (entry >>> 0)) >>> 0;
  }
  return crc >>> 0;
}

const EBML_ID_SEGMENT = 0x18538067;
const EBML_ID_SEEK_HEAD = 0x114d9b74;
const EBML_ID_VOID = 0xec;
const EBML_ID_INFO = 0x1549a966;
const EBML_ID_TRACKS = 0x1654ae6b;
const EBML_ID_TRACK_ENTRY = 0xae;
const EBML_ID_TRACK_NUMBER = 0xd7;
const EBML_ID_CODEC_ID = 0x86;
const EBML_ID_CODEC_PRIVATE = 0x63a2;
const EBML_ID_CLUSTER = 0x1f43b675;
const EBML_ID_SIMPLE_BLOCK = 0xa3;
const EBML_ID_BLOCK_GROUP = 0xa0;
const EBML_ID_BLOCK = 0xa1;
const EBML_ID_CUES = 0x1c53bb6b;
const EBML_ID_TAGS = 0x1254c367;
const EBML_ID_CHAPTERS = 0x1043a770;
const EBML_ID_ATTACHMENTS = 0x1941a469;

/** Elements that legally follow a Cluster inside a Segment. */
const SEGMENT_SIBLING_IDS = new Set<number>([
  EBML_ID_INFO,
  EBML_ID_TRACKS,
  EBML_ID_CUES,
  EBML_ID_TAGS,
  EBML_ID_CHAPTERS,
  EBML_ID_ATTACHMENTS,
  EBML_ID_SEEK_HEAD,
  // Clusters are strictly sequential; a Cluster header always terminates the
  // unknown-size extent of the cluster before it.
  EBML_ID_CLUSTER,
]);

interface ParsedElement {
  id: number;
  /** Offset of the element payload. */
  dataOffset: number;
  /** Payload length in bytes; `null` for the streaming all-ones marker. */
  dataSize: number | null;
  /** Offset of the first byte after the element (valid when dataSize !== null). */
  endOffset: number;
}

function readVint(bytes: Uint8Array, offset: number): { value: number; length: number } | null {
  if (offset >= bytes.length) return null;
  const first = bytes[offset];
  if (first === undefined || first === 0) return null;
  let length = 1;
  let mask = 0x80;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > bytes.length) return null;
  let value = first & (mask - 1);
  for (let index = 1; index < length; index += 1) {
    const byte = bytes[offset + index];
    if (byte === undefined) return null;
    value = value * 256 + byte;
  }
  return { value, length };
}

/**
 * Reads one element header. Element IDs keep their length-marker bits; sizes
 * strip them. The all-ones size encodes "unknown" and is reported as `null`.
 */
function parseElementHeader(bytes: Uint8Array, offset: number, limit: number): ParsedElement | null {
  if (offset >= limit) return null;
  const idVint = readVint(bytes, offset);
  if (!idVint) return null;
  // Re-derive the full ID value with the marker bit set.
  const idFirst = bytes[offset];
  if (idFirst === undefined) return null;
  let idLength = 1;
  let idMask = 0x80;
  while (idMask !== 0 && (idFirst & idMask) === 0) {
    idMask >>= 1;
    idLength += 1;
  }
  let id = 0;
  for (let index = 0; index < idLength; index += 1) {
    const byte = bytes[offset + index];
    if (byte === undefined) return null;
    id = id * 256 + byte;
  }
  const sizeOffset = offset + idLength;
  const sizeVint = readVint(bytes, sizeOffset);
  if (!sizeVint) return null;
  const maxForLength = 2 ** (7 * sizeVint.length) - 1;
  const unknown = sizeVint.value === maxForLength;
  const dataOffset = sizeOffset + sizeVint.length;
  if (unknown) {
    return { id, dataOffset, dataSize: null, endOffset: limit };
  }
  const dataSize = sizeVint.value;
  const endOffset = dataOffset + dataSize;
  if (endOffset > limit) return null;
  return { id, dataOffset, dataSize, endOffset };
}

function asciiEquals(bytes: Uint8Array, offset: number, length: number, expected: string): boolean {
  if (offset + length > bytes.length) return false;
  for (let index = 0; index < length; index += 1) {
    if (bytes[offset + index] !== expected.charCodeAt(index)) return false;
  }
  return true;
}

interface OpusTrackInfo {
  trackNumber: number;
  /** Raw CodecPrivate payload; must start with the OpusHead magic. */
  codecPrivate: Uint8Array;
}

interface ParsedWebm {
  opus: OpusTrackInfo;
  /** Opus packets in stream order, each starting with its TOC byte. */
  packets: Uint8Array[];
}

function parseTrackEntry(bytes: Uint8Array, start: number, end: number): OpusTrackInfo | null {
  let trackNumber: number | null = null;
  let codecId: string | null = null;
  let codecPrivate: Uint8Array | null = null;
  let offset = start;
  while (offset < end) {
    const element = parseElementHeader(bytes, offset, end);
    if (!element || element.dataSize === null) return null;
    if (element.id === EBML_ID_TRACK_NUMBER) {
      const first = bytes[element.dataOffset];
      if (first === undefined) return null;
      trackNumber = first;
      for (let index = 1; index < element.dataSize; index += 1) {
        const byte = bytes[element.dataOffset + index];
        if (byte === undefined) return null;
        trackNumber = trackNumber * 256 + byte;
      }
    } else if (element.id === EBML_ID_CODEC_ID) {
      codecId = String.fromCharCode(...bytes.subarray(element.dataOffset, element.dataOffset + element.dataSize));
    } else if (element.id === EBML_ID_CODEC_PRIVATE) {
      codecPrivate = bytes.slice(element.dataOffset, element.dataOffset + element.dataSize);
    }
    offset = element.endOffset;
  }
  if (codecId !== "A_OPUS") return null;
  if (
    trackNumber === null ||
    codecPrivate === null ||
    codecPrivate.length < 19 ||
    !asciiEquals(codecPrivate, 0, 8, "OpusHead")
  ) {
    throw new Error("Voice take is not an authenticated Opus-in-WebM recording");
  }
  return { trackNumber, codecPrivate };
}

function parseTracks(bytes: Uint8Array, start: number, end: number): OpusTrackInfo | null {
  let found: OpusTrackInfo | null = null;
  let offset = start;
  while (offset < end) {
    const element = parseElementHeader(bytes, offset, end);
    if (!element || element.dataSize === null) break;
    if (element.id === EBML_ID_TRACK_ENTRY) {
      const track = parseTrackEntry(bytes, element.dataOffset, element.endOffset);
      if (track) {
        if (found) throw new Error("Voice take carries more than one Opus track");
        found = track;
      }
    }
    offset = element.endOffset;
  }
  return found;
}

/** Opus TOC: frame duration in ms for the packet's configuration. */
function opusFrameDurationMs(toc: number): number {
  const config = toc >> 3;
  if (config < 12) return [10, 20, 40, 60][config & 3] ?? 20;
  return (config & 1) === 0 ? 10 : 20;
}

/** Opus TOC: number of frames carried by the packet. */
function opusFrameCount(packet: Uint8Array): number {
  const toc = packet[0];
  if (toc === undefined) {
    throw new Error("Voice take has a truncated Opus packet");
  }
  const code = toc & 0x03;
  if (code === 0 || code === 2) return 1;
  if (code === 1) return 2;
  // Code 3: one frame-count byte follows the TOC (bit 7 is padding flag).
  if (packet.length < 2) throw new Error("Voice take has a truncated Opus packet");
  const countByte = packet[1];
  if (countByte === undefined) {
    throw new Error("Voice take has a truncated Opus packet");
  }
  return (countByte & 0x3f) + 1;
}

function opusPacketSamples48k(packet: Uint8Array): number {
  const toc = packet[0];
  if (toc === undefined) {
    throw new Error("Voice take has a truncated Opus packet");
  }
  return opusFrameCount(packet) * opusFrameDurationMs(toc) * 48;
}

function parseBlockPayload(
  bytes: Uint8Array,
  start: number,
  end: number,
  opusTrackNumber: number,
  packets: Uint8Array[],
): void {
  const trackVint = readVint(bytes, start);
  if (!trackVint) throw new Error("Voice take has a truncated block header");
  const trackNumber = trackVint.value;
  if (start + trackVint.length + 3 > end) throw new Error("Voice take has a truncated block header");
  let cursor = start + trackVint.length;
  // int16 relative timecode + flags — parsed for bounds, not needed for muxing.
  const flags = bytes[cursor + 2];
  if (flags === undefined) throw new Error("Voice take has a truncated block header");
  cursor += 3;
  const lacing = (flags >> 1) & 0x03;
  if (trackNumber !== opusTrackNumber) return;
  if (lacing === 0) {
    if (cursor >= end) throw new Error("Voice take has an empty Opus block");
    packets.push(bytes.slice(cursor, end));
    return;
  }
  if (lacing === 3) throw new Error("Voice take uses unsupported EBML lacing");
  if (cursor >= end) throw new Error("Voice take has an empty Opus block");
  const frameCountByte = bytes[cursor];
  if (frameCountByte === undefined) {
    throw new Error("Voice take has a truncated laced block");
  }
  const frameCount = frameCountByte + 1;
  cursor += 1;
  const sizes: number[] = [];
  if (lacing === 1) {
    // Xiph: N-1 length chains of 255s terminated by a byte < 255.
    for (let index = 0; index < frameCount - 1; index += 1) {
      let size = 0;
      while (cursor < end) {
        const byte = bytes[cursor];
        if (byte === undefined) {
          throw new Error("Voice take has a truncated laced block");
        }
        cursor += 1;
        size += byte;
        if (byte !== 255) break;
      }
      sizes.push(size);
    }
  } else {
    // Fixed: one implicit equal size shared by every frame.
    const remaining = end - cursor;
    const perFrame = Math.floor(remaining / frameCount);
    for (let index = 0; index < frameCount; index += 1) sizes.push(perFrame);
  }
  for (let index = 0; index < frameCount; index += 1) {
    const size = index === frameCount - 1 ? end - cursor : sizes[index];
    if (size === undefined || size <= 0 || cursor + size > end) {
      throw new Error("Voice take has a truncated laced block");
    }
    packets.push(bytes.slice(cursor, cursor + size));
    cursor += size;
  }
}

function parseCluster(
  bytes: Uint8Array,
  start: number,
  end: number,
  opus: OpusTrackInfo,
  packets: Uint8Array[],
): void {
  let offset = start;
  while (offset < end) {
    const element = parseElementHeader(bytes, offset, end);
    if (!element || element.dataSize === null) break;
    if (element.id === EBML_ID_SIMPLE_BLOCK) {
      parseBlockPayload(bytes, element.dataOffset, element.endOffset, opus.trackNumber, packets);
    } else if (element.id === EBML_ID_BLOCK_GROUP) {
      let groupOffset = element.dataOffset;
      while (groupOffset < element.endOffset) {
        const child = parseElementHeader(bytes, groupOffset, element.endOffset);
        if (!child || child.dataSize === null) break;
        if (child.id === EBML_ID_BLOCK) {
          parseBlockPayload(bytes, child.dataOffset, child.endOffset, opus.trackNumber, packets);
        }
        groupOffset = child.endOffset;
      }
    }
    offset = element.endOffset;
  }
}

/**
 * An unknown-size Cluster ends where the next Segment-level element begins;
 * scan forward for its element header instead of walking child elements.
 */
function detectSegmentSibling(bytes: Uint8Array, from: number, limit: number): number {
  let offset = from;
  while (offset + 16 <= limit) {
    const probe = parseElementHeader(bytes, offset, limit);
    if (probe && SEGMENT_SIBLING_IDS.has(probe.id)) return offset;
    if (probe && probe.dataSize !== null && probe.endOffset > offset) {
      offset = probe.endOffset;
      continue;
    }
    offset += 1;
  }
  return limit;
}

function parseWebmOpus(bytes: Uint8Array): ParsedWebm {
  if (bytes.length < 4 || !asciiEquals(bytes, 0, 4, "\x1a\x45\xdf\xa3")) {
    throw new Error("Voice take is not a WebM recording");
  }
  let opus: OpusTrackInfo | null = null;
  const packets: Uint8Array[] = [];
  let offset = 0;
  let segment: ParsedElement | null = null;
  while (offset < bytes.length) {
    const element = parseElementHeader(bytes, offset, bytes.length);
    if (!element) break;
    if (element.id === EBML_ID_SEGMENT) {
      segment = element;
      break;
    }
    offset = element.dataSize === null ? bytes.length : element.endOffset;
  }
  if (!segment) throw new Error("Voice take has no WebM segment");
  offset = segment.dataOffset;
  const limit = segment.dataSize === null ? bytes.length : segment.endOffset;
  while (offset < limit) {
    const element = parseElementHeader(bytes, offset, limit);
    if (!element) break;
    if (element.id === EBML_ID_VOID || element.id === EBML_ID_SEEK_HEAD) {
      offset = element.dataSize === null ? limit : element.endOffset;
      continue;
    }
    if (element.id === EBML_ID_INFO || element.id === EBML_ID_CUES || element.id === EBML_ID_TAGS) {
      offset = element.dataSize === null ? limit : element.endOffset;
      continue;
    }
    if (element.id === EBML_ID_TRACKS && element.dataSize !== null) {
      const track = parseTracks(bytes, element.dataOffset, element.endOffset);
      if (track) opus = track;
      offset = element.endOffset;
      continue;
    }
    if (element.id === EBML_ID_CLUSTER) {
      if (!opus) throw new Error("Voice take carries audio before its Opus track");
      const clusterEnd =
        element.dataSize === null ? detectSegmentSibling(bytes, element.dataOffset, limit) : element.endOffset;
      parseCluster(bytes, element.dataOffset, clusterEnd, opus, packets);
      offset = clusterEnd;
      continue;
    }
    offset = element.dataSize === null ? limit : element.endOffset;
  }
  if (!opus) throw new Error("Voice take has no Opus track");
  if (packets.length === 0) throw new Error("Voice take carries no Opus audio");
  return { opus, packets };
}

// --- Ogg page writer ---

/** Deterministic stream serial; Ogg requires uniqueness within a stream only. */
const OGG_SERIAL = 0x53616866;
const PAGE_HEADER_TYPE_BOS = 0x02;
const PAGE_HEADER_TYPE_EOS = 0x04;

function oggLacingFor(size: number): number[] {
  const table: number[] = [];
  let remaining = size;
  while (remaining >= 255) {
    table.push(255);
    remaining -= 255;
  }
  table.push(remaining);
  return table;
}

function writeOggPage(
  target: Uint8Array[],
  headerType: number,
  sequence: number,
  granule: number,
  lacingTable: number[],
  body: Uint8Array,
): void {
  const page = new Uint8Array(27 + lacingTable.length + body.length);
  const view = new DataView(page.buffer);
  page[0] = 0x4f; // "O"
  page[1] = 0x67; // "g"
  page[2] = 0x67; // "g"
  page[3] = 0x53; // "S"
  page[4] = 0; // stream structure version
  page[5] = headerType;
  // Granule position: 64-bit little-endian; values stay far below 2^53.
  view.setUint32(6, granule >>> 0, true);
  view.setUint32(10, Math.floor(granule / 0x100000000), true);
  view.setUint32(14, OGG_SERIAL, true);
  view.setUint32(18, sequence, true);
  view.setUint32(22, 0, true); // CRC placeholder
  page[26] = lacingTable.length;
  for (let index = 0; index < lacingTable.length; index += 1) {
    const entry = lacingTable[index];
    if (entry === undefined) break;
    page[27 + index] = entry;
  }
  page.set(body, 27 + lacingTable.length);
  view.setUint32(22, oggCrc32(page), true);
  target.push(page);
}

/** One packet per Ogg page group: simple, spec-clean, player-friendly. */
function appendPacket(
  pages: Uint8Array[],
  sequence: number,
  headerType: number,
  granule: number,
  packet: Uint8Array,
): void {
  writeOggPage(pages, headerType, sequence, granule, oggLacingFor(packet.length), packet);
}

function buildOpusHead(codecPrivate: Uint8Array): Uint8Array {
  const head = codecPrivate.slice(0, 19);
  head[8] = 1; // version
  return head;
}

function buildOpusTags(): Uint8Array {
  const vendor = "SahelFlow";
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  tags.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0); // "OpusTags"
  new DataView(tags.buffer).setUint32(8, vendor.length, true);
  for (let index = 0; index < vendor.length; index += 1) {
    tags[12 + index] = vendor.charCodeAt(index);
  }
  new DataView(tags.buffer).setUint32(12 + vendor.length, 0, true);
  return tags;
}

/**
 * Remuxes a Chromium `audio/webm;codecs=opus` MediaRecorder take into an
 * RFC 7845 Ogg Opus stream. Throws when the take is not authenticated
 * Opus-in-WebM; the composer surfaces that as an honest failure instead of
 * uploading a foreign container.
 */
export function remuxWebmOpusToOgg(webm: Uint8Array): Uint8Array<ArrayBuffer> {
  const { opus, packets } = parseWebmOpus(webm);
  const preSkipLow = opus.codecPrivate[10];
  const preSkipHigh = opus.codecPrivate[11];
  if (preSkipLow === undefined || preSkipHigh === undefined) {
    throw new Error("Voice take has an incomplete OpusHead");
  }
  const preSkip = preSkipLow | (preSkipHigh << 8);
  const pages: Uint8Array[] = [];

  appendPacket(pages, 0, PAGE_HEADER_TYPE_BOS, 0, buildOpusHead(opus.codecPrivate));
  appendPacket(pages, 1, 0, 0, buildOpusTags());

  let cumulativeSamples = 0;
  let sequence = 2;
  for (const packet of packets) {
    if (packet.length === 0) throw new Error("Voice take carries an empty Opus packet");
    cumulativeSamples += opusPacketSamples48k(packet);
    appendPacket(pages, sequence, 0, preSkip + cumulativeSamples, packet);
    sequence += 1;
  }
  if (pages.length > 0) {
    // Mark the final page EOS, then re-commit its CRC over the patched
    // header — the flag participates in the Ogg checksum.
    const last = pages[pages.length - 1];
    if (last) {
      const headerFlags = last[5] ?? 0;
      last[5] = (headerFlags | PAGE_HEADER_TYPE_EOS) & 0xff;
      const lastView = new DataView(last.buffer);
      lastView.setUint32(22, 0, true);
      lastView.setUint32(22, oggCrc32(last), true);
    }
  }

  const total = pages.reduce((sum, page) => sum + page.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const page of pages) {
    output.set(page, offset);
    offset += page.length;
  }
  return output;
}

/** Test-only export: internals used by the unit suite for independent checks. */
export const __testing = { oggCrc32, opusFrameCount, opusFrameDurationMs, opusPacketSamples48k };
