/** Freeze an owned JSON read model, never the authoritative Core state. */
export function freezeReadView<T>(value: T): Readonly<T> {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) freezeReadView(child);
        Object.freeze(value);
    }
    return value;
}
