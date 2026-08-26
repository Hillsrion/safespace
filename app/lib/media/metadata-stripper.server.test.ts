import { describe, expect, it } from "vitest";
import { stripMediaMetadata } from "./metadata-stripper.server";

function ascii(value: string): Uint8Array {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}

function join(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function riffChunk(type: string, payload: Uint8Array): Uint8Array {
  const output = new Uint8Array(8 + payload.length + (payload.length % 2));
  output.set(ascii(type), 0);
  new DataView(output.buffer).setUint32(4, payload.length, true);
  output.set(payload, 8);
  return output;
}

function wavWithInfo(): Uint8Array {
  const chunks = join(
    riffChunk("fmt ", new Uint8Array(16)),
    riffChunk("LIST", ascii("INFOauthor")),
    riffChunk("data", Uint8Array.from([1, 2, 3, 4]))
  );
  const output = join(ascii("RIFF"), new Uint8Array(4), ascii("WAVE"), chunks);
  new DataView(output.buffer).setUint32(4, output.length - 8, true);
  return output;
}

function mp4Box(type: string, payload: Uint8Array): Uint8Array {
  const output = new Uint8Array(8 + payload.length);
  new DataView(output.buffer).setUint32(0, output.length, false);
  output.set(ascii(type), 4);
  output.set(payload, 8);
  return output;
}

describe("format-aware metadata stripping", () => {
  it("physically removes JPEG EXIF while keeping the image scan", () => {
    const jpeg = Uint8Array.from([
      0xff, 0xd8,
      0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
      0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9,
    ]);
    const stripped = stripMediaMetadata(jpeg, "image/jpeg");

    expect(stripped.metadataStripped).toBe(true);
    expect(stripped.metadataRemoved).toBe(true);
    expect(stripped.removedMetadataKinds).toContain("EXIF/XMP");
    expect([...stripped.bytes]).toEqual([
      0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9,
    ]);
  });

  it("removes ID3v2 bytes and requires a real MP3 frame afterwards", () => {
    const mp3 = join(
      Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 4]),
      ascii("PII!"),
      Uint8Array.from([0xff, 0xfb, 0x90, 0x64, 1, 2, 3, 4])
    );
    const stripped = stripMediaMetadata(mp3, "audio/mpeg");
    expect(stripped.removedMetadataKinds).toEqual(["ID3v2"]);
    expect([...stripped.bytes.slice(0, 4)]).toEqual([0xff, 0xfb, 0x90, 0x64]);
  });

  it("rebuilds WAV without INFO metadata and with a valid RIFF length", () => {
    const stripped = stripMediaMetadata(wavWithInfo(), "audio/wav");
    expect(stripped.removedMetadataKinds).toContain("WAV INFO metadata");
    expect(new DataView(stripped.bytes.buffer).getUint32(4, true)).toBe(stripped.bytes.length - 8);
    expect(new TextDecoder().decode(stripped.bytes)).not.toContain("author");
  });

  it("zeroes QuickTime/MP4 metadata payloads without shifting media offsets", () => {
    const metadata = mp4Box("udta", ascii("GPS=48.8566,2.3522"));
    const input = join(
      mp4Box("ftyp", ascii("isom0000")),
      mp4Box("moov", metadata),
      mp4Box("mdat", Uint8Array.from([1, 2, 3, 4]))
    );
    const stripped = stripMediaMetadata(input, "video/mp4");
    expect(stripped.bytes).toHaveLength(input.length);
    expect(stripped.removedMetadataKinds).toContain("MP4/QuickTime metadata");
    expect(new TextDecoder().decode(stripped.bytes)).not.toContain("48.8566");
    expect(new TextDecoder().decode(stripped.bytes)).toContain("free");
  });
});
