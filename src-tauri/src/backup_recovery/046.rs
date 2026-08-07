

fn copy_file_verified(source: &Path, target: &Path) -> Result<(), IoError> {
    reject_symlink_if_present(source)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    let expected_size = fs::metadata(source)?.len();
    let expected_digest = sha256_file(source)?;
    let mut input = File::open(source)?;
    let mut output = OpenOptions::new().write(true).create_new(true).open(target)?;
    let copied = copy_io(&mut input, &mut output)?;
    output.sync_all()?;
    if copied != expected_size || sha256_file(target)? != expected_digest {
        let _ = fs::remove_file(target);
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "verified file copy changed its source",
        ));
    }
    Ok(())
}

fn replace_from_verified_source(
    source: &Path,
    target: &Path,
    expected_digest: &str,
) -> Result<(), IoError> {
    if sha256_file(source)? != expected_digest {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "replacement source digest does not match",
        ));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    let staging = target.with_extension(format!("restore-{}.tmp", random_hex(8)?));
    if staging.exists() {
        fs::remove_file(&staging)?;
    }
    copy_file_verified(source, &staging)?;
    replace_file_durable(&staging, target)?;
    if sha256_file(target)? != expected_digest {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "durable replacement failed digest verification",
        ));
    }
    Ok(())
}