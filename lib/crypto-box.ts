// AES-256-GCM sealing for the iOS app's on-device copy of student data. The 32-byte key lives in the
// iOS Keychain (this-device-only); only ciphertext is written to the app's files.

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0));

export function newBoxKey(): string {
    return b64(crypto.getRandomValues(new Uint8Array(32)));
}

async function importKey(key: string) {
    const raw = unb64(key);
    if (raw.length !== 32) throw Error('Invalid local data key');
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Encrypts text; `context` (the user ID) is bound as additional data so one user's file can't be read as another's. */
export async function sealText(text: string, key: string, context: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) }, await importKey(key), new TextEncoder().encode(text)));
    // Chunked base64 avoids call-stack limits for multi-megabyte payloads.
    let out = '';
    for (let i = 0; i < data.length; i += 0x8000) out += String.fromCharCode(...data.subarray(i, i + 0x8000));
    return `v1.${b64(iv)}.${btoa(out)}`;
}

export async function openText(sealed: string, key: string, context: string): Promise<string> {
    const [version, iv, data] = sealed.split('.');
    if (version !== 'v1' || !iv || !data) throw Error('Unrecognized local data format');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: new TextEncoder().encode(context) }, await importKey(key), unb64(data));
    return new TextDecoder().decode(plain);
}
