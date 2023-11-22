export function ensure_array<T>(value: T | T[]): T[] {
    if (Array.isArray(value)) {
        return value;
    }
    return [value];
}
