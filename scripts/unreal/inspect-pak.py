#!/usr/bin/env python3
"""
Inspect Unreal Engine packages without any external tooling.

Unreal ships content in `.pak` (UnrealPak) and, since UE5, `.utoc`/`.ucas`
(IoStore = "Zen") containers. The asset names live in the *index*, which is
mostly plain text, so even a best-effort parse tells us what is inside a package.

Usage:
    python3 scripts/unreal/inspect-pak.py <file.pak> [<file.utoc> ...]

Prints the container version, the entry count and every file path found.
"""
from __future__ import annotations

import struct
import sys
from dataclasses import dataclass, field
from pathlib import Path

PAK_MAGIC = 0x5A6F12E1
UTOC_MAGIC = b"-==--==--==--==-"

# Pak file format versions we can reason about by name.
PAK_VERSIONS = {
    1: "Initial",
    2: "NoTimestamps",
    3: "CompressionEncryption",
    4: "IndexEncryption",
    5: "RelativeChunkOffsets",
    6: "DeleteRecords",
    7: "EncryptionKeyGuid",
    8: "FNameBasedCompressionMethod",
    9: "FrozenIndex",
    10: "PathHashIndex",
    11: "Fnv64BugFix",
}


class Reader:
    """Little-endian cursor over a bytes buffer."""

    def __init__(self, data: bytes, pos: int = 0) -> None:
        self.data = data
        self.pos = pos

    def u8(self) -> int:
        v = self.data[self.pos]
        self.pos += 1
        return v

    def i32(self) -> int:
        v = struct.unpack_from("<i", self.data, self.pos)[0]
        self.pos += 4
        return v

    def u32(self) -> int:
        v = struct.unpack_from("<I", self.data, self.pos)[0]
        self.pos += 4
        return v

    def i64(self) -> int:
        v = struct.unpack_from("<q", self.data, self.pos)[0]
        self.pos += 8
        return v

    def u64(self) -> int:
        v = struct.unpack_from("<Q", self.data, self.pos)[0]
        self.pos += 8
        return v

    def raw(self, n: int) -> bytes:
        v = self.data[self.pos : self.pos + n]
        self.pos += n
        return v

    def fstring(self) -> str:
        """Unreal FString: positive length = ANSI (with NUL), negative = UTF-16."""
        length = self.i32()
        if length == 0:
            return ""
        if length > 0:
            if length > 4096:  # refuse to walk off into garbage
                raise ValueError(f"implausible string length {length}")
            body = self.raw(length)
            return body.split(b"\x00", 1)[0].decode("utf-8", "replace")
        count = -length
        if count > 4096:
            raise ValueError(f"implausible wide string length {count}")
        body = self.raw(count * 2)
        return body.decode("utf-16-le", "replace").split("\x00", 1)[0]


@dataclass
class PakReport:
    kind: str = "pak"
    version: int = 0
    version_name: str = ""
    encrypted_index: bool = False
    encryption_key_guid: str = ""
    index_offset: int = 0
    index_size: int = 0
    entries: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def read_pak_info(data: bytes) -> PakReport:
    """Locate and parse the pak footer (FPakInfo) at the end of the file."""
    report = PakReport(kind="pak")
    # The footer is the last ~300 bytes; find the magic from the end.
    window_start = max(0, len(data) - 512)
    window = data[window_start:]
    idx = window.rfind(struct.pack("<I", PAK_MAGIC))
    if idx < 0:
        report.notes.append("no pak magic found - not an UnrealPak container")
        return report

    reader = Reader(data, window_start + idx)
    reader.u32()  # magic
    report.version = reader.u32()
    report.version_name = PAK_VERSIONS.get(report.version, "unknown")
    report.index_offset = reader.i64()
    report.index_size = reader.i64()
    reader.raw(20)  # index sha1

    if report.version >= 4:
        # compression method names: 5 slots from v8, 4 before that
        slots = 5 if report.version >= 8 else 4
        for _ in range(slots):
            try:
                reader.fstring()
            except Exception:
                break

    if report.version >= 4:
        try:
            report.encrypted_index = bool(reader.u8())
        except Exception:
            report.notes.append("footer truncated before the encryption flag")

    if report.version >= 7:
        try:
            guid = reader.raw(16)
            report.encryption_key_guid = guid.hex()
        except Exception:
            pass

    return report


