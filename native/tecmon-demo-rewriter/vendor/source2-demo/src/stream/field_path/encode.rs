//! TecMon: encoder for field-path lists (counterpart to `FieldOp::execute`).
//!
//! Uses only two general operations so every path list can be expressed:
//! `PushNAndNonTopological` when the path gets longer or stays equal and
//! `PopNAndNonTopographical` when it gets shorter.

use crate::entity::field::FieldPath;
use crate::stream::field_path::{FieldOp, FieldPathCodec};
use crate::writer::{BitsWriter, BitstreamWriter};
use std::io;

fn delta(from: u16, to: u16) -> i32 {
    to.wrapping_sub(from) as i16 as i32
}

pub(crate) fn write_field_paths(
    codec: &FieldPathCodec,
    writer: &mut BitstreamWriter<'_>,
    paths: &[FieldPath],
) -> io::Result<()> {
    let mut current = FieldPath::default();
    for next in paths {
        if next.last >= current.last {
            codec.write_op(writer, FieldOp::PushNAndNonTopological)?;
            for i in 0..=current.last {
                let d = delta(current.path[i], next.path[i]);
                writer.write_bit(d != 0)?;
                if d != 0 {
                    writer.write_var_i32(d - 1)?;
                }
            }
            writer.write_ubit_var((next.last - current.last) as u32)?;
            for i in current.last + 1..=next.last {
                writer.write_ubit_var_fp(next.path[i] as i32)?;
            }
        } else {
            codec.write_op(writer, FieldOp::PopNAndNonTopographical)?;
            writer.write_ubit_var_fp((current.last - next.last) as i32)?;
            for i in 0..=next.last {
                let d = delta(current.path[i], next.path[i]);
                writer.write_bit(d != 0)?;
                if d != 0 {
                    writer.write_var_i32(d)?;
                }
            }
        }
        current = *next;
    }
    codec.write_op(writer, FieldOp::FieldPathEncodeFinish)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::reader::SliceReader;

    fn fp(parts: &[u16]) -> FieldPath {
        let mut p = FieldPath::default();
        p.path[0] = parts[0];
        for v in &parts[1..] {
            p.push(*v);
        }
        p
    }

    #[test]
    fn paths_round_trip() {
        let paths = vec![
            fp(&[0]),
            fp(&[1]),
            fp(&[3, 0]),
            fp(&[3, 2, 7]),
            fp(&[3, 4]),
            fp(&[9]),
            fp(&[9, 0, 0, 1]),
            fp(&[40]),
            fp(&[300, 1000]),
            fp(&[301]),
        ];
        let codec = FieldPathCodec::default();
        let mut buf = Vec::new();
        {
            let mut writer = BitstreamWriter::new(&mut buf);
            write_field_paths(&codec, &mut writer, &paths).unwrap();
            writer.write_bits(32, 0xDEAD_BEEF).unwrap();
            writer.flush().unwrap();
        }
        let mut reader = SliceReader::new(&buf);
        let mut current = FieldPath::default();
        let mut decoded = Vec::new();
        loop {
            let op = codec.read_op(&mut reader);
            if op == FieldOp::FieldPathEncodeFinish {
                break;
            }
            op.execute(&mut reader, &mut current);
            decoded.push(current);
        }
        let parts = |list: &[FieldPath]| list.iter().map(|p| p.path[..=p.last].to_vec()).collect::<Vec<_>>();
        assert_eq!(parts(&decoded), parts(&paths));
        assert_eq!(crate::reader::BitsReader::read_bits(&mut reader, 32), 0xDEAD_BEEF);
    }
}
