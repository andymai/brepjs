//! Minimal ZIP reader for 3MF packages: stored and deflate entries, ZIP64 sizes.

pub struct Entry {
    pub name: String,
    method: u16,
    compressed: usize,
    uncompressed: usize,
    local_offset: usize,
}

fn u16_at(b: &[u8], o: usize) -> Option<u16> {
    Some(u16::from_le_bytes([*b.get(o)?, *b.get(o + 1)?]))
}

fn u32_at(b: &[u8], o: usize) -> Option<u32> {
    Some(u32::from_le_bytes([
        *b.get(o)?,
        *b.get(o + 1)?,
        *b.get(o + 2)?,
        *b.get(o + 3)?,
    ]))
}

fn u64_at(b: &[u8], o: usize) -> Option<u64> {
    let lo = u32_at(b, o)? as u64;
    let hi = u32_at(b, o + 4)? as u64;
    Some(lo | (hi << 32))
}

pub fn entries(b: &[u8]) -> Result<Vec<Entry>, String> {
    let eocd = (0..b.len().saturating_sub(21))
        .rev()
        .take(65_557)
        .find(|&i| u32_at(b, i) == Some(0x0605_4b50))
        .ok_or("3MF archive has no end-of-central-directory record")?;
    let mut count = u16_at(b, eocd + 10).ok_or("bad ZIP EOCD")? as usize;
    let mut cd = u32_at(b, eocd + 16).ok_or("bad ZIP EOCD")? as usize;
    if count == 0xFFFF || cd == 0xFFFF_FFFF {
        let loc = eocd.checked_sub(20).ok_or("bad ZIP64 locator")?;
        if u32_at(b, loc) != Some(0x0706_4b50) {
            return Err("bad ZIP64 locator".into());
        }
        let rec = u64_at(b, loc + 8).ok_or("bad ZIP64 locator")? as usize;
        if u32_at(b, rec) != Some(0x0606_4b50) {
            return Err("bad ZIP64 record".into());
        }
        count = u64_at(b, rec + 32).ok_or("bad ZIP64 record")? as usize;
        cd = u64_at(b, rec + 48).ok_or("bad ZIP64 record")? as usize;
    }
    // Counts come from the file: bound them by what the directory can hold
    // before trusting them with an allocation.
    const MIN_CENTRAL_RECORD: usize = 46;
    if cd > b.len() || count > (b.len() - cd) / MIN_CENTRAL_RECORD {
        return Err("corrupt ZIP central directory".into());
    }
    let mut out = Vec::with_capacity(count);
    let mut p = cd;
    for _ in 0..count {
        if u32_at(b, p) != Some(0x0201_4b50) {
            return Err("corrupt ZIP central directory".into());
        }
        let method = u16_at(b, p + 10).ok_or("corrupt ZIP")?;
        let mut compressed = u32_at(b, p + 20).ok_or("corrupt ZIP")? as usize;
        let mut uncompressed = u32_at(b, p + 24).ok_or("corrupt ZIP")? as usize;
        let name_len = u16_at(b, p + 28).ok_or("corrupt ZIP")? as usize;
        let extra_len = u16_at(b, p + 30).ok_or("corrupt ZIP")? as usize;
        let comment_len = u16_at(b, p + 32).ok_or("corrupt ZIP")? as usize;
        let mut local_offset = u32_at(b, p + 42).ok_or("corrupt ZIP")? as usize;
        let name_bytes = b.get(p + 46..p + 46 + name_len).ok_or("corrupt ZIP")?;
        let name = String::from_utf8_lossy(name_bytes).into_owned();
        let extra = b
            .get(p + 46 + name_len..p + 46 + name_len + extra_len)
            .ok_or("corrupt ZIP")?;
        let mut e = 0;
        while e + 4 <= extra.len() {
            let id = u16_at(extra, e).unwrap_or(0);
            let size = u16_at(extra, e + 2).unwrap_or(0) as usize;
            if id == 0x0001 {
                let mut q = e + 4;
                if uncompressed == 0xFFFF_FFFF {
                    uncompressed = u64_at(extra, q).ok_or("bad ZIP64 extra")? as usize;
                    q += 8;
                }
                if compressed == 0xFFFF_FFFF {
                    compressed = u64_at(extra, q).ok_or("bad ZIP64 extra")? as usize;
                    q += 8;
                }
                if local_offset == 0xFFFF_FFFF {
                    local_offset = u64_at(extra, q).ok_or("bad ZIP64 extra")? as usize;
                }
            }
            e += 4 + size;
        }
        out.push(Entry {
            name,
            method,
            compressed,
            uncompressed,
            local_offset,
        });
        p += 46 + name_len + extra_len + comment_len;
    }
    Ok(out)
}

/// Largest entry we will inflate (wasm32 tops out at 4 GB of memory).
pub const MAX_INFLATED: usize = 1 << 30;

