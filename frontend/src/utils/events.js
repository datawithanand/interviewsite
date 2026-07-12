// Minimal pub/sub so unrelated parts of the tree (e.g. Sidebar's node list)
// can react to mutations made elsewhere (e.g. QuestionsView deleting a
// question) without prop-drilling a refresh callback through the whole app.
const listeners = new Map();

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event)?.delete(handler);
}

export function emit(event, payload) {
  listeners.get(event)?.forEach((handler) => handler(payload));
}
