

#[cfg(windows)]
fn bcrypt_aes_gcm(
    key: &[u8; 32],
    nonce: &[u8; 12],
    aad: &[u8],
    input: &[u8],
    decrypt_tag: Option<&[u8; 16]>,
) -> Result<(Vec<u8>, [u8; 16]), IoError> {
    use std::ffi::c_void;
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Security::Cryptography::{
        BCryptCloseAlgorithmProvider, BCryptDecrypt, BCryptDestroyKey, BCryptEncrypt,
        BCryptGenerateSymmetricKey, BCryptGetProperty, BCryptOpenAlgorithmProvider,
        BCryptSetProperty, BCRYPT_AES_ALGORITHM, BCRYPT_ALG_HANDLE,
        BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO, BCRYPT_CHAINING_MODE, BCRYPT_CHAIN_MODE_GCM,
        BCRYPT_KEY_HANDLE, BCRYPT_OBJECT_LENGTH,
    };

    unsafe fn wide_bytes(value: *const u16) -> u32 {
        let mut length = 0_usize;
        while unsafe { *value.add(length) } != 0 {
            length += 1;
        }
        ((length + 1) * 2) as u32
    }

    fn status(result: i32, operation: &str) -> Result<(), IoError> {
        if result < 0 {
            Err(IoError::other(format!(
                "Windows AES-GCM {operation} failed with NTSTATUS 0x{:08x}",
                result as u32
            )))
        } else {
            Ok(())
        }
    }

    let mut algorithm: BCRYPT_ALG_HANDLE = null_mut();
    status(
        unsafe { BCryptOpenAlgorithmProvider(&mut algorithm, BCRYPT_AES_ALGORITHM, null(), 0) },
        "provider open",
    )?;
    let outcome = (|| -> Result<(Vec<u8>, [u8; 16]), IoError> {
        status(
            unsafe {
                BCryptSetProperty(
                    algorithm,
                    BCRYPT_CHAINING_MODE,
                    BCRYPT_CHAIN_MODE_GCM as *mut u8,
                    wide_bytes(BCRYPT_CHAIN_MODE_GCM),
                    0,
                )
            },
            "GCM mode selection",
        )?;
        let mut object_length = 0_u32;
        let mut property_length = 0_u32;
        status(
            unsafe {
                BCryptGetProperty(
                    algorithm,
                    BCRYPT_OBJECT_LENGTH,
                    &mut object_length as *mut u32 as *mut u8,
                    std::mem::size_of::<u32>() as u32,
                    &mut property_length,
                    0,
                )
            },
            "key object size query",
        )?;
        if property_length != std::mem::size_of::<u32>() as u32 || object_length == 0 {
            return Err(IoError::other("Windows AES-GCM key object size is invalid"));
        }
        let mut key_object = vec![0_u8; object_length as usize];
        let mut key_handle: BCRYPT_KEY_HANDLE = null_mut();
        if let Err(error) = status(
            unsafe {
                BCryptGenerateSymmetricKey(
                    algorithm,
                    &mut key_handle,
                    key_object.as_mut_ptr(),
                    object_length,
                    key.as_ptr() as *mut u8,
                    key.len() as u32,
                    0,
                )
            },
            "key generation",
        ) {
            clear_bytes(&mut key_object);
            return Err(error);
        }
        let result = (|| -> Result<(Vec<u8>, [u8; 16]), IoError> {
            let mut nonce = *nonce;
            let mut auth_data = aad.to_vec();
            let mut tag = decrypt_tag.copied().unwrap_or([0_u8; 16]);
            let mut info = BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO {
                cbSize: std::mem::size_of::<BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO>() as u32,
                dwInfoVersion: 1,
                pbNonce: nonce.as_mut_ptr(),
                cbNonce: nonce.len() as u32,
                pbAuthData: auth_data.as_mut_ptr(),
                cbAuthData: auth_data.len() as u32,
                pbTag: tag.as_mut_ptr(),
                cbTag: tag.len() as u32,
                pbMacContext: null_mut(),
                cbMacContext: 0,
                cbAAD: 0,
                cbData: 0,
                dwFlags: 0,
            };
            let mut output = vec![0_u8; input.len()];
            let mut written = 0_u32;
            let result = if decrypt_tag.is_some() {
                unsafe {
                    BCryptDecrypt(
                        key_handle,
                        input.as_ptr() as *mut u8,
                        input.len() as u32,
                        &mut info as *mut _ as *mut c_void,
                        null_mut(),
                        0,
                        output.as_mut_ptr(),
                        output.len() as u32,
                        &mut written,
                        0,
                    )
                }
            } else {
                unsafe {
                    BCryptEncrypt(
                        key_handle,
                        input.as_ptr() as *mut u8,
                        input.len() as u32,
                        &mut info as *mut _ as *mut c_void,
                        null_mut(),
                        0,
                        output.as_mut_ptr(),
                        output.len() as u32,
                        &mut written,
                        0,
                    )
                }
            };
            if let Err(error) = status(
                result,
                if decrypt_tag.is_some() { "decryption" } else { "encryption" },
            ) {
                clear_bytes(&mut output);
                clear_bytes(&mut tag);
                return Err(error);
            }
            output.truncate(written as usize);
            Ok((output, tag))
        })();
        unsafe { BCryptDestroyKey(key_handle) };
        clear_bytes(&mut key_object);
        result
    })();
    unsafe { BCryptCloseAlgorithmProvider(algorithm, 0) };
    outcome
}