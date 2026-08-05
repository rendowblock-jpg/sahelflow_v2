

fn validate_optional_rescue_authority(
    rescue: &Path,
    file: &Option<String>,
    digest: &Option<String>,
    expected: &str,
) -> Result<(), IoError> {
    match (file, digest) {
        (Some(file), Some(digest)) if file == expected => {
            if sha256_file(&rescue.join(file))? != *digest {
                return Err(IoError::new(
                    ErrorKind::InvalidData,
                    "identity rescue authority digest does not match",
                ));
            }
            Ok(())
        }
        (None, None) => Ok(()),
        _ => Err(IoError::new(
            ErrorKind::InvalidData,
            "identity rescue authority metadata is invalid",
        )),
    }
}

fn restore_optional_rescue_authority(
    app_data_dir: &Path,
    rescue: &Path,
    file: &Option<String>,
    digest: &Option<String>,
    expected: &str,
) -> Result<(), IoError> {
    let target = system_dir(app_data_dir).join(expected);
    match (file, digest) {
        (Some(file), Some(digest)) => {
            replace_from_verified_source(&rescue.join(file), &target, digest)
        }
        (None, None) => remove_file_if_present(&target),
        _ => unreachable!("validated identity rescue metadata"),
    }
}