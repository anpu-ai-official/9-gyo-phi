use oxideav_aac::encoder::{EncoderConfig, StreamEncoder, FRAME_LEN};
use oxideav_core::WriteSeek;
use oxideav_core::{CodecId, CodecParameters, Packet, SampleFormat, StreamInfo, TimeBase};
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

const SAMPLE_RATE: u32 = 24_000;
const CHANNELS: u8 = 1;
const BITRATE: u32 = 64_000;

fn adts_payload(frame: Vec<u8>) -> Result<Vec<u8>, String> {
    if frame.len() < 7 || frame[0] != 0xff || frame[1] & 0xf0 != 0xf0 {
        return Err("The AAC encoder returned an invalid frame.".to_string());
    }
    let header_len = if frame[1] & 1 == 1 { 7 } else { 9 };
    if frame.len() <= header_len {
        return Err("The AAC encoder returned an empty frame.".to_string());
    }
    Ok(frame[header_len..].to_vec())
}

fn pcm_bytes_to_samples(bytes: &[u8]) -> Vec<i16> {
    let (samples, remainder) = bytes.as_chunks::<2>();
    debug_assert!(remainder.is_empty());
    samples
        .iter()
        .map(|sample| i16::from_le_bytes([sample[0], sample[1]]))
        .collect()
}

pub fn encode_m4b(raw_path: &Path, output_path: &Path) -> Result<u64, String> {
    let data_size = std::fs::metadata(raw_path)
        .map_err(|_| "The audiobook recording is missing.".to_string())?
        .len();
    if data_size == 0 {
        return Err("The audiobook contains no audio.".to_string());
    }
    if data_size % 2 != 0 {
        return Err("The audiobook PCM stream is incomplete.".to_string());
    }

    let mut parameters = CodecParameters::audio(CodecId::new("aac"));
    parameters.channels = Some(CHANNELS.into());
    parameters.sample_rate = Some(SAMPLE_RATE);
    parameters.sample_format = Some(SampleFormat::S16);
    parameters.bit_rate = Some(BITRATE.into());
    parameters.extradata = oxideav_aac::asc_writer::aac_lc_asc(SAMPLE_RATE, CHANNELS);
    let time_base = TimeBase::new(1, SAMPLE_RATE.into());
    let stream = StreamInfo {
        index: 0,
        time_base,
        duration: Some((data_size / 2) as i64),
        start_time: Some(0),
        params: parameters,
    };

    let output = File::create(output_path)
        .map_err(|_| "The audiobook output could not be created.".to_string())?;
    let writer: Box<dyn WriteSeek> = Box::new(output);
    let mut muxer = oxideav_mp4::muxer::open(writer, std::slice::from_ref(&stream))
        .map_err(|error| format!("The M4B container could not start: {error}"))?;
    muxer
        .write_header()
        .map_err(|error| format!("The M4B header could not be written: {error}"))?;

    let mut encoder = StreamEncoder::new(EncoderConfig {
        sample_rate: SAMPLE_RATE,
        channels: CHANNELS,
        bitrate: BITRATE,
    })
    .map_err(|error| format!("The AAC encoder could not start: {error}"))?;
    let mut input = BufReader::new(
        File::open(raw_path)
            .map_err(|_| "The audiobook recording could not be opened.".to_string())?,
    );
    let mut bytes = vec![0_u8; FRAME_LEN * CHANNELS as usize * 2];
    let mut pts = 0_i64;

    loop {
        let mut filled = 0;
        while filled < bytes.len() {
            let count = input
                .read(&mut bytes[filled..])
                .map_err(|_| "The audiobook recording could not be read.".to_string())?;
            if count == 0 {
                break;
            }
            filled += count;
        }
        if filled == 0 {
            break;
        }
        let samples = pcm_bytes_to_samples(&bytes[..filled]);
        let encoded = encoder
            .encode_frame(&samples)
            .map_err(|error| format!("AAC encoding failed: {error}"))?;
        let mut packet = Packet::new(0, time_base, adts_payload(encoded)?);
        packet.pts = Some(pts);
        packet.duration = Some(FRAME_LEN as i64);
        packet.flags.keyframe = true;
        muxer
            .write_packet(&packet)
            .map_err(|error| format!("The M4B audio could not be written: {error}"))?;
        pts += FRAME_LEN as i64;
        if filled < bytes.len() {
            break;
        }
    }

    let mut packet = Packet::new(
        0,
        time_base,
        adts_payload(
            encoder
                .finish()
                .map_err(|error| format!("AAC finalization failed: {error}"))?,
        )?,
    );
    packet.pts = Some(pts);
    packet.duration = Some(FRAME_LEN as i64);
    packet.flags.keyframe = true;
    muxer
        .write_packet(&packet)
        .map_err(|error| format!("The final M4B audio could not be written: {error}"))?;
    muxer
        .write_trailer()
        .map_err(|error| format!("The M4B container could not be finalized: {error}"))?;
    Ok(data_size)
}

#[cfg(test)]
mod tests {
    use super::*;
    use oxideav_core::{NullCodecResolver, ReadSeek};

    #[test]
    fn writes_seekable_aac_m4b_without_external_tools() {
        let unique = std::process::id();
        let raw = std::env::temp_dir().join(format!("9-gyo-phi-{unique}.pcm"));
        let m4b = std::env::temp_dir().join(format!("9-gyo-phi-{unique}.m4b"));
        let samples: Vec<i16> = (0..SAMPLE_RATE)
            .map(|index| {
                let phase = index as f32 * 440.0 * std::f32::consts::TAU / SAMPLE_RATE as f32;
                (phase.sin() * 8_000.0) as i16
            })
            .collect();
        let bytes: Vec<u8> = samples
            .iter()
            .flat_map(|sample| sample.to_le_bytes())
            .collect();
        std::fs::write(&raw, bytes).unwrap();

        assert_eq!(encode_m4b(&raw, &m4b).unwrap(), (SAMPLE_RATE * 2) as u64);
        let reader: Box<dyn ReadSeek> = Box::new(File::open(&m4b).unwrap());
        let mut demuxer = oxideav_mp4::demux::open(reader, &NullCodecResolver).unwrap();
        assert_eq!(demuxer.streams().len(), 1);
        assert_eq!(demuxer.streams()[0].params.codec_id, CodecId::new("aac"));
        assert_eq!(demuxer.streams()[0].params.sample_rate, Some(SAMPLE_RATE));
        assert_eq!(demuxer.streams()[0].params.channels, Some(CHANNELS.into()));
        let first = demuxer.next_packet().unwrap();
        assert!(!first.data.is_empty());
        assert!(std::fs::metadata(&m4b).unwrap().len() > 1_000);

        #[cfg(target_os = "macos")]
        {
            let inspection = std::process::Command::new("/usr/bin/afinfo")
                .arg(&m4b)
                .output()
                .unwrap();
            assert!(
                inspection.status.success(),
                "macOS could not decode the generated M4B: {}",
                String::from_utf8_lossy(&inspection.stderr)
            );
            let details = String::from_utf8_lossy(&inspection.stdout).to_lowercase();
            assert!(details.contains("aac"), "unexpected M4B details: {details}");
            assert!(
                details.contains("24000"),
                "unexpected M4B sample rate: {details}"
            );
        }

        let _ = std::fs::remove_file(raw);
        let _ = std::fs::remove_file(m4b);
    }
}
