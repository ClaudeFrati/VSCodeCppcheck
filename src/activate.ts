import * as vscode from "vscode";
import { CppcheckExtension } from "./extension";

let extension: CppcheckExtension;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    extension = new CppcheckExtension(context);
    await extension.activate();
}

export async function deactivate(): Promise<void> {
    await extension.deactivate();
}