export const CONVERSATION_NOTES_KEY = 'prepvault-conversation-notes';
export const MAX_CONVERSATION_NOTES = 100;
const MAX_IMAGE_LENGTH = 3 * 1024 * 1024;
const MAX_NOTES_LENGTH = 8 * 1024 * 1024;
const STRING_LIMITS = { id: 200, from: 256, text: 10000, ts: 100, createdAt: 100, senderName: 200 };
const error = () => new Error('Saved conversation notes could not be read. Keep this browser data and recover the notes before replacing the plan.');

export function conversationLegacyKey(userId = null) {
  if (userId !== null && (typeof userId !== 'string' || !userId || userId.length > 256 || [...userId].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))) throw error();
  return `prepvault-chat-${userId || 'guest'}`;
}

export function validateConversationNotes(value) {
  if (!Array.isArray(value) || value.length > MAX_CONVERSATION_NOTES) throw error();
  const ids = new Set();
  const notes = value.map(note => {
    if (!note || typeof note !== 'object' || Array.isArray(note) || typeof note.id !== 'string' || !note.id.trim() || ids.has(note.id) || typeof note.text !== 'string') throw error();
    const clean = {};
    for (const [key, limit] of Object.entries(STRING_LIMITS)) {
      if (note[key] !== undefined) {
        if (typeof note[key] !== 'string' || note[key].length > limit) throw error();
        clean[key] = note[key];
      }
    }
    if (note.image !== undefined) {
      if (typeof note.image !== 'string' || note.image.length > MAX_IMAGE_LENGTH) throw error();
      const match = /^data:image\/(?:png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(note.image);
      if (!match || match[1].length % 4 !== 0) throw error();
      clean.image = note.image;
    }
    if (!clean.text.trim() && !clean.image) throw error();
    ids.add(clean.id);
    return clean;
  });
  if (JSON.stringify(notes).length > MAX_NOTES_LENGTH) throw error();
  return notes;
}

export function normalizeConversationNotesSetting(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_NOTES_LENGTH) throw error();
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw error(); }
  return JSON.stringify(validateConversationNotes(parsed));
}

export function readConversationNotes(storage, userId = null) {
  const current = storage.getItem(CONVERSATION_NOTES_KEY);
  // An explicit empty workspace value is authoritative after restore/reset.
  // Never enumerate legacy keys or fall back to another account's history.
  const raw = current === null ? storage.getItem(conversationLegacyKey(userId)) : current;
  if (raw === null) return [];
  return JSON.parse(normalizeConversationNotesSetting(raw));
}

export function captureConversationNotes(storage, userId = null) {
  return JSON.stringify(readConversationNotes(storage, userId));
}
