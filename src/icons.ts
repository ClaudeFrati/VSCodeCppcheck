import * as path from "node:path";
import * as vscode from "vscode";


export type IconDef = { "dark": string | vscode.Uri; "light": string | vscode.Uri; };

export function getIcon(name: string, style?: "light" | "dark"): string {
    if (style) {
        return path.join(__dirname, `../assets/${name}_${style}.svg`);
    }
    return path.join(__dirname, `../assets/${name}.svg`);
}

