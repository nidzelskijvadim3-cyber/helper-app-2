// Акаунти: у кожного свої локальні дані й свій розділ на сервері. Ідентифікатор виводиться з імені та пароля.
const LIST = 'helper-accounts', ACT = 'helper-acc';
export const listAccounts = () => { try { return JSON.parse(localStorage.getItem(LIST) || '[]'); } catch (e) { return []; } };
export const getActiveId = () => { try { return localStorage.getItem(ACT) || ''; } catch (e) { return ''; } };
export const setActiveId = id => { try { if (id) localStorage.setItem(ACT, id); else localStorage.removeItem(ACT); } catch (e) {} };
export const activeAccount = () => listAccounts().find(a => a.id === getActiveId()) || null;
// Ключ сховища для активного акаунта. Локальний профіль (без акаунта) зберігає старі ключі без змін.
export const nsKey = (base, id) => { const a = id === undefined ? getActiveId() : id; return a ? base + ':' + a.slice(0, 16) : base; };
export function addAccount(name, id) {
  const l = listAccounts().filter(a => a.id !== id); l.push({ id, name: String(name).trim() });
  try { localStorage.setItem(LIST, JSON.stringify(l)); } catch (e) {}
}
export function removeAccount(id) { try { localStorage.setItem(LIST, JSON.stringify(listAccounts().filter(a => a.id !== id))); } catch (e) {} if (getActiveId() === id) setActiveId(''); }
export function validateCredentials(name, pass) {
  if (!String(name || '').trim()) return 'name';
  if (String(pass || '').length < 6) return 'pass';
  return '';
}
// Той самий ім'я + пароль завжди дають той самий ідентифікатор (на будь-якому пристрої).
export async function deriveAccountId(name, pass) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(String(pass)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode('helper-acc-v1:' + String(name).trim().toLowerCase()), iterations: 120000, hash: 'SHA-256' }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
