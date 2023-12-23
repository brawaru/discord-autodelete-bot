type SetTransactionItem<T> =
  | { type: "add"; value: T }
  | { type: "delete"; value: T }
  | { type: "clear" };

export function createSetTransaction<T>(set: Set<T>) {
  const items: SetTransactionItem<T>[] = [];

  return {
    get dirty() {
      return items.length > 0;
    },
    add(value: T) {
      items.push({ type: "add", value });
    },
    delete(value: T) {
      items.push({ type: "delete", value });
    },
    clear() {
      items.push({ type: "clear" });
    },
    commit() {
      for (const item of items) {
        if (item.type === "add") {
          set.add(item.value);
        } else if (item.type === "delete") {
          set.delete(item.value);
        } else if (item.type === "clear") {
          set.clear();
        }
      }

      items.length = 0;
    },
  };
}
