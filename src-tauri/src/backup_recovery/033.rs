

fn decrypt_object_file(
    backup_path: &Path,
    object: &BackupObject,
    target: &Path,
    dek: &[u8; 32],
    backup_id: &str,
) -> Result<(), IoError> {
    let source = contained_object_path(backup_path, &object.file)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
        reject_symlink_if_present(parent)?;
    }
    if target.exists() {
        return Err(IoError::new(
            ErrorKind::AlreadyExists,
            "restore target already exists",
        ));
    }
    let mut object_key = derive_object_key(dek, backup_id, &object.name);
    let result = (|| -> Result<(), IoError> {
        let source_file = File::open(&source)?;
        let mut reader = BufReader::new(source_file);
        let target_file = OpenOptions::new().write(true).create_new(true).open(target)?;
        let mut writer = BufWriter::new(target_file);
        let mut header = [0_u8; 21];
        reader.read_exact(&mut header)?;
        if &header[..8] != OBJECT_MAGIC || header[8] != OBJECT_FORMAT_VERSION {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "encrypted backup object header is invalid",
            ));
        }
        let chunk_capacity = u32::from_le_bytes(header[9..13].try_into().unwrap()) as usize;
        let plaintext_size = u64::from_le_bytes(header[13..21].try_into().unwrap());
        if chunk_capacity != OBJECT_CHUNK_BYTES || plaintext_size != object.plaintext_bytes {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "encrypted backup object dimensions disagree with its manifest",
            ));
        }
        let mut ciphertext_hash = Sha256::new();
        ciphertext_hash.update(&header);
        let mut plaintext_hash = Sha256::new();
        let mut written = 0_u64;
        for expected_index in 0..object.chunk_count {
            let mut prefix = [0_u8; 36];
            reader.read_exact(&mut prefix)?;
            ciphertext_hash.update(&prefix);
            let index = u32::from_le_bytes(prefix[..4].try_into().unwrap());
            let length = u32::from_le_bytes(prefix[4..8].try_into().unwrap()) as usize;
            if index != expected_index || length == 0 || length > OBJECT_CHUNK_BYTES {
                return Err(IoError::new(
                    ErrorKind::InvalidData,
                    "encrypted backup object chunk sequence is invalid",
                ));
            }
            let nonce: [u8; 12] = prefix[8..20].try_into().unwrap();
            let tag: [u8; 16] = prefix[20..36].try_into().unwrap();
            let mut ciphertext = vec![0_u8; length];
            reader.read_exact(&mut ciphertext)?;
            ciphertext_hash.update(&ciphertext);
            let aad = object_chunk_aad(
                backup_id,
                &object.name,
                index,
                plaintext_size,
                length as u32,
            );
            let plaintext = open_detached(
                &object_key,
                b"backup-object-chunk-v1",
                &aad,
                &nonce,
                &ciphertext,
                &tag,
            )?;
            plaintext_hash.update(plaintext.as_slice());
            writer.write_all(plaintext.as_slice())?;
            written = written.saturating_add(length as u64);
            clear_bytes(&mut ciphertext);
        }
        let mut extra = [0_u8; 1];
        if reader.read(&mut extra)? != 0 {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "encrypted backup object has trailing bytes",
            ));
        }
        if written != plaintext_size
            || hex_encode(&plaintext_hash.finalize()) != object.plaintext_sha256
            || hex_encode(&ciphertext_hash.finalize()) != object.ciphertext_sha256
        {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "encrypted backup object failed digest verification",
            ));
        }
        writer.flush()?;
        writer.get_ref().sync_all()?;
        Ok(())
    })();
    clear_bytes(&mut object_key);
    if result.is_err() {
        let _ = fs::remove_file(target);
    }
    result
}