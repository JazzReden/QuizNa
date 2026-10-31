import { LocalPassword } from './local-password';

describe('Local password hashing',()=>{
  it('salts identical passwords differently and validates the actual password',async()=>{
    const password='Local testing password 🔐';
    const first=await LocalPassword.hash(password);
    const second=await LocalPassword.hash(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await LocalPassword.verify(password,first)).toBe(true);
    expect(await LocalPassword.verify('wrong password',first)).toBe(false);
  });
  it('rejects missing or malformed hashes without accepting the supplied password',async()=>{
    expect(await LocalPassword.verify('anything','')).toBe(false);
    expect(await LocalPassword.verify('anything','scrypt$1$8$1$bad$bad')).toBe(false);
  });
});
