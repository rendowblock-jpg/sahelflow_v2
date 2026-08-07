

pub(crate) fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    let mut key_block = [0_u8; HMAC_BLOCK_BYTES];
    if key.len() > HMAC_BLOCK_BYTES {
        key_block[..32].copy_from_slice(&sha256(&[key]));
    } else {
        key_block[..key.len()].copy_from_slice(key);
    }
    let mut inner_pad = [0x36_u8; HMAC_BLOCK_BYTES];
    let mut outer_pad = [0x5c_u8; HMAC_BLOCK_BYTES];
    for index in 0..HMAC_BLOCK_BYTES {
        inner_pad[index] ^= key_block[index];
        outer_pad[index] ^= key_block[index];
    }
    let inner = sha256(&[&inner_pad, message]);
    let output = sha256(&[&outer_pad, &inner]);
    clear_bytes(&mut key_block);
    clear_bytes(&mut inner_pad);
    clear_bytes(&mut outer_pad);
    output
}

pub(crate) fn hkdf_sha256(ikm: &[u8], salt: &[u8], info: &[u8]) -> [u8; 32] {
    let effective_salt = if salt.is_empty() {
        [0_u8; 32].to_vec()
    } else {
        salt.to_vec()
    };
    let mut prk = hmac_sha256(&effective_salt, ikm);
    let mut input = Vec::with_capacity(info.len() + 1);
    input.extend_from_slice(info);
    input.push(1);
    let output = hmac_sha256(&prk, &input);
    clear_bytes(&mut prk);
    input.fill(0);
    output
}

pub(crate) fn constant_time_equal(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0_u8, |difference, (left, right)| difference | (left ^ right))
        == 0
}

pub(crate) fn frame(domain: &[u8], fields: &[&[u8]]) -> Vec<u8> {
    let mut output = Vec::with_capacity(
        domain.len() + fields.iter().map(|field| field.len() + 8).sum::<usize>(),
    );
    output.extend_from_slice(domain);
    for field in fields {
        output.extend_from_slice(&(field.len() as u64).to_le_bytes());
        output.extend_from_slice(field);
    }
    output
}

pub(crate) fn key_id(key: &[u8; 32]) -> String {
    hex_encode(&sha256(&[AEAD_KEY_ID_DOMAIN, key]))
}

fn derive_aead_key(root: &[u8; 32], context: &[u8]) -> [u8; 32] {
    let salt = sha256(&[AEAD_SALT_DOMAIN, context]);
    let info = frame(AEAD_INFO_DOMAIN, &[context]);
    hkdf_sha256(root, &salt, &info)
}