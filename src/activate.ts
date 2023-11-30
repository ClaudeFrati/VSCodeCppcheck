import * as vscode from "vscode";
import { CppcheckExtension } from "./extension";

let extension: CppcheckExtension;

export function activate(context: vscode.ExtensionContext): void {
    extension = new CppcheckExtension(context);
    extension.activate();
}

export function deactivate(): void {
    extension.deactivate();
}