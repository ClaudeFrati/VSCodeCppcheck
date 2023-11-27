import * as vscode from "vscode";

export function ensureArray<T>(value: T | T[]): T[] {
    if (Array.isArray(value)) {
        return value;
    }
    return [value];
}

export function arrayIncludesUri(array: vscode.Uri[], uri: vscode.Uri): boolean {
    return array.findIndex(u => u.toString() == uri.toString()) >= 0;
}