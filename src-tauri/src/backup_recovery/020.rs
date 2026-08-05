

fn encrypt_object_file(
    source: &Path,
    target: &Path,
    dek: &[u8; 32],
    backup_id: &str,
    object_name: &str,
) -> Result<EncryptedObjectStats, IoError> {
    reject_symlink_if_present(source)?;
    let metadata = fs::metadata(source)?;
    if !metadata.is_file() {
        return Err(IoError::new(ErrorKind::InvalidData, "backup source is not a file"));
    }
    let plaintext_size = metadata.len();
    let mut object_key = derive_object_key(dek, backup_id, object_name);
    let source_file = File::open(source)?;
    let mut reader = BufReader::new(source_file);
    let target_file = OpenOptions::new().write(true).create_new(true).open(target)?;
    let mut writer = BufWriter::new(target_file);
    let mut plaintext_hash = Sha256::new();
    let mut ciphertext_hash = Sha256::new();
    let mut encrypted_bytes = 0_u64;
    let header = [
        OBJECT_MAGIC.as_slice(),
        &[OBJECT_FORMAT_VERSION],
        &(OBJECT_CHUNK_BYTES as u32).to_le_bytes(),
        &plaintext_size.to_le_bytes(),
    ]
    .concat();
    writer.write_all(&header)?;
    ciphertext_hash.update(&header);
    encrypted_bytes = encrypted_bytes.saturating_add(header.len() as u64);

    let mut buffer = vec![0_u8; OBJECT_CHUNK_BYTES];
    let mut index = 0_u32;
    let mut consumed = 0_u64;
    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        consumed = consumed.saturating_add(read as u64);
        plaintext_hash.update(&buffer[..read]);
        let aad = object_chunk_aad(
            backup_id,
            object_name,
            index,
            plaintext_size,
            read as u32,
        );
        let (nonce, ciphertext, tag) = seal_detached(
            &object_key,
            b"backup-object-chunk-v1",
            &aad,
            &buffer[..read],
        )?;
        let prefix = [
            &index.to_le_bytes()[..],
            &(read as u32).to_le_bytes()[..],
            &nonce[..],
            &tag[..],
        ]
        .concat();
        writer.write_all(&prefix)?;
        writer.write_all(&ciphertext)?;
        ciphertext_hash.update(&prefix);
        ciphertext_hash.update(&ciphertext);
        encrypted_bytes = encrypted_bytes
            .saturating_add(prefix.len() as u64)
            .saturating_add(ciphertext.len() as u64);
        index = index.checked_add(1).ok_or_else(|| {
            IoError::new(ErrorKind::InvalidData, "backup object has too many chunks")
        })?;
    }
    clear_bytes(&mut buffer);
    clear_bytes(&mut object_key);
    if consumed != plaintext_size {
        return Err(IoError::new(
            ErrorKind::UnexpectedEof,
            "backup source changed while it was encrypted",
        ));
    }
    writer.flush()?;
    writer.get_ref().sync_all()?;
    Ok(EncryptedObjectStats {
        plaintext_sha256: hex_encode(&plaintext_hash.finalize()),
        ciphertext_sha256: hex_encode(&ciphertext_hash.finalize()),
        plaintext_bytes: plaintext_size,
        encrypted_bytes,
        chunk_count: index,
    })
}