export function getOrCreate<K, V>(
  map: Map<K, V>,
  key: K,
  createFunc: (key: K) => V
) {
  if (map.has(key)) return map.get(key)!;
  const v = createFunc(key);
  map.set(key, v);
  return v;
}
