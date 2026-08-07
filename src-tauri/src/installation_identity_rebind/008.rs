

fn dpapi_entropy(identity: &InstallationIdentity) -> [u8; 32] {
    let mut digest = Sha256::new();
    digest.update(ENTROPY_DOMAIN);
    update_hash_field(&mut digest, identity.workspace_id.as_bytes());
    update_hash_field(&mut digest, identity.installation_id.as_bytes());
    digest.finalize().into()
}

#[cfg(windows)]
fn platform_protect(
    plaintext: &[u8],
    identity: &InstallationIdentity,
) -> Result<Vec<u8>, InstallationRootError> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };
    let input_length = u32::try_from(plaintext.len()).map_err(|_| {
        InstallationRootError::InvalidState("installation-root payload is too large".to_owned())
    })?;
    let mut entropy = dpapi_entropy(identity);
    let input = CRYPT_INTEGER_BLOB {
        cbData: input_length,
        pbData: plaintext.as_ptr().cast_mut(),
    };
    let entropy_blob = CRYPT_INTEGER_BLOB {
        cbData: entropy.len() as u32,
        pbData: entropy.as_mut_ptr(),
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };
    let succeeded = unsafe {
        CryptProtectData(
            &input,
            null(),
            &entropy_blob,
            null_mut(),
            null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    zero_bytes(&mut entropy);
    if succeeded == 0 {
        return Err(InstallationRootError::Crypto(
            std::io::Error::last_os_error().to_string(),
        ));
    }
    if output.pbData.is_null() || output.cbData == 0 {
        if !output.pbData.is_null() {
            unsafe { LocalFree(output.pbData.cast()) };
        }
        return Err(InstallationRootError::Crypto(
            "DPAPI returned an empty protected payload".to_owned(),
        ));
    }
    let result =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
    unsafe {
        zero_bytes(std::slice::from_raw_parts_mut(
            output.pbData,
            output.cbData as usize,
        ));
        LocalFree(output.pbData.cast());
    }
    Ok(result)
}