pub fn read(b: &[u8], entry: &Entry) -> Result<Vec<u8>, String> {
    if entry.uncompressed > MAX_INFLATED {
        return Err(format!(
            "{} is too large to read ({} bytes)",
            entry.name, entry.uncompressed
        ));
    }
    let lo = entry.local_offset;
    if u32_at(b, lo) != Some(0x0403_4b50) {
        return Err(format!("corrupt ZIP local header for {}", entry.name));
    }
    let name_len = u16_at(b, lo + 26).ok_or("corrupt ZIP")? as usize;
    let extra_len = u16_at(b, lo + 28).ok_or("corrupt ZIP")? as usize;
    let start = lo + 30 + name_len + extra_len;
    let data = b
        .get(start..start.saturating_add(entry.compressed))
        .ok_or_else(|| format!("truncated ZIP entry {}", entry.name))?;
    match entry.method {
        0 if entry.compressed == entry.uncompressed => Ok(data.to_vec()),
        0 => Err(format!(
            "stored ZIP entry {} has inconsistent sizes",
            entry.name
        )),
        8 => miniz_oxide::inflate::decompress_to_vec_with_limit(data, entry.uncompressed.max(1))
            .map_err(|e| format!("cannot inflate {}: {e:?}", entry.name)),
        m => Err(format!(
            "unsupported ZIP compression method {m} for {}",
            entry.name
        )),
    }
}

#[cfg(test)]
pub(crate) fn write_stored(files: &[(&str, &[u8])]) -> Vec<u8> {
    write(files, false)
}

#[cfg(test)]
pub(crate) fn write_deflated(files: &[(&str, &[u8])]) -> Vec<u8> {
    write(files, true)
}

#[cfg(test)]
fn write(files: &[(&str, &[u8])], deflate: bool) -> Vec<u8> {
    let mut out = Vec::new();
    let mut central = Vec::new();
    for (name, data) in files {
        let payload = if deflate {
            miniz_oxide::deflate::compress_to_vec(data, 6)
        } else {
            data.to_vec()
        };
        let method: u16 = if deflate { 8 } else { 0 };
        let offset = out.len() as u32;
        out.extend_from_slice(&0x0403_4b50u32.to_le_bytes());
        out.extend_from_slice(&[20, 0, 0, 0]);
        out.extend_from_slice(&method.to_le_bytes());
        out.extend_from_slice(&[0; 8]);
        out.extend_from_slice(&(payload.len() as u32).to_le_bytes());
        out.extend_from_slice(&(data.len() as u32).to_le_bytes());
        out.extend_from_slice(&(name.len() as u16).to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(name.as_bytes());
        out.extend_from_slice(&payload);

        central.extend_from_slice(&0x0201_4b50u32.to_le_bytes());
        central.extend_from_slice(&[20, 0, 20, 0, 0, 0]);
        central.extend_from_slice(&method.to_le_bytes());
        central.extend_from_slice(&[0; 8]);
        central.extend_from_slice(&(payload.len() as u32).to_le_bytes());
        central.extend_from_slice(&(data.len() as u32).to_le_bytes());
        central.extend_from_slice(&(name.len() as u16).to_le_bytes());
        central.extend_from_slice(&[0; 12]);
        central.extend_from_slice(&offset.to_le_bytes());
        central.extend_from_slice(name.as_bytes());
    }
    let cd_offset = out.len() as u32;
    out.extend_from_slice(&central);
    out.extend_from_slice(&0x0605_4b50u32.to_le_bytes());
    out.extend_from_slice(&[0; 4]);
    out.extend_from_slice(&(files.len() as u16).to_le_bytes());
    out.extend_from_slice(&(files.len() as u16).to_le_bytes());
    out.extend_from_slice(&(central.len() as u32).to_le_bytes());
    out.extend_from_slice(&cd_offset.to_le_bytes());
    out.extend_from_slice(&[0; 2]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absurd_entry_count_is_rejected() {
        let mut zipped = write_stored(&[("a.txt", b"hello")]);
        let eocd = zipped.len() - 22;
        zipped[eocd + 10] = 0xFF;
        zipped[eocd + 11] = 0x7F;
        assert!(entries(&zipped).is_err());
    }

    #[test]
    fn stored_and_deflated_round_trip() {
        for zipped in [
            write_stored(&[("a.txt", b"hello"), ("dir/b.txt", b"world")]),
            write_deflated(&[("a.txt", b"hello hello hello"), ("dir/b.txt", b"world")]),
        ] {
            let es = entries(&zipped).unwrap();
            assert_eq!(es.len(), 2);
            assert_eq!(es[1].name, "dir/b.txt");
            assert_eq!(read(&zipped, &es[1]).unwrap(), b"world");
        }
    }
}
