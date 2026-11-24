// Реєстр клавіатурних скорочень (ipad-interactions 5). Одне джерело для обробників (page.js — загальні й План,
// docs.js — редактор і ласо), шпаргалки ⌘/, розділу «Клавіатурні скорочення» в Налаштуваннях і title кнопок.
// Клавіші — за e.code (фізична клавіша), а не e.key: на українській розкладці e.key для P — «з», для Z — «я».
// Mod = ⌘ на Apple або Ctrl на інших клавіатурах.
// one: true — однолітерне скорочення без модифікатора (WCAG 2.1.4): працює, лише якщо ввімкнено в Налаштуваннях.
// field: true — працює й тоді, коли фокус у полі введення. rep: true — працює при утриманні клавіші (автоповтор).
export const SC = [
  // Загальні
  { id: 'tab1', g: 'gen', k: ['Mod+Digit1'], n: 'План' },
  { id: 'tab2', g: 'gen', k: ['Mod+Digit2'], n: 'Матеріали' },
  { id: 'tab3', g: 'gen', k: ['Mod+Digit3'], n: 'Навчання' },
  { id: 'tab4', g: 'gen', k: ['Mod+Digit4'], n: 'Помічник' },
  { id: 'settings', g: 'gen', k: ['Mod+Comma'], n: 'Налаштування' },
  { id: 'new', g: 'gen', k: ['Mod+KeyN', 'Alt+KeyN'], n: 'Створити в поточному розділі' },
  { id: 'search', g: 'gen', k: ['Mod+KeyK'], n: 'Пошук у матеріалах' },
  { id: 'ai', g: 'gen', k: ['Mod+KeyJ'], n: 'Відкрити або закрити Помічника', field: true },
  { id: 'keys', g: 'gen', k: ['Mod+Slash'], n: 'Клавіатурні скорочення' },
  { id: 'esc', g: 'gen', k: ['Escape'], n: 'Закрити вікно або панель', field: true, info: true },
  // План
  { id: 'prev', g: 'plan', k: ['ArrowLeft'], n: 'Попередній день або місяць', rep: true },
  { id: 'next', g: 'plan', k: ['ArrowRight'], n: 'Наступний день або місяць', rep: true },
  { id: 'today', g: 'plan', k: ['KeyT'], n: 'Сьогодні', one: true },
  { id: 'newev', g: 'plan', k: ['Mod+KeyN', 'Alt+KeyN'], n: 'Нова подія', info: true },
  // Редактор
  { id: 'pen', g: 'ed', k: ['KeyP'], n: 'Ручка', one: true, tool: 'pen' },
  { id: 'pencil', g: 'ed', k: ['KeyI'], n: 'Олівець', one: true, tool: 'pencil' },
  { id: 'hl', g: 'ed', k: ['KeyH'], n: 'Виділювач', one: true, tool: 'hl' },
  { id: 'eraser', g: 'ed', k: ['KeyE'], n: 'Гумка', one: true, tool: 'eraser' },
  { id: 'swapPE', g: 'ed', k: ['KeyX'], n: 'Ручка ↔ Гумка', one: true },
  { id: 'lasso', g: 'ed', k: ['KeyL'], n: 'Ласо', one: true, tool: 'lasso' },
  { id: 'shape', g: 'ed', k: ['KeyS'], n: 'Фігури', one: true, tool: 'shape' },
  { id: 'text', g: 'ed', k: ['KeyT'], n: 'Текст', one: true, tool: 'text' },
  { id: 'ruler', g: 'ed', k: ['KeyR'], n: 'Лінійка', one: true },
  { id: 'hand', g: 'ed', k: ['Space'], n: 'Рука, поки утримуєте', one: true },
  { id: 'thinner', g: 'ed', k: ['BracketLeft'], n: 'Тонше', one: true, rep: true },
  { id: 'thicker', g: 'ed', k: ['BracketRight'], n: 'Товще', one: true, rep: true },
  { id: 'zin', g: 'ed', k: ['Equal'], n: 'Збільшити', one: true, rep: true },
  { id: 'zout', g: 'ed', k: ['Minus'], n: 'Зменшити', one: true, rep: true },
  { id: 'zfit', g: 'ed', k: ['Digit0'], n: 'По ширині', one: true },
  { id: 'undo', g: 'ed', k: ['Mod+KeyZ'], n: '@undo:Скасувати', rep: true },
  { id: 'redo', g: 'ed', k: ['Mod+Shift+KeyZ'], n: 'Повторити', rep: true },
  { id: 'pgprev', g: 'ed', k: ['PageUp', 'Alt+ArrowUp'], n: 'Попередня сторінка' },
  { id: 'pgnext', g: 'ed', k: ['PageDown', 'Alt+ArrowDown'], n: 'Наступна сторінка' },
  { id: 'txtdone', g: 'ed', k: ['Mod+Enter', 'Escape'], n: 'Зафіксувати текст на сторінці', field: true, info: true },
  // Ласо
  { id: 'copy', g: 'lasso', k: ['Mod+KeyC'], n: 'Копіювати' },
  { id: 'cut', g: 'lasso', k: ['Mod+KeyX'], n: 'Вирізати' },
  { id: 'paste', g: 'lasso', k: ['Mod+KeyV'], n: 'Вставити' },
  { id: 'dup', g: 'lasso', k: ['Mod+KeyD'], n: 'Дублювати' },
  { id: 'selall', g: 'lasso', k: ['Mod+KeyA'], n: 'Виділити все' },
  { id: 'del', g: 'lasso', k: ['Delete', 'Backspace'], n: 'Видалити виділене' },
  { id: 'unsel', g: 'lasso', k: ['Escape'], n: 'Зняти виділення' },
];
export const SC_GROUPS = [['gen', 'Загальні'], ['plan', 'План'], ['ed', 'Редактор'], ['lasso', 'Ласо']];

