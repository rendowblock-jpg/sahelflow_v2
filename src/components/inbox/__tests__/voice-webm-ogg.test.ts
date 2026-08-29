import { describe, expect, it } from "vitest";

import {
  __testing,
  remuxWebmOpusToOgg,
} from "@/components/inbox/voice-webm-ogg";

const { oggCrc32, opusFrameCount, opusFrameDurationMs, opusPacketSamples48k } =
  __testing;

/**
 * Independent Ogg CRC re-implementation (poly 0x04c11db7, init 0, MSB-first,
 * no final xor) used to verify the writer without sharing its table code.
 */
function independentOggCrc(bytes: Uint8Array): number {
  const table: number[] = [];
  for (let index = 0; index < 256; index += 1) {
    let value = index << 24;
    for (let bit = 0; bit < 8; bit += 1) {
      value =
        (value & 0x80000000) !== 0
          ? (((value << 1) ^ 0x04c11db7) >>> 0)
          : (value << 1) >>> 0;
      value = value >>> 0;
    }
    table.push(value);
  }
  let crc = 0;
  for (const byte of bytes) {
    const entry = table[(((crc >>> 24) ^ byte) & 0xff)];
    crc = (((crc << 8) >>> 0) ^ (entry ?? 0)) >>> 0;
  }
  return crc >>> 0;
}

// --- synthetic WebM builder ---

function ebmlId(id: number): number[] {
  const bytes: number[] = [];
  let value = id;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value = Math.floor(value / 256);
  }
  return bytes;
}

function sizeVint(value: number, forcedLength?: number): number[] {
  let length = forcedLength ?? 0;
  if (!length) {
    length = 1;
    while (value >= 2 ** (7 * length) - 1 && length < 8) length += 1;
  }
  const bytes: number[] = [];
  for (let index = length - 1; index >= 1; index -= 1) {
    bytes.unshift(value & 0xff);
    value = Math.floor(value / 256);
  }
  bytes.unshift((value & (0xff >> length)) | (0x80 >> (length - 1)));
  return bytes;
}

function unknownSizeVint(length = 2): number[] {
  // All data bits set for the given length: first byte keeps the length
  // marker (0x01 for 8 bytes — the form Chrome uses for streaming Segments).
  const first = (0x100 >> (length - 1)) - 1;
  return [first, ...new Array(length - 1).fill(0xff)];
}

function el(id: number, payload: Uint8Array, unknownSize = false): Uint8Array {
  const head = [...ebmlId(id), ...(unknownSize ? unknownSizeVint(id === 0x18538067 ? 8 : 2) : sizeVint(payload.length))];
  return new Uint8Array([...head, ...payload]);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function opusHead(preSkip: number, channels = 1): Uint8Array {
  const head = new Uint8Array(19);
  head.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0); // "OpusHead"
  head[8] = 1; // version
  head[9] = channels;
  head[10] = preSkip & 0xff;
  head[11] = (preSkip >> 8) & 0xff;
  const view = new DataView(head.buffer);
  view.setUint32(12, 48000, true); // input sample rate
  view.setUint16(16, 0, true); // output gain
  head[18] = 0; // mapping family
  return head;
}

/** SILK NB 20 ms single-frame packet (TOC 0x08) carrying 2 payload bytes. */
const OPUS_PACKET_20MS = new Uint8Array([0x08, 0x00]);
const SAMPLES_PER_PACKET = 20 * 48; // 960

function simpleBlock(trackNumber: number, timecode: number, packet: Uint8Array): Uint8Array {
  return el(0xa3, blockPayload(trackNumber, timecode, packet));
}

function blockPayload(trackNumber: number, timecode: number, packet: Uint8Array): Uint8Array {
  const payload = new Uint8Array(4 + packet.length);
  payload[0] = 0x80 | trackNumber; // 1-byte track vint with marker
  payload[1] = (timecode >> 8) & 0xff;
  payload[2] = timecode & 0xff;
  payload[3] = 0x80; // keyframe
  payload.set(packet, 4);
  return payload;
}

