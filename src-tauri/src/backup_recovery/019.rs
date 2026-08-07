

fn verify_staged_backup_objects(
    staging: &Path,
    manifest: &BackupManifest,
    dek: &[u8; 32],
) -> Result<(), IoError> {
    let verification = staging.join(".verification");
    if verification.exists() {
        fs::remove_dir_all(&verification)?;
    }
    fs::create_dir(&verification)?;
    let result = (|| -> Result<(), IoError> {
        for (index, object) in manifest.objects.iter().enumerate() {
            let target = verification.join(format!("object-{index:03}.verified"));
            decrypt_object_file(
                staging,
                object,
                &target,
                dek,
                &manifest.backup_id,
            )?;
            match object.kind.as_str() {
                "shop-registry" => {
                    let observed: ShopRegistry = read_json_limited(&target, MAX_JSON_BYTES)?;
                    if observed != manifest.registry {
                        return Err(IoError::new(
                            ErrorKind::InvalidData,
                            "verified registry object disagrees with the manifest",
                        ));
                    }
                }
                "shop-database" => preflight_database(&target)?,
                _ => {
                    return Err(IoError::new(
                        ErrorKind::InvalidData,
                        "backup contains an unsupported verification object",
                    ))
                }
            }
            fs::remove_file(&target)?;
        }
        Ok(())
    })();
    let cleanup = fs::remove_dir_all(&verification);
    match (result, cleanup) {
        (Err(error), _) => Err(error),
        (Ok(()), Err(error)) => Err(error),
        (Ok(()), Ok(())) => Ok(()),
    }
}

struct EncryptedObjectStats {
    plaintext_sha256: String,
    ciphertext_sha256: String,
    plaintext_bytes: u64,
    encrypted_bytes: u64,
    chunk_count: u32,
}