// Комбінація події у форматі реєстру: «Alt+Mod+Shift+KeyP» (порядок модифікаторів — як у k)
export function comboOf(e) {
  const mod = e.metaKey || e.ctrlKey;
  return (e.altKey ? 'Alt+' : '') + (mod ? 'Mod+' : '') + (e.shiftKey ? 'Shift+' : '') + e.code;
}
// Пошук скорочення групи g для події; null, якщо такого немає
export function scFind(e, groups) {
  const c = comboOf(e);
  // модифікатори в k записані в порядку Alt, Mod, Shift — так само, як у comboOf
  return SC.find(s => !s.info && groups.includes(s.g) && s.k.includes(c)) || null;
}
export const scById = id => SC.find(s => s.id === id);
// Поле введення: скорочення без field у ньому не працюють
export const inField = t => !!(t && t.matches && t.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
// IME / диктовка: клавіші належать системі введення
export const composing = e => e.isComposing || e.keyCode === 229;

// Однолітерні скорочення (WCAG 2.1.4): за замовчуванням увімкнено, вимикач — у Налаштуваннях (зберігається на пристрої)
export const ONE_KEY = 'helper-keys1';
export function oneKeysOn() { try { return localStorage.getItem(ONE_KEY) !== '0'; } catch (e) { return true; } }
export function setOneKeys(v) { try { localStorage.setItem(ONE_KEY, v ? '1' : '0'); } catch (e) {} }
// Дотик двома пальцями — скасувати, трьома — повторити (вимикач у «Ще» редактора)
export const TAP_KEY = 'helper-tapundo';
export function tapUndoOn() { try { return localStorage.getItem(TAP_KEY) !== '0'; } catch (e) { return true; } }

// Підпис клавіш символами Apple: Mod+Shift+KeyZ → «⇧⌘Z»
const CODE = { Comma: ',', Slash: '/', BracketLeft: '[', BracketRight: ']', Equal: '=', Minus: '−', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Enter: '↩', Delete: '⌦', Backspace: '⌫', PageUp: 'Page Up', PageDown: 'Page Down' };
export function keyLabel(combo, space = 'Пробіл') {
  const parts = combo.split('+'), code = parts.pop();
  let s = '';
  if (parts.includes('Alt')) s += '⌥';
  if (parts.includes('Shift')) s += '⇧';
  if (parts.includes('Mod')) s += '⌘';
  const k = code === 'Space' ? space : CODE[code] || code.replace(/^Key/, '').replace(/^Digit/, '');
  return s + k;
}
// title кнопки: «Ручка · P» (лише якщо однолітерні скорочення ввімкнено)
export function withKey(label, id, one) {
  const s = scById(id); if (!s || (s.one && !one)) return label;
  return label + ' · ' + keyLabel(s.k[0]);
}