function buildWebm(options?: {
  unknownSizeSegment?: boolean;
  unknownSizeCluster?: boolean;
  useBlockGroup?: boolean;
  clusters?: number;
  preSkip?: number;
}): Uint8Array {
  const preSkip = options?.preSkip ?? 312;
  const clusterCount = options?.clusters ?? 3;
  const tracks = el(
    0x1654ae6b,
    concat(
      el(0xae, concat(el(0xd7, new Uint8Array([1])), el(0x86, new Uint8Array([0x41, 0x5f, 0x4f, 0x50, 0x55, 0x53])), el(0x63a2, opusHead(preSkip)))),
    ),
  );
  const info = el(0x1549a966, el(0x2ad7b1, new Uint8Array([0x0f, 0x42, 0x40])));
  const clusters: Uint8Array[] = [];
  for (let cluster = 0; cluster < clusterCount; cluster += 1) {
    const timestamp = el(0xe7, new Uint8Array([0, 0, 0, cluster * 40]));
    const blocks: Uint8Array[] = [];
    for (let block = 0; block < 2; block += 1) {
      if (options?.useBlockGroup && cluster === 0 && block === 0) {
        blocks.push(el(0xa0, el(0xa1, blockPayload(1, cluster * 40 + block * 20, OPUS_PACKET_20MS))));
      } else {
        blocks.push(simpleBlock(1, cluster * 40 + block * 20, OPUS_PACKET_20MS));
      }
    }
    clusters.push(el(0x1f43b675, concat(timestamp, ...blocks), options?.unknownSizeCluster));
  }
  const cues = el(0x1c53bb6b, new Uint8Array([0x00]));
  const segmentPayload = concat(info, tracks, ...clusters, cues);
  const header = el(0x1a45dfa3, new Uint8Array([0x01]));
  return concat(header, el(0x18538067, segmentPayload, options?.unknownSizeSegment));
}

// --- remuxer ---