def read_pak_index(data: bytes, report: PakReport) -> None:
    """Parse the index listing file paths (best effort, version dependent)."""
    if report.encrypted_index:
        report.notes.append(
            "index is AES encrypted - the file list cannot be read without the key"
        )
        return
    start, size = report.index_offset, report.index_size
    if start <= 0 or size <= 0 or start + size > len(data):
        report.notes.append("index offset/size look wrong; falling back to a string scan")
        return

    index = data[start : start + size]
    reader = Reader(index)
    try:
        mount = reader.fstring()
        report.notes.append(f"mount point: {mount}")
        count = reader.i32()
        report.notes.append(f"index declares {count} entries")

        if report.version >= 10:
            reader.u64()  # path hash seed
            has_path_hash = reader.u8()
            if has_path_hash:
                reader.raw(8 + 8 + 8 + 20)  # datetime + offset + size + hash
            has_full_dir = reader.u8()
            if has_full_dir:
                reader.raw(8 + 8 + 8 + 20)
            encoded_size = reader.i32()
            if 0 < encoded_size <= len(index):
                reader.raw(encoded_size)
            reader.i32()  # directory index offset or size
            if has_full_dir:
                files = reader.i32()
                for _ in range(min(files, 100000)):
                    report.entries.append(reader.fstring())
        else:
            # versions 8/9: a flat array of FString paths followed by entries
            for _ in range(min(count, 100000)):
                name = reader.fstring()
                # each filename is followed by an entry blob of known size
                if report.version >= 3:
                    reader.raw(8 + 8 + 8)  # offset, size, uncompressed size
                    compression = reader.u32()
                    if report.version >= 3 and compression != 0:
                        blocks = reader.i32()
                        if 0 < blocks < 100000:
                            reader.raw(blocks * (16 + 8 + 4))
                report.entries.append(name)
    except Exception as error:  # pragma: no cover - depends on real bytes
        report.notes.append(f"structural parse stopped early ({error})")


def scan_strings(data: bytes, limit: int = 4000) -> list[str]:
    """Pull asset-looking paths straight out of a container.

    Unreal stores paths as plain ASCII, so even when the index is encrypted or
    uses a layout we do not handle this recovers the interesting names.
    """
    found: list[str] = []
    seen: set[str] = set()
    needles = (b"/Game/", b"/Engine/", b"/Script/", b"SM_", b"SK_", b"MAT_", b"T_")
    for needle in needles:
        start = 0
        while len(found) < limit:
            hit = data.find(needle, start)
            if hit < 0:
                break
            start = hit + 1
            # walk backwards to the start of the printable run
            begin = hit
            while begin > 0 and 32 <= data[begin - 1] < 127:
                begin -= 1
            end = hit
            while end < len(data) and 32 <= data[end] < 127:
                end += 1
            text = data[begin:end].decode("ascii", "replace").strip()
            if 4 <= len(text) <= 240 and text not in seen:
                seen.add(text)
                found.append(text)
    return found


def read_utoc(data: bytes) -> PakReport:
    """Parse the IoStore table of contents header, then scan for asset paths."""
    report = PakReport(kind="utoc")
    if not data.startswith(UTOC_MAGIC):
        report.notes.append("missing IoStore magic")
        return report

    reader = Reader(data, len(UTOC_MAGIC))
    try:
        version = reader.u8()
        reader.raw(3)  # reserved
        report.version = version
        toc_header_size = reader.u32()
        entry_count = reader.u32()
        block_entry_count = reader.u32()
        block_entry_size = reader.u32()
        compression_name_count = reader.u32()
        compression_name_length = reader.u32()
        block_size = reader.u32()
        directory_index_size = reader.u32()
        partition_count = reader.u32()
        container_id = reader.raw(8)
        reader.raw(16)  # encryption key guid
        flags = reader.u8()
        reader.raw(3)
        perfect_hash_seeds = reader.u32()
        chunks_without_hash = reader.u32()

        report.notes.append(f"IoStore version {version}")
        report.notes.append(f"toc header size {toc_header_size}, {entry_count} chunks")
        report.notes.append(
            f"block entries {block_entry_count} x {block_entry_size} B, "
            f"block size {block_size // 1024} KiB"
        )
        report.notes.append(f"compression methods {compression_name_count}")
        report.notes.append(f"directory index {directory_index_size} B")
        report.notes.append(f"container id {container_id.hex()}")
        report.notes.append(f"flags 0x{flags:02x}")
        report.notes.append(
            f"perfect hash seeds {perfect_hash_seeds}, "
            f"chunks without hash {chunks_without_hash}"
        )
    except Exception as error:
        report.notes.append(f"header parse stopped early ({error})")

    report.entries = scan_strings(data)
    return report


def inspect(path: Path) -> PakReport:
    data = path.read_bytes()
    if data.startswith(UTOC_MAGIC):
        report = read_utoc(data)
    else:
        report = read_pak_info(data)
        if report.version:
            read_pak_index(data, report)
    if not report.entries:
        report.entries = scan_strings(data)
    return report


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 1
    for name in argv[1:]:
        path = Path(name)
        if not path.exists():
            print(f"\n== {name}: not found")
            continue
        report = inspect(path)
        print(f"\n== {path.name}  ({path.stat().st_size / 1024 / 1024:.1f} MB, {report.kind})")
        if report.version:
            label = report.version_name or "IoStore"
            print(f"   version: {report.version} ({label})")
        if report.encryption_key_guid:
            print(f"   key guid: {report.encryption_key_guid}")
        for note in report.notes:
            print(f"   - {note}")
        if report.entries:
            print(f"   {len(report.entries)} path(s) found:")
            for entry in report.entries[:80]:
                print(f"     {entry}")
            if len(report.entries) > 80:
                print(f"     ... and {len(report.entries) - 80} more")
        else:
            print("   no paths recovered")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