describe("remuxWebmOpusToOgg", () => {
  it("remuxes a known-size WebM take into a structurally valid Ogg Opus stream", () => {
    const output = remuxWebmOpusToOgg(buildWebm());
    expect(output.subarray(0, 4)).toEqual(new Uint8Array([0x4f, 0x67, 0x67, 0x53]));

    // Walk pages: every page CRC verifies against the independent table.
    let offset = 0;
    const pages: { headerType: number; granule: number; sequence: number; bodyLength: number }[] = [];
    while (offset < output.length) {
      expect(output[offset]).toBe(0x4f);
      expect(output[offset + 1]).toBe(0x67);
      expect(output[offset + 2]).toBe(0x67);
      expect(output[offset + 3]).toBe(0x53);
      const view = new DataView(output.buffer, offset);
      const storedCrc = view.getUint32(22, true);
      const segmentCount = output[offset + 26] ?? 0;
      const lacing = output.subarray(offset + 27, offset + 27 + segmentCount);
      const bodyLength = lacing.reduce((sum, value) => sum + value, 0);
      const pageLength = 27 + segmentCount + bodyLength;
      const zeroed = output.slice(offset, offset + pageLength);
      zeroed.fill(0, 22, 26);
      expect(independentOggCrc(zeroed)).toBe(storedCrc);
      pages.push({
        headerType: output[offset + 5] ?? 0,
        granule: view.getUint32(6, true) + view.getUint32(10, true) * 0x100000000,
        sequence: view.getUint32(18, true),
        bodyLength,
      });
      offset += pageLength;
    }
    expect(offset).toBe(output.length);

    // page 0: BOS OpusHead; page 1: OpusTags; 6 audio pages; EOS on the last.
    expect(pages).toHaveLength(8);
    expect(pages[0]?.headerType).toBe(0x02);
    expect(pages[0]?.granule).toBe(0);
    expect(pages[1]?.headerType).toBe(0x00);
    expect((pages[pages.length - 1]?.headerType ?? 0) & 0x04).toBe(0x04);
    pages.forEach((page, index) => expect(page.sequence).toBe(index));
    pages.slice(2).forEach((page) => expect(page.bodyLength).toBe(OPUS_PACKET_20MS.length));
    expect(pages[pages.length - 1]?.granule).toBe(312 + 6 * SAMPLES_PER_PACKET);
  });

  it("survives streaming containers: unknown-size Segment and Cluster", () => {
    const known = remuxWebmOpusToOgg(buildWebm());
    const streaming = remuxWebmOpusToOgg(
      buildWebm({ unknownSizeSegment: true, unknownSizeCluster: true }),
    );
    expect(streaming).toEqual(known);
  });

  it("accepts BlockGroup-wrapped blocks alongside SimpleBlocks", () => {
    const output = remuxWebmOpusToOgg(buildWebm({ useBlockGroup: true }));
    expect(output.length).toBeGreaterThan(0);
    // Same packet count ⇒ same final granule as the plain variant.
    const plain = remuxWebmOpusToOgg(buildWebm());
    const lastGranule = (bytes: Uint8Array): number => {
      const view = new DataView(bytes.buffer, bytes.length - 27 - 3);
      return view.getUint32(6, true) + view.getUint32(10, true) * 0x100000000;
    };
    expect(lastGranule(output)).toBe(lastGranule(plain));
  });

  it("carries the source pre-skip and channels into the OpusHead page", () => {
    const output = remuxWebmOpusToOgg(buildWebm({ preSkip: 600 }));
    const head = output.slice(27 + 1, 27 + 1 + 19);
    expect(String.fromCharCode(...head.subarray(0, 8))).toBe("OpusHead");
    expect(head[9]).toBe(1);
    expect((head[10] ?? 0) | ((head[11] ?? 0) << 8)).toBe(600);
  });

  it("fails closed on foreign or damaged takes", () => {
    expect(() => remuxWebmOpusToOgg(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toThrow();
    expect(() => remuxWebmOpusToOgg(new Uint8Array())).toThrow();

    // WebM without any Opus track (CodecID is Vorbis).
    const vorbisTracks = el(
      0x1654ae6b,
      el(0xae, concat(el(0xd7, new Uint8Array([1])), el(0x86, new Uint8Array([0x41, 0x5f, 0x56, 0x4f, 0x52, 0x42, 0x49, 0x53])))),
    );
    const noOpus = concat(
      el(0x1a45dfa3, new Uint8Array([0x01])),
      el(0x18538067, concat(vorbisTracks), true),
    );
    expect(() => remuxWebmOpusToOgg(noOpus)).toThrow(/no Opus track/);

    // CodecPrivate without the OpusHead magic.
    const badPrivate = el(
      0x1654ae6b,
      el(0xae, concat(el(0xd7, new Uint8Array([1])), el(0x86, new Uint8Array([0x41, 0x5f, 0x4f, 0x50, 0x55, 0x53])), el(0x63a2, new Uint8Array(19)))),
    );
    const badHead = concat(
      el(0x1a45dfa3, new Uint8Array([0x01])),
      el(0x18538067, concat(badPrivate), true),
    );
    expect(() => remuxWebmOpusToOgg(badHead)).toThrow(/authenticated Opus-in-WebM/);
  });
});

describe("opus TOC accounting", () => {
  it("counts frames and durations per RFC 6716", () => {
    expect(opusFrameCount(new Uint8Array([0x08]))).toBe(1); // code 0
    expect(opusFrameCount(new Uint8Array([0x09]))).toBe(2); // code 1: 2 equal-size frames
    expect(opusFrameCount(new Uint8Array([0x0a]))).toBe(2); // code 2: 2 frames, different sizes (§3.1)
    expect(opusFrameCount(new Uint8Array([0x0b, 0x02]))).toBe(2); // code 3: M=2 directly (§3.2.5, "M MUST NOT be zero")
    expect(() => opusFrameCount(new Uint8Array([0x0b, 0x00]))).toThrow(); // M=0 is invalid
    expect(opusFrameDurationMs(0x08)).toBe(20); // config 1 → SILK NB 20 ms
    expect(opusFrameDurationMs(0x00)).toBe(10); // config 0 → 10 ms
    expect(opusFrameDurationMs(0x18)).toBe(60); // config 3 & 3 → 60 ms
    expect(opusFrameDurationMs(0x60)).toBe(10); // config 12 → hybrid 10 ms
    expect(opusFrameDurationMs(0x68)).toBe(20); // config 13 → hybrid 20 ms
    // CELT configs 16–31: [2.5, 5, 10, 20] ms by config & 3 (Table 2).
    expect(opusFrameDurationMs(0x80)).toBe(2.5); // config 16 → CELT 2.5 ms
    expect(opusFrameDurationMs(0x88)).toBe(5); // config 17 → CELT 5 ms
    expect(opusFrameDurationMs(0x90)).toBe(10); // config 18 → CELT 10 ms
    expect(opusFrameDurationMs(0x98)).toBe(20); // config 19 → CELT 20 ms
    expect(opusPacketSamples48k(OPUS_PACKET_20MS)).toBe(960);
    // Granule math for multi-frame codes: 2 frames × 20 ms × 48 kHz.
    expect(opusPacketSamples48k(new Uint8Array([0x0a]))).toBe(1920);
    expect(opusPacketSamples48k(new Uint8Array([0x0b, 0x02]))).toBe(1920);
  });

  it("verifies the writer CRC against the independent implementation", () => {
    const page = new Uint8Array(27 + 1 + 5);
    const view = new DataView(page.buffer);
    page.set([0x4f, 0x67, 0x67, 0x53], 0);
    view.setUint32(22, 0, true);
    page[26] = 1;
    page.set([1, 2, 3, 4, 5], 27);
    expect(oggCrc32(page)).toBe(independentOggCrc(page));
  });
});
